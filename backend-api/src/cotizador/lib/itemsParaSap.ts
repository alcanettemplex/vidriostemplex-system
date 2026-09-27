// Filas de una SAP (Solicitud de Accesorios y Perfilería) a partir de la
// propuesta ELEGIDA de una cotización aprobada (2026-09-27, integración con el
// ERP — botón "Traer ítems de la cotización" de la ficha ODP).
//
// FUNCIÓN PURA: no consulta Postgres ni la caché del Cotizador. El llamador
// (`sap.controller.ts` → `traerItemsDeCotizacion`) le entrega los ítems ya
// leídos y el mapa de equivalencias código-del-Cotizador → código del catálogo
// del ERP. Así se prueba sin base de datos (`itemsParaSap.test.ts`).
//
// Qué trae y cómo (decisiones del usuario, 2026-09-27):
//   - PERFILERÍA CON CORTES (ítem con diseño): una fila por código de perfil;
//     DIMENSIÓN = cortes "cantidad-medida" separados por " / ", ya multiplicados
//     por las piezas del ítem; CANT. = barras de 6 m. La cuenta de barras NO se
//     repite aquí: la hace `generarPerfileriaSAP` (barra fija de 6 m, 5 % de
//     desperdicio por perfil, piezas enteras para lo que se vende por unidad).
//   - PERFILERÍA SIN CORTES (medidas libres, o blob anterior al 2026-09-21 sin
//     % de desperdicio): barras desde los metros del BOM, DIMENSIÓN
//     "Total 4,2 m" y OBSERVACIÓN "Medir en obra: sin cortes calculados".
//   - ACCESORIOS: código, descripción, cantidad × piezas, unidad. Sin dimensión.
//   - PELÍCULA Y MATIZADO: una fila por tamaño de paño ("750 x 1600", el mismo
//     formato que ya escriben los asesores en la SAP), cantidad = paños.
//   - NO trae vidrio ni sus procesos (BPB, perforaciones, boquetes): van con el
//     vidrio al Pedido PV. Se informan en `excluidos` para que nadie los busque.
//
// Todo lo que sale de aquí queda EDITABLE en la SAP como cualquier ítem.

import { generarPerfileriaSAP } from './generadorSapPerfileria';
import type { CortePerfil, CorteVidrio } from '../tipos';

/** Barra comercial fija (misma constante que `generadorSapPerfileria.ts`). */
const MM_POR_BARRA = 6000;
/** `sap_items.dimension` es VARCHAR(100): lo que no quepa va a la observación. */
const MAX_DIMENSION = 100;

export const OBS_SIN_CORTES = 'Medir en obra: sin cortes calculados';
export const OBS_SIN_MEDIDA_PANO = 'Medir en obra: sin medida de paño';
export const OBS_NO_APTO = 'Verificar medidas antes de cortar: despiece no apto para corte';

/** Línea del BOM tal como la guarda el motor en `resultado.items`. Laxa: los
 * blobs viejos pueden no traer todos los campos. */
export interface LineaBomLaxa {
  codigo?: string | null;
  descripcion?: string | null;
  categoria?: string | null;
  unidad?: string | null;
  cantidad?: number | string | null;
  error?: boolean | null;
}

export interface ItemCotizacionParaSap {
  moduloId?: string | null;
  descripcionItem?: string | null;
  cantidadPiezas?: number | string | null;
  aptoParaCorte?: boolean | null;
  input?: Record<string, unknown> | null;
  resultado?: {
    items?: LineaBomLaxa[] | null;
    cortes?: { perfiles?: CortePerfil[] | null; vidrios?: CorteVidrio[] | null } | null;
    cantidadPiezas?: number | null;
    aptoParaCorte?: boolean | null;
    descripcionComercial?: string | null;
  } | null;
}

/** Identidad del producto en el catálogo del ERP (`catalogo_productos`), que es
 * el que usan Compras y la SAP. El Cotizador tiene códigos propios para 105
 * productos (p. ej. PRV700MATE ↔ CAB0103): sin traducir, Compras no los
 * encontraría y `tiene_aluminio` no se marcaría. */
export interface EquivalenciaCatalogo {
  codigo: string;
  descripcion: string;
}

export interface OpcionesItemsParaSap {
  /** código del Cotizador → producto del catálogo del ERP. */
  equivalencias?: ReadonlyMap<string, EquivalenciaCatalogo>;
  /** Índice (0 = A) de la primera letra a asignar. "Agregar debajo" pasa el
   * siguiente al mayor que ya usa la SAP. */
  indiceInicial?: number;
  /** Se copia a cada fila (`sap_items.origen_cotizacion_id`). */
  origenCotizacionId?: number | null;
}

export type TipoFilaSap = 'perfil' | 'perfil_sin_cortes' | 'accesorio' | 'acabado';

export interface FilaSap {
  item: string;
  codigo: string;
  descripcion: string;
  dimension: string;
  cantidad: number;
  und: string;
  observacion: string;
  origen_cotizacion_id: number | null;
  /** Solo informativo (la previsualización lo muestra); no se guarda. */
  tipo: TipoFilaSap;
}

export interface ExcluidoSap {
  codigo: string;
  descripcion: string;
  motivo: string;
}

export interface ResultadoItemsParaSap {
  filas: FilaSap[];
  advertencias: string[];
  excluidos: ExcluidoSap[];
}

// ─── Utilidades ─────────────────────────────────────────────────────────────

/** Convención de letras del ERP (SAPModal): A…Z y después "27", "28"… — que
 * la ficha pinta como AA, AB. No se usa "AA" literal: el orden de la tabla de
 * la ficha (`toIdx`) sólo entiende una letra o un número. */
export function letraDeIndice(indice: number): string {
  return indice < 26 ? String.fromCharCode(65 + indice) : String(indice + 1);
}

/** Inversa de `letraDeIndice`; -1 si la letra no sigue la convención. */
export function indiceDeLetra(letra: string | null | undefined): number {
  const t = String(letra ?? '').trim().toUpperCase();
  if (/^[A-Z]$/.test(t)) return t.charCodeAt(0) - 65;
  if (/^[A-Z]{2}$/.test(t)) return (t.charCodeAt(0) - 64) * 26 + (t.charCodeAt(1) - 65);
  const n = parseInt(t, 10);
  return Number.isFinite(n) && n > 0 ? n - 1 : -1;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** Hacia arriba a 2 decimales: una cantidad por metro nunca se pide de menos. */
const ceil2 = (n: number) => Math.ceil(Number((n * 100).toFixed(6))) / 100;
const barrasDe = (metros: number) => Math.ceil(Number((metros / (MM_POR_BARRA / 1000)).toFixed(6)));
/** 4.2 → "4,2" (coma decimal colombiana, sin depender del ICU de Node). */
const decimalCo = (n: number) => String(round2(n)).replace('.', ',');

function piezasDe(item: ItemCotizacionParaSap): number {
  const n = Math.floor(num(item.cantidadPiezas ?? item.resultado?.cantidadPiezas ?? item.input?.cantidadPiezas ?? 1));
  return n > 0 ? n : 1;
}

function nombreDe(item: ItemCotizacionParaSap, indice: number): string {
  return (
    item.descripcionItem?.trim() ||
    item.resultado?.descripcionComercial?.trim() ||
    `ítem ${indice + 1}`
  );
}

/** Unidad del Cotizador → la abreviatura corta que cabe en `sap_items.und`. */
function unidadSap(unidad: string | null | undefined): string {
  const u = String(unidad ?? '').trim().toUpperCase();
  if (u === 'UND' || u === 'UN' || u === 'UNIDAD') return 'UND';
  if (u === 'X METRO' || u === 'ML' || u === 'M') return 'ML';
  if (u === 'X M2' || u === 'M2') return 'M2';
  return u.slice(0, 20);
}

type Clase = 'perfil' | 'accesorio' | 'acabado' | 'vidrio' | 'proceso_vidrio';

/**
 * Qué es cada línea del BOM. No basta la categoría del catálogo: hay dos
 * productos mal categorizados como VIDRIO que no lo son —GPI1102 (guía de piso
 * de nylon, un accesorio de las cabinas) y PEL0107 (película control solar)—,
 * así que película/matizado y la guía se reconocen por código antes que por
 * categoría.
 */
function clasificar(linea: LineaBomLaxa): Clase {
  const codigo = String(linea.codigo ?? '').toUpperCase();
  const categoria = String(linea.categoria ?? '').toUpperCase();
  if (/^(PELI|PEL0|MATI)/.test(codigo)) return 'acabado';
  if (/^GPI/.test(codigo)) return 'accesorio';
  if (categoria === 'PERFILERIA') return 'perfil';
  if (categoria === 'VIDRIO') return 'vidrio';
  // BPB, perforaciones, boquetes: los hace el proveedor del vidrio.
  if (categoria === 'ACABADO') return 'proceso_vidrio';
  return 'accesorio';
}

/** Tamaños de paño de un ítem: los del despiece si tiene diseño; si no, la
 * medida del formulario (cm → mm). Proyectante sin diseño: medida por nave. */
function panosDe(item: ItemCotizacionParaSap): Array<{ anchoMm: number; altoMm: number; cantidad: number }> {
  const vidrios = item.resultado?.cortes?.vidrios;
  if (Array.isArray(vidrios) && vidrios.length > 0) {
    return vidrios
      .filter((v) => num(v.anchoMm) > 0 && num(v.altoMm) > 0)
      .map((v) => ({ anchoMm: Math.round(num(v.anchoMm)), altoMm: Math.round(num(v.altoMm)), cantidad: Math.max(1, num(v.cantidad)) }));
  }
  const i = item.input ?? {};
  const porNave = i.anchoCm == null && i.anchoNaveCm != null;
  const anchoMm = Math.round(num(i.anchoCm ?? i.anchoNaveCm) * 10);
  const altoMm = Math.round(num(i.altoCm ?? i.altoNaveCm) * 10);
  if (!(anchoMm > 0 && altoMm > 0)) return [];
  const naves = porNave ? Math.max(1, Math.floor(num(i.numeroNaves) || 1)) : 1;
  return [{ anchoMm, altoMm, cantidad: naves }];
}

// ─── Armado ─────────────────────────────────────────────────────────────────

interface Acumulado {
  tipo: TipoFilaSap;
  codigo: string;
  descripcion: string;
  dimension: string;
  cantidad: number;
  metros: number;
  und: string;
  observaciones: Set<string>;
}

export function itemsParaSap(
  items: ItemCotizacionParaSap[],
  opciones: OpcionesItemsParaSap = {}
): ResultadoItemsParaSap {
  const equivalencias = opciones.equivalencias ?? new Map<string, EquivalenciaCatalogo>();
  const advertencias: string[] = [];
  const excluidos = new Map<string, ExcluidoSap>();

  const codigoErp = (codigo: string) => equivalencias.get(codigo)?.codigo ?? codigo;
  /** Descripción: la del catálogo del ERP; si no hay equivalencia, la que el
   * Cotizador guardó en el BOM. */
  const descripcionDe = (codigoCotizador: string, respaldo: string | null | undefined) =>
    equivalencias.get(codigoCotizador)?.descripcion || respaldo?.trim() || codigoCotizador;
  const sinEquivalencia = new Set<string>();
  const anotarEquivalencia = (codigo: string) => {
    if (!equivalencias.has(codigo)) sinEquivalencia.add(codigo);
  };

  // Entrada para el generador: los cortes de todos los ítems, multiplicados por
  // sus piezas y ya con el código del ERP, en el orden en que el asesor cargó
  // los productos (el generador agrupa por código en orden de aparición).
  const itemsGenerador: Array<{ descripcion: string; resultado: { cortes: { perfiles: CortePerfil[] } } }> = [];
  const descripcionPerfil = new Map<string, string>(); // código ERP → descripción
  const perfilesNoAptos = new Set<string>(); // códigos ERP con algún corte no apto

  const sinCortes = new Map<string, Acumulado>();
  const accesorios = new Map<string, Acumulado>();
  const acabados = new Map<string, Acumulado>();

  items.forEach((item, indice) => {
    const nombre = nombreDe(item, indice);
    const piezas = piezasDe(item);
    const bom = Array.isArray(item.resultado?.items) ? item.resultado!.items! : [];
    const descripcionBom = new Map<string, string>();
    for (const l of bom) if (l.codigo && l.descripcion) descripcionBom.set(String(l.codigo), String(l.descripcion));

    // ── Perfiles con cortes ──
    // Un corte sin código ya aparece como línea ERROR en el BOM (se avisa abajo).
    // Uno sin % de desperdicio es de un blob anterior al 2026-09-21: cae a la
    // rama "sin cortes" en vez de perderse.
    const cortes = (item.resultado?.cortes?.perfiles ?? []).filter(
      (c): c is CortePerfil & { codigo: string } => Boolean(c.codigo) && c.desperdicioPct !== undefined
    );
    const codigosConCortes = new Set(cortes.map((c) => c.codigo));
    const noApto = item.aptoParaCorte === false || item.resultado?.aptoParaCorte === false;
    if (cortes.length > 0) {
      itemsGenerador.push({
        descripcion: nombre,
        resultado: {
          cortes: {
            perfiles: cortes.map((c) => {
              const erp = codigoErp(c.codigo);
              anotarEquivalencia(c.codigo);
              if (!descripcionPerfil.has(erp)) {
                descripcionPerfil.set(erp, descripcionDe(c.codigo, descripcionBom.get(c.codigo) ?? c.descripcion ?? c.ref));
              }
              if (noApto) perfilesNoAptos.add(erp);
              return {
                ...c,
                codigo: erp,
                cantidad: num(c.cantidad) * piezas,
                ...(typeof c.piezasEnteras === 'number' ? { piezasEnteras: c.piezasEnteras * piezas } : {}),
              };
            }),
          },
        },
      });
    }

    // ── Líneas del BOM ──
    for (const linea of bom) {
      const codigo = String(linea.codigo ?? '').trim();
      if (linea.error || String(linea.categoria ?? '').toUpperCase() === 'ERROR') {
        advertencias.push(`${nombre}: "${linea.descripcion ?? codigo}" tiene un error en la cotización y no se trajo. Revísalo y agrégalo a mano si hace falta.`);
        continue;
      }
      if (!codigo) continue;
      const clase = clasificar(linea);
      const cantidadPieza = num(linea.cantidad);

      if (clase === 'vidrio' || clase === 'proceso_vidrio') {
        if (!excluidos.has(codigo)) {
          excluidos.set(codigo, {
            codigo,
            descripcion: linea.descripcion ?? codigo,
            motivo: clase === 'vidrio' ? 'Vidrio: va al Pedido PV' : 'Proceso del vidrio: va con el vidrio al Pedido PV',
          });
        }
        continue;
      }

      const erp = codigoErp(codigo);
      anotarEquivalencia(codigo);
      const descripcion = descripcionDe(codigo, linea.descripcion);

      if (clase === 'perfil') {
        if (codigosConCortes.has(codigo)) continue; // ya viene de los cortes
        const porUnidad = unidadSap(linea.unidad) === 'UND';
        const acc = sinCortes.get(erp) ?? {
          tipo: 'perfil_sin_cortes' as const, codigo: erp, descripcion, dimension: '', cantidad: 0, metros: 0, und: '',
          observaciones: new Set([OBS_SIN_CORTES]),
        };
        if (porUnidad) acc.cantidad += cantidadPieza * piezas;
        else acc.metros += cantidadPieza * piezas;
        sinCortes.set(erp, acc);
        continue;
      }

      if (clase === 'accesorio') {
        const acc = accesorios.get(erp) ?? {
          tipo: 'accesorio' as const, codigo: erp, descripcion, dimension: '', cantidad: 0, metros: 0,
          und: unidadSap(linea.unidad), observaciones: new Set<string>(),
        };
        acc.cantidad += cantidadPieza * piezas;
        accesorios.set(erp, acc);
        continue;
      }

      // Película / matizado: una fila por tamaño de paño.
      const panos = panosDe(item);
      if (panos.length === 0) {
        const clave = `${erp}|`;
        const acc = acabados.get(clave) ?? {
          tipo: 'acabado' as const, codigo: erp, descripcion, dimension: '', cantidad: 0, metros: 0,
          und: unidadSap(linea.unidad), observaciones: new Set([OBS_SIN_MEDIDA_PANO]),
        };
        acc.cantidad += cantidadPieza * piezas;
        acabados.set(clave, acc);
        advertencias.push(`${nombre}: no se encontró la medida del paño para ${descripcion}; se trajo la cantidad del BOM y hay que medir en obra.`);
        continue;
      }
      for (const p of panos) {
        const dimension = `${p.anchoMm} x ${p.altoMm}`;
        const clave = `${erp}|${dimension}`;
        const acc = acabados.get(clave) ?? {
          tipo: 'acabado' as const, codigo: erp, descripcion, dimension, cantidad: 0, metros: 0, und: '',
          observaciones: new Set<string>(),
        };
        acc.cantidad += p.cantidad * piezas;
        acabados.set(clave, acc);
      }
    }
  });

  // ── Perfilería con cortes: la cuenta de barras es del generador ──
  const generado = generarPerfileriaSAP(itemsGenerador);
  advertencias.push(...generado.advertencias);

  const acumulados: Acumulado[] = [];
  for (const f of generado.filas) {
    acumulados.push({
      tipo: 'perfil',
      codigo: f.codigo,
      descripcion: descripcionPerfil.get(f.codigo) ?? f.descripcion,
      dimension: f.dimension.split('/ ').join(' / '),
      cantidad: f.cantidad,
      metros: 0,
      und: '',
      observaciones: new Set(perfilesNoAptos.has(f.codigo) ? [OBS_NO_APTO] : []),
    });
  }
  for (const acc of sinCortes.values()) {
    if (acc.metros > 0) {
      acc.cantidad += barrasDe(acc.metros);
      acc.dimension = `Total ${decimalCo(acc.metros)} m`;
    }
    acumulados.push(acc);
  }
  for (const acc of accesorios.values()) {
    acc.cantidad = acc.und === 'UND' ? Math.ceil(Number(acc.cantidad.toFixed(6))) : ceil2(acc.cantidad);
    acumulados.push(acc);
  }
  for (const acc of acabados.values()) {
    acc.cantidad = acc.dimension ? Math.round(acc.cantidad) : ceil2(acc.cantidad);
    acumulados.push(acc);
  }

  if (sinEquivalencia.size > 0) {
    advertencias.push(
      `Sin equivalencia en el catálogo del ERP (se trajo el código del Cotizador): ${[...sinEquivalencia].join(', ')}. ` +
        'Compras puede no encontrarlos: revísalos antes de pedir.'
    );
  }

  const indiceInicial = Math.max(0, Math.floor(opciones.indiceInicial ?? 0));
  const filas: FilaSap[] = acumulados.map((a, i) => {
    const observaciones = [...a.observaciones];
    let dimension = a.dimension;
    if (dimension.length > MAX_DIMENSION) {
      // No se trunca una medida de corte: la lista completa va a la observación.
      observaciones.push(`Cortes: ${dimension}`);
      dimension = 'Ver cortes en observación';
    }
    return {
      item: letraDeIndice(indiceInicial + i),
      codigo: a.codigo.slice(0, 50),
      descripcion: a.descripcion.slice(0, 255),
      dimension,
      cantidad: round2(a.cantidad),
      und: a.und,
      observacion: observaciones.join('. '),
      origen_cotizacion_id: opciones.origenCotizacionId ?? null,
      tipo: a.tipo,
    };
  });

  return { filas, advertencias, excluidos: [...excluidos.values()] };
}
