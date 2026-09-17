// Motor de sincronización automática: cuando el módulo Proveedores actualiza
// el precio vigente de un producto (`actualizarPrecio()` en
// proveedor.controller.ts), este archivo recalcula el costo/precio de venta
// de los productos del Cotizador vinculados a ese mismo producto del catálogo
// maestro (`cotizador.producto.catalogo_producto_id`).
//
// Nombre deliberadamente distinto de `cotizador/lib/precios/proveedorSequelize.ts`
// (que pese a su nombre es el adaptador de LECTURA interno del propio
// Cotizador, sin relación con el módulo Proveedores real) para no arrastrar
// esa ambigüedad — ver plan de integración de la sesión 2026-09-14.
//
// Decisión de arquitectura: escribe en `cotizador.producto` (la tabla BASE),
// nunca en `CotizadorPrecioOverride`. El comentario del propio modelo de
// override dice que esa capa "gana siempre" porque es edición humana
// deliberada — si el sync escribiera ahí, competiría por la misma fila que un
// humano edita desde la pantalla de precios sin ninguna precedencia clara. Un
// override activo sigue ganando en la caché tal cual funciona hoy; el sync
// sólo mueve el costo de mercado por defecto.
//
// Requiere la caché del Cotizador precargada (getProducto la exige): dentro
// del proceso del backend ya lo está desde el boot (server.ts); un script
// one-off que importe este módulo aparte debe llamar a
// `cotizador/cache.ts` → `precargar()` primero (ver
// 2026-09-14_cotizador_recosteo_retroactivo_proveedor.ts).
//
// ─── Forma del motor: batch por defecto, por-id como envoltorio ─────────────
// Nació para la cola de sincronización, que lo invoca con un puñado de ids
// tras cargar una factura, y estaba escrito en singular: un `findAll` de
// productos + un `findAll` de candidatos POR CADA id, más un `findByPk` del
// multiplicador DENTRO del bucle de productos (siempre la misma fila). Cuando
// la pantalla de Configuración empezó a barrer una categoría entera
// (`POST /multiplicadores/:categoria/recalcular`) eso se volvió N+1 contra el
// pooler de Supabase: ~896 viajes para PERFILERIA a ~160 ms cada uno, 96,7 s
// medidos — pegado al corte de 100 s de Cloudflare, que además cae DESPUÉS de
// que el backend ya escribió. Ver TECH_DEBT.md 2026-09-16 (2).
//
// Hoy el motor es `recalcularCostosDesdeProveedor(ids[])`: 3 lecturas fijas
// (productos, candidatos de proveedor, multiplicadores) sin importar cuántos
// ids entren, y UNA escritura agrupada. `recalcularCostoDesdeProveedor(id)`
// queda como envoltorio delgado para no cambiarle el contrato a la cola ni al
// script one-off que ya lo consumen.
//
// ─── Dos formas de fijar el precio de venta, no una ─────────────────────────
// 1. `recalcularCostosDesdeProveedor` — el costo VIENE del proveedor. Sólo
//    puede actuar sobre productos vinculados al maestro y con proveedor que
//    siga precios: hoy, 125 de 530.
// 2. `realinearPreciosAlMultiplicador` — el costo SE CONSERVA y sólo se
//    realinea PA/PM/PB al multiplicador de la categoría. Es la vía para los
//    productos que tienen costo cargado pero ningún proveedor del que
//    derivarlo (116 de PERFILERIA estaban en un multiplicador viejo de
//    1,514500 sin forma de salir de ahí). Decisión del usuario 2026-09-17:
//    todo producto de una categoría debe regirse por el multiplicador de esa
//    categoría, tenga proveedor o no.
import { Op, Transaction } from 'sequelize';
import { sequelize, CotizadorProducto, CotizadorPrecioHistorial, CotizadorMultiplicadorCategoria, ProveedorProducto, Proveedor } from '../../models';
import { siguePrecios } from '../../utils/proveedorReglas';
import { getProducto, recargarPrecios } from './catalogo';
import { round2 } from './motorCalculo';

interface CambioProducto {
  codigo: string;
  categoria: string;
  antes: { costo_unitario: number; precio_pa: number; precio_pm: number; precio_pb: number };
  despues: { costo_unitario: number; precio_pa: number; precio_pm: number; precio_pb: number };
}

interface Omitido {
  codigo: string;
  motivo: string;
}

export interface ResultadoRecalculo {
  catalogoProductoId: number;
  proveedorElegido: { id: number; nombre: string; precio: number; unidadCompra: string } | null;
  cambios: CambioProducto[];
  omitidos: Omitido[];
}

export interface ResultadoRealineacion {
  categoria: string;
  cambios: CambioProducto[];
  omitidos: Omitido[];
}

/** Escritura pendiente, acumulada en memoria y aplicada toda junta al final. */
interface Escritura {
  codigo: string;
  antes: CambioProducto['antes'];
  despues: CambioProducto['despues'];
  motivo: string;
}

/** Candidato de proveedor ya normalizado a costo por unidad de venta. */
interface Candidato {
  proveedorProductoId: number;
  proveedorId: number;
  proveedorNombre: string;
  unidadCompra: string;
  precio: number;
  /** Costo por la unidad en que vende el Cotizador: la tira se divide entre su largo. */
  costoNormalizado: number;
}

// Tope de ids por sentencia `IN`. PERFILERIA, la categoría más grande, trae
// 296 ids distintos, así que hoy nunca se parte; existe para que un catálogo
// que crezca no arme un `IN` de miles de elementos.
const IDS_POR_CONSULTA = 400;

// Modalidad de compra preferida por categoría (decisión del usuario 2026-09-17).
//
// El módulo Proveedores permite cargar el mismo perfil por metro y por perfil
// (tira de 6 m) — son dos filas legítimas, distinguidas por el UNIQUE
// (proveedor_id, catalogo_producto_id, unidad_compra). Para PERFILERIA el
// costo debe salir SIEMPRE del precio por perfil: comprar la tira completa
// sale ~30 % más barato por metro que comprar metros sueltos, y así se compra
// en la práctica. Medido el 2026-09-17 en los 4 productos que tienen las dos
// modalidades cargadas: el precio por metro está 30,3 / 30,5 / 30,8 / 30,3 %
// por encima de tira÷6, con una regularidad que no es casualidad.
//
// Esto NO era una preferencia estética: el motor ordenaba los candidatos por
// el `precio_actual` crudo, y $15.546 (un metro) es menor que $71.596 (una
// tira), así que elegía la modalidad CARA en los 4 casos. Comparar precios de
// modalidades distintas por su número crudo es comparar cosas distintas; hoy
// se compara `costoNormalizado`.
//
// Si un producto no tiene ninguna fila en la modalidad preferida, se cae a las
// demás en vez de quedarse sin costo: 14 perfiles reales (5020 CABEZAL 144,
// 744 SILLAR 387, 3831 JAMBA 174…) sólo tienen precio por metro, y dejarlos
// sin fuente de costo sería perder dato real. Ver SESSION_LOG 2026-09-17 (3).
const MODALIDAD_PREFERIDA: Record<string, string[]> = {
  PERFILERIA: ['TIRA_6M'],
};

function trozos<T>(xs: T[], tamano: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += tamano) out.push(xs.slice(i, i + tamano));
  return out;
}

/**
 * Elige el candidato de una lista para una categoría dada: primero filtra por
 * la modalidad preferida (si esa categoría tiene una y hay filas en ella), y
 * entre las que quedan toma la de MENOR COSTO NORMALIZADO — nunca el menor
 * precio crudo.
 */
function elegirCandidato(lista: Candidato[], categoria: string): Candidato | null {
  if (lista.length === 0) return null;
  const preferidas = MODALIDAD_PREFERIDA[categoria];
  const enPreferida = preferidas ? lista.filter((c) => preferidas.includes(c.unidadCompra)) : [];
  const pool = enPreferida.length > 0 ? enPreferida : lista;
  return pool.reduce((mejor, c) => (c.costoNormalizado < mejor.costoNormalizado ? c : mejor), pool[0]);
}

/** Lee los multiplicadores vigentes: una fila por categoría, constantes durante la corrida. */
async function cargarMultiplicadores(): Promise<Map<string, { pa: number; pm: number; pb: number }>> {
  const mapa = new Map<string, { pa: number; pm: number; pb: number }>();
  for (const m of await CotizadorMultiplicadorCategoria.findAll()) {
    mapa.set(m.get('categoria') as string, {
      pa: m.get('multiplicador_pa') as number,
      pm: m.get('multiplicador_pm') as number,
      pb: m.get('multiplicador_pb') as number,
    });
  }
  return mapa;
}

// Tolerancia de la comparación "¿cambió algo?", en pesos.
//
// No es un detalle de estilo. Buena parte de los precios viejos se guardaron
// con la precisión completa del float (`9691.42502713599`) mientras el motor
// produce valores ya pasados por `round2`. Con comparación exacta, 482
// productos "cambiaban" cuando los cambios reales eran 120: se habrían escrito
// 362 líneas de histórico sin un solo movimiento de precio — el mismo ruido que
// se evitó al sembrar los multiplicadores con 6 decimales en vez de 3.
//
// El umbral no es arbitrario: la distribución medida el 2026-09-17 es bimodal y
// sin zona gris. De los 584 productos con costo > 0, **34 difieren entre un
// centavo y un peso** (VIDRIO 23, ACCESORIO 6, ACABADO 3, PERFILERIA 2, todos
// ruido de redondeo) y **ninguno difiere entre 1 y 100 pesos** — la consulta
// salió vacía. Toda desalineación real está por encima de los 100 pesos. Así
// que 1 peso separa las dos poblaciones con dos órdenes de magnitud de margen,
// y además el peso colombiano no se factura en centavos: por debajo de esto no
// hay nada que registrar.
const EPSILON_PESOS = 1;

function igualEnPesos(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON_PESOS;
}

function sinCambio(a: CambioProducto['antes'], b: CambioProducto['despues']): boolean {
  return (
    igualEnPesos(a.costo_unitario, b.costo_unitario) &&
    igualEnPesos(a.precio_pa, b.precio_pa) &&
    igualEnPesos(a.precio_pm, b.precio_pm) &&
    igualEnPesos(a.precio_pb, b.precio_pb)
  );
}

/**
 * Aplica todas las escrituras en UNA transacción con dos sentencias. Sequelize
 * no sabe actualizar N filas con N valores distintos en una sola sentencia;
 * `unnest` de 5 arrays paralelos sí, y evita los ~2N viajes que costaba un
 * `producto.update()` por fila.
 */
async function aplicarEscrituras(escrituras: Escritura[], por: string): Promise<void> {
  if (escrituras.length === 0) return;
  const t: Transaction = await sequelize.transaction();
  try {
    await sequelize.query(
      `UPDATE cotizador.producto AS p
          SET costo_unitario = v.costo, precio_pa = v.pa, precio_pm = v.pm, precio_pb = v.pb
         FROM unnest($1::varchar[], $2::double precision[], $3::double precision[], $4::double precision[], $5::double precision[])
              AS v(codigo, costo, pa, pm, pb)
        WHERE p.codigo = v.codigo`,
      {
        bind: [
          escrituras.map((e) => e.codigo),
          escrituras.map((e) => e.despues.costo_unitario),
          escrituras.map((e) => e.despues.precio_pa),
          escrituras.map((e) => e.despues.precio_pm),
          escrituras.map((e) => e.despues.precio_pb),
        ],
        transaction: t,
      }
    );

    const ahora = new Date();
    await CotizadorPrecioHistorial.bulkCreate(
      escrituras.map((e) => ({
        fecha: ahora,
        accion: 'editar-precio',
        codigo: e.codigo,
        antes: e.antes,
        despues: e.despues,
        por,
        motivo: e.motivo,
      })),
      { transaction: t }
    );

    await t.commit();
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

/**
 * Recalcula costo_unitario/precio_pa/pm/pb de todos los productos del
 * Cotizador vinculados a cualquiera de `catalogoProductoIds`, a partir del
 * proveedor más barato entre los que pasan `siguePrecios` (activo=true Y
 * seguir_precios=true), respetando la modalidad preferida de la categoría.
 *
 * Devuelve un resultado por cada id que tenga AL MENOS un producto del
 * Cotizador vinculado. Los ids sin vínculo no aparecen en la respuesta — es el
 * no-op barato para la mayoría de los productos de Proveedores, que hoy no
 * tienen equivalente en el Cotizador.
 *
 * Coste: 3 lecturas + (si hay cambios y no es dryRun) 1 transacción con 2
 * sentencias, sea cual sea la cantidad de ids.
 */
export async function recalcularCostosDesdeProveedor(
  catalogoProductoIds: number[],
  opts: { dryRun?: boolean } = {}
): Promise<ResultadoRecalculo[]> {
  const ids = [...new Set(catalogoProductoIds)];
  if (ids.length === 0) return [];

  // ─── Lectura 1: productos del Cotizador vinculados a cualquiera de los ids ──
  const productos: InstanceType<typeof CotizadorProducto>[] = [];
  for (const lote of trozos(ids, IDS_POR_CONSULTA)) {
    productos.push(...(await CotizadorProducto.findAll({ where: { catalogo_producto_id: { [Op.in]: lote } } })));
  }
  if (productos.length === 0) return [];

  const productosPorId = new Map<number, InstanceType<typeof CotizadorProducto>[]>();
  for (const p of productos) {
    const id = p.get('catalogo_producto_id') as number;
    const grupo = productosPorId.get(id);
    if (grupo) grupo.push(p);
    else productosPorId.set(id, [p]);
  }

  // ─── Lectura 2: candidatos de proveedor, normalizados en memoria ───────────
  const idsConProductos = [...productosPorId.keys()];
  const filas: InstanceType<typeof ProveedorProducto>[] = [];
  for (const lote of trozos(idsConProductos, IDS_POR_CONSULTA)) {
    filas.push(
      ...(await ProveedorProducto.findAll({
        where: { catalogo_producto_id: { [Op.in]: lote }, activo: true, precio_actual: { [Op.ne]: null } },
        include: [{ model: Proveedor, as: 'proveedor', attributes: ['id', 'nombre_comercial', 'activo', 'seguir_precios'] }],
      }))
    );
  }
  const candidatosPorId = new Map<number, Candidato[]>();
  for (const pp of filas) {
    const proveedorInstancia: any = (pp as any).get('proveedor');
    if (!siguePrecios(proveedorInstancia)) continue;
    const unidadCompra = pp.get('unidad_compra') as string;
    const precio = Number(pp.get('precio_actual'));
    const metros = Number(pp.get('metros_por_unidad') ?? 6);
    const candidato: Candidato = {
      proveedorProductoId: pp.get('id') as number,
      proveedorId: proveedorInstancia.get('id') as number,
      proveedorNombre: proveedorInstancia.get('nombre_comercial') as string,
      unidadCompra,
      precio,
      costoNormalizado: unidadCompra === 'TIRA_6M' && metros > 0 ? precio / metros : precio,
    };
    const id = pp.get('catalogo_producto_id') as number;
    const lista = candidatosPorId.get(id);
    if (lista) lista.push(candidato);
    else candidatosPorId.set(id, [candidato]);
  }

  // ─── Lectura 3: multiplicadores ────────────────────────────────────────────
  const multiplicadores = await cargarMultiplicadores();

  // ─── Cálculo en memoria ────────────────────────────────────────────────────
  const resultados: ResultadoRecalculo[] = [];
  const escrituras: Escritura[] = [];

  for (const catalogoProductoId of idsConProductos) {
    const delId = productosPorId.get(catalogoProductoId)!;
    const lista = candidatosPorId.get(catalogoProductoId) ?? [];
    const omitidos: Omitido[] = [];
    const cambios: CambioProducto[] = [];

    if (lista.length === 0) {
      for (const p of delId) {
        omitidos.push({
          codigo: p.get('codigo') as string,
          motivo: 'sin proveedor activo (seguir_precios=true) con precio para este producto',
        });
      }
      resultados.push({ catalogoProductoId, proveedorElegido: null, cambios, omitidos });
      continue;
    }

    // La modalidad preferida depende de la CATEGORÍA del producto del
    // Cotizador, no del id del maestro, así que la elección va dentro del
    // bucle. Se memoiza por categoría porque la lista es la misma.
    const elegidoPorCategoria = new Map<string, Candidato>();
    let proveedorElegido: ResultadoRecalculo['proveedorElegido'] = null;

    for (const producto of delId) {
      const codigo = producto.get('codigo') as string;
      const categoria = producto.get('categoria') as string;

      // Estado resuelto (incluye override) — un producto dado de baja no se toca.
      const resuelto = getProducto(codigo);
      if (resuelto && resuelto.activo === false) {
        omitidos.push({ codigo, motivo: 'producto dado de baja en el Cotizador (activo=false)' });
        continue;
      }

      const multiplicador = multiplicadores.get(categoria);
      if (!multiplicador) {
        omitidos.push({ codigo, motivo: `sin multiplicador verificado para la categoría "${categoria}"` });
        continue;
      }

      let elegido = elegidoPorCategoria.get(categoria);
      if (!elegido) {
        elegido = elegirCandidato(lista, categoria)!;
        elegidoPorCategoria.set(categoria, elegido);
      }
      if (!proveedorElegido) {
        proveedorElegido = {
          id: elegido.proveedorId,
          nombre: elegido.proveedorNombre,
          precio: elegido.precio,
          unidadCompra: elegido.unidadCompra,
        };
      }

      const costoBase = elegido.costoNormalizado;
      const antes = {
        costo_unitario: producto.get('costo_unitario') as number,
        precio_pa: producto.get('precio_pa') as number,
        precio_pm: producto.get('precio_pm') as number,
        precio_pb: producto.get('precio_pb') as number,
      };
      const despues = {
        costo_unitario: round2(costoBase),
        precio_pa: round2(costoBase * multiplicador.pa),
        precio_pm: round2(costoBase * multiplicador.pm),
        precio_pb: round2(costoBase * multiplicador.pb),
      };

      if (sinCambio(antes, despues)) continue; // No ensuciar el histórico, mismo criterio que actualizarPrecio().

      const alternativas = lista.length > 1 ? ` Elegido entre ${lista.length} candidato(s) por menor costo normalizado.` : '';
      let motivo =
        `Sync automático — proveedor "${elegido.proveedorNombre}" (ProveedorProducto #${elegido.proveedorProductoId}), ` +
        `modalidad ${elegido.unidadCompra} a $${elegido.precio}. Costo derivado: $${despues.costo_unitario}.${alternativas}`;
      if (resuelto?.ultimoCambio) {
        motivo += ' (⚠ override activo: el cambio en la tabla base no se ve hasta que se quite)';
      }

      escrituras.push({ codigo, antes, despues, motivo: motivo.slice(0, 300) });
      cambios.push({ codigo, categoria, antes, despues });
    }

    resultados.push({ catalogoProductoId, proveedorElegido, cambios, omitidos });
  }

  // `dryRun` no abre transacción: antes escribía y hacía rollback, lo que
  // costaba 4 viajes por producto para terminar descartando todo. La
  // previsualización sale entera del cálculo en memoria de arriba.
  if (!opts.dryRun) await aplicarEscrituras(escrituras, 'sync-proveedores');

  return resultados;
}

/**
 * Realinea PA/PM/PB al multiplicador de la categoría **conservando el costo**.
 *
 * Es la contraparte de `recalcularCostosDesdeProveedor`: no consulta
 * proveedores ni mueve `costo_unitario`, así que alcanza a los productos que
 * tienen costo cargado pero ninguna fuente de la que derivarlo. Sin esto, un
 * producto sin proveedor se quedaba con el multiplicador con el que se cargó
 * el día que entró y no había forma de moverlo (el caso de los 116 de
 * PERFILERIA en 1,514500).
 *
 * Un producto con `costo_unitario` en 0 o nulo se OMITE, nunca se realinea:
 * 0 × cualquier multiplicador es 0, y escribir un precio de venta en cero es
 * exactamente lo que este módulo no debe hacer (AUSENTE ≠ CERO).
 */
export async function realinearPreciosAlMultiplicador(
  categoria: string,
  opts: { dryRun?: boolean; excluirCodigos?: Set<string> } = {}
): Promise<ResultadoRealineacion> {
  const multiplicadores = await cargarMultiplicadores();
  const multiplicador = multiplicadores.get(categoria);
  const cambios: CambioProducto[] = [];
  const omitidos: Omitido[] = [];
  if (!multiplicador) {
    return { categoria, cambios, omitidos: [{ codigo: '—', motivo: `sin multiplicador verificado para la categoría "${categoria}"` }] };
  }

  const productos = await CotizadorProducto.findAll({ where: { categoria } });
  const escrituras: Escritura[] = [];

  for (const producto of productos) {
    const codigo = producto.get('codigo') as string;
    if (opts.excluirCodigos?.has(codigo)) continue; // ya lo movió la fase de proveedores

    const resuelto = getProducto(codigo);
    if (resuelto && resuelto.activo === false) {
      omitidos.push({ codigo, motivo: 'producto dado de baja en el Cotizador (activo=false)' });
      continue;
    }

    const costo = Number(producto.get('costo_unitario'));
    if (!Number.isFinite(costo) || costo <= 0) {
      omitidos.push({ codigo, motivo: 'costo en cero o ausente: no se deriva precio de venta (AUSENTE ≠ CERO)' });
      continue;
    }

    const antes = {
      costo_unitario: producto.get('costo_unitario') as number,
      precio_pa: producto.get('precio_pa') as number,
      precio_pm: producto.get('precio_pm') as number,
      precio_pb: producto.get('precio_pb') as number,
    };
    const despues = {
      costo_unitario: antes.costo_unitario, // el costo NO se toca en esta fase
      precio_pa: round2(costo * multiplicador.pa),
      precio_pm: round2(costo * multiplicador.pm),
      precio_pb: round2(costo * multiplicador.pb),
    };

    if (sinCambio(antes, despues)) continue;

    let motivo =
      `Realineación al multiplicador de ${categoria} (${multiplicador.pa}/${multiplicador.pm}/${multiplicador.pb}). ` +
      `Costo conservado en $${antes.costo_unitario}.`;
    if (resuelto?.ultimoCambio) {
      motivo += ' (⚠ override activo: el cambio en la tabla base no se ve hasta que se quite)';
    }

    escrituras.push({ codigo, antes, despues, motivo: motivo.slice(0, 300) });
    cambios.push({ codigo, categoria, antes, despues });
  }

  if (!opts.dryRun) await aplicarEscrituras(escrituras, 'realineacion-multiplicador');

  return { categoria, cambios, omitidos };
}

/**
 * Envoltorio por-id, contrato original intacto: `null` cuando ningún producto
 * del Cotizador está vinculado a ese `catalogoProductoId`.
 *
 * Única diferencia de comportamiento respecto de la versión anterior: si un id
 * tiene varios productos del Cotizador, ahora comparten transacción en vez de
 * abrir una por producto. Con 530 filas apuntando a 516 ids distintos, eso son
 * 1-2 productos por transacción, y la cola de abajo sigue aislando el error
 * por id.
 */
export async function recalcularCostoDesdeProveedor(
  catalogoProductoId: number,
  opts: { dryRun?: boolean } = {}
): Promise<ResultadoRecalculo | null> {
  const [resultado] = await recalcularCostosDesdeProveedor([catalogoProductoId], opts);
  return resultado ?? null;
}

// ─── Cola coalescida ────────────────────────────────────────────────────────
// Un lote de facturas (cargarFacturasLote) puede actualizar decenas de precios
// en una sola transacción de Proveedores; sin coalescer, cada uno dispararía
// su propia recarga completa de la caché del Cotizador (563 filas) en cadena.
// Se mantiene el bucle por id —en vez de una sola llamada batch— a propósito:
// aísla el fallo de un id para que no tumbe al resto del lote, que es lo que
// buscaba el diseño original. Sólo se difiere y coalesce el recargarPrecios()
// final.
const pendientes = new Set<number>();
let vuelta: NodeJS.Immediate | null = null;

export function programarRecalculo(catalogoProductoId: number): void {
  pendientes.add(catalogoProductoId);
  if (vuelta) return;
  vuelta = setImmediate(async () => {
    vuelta = null;
    const ids = [...pendientes];
    pendientes.clear();
    let huboCambios = false;
    for (const id of ids) {
      try {
        const r = await recalcularCostoDesdeProveedor(id);
        if (r && r.cambios.length > 0) huboCambios = true;
      } catch (e) {
        console.error('[sync-proveedores] recalculo falló para catalogo_producto_id', id, e);
      }
    }
    if (huboCambios) await recargarPrecios();
  });
}
