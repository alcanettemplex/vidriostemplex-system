/**
 * Motor único de los checks de taller que el sistema marca solo.
 *
 * Antes de este archivo existían dos automatismos sueltos —`chk_vidrio` desde
 * `verificarPedido` y `chk_accesorios` desde `recibirItems`— que escribían el booleano
 * con `Model.update({ where })` y se saltaban toda la maquinaria de `updateODP`:
 * ni `fecha_chk_accesorios`, ni el avance de estado, ni la auto-transición a
 * LISTO_INSTALAR, ni auditoría (los hooks de instancia no disparan en bulk), ni
 * `emitirODPPatch` —así que el tablero no se enteraba hasta un F5.
 *
 * Vive en `utils/` y no en un controlador por la misma razón que
 * `pedidoPvCapacidad.ts`: `pedido_pv.controller` importa `../server` de forma estática
 * y server → app → routes → controller cierra un ciclo. Este módulo solo importa
 * modelos de forma estática; `../server` y `./notificaciones` entran por import
 * dinámico dentro de las funciones, así que es seguro consumirlo desde cualquier
 * controlador o script.
 *
 * Reglas de negocio (confirmadas con el usuario el 2026-09-09):
 *  - HERRAJES: se calcula. Marcado ⇔ la ODP tiene al menos una SAP, ninguna SAP está
 *    vacía y **todas** las líneas de **todas** sus SAP están en `en_existencia`.
 *    Recibir una ODC ya pasa sus SAPItem a `en_existencia`, así que "todos en S" y
 *    "todos en una ODC recibida" son la misma condición.
 *  - VIDRIO: se dirige por evento, no se calcula. Marca en cuanto una vía se cierra
 *    (todos los Pedido PV verificados, o una ODC de vidrio recibida) y desmarca en
 *    cuanto cualquier vía se reabre (PV a PROBLEMA o repuesto, ODC revertida). Marcar
 *    es optimista y desmarcar es pesimista: el error siempre cae del lado seguro.
 *  - El automático manda sobre la marca manual: si el material se revierte, el check
 *    cae aunque lo hubiera puesto una persona (y se notifica).
 *  - El retroceso de estado solo ocurre desde LISTO_INSTALAR. Una ODP ya PROGRAMADA o
 *    más allá pierde el check pero conserva su estado: sacarla de una ruta ya armada
 *    por un movimiento de bodega es peor que el problema que resuelve.
 */
import { Op, Transaction } from 'sequelize';
import { ODP, ODPItem, SAP, SAPItem, TomaMedidas, PedidoPV, HistorialEstadoODP } from '../models';

/** Estados en los que el taller está trabajando la orden. */
export const ESTADOS_PRODUCTIVOS = ['MEDICION', 'ALUMINIO_CORTADO', 'VIDRIO_RECIBIDO', 'ACCESORIOS_SEPARADOS'];

/**
 * Estados en los que la ODP ya pasó VIDRIO_RECIBIDO (o está fuera del flujo normal):
 * escribirle ese estado sería un RETROCESO. Heredado de `verificarAvanceODP`, que lo
 * necesitó tras un caso real —agregar un Pedido PV a una ODP ya lista la devolvía de
 * LISTO_INSTALAR a VIDRIO_RECIBIDO al verificarlo y desaparecía de Instalaciones.
 */
const ESTADOS_POSTERIORES_A_VIDRIO = [
  'VIDRIO_RECIBIDO', 'ACCESORIOS_SEPARADOS', 'LISTO_INSTALAR',
  'PROGRAMADA', 'INSTALANDO', 'INSTALADA', 'ENTREGADA', 'PAUSADA',
];

/** Etiquetas de las etapas, para los mensajes de historial y notificación. */
const LABEL_CHECK: Record<string, string> = {
  chk_medicion: 'Medición',
  chk_corte: 'Aluminio',
  chk_vidrio: 'Vidrio',
  chk_accesorios: 'Herrajes',
  chk_ensamble: 'Ensamble',
  chk_matizado: 'Matizado',
  chk_pelicula: 'Película',
  chk_huacal: 'Huacal',
  chk_carton: 'Cartón',
};

// ─── Cálculo de herrajes ──────────────────────────────────────────────────────

/**
 * ¿Están cubiertas todas las líneas de todas las SAP de la ODP?
 *
 * Una SAP sin ítems (borrador recién creado) bloquea: todavía no se sabe qué material
 * hace falta, así que declarar los herrajes listos sería mentir. Lo mismo si una de
 * varias SAP está vacía.
 */
export const herrajesCubiertos = async (odpId: number, transaction?: Transaction): Promise<boolean> => {
  const saps = await SAP.findAll({ where: { odp_id: odpId }, attributes: ['id'], transaction });
  if (saps.length === 0) return false;

  const sapIds = saps.map((s) => s.getDataValue('id') as number);
  const items = await SAPItem.findAll({
    where: { sap_id: { [Op.in]: sapIds } },
    attributes: ['sap_id', 'estado_compra'],
    transaction,
  });
  if (items.length === 0) return false;

  // Alguna SAP sin una sola línea → bloquea.
  const sapsConItems = new Set(items.map((i) => i.getDataValue('sap_id')));
  if (sapsConItems.size !== sapIds.length) return false;

  // El "faltante" que nace de una cobertura parcial de existencia es un SAPItem más,
  // en 'pendiente': por eso una cobertura a medias no marca el check.
  return items.every((i) => i.getDataValue('estado_compra') === 'en_existencia');
};

/** Resuelve las ODP dueñas de un conjunto de SAPItem (vía SAP). Sin duplicados. */
export const odpIdsDeSapItems = async (
  sapItemIds: (number | null | undefined)[],
  transaction?: Transaction,
): Promise<number[]> => {
  const ids = sapItemIds.filter((v): v is number => typeof v === 'number' && v > 0);
  if (ids.length === 0) return [];
  const items = await SAPItem.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: ['sap_id'],
    transaction,
  });
  const sapIds = Array.from(new Set(items.map((i) => i.getDataValue('sap_id') as number).filter(Boolean)));
  if (sapIds.length === 0) return [];
  const saps = await SAP.findAll({ where: { id: { [Op.in]: sapIds } }, attributes: ['odp_id'], transaction });
  return Array.from(new Set(saps.map((s) => s.getDataValue('odp_id') as number).filter(Boolean)));
};

/**
 * Resuelve las ODP dueñas de un conjunto de ODPItem. Es la trazabilidad de las ODC de
 * vidrio, que no pasan por SAP: la cabecera lleva `sap_id = null` y el vínculo real es
 * `ODCItem.odp_item_id → ODPItem.odp_id`.
 */
export const odpIdsDeOdpItems = async (
  odpItemIds: (number | null | undefined)[],
  transaction?: Transaction,
): Promise<number[]> => {
  const ids = odpItemIds.filter((v): v is number => typeof v === 'number' && v > 0);
  if (ids.length === 0) return [];
  const items = await ODPItem.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: ['odp_id'],
    transaction,
  });
  return Array.from(new Set(items.map((i) => i.getDataValue('odp_id') as number).filter(Boolean)));
};

// ─── Evaluación de estado (extraída literal de updateODP) ─────────────────────

/**
 * Auto-transición a LISTO_INSTALAR cuando todas las etapas aplicables están hechas.
 *
 * Extraída sin cambios desde `updateODP`, con una sola diferencia: allí el caso
 * "hay un Pedido PV sin llegar" hacía `return res.json(...)` y abandonaba el handler
 * **antes** del `emitirODPPatch` final, así que marcar un check en una ODP con PV
 * pendiente no repintaba la celda en ninguna pantalla. Aquí es un `return false`
 * normal: la regla de negocio se conserva y el flujo sigue hasta la emisión.
 *
 * Devuelve true si la ODP quedó en LISTO_INSTALAR en esta llamada.
 */
export const evaluarListoInstalar = async (odp: any, transaction?: Transaction): Promise<boolean> => {
  const id = odp.getDataValue('id');
  if (!ESTADOS_PRODUCTIVOS.includes(odp.getDataValue('estado_produccion'))) return false;
  if (odp.getDataValue('sin_items')) return false;

  const [tmCount, sapCount, itemCount, pvPendienteCount] = await Promise.all([
    TomaMedidas.count({ where: { odp_id: id }, transaction }),
    SAP.count({ where: { odp_id: id }, transaction }),
    ODPItem.count({ where: { odp_id: id }, transaction }),
    PedidoPV.count({ where: { odp_id: id, estado: ['PENDIENTE', 'ENVIADO', 'CONFIRMADO_PROVEEDOR'] }, transaction }),
  ]);

  // Si el vidrio pedido al proveedor no ha llegado, la orden no puede estar lista
  // aunque el taller tenga todas las casillas marcadas.
  if (pvPendienteCount > 0) return false;

  const needsMedicion = tmCount > 0;
  const needsCorte = !!odp.getDataValue('tiene_aluminio');
  // needsVidrio se activa si hay items registrados O si hay proveedor_vidrio declarado
  // (el PV puede existir aunque los items aún no estén en odp_items)
  const needsVidrio = itemCount > 0 || !!odp.getDataValue('proveedor_vidrio');
  const needsAccesorios = sapCount > 0;
  const needsEnsamble = !!odp.getDataValue('tiene_aluminio');
  const needsMatizado = odp.getDataValue('matizado');
  const needsPelicula = odp.getDataValue('pelicula');
  const needsHuacal = odp.getDataValue('huacal');
  const needsCarton = odp.getDataValue('carton');

  const isMedicionDone = !needsMedicion || odp.getDataValue('chk_medicion');
  const isCorteDone = !needsCorte || odp.getDataValue('chk_corte');
  const isVidrioDone = !needsVidrio || odp.getDataValue('chk_vidrio');
  const isAccesoriosDone = !needsAccesorios || odp.getDataValue('chk_accesorios');
  const isEnsambleDone = !needsEnsamble || odp.getDataValue('chk_ensamble');
  const isMatizadoDone = !needsMatizado || odp.getDataValue('chk_matizado');
  const isPeliculaDone = !needsPelicula || odp.getDataValue('chk_pelicula');
  const isHuacalDone = !needsHuacal || odp.getDataValue('chk_huacal');
  const isCartonDone = !needsCarton || odp.getDataValue('chk_carton');

  // Requiere al menos un trabajo registrado — evita que ODPs vacías (sin items, sin SAP,
  // sin TM, sin aluminio) salten a LISTO_INSTALAR solo por editar un campo como el abono.
  const tieneAlgunRequisito = needsMedicion || needsCorte || needsVidrio || needsAccesorios
    || needsEnsamble || needsMatizado || needsPelicula || needsHuacal || needsCarton;

  if (tieneAlgunRequisito && isMedicionDone && isCorteDone && isVidrioDone && isAccesoriosDone
    && isEnsambleDone && isMatizadoDone && isPeliculaDone && isHuacalDone && isCartonDone) {
    await odp.update({ estado_produccion: 'LISTO_INSTALAR', fecha_listo_instalar: new Date() }, { transaction });
    console.log(`✅ ODP ${odp.getDataValue('numero_odp')} marcada automáticamente como LISTO_INSTALAR.`);
    return true;
  }
  return false;
};

/**
 * Retroceso desde LISTO_INSTALAR al desmarcar una etapa que sí aplicaba.
 *
 * Extraída literal desde `updateODP`. Solo actúa si la ODP está exactamente en
 * LISTO_INSTALAR: estados posteriores (PROGRAMADA, INSTALANDO…) no se tocan.
 *
 * Devuelve `{ estado, etiquetas }` si retrocedió, o null.
 */
export const evaluarRetroceso = async (
  odp: any,
  checksDesmarcados: string[],
  usuarioId: number | null,
  transaction?: Transaction,
  automatico = false,
): Promise<{ estado: string; etiquetas: string } | null> => {
  const id = odp.getDataValue('id');
  if (odp.getDataValue('estado_produccion') !== 'LISTO_INSTALAR') return null;
  if (checksDesmarcados.length === 0) return null;

  const [tmCnt, sapCnt, itemCnt] = await Promise.all([
    TomaMedidas.count({ where: { odp_id: id }, transaction }),
    SAP.count({ where: { odp_id: id }, transaction }),
    ODPItem.count({ where: { odp_id: id }, transaction }),
  ]);
  const tieneAl = !!odp.getDataValue('tiene_aluminio');

  // Cada etapa aplicable mapea al estado de taller al que se debe retroceder.
  const REGLAS_RETRO: Array<{ chk: string; estado: string; orden: number; aplica: boolean; label: string }> = [
    { chk: 'chk_medicion',   estado: 'MEDICION',             orden: 1, aplica: tmCnt > 0,                                              label: 'Medición' },
    { chk: 'chk_vidrio',     estado: 'MEDICION',             orden: 1, aplica: itemCnt > 0 || !!odp.getDataValue('proveedor_vidrio'),  label: 'Vidrio' },
    { chk: 'chk_corte',      estado: 'ALUMINIO_CORTADO',     orden: 2, aplica: tieneAl,                                                label: 'Aluminio' },
    { chk: 'chk_accesorios', estado: 'VIDRIO_RECIBIDO',      orden: 3, aplica: sapCnt > 0,                                             label: 'Herrajes' },
    { chk: 'chk_ensamble',   estado: 'ACCESORIOS_SEPARADOS', orden: 4, aplica: tieneAl,                                                label: 'Ensamble' },
    { chk: 'chk_matizado',   estado: 'ACCESORIOS_SEPARADOS', orden: 4, aplica: !!odp.getDataValue('matizado'),                         label: 'Matizado' },
    { chk: 'chk_pelicula',   estado: 'ACCESORIOS_SEPARADOS', orden: 4, aplica: !!odp.getDataValue('pelicula'),                         label: 'Película' },
    { chk: 'chk_huacal',     estado: 'ACCESORIOS_SEPARADOS', orden: 4, aplica: !!odp.getDataValue('huacal'),                           label: 'Huacal' },
    { chk: 'chk_carton',     estado: 'ACCESORIOS_SEPARADOS', orden: 4, aplica: !!odp.getDataValue('carton'),                           label: 'Cartón' },
  ];

  const faltantes = REGLAS_RETRO.filter((r) => r.aplica && !odp.getDataValue(r.chk));
  if (faltantes.length === 0) return null;

  const destino = faltantes.reduce((a, b) => (b.orden < a.orden ? b : a));
  const etiquetas = faltantes.map((f) => f.label).join(', ');

  await odp.update({ estado_produccion: destino.estado, fecha_listo_instalar: null }, { transaction });
  await HistorialEstadoODP.create({
    odp_id: Number(id),
    estado_anterior: 'LISTO_INSTALAR',
    estado_nuevo: destino.estado,
    usuario_id: usuarioId,
    fecha: new Date(),
    automatico,
    observacion: automatico
      ? `Retroceso automático desde Listo para Instalar: ${etiquetas} dejó de estar cubierto.`
      : `Retroceso desde Listo para Instalar: se desmarcó ${etiquetas} en Control Taller.`,
  }, { transaction });

  console.log(`↩️  ODP ${odp.getDataValue('numero_odp')} retrocedió de LISTO_INSTALAR a ${destino.estado} (${etiquetas}).`);
  return { estado: destino.estado, etiquetas };
};

// ─── Motor ────────────────────────────────────────────────────────────────────

export type OrigenCheck = 'SAP' | 'ODC_VIDRIO' | 'PV' | 'SCRIPT';

export interface RecalculoOpciones {
  /** Quién disparó la acción. `historial_estados_odp.usuario_id` es NOT NULL. */
  usuarioId: number | null;
  origen: OrigenCheck;
  /** Texto corto para el historial: 'ODC-1234 recibida', 'PV 7012 verificado'. */
  detalle?: string;
  transaction?: Transaction;
  /** Recalcular `chk_accesorios` desde el estado de las SAP de la ODP. */
  herrajes?: boolean;
  /** Fijar `chk_vidrio` por evento: true = una vía se cerró, false = una vía se reabrió. */
  vidrio?: boolean;
}

export interface ResultadoRecalculo {
  odpId: number;
  numeroOdp: string;
  cambios: Record<string, boolean>;
  estadoAnterior: string;
  estadoNuevo: string;
}

/**
 * Punto de entrada único. Recalcula los checks automáticos de una ODP, aplica el
 * avance o retroceso de estado que corresponda, deja rastro en historial, notifica
 * y emite el patch de socket.
 *
 * Si nada cambia se detiene sin escribir, sin auditar y sin emitir: se llama desde
 * ~19 puntos de Compras y Pedidos PV y no puede generar ruido en cada guardado.
 *
 * Cuando recibe una transacción, la emisión del socket y la notificación se aplazan
 * con `transaction.afterCommit`: emitir antes del commit haría que el frontend leyera
 * la fila vieja.
 */
export const recalcularChecksODP = async (
  odpId: number,
  opts: RecalculoOpciones,
): Promise<ResultadoRecalculo | null> => {
  const { transaction, usuarioId, origen, detalle } = opts;

  const odp = await ODP.findByPk(odpId, { transaction });
  if (!odp) return null;

  // Una ODP anulada está congelada: `updateODP` rechaza cualquier edición sobre ella
  // y el automatismo no puede ser la puerta de atrás.
  const estadoAnterior = odp.getDataValue('estado_produccion');
  if (estadoAnterior === 'ANULADA') return null;

  // ─── Qué debería valer cada check ───
  const cambios: Record<string, boolean> = {};

  if (opts.herrajes) {
    const debe = await herrajesCubiertos(odpId, transaction);
    if (debe !== !!odp.getDataValue('chk_accesorios')) cambios.chk_accesorios = debe;
  }
  if (opts.vidrio !== undefined) {
    if (opts.vidrio !== !!odp.getDataValue('chk_vidrio')) cambios.chk_vidrio = opts.vidrio;
  }

  if (Object.keys(cambios).length === 0) return null;

  // ─── Escritura ───
  const aEscribir: Record<string, unknown> = { ...cambios };
  // Paridad con updateODP: la fecha se sella la primera vez que se activa el check.
  if (cambios.chk_accesorios === true && !odp.getDataValue('fecha_chk_accesorios')) {
    aEscribir.fecha_chk_accesorios = new Date().toISOString().split('T')[0];
  }
  // update de instancia (no bulk) para que los hooks de auditoría disparen.
  await odp.update(aEscribir, { transaction });

  // ─── Avance de estado por check ───
  // chk_accesorios → ACCESORIOS_SEPARADOS: misma regla y misma guarda que updateODP.
  if (cambios.chk_accesorios === true && ESTADOS_PRODUCTIVOS.includes(estadoAnterior)) {
    await odp.update({ estado_produccion: 'ACCESORIOS_SEPARADOS' }, { transaction });
  }
  // chk_vidrio → VIDRIO_RECIBIDO: heredado de `verificarAvanceODP`. La guarda no es
  // ESTADOS_PRODUCTIVOS sino su complemento: desde ACCESORIOS_SEPARADOS escribir
  // VIDRIO_RECIBIDO sería mandar la orden hacia atrás.
  if (cambios.chk_vidrio === true && !ESTADOS_POSTERIORES_A_VIDRIO.includes(estadoAnterior)) {
    await odp.update({ estado_produccion: 'VIDRIO_RECIBIDO' }, { transaction });
  }

  // ─── Avance a LISTO_INSTALAR o retroceso ───
  const desmarcados = Object.entries(cambios).filter(([, v]) => v === false).map(([k]) => k);
  const marcados = Object.entries(cambios).filter(([, v]) => v === true).map(([k]) => k);

  let retroceso: { estado: string; etiquetas: string } | null = null;
  let quedoListo = false;
  if (desmarcados.length > 0) {
    retroceso = await evaluarRetroceso(odp, desmarcados, usuarioId, transaction, true);
  }
  if (marcados.length > 0 && !retroceso) {
    quedoListo = await evaluarListoInstalar(odp, transaction);
  }

  const estadoNuevo = odp.getDataValue('estado_produccion');

  // ─── Historial de los avances automáticos ───
  // El retroceso ya escribió el suyo dentro de evaluarRetroceso.
  if (!retroceso && estadoNuevo !== estadoAnterior) {
    await HistorialEstadoODP.create({
      odp_id: odpId,
      estado_anterior: estadoAnterior,
      estado_nuevo: estadoNuevo,
      usuario_id: usuarioId,
      fecha: new Date(),
      automatico: true,
      observacion: `Avance automático — ${describirCambios(cambios)}${detalle ? ` (${detalle})` : ''}.`,
    }, { transaction });
  }

  const resultado: ResultadoRecalculo = {
    odpId,
    numeroOdp: odp.getDataValue('numero_odp'),
    cambios,
    estadoAnterior,
    estadoNuevo,
  };

  // ─── Notificación + socket, siempre después del commit ───
  const publicar = () => publicarRecalculo(odp, resultado, { origen, detalle, retroceso, quedoListo });
  if (transaction) transaction.afterCommit(() => { publicar(); });
  else publicar();

  return resultado;
};

/** "Herrajes marcado, Vidrio desmarcado" */
const describirCambios = (cambios: Record<string, boolean>): string =>
  Object.entries(cambios)
    .map(([k, v]) => `${LABEL_CHECK[k] || k} ${v ? 'marcado' : 'desmarcado'}`)
    .join(', ');

/** Notificación dirigida + patch de socket. Nunca interrumpe el flujo si falla. */
const publicarRecalculo = (
  odp: any,
  resultado: ResultadoRecalculo,
  ctx: {
    origen: OrigenCheck;
    detalle?: string;
    retroceso: { estado: string; etiquetas: string } | null;
    quedoListo: boolean;
  },
) => {
  const { odpId, numeroOdp, cambios } = resultado;

  let mensaje = `${describirCambios(cambios)} automáticamente${ctx.detalle ? ` — ${ctx.detalle}` : ''}.`;
  if (ctx.quedoListo) mensaje += ' La orden quedó LISTA PARA INSTALAR.';
  if (ctx.retroceso) mensaje += ` La orden volvió a producción (${ctx.retroceso.estado.replace(/_/g, ' ').toLowerCase()}).`;

  import('../server')
    .then(({ emitirNotificacion }) => {
      emitirNotificacion(
        { userId: odp.getDataValue('asesor_id'), roles: ['jefe_produccion', 'produccion', 'compras', 'gerencia'] },
        {
          titulo: `ODP ${numeroOdp}`,
          mensaje,
          odp_id: odpId,
          numero_odp: numeroOdp,
          tipo: ctx.retroceso ? 'CHECK_AUTO_REVERTIDO' : 'CHECK_AUTO',
        },
      );
    })
    .catch((err) => console.error('[checksAutomaticos] notificación:', err));

  // Sin esto el check queda bien en BD y el tablero no lo pinta hasta un F5 — que es
  // exactamente lo que hacían los dos automatismos anteriores.
  import('./notificaciones')
    .then(({ emitirODPPatch }) => emitirODPPatch(odpId, 'update'))
    .catch((err) => console.error('[checksAutomaticos] odp_patch:', err));

  console.log(`🔁 ODP ${numeroOdp}: ${describirCambios(cambios)} [origen ${ctx.origen}${ctx.detalle ? ` · ${ctx.detalle}` : ''}]`);
};

/**
 * Azúcar para los puntos de Compras que afectan a varias ODP de una sola acción
 * (una ODC de perfilería agrupa material de varias órdenes). Recalcula herrajes en
 * todas — el automatismo anterior resolvía **una sola** ODP tomando el primer SAPItem
 * de la ODC, así que marcaba la de esa línea y dejaba las demás sin marcar.
 */
export const recalcularHerrajesDeSapItems = async (
  sapItemIds: (number | null | undefined)[],
  opts: Omit<RecalculoOpciones, 'herrajes' | 'vidrio'>,
): Promise<void> => {
  const odpIds = await odpIdsDeSapItems(sapItemIds, opts.transaction);
  for (const odpId of odpIds) {
    await recalcularChecksODP(odpId, { ...opts, herrajes: true });
  }
};

/**
 * Equivalente para las ODC de vidrio: fija `chk_vidrio` en todas las ODP que tienen
 * ítems en la orden. `cerrada = true` al recibirla, `false` al revertirla o eliminarla.
 */
export const recalcularVidrioDeOdpItems = async (
  odpItemIds: (number | null | undefined)[],
  cerrada: boolean,
  opts: Omit<RecalculoOpciones, 'herrajes' | 'vidrio'>,
): Promise<void> => {
  const odpIds = await odpIdsDeOdpItems(odpItemIds, opts.transaction);
  for (const odpId of odpIds) {
    await recalcularChecksODP(odpId, { ...opts, vidrio: cerrada });
  }
};
