// Detalles técnicos de Pedidos PV (2026-10-16): reglas compartidas entre
// `detalle_tecnico.controller.ts` y `pedido_pv.controller.ts`.
//
// Vive en utils/ y NO en un controlador a propósito: `pedido_pv.controller` importa
// `../server` de forma estática y `server → app → routes → controller` cierra un ciclo
// (ver CLAUDE.md, «utils/pedidoPvCapacidad.ts vive fuera de los controladores»).
import path from 'path';
import ExcelJS from 'exceljs';
import { Op } from 'sequelize';
import { PedidoPV, PedidoPVPlano, PedidoPVDtDesbloqueo, Usuario } from '../models';
import { diaBogotaISO } from './fechas';

/** Letra DT normalizada. `odp_items.dt` es texto libre (hay una «a» minúscula en la BD). */
export const normalizarLetra = (dt: unknown): string | null => {
  const s = String(dt ?? '').trim().toUpperCase();
  return s === '' ? null : s;
};

/** Diseñan los planos: admin, root y quien gestiona Pedidos PV. */
export const puedeDisenarDT = async (user: { id: number; rol: string }): Promise<boolean> => {
  if (user.rol === 'admin' || user.rol === 'root') return true;
  const u = await Usuario.findByPk(user.id, { attributes: ['puede_gestionar_pv'] });
  return !!u?.getDataValue('puede_gestionar_pv');
};

/** Solo admin (y root) desbloquea un pedido ya enviado. */
export const puedeDesbloquearDT = (rol: string) => rol === 'admin' || rol === 'root';

/** Iniciales del asesor, mismo criterio que la «obra» del formulario oficial. */
export const inicialesAsesor = (nombre: string | null | undefined): string =>
  (nombre ?? '').trim().split(/\s+/).filter(Boolean).map((p) => p[0]).join('').toUpperCase();

/**
 * Pedido principal (sin sufijo) del grupo al que pertenece `pedidoId`, y todos los
 * pedidos del grupo (principal + extensiones -1, -2…). Null si el pedido no existe o
 * no nació de una ODP (los MANUALES no tienen ítems y no llevan planos).
 */
export async function grupoDePedido(pedidoId: number) {
  const pedido = await PedidoPV.findByPk(pedidoId, { attributes: ['id', 'numero_base', 'odp_id'] });
  if (!pedido || !pedido.getDataValue('odp_id')) return null;
  const pedidos = await PedidoPV.findAll({
    where: { numero_base: pedido.getDataValue('numero_base'), odp_id: pedido.getDataValue('odp_id') },
    order: [['sufijo', 'ASC NULLS FIRST']],
  });
  const base = pedidos.find((p) => p.getDataValue('sufijo') === null);
  if (!base) return null;
  return { base, pedidos };
}

export interface ItemConPedido {
  id: number;
  pedido_pv_id: number | null;
  dt: string | null;
}

/**
 * Letras bloqueadas: una letra se bloquea en cuanto alguno de sus vidrios va en un
 * pedido que ya salió de PENDIENTE —el papel ya llegó al proveedor—, salvo que admin
 * haya desbloqueado el pedido. Por letra y no por pedido completo: si solo se envió el
 * 6733, la letra que vive únicamente en el 6733-1 sigue editable.
 */
export function letrasBloqueadas(
  items: ItemConPedido[],
  estadoPorPedido: Map<number, string>,
  desbloqueado: boolean,
): Set<string> {
  const bloqueadas = new Set<string>();
  if (desbloqueado) return bloqueadas;
  for (const it of items) {
    const letra = normalizarLetra(it.dt);
    if (!letra || it.pedido_pv_id === null) continue;
    const estado = estadoPorPedido.get(it.pedido_pv_id);
    if (estado && estado !== 'PENDIENTE') bloqueadas.add(letra);
  }
  return bloqueadas;
}

export const estaDesbloqueado = async (basePedidoId: number) =>
  !!(await PedidoPVDtDesbloqueo.findByPk(basePedidoId, { attributes: ['pedido_pv_id'] }));

/**
 * Letras con plano guardado, por pedido de la página (principal o extensión). Alimenta el
 * indicador «DT 1/2» de Gestión PV: dos consultas livianas por página, sin traer el JSONB.
 */
export async function letrasConPlanoPorPedido(
  pedidos: { id: number; numero_base: number; odp_id: number | null; sufijo: string | null }[],
): Promise<Map<number, string[]>> {
  const resultado = new Map<number, string[]>();
  const conOdp = pedidos.filter((p) => p.odp_id !== null);
  if (conOdp.length === 0) return resultado;

  const bases = await PedidoPV.findAll({
    where: { numero_base: { [Op.in]: Array.from(new Set(conOdp.map((p) => p.numero_base))) }, sufijo: null },
    attributes: ['id', 'numero_base', 'odp_id'],
  });
  const baseDe = (p: { numero_base: number; odp_id: number | null }) =>
    bases.find((b) => b.getDataValue('numero_base') === p.numero_base && b.getDataValue('odp_id') === p.odp_id);

  const baseIds = bases.map((b) => b.getDataValue('id') as number);
  const planos = baseIds.length
    ? await PedidoPVPlano.findAll({ where: { pedido_pv_id: { [Op.in]: baseIds } }, attributes: ['pedido_pv_id', 'letra'] })
    : [];
  for (const p of conOdp) {
    const base = baseDe(p);
    if (!base) continue;
    const id = base.getDataValue('id');
    resultado.set(p.id, planos.filter((pl) => pl.getDataValue('pedido_pv_id') === id).map((pl) => pl.getDataValue('letra') as string));
  }
  return resultado;
}

// ─── Hoja «PLANO X» del Excel oficial ─────────────────────────────────────────
// Mismo formato FOR-005 que la vista del editor (`HojaDetalle.tsx`) y que el modo libre
// del navegador (`exportar/excel.ts`). Área del dibujo: columnas A–J (10 × 75 px) y
// filas 8–45 (20 px). La imagen la genera el navegador al guardar el plano y la ubica
// aquí con su tamaño lógico (`imagen_ancho` × `imagen_alto`), centrada.

const COLS = 10;
const ANCHO_COL_PX = 75;
const FILA_INI = 7; // índice 0 → fila 8
const FILAS_DIBUJO = 38;
const ALTO_FILA_PX = 20;
const CARTA = 1 as ExcelJS.PaperSize; // ExcelJS no trae «Carta» en su enum: 1 = Letter
const PIE_FORMATO = 'FOR - 005 VERSION : 01 DE MAYO 2014';
const LOGO_PATH = path.join(__dirname, '../../templates/logotemplex.png');

const borde: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

export interface EncabezadoPlano {
  numeroPedido: string;
  proveedor: string;
  numeroOdp: string;
  asesorIniciales: string;
  fecha: Date | null;
}

interface Conteos { perf: number; boq: number; dsp: number; radios: number; chaflanMl: number; m2: number }

const fechaCorta = (d: Date | null) => {
  if (!d) return '';
  const [y, m, dd] = diaBogotaISO(new Date(d)).split('-');
  return `${dd}/${m}/${y}`;
};

/** Descarga la imagen del plano. Si Cloudinary falla, la hoja sale sin dibujo y con aviso:
 *  no se tumba el Excel entero, que también lleva el formulario del proveedor. */
async function descargarImagen(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return Buffer.from(await resp.arrayBuffer()).toString('base64');
  } catch {
    return null;
  }
}

/** Exportada solo para la prueba del formato (scripts de verificación); el punto de entrada es `agregarPlanosAlExcel`. */
export async function hojaPlano(
  wb: ExcelJS.Workbook,
  enc: EncabezadoPlano,
  plano: PedidoPVPlano,
  filas: { cantidad?: unknown; color?: unknown; espesor?: unknown; ancho_mm?: unknown; alto_mm?: unknown }[],
  logoId: number,
) {
  const letra = plano.getDataValue('letra') as string;
  const ws = wb.addWorksheet(`PLANO ${letra}`.slice(0, 31), {
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
  for (let r = 1; r <= 60; r++) ws.getRow(r).height = 15;
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

  // ── Encabezado FOR-005 ──
  caja('A1:C3', '');
  ws.addImage(logoId, { tl: { col: 0.15, row: 0.2 }, ext: { width: 152, height: 52 } });
  caja('D1:J2', 'DETALLE TÉCNICO', { size: 18, center: true });
  caja('D3:H3', 'DETALLE PARA PEDIDO / COMPRA N°');
  caja('I3:J3', enc.numeroPedido, { bold: true, size: 12, center: true, color: 'FFFF0000' });
  caja('A4:C4', 'CLIENTE: VIDRIOS TEMPLEX S.A.S', { bold: true });
  caja('D4:H4', 'FECHA');
  caja('I4:J4', fechaCorta(enc.fecha), { center: true });
  caja('A5:C5', `PROVEEDOR: ${enc.proveedor}   ODP: ${enc.numeroOdp || '—'}`);
  // Misma «obra» que el formulario oficial: ODP — iniciales del asesor. El nombre del
  // cliente final no viaja al proveedor.
  caja('D5:H5', `OBRA: ${[enc.numeroOdp, enc.asesorIniciales].filter(Boolean).join(' — ') || '—'}`);
  caja('I5:J5', `PLANO ${letra}`, { bold: true, size: 12, center: true });

  // ── Dibujo ──
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
  const url = plano.getDataValue('imagen_url') as string | null;
  const w = Number(plano.getDataValue('imagen_ancho')) || 0;
  const h = Number(plano.getDataValue('imagen_alto')) || 0;
  const png = url && w > 0 && h > 0 ? await descargarImagen(url) : null;
  if (png) {
    const imgId = wb.addImage({ base64: png, extension: 'png' });
    ws.addImage(imgId, {
      tl: { col: (areaW - w) / 2 / ANCHO_COL_PX, row: FILA_INI + (areaH - h) / 2 / ALTO_FILA_PX },
      ext: { width: w, height: h },
    });
  } else {
    const aviso = ws.getCell(primera + 2, 1);
    aviso.value = 'No se pudo cargar el dibujo de este plano. Ábrelo en Detalles Técnicos y vuelve a guardarlo.';
    aviso.font = { name: 'Arial', italic: true, size: 9, color: { argb: 'FFC00000' } };
  }

  // ── Datos: una fila por vidrio con esta letra (decisión 2026-10-16: el plano acota los
  //    herrajes y cada vidrio lleva su propio ancho × alto) ──
  const c = (plano.getDataValue('conteos') ?? {}) as Partial<Conteos>;
  const f0 = ultima + 2;
  const encab = ['CANT.', 'COLOR', 'ESP. (mm)', 'ANCHO', 'ALTO', 'PERF', 'BOQ', 'DSP', 'RADIOS', 'CHAFLÁN'];
  encab.forEach((t, i) => {
    const a = ws.getCell(f0, i + 1);
    a.value = t;
    a.font = { name: 'Arial', bold: true, size: 8 };
    a.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
    a.alignment = { horizontal: 'center' };
    a.border = borde;
  });
  const vacioSiCero = (v: unknown) => (v === null || v === undefined || v === '' || Number(v) === 0 ? '' : (v as ExcelJS.CellValue));
  const chaflan = Number(c.chaflanMl) > 0 ? `${Number(c.chaflanMl).toFixed(2)} ml` : '';
  filas.forEach((it, k) => {
    const valores: ExcelJS.CellValue[] = [
      vacioSiCero(it.cantidad), (it.color as string) ?? '', (it.espesor as string) ?? '', vacioSiCero(it.ancho_mm), vacioSiCero(it.alto_mm),
      vacioSiCero(c.perf), vacioSiCero(c.boq), vacioSiCero(c.dsp), vacioSiCero(c.radios), chaflan,
    ];
    valores.forEach((v, i) => {
      const b = ws.getCell(f0 + 1 + k, i + 1);
      b.value = v;
      b.font = { name: 'Arial', size: 10 };
      b.alignment = { horizontal: 'center' };
      b.border = borde;
    });
  });
  const fObs = f0 + 1 + Math.max(filas.length, 1);
  const obs = [plano.getDataValue('sello_en_canto') ? 'SELLO EN EL CANTO' : '', plano.getDataValue('observaciones') ?? ''].filter(Boolean).join(' · ');
  caja(`A${fObs + 1}:B${fObs + 2}`, 'OBSERVACIONES', { bold: true });
  caja(`C${fObs + 1}:J${fObs + 2}`, obs);
  caja(`A${fObs + 4}:B${fObs + 4}`, 'ASESOR', { bold: true });
  caja(`C${fObs + 4}:D${fObs + 4}`, enc.asesorIniciales, { center: true });
  ws.mergeCells(`G${fObs + 4}:J${fObs + 4}`);
  const pie = ws.getCell(`G${fObs + 4}`);
  pie.value = PIE_FORMATO;
  pie.font = { name: 'Arial', size: 7 };
  pie.alignment = { horizontal: 'right' };
  ws.pageSetup.printArea = `A1:J${fObs + 4}`;
}

/**
 * Agrega al Excel oficial del proveedor una hoja «PLANO X» por cada letra de los ítems de
 * ESTE pedido que tenga plano guardado (decisión 2026-10-16: con extensiones, cada archivo
 * lleva solo los planos de sus propios ítems). Una letra sin plano no bloquea la descarga.
 */
export async function agregarPlanosAlExcel(
  wb: ExcelJS.Workbook,
  pedido: PedidoPV,
  items: { dt?: string | null; cantidad?: unknown; color?: unknown; espesor?: unknown; ancho_mm?: unknown; alto_mm?: unknown }[],
  enc: EncabezadoPlano,
): Promise<number> {
  const odpId = pedido.getDataValue('odp_id');
  if (!odpId) return 0;
  const letras = Array.from(new Set(items.map((it) => normalizarLetra(it.dt)).filter((l): l is string => !!l))).sort();
  if (letras.length === 0) return 0;

  const base = await PedidoPV.findOne({
    where: { numero_base: pedido.getDataValue('numero_base'), odp_id: odpId, sufijo: null },
    attributes: ['id'],
  });
  if (!base) return 0;
  const planos = await PedidoPVPlano.findAll({
    where: { pedido_pv_id: base.getDataValue('id'), letra: { [Op.in]: letras } },
    order: [['letra', 'ASC']],
  });
  if (planos.length === 0) return 0;

  const logoId = wb.addImage({ filename: LOGO_PATH, extension: 'png' });
  for (const plano of planos) {
    const letra = plano.getDataValue('letra');
    await hojaPlano(wb, enc, plano, items.filter((it) => normalizarLetra(it.dt) === letra), logoId);
  }
  return planos.length;
}
