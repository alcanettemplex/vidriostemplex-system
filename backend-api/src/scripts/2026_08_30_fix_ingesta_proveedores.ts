/**
 * Script: 2026_08_30_fix_ingesta_proveedores.ts
 *
 * Propósito: aplicar los cambios de esquema y el saneamiento de datos que exige la
 *            corrección de los defectos críticos de la ingesta de facturas electrónicas
 *            (auditoría 2026-08-30).
 *
 *   1. Tabla `factura_proveedor_procesada` — idempotencia real por CUFE.
 *   2. `proveedor_codigo_pendiente`: unidad y IVA detectados, marca de código derivado.
 *   3. `proveedores`: interruptor `seguir_precios` y `origen_registro`.
 *   4. `proveedor_producto_precio`: CUFE completo, IVA del documento, líneas repetidas,
 *      marca de precio retroactivo.
 *   5. Índice sobre (proveedor_id, codigo_proveedor) — la consulta caliente de la ingesta.
 *   6. Saneamiento: devolver a PENDIENTE los códigos MAPEADO que se quedaron sin
 *      equivalencia (quedaban invisibles y sin capturar precio) y clasificar el origen
 *      de los proveedores existentes.
 *
 * Ejecutar: npx ts-node src/scripts/2026_08_30_fix_ingesta_proveedores.ts
 * Idempotente: usa IF NOT EXISTS / IF EXISTS en todo. Puede correrse más de una vez.
 */

import sequelize from '../config/database';

async function run() {
  console.log('=== Corrección ingesta Proveedores — 2026-08-30 ===\n');

  // ─── 1. Registro de facturas procesadas (idempotencia por CUFE) ──────────────
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS factura_proveedor_procesada (
      id                  SERIAL PRIMARY KEY,
      cufe                VARCHAR(120) NOT NULL,
      proveedor_id        INTEGER      REFERENCES proveedores(id) ON DELETE SET NULL,
      numero_factura      VARCHAR(60),
      fecha_emision       DATE,
      tipo_documento      VARCHAR(20)  NOT NULL DEFAULT 'FACTURA',
      moneda              VARCHAR(10)  DEFAULT 'COP',
      lineas_totales      INTEGER      NOT NULL DEFAULT 0,
      lineas_actualizadas INTEGER      NOT NULL DEFAULT 0,
      lineas_pendientes   INTEGER      NOT NULL DEFAULT 0,
      lineas_omitidas     INTEGER      NOT NULL DEFAULT 0,
      motivo_omision      VARCHAR(40),
      archivo_origen      VARCHAR(255),
      procesado_por       INTEGER      REFERENCES usuarios(id) ON DELETE SET NULL,
      fecha_procesado     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_factura_proveedor_cufe UNIQUE (cufe)
    );
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_factura_proveedor_fecha
      ON factura_proveedor_procesada (proveedor_id, fecha_emision);
  `);
  console.log('[OK] factura_proveedor_procesada');

  // ─── 2. Bandeja de códigos: unidad, IVA y origen del código ─────────────────
  await sequelize.query(`
    ALTER TABLE proveedor_codigo_pendiente
      ADD COLUMN IF NOT EXISTS unidad_detectada         VARCHAR(20),
      ADD COLUMN IF NOT EXISTS porcentaje_iva_detectado DECIMAL(5,2),
      ADD COLUMN IF NOT EXISTS codigo_derivado          BOOLEAN NOT NULL DEFAULT false;
  `);
  console.log('[OK] proveedor_codigo_pendiente — unidad_detectada, porcentaje_iva_detectado, codigo_derivado');

  // ─── 3. Proveedores: seguimiento de precios y procedencia ───────────────────
  await sequelize.query(`
    ALTER TABLE proveedores
      ADD COLUMN IF NOT EXISTS seguir_precios  BOOLEAN     NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS origen_registro VARCHAR(20) NOT NULL DEFAULT 'MANUAL';
  `);
  console.log('[OK] proveedores — seguir_precios, origen_registro');

  // ─── 4. Histórico de precios: trazabilidad completa del documento ───────────
  await sequelize.query(`
    ALTER TABLE proveedor_producto_precio
      ADD COLUMN IF NOT EXISTS cufe              VARCHAR(120),
      ADD COLUMN IF NOT EXISTS porcentaje_iva    DECIMAL(5,2),
      ADD COLUMN IF NOT EXISTS lineas_en_factura INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS retroactivo       BOOLEAN NOT NULL DEFAULT false;
  `);
  console.log('[OK] proveedor_producto_precio — cufe, porcentaje_iva, lineas_en_factura, retroactivo');

  // ─── 5. Índice de la consulta caliente de la ingesta ────────────────────────
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_proveedor_producto_prov_codigo
      ON proveedor_producto (proveedor_id, codigo_proveedor);
  `);
  console.log('[OK] Índice idx_proveedor_producto_prov_codigo');

  // ─── 6. Saneamiento: códigos MAPEADO sin equivalencia ──────────────────────
  // Se quedaron fuera de todo: no actualizaban precio (no hay equivalencia) y tampoco
  // volvían a la bandeja (la ingesta solo tocaba los que estaban en PENDIENTE).
  const [huerfanos]: any = await sequelize.query(`
    SELECT cp.id, cp.codigo_proveedor, cp.descripcion_proveedor, cp.veces_visto, p.nombre_comercial
    FROM proveedor_codigo_pendiente cp
    JOIN proveedores p ON p.id = cp.proveedor_id
    WHERE cp.estado = 'MAPEADO'
      AND NOT EXISTS (
        SELECT 1 FROM proveedor_producto pp
        WHERE pp.proveedor_id = cp.proveedor_id
          AND pp.codigo_proveedor = cp.codigo_proveedor
      );
  `);

  if (huerfanos.length > 0) {
    console.log(`\n  ${huerfanos.length} código(s) en limbo — se devuelven a PENDIENTE:`);
    for (const h of huerfanos) {
      console.log(`    · ${h.codigo_proveedor} — ${h.descripcion_proveedor} (${h.nombre_comercial}, visto ${h.veces_visto}×)`);
    }
    await sequelize.query(`
      UPDATE proveedor_codigo_pendiente cp
      SET estado = 'PENDIENTE'
      WHERE cp.estado = 'MAPEADO'
        AND NOT EXISTS (
          SELECT 1 FROM proveedor_producto pp
          WHERE pp.proveedor_id = cp.proveedor_id
            AND pp.codigo_proveedor = cp.codigo_proveedor
        );
    `);
  }
  console.log(`[OK] Saneamiento de códigos huérfanos (${huerfanos.length})`);

  // ─── 7. Clasificar la procedencia de los proveedores existentes ────────────
  // Los del Excel de World Office traen numero_identificacion; los que creó la
  // ingesta al no reconocer un NIT, no. La importación masiva corrió el 2026-08-24.
  await sequelize.query(`
    UPDATE proveedores SET origen_registro = 'IMPORTACION_WO'
    WHERE numero_identificacion IS NOT NULL AND origen_registro = 'MANUAL';
  `);

  await sequelize.query(`
    UPDATE proveedores SET origen_registro = 'INGESTA_FE'
    WHERE numero_identificacion IS NULL
      AND fecha_creacion >= '2026-08-25'
      AND origen_registro = 'MANUAL';
  `);

  const [conteo]: any = await sequelize.query(`
    SELECT origen_registro, COUNT(*) AS n FROM proveedores GROUP BY origen_registro ORDER BY n DESC;
  `);
  console.log('[OK] origen_registro clasificado:');
  for (const c of conteo) console.log(`    · ${c.origen_registro}: ${c.n}`);

  // ─── 8. Aviso de códigos sospechosos de colisión (revisión manual) ─────────
  const [numericos]: any = await sequelize.query(`
    SELECT cp.codigo_proveedor, cp.descripcion_proveedor, cp.veces_visto, p.nombre_comercial
    FROM proveedor_codigo_pendiente cp
    JOIN proveedores p ON p.id = cp.proveedor_id
    WHERE cp.codigo_proveedor ~ '^[0-9]{1,4}$' AND cp.estado = 'PENDIENTE'
    ORDER BY cp.veces_visto DESC LIMIT 15;
  `);
  if (numericos.length > 0) {
    console.log(`\n  ⚠ ${numericos.length}+ códigos puramente numéricos en la bandeja.`);
    console.log('    Pueden venir del número de línea del XML (defecto ya corregido en el parser).');
    console.log('    Si agrupan productos distintos, conviene descartarlos y recargar esas facturas:');
    for (const n of numericos.slice(0, 8)) {
      console.log(`    · "${n.codigo_proveedor}" — ${n.descripcion_proveedor} (${n.nombre_comercial}, ${n.veces_visto}×)`);
    }
  }

  console.log('\n=== Migración completada exitosamente ===');
  await sequelize.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('\n[ERROR]', err);
  process.exit(1);
});
