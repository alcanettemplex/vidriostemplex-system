/**
 * Lista blanca de seguimiento de precios (2026-09-04).
 *
 * Deja `proveedores.seguir_precios` así:
 *   · NULL (sin decidir) para TODOS los proveedores.
 *   · true  solo para los ids que se pasen en `--ids`.
 *
 * Sustituye al criterio automático del reset de hoy —"tiene equivalencias mapeadas"—
 * por una lista explícita de los proveedores de insumo reales. Tiene que ser un script
 * y no la pantalla porque no existe ninguna vía para devolver `seguir_precios` a NULL:
 * `seguimientoMasivoSchema` y `proveedorUpdateSchema` exigen booleano, y el endpoint
 * de seguimiento solo acepta true/false.
 *
 * DOS FASES, a propósito. Cuatro de los nombres buscados ("avq", "ppa", "vea", "soho")
 * son subcadenas cortas contra un maestro de ~1.800 filas: `%vea%` también coincide con
 * "NUEVA" y "LÍNEA VERDE". Por eso la fase 1 solo propone y el usuario confirma ids.
 *
 * Uso:
 *   npx ts-node backend-api/src/scripts/2026_09_04_seguimiento_lista_blanca.ts
 *      → FASE 1. Solo lee. Lista candidatos por nombre y el impacto de pasar el resto
 *        a "sin decidir". No escribe absolutamente nada.
 *
 *   npx ts-node backend-api/src/scripts/2026_09_04_seguimiento_lista_blanca.ts --aplicar --ids=12,45,301
 *      → FASE 2. Pone todo en NULL, esos ids en true, y borra el registro de sus
 *        facturas omitidas para que los .zip puedan volver a subirse.
 *
 * Efecto de la fase 2 sobre las facturas: al liberar los CUFE de las facturas que se
 * habían omitido por `PROVEEDOR_*`, hay que **volver a subir esos .zip** para que sus
 * códigos entren a Por Mapear. Los XML no se guardan (multer usa memoryStorage), así
 * que no hay forma de reproyectarlos desde la BD.
 */
import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';

const APLICAR = process.argv.includes('--aplicar');

/** Búsqueda libre en el maestro: `--buscar=palacio`. Para cerrar los nombres que la
 *  lista no encontró sin tener que tocar el arreglo BUSCADOS en cada intento. */
const argBuscar = process.argv.find((a) => a.startsWith('--buscar='));
const BUSCAR = argBuscar ? argBuscar.slice('--buscar='.length).trim() : '';

const argIds = process.argv.find((a) => a.startsWith('--ids='));
const IDS: number[] = argIds
  ? argIds
      .slice('--ids='.length)
      .split(',')
      .map((n) => Number(n.trim()))
      .filter((n) => Number.isInteger(n) && n > 0)
  : [];

/** Motivos que marcan una factura registrada pero no procesada por decisión sobre el
 *  proveedor. Son los únicos que se pueden liberar: una nota crédito o una factura en
 *  moneda extranjera se omitió por lo que es, no por quién la emitió. */
const MOTIVOS_LIBERABLES = ['PROVEEDOR_SIN_DECIDIR', 'PROVEEDOR_NO_SEGUIDO', 'PROVEEDOR_INACTIVO'];

/**
 * Los proveedores de insumo que sí interesan. Cada entrada admite varias grafías
 * porque el maestro viene de World Office y la ingesta, y ninguno de los dos normaliza.
 */
const BUSCADOS: Array<{ etiqueta: string; patrones: string[] }> = [
  { etiqueta: 'Ventanas y Puertas', patrones: ['ventanas y puertas'] },
  { etiqueta: 'Acvicol', patrones: ['acvicol'] },
  { etiqueta: 'AVQ', patrones: ['avq'] },
  { etiqueta: 'Vitelsa', patrones: ['vitelsa'] },
  { etiqueta: 'Rapividrios', patrones: ['rapividrios', 'rapi vidrios'] },
  { etiqueta: 'Hi-Tech', patrones: ['hi-tech', 'hi tech', 'hitech'] },
  { etiqueta: 'PPA', patrones: ['ppa'] },
  { etiqueta: 'Soho', patrones: ['soho'] },
  { etiqueta: 'Todovidrios', patrones: ['todovidrios', 'todo vidrios'] },
  { etiqueta: 'VEA', patrones: ['vea'] },
  { etiqueta: 'Mundial de Tornillos', patrones: ['mundial de tornillos', 'mundial tornillos'] },
  { etiqueta: 'Palacio de Aluminio', patrones: ['palacio de aluminio', 'palacio aluminio'] },
];

interface FilaProveedor {
  id: number;
  nit: string | null;
  nombre_comercial: string;
  razon_social: string | null;
  activo: boolean;
  seguir_precios: boolean | null;
  origen_registro: string;
  equivalencias: number;
  pendientes: number;
  descartados: number;
  facturas: number;
  facturas_omitidas: number;
}

const SELECT_PROVEEDOR = `
  SELECT p.id, p.nit, p.nombre_comercial, p.razon_social, p.activo,
         p.seguir_precios, p.origen_registro,
         (SELECT COUNT(*)::int FROM proveedor_producto pp
           WHERE pp.proveedor_id = p.id AND pp.activo) AS equivalencias,
         (SELECT COUNT(*)::int FROM proveedor_codigo_pendiente cp
           WHERE cp.proveedor_id = p.id AND cp.estado = 'PENDIENTE') AS pendientes,
         (SELECT COUNT(*)::int FROM proveedor_codigo_pendiente cp
           WHERE cp.proveedor_id = p.id AND cp.estado = 'DESCARTADO') AS descartados,
         (SELECT COUNT(*)::int FROM factura_proveedor_procesada f
           WHERE f.proveedor_id = p.id) AS facturas,
         (SELECT COUNT(*)::int FROM factura_proveedor_procesada f
           WHERE f.proveedor_id = p.id
             AND f.motivo_omision IN (:motivos)) AS facturas_omitidas
    FROM proveedores p
`;

function estadoTexto(p: FilaProveedor): string {
  if (!p.activo) return 'INACTIVO';
  if (p.seguir_precios === true) return 'siguiendo';
  if (p.seguir_precios === false) return 'ignorado';
  return 'sin decidir';
}

function imprimirFila(p: FilaProveedor, marca = ' ') {
  const nombre = p.nombre_comercial.length > 42 ? `${p.nombre_comercial.slice(0, 39)}...` : p.nombre_comercial;
  console.log(
    `  ${marca} id=${String(p.id).padStart(5)}  ${nombre.padEnd(42)}` +
    `  NIT ${String(p.nit ?? '—').padEnd(12)}` +
    `  ${estadoTexto(p).padEnd(11)}` +
    `  eq:${String(p.equivalencias).padStart(3)}` +
    `  pend:${String(p.pendientes).padStart(3)}` +
    `  desc:${String(p.descartados).padStart(3)}` +
    `  fact:${String(p.facturas).padStart(3)} (omit ${p.facturas_omitidas})`
  );
  if (p.razon_social && p.razon_social !== p.nombre_comercial) {
    console.log(`      ${' '.repeat(8)}${p.razon_social}`);
  }
}

// ─── Búsqueda libre ───────────────────────────────────────────────────────────

async function buscarLibre(texto: string) {
  const filas = await sequelize.query<FilaProveedor>(
    `${SELECT_PROVEEDOR}
      WHERE p.nombre_comercial ILIKE :patron OR p.razon_social ILIKE :patron
      ORDER BY p.nombre_comercial`,
    { type: QueryTypes.SELECT, replacements: { patron: `%${texto}%`, motivos: MOTIVOS_LIBERABLES } }
  );

  console.log(`\n── Búsqueda libre: "${texto}"  (${filas.length} coincidencia(s)) ──`);
  if (filas.length === 0) console.log('   (ninguna)');
  for (const f of filas) imprimirFila(f);
  console.log('');
}

// ─── FASE 1: proponer ─────────────────────────────────────────────────────────

async function fase1() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  FASE 1 — Candidatos por nombre. Este script NO ha escrito nada.     ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  const idsPropuestos = new Set<number>();

  for (const buscado of BUSCADOS) {
    const vistos = new Map<number, FilaProveedor>();

    for (const patron of buscado.patrones) {
      const filas = await sequelize.query<FilaProveedor>(
        `${SELECT_PROVEEDOR}
          WHERE p.nombre_comercial ILIKE :patron OR p.razon_social ILIKE :patron
          ORDER BY p.nombre_comercial`,
        { type: QueryTypes.SELECT, replacements: { patron: `%${patron}%`, motivos: MOTIVOS_LIBERABLES } }
      );
      for (const f of filas) vistos.set(f.id, f);
    }

    console.log(`\n── ${buscado.etiqueta}  (patrones: ${buscado.patrones.join(', ')}) ──`);
    if (vistos.size === 0) {
      console.log('   ⚠  SIN COINCIDENCIAS. Búscalo a mano o dime el nombre exacto.');
      continue;
    }
    if (vistos.size > 1) {
      console.log(`   ⚠  ${vistos.size} coincidencias: hay que elegir cuál(es). No se asume ninguna.`);
    }
    for (const f of vistos.values()) {
      imprimirFila(f);
      idsPropuestos.add(f.id);
    }
  }

  // ── Impacto de pasar el resto a "sin decidir" ──────────────────────────────
  // Lo que importa no es cuántos cambian, sino cuáles pierden el seguimiento
  // teniendo equivalencias ya mapeadas: esos dejan de actualizar precio en silencio.
  const enRiesgo = await sequelize.query<FilaProveedor>(
    `${SELECT_PROVEEDOR}
      WHERE p.seguir_precios IS TRUE
        AND EXISTS (SELECT 1 FROM proveedor_producto pp WHERE pp.proveedor_id = p.id AND pp.activo)
      ORDER BY p.nombre_comercial`,
    { type: QueryTypes.SELECT, replacements: { motivos: MOTIVOS_LIBERABLES } }
  );

  const noPropuestos = enRiesgo.filter((p) => !idsPropuestos.has(p.id));

  // Todos los que hoy están en "siguiendo", tengan o no equivalencias: si alguno queda
  // fuera de la lista blanca por descuido, aquí se ve antes de escribir.
  const siguiendoHoy = await sequelize.query<FilaProveedor>(
    `${SELECT_PROVEEDOR} WHERE p.seguir_precios IS TRUE ORDER BY p.nombre_comercial`,
    { type: QueryTypes.SELECT, replacements: { motivos: MOTIVOS_LIBERABLES } }
  );
  console.log('\n── Hoy en "siguiendo" (todos) ──────────────────────────────────────');
  for (const p of siguiendoHoy) imprimirFila(p, idsPropuestos.has(p.id) ? '·' : '!');

  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  Impacto: hoy en "siguiendo" CON equivalencias, y fuera de la lista  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  if (noPropuestos.length === 0) {
    console.log('   Ninguno. Todos los que tienen mapeos están en la lista blanca.');
  } else {
    console.log(`   ${noPropuestos.length} proveedor(es) dejarían de actualizar precios:`);
    for (const p of noPropuestos) imprimirFila(p, '!');
  }

  // ── Resumen global ─────────────────────────────────────────────────────────
  const [resumen]: any = await sequelize.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE seguir_precios IS TRUE)::int  AS siguiendo,
           COUNT(*) FILTER (WHERE seguir_precios IS FALSE)::int AS ignorados,
           COUNT(*) FILTER (WHERE seguir_precios IS NULL)::int  AS sin_decidir
      FROM proveedores
  `);
  const r = resumen[0];
  console.log('\n── Estado actual del maestro ───────────────────────────────────────');
  console.log(`   total ${r.total}  ·  siguiendo ${r.siguiendo}  ·  ignorados ${r.ignorados}  ·  sin decidir ${r.sin_decidir}`);

  console.log('\n── Siguiente paso ──────────────────────────────────────────────────');
  console.log('   Revisa los candidatos y ejecuta con los ids que confirmes:');
  console.log(`   npx ts-node backend-api/src/scripts/2026_09_04_seguimiento_lista_blanca.ts --aplicar --ids=${Array.from(idsPropuestos).join(',') || '<ids>'}`);
  console.log('   (esa lista incluye TODAS las coincidencias: depúrala antes de correrla)\n');
}

// ─── FASE 2: aplicar ──────────────────────────────────────────────────────────

async function fase2() {
  const filas = await sequelize.query<FilaProveedor>(
    `${SELECT_PROVEEDOR} WHERE p.id IN (:ids) ORDER BY p.nombre_comercial`,
    { type: QueryTypes.SELECT, replacements: { ids: IDS, motivos: MOTIVOS_LIBERABLES } }
  );

  if (filas.length !== IDS.length) {
    const encontrados = new Set(filas.map((f) => f.id));
    const faltantes = IDS.filter((id) => !encontrados.has(id));
    console.error(`\n[ABORTA] Estos ids no existen en proveedores: ${faltantes.join(', ')}\n`);
    process.exit(1);
  }

  console.log('\n── Se pondrán en "siguiendo" ───────────────────────────────────────');
  for (const f of filas) imprimirFila(f);

  const inactivos = filas.filter((f) => !f.activo);
  if (inactivos.length > 0) {
    console.log('\n   ⚠  Ojo: los marcados INACTIVO no alimentan la bandeja aunque queden');
    console.log('      en true — `siguePrecios()` exige activo = true. Reactívalos en la');
    console.log('      pantalla de Proveedores.');
  }

  const t = await sequelize.transaction();
  try {
    const [, metaNull]: any = await sequelize.query(
      `UPDATE proveedores SET seguir_precios = NULL WHERE seguir_precios IS NOT NULL`,
      { transaction: t }
    );

    const [, metaTrue]: any = await sequelize.query(
      `UPDATE proveedores SET seguir_precios = true WHERE id IN (:ids)`,
      { transaction: t, replacements: { ids: IDS } }
    );

    // Libera los CUFE de las facturas que se registraron sin procesar por la decisión
    // sobre el proveedor. Sin esto, resubir esos .zip los rechaza como duplicados y
    // aprobar al proveedor no serviría de nada. Es exactamente lo que hace
    // `aplicarSeguimiento` al encender el interruptor desde la pantalla.
    const [, metaFacturas]: any = await sequelize.query(
      `DELETE FROM factura_proveedor_procesada
        WHERE proveedor_id IN (:ids) AND motivo_omision IN (:motivos)`,
      { transaction: t, replacements: { ids: IDS, motivos: MOTIVOS_LIBERABLES } }
    );

    await t.commit();

    console.log('\n── Aplicado ────────────────────────────────────────────────────────');
    console.log(`   ${metaNull?.rowCount ?? 0} proveedor(es) pasados a "sin decidir"`);
    console.log(`   ${metaTrue?.rowCount ?? 0} proveedor(es) puestos en "siguiendo"`);
    console.log(`   ${metaFacturas?.rowCount ?? 0} factura(s) liberadas: vuelve a subir esos .zip`);
    console.log('      para que sus códigos entren a Por Mapear.\n');
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

// ─── Entrada ──────────────────────────────────────────────────────────────────

(async () => {
  try {
    await sequelize.authenticate();

    if (BUSCAR) {
      await buscarLibre(BUSCAR);
    } else if (!APLICAR) {
      await fase1();
    } else if (IDS.length === 0) {
      console.error('\n[ABORTA] `--aplicar` exige `--ids=1,2,3` con los proveedores confirmados.');
      console.error('         Corre el script sin argumentos para ver los candidatos.\n');
      process.exit(1);
    } else {
      await fase2();
    }

    await sequelize.close();
  } catch (err) {
    console.error('\n[ERROR]', err);
    await sequelize.close();
    process.exit(1);
  }
})();
