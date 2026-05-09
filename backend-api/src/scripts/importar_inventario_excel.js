const XLSX = require('xlsx');
const { Client } = require('pg');
require('dotenv').config();

const ARCHIVO = 'C:\\Users\\User\\Downloads\\INVENTARIO PERFILERIA ACTUAL 2026.xlsx';
const HOJA    = 'INV 30 MAYO 2026';

(async () => {
  const wb   = XLSX.readFile(ARCHIVO);
  const ws   = wb.Sheets[HOJA];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

  // Fila 0 es la cabecera real ("CONS.", "CODIGO", ...) — saltar
  // Columnas: INVENTARIO MAYO 30 DE 2026 → consecutivo, __EMPTY → codigo, __EMPTY_4 → mm, __EMPTY_7 → ubicacion
  const registros = rows
    .slice(1) // skip header row
    .filter(r => r['INVENTARIO MAYO 30 DE 2026'] && r['__EMPTY']) // consecutivo y codigo presentes
    .map(r => ({
      consecutivo: Number(r['INVENTARIO MAYO 30 DE 2026']),
      codigo:      String(r['__EMPTY']).trim(),
      mm:          r['__EMPTY_4'] != null ? Number(r['__EMPTY_4']) : null,
      ubicacion:   r['__EMPTY_7'] ? String(r['__EMPTY_7']).trim() : null,
    }));

  console.log(`Registros válidos del Excel: ${registros.length}`);

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log('Conectado a BD.');

  let insertados = 0;
  let actualizados = 0;

  // Cargar consecutivos existentes en un Set para decidir INSERT vs UPDATE
  const { rows: existentes } = await client.query(
    `SELECT consecutivo, id FROM inventario_perfileria`,
  );
  const mapaExistentes = new Map(existentes.map(e => [e.consecutivo, e.id]));

  for (const r of registros) {
    const idExistente = mapaExistentes.get(r.consecutivo);
    if (idExistente) {
      await client.query(
        `UPDATE inventario_perfileria SET codigo=$1, mm=$2, ubicacion=$3 WHERE id=$4`,
        [r.codigo, r.mm, r.ubicacion, idExistente],
      );
      actualizados++;
    } else {
      await client.query(
        `INSERT INTO inventario_perfileria (consecutivo, codigo, mm, ubicacion) VALUES ($1,$2,$3,$4)`,
        [r.consecutivo, r.codigo, r.mm, r.ubicacion],
      );
      insertados++;
    }
  }

  console.log(`✅ Insertados: ${insertados} | Actualizados: ${actualizados} | Total: ${registros.length}`);
  await client.end();
  process.exit(0);
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
