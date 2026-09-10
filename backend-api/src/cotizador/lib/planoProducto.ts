// Geometría del plano de un producto: a partir del código de diseño y del
// despiece YA CALCULADO (los paños de vidrio reales, con su ancho/alto en
// mm), decide dónde va cada panel y a qué escala se puede dibujar.
//
// FUNCIÓN PURA A PROPÓSITO — no lee el catálogo de diseños, no lee ningún
// archivo, no toca la base de datos. Recibe exactamente lo que `motorDespiece`
// ya deja guardado en `resultado.cortes.vidrios` (ver ese archivo para la
// forma exacta: `{descripcion, anchoMm, altoMm, cantidad, areaM2, nivelRiesgo}`,
// de los que aquí sólo hacen falta `anchoMm`/`altoMm`/`cantidad`). Es
// deliberado: así se puede dibujar el plano de una cotización ya guardada sin
// volver a tocar el catálogo de diseños ni recalcular nada — ni falla si ese
// diseño cambió de fórmula después, ni si lo borraron del catálogo.
//
// LA IDEA
// El código de diseño ("OXXO") dice CUÁNTOS paneles hay y de qué tipo, pero
// no cuánto mide cada uno; eso lo sabe el despiece. Este módulo cruza las dos
// cosas: si el número de paños coincide con el número de letras-panel y se
// puede saber CUÁL paño es CUÁL panel sin adivinar, se dibuja a escala real.
// Si no se puede saber con certeza, se avisa en vez de inventar — un plano
// que aparenta precisión pero no la tiene es peor que uno que se declara
// esquemático.
//
// SOBRE EL PASO 7 (overrides) Y LA PUREZA DE ESTA FUNCIÓN
// La consigna original pide que este archivo no toque disco, pero también
// que el paso 7 lea las correcciones manuales de geometría. Ambas cosas no
// pueden ser ciertas a la vez dentro de la misma función. Se resolvió a favor
// de la pureza (la razón de negocio de arriba —planos de cotizaciones ya
// guardadas, reproducibles sin depender del almacenamiento— pesa más) y se
// sacó la lectura a quien SÍ puede hacerla: el controlador HTTP, que las toma
// de la caché (tabla `cotizador_geometria_override`) y las pasa aquí ya
// parseadas en el parámetro opcional `overrides`, junto con `disenoId` (el id
// completo "Sistema::codigo", necesario para buscar en ese mapa). Ninguno de
// los dos es obligatorio: sin ellos, el paso 7 simplemente no encuentra nada y
// se sigue a "esquema", que es un resultado válido y ya contemplado.
import { parsearCodigo, ALFABETO_PANEL } from './codigoDiseno';
import type { GeometriaOverrides } from '../tipos';

// Umbral del paso 6: cuando la asignación por tipo de letra no es unívoca
// pero todos los tamaños candidatos son prácticamente el mismo (diferencias
// de redondeo de la fórmula, no paneles realmente distintos), se asignan en
// el orden en que aparecen en el despiece en vez de declarar esquema.
const TOLERANCIA_SPREAD_ANCHO = 0.03; // 3%

function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Los paneles dibujados llevan más precisión que las medidas "reales" (2
// decimales, igual que motorDespiece) porque son coordenadas de dibujo
// derivadas de un reparto, no una medida que alguien vaya a leer con un
// flexómetro: conviene que la suma de una fila cuadre con el exterior dentro
// de una tolerancia bien por debajo de 0.01mm incluso con 8-9 paneles en la
// misma fila, y redondear a 2 decimales en cada paso podía acumular más
// error que eso.
function rGeom(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface Medida {
  anchoMm: number;
  altoMm: number;
}

export interface PanelPlano {
  tipo: string;
  fila: number;
  col: number;
  xMm: number;
  yMm: number;
  anchoMm: number;
  altoMm: number;
  pano: Medida | null;
  anchoDerivado: true;
}

export type Cota =
  | { tipo: 'exterior-ancho'; anchoMm: number }
  | { tipo: 'exterior-alto'; altoMm: number }
  | { tipo: 'pano'; fila: number; col: number; anchoMm: number; altoMm: number };

export interface Plano {
  escala: 'real' | 'esquema';
  confianza: 'alta' | 'media' | 'nula';
  motivo: string | null;
  exterior: Medida;
  paneles: PanelPlano[];
  cotas: Cota[];
  avisos: string[];
}

export interface VidrioEntrada {
  // Deliberadamente laxos: el motor hace Number() sobre ellos porque no confía
  // en lo que le llegue — una cotización guardada hace meses puede traer
  // cualquier cosa en estos campos.
  anchoMm?: unknown;
  altoMm?: unknown;
  cantidad?: unknown;
  [clave: string]: unknown;
}

export interface ParamsCalcularPlano {
  /** `diseno.diseno` (el código corto, p.ej. "OXXO_TORINO"; NO el id completo
   * "Sistema::codigo"). */
  codigoDiseno?: unknown;
  /** `diseno.modulo`; sólo importa para la regla especial de espejo. */
  modulo?: string;
  /** Ancho EXTERIOR de fabricación, en mm. */
  anchoFabMm?: unknown;
  /** Alto EXTERIOR de fabricación, en mm. */
  altoFabMm?: unknown;
  /** Misma forma que `resultado.cortes.vidrios`. */
  vidrios?: VidrioEntrada[] | null;
  /** Id completo "Sistema::codigo", sólo para buscar un override manual. */
  disenoId?: string | null;
  /** Correcciones de geometría ya leídas,
   * `{ [disenoId]: { orden: [{anchoMm,altoMm}] } }`. `orden` es la medida real
   * de cada panel en el mismo orden fila-por-fila, izquierda-a-derecha en que
   * aparecen las letras del código. */
  overrides?: GeometriaOverrides;
}

// ─── Entrada pública ────────────────────────────────────────────────────────

/**
 * Calcula el plano de un producto. Nunca lanza excepción: cualquier entrada
 * rara termina en `escala:"esquema"` con un `motivo` explicando por qué, no
 * en un throw — dibujar "no sé" es siempre una opción válida para este
 * módulo, tumbar al llamador no lo es.
 *
 * Sobre `cotas` (la forma exacta no venía especificada, se diseñó aquí):
 *   - Como mucho 2 entradas `{tipo:"exterior-ancho", anchoMm}` y
 *     `{tipo:"exterior-alto", altoMm}` con la medida exterior REAL (viene del
 *     despiece, nunca derivada).
 *   - Una entrada `{tipo:"pano", fila, col, anchoMm, altoMm}` por cada
 *     TAMAÑO DE PAÑO DISTINTO que aparece en el plano (no una por panel: si
 *     4 paneles miden igual se emite una sola cota, para no saturar el
 *     dibujo), ancladas al primer panel (fila/col) que tiene esa medida en
 *     orden de aparición.
 *   - Nunca se agrega una cota con el `anchoMm`/`altoMm` DERIVADO de
 *     `paneles[]`: eso sería hacer pasar un número inventado por una medida
 *     verificada.
 *
 * Sobre `paneles[].anchoMm`/`altoMm` vs `paneles[].pano`: son cosas distintas
 * a propósito. `pano` es la medida REAL del paño de vidrio de ese panel (o
 * `null` si `escala:"esquema"`, porque no hay una correspondencia paño↔panel
 * confiable). `anchoMm`/`altoMm` del panel es el tamaño del RECTÁNGULO QUE SE
 * DIBUJA — el paño real más una porción igual del residuo (marco/perfilería)
 * de su fila, para que los paneles de cada fila sumen EXACTAMENTE el ancho
 * exterior. `anchoDerivado:true` marca justamente eso: no lo tomes como una
 * medida verificada, es geometría de dibujo.
 */
export function calcularPlano(params?: ParamsCalcularPlano): Plano {
  const { anchoFabMm, altoFabMm } = params ?? {};
  try {
    return calcularPlanoInterno(params ?? {});
  } catch (e) {
    return resultadoEsquema({
      exterior: exteriorSeguro(anchoFabMm, altoFabMm),
      filas: [],
      motivo: `Error inesperado calculando el plano: ${e instanceof Error ? e.message : e}.`,
    });
  }
}

function exteriorSeguro(anchoFabMm: unknown, altoFabMm: unknown): Medida {
  const a = Number(anchoFabMm);
  const h = Number(altoFabMm);
  return {
    anchoMm: Number.isFinite(a) && a > 0 ? r2(a) : 0,
    altoMm: Number.isFinite(h) && h > 0 ? r2(h) : 0,
  };
}

function calcularPlanoInterno({
  codigoDiseno,
  modulo,
  anchoFabMm,
  altoFabMm,
  vidrios,
  disenoId = null,
  overrides = {},
}: ParamsCalcularPlano): Plano {
  const anchoMm = Number(anchoFabMm);
  const altoMm = Number(altoFabMm);

  if (!Number.isFinite(anchoMm) || anchoMm <= 0 || !Number.isFinite(altoMm) || altoMm <= 0) {
    return resultadoEsquema({
      exterior: exteriorSeguro(anchoFabMm, altoFabMm),
      filas: [],
      motivo: 'La medida exterior de fabricación no es un número válido mayor que cero.',
    });
  }
  const exterior: Medida = { anchoMm: r2(anchoMm), altoMm: r2(altoMm) };

  // --- Paso 1: parsear el código -------------------------------------------
  const analisis = parsearCodigo(codigoDiseno, { modulo });
  if (analisis.confianza === 'nula' || analisis.filas.length === 0) {
    return resultadoEsquema({
      exterior,
      filas: [],
      motivo:
        `El código de diseño "${codigoDiseno}" no tiene letras de panel reconocibles ` +
        `(alfabeto válido: ${ALFABETO_PANEL.split('').join(' ')}), así que no se pudo interpretar en absoluto.`,
    });
  }
  const filas = analisis.filas;
  const letrasPlanas = filas.flat();
  const totalPaneles = letrasPlanas.length;

  // --- Paso 2: expandir paños y agrupar por firma exacta -------------------
  const panosExpandidos = expandirVidrios(vidrios);

  // --- Paso 3: el conteo tiene que cuadrar ---------------------------------
  if (panosExpandidos.length !== totalPaneles) {
    return resultadoEsquema({
      exterior,
      filas,
      motivo:
        `El despiece trae ${panosExpandidos.length} paño(s) de vidrio con medida válida, pero el ` +
        `código "${codigoDiseno}" describe ${totalPaneles} panel(es): no coinciden, así que no se puede ` +
        `asignar cada paño a su panel sin adivinar.`,
    });
  }

  const clases = agruparPorFirma(panosExpandidos);
  const tipos = contarPorTipo(letrasPlanas);

  const resolucion = resolverAsignacion({
    clases,
    tipos,
    panosExpandidos,
    letrasPlanas,
    disenoId,
    overrides,
  });
  if (!resolucion) {
    return resultadoEsquema({
      exterior,
      filas,
      motivo:
        `Este diseño tiene ${clases.length} tamaño(s) distinto(s) de paño para ${tipos.length} tipo(s) de ` +
        `panel (${tipos.map((t) => `${t.count}×${t.tipo}`).join(', ')}): ni coinciden en cantidad por tipo, ` +
        `ni son lo bastante parecidos en tamaño como para asumir un orden, ni hay una corrección manual ` +
        `guardada para este diseño.`,
    });
  }

  const { paneles, cotas } = construirGeometriaReal({
    filas,
    panoPorPanel: resolucion.panoPorPanel,
    exterior,
  });

  return {
    escala: 'real',
    confianza: resolucion.confianza,
    motivo: null,
    exterior,
    paneles,
    cotas,
    avisos: resolucion.avisos,
  };
}

// ---------------------------------------------------------------------------
// Expansión y agrupación de paños
// ---------------------------------------------------------------------------

/** `vidrios[]` trae una entrada por FÓRMULA con su `cantidad`; aquí se
 * expande a un paño por unidad física, que es la granularidad que hace falta
 * para emparejar 1 a 1 con las letras del código. Un paño con medida
 * inválida (≤0, no numérica) se descarta sin más: no se inventa una medida
 * para que "cuadre" el conteo — si falta, el paso 3 lo va a notar solo. */
function expandirVidrios(vidrios: VidrioEntrada[] | null | undefined): Medida[] {
  const lista = Array.isArray(vidrios) ? vidrios : [];
  const expandido: Medida[] = [];
  for (const v of lista) {
    const anchoMm = Number(v?.anchoMm);
    const altoMm = Number(v?.altoMm);
    const cantidad = Number(v?.cantidad);
    if (!Number.isFinite(anchoMm) || anchoMm <= 0) continue;
    if (!Number.isFinite(altoMm) || altoMm <= 0) continue;
    if (!Number.isFinite(cantidad) || cantidad <= 0) continue;
    for (let i = 0; i < cantidad; i++) expandido.push({ anchoMm, altoMm });
  }
  return expandido;
}

/** Firma de agrupación: redondeada a 0.01mm, el mismo grano con el que
 * motorDespiece ya redondea cada paño (`Math.round(x*100)/100`), así que
 * dos paños que salieron de la misma fórmula caen siempre en la misma firma
 * aunque el float tenga ruido de punto flotante más allá del 2º decimal. */
function firmaPano(anchoMm: number, altoMm: number): string {
  return `${Math.round(anchoMm * 100)}x${Math.round(altoMm * 100)}`;
}

interface ClasePano extends Medida {
  count: number;
}

function agruparPorFirma(panos: Medida[]): ClasePano[] {
  const mapa = new Map<string, ClasePano>();
  for (const p of panos) {
    const firma = firmaPano(p.anchoMm, p.altoMm);
    let clase = mapa.get(firma);
    if (!clase) {
      clase = { anchoMm: p.anchoMm, altoMm: p.altoMm, count: 0 };
      mapa.set(firma, clase);
    }
    clase.count++;
  }
  return [...mapa.values()];
}

interface TipoPanel {
  tipo: string;
  count: number;
}

function contarPorTipo(letras: string[]): TipoPanel[] {
  const mapa = new Map<string, number>();
  for (const l of letras) mapa.set(l, (mapa.get(l) ?? 0) + 1);
  return [...mapa.entries()].map(([tipo, count]) => ({ tipo, count }));
}

// ---------------------------------------------------------------------------
// Resolución de la asignación paño ↔ panel (pasos 4 a 7)
// ---------------------------------------------------------------------------

interface Resolucion {
  /** En el mismo orden fila-por-fila que `letrasPlanas` (= `filas.flat()`). */
  panoPorPanel: Medida[];
  confianza: 'alta' | 'media';
  avisos: string[];
}

/** `null` si ningún paso resuelve la asignación. */
function resolverAsignacion({
  clases,
  tipos,
  panosExpandidos,
  letrasPlanas,
  disenoId,
  overrides,
}: {
  clases: ClasePano[];
  tipos: TipoPanel[];
  panosExpandidos: Medida[];
  letrasPlanas: string[];
  disenoId: string | null;
  overrides: GeometriaOverrides;
}): Resolucion | null {
  // Paso 4: una sola clase de paño — todos los paneles miden igual.
  if (clases.length === 1) {
    const c = clases[0];
    return {
      panoPorPanel: letrasPlanas.map(() => ({ anchoMm: c.anchoMm, altoMm: c.altoMm })),
      confianza: 'alta',
      avisos: [],
    };
  }

  // Paso 5: el multiset de conteos por clase coincide con el multiset de
  // conteos por tipo de letra, y hay tantas clases como tipos distintos.
  if (clases.length === tipos.length) {
    const conteosClases = clases.map((c) => c.count).sort((a, b) => b - a);
    const conteosTipos = tipos.map((t) => t.count).sort((a, b) => b - a);
    const coincide = conteosClases.every((n, i) => n === conteosTipos[i]);
    if (coincide) {
      // Emparejar por conteo descendente. Cuando dos o más tipos empatan en
      // conteo (p.ej. "OXXO" con 2 O y 2 X) el emparejamiento deja de ser
      // matemáticamente unívoco a partir sólo de los conteos: se rompe el
      // empate con un criterio determinista (orden del alfabeto de panel
      // para los tipos, ancho/alto descendente para las clases) para que el
      // resultado sea siempre el mismo, pero esto NO garantiza acertar la
      // pareja físicamente correcta en un empate — es la mejor apuesta sin
      // más información, no una certeza. Ver test para el caso concreto.
      const clasesOrdenadas = [...clases].sort(
        (a, b) => b.count - a.count || b.anchoMm - a.anchoMm || b.altoMm - a.altoMm
      );
      const tiposOrdenados = [...tipos].sort(
        (a, b) => b.count - a.count || ALFABETO_PANEL.indexOf(a.tipo) - ALFABETO_PANEL.indexOf(b.tipo)
      );
      const medidaPorTipo = new Map<string, ClasePano>();
      tiposOrdenados.forEach((t, i) => medidaPorTipo.set(t.tipo, clasesOrdenadas[i]));
      return {
        panoPorPanel: letrasPlanas.map((tipo) => {
          const c = medidaPorTipo.get(tipo) as ClasePano;
          return { anchoMm: c.anchoMm, altoMm: c.altoMm };
        }),
        confianza: 'alta',
        avisos: [],
      };
    }
  }

  // Paso 6: los anchos de las clases candidatas están dentro de un 3% entre
  // sí — probablemente son el mismo panel con ruido de redondeo de fórmula,
  // no paneles realmente distintos. Se asigna en el orden de aparición.
  const anchosClases = clases.map((c) => c.anchoMm);
  const promedioAncho = anchosClases.reduce((a, b) => a + b, 0) / anchosClases.length;
  const spread =
    promedioAncho > 0
      ? (Math.max(...anchosClases) - Math.min(...anchosClases)) / promedioAncho
      : Infinity;
  if (spread < TOLERANCIA_SPREAD_ANCHO) {
    return {
      panoPorPanel: panosExpandidos.map((p) => ({ anchoMm: p.anchoMm, altoMm: p.altoMm })),
      confianza: 'media',
      avisos: [
        `Este diseño tiene ${clases.length} tamaños de paño que difieren menos de un 3% entre sí: se ` +
          `asignaron en el orden en que aparecen en el despiece, no por una correspondencia por tipo de ` +
          `panel verificada.`,
      ],
    };
  }

  // Paso 7: corrección manual guardada, ya leída por el llamador — esta
  // función no toca almacenamiento, ver cabecera del archivo.
  const override = disenoId ? (overrides?.[disenoId] as { orden?: unknown } | undefined) : null;
  const orden = override?.orden;
  if (Array.isArray(orden) && orden.length === letrasPlanas.length) {
    return {
      panoPorPanel: orden.map((o: { anchoMm?: unknown; altoMm?: unknown }) => ({
        anchoMm: Number(o.anchoMm),
        altoMm: Number(o.altoMm),
      })),
      confianza: 'media',
      avisos: [
        'La correspondencia paño↔panel de este diseño viene de una corrección manual guardada, ' +
          'no de una regla automática.',
      ],
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Construcción de la geometría (paso 8) y del esquema (sin proporciones)
// ---------------------------------------------------------------------------

/**
 * Reparte el exterior entre filas y paneles ya con la asignación resuelta.
 *
 * Primero las FILAS: el alto exterior se reparte entre filas en proporción
 * al alto PROMEDIO de los paños de cada fila — es el alto del paño, no el
 * ancho, el que delata a qué fila pertenece un panel (verificado con datos
 * reales: en Sistema3831::O_O el paño mide ~1160×566 sobre un exterior de
 * ~1200 de alto — dos filas de 566 cada una, la mitad; en
 * Sistema3831::OO_OO_OO cada paño mide ~368 de alto sobre exterior 1200 con
 * 3 filas — 368×3 ≈ 1104, el resto es marco entre filas).
 *
 * Dentro de cada fila, el ancho exterior de la fila (= el ancho exterior
 * completo: no hay en el catálogo actual ningún diseño con bloques
 * lado-a-lado DENTRO de una fila apilada, así que se asume ancho completo
 * por fila) se reparte entre sus paneles en proporción a
 * `anchoPano + residuo/nPaneles`, con `residuo = anchoExteriorDeLaFila -
 * Σ anchoPano`, de modo que los paneles de la fila sumen EXACTAMENTE el
 * ancho exterior. El residuo es el hueco de marco/perfilería entre paneles y
 * en los bordes — no viene desglosado en el despiece, así que se reparte
 * por igual entre los paneles de la fila en vez de intentar adivinar dónde
 * cae cada perfil.
 */
function construirGeometriaReal({
  filas,
  panoPorPanel,
  exterior,
}: {
  filas: string[][];
  panoPorPanel: Medida[];
  exterior: Medida;
}): { paneles: PanelPlano[]; cotas: Cota[] } {
  let cursor = 0;
  const filasConPanos = filas.map((fila) =>
    fila.map((tipo) => ({ tipo, pano: panoPorPanel[cursor++] }))
  );

  const altoPromedioFila = filasConPanos.map(
    (fp) => fp.reduce((acc, p) => acc + p.pano.altoMm, 0) / fp.length
  );
  const sumaAltos = altoPromedioFila.reduce((a, b) => a + b, 0);

  const paneles: PanelPlano[] = [];
  let yCursor = 0;
  filasConPanos.forEach((fp, fi) => {
    const altoFilaMm =
      sumaAltos > 0
        ? exterior.altoMm * (altoPromedioFila[fi] / sumaAltos)
        : exterior.altoMm / filasConPanos.length;

    const sumaAnchosPano = fp.reduce((acc, p) => acc + p.pano.anchoMm, 0);
    const residuo = exterior.anchoMm - sumaAnchosPano;
    const residuoPorPanel = residuo / fp.length;

    let xCursor = 0;
    fp.forEach((p, ci) => {
      const anchoPanelMm = p.pano.anchoMm + residuoPorPanel;
      paneles.push({
        tipo: p.tipo,
        fila: fi,
        col: ci,
        xMm: rGeom(xCursor),
        yMm: rGeom(yCursor),
        anchoMm: rGeom(anchoPanelMm),
        altoMm: rGeom(altoFilaMm),
        pano: { anchoMm: r2(p.pano.anchoMm), altoMm: r2(p.pano.altoMm) },
        anchoDerivado: true,
      });
      xCursor += anchoPanelMm;
    });
    yCursor += altoFilaMm;
  });

  const cotas: Cota[] = [
    { tipo: 'exterior-ancho', anchoMm: exterior.anchoMm },
    { tipo: 'exterior-alto', altoMm: exterior.altoMm },
    ...cotasPorPanoDistinto(paneles),
  ];

  return { paneles, cotas };
}

/** Una cota "pano" por cada tamaño de paño DISTINTO presente en el plano
 * (no una por panel), anclada al primer panel que la tiene, en el mismo
 * orden fila-por-fila en que se dibujan los paneles. */
function cotasPorPanoDistinto(paneles: PanelPlano[]): Cota[] {
  const vistos = new Set<string>();
  const cotas: Cota[] = [];
  for (const p of paneles) {
    if (!p.pano) continue;
    const firma = firmaPano(p.pano.anchoMm, p.pano.altoMm);
    if (vistos.has(firma)) continue;
    vistos.add(firma);
    cotas.push({
      tipo: 'pano',
      fila: p.fila,
      col: p.col,
      anchoMm: p.pano.anchoMm,
      altoMm: p.pano.altoMm,
    });
  }
  return cotas;
}

/** Esquema: sin proporciones reales que respetar, cada fila mide lo mismo de
 * alto (exterior/nFilas) y dentro de una fila cada panel mide lo mismo de
 * ancho (ancho de la fila/nPaneles) — proporcional sólo al NÚMERO de
 * paneles, igual criterio que usa el diagrama de referencia del software de
 * origen para este caso (no para el caso real: ver el componente de diagrama
 * en el frontend). */
function construirGeometriaEsquema({
  filas,
  exterior,
}: {
  filas: string[][];
  exterior: Medida;
}): { paneles: PanelPlano[]; cotas: Cota[] } {
  const cotas: Cota[] = [
    { tipo: 'exterior-ancho', anchoMm: exterior.anchoMm },
    { tipo: 'exterior-alto', altoMm: exterior.altoMm },
  ];
  if (!filas.length) return { paneles: [], cotas };

  const paneles: PanelPlano[] = [];
  const altoFilaMm = exterior.altoMm / filas.length;
  filas.forEach((fila, fi) => {
    const nCols = fila.length || 1;
    const anchoColMm = exterior.anchoMm / nCols;
    fila.forEach((tipo, ci) => {
      paneles.push({
        tipo,
        fila: fi,
        col: ci,
        xMm: rGeom(ci * anchoColMm),
        yMm: rGeom(fi * altoFilaMm),
        anchoMm: rGeom(anchoColMm),
        altoMm: rGeom(altoFilaMm),
        pano: null,
        anchoDerivado: true,
      });
    });
  });
  return { paneles, cotas };
}

function resultadoEsquema({
  exterior,
  filas,
  motivo,
}: {
  exterior: Medida;
  filas: string[][];
  motivo: string;
}): Plano {
  const { paneles, cotas } = construirGeometriaEsquema({ filas, exterior });
  return {
    escala: 'esquema',
    confianza: 'nula',
    motivo,
    exterior,
    paneles,
    cotas,
    avisos: [],
  };
}
