/**
 * Script: 2026-09-16_cotizador_aplicar_homologacion.ts
 *
 * Fase 2 de la reconciliación de códigos huérfanos del Cotizador (Fase 1:
 * 2026-09-14_exportar_codigos_huerfanos_cotizador.ts). Lee el Excel que el usuario llenó
 * a mano en la columna "codigo_homologo" (columna M) y aplica esas decisiones:
 * `cotizador.producto.catalogo_producto_id = catalogo_productos.id` por código.
 *
 * La señal real es "codigo_homologo" no vacío — la columna "accion" quedó casi toda en
 * blanco (confirmado con el usuario el 2026-09-16), así que NO se filtra por accion.
 *
 * De 181 códigos huérfanos, 111 tienen codigo_homologo decidido hoy; 70 quedan
 * pendientes para una ronda futura (no se tocan). De esos 111, todos los codigo_homologo
 * ya existen en catalogo_productos — 12 códigos nuevos se dieron de alta en Supabase en
 * esta misma sesión (BPB05, DIAMBPB, BOQN02, PERF01, PERF03, PERF04, BOQE01, BOQE03,
 * 1BPB07, MATI09, PERF02) y se corrigieron 3 filas del Excel con datos cruzados/typo
 * (BOQN03→BOQE03, MATI08→MATI07, MATI09→MATI09, RDU0102→RSDCF02).
 *
 * Salvaguardas:
 *   - Solo actualiza filas con catalogo_producto_id actualmente NULL (no pisa vínculos
 *     ya existentes, sea por el backfill automático de la Fase 0 o por una corrida previa
 *     de este mismo script).
 *   - Si un código del Excel no existe en cotizador.producto, o su codigo_homologo no
 *     existe en catalogo_productos, se reporta y se excluye — no aborta el resto.
 *   - Idempotente: correrlo de nuevo no vuelve a tocar las filas ya vinculadas.
 *
 * Uso:
 *   DOTENV_CONFIG_PATH=backend-api/.env ./backend-api/node_modules/.bin/ts-node \
 *     -r ./backend-api/node_modules/dotenv/config \
 *     backend-api/src/scripts/2026-09-16_cotizador_aplicar_homologacion.ts [--archivo="C:\ruta\archivo.xlsx"]
 */
import * as os from 'os';
import * as path from 'path';
import ExcelJS from 'exceljs';
import { sequelize, CotizadorProducto, CatalogoProducto } from '../models';
import { requestContext } from '../utils/requestContext';

interface FilaExcel {
  codigo: string;
  codigo_homologo: string;
}

function rutaArchivo(): string {
  const arg = process.argv.find((a) => a.startsWith('--archivo='));
  if (arg) return arg.slice('--archivo='.length).replace(/^"|"$/g, '');
  return path.join(os.homedir(), 'Downloads', 'cotizador_codigos_huerfanos_2026-09-14.xlsx');
}

async function leerFilas(archivo: string): Promise<FilaExcel[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(archivo);
  const ws = wb.worksheets[0];

  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell, colNumber) => { headers[colNumber] = String(cell.value ?? '').trim(); });
  const colCodigo = headers.indexOf('codigo');
  const colHomologo = headers.indexOf('codigo_homologo');
  if (colCodigo === -1 || colHomologo === -1) throw new Error('No se encontraron las columnas "codigo"/"codigo_homologo"');

  const filas: FilaExcel[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const codigo = String(row.getCell(colCodigo).value ?? '').trim();
    const codigo_homologo = String(row.getCell(colHomologo).value ?? '').trim();
    if (codigo && codigo_homologo) filas.push({ codigo, codigo_homologo });
  });
  return filas;
}

async function main(): Promise<void> {
  const archivo = rutaArchivo();
  console.log(`Leyendo: ${archivo}\n`);
  const filas = await leerFilas(archivo);
  console.log(`${filas.length} fila(s) con codigo_homologo decidido\n`);

  await requestContext.run({ userId: 30, userName: 'ROOT System', ip: null }, async () => {
    const t = await sequelize.transaction();
    try {
      const codigosHomologo = [...new Set(filas.map((f) => f.codigo_homologo))];
      const catalogo = await CatalogoProducto.findAll({
        where: { codigo: codigosHomologo },
        attributes: ['id', 'codigo'],
        transaction: t,
      });
      const idPorCodigo = new Map(catalogo.map((c) => [c.getDataValue('codigo') as string, c.getDataValue('id') as number]));

      let vinculados = 0;
      let yaVinculados = 0;
      const sinCotizador: string[] = [];
      const sinCatalogo: string[] = [];

      for (const f of filas) {
        const catalogoProductoId = idPorCodigo.get(f.codigo_homologo);
        if (!catalogoProductoId) {
          sinCatalogo.push(`${f.codigo} -> ${f.codigo_homologo}`);
          continue;
        }

        const producto = await CotizadorProducto.findOne({ where: { codigo: f.codigo }, transaction: t });
        if (!producto) {
          sinCotizador.push(f.codigo);
          continue;
        }

        if (producto.getDataValue('catalogo_producto_id') != null) {
          yaVinculados++;
          continue;
        }

        await producto.update({ catalogo_producto_id: catalogoProductoId }, { transaction: t });
        vinculados++;
      }

      console.log(`✓ Vinculados ahora: ${vinculados}`);
      console.log(`- Ya estaban vinculados (sin tocar): ${yaVinculados}`);
      if (sinCatalogo.length > 0) {
        console.log(`\n⚠ ${sinCatalogo.length} fila(s) cuyo codigo_homologo no existe en catalogo_productos (excluidas):`);
        for (const s of sinCatalogo) console.log(`  - ${s}`);
      }
      if (sinCotizador.length > 0) {
        console.log(`\n⚠ ${sinCotizador.length} código(s) que no existen en cotizador.producto (excluidos):`);
        for (const s of sinCotizador) console.log(`  - ${s}`);
      }

      await t.commit();
      console.log('\n=== Fase 2 aplicada y confirmada (COMMIT). ===');
    } catch (err) {
      await t.rollback();
      console.error('\n✘ Error — se hizo ROLLBACK, la BD queda como estaba:', err);
      throw err;
    }
  });

  await new Promise((r) => setTimeout(r, 1500));
  await sequelize.close();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('\nEl script terminó con error:', err);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
