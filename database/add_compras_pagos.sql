-- Migración: Agregar tablas de órdenes de compra y pagos
-- PostgreSQL / Supabase

CREATE TABLE IF NOT EXISTS ordenes_compra (
  id SERIAL PRIMARY KEY,
  odp_id INT REFERENCES odp(id) ON DELETE SET NULL,
  proveedor VARCHAR(100) NOT NULL,
  odc VARCHAR(30) NOT NULL,
  descripcion TEXT,
  monto NUMERIC(12,2) DEFAULT 0,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'en_transito', 'recibido', 'problema')),
  fecha_entrega DATE,
  creado_por INT NOT NULL REFERENCES usuarios(id),
  fecha_creacion TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pagos (
  id SERIAL PRIMARY KEY,
  odp_id INT NOT NULL REFERENCES odp(id) ON DELETE CASCADE,
  monto NUMERIC(12,2) NOT NULL,
  metodo_pago VARCHAR(50) NOT NULL,
  referencia_pago VARCHAR(100),
  observaciones TEXT,
  registrado_por INT NOT NULL REFERENCES usuarios(id),
  fecha TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_odp ON ordenes_compra(odp_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_estado ON ordenes_compra(estado);
CREATE INDEX IF NOT EXISTS idx_pagos_odp ON pagos(odp_id);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON pagos(fecha);

-- Migración: columnas und y exist_perf en sap_items (2026-03-29)
ALTER TABLE sap_items ADD COLUMN IF NOT EXISTS und VARCHAR(20);
ALTER TABLE sap_items ADD COLUMN IF NOT EXISTS exist_perf VARCHAR(100);

-- Migración: fecha de confirmación de accesorios en ODP (2026-03-29)
ALTER TABLE odp ADD COLUMN IF NOT EXISTS fecha_chk_accesorios DATE;
