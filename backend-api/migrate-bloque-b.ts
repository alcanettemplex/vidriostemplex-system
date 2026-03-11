import { Sequelize } from 'sequelize';
import * as dotenv from 'dotenv';
dotenv.config();

const sequelize = new Sequelize(process.env.DATABASE_URL as string, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false,
});

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('✅ DB connected');

    // Tabla SAP (Solicitud de Accesorios y Perfilería)
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS sap (
        id SERIAL PRIMARY KEY,
        numero_sap VARCHAR(30) UNIQUE NOT NULL,
        odp_id INTEGER NOT NULL REFERENCES odp(id) ON DELETE CASCADE,
        creado_por INTEGER REFERENCES usuarios(id),
        notas TEXT,
        estado VARCHAR(20) DEFAULT 'borrador',
        fecha_creacion TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Tabla sap creada');

    // Tabla SAP_ITEMS (ítems de la solicitud)
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS sap_items (
        id SERIAL PRIMARY KEY,
        sap_id INTEGER NOT NULL REFERENCES sap(id) ON DELETE CASCADE,
        descripcion VARCHAR(200) NOT NULL,
        referencia VARCHAR(100),
        color VARCHAR(80),
        cantidad DECIMAL(10,2) DEFAULT 1,
        unidad VARCHAR(20) DEFAULT 'und',
        observacion TEXT
      )
    `);
    console.log('✅ Tabla sap_items creada');

    // Tabla COT (Cotización)
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS cotizacion (
        id SERIAL PRIMARY KEY,
        numero_cot VARCHAR(30) UNIQUE NOT NULL,
        odp_id INTEGER NOT NULL REFERENCES odp(id) ON DELETE CASCADE,
        creado_por INTEGER REFERENCES usuarios(id),
        valor_total DECIMAL(12,2) DEFAULT 0,
        descuento DECIMAL(5,2) DEFAULT 0,
        forma_pago VARCHAR(100),
        validez_dias INTEGER DEFAULT 30,
        notas TEXT,
        estado VARCHAR(20) DEFAULT 'enviada',
        fecha_creacion TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Tabla cotizacion creada');

    // Tabla TM (Toma de Medidas)
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS toma_medidas (
        id SERIAL PRIMARY KEY,
        numero_tm VARCHAR(30) UNIQUE NOT NULL,
        odp_id INTEGER NOT NULL REFERENCES odp(id) ON DELETE CASCADE,
        realizado_por INTEGER REFERENCES usuarios(id),
        fecha_visita DATE,
        direccion VARCHAR(255),
        contacto_obra VARCHAR(100),
        telefono_obra VARCHAR(30),
        observaciones TEXT,
        medidas_json JSONB DEFAULT '[]',
        croquis_url VARCHAR(500),
        fecha_creacion TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Tabla toma_medidas creada');

    console.log('\n✅ Bloque B — Migración completada exitosamente');
    process.exit(0);
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

migrate();
