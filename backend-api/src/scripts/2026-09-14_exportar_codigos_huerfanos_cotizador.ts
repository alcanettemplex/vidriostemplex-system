/**
 * Script: 2026-09-14_exportar_codigos_huerfanos_cotizador.ts
 *
 * Exporta a Excel los códigos de `cotizador.producto` que NO tienen
 * equivalente en `catalogo_productos` (catalogo_producto_id IS NULL) — el
 * 32% que quedó fuera del backfill de
 * 2026-09-14_cotizador_vinculo_catalogo_maestro.ts.
 *
 * Solo lectura: no toca ninguna tabla. El usuario revisa el Excel a mano y
 * llena dos columnas estructuradas (no texto libre, para que el script de
 * Fase 2 —todavía sin construir, depende de este Excel devuelto— pueda
 * aplicarlas sin ambigüedad):
 *   - "accion": lista desplegable HOMOLOGAR / ALTA_NUEVA / IGNORAR.
 *   - "codigo_homologo": solo si accion=HOMOLOGAR, el código real de
 *     catalogo_productos al que corresponde.
 * Las filas con coincidencia exacta (ver más abajo) vienen pre-llenadas como
 * sugerencia HOMOLOGAR — el usuario debe verificarlas, no son definitivas.
 *
 * "posible_coincidencia": SIN fuzzy-matching. Solo coincidencia EXACTA de
 * texto normalizado (minúsculas, sin tildes, mismo criterio que
 * normalizarTexto de cotizador/lib/precios/proveedorSequelize.ts) entre la
 * descripción del Cotizador y el nombre del catálogo maestro. Si no hay
 * match exacto, queda en blanco — el criterio final lo pone el usuario.
 *
 * Uso:
 *   npx ts-node src/scripts/2026-09-14_exportar_codigos_huerfanos_cotizador.ts [--salida="C:\ruta"]
 */
import * as os from 'os';
import * as path from 'path';
import ExcelJS from 'exceljs';
import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';
import { normalizarTexto } from '../cotizador/lib/precios/proveedorSequelize';

interface FilaHuerfana {
  codigo: string;
  descripcion: string;
  categoria: string | null;
  unidad: string | null;
  origen: string;
  costo_unitario: number;
  precio_pa: number;
  precio_pm: number;
  precio_pb: number;
}

interface FilaCatalogo {
  codigo: string;
  nombre: string;
}

function rutaSalida(): string {
  const arg = process.argv.find((a) => a.startsWith('--salida='));
  if (arg) return arg.slice('--salida='.length).replace(/^"|"$/g, '');
  return path.join(os.homedir(), 'Downloads');
}

async function main(): Promise<void> {
  await sequelize.authenticate();
  console.log('Conexión OK\n');

  const huerfanos = await sequelize.query<FilaHuerfana>(
    `SELECT codigo, descripcion, categoria, unidad, origen, costo_unitario, precio_pa, precio_pm, precio_pb
       FROM cotizador.producto
      WHERE catalogo_producto_id IS NULL
      ORDER BY codigo`,
    { type: QueryTypes.SELECT }
  );
  console.log(`${huerfanos.length} código(s) sin equivalente en catalogo_productos`);

  // Para la columna informativa "posible coincidencia": un solo SELECT del
  // maestro completo, indexado en memoria por texto normalizado — más barato
  // que una query por cada huérfano.
  const catalogo = await sequelize.query<FilaCatalogo>(
    `SELECT codigo, nombre FROM public.catalogo_productos WHERE codigo IS NOT NULL AND nombre IS NOT NULL`,
    { type: QueryTypes.SELECT }
  );
  const porNombreNormalizado = new Map<string, FilaCatalogo>();
  for (const c of catalogo) {
    const clave = normalizarTexto(c.nombre);
    if (!porNombreNormalizado.has(clave)) porNombreNormalizado.set(clave, c);
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Códigos huérfanos');
  ws.columns = [
    { header: 'codigo', key: 'codigo', width: 16 },
    { header: 'descripcion', key: 'descripcion', width: 40 },
    { header: 'categoria', key: 'categoria', width: 14 },
    { header: 'unidad', key: 'unidad', width: 10 },
    { header: 'origen', key: 'origen', width: 12 },
    { header: 'costo_unitario', key: 'costo_unitario', width: 14 },
    { header: 'precio_pa', key: 'precio_pa', width: 14 },
    { header: 'precio_pm', key: 'precio_pm', width: 14 },
    { header: 'precio_pb', key: 'precio_pb', width: 14 },
    { header: 'posible_coincidencia_codigo', key: 'posible_coincidencia_codigo', width: 18 },
    { header: 'posible_coincidencia_nombre', key: 'posible_coincidencia_nombre', width: 40 },
    { header: 'accion', key: 'accion', width: 14 },
    { header: 'codigo_homologo', key: 'codigo_homologo', width: 18 },
  ];
  ws.getRow(1).font = { bold: true };

  const OPCIONES_ACCION = '"HOMOLOGAR,ALTA_NUEVA,IGNORAR"';

  for (const h of huerfanos) {
    const match = porNombreNormalizado.get(normalizarTexto(h.descripcion));
    const fila = ws.addRow({
      codigo: h.codigo,
      descripcion: h.descripcion,
      categoria: h.categoria,
      unidad: h.unidad,
      origen: h.origen,
      costo_unitario: h.costo_unitario,
      precio_pa: h.precio_pa,
      precio_pm: h.precio_pm,
      precio_pb: h.precio_pb,
      posible_coincidencia_codigo: match?.codigo ?? '',
      posible_coincidencia_nombre: match?.nombre ?? '',
      // Sugerencia pre-llenada solo cuando hubo coincidencia EXACTA de texto
      // normalizado — el usuario debe verificarla, no es definitiva.
      accion: match ? 'HOMOLOGAR' : '',
      codigo_homologo: match?.codigo ?? '',
    });
    fila.getCell('accion').dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [OPCIONES_ACCION],
      showErrorMessage: true,
      errorTitle: 'Valor no válido',
      error: 'Elige HOMOLOGAR, ALTA_NUEVA o IGNORAR de la lista.',
    };
  }

  const fecha = new Date().toISOString().slice(0, 10);
  const sufijoArg = process.argv.find((a) => a.startsWith('--sufijo='));
  const sufijo = sufijoArg ? sufijoArg.slice('--sufijo='.length) : '';
  const nombreArchivo = `cotizador_codigos_huerfanos_${fecha}${sufijo}.xlsx`;
  const salida = path.join(rutaSalida(), nombreArchivo);
  await wb.xlsx.writeFile(salida);
  console.log(`\n✓ Excel generado: ${salida}`);

  await sequelize.close();
}

main().catch(async (err) => {
  console.error('\nEl script terminó con error:', err);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
