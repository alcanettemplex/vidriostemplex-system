/**
 * Script one-off: importar clientes desde documentation/Clientes_Limpio.xlsx
 *
 * Mapeo de columnas:
 *   Numero Doc.          → numero_documento
 *   Tipo Doc.            → tipo_documento  (C.C→CC, NIT→NIT, C.E→CE, PPT→PPT)
 *   Nombre / Razón Social→ nombre_razon_social
 *   Segmento             → segmento (Tercero/No Aplica → Intervid)
 *   Dirección            → direccion
 *   Teléfonos            → telefono
 *   Móvil                → celular
 *   correo Fact. Elect.  → email
 *
 * Comportamiento:
 *   - Si numero_documento ya existe → skip
 *   - Registros sin teléfono → incluir igual
 *   - condicion_pago = 'CONTADO', creado_por = 30 (root)
 *
 * Ejecutar: npx ts-node src/scripts/importar_clientes_excel.ts
 */

import * as XLSX from 'xlsx';
import path from 'path';
import sequelize from '../config/database';
import '../models'; // cargar asociaciones

// Importar modelo directamente para evitar conflictos de inicialización
const { Cliente } = require('../models');

// ─── Mapeo tipo documento ────────────────────────────────────────────────────
const mapTipoDoc = (raw: string | null | undefined): string => {
  if (!raw) return 'CC';
  const v = String(raw).trim().toUpperCase().replace(/\./g, '');
  if (v === 'CC' || v === 'C C') return 'CC';
  if (v === 'NIT') return 'NIT';
  if (v === 'CE' || v === 'C E') return 'CE';
  if (v === 'PPT') return 'PPT';
  return v.substring(0, 20); // fallback
};

// ─── Mapeo segmento ──────────────────────────────────────────────────────────
const mapSegmento = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const v = String(raw).trim();
  if (v === 'Tercero' || v === 'No Aplica') return 'Intervid';
  const validos = ['Institucional', 'Industrial', 'Arquitecto', 'Intervid', 'Cliente Final', 'Cliente final'];
  const encontrado = validos.find(s => s.toLowerCase() === v.toLowerCase());
  return encontrado || v;
};

// ─── Limpiar string ──────────────────────────────────────────────────────────
const limpiar = (val: any): string | null => {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
};

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log(' Importación de Clientes — Vidrios Templex');
  console.log('═══════════════════════════════════════════════════');

  // Conectar a BD
  try {
    await sequelize.authenticate();
    console.log('✓ Conexión a BD establecida');
  } catch (err) {
    console.error('✗ Error conectando a BD:', err);
    process.exit(1);
  }

  // Leer Excel
  const excelPath = path.resolve(__dirname, '../../../documentation/Clientes_Limpio.xlsx');
  console.log(`\n📂 Leyendo: ${excelPath}`);

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.readFile(excelPath);
  } catch (err) {
    console.error('✗ No se pudo leer el archivo Excel:', err);
    process.exit(1);
  }

  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Verificar cabeceras
  const headers: string[] = (rows[0] || []).map((h: any) => String(h || '').trim());
  console.log(`\n📋 Cabeceras detectadas: ${JSON.stringify(headers)}`);
  console.log(`📊 Total filas (sin cabecera): ${rows.length - 1}`);

  // Obtener documentos ya existentes en BD para skip
  const existentes = await Cliente.findAll({ attributes: ['numero_documento'] });
  const setExistentes = new Set<string>(
    existentes.map((c: any) => String(c.getDataValue('numero_documento') || '').trim())
  );
  console.log(`\n🔎 Clientes ya en BD: ${setExistentes.size}`);

  // Procesar filas
  const registros: any[] = [];
  let omitidos = 0;
  let errores = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c: any) => c === null || c === '')) continue;

    const numeroDoc = limpiar(row[0]);
    if (!numeroDoc) { errores++; continue; } // sin documento → skip

    // Skip si ya existe
    if (setExistentes.has(numeroDoc)) { omitidos++; continue; }

    const truncate = (val: string | null, max: number): string | null =>
      val && val.length > max ? val.substring(0, max) : val;

    const registro = {
      numero_documento:    truncate(numeroDoc, 30),
      tipo_documento:      truncate(mapTipoDoc(limpiar(row[1])), 20),
      nombre_razon_social: truncate(limpiar(row[2]) || 'SIN NOMBRE', 100),
      segmento:            truncate(mapSegmento(limpiar(row[3])), 50),
      direccion:           truncate(limpiar(row[4]), 200),
      telefono:            truncate(limpiar(row[5]), 20),
      celular:             truncate(limpiar(row[6]), 20),
      email:               truncate(limpiar(row[7]), 100),
      condicion_pago:      'CONTADO',
      creado_por:          30,
    };

    registros.push(registro);
  }

  console.log(`\n📥 Registros a insertar: ${registros.length}`);
  console.log(`⏭  Omitidos (ya existen): ${omitidos}`);
  console.log(`⚠️  Filas con error (sin doc): ${errores}`);

  if (registros.length === 0) {
    console.log('\n✓ Nada que insertar. Proceso finalizado.');
    await sequelize.close();
    return;
  }

  // Insertar en lotes de 100
  const LOTE = 100;
  let insertados = 0;
  let erroresInsert = 0;

  for (let i = 0; i < registros.length; i += LOTE) {
    const lote = registros.slice(i, i + LOTE);
    try {
      await Cliente.bulkCreate(lote, {
        ignoreDuplicates: true,
        validate: false,
      });
      insertados += lote.length;
      process.stdout.write(`\r  Progreso: ${insertados}/${registros.length} insertados...`);
    } catch (err: any) {
      console.error(`\n✗ Error en lote ${i / LOTE + 1}:`, err.message);
      erroresInsert += lote.length;
    }
  }

  console.log('\n');
  console.log('═══════════════════════════════════════════════════');
  console.log(` RESULTADO FINAL`);
  console.log('═══════════════════════════════════════════════════');
  console.log(` ✓ Insertados:          ${insertados}`);
  console.log(` ⏭  Omitidos (dup BD):  ${omitidos}`);
  console.log(` ⚠️  Filas inválidas:    ${errores}`);
  console.log(` ✗ Errores de insert:  ${erroresInsert}`);
  console.log('═══════════════════════════════════════════════════');

  await sequelize.close();
  console.log('\n✓ Conexión cerrada. Script finalizado.');
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
