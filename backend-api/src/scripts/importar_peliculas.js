const XLSX = require('xlsx');
const { Client } = require('pg');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const FILE = 'C:/Users/User/Downloads/Documentos/Hojas de Calculo/Películas.xlsx';
const CATEGORIA = 'Películas';

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const wb = XLSX.readFile(FILE);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  // Columnas: LOG0101 = codigo, 'LOGO PLOTER DE CORTE' = nombre
  const productos = rows
    .map(r => ({
      codigo: String(r['LOG0101']).trim(),
      nombre: String(r['LOGO PLOTER DE CORTE']).trim(),
    }))
    .filter(p => p.codigo && p.nombre);

  console.log(`Productos a importar: ${productos.length}`);

  await client.connect();
  console.log('Conectado a BD...\n');

  let insertados = 0;
  let omitidos = 0;

  for (const p of productos) {
    const exists = await client.query(
      'SELECT id FROM catalogo_productos WHERE codigo = $1',
      [p.codigo]
    );
    if (exists.rows.length > 0) {
      console.log(`  ⏭  Omitido (ya existe): ${p.codigo} — ${p.nombre}`);
      omitidos++;
      continue;
    }
    await client.query(
      `INSERT INTO catalogo_productos (codigo, nombre, categoria, activo, es_aluminio)
       VALUES ($1, $2, $3, true, false)`,
      [p.codigo, p.nombre, CATEGORIA]
    );
    console.log(`  ✅ Insertado: ${p.codigo} — ${p.nombre}`);
    insertados++;
  }

  console.log(`\nResumen: ${insertados} insertados, ${omitidos} omitidos`);
  await client.end();
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
