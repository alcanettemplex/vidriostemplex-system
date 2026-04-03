-- ─────────────────────────────────────────────────────────────────────────────
-- MÓDULO PEDIDOS PV — Vidrios Templex
-- Ejecutar en Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Campo en usuarios: solo Alejandro tendrá esto en true
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS puede_gestionar_pv BOOLEAN DEFAULT false;

-- 2. Tabla principal de pedidos PV
CREATE TABLE IF NOT EXISTS pedido_pv (
  id                       SERIAL PRIMARY KEY,
  numero_pedido            VARCHAR(20)    NOT NULL UNIQUE,   -- ej: "6733", "6733-A"
  numero_base              INTEGER        NOT NULL,           -- ej: 6733 (para el consecutivo)
  sufijo                   VARCHAR(5)     DEFAULT NULL,       -- NULL, 'A', 'B', 'C'...
  odp_id                   INTEGER        REFERENCES odp(id) ON DELETE SET NULL,
  proveedor                VARCHAR(100)   NOT NULL,
  creado_por               INTEGER        REFERENCES usuarios(id) ON DELETE SET NULL,
  estado                   VARCHAR(30)    NOT NULL DEFAULT 'PENDIENTE',
  -- Estados: PENDIENTE | ENVIADO | CONFIRMADO_PROVEEDOR | LLEGADO | VERIFICADO | PROBLEMA
  tuvo_problema            BOOLEAN        DEFAULT false,      -- rojo aunque vuelva a ENVIADO
  fecha_envio              DATE,
  hora_envio               TIME,
  confirmado_proveedor     BOOLEAN        DEFAULT false,
  fecha_entrega_prometida  DATE,
  fecha_llegada_real       DATE,
  dias_diferencia          INTEGER,                          -- negativo = llegó tarde
  metraje_venta            DECIMAL(8,2),
  espesor_vidrio           VARCHAR(100),                     -- "6MM", "8MM", "6+6", "GRIS HUMO"
  factura_pv               VARCHAR(100),
  observaciones            TEXT,
  alerta_enviada           BOOLEAN        DEFAULT false,     -- para no duplicar alertas
  verificado_por           INTEGER        REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha_verificacion       TIMESTAMP,
  observacion_verificacion TEXT,
  creado_en                TIMESTAMP      DEFAULT NOW()
);

-- 3. Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_pedido_pv_odp_id  ON pedido_pv(odp_id);
CREATE INDEX IF NOT EXISTS idx_pedido_pv_estado   ON pedido_pv(estado);
CREATE INDEX IF NOT EXISTS idx_pedido_pv_base     ON pedido_pv(numero_base);
CREATE INDEX IF NOT EXISTS idx_pedido_pv_prometida ON pedido_pv(fecha_entrega_prometida);
