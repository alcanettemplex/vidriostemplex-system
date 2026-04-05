import sequelize from './src/config/database';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

const alter_statements = [
  // Prospectos
  'ALTER TABLE prospectos ADD COLUMN IF NOT EXISTS numero_cotizacion VARCHAR(50);',
  'ALTER TABLE prospectos ADD COLUMN IF NOT EXISTS odp_id INTEGER;',

  // Toma Medidas
  'ALTER TABLE toma_medidas ADD COLUMN IF NOT EXISTS odp_id INTEGER;',
  'ALTER TABLE toma_medidas ADD COLUMN IF NOT EXISTS prospecto_id INTEGER;',

  // ODP
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS numero_cotizacion VARCHAR(50);',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS factura_electronica VARCHAR(100);',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS fecha_factura TIMESTAMP;',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS url_documento_factura VARCHAR(255);',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS autorizacion_especial_despacho BOOLEAN DEFAULT false;',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS observacion_autorizacion TEXT;',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS croquis_url VARCHAR(255);',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS matizado BOOLEAN DEFAULT false;',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS pelicula BOOLEAN DEFAULT false;',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS acarreo BOOLEAN DEFAULT false;',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS instalacion BOOLEAN DEFAULT false;',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS huacal BOOLEAN DEFAULT false;',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS carton BOOLEAN DEFAULT false;',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS foto_instalacion_url VARCHAR(1000);',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS proveedor_vidrio VARCHAR(100);',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS numero_pedido_proveedor VARCHAR(100);',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS chk_medicion BOOLEAN DEFAULT false;',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS chk_corte BOOLEAN DEFAULT false;',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS chk_vidrio BOOLEAN DEFAULT false;',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS chk_accesorios BOOLEAN DEFAULT false;',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS fecha_chk_accesorios DATE;',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS chk_ensamble BOOLEAN DEFAULT false;',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS chk_matizado BOOLEAN DEFAULT false;',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS chk_pelicula BOOLEAN DEFAULT false;',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS chk_huacal BOOLEAN DEFAULT false;',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS chk_carton BOOLEAN DEFAULT false;',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS es_no_conformidad BOOLEAN DEFAULT false;',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS odp_padre_id INTEGER;',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS tiene_aluminio BOOLEAN DEFAULT false;',
  'ALTER TABLE odp ADD COLUMN IF NOT EXISTS fecha_vencimiento_credito DATE;'
];

async function fix() {
  for (const q of alter_statements) {
    try {
      await sequelize.query(q);
      console.log('Executed:', q);
    } catch(e: any) {
      console.log('Error on:', q, e.message);
    }
  }
  process.exit(0);
}
fix();
