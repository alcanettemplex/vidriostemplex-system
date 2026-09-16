/**
 * Script: 2026-09-16_leer_excel_homologacion_cotizador.ts
 *
 * Solo lectura: no toca la BD. Lee el Excel que el usuario llenó a mano
 * (columnas "accion" / "codigo_homologo") a partir de
 * 2026-09-14_exportar_codigos_huerfanos_cotizador.ts, y resume las
 * decisiones para poder construir la Fase 2 (aplicar) con seguridad:
 *   - conteo por valor de "accion" (incluyendo vacíos / valores fuera de lista)
 *   - para HOMOLOGAR: valida que "codigo_homologo" exista en catalogo_productos
 *   - detecta códigos del Cotizador que apuntarían al mismo codigo_homologo
 *   - detecta filas HOMOLOGAR sin codigo_homologo, o con codigo_homologo pero
 *     accion distinta de HOMOLOGAR
 *
 * Uso:
 *   DOTENV_CONFIG_PATH=backend-api/.env ./backend-api/node_modules/.bin/ts-node \
 *     backend-api/src/scripts/2026-09-16_leer_excel_homologacion_cotizador.ts [--archivo="C:\ruta\archivo.xlsx"]
 */
import * as os from 'os';
import * as path from 'path';
import ExcelJS from 'exceljs';
import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';

interface FilaExcel {
  codigo: string;
  descripcion: string;
  accion: string;
  codigo_homologo: string;
}

function rutaArchivo(): string {
  const arg = process.argv.find((a) => a.startsWith('--archivo='));
  if (arg) return arg.slice('--archivo='.length).replace(/^"|"$/g, '');
  return path.join(os.homedir(), 'Downloads', 'cotizador_codigos_huerfanos_2026-09-14.xlsx');
}

async function main(): Promise<void> {
  const archivo = rutaArchivo();
  console.log(`Leyendo: ${archivo}\n`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(archivo);
  const ws = wb.worksheets[0];

  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? '').trim();
  });
  const idx = {
    codigo: headers.indexOf('codigo'),
    descripcion: headers.indexOf('descripcion'),
    accion: headers.indexOf('accion'),
    codigo_homologo: headers.indexOf('codigo_homologo'),
  };
  for (const [k, v] of Object.entries(idx)) {
    if (v === -1) throw new Error(`No se encontró la columna "${k}" en el Excel`);
  }

  const filas: FilaExcel[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const get = (col: number): string => String(row.getCell(col).value ?? '').trim();
    const codigo = get(idx.codigo);
    if (!codigo) return;
    filas.push({
      codigo,
      descripcion: get(idx.descripcion),
      accion: get(idx.accion).toUpperCase(),
      codigo_homologo: get(idx.codigo_homologo),
    });
  });

  console.log(`Total filas con código: ${filas.length}\n`);

  const conteo = new Map<string, number>();
  for (const f of filas) {
    const clave = f.accion || '(vacío)';
    conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
  }
  console.log('--- Conteo por acción ---');
  for (const [k, v] of conteo.entries()) console.log(`  ${k}: ${v}`);

  const OPCIONES_VALIDAS = new Set(['HOMOLOGAR', 'ALTA_NUEVA', 'IGNORAR']);
  const accionInvalida = filas.filter((f) => f.accion && !OPCIONES_VALIDAS.has(f.accion));
  if (accionInvalida.length > 0) {
    console.log(`\n⚠ ${accionInvalida.length} fila(s) con "accion" fuera de la lista permitida:`);
    for (const f of accionInvalida) console.log(`  - ${f.codigo}: accion="${f.accion}"`);
  }

  // El usuario confirmó que la señal real es la columna "codigo_homologo"
  // (columna M), no "accion" — muchas filas quedaron con accion en blanco
  // pero codigo_homologo lleno. Se trata como HOMOLOGAR toda fila con
  // codigo_homologo no vacío, sin importar accion.
  const homologar = filas.filter((f) => f.codigo_homologo);
  const accionInconsistente = homologar.filter((f) => f.accion && f.accion !== 'HOMOLOGAR');
  if (accionInconsistente.length > 0) {
    console.log(
      `\n⚠ ${accionInconsistente.length} fila(s) con codigo_homologo lleno pero accion≠HOMOLOGAR (revisar intención):`
    );
    for (const f of accionInconsistente) {
      console.log(`  - ${f.codigo}: accion="${f.accion}" codigo_homologo="${f.codigo_homologo}"`);
    }
  }
  const sinDecision = filas.filter((f) => !f.codigo_homologo && !f.accion);
  console.log(`\nFilas sin codigo_homologo ni accion (sin decisión todavía): ${sinDecision.length}`);
  const soloAccionSinCodigo = filas.filter((f) => !f.codigo_homologo && f.accion && f.accion !== 'HOMOLOGAR');
  if (soloAccionSinCodigo.length > 0) {
    console.log(`\n--- Filas con accion definida (${soloAccionSinCodigo.length}), sin codigo_homologo ---`);
    for (const f of soloAccionSinCodigo) console.log(`  - ${f.codigo}: accion="${f.accion}"`);
  }

  // Duplicados: varios códigos del Cotizador apuntando al mismo codigo_homologo
  const porDestino = new Map<string, string[]>();
  for (const f of homologar) {
    if (!f.codigo_homologo) continue;
    const arr = porDestino.get(f.codigo_homologo) ?? [];
    arr.push(f.codigo);
    porDestino.set(f.codigo_homologo, arr);
  }
  const destinosDuplicados = [...porDestino.entries()].filter(([, v]) => v.length > 1);
  if (destinosDuplicados.length > 0) {
    console.log(`\n⚠ ${destinosDuplicados.length} codigo_homologo con más de un código de Cotizador apuntándole:`);
    for (const [destino, origenes] of destinosDuplicados) {
      console.log(`  - ${destino} <- ${origenes.join(', ')}`);
    }
  }

  // Validar contra catalogo_productos real
  await sequelize.authenticate();
  const codigosHomologo = [...new Set(homologar.map((f) => f.codigo_homologo).filter(Boolean))];
  let existentes = new Set<string>();
  if (codigosHomologo.length > 0) {
    const filasCatalogo = await sequelize.query<{ codigo: string }>(
      `SELECT codigo FROM public.catalogo_productos WHERE codigo IN (:codigos)`,
      { type: QueryTypes.SELECT, replacements: { codigos: codigosHomologo } }
    );
    existentes = new Set(filasCatalogo.map((f) => f.codigo));
  }
  const noExisten = codigosHomologo.filter((c) => !existentes.has(c));
  if (noExisten.length > 0) {
    console.log(`\n⚠ ${noExisten.length} codigo_homologo que NO existen en catalogo_productos:`);
    for (const c of noExisten) console.log(`  - ${c}`);
  } else if (codigosHomologo.length > 0) {
    console.log(`\n✓ Los ${codigosHomologo.length} codigo_homologo únicos existen en catalogo_productos`);
  }

  await sequelize.close();
}

main().catch(async (err) => {
  console.error('\nEl script terminó con error:', err);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
