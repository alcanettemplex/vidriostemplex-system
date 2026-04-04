-- ============================================================
-- SETUP MÓDULO ROOT — Vidrios Templex
-- Ejecutar en: Supabase → SQL Editor
-- ============================================================

-- 1. TABLA auditoria_log
-- ============================================================
CREATE TABLE IF NOT EXISTS auditoria_log (
  id            BIGSERIAL PRIMARY KEY,
  tabla         VARCHAR(100)  NOT NULL,
  operacion     VARCHAR(10)   NOT NULL,   -- INSERT | UPDATE | DELETE
  registro_id   VARCHAR(100),
  datos_anteriores JSONB,
  datos_nuevos     JSONB,
  usuario_id    INTEGER,
  usuario_nombre VARCHAR(200),
  ip_address    VARCHAR(50),
  fecha         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_tabla    ON auditoria_log (tabla);
CREATE INDEX IF NOT EXISTS idx_audit_fecha    ON auditoria_log (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_audit_usuario  ON auditoria_log (usuario_id);
CREATE INDEX IF NOT EXISTS idx_audit_operacion ON auditoria_log (operacion);


-- 2. TABLA alertas_umbral
-- ============================================================
CREATE TABLE IF NOT EXISTS alertas_umbral (
  id          SERIAL PRIMARY KEY,
  clave       VARCHAR(100) NOT NULL UNIQUE,
  nombre      VARCHAR(200) NOT NULL,
  descripcion TEXT,
  valor       FLOAT        NOT NULL DEFAULT 80,
  unidad      VARCHAR(20)  NOT NULL DEFAULT '%',
  activo      BOOLEAN      NOT NULL DEFAULT TRUE
);

-- Valores predeterminados de umbrales
INSERT INTO alertas_umbral (clave, nombre, descripcion, valor, unidad, activo) VALUES
  ('db_storage_pct',      'BD: Almacenamiento',           'Alertar cuando el uso de BD supere este % del límite Supabase Free (500 MB)',      80, '%',  TRUE),
  ('db_connections_pct',  'BD: Conexiones activas',        'Alertar cuando las conexiones superen este % del límite (60 conexiones Free)',       75, '%',  TRUE),
  ('cloud_storage_pct',   'Cloudinary: Almacenamiento',    'Alertar cuando el storage de Cloudinary supere este % del plan Free (25 GB)',        80, '%',  TRUE),
  ('cloud_bandwidth_pct', 'Cloudinary: Ancho de banda',    'Alertar cuando el bandwidth mensual supere este % del límite Free (25 GB)',          80, '%',  TRUE),
  ('cloud_transform_pct', 'Cloudinary: Transformaciones',  'Alertar cuando las transformaciones superen este % del límite Free (25 000/mes)',    85, '%',  TRUE),
  ('audit_retention_days','Auditoría: Retención de logs',  'Días máximos de retención de logs en auditoria_log antes de limpieza manual',      180, 'días', TRUE)
ON CONFLICT (clave) DO NOTHING;


-- 3. EXTENDER ENUM rol PARA INCLUIR 'root'
-- ============================================================
-- El ENUM en PostgreSQL no acepta ALTER TYPE dentro de una transacción
-- con otras DDL, por eso se hace por separado si ya existe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_usuarios_rol')
      AND enumlabel = 'root'
  ) THEN
    ALTER TYPE "enum_usuarios_rol" ADD VALUE 'root' BEFORE 'admin';
  END IF;
END$$;


-- 4. USUARIO ROOT
-- ============================================================
-- Contraseña: Rootlinux  (hash bcrypt $2b$12$...)
INSERT INTO usuarios (
  nombre_completo,
  username,
  email,
  password_hash,
  rol,
  activo,
  puede_gestionar_pv
) VALUES (
  'ROOT System',
  'ROOT',
  'root@vidriotemplex.local',
  '$2b$12$SQRH7bkd2atP32PO9Gu.HORoVBsaoiLyO3EWrg4q8LP9z/5Klysia',
  'root',
  TRUE,
  FALSE
)
ON CONFLICT (username) DO NOTHING;


-- ============================================================
-- FIN DEL SCRIPT
-- ============================================================
-- Después de ejecutar este SQL:
-- 1. Reinicia el backend (para que Sequelize sincronice los nuevos modelos)
-- 2. Inicia sesión con usuario: ROOT  /  clave: Rootlinux
-- 3. Verás el ítem "ROOT" en la sección "Sistema" del sidebar
-- ============================================================
