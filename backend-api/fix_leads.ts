import { Sequelize } from 'sequelize';
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL!, {
  dialect: 'postgres',
  dialectOptions: { ssl: { rejectUnauthorized: false } },
  logging: true,
});

const sql = `
DO $$ 
BEGIN 
    -- 1. Crear tipos ENUM si no existen
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_leads_fuente_lead') THEN
        CREATE TYPE "enum_leads_fuente_lead" AS ENUM('Web', 'Facebook', 'Instagram', 'Llamada', 'Presencial', 'Otro');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_leads_respondio') THEN
        CREATE TYPE "enum_leads_respondio" AS ENUM('Espera de información', 'No responde', 'Si');
    END IF;

    -- 2. Añadir columnas a la tabla leads
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='fuente_lead') THEN
        ALTER TABLE leads ADD COLUMN fuente_lead "enum_leads_fuente_lead" DEFAULT 'Presencial';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='respondio') THEN
        ALTER TABLE leads ADD COLUMN respondio "enum_leads_respondio" DEFAULT 'Espera de información';
    END IF;

    -- 3. Asegurar que las fechas de transición existan
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='fecha_asignado') THEN
        ALTER TABLE leads ADD COLUMN fecha_asignado TIMESTAMP WITH TIME ZONE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='fecha_en_contacto') THEN
        ALTER TABLE leads ADD COLUMN fecha_en_contacto TIMESTAMP WITH TIME ZONE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='fecha_cotizando') THEN
        ALTER TABLE leads ADD COLUMN fecha_cotizando TIMESTAMP WITH TIME ZONE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='fecha_visita_tecnica') THEN
        ALTER TABLE leads ADD COLUMN fecha_visita_tecnica TIMESTAMP WITH TIME ZONE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='fecha_frio') THEN
        ALTER TABLE leads ADD COLUMN fecha_frio TIMESTAMP WITH TIME ZONE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='fecha_aprobado') THEN
        ALTER TABLE leads ADD COLUMN fecha_aprobado TIMESTAMP WITH TIME ZONE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='fecha_perdido') THEN
        ALTER TABLE leads ADD COLUMN fecha_perdido TIMESTAMP WITH TIME ZONE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='monto_real_venta') THEN
        ALTER TABLE leads ADD COLUMN monto_real_venta DECIMAL(12,2) DEFAULT 0;
    END IF;

END $$;
`;

(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Conexión establecida con la DB correcta.');
    await sequelize.query(sql);
    console.log('✅ Columnas de leads actualizadas/verificadas.');
    await sequelize.close();
  } catch (err: any) {
    console.error('❌ ERROR ejecutando parche:', err.message);
    process.exit(1);
  }
})();
