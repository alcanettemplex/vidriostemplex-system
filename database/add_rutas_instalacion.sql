-- ============================================================
-- Migración: Módulo de Rutas de Instalación
-- Reemplaza programacion_instalaciones por un modelo completo
-- ============================================================

-- 1. Agregar rol 'conductor' al enum de usuarios (si no existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'enum_usuarios_rol' AND e.enumlabel = 'conductor'
  ) THEN
    ALTER TYPE "enum_usuarios_rol" ADD VALUE 'conductor';
  END IF;
END
$$;

-- 2. Eliminar tabla antigua de programación (ya no se usa)
DROP TABLE IF EXISTS programacion_instalaciones CASCADE;

-- 3. Crear tabla de rutas de instalación
--    Una ruta agrupa múltiples ODPs para un vehículo/conductor
--    Puede abarcar varios días (cada ODP tiene su fecha_programada individual)
CREATE TABLE IF NOT EXISTS rutas_instalacion (
  id           SERIAL PRIMARY KEY,
  vehiculo_id  INT REFERENCES vehiculos(id) ON DELETE SET NULL,
  conductor_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_por   INT NOT NULL REFERENCES usuarios(id),
  estado       VARCHAR(20) NOT NULL DEFAULT 'programada'
               CHECK (estado IN ('programada', 'en_curso', 'completada', 'cancelada')),
  observaciones TEXT,
  creado_en    TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Crear tabla de asignación instaladores ↔ ruta (N:M)
CREATE TABLE IF NOT EXISTS ruta_instaladores (
  ruta_id       INT NOT NULL REFERENCES rutas_instalacion(id) ON DELETE CASCADE,
  instalador_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  PRIMARY KEY (ruta_id, instalador_id)
);

-- 5. Crear tabla de ODPs dentro de cada ruta
--    Cada entrada tiene su propio orden, fecha y timestamps de ejecución
CREATE TABLE IF NOT EXISTS ruta_odp (
  id                  SERIAL PRIMARY KEY,
  ruta_id             INT NOT NULL REFERENCES rutas_instalacion(id) ON DELETE CASCADE,
  odp_id              INT NOT NULL REFERENCES odp(id) ON DELETE CASCADE,
  orden               INT NOT NULL DEFAULT 1,
  fecha_programada    DATE NOT NULL,
  inicio_instalacion  TIMESTAMPTZ,           -- cuando instalador presiona "Iniciar"
  fin_instalacion     TIMESTAMPTZ,           -- cuando instalador presiona "Finalizar"
  estado              VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente', 'en_curso', 'completada')),
  datos_receptor      VARCHAR(300),          -- "Nombre Apellido - 12345678"
  firma_receptor      TEXT,                  -- base64 de la firma en canvas
  foto_evidencia_url  VARCHAR(500),          -- URL Cloudinary de la foto de entrega
  gps_finalizacion    VARCHAR(100),          -- "lat,lng" al finalizar
  UNIQUE (ruta_id, odp_id)
);

-- 6. Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_rutas_estado       ON rutas_instalacion(estado);
CREATE INDEX IF NOT EXISTS idx_rutas_conductor    ON rutas_instalacion(conductor_id);
CREATE INDEX IF NOT EXISTS idx_ruta_inst_instal   ON ruta_instaladores(instalador_id);
CREATE INDEX IF NOT EXISTS idx_ruta_odp_ruta      ON ruta_odp(ruta_id);
CREATE INDEX IF NOT EXISTS idx_ruta_odp_odp       ON ruta_odp(odp_id);
CREATE INDEX IF NOT EXISTS idx_ruta_odp_estado    ON ruta_odp(estado);
CREATE INDEX IF NOT EXISTS idx_ruta_odp_fecha     ON ruta_odp(fecha_programada);
