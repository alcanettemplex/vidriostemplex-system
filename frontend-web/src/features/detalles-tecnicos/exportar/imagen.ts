import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlanoSVG } from '../components/PlanoSVG';
import { encuadreHoja } from '../modelo/detalles';
import type { Pieza } from '../modelo/tipos';

// Área del dibujo dentro de la hoja «PLANO X» del Excel: columnas A–J (10 × 75 px) y filas
// 8–45 (38 × 20 px), con 20 px de aire por lado. Debe coincidir con `utils/detalleTecnico.ts`
// del backend, que ubica la imagen guardada con el tamaño que se calcula aquí.
export const AREA_DIBUJO = { ancho: 10 * 75 - 40, alto: 38 * 20 - 40 };
/** Resolución de la imagen respecto a su tamaño en la hoja: cotas nítidas al imprimir. */
const ESCALA = 2.5;

/** Tamaño en px que ocupa el dibujo respetando su proporción dentro del área disponible. */
export function encajar(pieza: Pieza, maxW = AREA_DIBUJO.ancho, maxH = AREA_DIBUJO.alto) {
  // Incluye el espacio de los detalles ampliados: la imagen guardada es la hoja completa.
  const { vista } = encuadreHoja(pieza);
  const ratio = vista.w / vista.h;
  const t = ratio > maxW / maxH ? { w: maxW, h: maxW / ratio } : { w: maxH * ratio, h: maxH };
  return { w: Math.round(t.w), h: Math.round(t.h) };
}

/** Dibuja el plano a PNG en alta resolución (el Excel no entiende SVG). Devuelve un data URL. */
export async function planoAPng(pieza: Pieza, selloEnCanto: boolean, anchoPx: number, altoPx: number): Promise<string> {
  const svg = renderToStaticMarkup(createElement(PlanoSVG, { pieza, selloEnCanto, width: anchoPx * ESCALA, height: altoPx * ESCALA }));
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = anchoPx * ESCALA;
  canvas.height = altoPx * ESCALA;
  // Fondo transparente: así la imagen no tapa los bordes de celda del marco.
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}
