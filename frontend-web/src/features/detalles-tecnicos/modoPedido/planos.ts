import { conteosDe } from '../modelo/geometria';
import { medidaPedido, piezaConMedidas } from '../modelo/plantillas';
import type { Pieza, Plano, RotulosCota } from '../modelo/tipos';
import { validarPlano, type Observacion } from '../modelo/validaciones';
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
 * —los herrajes se miden desde los bordes— y queda como cambio sin guardar. Se compara con
 * `medidaPedido` (en un desplome, el ancho mayor). Con `soloLectura` (letra bloqueada porque su
 * pedido ya se envió, o usuario que no puede editar) no se reescala: quedaría «sin guardar» sin
 * poder guardarse, y eso deshabilita «Descargar Excel»; además el papel del proveedor es el
 * guardado (2026-10-17).
 */
export function planoDeDT(p: PlanoDT, itemsLetra: ItemDT[], soloLectura = false): Plano {
  const primero = itemsLetra[0];
  const ancho = primero?.ancho_mm ?? 0;
  const alto = primero?.alto_mm ?? 0;
  const actual = medidaPedido(p.pieza);
  const reescalar = !soloLectura && ancho > 0 && alto > 0 && (actual.ancho !== ancho || actual.alto !== alto);
  return {
    id: `dt-${p.letra}`,
    letra: p.letra,
    plantillaId: p.plantilla_id ?? '',
    nombre: p.nombre,
    ...datosDeItems(itemsLetra),
    selloEnCanto: p.sello_en_canto,
    observaciones: p.observaciones ?? '',
    // Los rótulos quedan como se guardaron (los de la imagen que tiene el Excel); el editor los
    // recalcula en `useDisenoPedido` para las letras que todavía se pueden editar.
    pieza: reescalar ? piezaConMedidas(p.pieza, ancho, alto) : p.pieza,
  };
}

/**
 * Qué cota general va con palabra: la del eje en que los vidrios de la letra no miden lo mismo
 * (2026-10-17). Se mira la letra en todo el grupo (principal + extensiones), no solo en un
 * pedido: hay una sola imagen por letra. `undefined` = las dos con número.
 */
export function rotulosDeLetra(itemsLetra: ItemDT[]): RotulosCota | undefined {
  const ancho = new Set(itemsLetra.map((i) => i.ancho_mm)).size > 1;
  const alto = new Set(itemsLetra.map((i) => i.alto_mm)).size > 1;
  return ancho || alto ? { ancho, alto } : undefined;
}

/** La pieza con los rótulos que le tocan según los vidrios de su letra. */
export function conRotulos(pieza: Pieza, itemsLetra: ItemDT[]): Pieza {
  const resto: Pieza = { ...pieza };
  delete resto.rotulos;
  const rotulos = rotulosDeLetra(itemsLetra);
  return rotulos ? { ...resto, rotulos } : resto;
}

/**
 * El plano con los rótulos al día: lo que se dibuja, se imprime y se guarda. Una letra bloqueada
 * (su pedido ya se envió) conserva los guardados: recalcularlos la dejaría «sin guardar» sin
 * poder guardarse, y eso deshabilita «Descargar Excel» de todo el pedido.
 */
export const planoConRotulos = (p: Plano, items: ItemDT[], bloqueadas: string[]): Plano =>
  p.letra && !bloqueadas.includes(p.letra) ? { ...p, pieza: conRotulos(p.pieza, itemsDeLetra(items, p.letra)) } : p;

/** Cantidad total, color y espesor de los vidrios de la letra (los dos últimos, del primero). */
export function datosDeItems(itemsLetra: ItemDT[]) {
  const primero = itemsLetra[0];
  return {
    cantidad: itemsLetra.reduce((s, i) => s + (i.cantidad || 0), 0) || 1,
    color: primero?.color ?? '',
    espesor: primero?.espesor ?? '',
  };
}

// ── Un plano para vidrios de varias medidas (2026-10-17) ─────────────────────
// Los vidrios de una letra comparten el diseño aunque no midan lo mismo: el dibujo está a la
// medida del primero y los herrajes se miden desde los bordes, así que la misma pieza llevada a
// otra medida (`piezaConMedidas`, la de siempre al reescalar) es el plano de ese vidrio.

/** Clave de una medida: `ancho_mm` y `alto_mm` son INTEGER en la BD, la clave es estable. */
export const claveMedida = (ancho: number, alto: number) => `${ancho}x${alto}`;

/** La pieza llevada a la medida de un vidrio de la letra (la misma si ya mide eso). */
export const piezaParaMedida = (pieza: Pieza, ancho: number, alto: number): Pieza => {
  const m = medidaPedido(pieza);
  return ancho === m.ancho && alto === m.alto ? pieza : piezaConMedidas(pieza, ancho, alto);
};

/** Clave de la medida del pedido que representa el dibujo. */
const clavePropia = (pieza: Pieza) => {
  const m = medidaPedido(pieza);
  return claveMedida(m.ancho, m.alto);
};

/** Medidas de la letra distintas de la del dibujo, una vez cada una, con el espesor de su vidrio. */
function otrasMedidas(pieza: Pieza, itemsLetra: ItemDT[]) {
  const vistas = new Set([clavePropia(pieza)]);
  const otras: { ancho: number; alto: number; espesor: string }[] = [];
  for (const i of itemsLetra) {
    if (!(i.ancho_mm && i.ancho_mm > 0 && i.alto_mm && i.alto_mm > 0)) continue;
    const k = claveMedida(i.ancho_mm, i.alto_mm);
    if (vistas.has(k)) continue;
    vistas.add(k);
    otras.push({ ancho: i.ancho_mm, alto: i.alto_mm, espesor: i.espesor ?? '' });
  }
  return otras;
}

/**
 * Valida el plano contra TODAS las medidas de su letra, no solo la del dibujo: una perforación
 * a 900 mm cabe en el vidrio de 1000 y queda afuera en el de 700. Los avisos de las otras
 * medidas que no salieron ya en la del dibujo se agregan con la medida delante.
 */
export function validarLetra(plano: Plano, itemsLetra: ItemDT[]): Observacion[] {
  const base = validarPlano(plano);
  const vistos = new Set(base.map((o) => o.texto));
  const extra: Observacion[] = [];
  for (const m of otrasMedidas(plano.pieza, itemsLetra)) {
    const pieza = piezaConMedidas(plano.pieza, m.ancho, m.alto);
    // `piezaConMedidas` clona con ids nuevos y en el mismo orden: el aviso se devuelve con el id
    // del herraje del editor, para que un clic lo seleccione.
    const idOriginal = new Map(pieza.operaciones.map((o, i) => [o.id, plano.pieza.operaciones[i]?.id]));
    const obs = validarPlano({ ...plano, espesor: m.espesor || plano.espesor, pieza });
    for (const o of obs) {
      if (vistos.has(o.texto)) continue;
      extra.push({
        nivel: o.nivel,
        texto: `En el vidrio de ${m.ancho} × ${m.alto}: ${o.texto.charAt(0).toLowerCase()}${o.texto.slice(1)}`,
        ...(o.opId && idOriginal.get(o.opId) ? { opId: idOriginal.get(o.opId) } : {}),
      });
    }
  }
  return [...base, ...extra];
}

/**
 * Metros de chaflán por medida de la letra, para el Excel (el servidor no tiene la geometría y
 * solo lee lo guardado). `undefined` si el plano no lleva chaflán.
 */
export function chaflanPorMedida(pieza: Pieza, itemsLetra: ItemDT[]): Record<string, number> | undefined {
  if (!pieza.operaciones.some((o) => o.tipo === 'chaflan')) return undefined;
  const r: Record<string, number> = {};
  for (const i of itemsLetra) {
    if (!(i.ancho_mm && i.ancho_mm > 0 && i.alto_mm && i.alto_mm > 0)) continue;
    const k = claveMedida(i.ancho_mm, i.alto_mm);
    if (!(k in r)) r[k] = +conteosDe(piezaParaMedida(pieza, i.ancho_mm, i.alto_mm)).chaflanMl.toFixed(3);
  }
  return Object.keys(r).length ? r : undefined;
}

/**
 * Lo que se guarda de un plano: si cambia, hay cambios sin guardar. Los rótulos van aparte y
 * como texto fijo: el JSONB de Postgres reordena las claves (`alto` antes que `ancho`, `rotulos`
 * antes que `contorno`), y con `JSON.stringify` directo un plano recién leído nunca coincidiría.
 * `chaflan` = el mapa por medida: cuenta solo qué OTRAS medidas cubre (la del dibujo ya va en la
 * pieza), así un plano anterior al mapa con una sola medida no aparece como cambio.
 */
export const firmaPlano = (p: Plano, chaflan?: Record<string, number>) => {
  const { rotulos, ...pieza } = p.pieza;
  const r = `${rotulos?.ancho ? 'A' : '-'}${rotulos?.alto ? 'H' : '-'}`;
  const propia = clavePropia(p.pieza);
  const c = Object.keys(chaflan ?? {}).filter((k) => k !== propia).sort().join(',');
  return JSON.stringify({ n: p.nombre, t: p.plantillaId, s: p.selloEnCanto, o: p.observaciones, p: pieza, r, c });
};

/** ¿Los vidrios de la letra miden distinto entre sí? El dibujo usa la medida del primero. */
export const medidasDistintas = (itemsLetra: ItemDT[]) =>
  new Set(itemsLetra.map((i) => `${i.ancho_mm}x${i.alto_mm}`)).size > 1;
