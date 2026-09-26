// Personalización de componentes de un ítem (2026-09-23).
//
// El asesor cotiza un sistema (una ventana 5020, una cabina…) y el motor del
// módulo arma el despiece estándar. Pero el cliente pide cosas que el estándar
// no trae: otra chapa, un vidrio miniboreal, un pedazo de perfil de más. Esto
// aplica esas decisiones SOBRE el despiece del motor, sin tocar el motor:
//
//   · cambios  — reemplazar un código por otro que se cobre en la misma clase
//                de unidad (m², metro, unidad). Misma cantidad.
//   · quitados — sacar un componente del despiece.
//   · extras   — agregar un componente. Un perfil se pide como medida (mm) ×
//                piezas y se cobra en metros con el 5 % de desperdicio, igual
//                que los perfiles del diseño; el resto, en la unidad del catálogo.
//
// DÓNDE VIVE: en `input.personalizacion` del ítem. Por eso sobrevive a todo lo
// que recalcula un ítem (editarlo, cambiar el segmento, clonar la propuesta):
// siempre se aplica sobre el despiece que el motor da EN ESE MOMENTO, con los
// precios de ESE segmento. Si el componente original ya no está (p. ej. cambió
// el color y el perfil mate pasó a ser el negro), el cambio no se aplica y se
// avisa — nunca se adivina a cuál correspondería.
//
// PERFILERÍA: tocar un perfil (cambiarlo, quitarlo o agregarlo) deja el ítem NO
// APTO para orden de corte ni SAP (decisión del usuario, 2026-09-23): el
// despiece calculado ya no describe lo que se va a fabricar. `aptitudOrden`
// lo reporta con su propio motivo (`PERFILERIA_PERSONALIZADA`).
//
// Sin personalización (ausente o vacía) devuelve el resultado TAL CUAL: cero
// cambios de comportamiento para todo lo cotizado hasta hoy.
import { lineaCatalogo, totalizar, round2 } from './motorCalculo';
import type { LineaBOM } from './motorCalculo';
import { getParametros, getProducto } from './catalogo';
import { claseDeUnidad } from '../modules/itemLibre';

export const DESPERDICIO_PERFIL_EXTRA_PCT = 5;
const MAX_POR_TIPO = 40;

export interface CambioComponente {
  de: string;
  a: string;
  /** Solo si `a` es de precio a cotizar: costo del proveedor que escribe el asesor. */
  costo?: number;
}
export interface ExtraComponente {
  codigo: string;
  /** Solo productos con precio a cotizar: costo del proveedor que escribe el asesor. */
  costo?: number;
  /** Unidades del catálogo (m², metros o unidades). No se usa en perfiles. */
  cantidad?: number;
  /** Sólo perfiles: medida de corte de cada pieza, en milímetros. */
  medidaMm?: number;
  /** Sólo perfiles: cuántas piezas de esa medida. */
  piezas?: number;
}
export interface PersonalizacionItem {
  cambios?: CambioComponente[];
  quitados?: string[];
  extras?: ExtraComponente[];
}

/** Lo que el frontend pinta: qué se cambió, qué se quitó (para poder
 * restaurarlo) y qué se agregó. */
export interface ResumenPersonalizacion {
  cambios: Array<{ de: string; a: string; descripcionDe: string; descripcionA: string }>;
  quitados: Array<{ codigo: string; descripcion: string; valorTotal: number }>;
  extras: Array<{ codigo: string; descripcion: string; cantidad: number; unidad: string; medidaMm?: number; piezas?: number }>;
  afectaPerfileria: boolean;
}

const CLASE_LEGIBLE = { area: 'metro cuadrado', lineal: 'metro lineal', unidad: 'unidad' } as const;

const norm = (c: unknown) => String(c ?? '').trim().toUpperCase();

/** ¿Hay algo que aplicar? Un objeto con los tres arreglos vacíos cuenta como
 * "sin personalización": el vendedor restauró todo. */
export function tienePersonalizacion(p: unknown): p is PersonalizacionItem {
  if (!p || typeof p !== 'object') return false;
  const x = p as PersonalizacionItem;
  return Boolean(x.cambios?.length || x.quitados?.length || x.extras?.length);
}

const esPerfileria = (categoria: string | null | undefined) => String(categoria ?? '').toUpperCase() === 'PERFILERIA';

/**
 * Aplica la personalización sobre el resultado del motor y rehace los totales.
 *
 * Lanza (→ 400 con el mensaje tal cual) sólo ante un pedido imposible de
 * interpretar: un cambio a un código inexistente, un cambio entre unidades
 * distintas, un perfil extra sin medida. Lo que simplemente dejó de aplicar
 * se AVISA y se ignora.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function aplicarPersonalizacion(resultado: any, personalizacion: unknown, segmentoCliente: string): any {
  if (!tienePersonalizacion(personalizacion) || !Array.isArray(resultado?.items)) return resultado;

  const cambios = (personalizacion.cambios ?? []).map((c) => ({ de: norm(c?.de), a: norm(c?.a), costo: c?.costo }));
  const quitados = [...new Set((personalizacion.quitados ?? []).map(norm))].filter(Boolean);
  const extras = personalizacion.extras ?? [];
  if (cambios.length > MAX_POR_TIPO || quitados.length > MAX_POR_TIPO || extras.length > MAX_POR_TIPO) {
    throw new Error(`Se admiten hasta ${MAX_POR_TIPO} cambios, quitados y agregados por ítem.`);
  }
  for (const c of cambios) {
    if (!c.de || !c.a) throw new Error('Un cambio de componente no trae el código original o el nuevo.');
    if (quitados.includes(c.de)) {
      throw new Error(`El componente ${c.de} está a la vez cambiado y quitado: elige una de las dos.`);
    }
  }
  if (new Set(cambios.map((c) => c.de)).size !== cambios.length) {
    throw new Error('Un mismo componente tiene dos cambios distintos: deja sólo uno.');
  }

  const advertencias: string[] = [...((resultado.advertencias as string[] | undefined) ?? [])];
  const resumen: ResumenPersonalizacion = { cambios: [], quitados: [], extras: [], afectaPerfileria: false };
  let items: LineaBOM[] = [...(resultado.items as LineaBOM[])];
  type Corte = Record<string, unknown>;
  const cortes: { perfiles: Corte[]; vidrios: Corte[]; [k: string]: unknown } | null = resultado.cortes
    ? {
        ...resultado.cortes,
        perfiles: [...((resultado.cortes.perfiles as Record<string, unknown>[] | undefined) ?? [])],
        vidrios: [...((resultado.cortes.vidrios as Record<string, unknown>[] | undefined) ?? [])],
      }
    : null;

  // ─── Quitados ────────────────────────────────────────────────────────────
  for (const codigo of quitados) {
    const lineas = items.filter((l) => l.codigo === codigo);
    if (lineas.length === 0) {
      advertencias.push(`El componente ${codigo} que se había quitado ya no está en el despiece: se ignoró.`);
      continue;
    }
    items = items.filter((l) => l.codigo !== codigo);
    resumen.quitados.push({
      codigo,
      descripcion: lineas[0].descripcion,
      valorTotal: round2(lineas.reduce((a, l) => a + (Number(l.valorTotal) || 0), 0)),
    });
    if (lineas.some((l) => esPerfileria(l.categoria))) {
      resumen.afectaPerfileria = true;
      if (cortes) cortes.perfiles = cortes.perfiles.filter((c) => norm(c.codigo) !== codigo);
    }
  }

  // ─── Cambios ─────────────────────────────────────────────────────────────
  for (const { de, a, costo } of cambios) {
    if (de === a) continue;
    const lineas = items.filter((l) => l.codigo === de);
    if (lineas.length === 0) {
      advertencias.push(
        `El cambio ${de} → ${a} ya no aplica: ${de} no está en el despiece actual (¿cambió el color o el diseño?). Revísalo.`
      );
      continue;
    }
    const nuevo = getProducto(a);
    if (!nuevo) throw new Error(`El código ${a} no existe en el catálogo del Cotizador.`);
    const claseOrig = claseDeUnidad(lineas[0].unidad);
    const claseNueva = claseDeUnidad(nuevo.unidad);
    if (claseOrig !== claseNueva) {
      throw new Error(
        `No se puede cambiar ${de} (se cobra por ${CLASE_LEGIBLE[claseOrig]}) por ${a} ` +
          `(se cobra por ${CLASE_LEGIBLE[claseNueva]}): la cantidad no tendría sentido. ` +
          'Quita el componente y agrega el nuevo con su propia cantidad.'
      );
    }
    items = items.map((l) => {
      if (l.codigo !== de) return l;
      const linea = lineaCatalogo(a, Number(l.cantidad) || 0, segmentoCliente, { unidadOverride: l.unidad, costoManual: costo });
      return { ...linea, personalizada: 'cambiada', codigoOriginal: de, descripcionOriginal: l.descripcion };
    });
    resumen.cambios.push({ de, a, descripcionDe: lineas[0].descripcion, descripcionA: nuevo.descripcion });

    if (esPerfileria(lineas[0].categoria) || esPerfileria(nuevo.categoria)) {
      resumen.afectaPerfileria = true;
      if (cortes) {
        cortes.perfiles = cortes.perfiles.map((c) =>
          norm(c.codigo) === de ? { ...c, codigo: a, codigoOriginal: de, personalizado: true } : c
        );
      }
    }
    // El taller corta el vidrio que se va a usar, no el del estándar.
    if (cortes && String(nuevo.categoria).toUpperCase() === 'VIDRIO' && claseNueva === 'area') {
      cortes.vidrios = cortes.vidrios.map((v) => ({ ...v, descripcion: nuevo.descripcion, codigo: a }));
    }
  }

  // ─── Extras ──────────────────────────────────────────────────────────────
  for (const [i, extra] of extras.entries()) {
    const codigo = norm(extra?.codigo);
    const n = i + 1;
    if (!codigo) throw new Error(`El componente agregado ${n} no tiene código.`);
    const producto = getProducto(codigo);
    const esPerfil = producto && esPerfileria(producto.categoria) && claseDeUnidad(producto.unidad) === 'lineal';

    if (esPerfil) {
      const medidaMm = Number(extra.medidaMm);
      const piezas = Number(extra.piezas);
      if (!Number.isFinite(medidaMm) || medidaMm <= 0 || !Number.isInteger(piezas) || piezas <= 0) {
        throw new Error(
          `El perfil agregado ${codigo} necesita la medida de cada pieza en milímetros y un número entero de piezas.`
        );
      }
      const metros = ((medidaMm * piezas) / 1000) * (1 + DESPERDICIO_PERFIL_EXTRA_PCT / 100);
      items.push({ ...lineaCatalogo(codigo, metros, segmentoCliente, { costoManual: extra.costo }), personalizada: 'agregada' });
      resumen.extras.push({
        codigo, descripcion: producto.descripcion, cantidad: round2(metros), unidad: producto.unidad, medidaMm, piezas,
      });
      resumen.afectaPerfileria = true;
      if (cortes) {
        cortes.perfiles.push({
          ref: 'AGREGADO',
          descripcion: producto.descripcion,
          medidaMm,
          cantidad: piezas,
          codigo,
          desperdicioPct: DESPERDICIO_PERFIL_EXTRA_PCT,
          personalizado: true,
        });
      }
      continue;
    }

    const cantidad = Number(extra.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new Error(`La cantidad del componente agregado ${codigo} debe ser un número mayor a 0.`);
    }
    // Un código inexistente no se rechaza aquí: `lineaCatalogo` lo devuelve como
    // línea en ERROR, que bloquea el ítem con el mismo mensaje que el resto.
    items.push({ ...lineaCatalogo(codigo, cantidad, segmentoCliente, { costoManual: extra.costo }), personalizada: 'agregada' });
    resumen.extras.push({
      codigo, descripcion: producto?.descripcion ?? codigo, cantidad, unidad: producto?.unidad ?? '',
    });
    if (producto && esPerfileria(producto.categoria)) resumen.afectaPerfileria = true;
  }

  // ─── Totales ─────────────────────────────────────────────────────────────
  // Con los MISMOS parámetros que usó el módulo, para que un ítem sin cambios de
  // precio dé exactamente el mismo total.
  const parametros = getParametros();
  const totales = totalizar(items, {
    cantidadPiezas: Number(resultado.cantidadPiezas) || 1,
    descuentoPct: Number(resultado.descuentoPct) || 0,
    aiu: Number(resultado.aiu) || parametros.aiu,
    ivaPct: Number.isFinite(Number(resultado.ivaPct)) ? Number(resultado.ivaPct) : parametros.iva,
  });

  const salida = {
    ...resultado,
    ...totales,
    advertencias,
    personalizacion: resumen,
    ...(cortes ? { cortes } : {}),
  };
  if (resumen.afectaPerfileria) {
    advertencias.push(
      'Se personalizó la perfilería de este ítem: ya no sale en la orden de corte ni en la SAP automática, ' +
        'porque el despiece calculado no describe lo que se va a fabricar. Los cortes se definen a mano.'
    );
    salida.aptoParaCorte = false;
    salida.perfileriaPersonalizada = true;
  }
  return salida;
}
