// Dibujo del diseño de cada ítem para el ANEXO del PDF de cotización (2026-10-17).
//
// El cliente recibe, al final del PDF, una hoja con el esquema de cada producto
// que tiene diseño: la forma, sus medidas totales, qué hoja corre, cuál es fija
// y hacia dónde abre. Decisiones del usuario (2026-10-17):
//   - Anexo al final, cuadrícula de 2×2, mismo número de ítem que la tabla.
//   - Cotas: SOLO ancho y alto total, con la medida que escribió el asesor (el
//     vano si la escribió así), no la de fabricación — es la que el cliente
//     midió y la que dice la descripción del ítem.
//   - Símbolos: ↔ en la hoja corrediza (X), "FIJO" en el paño fijo (O),
//     triángulo punteado en la proyectante (W, bisagra arriba) y en la hoja que
//     abre de las cabinas (Z/P), con la punta hacia la bisagra.
//   - Vista EXTERIOR. "Abre hacia" (izquierda/derecha) es un campo opcional de
//     Cabinas batientes; sin él la hoja se dibuja sin símbolo de apertura.
//   - Marco del color cotizado. Las cabinas son vidrio templado: la batiente
//     sin marco, la corrediza con su riel superior (la variante "_MARCO" sí
//     lleva marco).
//   - Ítems idénticos (mismo dibujo y misma descripción sin la ubicación) van
//     en una sola tarjeta con la anotación de cuáles son.
//   - Cabina en L: se dibuja el frente y un aviso con la L vista desde arriba,
//     para que el cliente no crea que es una cabina recta.
//
// FUNCIONES PURAS: no leen la BD ni la caché. El controlador les pasa las
// correcciones de geometría (`overrides`) ya leídas, igual que a `calcularPlano`.
// El SVG solo lleva números y textos fijos de este archivo — nunca texto del
// usuario —, así que no hay nada que escapar.
import { calcularPlano, type Plano, type VidrioEntrada } from './planoProducto';
import { descripcionComercial } from './detalleComercial';
import type { GeometriaOverrides } from '../tipos';

// ─── Plano de un ítem guardado ──────────────────────────────────────────────

/** Lo que el plano necesita del `resultado` guardado del ítem (tipado laxo: es un blob). */
export interface ResultadoConPlano {
  diseno?: { id?: string; diseno?: string } | null;
  medidas?: {
    vano?: { anchoCm?: unknown; altoCm?: unknown } | null;
    fabricacion?: { anchoCm?: unknown; altoCm?: unknown } | null;
  } | null;
  cortes?: { vidrios?: unknown[] } | null;
}

/**
 * Plano de un ítem YA GUARDADO, solo con lo que quedó en su `resultado`: sin
 * volver al catálogo de diseños, así funciona aunque el diseño haya cambiado de
 * fórmula o lo hayan borrado. Lo usan el endpoint del plano (`planoDeItem`) y
 * el PDF, para que el dibujo de la pantalla y el del papel salgan del mismo cálculo.
 */
export function planoDeResultadoGuardado(
  resultado: ResultadoConPlano | null | undefined,
  overrides: GeometriaOverrides
): { plano: Plano } | { error: string } {
  const disenoInfo = resultado?.diseno;
  if (!disenoInfo?.diseno) {
    return { error: 'Este ítem se cotizó con medidas libres, no por diseño: no tiene plano.' };
  }
  const fabricacion = resultado?.medidas?.fabricacion;
  if (!fabricacion) {
    return { error: 'Este ítem no tiene una medida de fabricación guardada.' };
  }
  // `resultado.diseno` no guarda `modulo`; solo hace falta para la regla del
  // espejo y se infiere del prefijo del código (ningún otro módulo lo usa).
  const modulo = String(disenoInfo.diseno).startsWith('ESP_') ? 'espejo' : undefined;
  return {
    plano: calcularPlano({
      codigoDiseno: disenoInfo.diseno,
      modulo,
      anchoFabMm: Number(fabricacion.anchoCm) * 10,
      altoFabMm: Number(fabricacion.altoCm) * 10,
      vidrios: (resultado?.cortes?.vidrios ?? []) as VidrioEntrada[],
      disenoId: disenoInfo.id ?? null,
      overrides,
    }),
  };
}

// ─── Datos del dibujo de un ítem ───────────────────────────────────────────

export type TipoDibujo = 'ventana' | 'cabinaBatiente' | 'cabinaCorrediza';
export type Apertura = 'izquierda' | 'derecha' | null;

export interface DibujoItem {
  plano: Plano;
  /** Medida que escribió el asesor (vano o fabricación), en mm. */
  cotaAnchoMm: number;
  cotaAltoMm: number;
  tipo: TipoDibujo;
  color: string | null;
  conMarco: boolean;
  apertura: Apertura;
  enL: boolean;
  /** Lado Y de la L en mm, solo si el asesor lo escribió. */
  ladoYMm: number | null;
}

const marcado = (v: unknown) => v === true || v === 'true';

/** Valor del campo "Abre hacia" de Cabinas batientes, o null si no se eligió. */
export function aperturaDeInput(input: Record<string, unknown> | null | undefined): Apertura {
  const v = String(input?.abreHacia ?? '').trim().toLowerCase();
  return v === 'izquierda' || v === 'derecha' ? v : null;
}

/**
 * Todo lo que el anexo necesita para dibujar un ítem, o `null` si no se dibuja
 * (sin diseño, sin medida, o un plano sin paneles). Nunca lanza: un ítem que no
 * se puede dibujar sale sin tarjeta, el PDF se genera igual.
 */
export function dibujoDeItem(
  moduloId: string | null | undefined,
  input: Record<string, unknown> | null | undefined,
  resultado: ResultadoConPlano | null | undefined,
  overrides: GeometriaOverrides
): DibujoItem | null {
  try {
    const r = planoDeResultadoGuardado(resultado, overrides);
    if ('error' in r || r.plano.paneles.length === 0) return null;
    const medida = resultado?.medidas?.vano ?? resultado?.medidas?.fabricacion;
    const anchoCm = Number(medida?.anchoCm);
    const altoCm = Number(medida?.altoCm);
    const i = input ?? {};
    const tipo: TipoDibujo =
      moduloId === 'cabinas-batientes' ? 'cabinaBatiente' : moduloId === 'cabinas-corredizas' ? 'cabinaCorrediza' : 'ventana';
    const enL = tipo !== 'ventana' && marcado(i.enL);
    const ladoY = Number(i.ladoYCm);
    return {
      plano: r.plano,
      cotaAnchoMm: Number.isFinite(anchoCm) && anchoCm > 0 ? anchoCm * 10 : r.plano.exterior.anchoMm,
      cotaAltoMm: Number.isFinite(altoCm) && altoCm > 0 ? altoCm * 10 : r.plano.exterior.altoMm,
      tipo,
      color: typeof i.colorPerfileria === 'string' ? i.colorPerfileria : null,
      conMarco: /MARCO/i.test(String(resultado?.diseno?.diseno ?? '')),
      apertura: tipo === 'cabinaBatiente' ? aperturaDeInput(i) : null,
      enL,
      ladoYMm: enL && Number.isFinite(ladoY) && ladoY > 0 ? ladoY * 10 : null,
    };
  } catch {
    return null;
  }
}

// ─── Agrupar idénticos ───────────────────────────────────────────────────────

export interface EntradaAnexo {
  /** Número del ítem en la tabla de precios (1, 2, 3…). */
  numero: number;
  moduloId?: string | null;
  input?: Record<string, unknown> | null;
  resultado?: Parameters<typeof descripcionComercial>[2];
  cantidadPiezas?: number;
  dibujo: DibujoItem;
}

export interface GrupoAnexo {
  /** El primero del grupo: de él salen el dibujo y la descripción. */
  entrada: EntradaAnexo;
  numeros: number[];
  piezas: number;
  ubicaciones: string[];
}

const ubicacionDe = (input: Record<string, unknown> | null | undefined) =>
  typeof input?.descripcionItem === 'string' ? input.descripcionItem.trim() : '';

/** Descripción comercial del ítem sin la ubicación ("Sala — …"). */
export function descripcionSinUbicacion(e: Pick<EntradaAnexo, 'moduloId' | 'input' | 'resultado'>): string {
  return descripcionComercial(e.moduloId, { ...(e.input ?? {}), descripcionItem: '' }, e.resultado);
}

/**
 * Agrupa los ítems con el mismo dibujo y la misma descripción sin la ubicación
 * (decisión del usuario: idénticos en una tarjeta, con la anotación). Conserva
 * el orden de la tabla: el grupo aparece donde aparece su primer ítem.
 */
export function agruparIdenticos(entradas: EntradaAnexo[]): GrupoAnexo[] {
  const grupos = new Map<string, GrupoAnexo>();
  for (const e of entradas) {
    const d = e.dibujo;
    const clave = JSON.stringify([
      e.moduloId ?? '',
      d.plano.paneles.map((p) => `${p.tipo}:${Math.round(p.anchoMm)}x${Math.round(p.altoMm)}`).join('|'),
      Math.round(d.cotaAnchoMm),
      Math.round(d.cotaAltoMm),
      d.color ?? '',
      d.apertura ?? '',
      d.enL ? d.ladoYMm ?? 'L' : '',
      descripcionSinUbicacion(e),
    ]);
    const piezas = Number(e.cantidadPiezas) > 0 ? Number(e.cantidadPiezas) : 1;
    const ubicacion = ubicacionDe(e.input);
    const g = grupos.get(clave);
    if (g) {
      g.numeros.push(e.numero);
      g.piezas += piezas;
      if (ubicacion) g.ubicaciones.push(ubicacion);
    } else {
      grupos.set(clave, { entrada: e, numeros: [e.numero], piezas, ubicaciones: ubicacion ? [ubicacion] : [] });
    }
  }
  return [...grupos.values()];
}

/** "ÍTEM 3" / "ÍTEMS 3 Y 4" / "ÍTEMS 2, 5 Y 7". */
export function rotuloItems(numeros: number[]): string {
  if (numeros.length === 1) return `ÍTEM ${numeros[0]}`;
  return `ÍTEMS ${numeros.slice(0, -1).join(', ')} Y ${numeros[numeros.length - 1]}`;
}

// ─── SVG ───────────────────────────────────────────────────────────────────

/** Color de la perfilería (opciones de `colorPerfileria`). Desconocido → mate. */
const PALETA: Record<string, { marco: string; hoja: string; borde: string }> = {
  mate: { marco: '#A4ADB6', hoja: '#C3CAD1', borde: '#5B6670' },
  'gris plata': { marco: '#B9C0C7', hoja: '#D3D8DD', borde: '#66717C' },
  crudo: { marco: '#B3B6B8', hoja: '#CCCFD1', borde: '#6A6F73' },
  bronce: { marco: '#6F5843', hoja: '#8A725B', borde: '#3F3122' },
  blanco: { marco: '#F4F5F6', hoja: '#FFFFFF', borde: '#8A939C' },
  negro: { marco: '#2B2E31', hoja: '#43474B', borde: '#111314' },
};

/** Paleta del color cotizado; exportada para las pruebas. */
export function paletaDeColor(color: string | null | undefined) {
  const c = String(color ?? '').trim().toLowerCase().replace(/[\s-]+/g, ' ');
  return PALETA[c === 'grisplata' ? 'gris plata' : c] ?? PALETA.mate;
}

const C = {
  vidrio: '#E3F1FB',
  vidrioBorde: '#7FB3D9',
  vidrioTemplado: '#DCEFFA',
  reflejo: '#FFFFFF',
  simbolo: '#1B3A63',
  cota: '#6B7785',
  texto: '#1F2933',
  fijo: '#5B6670',
  herraje: '#7A848E',
  riel: '#AEB6BE',
  rielBorde: '#5B6670',
};

const mil = (n: number) => Math.round(n).toLocaleString('es-CO');
// Coordenadas con 2 decimales: el SVG queda corto y legible al depurar.
const n2 = (n: number) => String(Math.round(n * 100) / 100);

function cotas(partes: string[], ox: number, oy: number, W: number, H: number, s: number, ancho: number, alto: number) {
  const f = 8.5 * s;
  const yc = oy - 10 * s;
  partes.push(
    `<g stroke="${C.cota}" stroke-width="${n2(0.7 * s)}">` +
      `<line x1="${n2(ox)}" y1="${n2(yc)}" x2="${n2(ox + W)}" y2="${n2(yc)}"/>` +
      `<line x1="${n2(ox)}" y1="${n2(yc - 4 * s)}" x2="${n2(ox)}" y2="${n2(oy - 2 * s)}"/>` +
      `<line x1="${n2(ox + W)}" y1="${n2(yc - 4 * s)}" x2="${n2(ox + W)}" y2="${n2(oy - 2 * s)}"/>` +
      `</g>` +
      `<text x="${n2(ox + W / 2)}" y="${n2(yc - 3 * s)}" font-family="Helvetica" font-weight="bold" font-size="${n2(f)}" fill="${C.texto}" text-anchor="middle">${mil(ancho)} mm</text>`
  );
  const xc = ox - 10 * s;
  const cy = oy + H / 2;
  const xt = xc - 3 * s;
  partes.push(
    `<g stroke="${C.cota}" stroke-width="${n2(0.7 * s)}">` +
      `<line x1="${n2(xc)}" y1="${n2(oy)}" x2="${n2(xc)}" y2="${n2(oy + H)}"/>` +
      `<line x1="${n2(xc - 4 * s)}" y1="${n2(oy)}" x2="${n2(ox - 2 * s)}" y2="${n2(oy)}"/>` +
      `<line x1="${n2(xc - 4 * s)}" y1="${n2(oy + H)}" x2="${n2(ox - 2 * s)}" y2="${n2(oy + H)}"/>` +
      `</g>` +
      `<text x="${n2(xt)}" y="${n2(cy)}" font-family="Helvetica" font-weight="bold" font-size="${n2(f)}" fill="${C.texto}" text-anchor="middle" transform="rotate(-90 ${n2(xt)} ${n2(cy)})">${mil(alto)} mm</text>`
  );
}

function reflejo(partes: string[], gx: number, gy: number, gw: number, gh: number, s: number) {
  const r = Math.min(gw, gh) * 0.22;
  partes.push(
    `<g stroke="${C.reflejo}" stroke-width="${n2(1.4 * s)}" stroke-linecap="round">` +
      `<line x1="${n2(gx + r * 0.35)}" y1="${n2(gy + r * 0.95)}" x2="${n2(gx + r * 0.95)}" y2="${n2(gy + r * 0.35)}"/>` +
      `<line x1="${n2(gx + r * 0.35)}" y1="${n2(gy + r * 1.45)}" x2="${n2(gx + r * 1.45)}" y2="${n2(gy + r * 0.35)}"/>` +
      `</g>`
  );
}

/** Símbolo de la hoja dentro de su vidrio. */
function simbolo(partes: string[], tipo: string, gx: number, gy: number, gw: number, gh: number, s: number, apertura: Apertura) {
  const cx = gx + gw / 2;
  const cy = gy + gh / 2;
  if (tipo === 'X') {
    const largo = Math.min(gw * 0.6, 60 * s);
    const pc = Math.min(5 * s, largo * 0.18);
    const x1 = cx - largo / 2;
    const x2 = cx + largo / 2;
    partes.push(
      `<g data-simbolo="corrediza" stroke="${C.simbolo}" stroke-width="${n2(1.3 * s)}" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
        `<line x1="${n2(x1)}" y1="${n2(cy)}" x2="${n2(x2)}" y2="${n2(cy)}"/>` +
        `<polyline points="${n2(x1 + pc)},${n2(cy - pc)} ${n2(x1)},${n2(cy)} ${n2(x1 + pc)},${n2(cy + pc)}"/>` +
        `<polyline points="${n2(x2 - pc)},${n2(cy - pc)} ${n2(x2)},${n2(cy)} ${n2(x2 - pc)},${n2(cy + pc)}"/>` +
        `</g>`
    );
  } else if (tipo === 'O') {
    const fs = Math.min(7 * s, gw * 0.2);
    partes.push(
      `<text x="${n2(cx)}" y="${n2(cy + fs * 0.35)}" font-family="Helvetica" font-weight="bold" font-size="${n2(fs)}" fill="${C.fijo}" text-anchor="middle">FIJO</text>`
    );
  } else if (tipo === 'W') {
    // Proyectante: bisagra arriba, la punta del triángulo la señala.
    partes.push(
      `<polyline data-simbolo="proyectante" points="${n2(gx)},${n2(gy + gh)} ${n2(cx)},${n2(gy)} ${n2(gx + gw)},${n2(gy + gh)}" fill="none" stroke="${C.simbolo}" stroke-width="${n2(0.9 * s)}" stroke-dasharray="${n2(4 * s)} ${n2(3 * s)}"/>`
    );
  } else if ((tipo === 'Z' || tipo === 'P' || tipo === 'B') && apertura) {
    // Vista exterior: la punta señala el lado de la bisagra. En un plegable
    // todas las hojas pliegan hacia el mismo lado, así que todas apuntan igual.
    const ax = apertura === 'izquierda' ? gx : gx + gw;
    const bx = apertura === 'izquierda' ? gx + gw : gx;
    partes.push(
      `<polyline data-simbolo="apertura-${apertura}" points="${n2(bx)},${n2(gy)} ${n2(ax)},${n2(cy)} ${n2(bx)},${n2(gy + gh)}" fill="none" stroke="${C.simbolo}" stroke-width="${n2(0.9 * s)}" stroke-dasharray="${n2(4 * s)} ${n2(3 * s)}"/>`
    );
  }
}

/**
 * SVG del frente del producto. Las coordenadas son milímetros de fabricación
 * (los del plano); `s` convierte "puntos impresos" a esas unidades para que
 * grosores y textos salgan del mismo tamaño en una ventana de 600 mm y en una
 * de 4.000 mm (el dibujo se imprime a ~200 pt de lado mayor).
 */
export function svgDiseno(d: Pick<DibujoItem, 'plano' | 'cotaAnchoMm' | 'cotaAltoMm' | 'tipo' | 'color' | 'conMarco' | 'apertura'>): string {
  const { plano } = d;
  const W = plano.exterior.anchoMm || 1;
  const H = plano.exterior.altoMm || 1;
  const s = Math.max(W, H) / 200;
  const ox = 26 * s;
  const oy = 26 * s;
  const vbW = ox + W + 6 * s;
  const vbH = oy + H + 6 * s;
  const partes: string[] = [];
  cotas(partes, ox, oy, W, H, s, d.cotaAnchoMm, d.cotaAltoMm);
  const apertura = d.apertura ?? null;

  if (d.tipo === 'ventana' || d.conMarco) {
    const pal = paletaDeColor(d.color);
    partes.push(
      `<rect data-marco="1" x="${n2(ox)}" y="${n2(oy)}" width="${n2(W)}" height="${n2(H)}" fill="${pal.marco}" stroke="${pal.borde}" stroke-width="${n2(1.2 * s)}"/>`
    );
    const filas = new Set(plano.paneles.map((p) => p.fila)).size;
    const ultimaCol = new Map<number, number>();
    for (const p of plano.paneles) ultimaCol.set(p.fila, Math.max(ultimaCol.get(p.fila) ?? 0, p.col));
    const m = 4 * s; // perfil perimetral: proporción visual, no la medida real
    for (const p of plano.paneles) {
      const izq = p.col === 0 ? m : m / 2;
      const der = p.col === ultimaCol.get(p.fila) ? m : m / 2;
      const arr = p.fila === 0 ? m : m / 2;
      const aba = p.fila === filas - 1 ? m : m / 2;
      const px = ox + p.xMm + izq;
      const py = oy + p.yMm + arr;
      const pw = p.anchoMm - izq - der;
      const ph = p.altoMm - arr - aba;
      if (pw <= 0 || ph <= 0) continue;
      const hoja = Math.min(4.5 * s, Math.min(pw, ph) * 0.12);
      const gx = px + hoja;
      const gy = py + hoja;
      const gw = pw - 2 * hoja;
      const gh = ph - 2 * hoja;
      partes.push(
        `<rect x="${n2(px)}" y="${n2(py)}" width="${n2(pw)}" height="${n2(ph)}" fill="${pal.hoja}" stroke="${pal.borde}" stroke-width="${n2(0.6 * s)}"/>`,
        `<rect x="${n2(gx)}" y="${n2(gy)}" width="${n2(gw)}" height="${n2(gh)}" fill="${C.vidrio}" stroke="${C.vidrioBorde}" stroke-width="${n2(0.6 * s)}"/>`
      );
      reflejo(partes, gx, gy, gw, gh, s);
      simbolo(partes, p.tipo.toUpperCase(), gx, gy, gw, gh, s, apertura);
    }
  } else {
    // Cabina en vidrio templado: sin marco. La corrediza lleva el riel arriba.
    const riel = d.tipo === 'cabinaCorrediza' ? 6 * s : 0;
    if (riel) {
      partes.push(
        `<rect data-riel="1" x="${n2(ox - 2 * s)}" y="${n2(oy)}" width="${n2(W + 4 * s)}" height="${n2(riel)}" rx="${n2(riel / 2)}" fill="${C.riel}" stroke="${C.rielBorde}" stroke-width="${n2(0.6 * s)}"/>`
      );
    }
    const gap = 2.5 * s;
    for (const p of plano.paneles) {
      const gx = ox + p.xMm + gap / 2;
      const gy = oy + p.yMm + riel + gap;
      const gw = p.anchoMm - gap;
      const gh = p.altoMm - riel - gap;
      if (gw <= 0 || gh <= 0) continue;
      partes.push(
        `<rect x="${n2(gx)}" y="${n2(gy)}" width="${n2(gw)}" height="${n2(gh)}" fill="${C.vidrioTemplado}" stroke="${C.vidrioBorde}" stroke-width="${n2(0.9 * s)}"/>`
      );
      reflejo(partes, gx, gy, gw, gh, s);
      const t = p.tipo.toUpperCase();
      // Bisagras: dos pastillas en el lado de la bisagra, solo si se sabe cuál es.
      if ((t === 'Z' || t === 'P') && apertura) {
        const bx = apertura === 'izquierda' ? gx - 1.5 * s : gx + gw - 3.5 * s;
        for (const fy of [0.12, 0.82]) {
          partes.push(
            `<rect data-bisagra="1" x="${n2(bx)}" y="${n2(gy + gh * fy)}" width="${n2(5 * s)}" height="${n2(12 * s)}" rx="${n2(s)}" fill="${C.herraje}"/>`
          );
        }
      }
      simbolo(partes, t, gx, gy, gw, gh, s, apertura);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n2(vbW)} ${n2(vbH)}" width="${n2(vbW / s)}" height="${n2(vbH / s)}">${partes.join('')}</svg>`;
}

/**
 * Cabina en L vista desde arriba: el frente (X) resaltado abajo y el costado
 * (Y) a 90°. Sin lado Y se dibuja con la mitad del frente y se rotula
 * "Costado" sin medida, para no inventar un número. La orientación real de la
 * L no se guarda: el costado sale siempre a la izquierda (es la forma, no la
 * posición).
 */
export function svgPlantaL(xMm: number, yMm: number | null): string {
  const X = 100;
  const Y = yMm && xMm > 0 ? Math.max(25, Math.min(100, (yMm / xMm) * X)) : X / 2;
  const ox = 8;
  const oy = 14;
  const g = 3.2;
  const partes = [
    `<polyline points="${ox - 4},${n2(oy + Y + 2)} ${ox - 4},${oy - 6} ${ox + X + 6},${oy - 6}" fill="none" stroke="#B6BEC6" stroke-width="1" stroke-dasharray="2 2"/>`,
    `<rect x="${ox}" y="${oy}" width="${g}" height="${n2(Y)}" fill="#9CC9EA" stroke="#5E9CCB" stroke-width="0.6"/>`,
    `<rect x="${ox}" y="${n2(oy + Y - g)}" width="${X}" height="${g}" fill="#1B3A63"/>`,
    `<text x="${ox + X / 2}" y="${n2(oy + Y + 11)}" font-family="Helvetica" font-weight="bold" font-size="7.5" fill="#1B3A63" text-anchor="middle">Frente X${xMm > 0 ? ` · ${mil(xMm)} mm` : ''}</text>`,
    `<text x="${ox + 8}" y="${n2(oy + Y / 2 + 2)}" font-family="Helvetica" font-size="7" fill="#33414F">${yMm ? `Costado Y · ${mil(yMm)} mm` : 'Costado'}</text>`,
  ];
  const vbW = ox + X + 12;
  const vbH = oy + Y + 16;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${n2(vbH)}" width="${vbW}" height="${n2(vbH)}">${partes.join('')}</svg>`;
}

/** Texto del aviso de la cabina en L. */
export function textoAvisoL(cotaAnchoMm: number, ladoYMm: number | null): string {
  return ladoYMm
    ? `El dibujo muestra solo el frente (lado X, ${mil(cotaAnchoMm)} mm). El costado (lado Y, ${mil(ladoYMm)} mm) va a 90° y no se dibuja.`
    : 'El dibujo muestra solo el frente; el costado va a 90° y no se dibuja.';
}

/** Leyenda de símbolos: solo los que aparecen en el anexo. */
export function leyendaSimbolos(dibujos: DibujoItem[]): Array<{ svg: string; texto: string }> {
  const tipos = new Set<string>();
  for (const d of dibujos) {
    for (const p of d.plano.paneles) {
      const t = p.tipo.toUpperCase();
      // Una hoja que abre sin "Abre hacia" no lleva símbolo: no va en la leyenda.
      if ((t === 'Z' || t === 'P' || t === 'B') && !d.apertura) continue;
      tipos.add(t);
    }
  }
  const caja = (dentro: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 16" width="22" height="16"><rect x="0.5" y="0.5" width="21" height="15" fill="${C.vidrio}" stroke="${C.vidrioBorde}" stroke-width="0.8"/>${dentro}</svg>`;
  const out: Array<{ svg: string; texto: string }> = [];
  if (tipos.has('X')) {
    out.push({
      svg: caja(`<g stroke="${C.simbolo}" stroke-width="1.1" fill="none" stroke-linecap="round"><line x1="5" y1="8" x2="17" y2="8"/><polyline points="8,5 5,8 8,11"/><polyline points="14,5 17,8 14,11"/></g>`),
      texto: 'Hoja corrediza',
    });
  }
  if (tipos.has('O')) {
    out.push({
      svg: caja(`<text x="11" y="10.2" font-family="Helvetica" font-weight="bold" font-size="5.5" fill="${C.fijo}" text-anchor="middle">FIJO</text>`),
      texto: 'Paño fijo',
    });
  }
  if (tipos.has('W')) {
    out.push({
      svg: caja(`<polyline points="2,14 11,2 20,14" fill="none" stroke="${C.simbolo}" stroke-width="0.8" stroke-dasharray="2 1.5"/>`),
      texto: 'Proyectante (abre hacia afuera)',
    });
  }
  if (tipos.has('Z') || tipos.has('P') || tipos.has('B')) {
    out.push({
      svg: caja(`<polyline points="20,2 2,8 20,14" fill="none" stroke="${C.simbolo}" stroke-width="0.8" stroke-dasharray="2 1.5"/>`),
      texto: 'Hoja que abre: la punta señala la bisagra',
    });
  }
  return out;
}
