/**
 * Script: 2026_08_23_create_proveedores.ts
 * Propósito: Crear las 5 tablas nuevas del módulo de Proveedores y aplicar
 *            los ALTER TABLE necesarios sobre catalogo_productos y configuracion_global.
 * Ejecutar: ts-node src/scripts/2026_08_23_create_proveedores.ts
 * IMPORTANTE: Solo correr una vez. Usa IF NOT EXISTS — es idempotente.
 */

import sequelize from '../config/database';

async function run() {
  const q = sequelize.getQueryInterface();

  console.log('=== Módulo Proveedores — Migración 2026-08-23 ===\n');

  // ─── 1. Tabla proveedores ──────────────────────────────────────────────────
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS proveedores (
      id                    SERIAL PRIMARY KEY,
      nit                   VARCHAR(20)  UNIQUE,
      nombre_comercial      VARCHAR(255) NOT NULL,
      razon_social          VARCHAR(255),
      contacto_nombre       VARCHAR(150),
      telefono              VARCHAR(30),
      email                 VARCHAR(150),
      direccion             TEXT,
      notas                 TEXT,
      activo                BOOLEAN      NOT NULL DEFAULT true,
      codigo_world_office   VARCHAR(50),
      tipo_identificacion   VARCHAR(20)  NOT NULL DEFAULT 'NIT',
      numero_identificacion VARCHAR(30),
      fecha_creacion        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
  `);
  console.log('[OK] proveedores');

  // ─── 2. Tabla proveedor_producto ───────────────────────────────────────────
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS proveedor_producto (
      id                    SERIAL PRIMARY KEY,
      proveedor_id          INTEGER      NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
      catalogo_producto_id  INTEGER      NOT NULL REFERENCES catalogo_productos(id) ON DELETE CASCADE,
      codigo_proveedor      VARCHAR(100),
      descripcion_proveedor TEXT,
      unidad_compra         VARCHAR(20)  NOT NULL DEFAULT 'UNIDAD',
      metros_por_unidad     DECIMAL(5,2) NOT NULL DEFAULT 6,
      precio_actual         DECIMAL(15,2),
      fecha_precio_actual   DATE,
      precio_anterior_1     DECIMAL(15,2),
      fecha_anterior_1      DATE,
      precio_anterior_2     DECIMAL(15,2),
      fecha_anterior_2      DATE,
      activo                BOOLEAN      NOT NULL DEFAULT true,
      CONSTRAINT uq_proveedor_producto_modalidad
        UNIQUE (proveedor_id, catalogo_producto_id, unidad_compra)
    );
  `);
  console.log('[OK] proveedor_producto');

  // ─── 3. Tabla proveedor_producto_precio (histórico) ────────────────────────
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS proveedor_producto_precio (
      id                    SERIAL PRIMARY KEY,
      proveedor_producto_id INTEGER      NOT NULL REFERENCES proveedor_producto(id) ON DELETE CASCADE,
      precio                DECIMAL(15,2) NOT NULL,
      fecha_vigencia        DATE         NOT NULL,
      origen                VARCHAR(20)  NOT NULL DEFAULT 'MANUAL',
      documento_ref         VARCHAR(100),
      registrado_por        INTEGER      REFERENCES usuarios(id) ON DELETE SET NULL,
      precio_anomalo        BOOLEAN      NOT NULL DEFAULT false,
      variacion_pct         DECIMAL(8,2),
      fecha_registro        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
  `);
  console.log('[OK] proveedor_producto_precio');

  // ─── 4. Tabla proveedor_codigo_pendiente (bandeja sin mapear) ─────────────
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS proveedor_codigo_pendiente (
      id                   SERIAL PRIMARY KEY,
      proveedor_id         INTEGER      NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
      codigo_proveedor     VARCHAR(100) NOT NULL,
      descripcion_proveedor TEXT,
      precio_detectado     DECIMAL(15,2),
      documento_ref        VARCHAR(100),
      veces_visto          INTEGER      NOT NULL DEFAULT 1,
      estado               VARCHAR(20)  NOT NULL DEFAULT 'PENDIENTE',
      fecha_deteccion      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_proveedor_codigo UNIQUE (proveedor_id, codigo_proveedor)
    );
  `);
  console.log('[OK] proveedor_codigo_pendiente');

  // ─── 5. Tabla producto_alias (diccionario de sinónimos) ───────────────────
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS producto_alias (
      id                   SERIAL PRIMARY KEY,
      catalogo_producto_id INTEGER      NOT NULL REFERENCES catalogo_productos(id) ON DELETE CASCADE,
      alias                VARCHAR(255) NOT NULL,
      origen               VARCHAR(20)  NOT NULL DEFAULT 'PROVEEDOR',
      proveedor_id         INTEGER      REFERENCES proveedores(id) ON DELETE SET NULL,
      fecha_registro       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_producto_alias UNIQUE (catalogo_producto_id, alias)
    );
  `);
  console.log('[OK] producto_alias');

  // ─── 6. ALTER TABLE catalogo_productos ────────────────────────────────────
  await sequelize.query(`
    ALTER TABLE catalogo_productos
      ADD COLUMN IF NOT EXISTS unidad_medida  VARCHAR(30),
      ADD COLUMN IF NOT EXISTS porcentaje_iva INTEGER NOT NULL DEFAULT 19;
  `);
  console.log('[OK] catalogo_productos — columnas unidad_medida, porcentaje_iva agregadas');

  // ─── 7. ALTER TABLE configuracion_global ──────────────────────────────────
  await sequelize.query(`
    ALTER TABLE configuracion_global
      ADD COLUMN IF NOT EXISTS umbral_variacion_precio_pct INTEGER NOT NULL DEFAULT 30;
  `);
  console.log('[OK] configuracion_global — columna umbral_variacion_precio_pct agregada');

  // ─── 8. Índices de rendimiento ────────────────────────────────────────────
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_proveedor_producto_catalogo
      ON proveedor_producto (catalogo_producto_id);
    CREATE INDEX IF NOT EXISTS idx_proveedor_producto_precio_pp
      ON proveedor_producto_precio (proveedor_producto_id);
    CREATE INDEX IF NOT EXISTS idx_codigo_pendiente_estado
      ON proveedor_codigo_pendiente (estado, veces_visto DESC);
    CREATE INDEX IF NOT EXISTS idx_producto_alias_catalogo
      ON producto_alias (catalogo_producto_id);
  `);
  console.log('[OK] Índices creados');

  console.log('\n=== Migración completada exitosamente ===');
  process.exit(0);
}

run().catch((err) => {
  console.error('\n[ERROR]', err);
  process.exit(1);
});
