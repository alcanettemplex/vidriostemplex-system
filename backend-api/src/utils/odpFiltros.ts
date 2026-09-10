import { Op, fn, col, literal } from 'sequelize';
import { ODP, Cliente, Usuario, FacturaAdicionalODP, Lead, ConfiguracionGlobal } from '../models';
import { whereTieneFacturaEnRango } from './facturacion';
import { construirFiltroFecha } from './rangoFechas';

/**
 * Motor único de filtrado de ODPs para consultas transversales.
 *
 * Nació dentro de `crm.controller.ts` alimentando el Buscador Avanzado de
 * `/supervision-crm` (exclusivo del rol root). Al abrirse la pestaña "Consultar" del
 * módulo ODP (2026-09-10) hacían falta los mismos filtros en otro controlador, y
 * copiarlos habría dejado dos definiciones de "cartera vencida" y de "facturado en el
 * rango" divergiendo en silencio: el día que se ajuste el criterio, se corrige una y se
 * olvida la otra.
 *
 * Vive en `utils/` y no en un controlador por la misma razón que `pedidoPvCapacidad.ts`
 * y `checksAutomaticos.ts`: `server → app → routes → controller` cierra un ciclo, así que
 * un controlador no puede importar a otro sin dejar los handlers en `undefined`. Este
 * módulo solo importa modelos y otros utils, por lo que es seguro consumirlo desde
 * cualquier controlador o script.
 *
 * COMPATIBILIDAD: los parámetros que ya usaba el Buscador Avanzado se conservan con su
 * semántica exacta. Los añadidos para el explorador (`estados_produccion`,
 * `tipo_registro`, `solo_con_saldo`, `excluir_estado_caja`, `facturada_antes_de`) son
 * opcionales y no alteran el resultado cuando no se envían.
 */

// Campos de fecha por los que se puede acotar. `fecha_listo_instalar` se agregó para el
// explorador: responde "¿cuánto lleva esto liberado y sin salir a instalar?", que no se
// puede preguntar con la fecha de creación ni con la de entrega.
export const CAMPOS_FECHA_ODP: Record<string, string> = {
  fecha_factura: 'fecha_factura',
  fecha_creacion: 'fecha_creacion',
  fecha_entrega: 'fecha_entrega',
  fecha_listo_instalar: 'fecha_listo_instalar',
};

// Campos por los que se permite ordenar. Whitelist estricta: `orden_campo` llega del
// cliente y termina dentro de un ORDER BY.
export const CAMPOS_ORDEN_ODP = [
  'numero_odp', 'fecha_creacion', 'fecha_entrega', 'fecha_factura',
  'fecha_listo_instalar', 'valor_total', 'abono', 'pendiente', 'estado_produccion',
] as const;

/**
 * Lee un parámetro booleano de query string de forma tri-estado.
 *
 * El código original hacía `if (acarreo !== undefined) where.acarreo = acarreo === 'true'`,
 * que ante un `acarreo=''` (string vacío, lo que manda un `<select>` sin elegir) filtraba
 * por `false` en lugar de no filtrar. Hoy no explota porque el único cliente manda
 * `undefined`, pero es una trampa para el siguiente consumidor.
 */
const leerBooleano = (valor: any): boolean | undefined => {
  if (valor === true || valor === 'true') return true;
  if (valor === false || valor === 'false') return false;
  return undefined;
};

const leerArray = (valor: any): string[] | undefined => {
  if (valor === undefined || valor === null || valor === '') return undefined;
  const arr = (Array.isArray(valor) ? valor : [valor]).filter(v => v !== '' && v !== null && v !== undefined);
  return arr.length > 0 ? arr.map(String) : undefined;
};

/** Días de cartera vencida configurados. La BD manda: nunca hardcodear este número. */
export const obtenerDiasCarteraVencida = async (): Promise<number> => {
  const config = await ConfiguracionGlobal.findOne({ where: { id: 1 } });
  // El `|| 60` es un respaldo por si la fila id=1 no existiera, no un valor de negocio.
  return Number((config as any)?.dias_alerta_cartera_vencida) || 60;
};

export const fechaUmbralCartera = (dias: number): Date =>
  new Date(Date.now() - dias * 24 * 3600 * 1000);

/**
 * Traduce `tipo_registro` (un único selector en la UI) a los tres flags que la tabla
 * `odp` usa para distinguir naturalezas de registro. Antes estaban dispersos en tres
 * parámetros independientes (`tipo_odp`, `es_no_conformidad`, `incluir_garantias`), lo
 * que permitía pedir combinaciones imposibles como "OA + garantía".
 */
const aplicarTipoRegistro = (where: any, tipo: string) => {
  switch (tipo) {
    case 'ODP':
      where.es_garantia = false;
      where.es_no_conformidad = false;
      where.tipo_odp = 'ODP';
      break;
    case 'OA':
      where.es_garantia = false;
      where.es_no_conformidad = false;
      where.tipo_odp = 'OA';
      break;
    case 'NC':
      where.es_garantia = false;
      where.es_no_conformidad = true;
      break;
    case 'GARANTIA':
      where.es_garantia = true;
      break;
    case 'TODOS':
      // Se levanta el `es_garantia = false` que aplica por defecto.
      delete where.es_garantia;
      break;
    default:
      break;
  }
};

/**
 * Construye el `where` de Sequelize a partir de los filtros de la query.
 *
 * Es `async` porque el atajo de cartera vencida necesita leer el umbral de días de
 * `configuracion_global`.
 */
export async function construirWhereODP(query: Record<string, any>) {
  const {
    fecha_desde, fecha_hasta, campo_fecha, asesor_id, estado_facturacion,
    acarreo, instalacion, tipo_odp, search, estado_produccion, estados_produccion,
    monto_min, monto_max, incluir_garantias, es_no_conformidad, cartera_vencida,
    tipo_registro, solo_con_saldo,
  } = query;

  // Reasignables: el atajo de cartera vencida los reescribe antes de aplicarlos.
  let { estado_caja, forma_pago, excluir_estado_caja, facturada_antes_de } = query;

  const where: any = {};

  // Las garantías se excluyen por defecto (comportamiento histórico del buscador);
  // `incluir_garantias=true` o `tipo_registro` lo levantan.
  if (incluir_garantias !== 'true') where.es_garantia = false;

  // ─── Cartera vencida ───────────────────────────────────────────────────────
  // No es un filtro propio: es un ATAJO que se reescribe en los cuatro filtros
  // atómicos que lo definen. Así el explorador puede pre-llenar esos mismos cuatro
  // campos en pantalla y obtener exactamente el mismo conjunto — la equivalencia es
  // por construcción, no por dos implementaciones que hay que recordar sincronizar.
  //
  // Definición (idéntica a getResumenGerencial del dashboard): créditos con FE emitida
  // hace más de N días, que aún deben plata y no están cancelados en caja.
  //
  // OJO: pisa `forma_pago` y `estado_caja` si el llamador los envió. Es el
  // comportamiento histórico y /supervision-crm depende de él; el explorador no manda
  // este parámetro justamente para no heredar esa sorpresa.
  if (cartera_vencida === 'true') {
    const dias = await obtenerDiasCarteraVencida();
    forma_pago = 'credito';
    excluir_estado_caja = 'CANCELADO';
    estado_caja = undefined;
    facturada_antes_de = fechaUmbralCartera(dias).toISOString();
    where.pendiente = { [Op.gt]: 0 };
  }

  // ─── Rango de fechas ───────────────────────────────────────────────────────
  const campoFecha = CAMPOS_FECHA_ODP[campo_fecha as string] || 'fecha_factura';
  const rangoFecha = construirFiltroFecha(fecha_desde, fecha_hasta);
  if (rangoFecha) {
    if (campoFecha === 'fecha_factura') {
      // Por PRESENCIA de FE (principal o adicional) en el rango, consistente con el KPI
      // Pedidos Facturados y el Informe Ejecutivo: una ODP facturada en dos FE cuenta en
      // el mes de cualquiera de las dos.
      const [start, end] = (rangoFecha as any)[Op.between];
      where[Op.and] = [...(where[Op.and] || []), whereTieneFacturaEnRango(start, end)];
    } else {
      where[campoFecha] = rangoFecha;
    }
  }

  // ─── Estado de producción ──────────────────────────────────────────────────
  // `estados_produccion` (multi) tiene prioridad sobre `estado_produccion` (singular,
  // que conserva /supervision-crm). Es lo que permite preguntar "terminadas y sin
  // facturar" en una sola consulta.
  const estadosMulti = leerArray(estados_produccion);
  if (estadosMulti) {
    where.estado_produccion = { [Op.in]: estadosMulti };
  } else if (estado_produccion) {
    where.estado_produccion = estado_produccion;
  }

  if (asesor_id) where.asesor_id = parseInt(asesor_id as string, 10);
  if (estado_facturacion) where.estado_facturacion = estado_facturacion;
  if (estado_caja) where.estado_caja = estado_caja;
  if (excluir_estado_caja) where.estado_caja = { [Op.ne]: excluir_estado_caja };
  if (tipo_odp) where.tipo_odp = tipo_odp;
  if (forma_pago) where.forma_pago = forma_pago;

  const acarreoBool = leerBooleano(acarreo);
  if (acarreoBool !== undefined) where.acarreo = acarreoBool;
  const instalacionBool = leerBooleano(instalacion);
  if (instalacionBool !== undefined) where.instalacion = instalacionBool;
  const ncBool = leerBooleano(es_no_conformidad);
  if (ncBool !== undefined) where.es_no_conformidad = ncBool;

  // `tipo_registro` va después de los flags sueltos: es el selector unificado y manda.
  if (tipo_registro) aplicarTipoRegistro(where, String(tipo_registro));

  if (leerBooleano(solo_con_saldo)) where.pendiente = { [Op.gt]: 0 };

  // FE emitida antes de una fecha dada — columna directa, no la subconsulta de
  // adicionales: para cartera importa cuándo se emitió la factura principal.
  if (facturada_antes_de) {
    where.factura_electronica = { [Op.ne]: null };
    where.fecha_factura = { [Op.lt]: new Date(facturada_antes_de as string) };
  }

  if (monto_min || monto_max) {
    where.valor_total = {
      ...(monto_min ? { [Op.gte]: parseFloat(monto_min as string) } : {}),
      ...(monto_max ? { [Op.lte]: parseFloat(monto_max as string) } : {}),
    };
  }

  if (search) {
    const like = { [Op.iLike]: `%${search}%` };
    where[Op.or] = [{ numero_odp: like }, { '$cliente.nombre_razon_social$': like }];
  }

  return where;
}

export const includeBuscadorODP = [
  { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social', 'fuente'] },
  { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
  { model: FacturaAdicionalODP, as: 'facturas_adicionales', attributes: ['numero_fe', 'fecha_factura'], separate: true },
  // Sin `limit` aquí: en un include hasMany con separate:true, `limit` topa el total
  // de filas devueltas entre TODOS los padres de la página, no por-padre — se toma
  // el primer resultado ya en la capa de mapeo (mapearFilaBuscadorODP).
  { model: Lead, as: 'leads_origen', attributes: ['fuente_lead'], separate: true },
];

export function mapearFilaBuscadorODP(odp: any) {
  const data = odp.toJSON ? odp.toJSON() : odp;
  const leadOrigen = (data.leads_origen || [])[0];
  const fuente = leadOrigen?.fuente_lead || data.cliente?.fuente || null;
  return {
    id: data.id,
    numero_odp: data.numero_odp,
    cliente_nombre: data.cliente?.nombre_razon_social || null,
    fuente,
    asesor_nombre: data.asesor?.nombre_completo || null,
    estado_produccion: data.estado_produccion,
    estado_facturacion: data.estado_facturacion,
    estado_caja: data.estado_caja,
    tipo_odp: data.tipo_odp,
    forma_pago: data.forma_pago,
    es_no_conformidad: data.es_no_conformidad,
    es_garantia: data.es_garantia,
    valor_total: parseFloat(data.valor_total || '0'),
    abono: parseFloat(data.abono || '0'),
    pendiente: parseFloat(data.pendiente || '0'),
    factura_electronica: data.factura_electronica,
    fecha_factura: data.fecha_factura,
    facturas_adicionales: (data.facturas_adicionales || []).map((f: any) => ({ numero_fe: f.numero_fe, fecha_factura: f.fecha_factura })),
    acarreo: data.acarreo,
    instalacion: data.instalacion,
    fecha_entrega: data.fecha_entrega,
    fecha_creacion: data.fecha_creacion,
    fecha_listo_instalar: data.fecha_listo_instalar,
  };
}

/**
 * Totales del conjunto filtrado COMPLETO, no de la página visible.
 *
 * Una barra de totales que sumara solo las 50 filas en pantalla mentiría: la pregunta
 * real ("¿cuánta plata está detenida sin facturar?") es sobre todo el resultado.
 *
 * Dos detalles no negociables:
 *  - Se incluye `Cliente` con `attributes: []` aunque no se lea ninguna columna suya:
 *    el filtro de búsqueda referencia `$cliente.nombre_razon_social$` y sin el include
 *    ese `where` no resuelve.
 *  - NO se incluyen las asociaciones `separate: true`. Además de inútiles para un
 *    agregado, `whereTieneFacturaEnRango` emite SQL literal que referencia el alias
 *    `"ODP"`; cambiar la forma del FROM rompería esa condición.
 *
 * `COUNT(DISTINCT id)` y no `COUNT(*)` por el LEFT JOIN con clientes; los `SUM` no
 * pueden duplicar porque `belongsTo` aporta como máximo una fila por ODP.
 */
export async function calcularTotalesODP(where: any) {
  const [fila]: any = await ODP.findAll({
    where,
    include: [{ model: Cliente, as: 'cliente', attributes: [] }],
    attributes: [
      [fn('COUNT', literal('DISTINCT "ODP"."id"')), 'count'],
      [fn('COALESCE', fn('SUM', col('ODP.valor_total')), 0), 'valor_total'],
      [fn('COALESCE', fn('SUM', col('ODP.abono')), 0), 'abono'],
      [fn('COALESCE', fn('SUM', col('ODP.pendiente')), 0), 'pendiente'],
    ],
    raw: true,
  });

  // PG devuelve NUMERIC como string en modo raw.
  return {
    count: Number(fila?.count || 0),
    valor_total: Number(fila?.valor_total || 0),
    abono: Number(fila?.abono || 0),
    pendiente: Number(fila?.pendiente || 0),
  };
}
