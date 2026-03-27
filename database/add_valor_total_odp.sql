-- Migración: agregar columna valor_total a la tabla odp
-- Ejecutar una sola vez en la base de datos de producción (Supabase)

ALTER TABLE odp
ADD COLUMN IF NOT EXISTS valor_total DECIMAL(12, 2) DEFAULT 0;
