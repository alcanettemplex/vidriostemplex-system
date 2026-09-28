import ExcelJS from 'exceljs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlanoSVG } from '../components/PlanoSVG';
import { fechaLarga, LOGO_DETALLE_TECNICO, PIE_FORMATO } from '../modelo/formato';
import { conteosDe, encuadre, letraPlano } from '../modelo/geometria';
import type { Pedido, Plano } from '../modelo/tipos';

// Área del dibujo dentro de la hoja: columnas A–J (10 × 10 caracteres ≈ 75 px c/u) y filas 8–45 (20 px c/u).
// ExcelJS no trae «Carta» en su enum; 1 es el código estándar de Excel para Letter.
const CARTA = 1 as ExcelJS.PaperSize;
const COLS = 10;
const ANCHO_COL_PX = 75;
const FILA_INI = 7; // índice 0 → fila 8
const FILAS_DIBUJO = 38;
const ALTO_FILA_PX = 20;

const borde: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

async function urlADataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(r.result as string);
    r.onerror = mal;
    r.readAsDataURL(blob);
  });
}

/** Dibuja el plano a PNG en alta resolución (el Excel no entiende SVG). */
async function planoAPng(plano: Plano, anchoPx: number, altoPx: number): Promise<string> {
  const escala = 2.5;
  const svg = renderToStaticMarkup(
    createElement(PlanoSVG, { pieza: plano.pieza, selloEnCanto: plano.selloEnCanto, width: anchoPx * escala, height: altoPx * escala }),
  );
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = anchoPx * escala;
  canvas.height = altoPx * escala;
  // Fondo transparente: así la imagen no tapa los bordes de celda del marco.
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

/** Tamaño en px que ocupa el dibujo respetando su proporción dentro del área disponible. */
function encajar(plano: Plano, maxW: number, maxH: number) {
  const { anchoTotal, altoTotal } = encuadre(plano.pieza);
  const ratio = anchoTotal / altoTotal;
  return ratio > maxW / maxH ? { w: maxW, h: maxW / ratio } : { w: maxH * ratio, h: maxH };
}

function hojaResumen(wb: ExcelJS.Workbook, pedido: Pedido) {
  const ws = wb.addWorksheet('RESUMEN', {
    pageSetup: { paperSize: CARTA, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [
    { width: 13 }, { width: 30 }, { width: 7 }, { width: 11 }, { width: 8 }, { width: 10 }, { width: 10 },
    { width: 7 }, { width: 7 }, { width: 7 }, { width: 8 }, { width: 11 }, { width: 9 }, { width: 40 },
  ];
  ws.mergeCells('A1:N1');
  ws.getCell('A1').value = `DETALLES TÉCNICOS — PEDIDO ${pedido.proveedor} N° ${pedido.numero}`;
  ws.getCell('A1').font = { bold: true, size: 14 };
  const datos: [string, string][] = [
    ['Fecha', fechaLarga(pedido.fecha)],
    ['ODP Templex', pedido.odp],
    ['Cliente', pedido.cliente],
    ['Obra', pedido.obra],
    ['Asesor', pedido.asesor],
  ];
  datos.forEach(([k, v], i) => {
    ws.getCell(`A${i + 3}`).value = k;
    ws.getCell(`A${i + 3}`).font = { bold: true };
    ws.mergeCells(`B${i + 3}:D${i + 3}`);
    ws.getCell(`B${i + 3}`).value = v;
  });

  const enc = ['DT', 'DESCRIPCIÓN', 'CANT.', 'COLOR', 'ESP.', 'ANCHO', 'ALTO', 'PERF', 'BOQ', 'DSP', 'RADIOS', 'CHAFLÁN ml', 'M²', 'OBSERVACIONES'];
  const filaEnc = ws.getRow(9);
  filaEnc.values = enc;
  filaEnc.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1565C0' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = borde;
  });
  let totalM2 = 0;
  pedido.planos.forEach((pl, i) => {
    const c = conteosDe(pl.pieza);
    const m2 = +(c.m2 * pl.cantidad).toFixed(2);
    totalM2 += m2;
    const fila = ws.getRow(10 + i);
    fila.values = [
      letraPlano(i),
      pl.nombre,
      pl.cantidad,
      pl.color,
      pl.espesor,
      pl.pieza.ancho,
      pl.pieza.alto,
      c.perf || null,
      c.boq || null,
      c.dsp || null,
      c.radios || null,
      c.chaflanMl ? +c.chaflanMl.toFixed(2) : null,
      m2,
      [pl.selloEnCanto ? 'SELLO EN CANTO' : '', pl.observaciones].filter(Boolean).join(' · '),
    ];
    fila.eachCell({ includeEmpty: true }, (cell, n) => {
      if (n > enc.length) return;
      cell.border = borde;
      cell.alignment = { horizontal: n === 2 || n === 14 ? 'left' : 'center', vertical: 'middle' };
    });
    fila.getCell(1).font = { bold: true };
  });
  const filaTot = ws.getRow(10 + pedido.planos.length);
  filaTot.getCell(12).value = 'TOTAL';
  filaTot.getCell(12).font = { bold: true };
  filaTot.getCell(13).value = +totalM2.toFixed(2);
  filaTot.getCell(13).font = { bold: true };
  ws.getCell(`A${12 + pedido.planos.length}`).value =
    'Cantidades por unidad. La columna DT es la letra que va en la columna «Detalle Técnico (DT) Plano» de la orden de pedido.';
  ws.getCell(`A${12 + pedido.planos.length}`).font = { italic: true, size: 9, color: { argb: 'FF666666' } };
}

async function hojaPlano(wb: ExcelJS.Workbook, pedido: Pedido, plano: Plano, letra: string, logoId: number) {
  const ws = wb.addWorksheet(`PLANO ${letra}`, {
    pageSetup: {
      paperSize: CARTA,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
    views: [{ showGridLines: false }],
  });
  ws.columns = Array.from({ length: COLS }, () => ({ width: 10 }));
  for (let r = 1; r <= 54; r++) ws.getRow(r).height = 15;
  ws.getRow(1).height = 22;
  ws.getRow(2).height = 22;

  const caja = (rango: string, valor: ExcelJS.CellValue, opts: { bold?: boolean; size?: number; center?: boolean; color?: string } = {}) => {
    ws.mergeCells(rango);
    const cell = ws.getCell(rango.split(':')[0]);
    cell.value = valor;
    cell.font = { name: 'Arial', bold: opts.bold, size: opts.size ?? 9, color: opts.color ? { argb: opts.color } : undefined };
    cell.alignment = { vertical: 'middle', horizontal: opts.center ? 'center' : 'left', wrapText: true };
    const [a, b] = rango.split(':');
    const c1 = ws.getCell(a);
    const c2 = ws.getCell(b);
    for (let r = Number(c1.row); r <= Number(c2.row); r++)
      for (let c = Number(c1.col); c <= Number(c2.col); c++) ws.getCell(r, c).border = borde;
  };

  // ── Encabezado FOR-005 ────────────────────────────────────────────────────
  caja('A1:C3', '');
  // 152×52 conserva la proporción del logo del ERP (225×77); con 205 se estiraba.
  ws.addImage(logoId, { tl: { col: 0.15, row: 0.2 }, ext: { width: 152, height: 52 } });
  caja('D1:J2', 'DETALLE TÉCNICO', { size: 18, center: true });
  caja('D3:H3', 'DETALLE PARA PEDIDO / COMPRA N°');
  caja('I3:J3', pedido.numero, { bold: true, size: 12, center: true, color: 'FFFF0000' });
  caja('A4:C4', 'CLIENTE: VIDRIOS TEMPLEX S.A.S', { bold: true });
  caja('D4:H4', 'FECHA');
  caja('I4:J4', fechaLarga(pedido.fecha), { center: true });
  caja('A5:C5', `PROVEEDOR: ${pedido.proveedor}   ODP: ${pedido.odp || '—'}`);
  caja('D5:H5', `OBRA / CLIENTE FINAL: ${pedido.obra || pedido.cliente || '—'}`);
  caja('I5:J5', `PLANO ${letra}`, { bold: true, size: 12, center: true });

  // ── Dibujo ────────────────────────────────────────────────────────────────
  const areaW = COLS * ANCHO_COL_PX;
  const areaH = FILAS_DIBUJO * ALTO_FILA_PX;
  const primera = FILA_INI + 1;
  const ultima = FILA_INI + FILAS_DIBUJO;
  for (let r = primera; r <= ultima; r++) {
    ws.getRow(r).height = ALTO_FILA_PX * 0.75;
    for (let c = 1; c <= COLS; c++) {
      ws.getCell(r, c).border = {
        top: r === primera ? { style: 'thin' } : undefined,
        bottom: r === ultima ? { style: 'thin' } : undefined,
        left: c === 1 ? { style: 'thin' } : undefined,
        right: c === COLS ? { style: 'thin' } : undefined,
      };
    }
  }
  const { w, h } = encajar(plano, areaW - 40, areaH - 40);
  const png = await planoAPng(plano, Math.round(w), Math.round(h));
  const imgId = wb.addImage({ base64: png, extension: 'png' });
  ws.addImage(imgId, {
    tl: { col: (areaW - w) / 2 / ANCHO_COL_PX, row: FILA_INI + (areaH - h) / 2 / ALTO_FILA_PX },
    ext: { width: w, height: h },
  });

  // ── Datos del ítem ────────────────────────────────────────────────────────
  const c = conteosDe(plano.pieza);
  const f0 = ultima + 2;
  const enc = ['CANT.', 'COLOR', 'ESP. (mm)', 'ANCHO', 'ALTO', 'PERF', 'BOQ', 'DSP', 'RADIOS', 'CHAFLÁN'];
  const val: (string | number)[] = [plano.cantidad, plano.color, plano.espesor, plano.pieza.ancho, plano.pieza.alto, c.perf, c.boq, c.dsp, c.radios, c.chaflanMl ? `${c.chaflanMl.toFixed(2)} ml` : ''];
  enc.forEach((t, i) => {
    const a = ws.getCell(f0, i + 1);
    a.value = t;
    a.font = { name: 'Arial', bold: true, size: 8 };
    a.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
    a.alignment = { horizontal: 'center' };
    a.border = borde;
    const b = ws.getCell(f0 + 1, i + 1);
    b.value = val[i] === 0 ? '' : val[i];
    b.font = { name: 'Arial', size: 10 };
    b.alignment = { horizontal: 'center' };
    b.border = borde;
  });
  const obs = [plano.selloEnCanto ? 'SELLO EN EL CANTO' : '', plano.observaciones].filter(Boolean).join(' · ');
  caja(`A${f0 + 2}:B${f0 + 3}`, 'OBSERVACIONES', { bold: true });
  caja(`C${f0 + 2}:J${f0 + 3}`, obs);
  caja(`A${f0 + 5}:B${f0 + 5}`, 'ASESOR', { bold: true });
  caja(`C${f0 + 5}:D${f0 + 5}`, pedido.asesor, { center: true });
  ws.mergeCells(`G${f0 + 5}:J${f0 + 5}`);
  const pie = ws.getCell(`G${f0 + 5}`);
  pie.value = PIE_FORMATO;
  pie.font = { name: 'Arial', size: 7 };
  pie.alignment = { horizontal: 'right' };
  ws.pageSetup.printArea = `A1:J${f0 + 5}`;
}

export async function exportarExcel(pedido: Pedido) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Vidrios Templex — Editor de detalles técnicos';
  wb.created = new Date();
  const logoId = wb.addImage({ base64: await urlADataUrl(LOGO_DETALLE_TECNICO), extension: 'png' });

  hojaResumen(wb, pedido);
  for (let i = 0; i < pedido.planos.length; i++) {
    await hojaPlano(wb, pedido, pedido.planos[i], letraPlano(i), logoId);
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `DETALLES TECNICOS ${pedido.proveedor} #${pedido.numero}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
