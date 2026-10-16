import { piezaConMedidas } from '../modelo/plantillas';
import type { Plano } from '../modelo/tipos';
import type { DisenoPedido, ItemDT, PlanoDT } from './api';

/** Vidrios con la letra `letra`. Con `pedidoId`, solo los de ese pedido (principal o extensión). */
export const itemsDeLetra = (items: ItemDT[], letra: string, pedidoId?: number) =>
  items.filter((i) => i.letra === letra && (pedidoId === undefined || i.pedido_pv_id === pedidoId));

/** Letras del grupo: las de los vidrios y, además, las de planos que se quedaron sin vidrios. */
export function letrasDe(d: DisenoPedido, planos: { letra?: string }[] = d.planos): string[] {
  const s = new Set<string>();
  d.items.forEach((i) => i.letra && s.add(i.letra));
  planos.forEach((p) => p.letra && s.add(p.letra));
  return Array.from(s).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}

/**
 * Plano guardado → plano del editor. El dibujo se muestra con las medidas del PRIMER vidrio
 * de la letra (decisión 2026-10-16): si la ODP cambió esas medidas, el plano se reescala solo
 * —los herrajes se miden desde los bordes— y queda como cambio sin guardar.
 */
export function planoDeDT(p: PlanoDT, itemsLetra: ItemDT[]): Plano {
  const primero = itemsLetra[0];
  const ancho = primero?.ancho_mm ?? 0;
  const alto = primero?.alto_mm ?? 0;
  const reescalar = ancho > 0 && alto > 0 && (p.pieza.ancho !== ancho || p.pieza.alto !== alto);
  return {
    id: `dt-${p.letra}`,
    letra: p.letra,
    plantillaId: p.plantilla_id ?? '',
    nombre: p.nombre,
    ...datosDeItems(itemsLetra),
    selloEnCanto: p.sello_en_canto,
    observaciones: p.observaciones ?? '',
    pieza: reescalar ? piezaConMedidas(p.pieza, ancho, alto) : p.pieza,
  };
}

/** Cantidad total, color y espesor de los vidrios de la letra (los dos últimos, del primero). */
export function datosDeItems(itemsLetra: ItemDT[]) {
  const primero = itemsLetra[0];
  return {
    cantidad: itemsLetra.reduce((s, i) => s + (i.cantidad || 0), 0) || 1,
    color: primero?.color ?? '',
    espesor: primero?.espesor ?? '',
  };
}

/** Lo que se guarda de un plano: si cambia, hay cambios sin guardar. */
export const firmaPlano = (p: Plano) =>
  JSON.stringify({ n: p.nombre, t: p.plantillaId, s: p.selloEnCanto, o: p.observaciones, p: p.pieza });

/** ¿Los vidrios de la letra miden distinto entre sí? El dibujo usa la medida del primero. */
export const medidasDistintas = (itemsLetra: ItemDT[]) =>
  new Set(itemsLetra.map((i) => `${i.ancho_mm}x${i.alto_mm}`)).size > 1;
