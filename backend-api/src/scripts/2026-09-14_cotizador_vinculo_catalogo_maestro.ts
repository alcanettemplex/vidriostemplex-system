/**
 * Script: 2026-09-14_cotizador_vinculo_catalogo_maestro.ts
 *
 * Primer paso de la integración Cotizador ↔ Catálogo maestro ↔ Proveedores
 * (ver plan de la sesión 2026-09-14): el Cotizador deja de ser un catálogo
 * aislado con códigos inventados a mano y empieza a apoyarse en
 * `catalogo_productos` (el maestro real de códigos Templex) para la
 * identidad de cada producto.
 *
 * QUÉ HACE
 *   1. `cotizador.producto` + columna `catalogo_producto_id` (FK cross-schema
 *      hacia `public.catalogo_productos(id)`, NULL permitido) + índice.
 *   2. Backfill por MATCH EXACTO de `codigo`: de los 563 productos del
 *      Cotizador, ~382 ya coinciden por texto con un código del maestro.
 *      Los que no coinciden quedan en NULL — no es un error, es el punto de
 *      partida del Excel de reconciliación (script aparte,
 *      2026-09-14_exportar_codigos_huerfanos_cotizador.ts).
 *   3. `cotizador.multiplicador_categoria` (tabla nueva): formaliza el
 *      multiplicador costo→precio de venta (PA/PM/PB) que hasta hoy se
 *      recalculaba a mano en cada script one-off. Semilla: SOLO categoría
 *      ACCESORIO (×1.550628/×1.440712/×1.330796, verificado contra 18+
 *      productos reales — ver 2026-09-14_alta_accesorios_7038_restantes.ts).
 *      PERFILERIA y VIDRIO quedan sin fila a propósito: la ausencia de fila
 *      es la señal que usa sincronizacionProveedores.ts para no tocarlos
 *      hasta que alguien re-verifique esos multiplicadores contra datos
 *      reales (pendiente, fuera de este script).
 *
 * QUÉ NO HACE
 *   - No toca `cache.ts` ni el tipo `Producto` (golden master de 9 claves):
 *     `catalogo_producto_id` vive solo en la tabla/modelo, el motor de
 *     cálculo del Cotizador ni se entera.
 *   - No activa ningún motor de sincronización — eso es
 *     `cotizador/lib/sincronizacionProveedores.ts`, aparte.
 *   - Drift conocido de `catalogo_productos.codigo` (Sequelize lo declara
 *     UNIQUE NOT NULL, la tabla real no tiene ese constraint, hay filas con
 *     codigo NULL): el backfill excluye `codigo IS NULL` explícitamente, y si
 *     encuentra códigos duplicados entre los candidatos del match los saca
 *     del UPDATE automático y los deja listados en el log en vez de dejar
 *     que Postgres tome una fila arbitraria.
 *
 * Idempotente: `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, el
 * backfill solo toca filas con `catalogo_producto_id IS NULL` y el seed usa
 * `ON CONFLICT DO NOTHING` sobre la PK `categoria`.
 *
 * Uso:
 *   npx ts-node src/scripts/2026-09-14_cotizador_vinculo_catalogo_maestro.ts             (aplicar)
 *   npx ts-node src/scripts/2026-09-14_cotizador_vinculo_catalogo_maestro.ts --revertir  (deshacer)
 */
import sequelize from '../config/database';
import { QueryTypes, Transaction } from 'sequelize';

interface FilaCodigoDuplicado {
  codigo: string;
  veces: number;
}

async function aplicar(): Promise<void> {
  console.log('=== Cotizador → vínculo con catalogo_productos — 2026-09-14 ===\n');

  const t = await sequelize.transaction();
  try {
    await sequelize.query(
      `ALTER TABLE cotizador.producto
         ADD COLUMN IF NOT EXISTS catalogo_producto_id INTEGER NULL
         REFERENCES public.catalogo_productos(id);`,
      { transaction: t }
    );
    console.log('✓ Columna cotizador.producto.catalogo_producto_id asegurada (+ FK)');

    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS idx_cotizador_producto_catalogo_producto_id
         ON cotizador.producto(catalogo_producto_id);`,
      { transaction: t }
    );
    console.log('✓ Índice idx_cotizador_producto_catalogo_producto_id asegurado');

    // Códigos duplicados en catalogo_productos entre los candidatos del match
    // (drift de unicidad real, ver cabecera): se excluyen del backfill
    // automático para no dejar que Postgres elija una fila arbitraria.
    const duplicados = await sequelize.query<FilaCodigoDuplicado>(
      `SELECT c.codigo, COUNT(*)::int AS veces
         FROM public.catalogo_productos c
         JOIN cotizador.producto p ON p.codigo = c.codigo
        WHERE c.codigo IS NOT NULL AND p.catalogo_producto_id IS NULL
        GROUP BY c.codigo
       HAVING COUNT(*) > 1`,
      { type: QueryTypes.SELECT, transaction: t }
    );
    if (duplicados.length > 0) {
      console.log(
        `⚠ ${duplicados.length} código(s) duplicados en catalogo_productos, excluidos del backfill automático:`
      );
      for (const d of duplicados) console.log(`  - ${d.codigo} (${d.veces} filas en catalogo_productos)`);
    }
    const codigosExcluidos = duplicados.map((d) => d.codigo);
    // `ANY(:excluidos)` con un array vacío es SQL inválido para node-postgres
    // (expande a `ANY()`), así que la cláusula de exclusión solo se agrega
    // cuando de verdad hay códigos que excluir.
    const clausulaExclusion = codigosExcluidos.length > 0 ? 'AND NOT (c.codigo = ANY(:excluidos))' : '';

    const [, filasBackfill] = await sequelize.query(
      `UPDATE cotizador.producto p
          SET catalogo_producto_id = c.id
         FROM public.catalogo_productos c
        WHERE p.codigo = c.codigo
          AND c.codigo IS NOT NULL
          AND p.catalogo_producto_id IS NULL
          ${clausulaExclusion}`,
      { transaction: t, replacements: { excluidos: codigosExcluidos } }
    );
    const nBackfill = (filasBackfill as unknown as { rowCount?: number })?.rowCount ?? 0;
    console.log(`✓ Backfill por match exacto de código: ${nBackfill} fila(s) vinculadas`);

    await sequelize.query(
      `CREATE TABLE IF NOT EXISTS cotizador.multiplicador_categoria (
         categoria         VARCHAR(20) PRIMARY KEY,
         multiplicador_pa  DOUBLE PRECISION NOT NULL,
         multiplicador_pm  DOUBLE PRECISION NOT NULL,
         multiplicador_pb  DOUBLE PRECISION NOT NULL,
         actualizado_en    TIMESTAMPTZ,
         actualizado_por   VARCHAR(80),
         nota              TEXT
       );`,
      { transaction: t }
    );
    console.log('✓ Tabla cotizador.multiplicador_categoria asegurada');

    await sequelize.query(
      `INSERT INTO cotizador.multiplicador_categoria
         (categoria, multiplicador_pa, multiplicador_pm, multiplicador_pb, actualizado_en, actualizado_por, nota)
       VALUES
         ('ACCESORIO', 1.550628, 1.440712, 1.330796, NOW(), 'migracion-2026-09-14',
          'Verificado contra 18+ productos reales de cotizador.producto (GIN7038, ROD7038ABB, ' ||
          'ROD7038NY, TES1102, BAR1101...), ver 2026-09-14_alta_accesorios_7038_restantes.ts. ' ||
          'PERFILERIA y VIDRIO quedan sin fila a propósito: sus multiplicadores (~1.56 / ~1.67) ' ||
          'no están verificados a 6 decimales contra datos reales todavía.')
       ON CONFLICT (categoria) DO NOTHING;`,
      { transaction: t }
    );
    console.log('✓ Seed: multiplicador de categoría ACCESORIO');

    console.log('\n--- Verificación previa al COMMIT ---');
    await verificar(t);
    console.log('✓ Verificación OK');

    await t.commit();
    console.log('\n=== Migración completada y confirmada (COMMIT). ===');
  } catch (err) {
    await t.rollback();
    console.error('\n✘ Error durante la migración — se hizo ROLLBACK, la BD queda como estaba:', err);
    throw err;
  }
}

async function verificar(t: Transaction): Promise<void> {
  const [{ existe: columnaExiste }] = await sequelize.query<{ existe: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'cotizador' AND table_name = 'producto' AND column_name = 'catalogo_producto_id'
     ) AS existe;`,
    { type: QueryTypes.SELECT, transaction: t }
  );
  if (!columnaExiste) throw new Error('Verificación falló: falta la columna catalogo_producto_id');

  const [{ n: filasTabla }] = await sequelize.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM cotizador.multiplicador_categoria;`,
    { type: QueryTypes.SELECT, transaction: t }
  );
  if (Number(filasTabla) < 1) {
    throw new Error('Verificación falló: cotizador.multiplicador_categoria quedó vacía (esperaba al menos ACCESORIO)');
  }

  const [{ existe: accesorioExiste }] = await sequelize.query<{ existe: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM cotizador.multiplicador_categoria WHERE categoria = 'ACCESORIO') AS existe;`,
    { type: QueryTypes.SELECT, transaction: t }
  );
  if (!accesorioExiste) throw new Error('Verificación falló: no quedó la fila ACCESORIO en multiplicador_categoria');
}

async function revertir(): Promise<void> {
  console.log('=== Revirtiendo vínculo Cotizador → catalogo_productos — 2026-09-14 ===\n');

  const t = await sequelize.transaction();
  try {
    await sequelize.query(`DROP TABLE IF EXISTS cotizador.multiplicador_categoria;`, { transaction: t });
    console.log('✓ Tabla cotizador.multiplicador_categoria eliminada');

    await sequelize.query(
      `DROP INDEX IF EXISTS cotizador.idx_cotizador_producto_catalogo_producto_id;`,
      { transaction: t }
    );
    await sequelize.query(
      `ALTER TABLE cotizador.producto DROP COLUMN IF EXISTS catalogo_producto_id;`,
      { transaction: t }
    );
    console.log('✓ Columna cotizador.producto.catalogo_producto_id eliminada (índice y FK con ella)');

    await t.commit();
    console.log('\n=== Reversión completada y confirmada (COMMIT). ===');
  } catch (err) {
    await t.rollback();
    console.error('\n✘ Error durante la reversión — se hizo ROLLBACK, la BD queda como estaba:', err);
    throw err;
  }
}

async function run(): Promise<void> {
  const modoRevertir = process.argv.includes('--revertir');

  await sequelize.authenticate();
  console.log('Conexión OK\n');

  if (modoRevertir) {
    await revertir();
  } else {
    await aplicar();
  }
}

run()
  .then(async () => {
    await sequelize.close();
  })
  .catch(async (err) => {
    console.error('\nEl script terminó con error:', err);
    await sequelize.close().catch(() => {});
    process.exit(1);
  });
