/**
 * CSS de impresión compartido por todos los formatos de ODP.
 *
 * Vivía duplicado literal dentro de `ODPTabImprimir.handlePrint`. Al aparecer un segundo
 * emisor —la impresión por lote de la pestaña "Por Imprimir" del tablero de Taller— la
 * copia dejaba de ser un detalle: dos bloques idénticos que hay que recordar editar a la
 * vez son la forma más barata de que el papel salga distinto según desde dónde se imprima.
 *
 * Se pasa tal cual a `abrirVentanaImpresion({ estilos })`, que ya incrusta encima las
 * hojas de estilo que la app tiene cargadas.
 */
export const ESTILOS_IMPRESION_ODP = `
  @page { size: letter portrait; margin: 4mm; }
  body { font-family: sans-serif; }
  .excel-table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
  .excel-table th, .excel-table td { border: 1px solid #000; padding: 2px 4px; }
  .excel-table th { font-weight: bold; text-align: center; }
  .sap-table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
  .sap-table th, .sap-table td { border: 1px solid #000; padding: 2px 4px; }
  .sap-table th { font-weight: bold; text-align: center; background-color: #f0f0f0; }
  .thick-b { border-bottom: 2px solid #000 !important; }
  /* Ancho/alto fijos solo para la vista en pantalla: en papel la hoja la
     define @page, y forzar 21.5cm x 29cm (alto A4) sobre una Carta
     desbordaba y sacaba una hoja extra en blanco. */
  .sap-page { display: block; width: 100%; background: white; color: black; font-family: sans-serif; font-size: 14px; margin: 0 auto; page-break-after: always; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sap-page:last-child { page-break-after: avoid; }
  .print-container { padding: 8px; }
  .bg-blue-100 { background-color: #dbeafe !important; }
  .bg-slate-50 { background-color: #f8fafc !important; }
`;
