/**
 * Reconstruye el MODELO DE CORTE REAL de cada pieza del catálogo de diseños.
 *
 * POR QUÉ EXISTE ESTE SCRIPT
 * --------------------------
 * Los despieces del cotizador se extrajeron del software de origen midiendo cada diseño
 * a 3 medidas (1000×1200, 500×1200, 1000×600) y ajustando por mínimos cuadrados
 * una recta `medida = a*ancho + b*alto + c`. Con 3 puntos y 3 incógnitas la recta
 * pasa por sus muestras por pura álgebra, así que el ajuste nunca pudo fallar —
 * y por eso el catálogo arrastra la advertencia de "no validado".
 *
 * El problema real no era ése. El software de origen NO calcula con una recta: calcula
 * `trunc((ancho - k) / nº de paneles)`. Como las 3 medidas de extracción son
 * todas múltiplos de 100, esa división daba entero casi siempre y el truncamiento
 * quedó invisible. La regresión "absorbió" el redondeo moviendo la pendiente:
 * donde el modelo real es 1/3 = 0,3333…, la recta ajustada quedó en 0,334. Ese
 * exceso de 6,7e-4 por milímetro de vano es un error que CRECE con el tamaño de
 * la ventana — de ahí el "puede desviarse hasta 3,3 mm" del nivel C.
 *
 * QUÉ HACE
 * --------
 * Para cada pieza busca, por fuerza bruta acotada, todos los modelos de la forma
 *
 *     medida = op( (p*ancho + q*alto + r) / n )      op ∈ {exacto, trunc, round, ceil}
 *
 * con p,q,r,n enteros, que reproduzcan EXACTAMENTE todas las observaciones
 * disponibles. Después mide cuánto difieren esos modelos entre sí en vanos de
 * obra realistas (no múltiplos de 100) y elige el representante central.
 *
 * LA AMBIGÜEDAD ES REAL Y SE REPORTA
 * ----------------------------------
 * Con sólo 3 observaciones hay decenas de modelos compatibles: `trunc((A-69)/2)`
 * y `trunc((A-70)/2)` dan lo mismo en 1000 y en 500. Lo que este script mide es
 * que todos ellos coinciden entre sí dentro de 1 mm en medidas reales, y guarda
 * esa cota como `dispersionMm`. Eso NO es "medida exacta": es una incertidumbre
 * acotada y honesta, frente al error creciente y no acotado de la recta. Para
 * cerrarla del todo haría falta una observación en una medida no redonda.
 *
 * EL SUPUESTO QUE NO SE PUEDE VERIFICAR DESDE AQUÍ
 * -----------------------------------------------
 * `dispersionMm` acota la distancia entre los modelos DENTRO del espacio de
 * búsqueda. Si el cálculo real del software de origen viviera fuera de ese espacio —un
 * recorte condicional, un mínimo, una tabla por tamaño— ningún modelo de esta
 * familia lo representaría y la cota no diría nada sobre ese caso. El espacio se
 * eligió porque cubre lo que un despiece de carpintería hace de verdad (repartir
 * el vano entre cuerpos y descontar perfiles) y porque los divisores que salen
 * coinciden uno a uno con el número de paneles de cada diseño, que es evidencia
 * estructural y no numérica. Aun así es un supuesto, y sólo una medición real lo
 * confirma.
 *
 * SEGURIDAD DEL EMPAREJAMIENTO
 * ----------------------------
 * Cada pieza del ERP se empareja con su contraparte del software de origen y sólo se
 * acepta el modelo si la fórmula lineal guardada en la BD coincide con la que el
 * origen calculó para esa misma pieza. Si no coincide, el emparejamiento es
 * dudoso y la pieza se deja SIN modelo (seguirá usando la recta de hoy). No se
 * escribe nada en la base: la salida es un JSON versionado que aplica después
 * `2026-09-13_aplicar_modelos_corte.ts`.
 *
 * USO
 *   npx ts-node src/scripts/2026-09-13_reconstruir_modelos_corte.ts [rutaMultimedida.json]
 *
 * Por defecto busca el multimedida.json del proyecto externo de origen. La salida va a
 * src/scripts/datos_cotizador/modelos_corte.json (versionado en git), de modo que
 * aplicar los modelos no requiera tener ese proyecto a mano.
 */
import fs from 'fs';
import path from 'path';
import { QueryTypes } from 'sequelize';

// El .env vive en backend-api/. Se carga por ruta absoluta y ANTES de importar
// config/database (que construye Sequelize al evaluarse), para que el script
// funcione igual desde la raíz del monorepo o desde backend-api.
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

// `multimedida.json` vive FUERA del repo, en el proyecto externo del que se
// extrajeron los despieces. La ruta no se escribe aquí por dos razones: el nombre
// del software de origen no debe aparecer en el código del ERP (decisión 8 del
// Cotizador, ver docs/modulos/cotizador.md), y la que estaba escrita apuntaba al
// escritorio de OTRA máquina (`C:/Users/User/...`), así que ya no resolvía. Se
// pasa como argumento, o por COTIZADOR_DATOS_ORIGEN (la carpeta que lo contiene).
//
// No hace falta para aplicar los modelos: la salida de este script
// (`datos_cotizador/modelos_corte.json`) está versionada, que es justamente para
// no necesitar el proyecto externo a mano.
const RUTA_MULTIMEDIDA_POR_DEFECTO = process.env.COTIZADOR_DATOS_ORIGEN
  ? path.join(process.env.COTIZADOR_DATOS_ORIGEN, 'multimedida.json')
  : '';

const SALIDA = path.join(__dirname, 'datos_cotizador', 'modelos_corte.json');

/** Vanos de obra deliberadamente "feos" (no múltiplos de 100) donde se mide
 * cuánto se separan entre sí los modelos compatibles. Si en estos cinco todos
 * coinciden, la pieza está determinada para efectos prácticos. */
const VANOS_PRUEBA: Array<[number, number]> = [
  [1237, 1543],
  [893, 2117],
  [1650, 1080],
  [2431, 1996],
  [1111, 1777],
];

/** Espacio de búsqueda. Los coeficientes de un despiece real son pequeños: un
 * perfil mide como mucho un par de veces el vano, y los divisores son el número
 * de paneles. Acotarlo mantiene la búsqueda en segundos y evita "explicar" los
 * datos con un modelo absurdo que casualmente encaje. */
const DIVISORES = [1, 2, 3, 4, 5, 6, 7, 8];
const COEFS = [0, 1, 2, 3, 4];

type NombreOp = 'exacto' | 'trunc' | 'round' | 'ceil';

const OPS: Record<NombreOp, (x: number) => number> = {
  exacto: (x) => x,
  trunc: (x) => Math.floor(x),
  round: (x) => Math.round(x),
  ceil: (x) => Math.ceil(x),
};

export interface ModeloCorte {
  p: number;
  q: number;
  r: number;
  n: number;
  op: NombreOp;
}

interface Punto {
  A: number;
  H: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Búsqueda de modelos
// ---------------------------------------------------------------------------

/**
 * ¿Este modelo devuelve siempre un número entero de milímetros?
 *
 * Se comprobó sobre los reportes crudos del origen (844 celdas de medida en 60
 * reportes): el software de origen **nunca** emite una medida de corte con decimales. Un
 * modelo como `(ancho - 6) / 2` sin redondeo reproduce las 3 observaciones —en
 * ellas la división cae exacta— pero en un vano cualquiera devuelve 595,5 mm, y
 * eso el origen no lo produce nunca. Descartarlos no es una preferencia estética:
 * elimina candidatos que sabemos falsos, y al hacerlo estrecha la dispersión.
 *
 * (Da igual, además, para el taller: nadie corta aluminio a medio milímetro.)
 */
function siempreEntero(m: ModeloCorte): boolean {
  for (const [A, H] of VANOS_PRUEBA) {
    const v = evaluarModelo(m, A, H);
    if (Math.abs(v - Math.round(v)) > 1e-9) return false;
  }
  return true;
}

/**
 * Todos los modelos enteros que reproducen exactamente los puntos dados y que
 * devuelven medidas enteras (ver `siempreEntero`).
 *
 * El truco para que sea rápido: `r` no se recorre a ciegas. Fijados p, q, n y la
 * operación de redondeo, el primer punto acota `r` a un intervalo pequeño
 * (el que hace que ese punto caiga en su valor observado); sólo ese intervalo se
 * comprueba contra los puntos restantes.
 */
function buscarModelos(puntos: Punto[]): ModeloCorte[] {
  const soluciones: ModeloCorte[] = [];
  const [P0] = puntos;

  for (const n of DIVISORES) {
    for (const p of COEFS) {
      for (const q of COEFS) {
        // p=q=0 SÍ se admite: es la pieza cuya medida no depende del vano
        // (`medida = r`). Son 8 perfiles reales, todos "Horizontal" de diseños
        // con marco, que el software de origen devuelve como constante (15, 30, 4, 13 mm).
        // Es un modelo exacto de lo observado, y por eso se acepta — pero una
        // medida que no escala con la ventana casi siempre significa que al
        // despiece le falta un parámetro que el formulario no pide (el ancho del
        // marco). `motorDespiece` lo advierte aparte, al calcular.
        const base0 = p * P0.A + q * P0.H;

        for (const nombreOp of Object.keys(OPS) as NombreOp[]) {
          const op = OPS[nombreOp];
          // Intervalo [lo, hi] de (base0 + r)/n compatible con y0 bajo esta op.
          let lo: number;
          let hi: number;
          if (nombreOp === 'exacto') {
            lo = P0.y;
            hi = P0.y;
          } else if (nombreOp === 'trunc') {
            lo = P0.y;
            hi = P0.y + 1;
          } else if (nombreOp === 'round') {
            lo = P0.y - 0.5;
            hi = P0.y + 0.5;
          } else {
            lo = P0.y - 1;
            hi = P0.y;
          }

          const rMin = Math.ceil(lo * n - base0);
          const rMax = Math.floor(hi * n - base0);
          if (rMax < rMin || rMax - rMin > 4000) continue;

          for (let r = rMin; r <= rMax; r++) {
            let ok = true;
            for (const pt of puntos) {
              if (Math.abs(op((p * pt.A + q * pt.H + r) / n) - pt.y) > 1e-9) {
                ok = false;
                break;
              }
            }
            if (ok) {
              const cand = { p, q, r, n, op: nombreOp };
              if (siempreEntero(cand)) soluciones.push(cand);
            }
          }
        }
      }
    }
  }
  return soluciones;
}

export function evaluarModelo(m: ModeloCorte, anchoMm: number, altoMm: number): number {
  return OPS[m.op]((m.p * anchoMm + m.q * altoMm + m.r) / m.n);
}

/** Separación máxima entre las predicciones de todos los candidatos, en los
 * vanos de prueba. Es la cota de incertidumbre que queda tras la reconstrucción. */
function dispersion(cands: ModeloCorte[]): number {
  let peor = 0;
  for (const [A, H] of VANOS_PRUEBA) {
    let min = Infinity;
    let max = -Infinity;
    for (const m of cands) {
      const v = evaluarModelo(m, A, H);
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (max - min > peor) peor = max - min;
  }
  return peor;
}

/**
 * Representante del conjunto de candidatos: el que más se acerca a la predicción
 * MEDIANA de todos ellos en los vanos de prueba.
 *
 * Elegir el mediano y no el primero importa: si `r` puede ir de -110 a -105, los
 * extremos se desvían el doble que el centro del intervalo. Los desempates son
 * deterministas para que dos corridas del script den exactamente el mismo JSON.
 */
function elegirRepresentante(cands: ModeloCorte[]): ModeloCorte {
  // Un modelo sin división ni redondeo es exacto por definición: si existe, gana.
  const exactos = cands.filter((m) => m.n === 1 && m.op === 'exacto');
  const universo = exactos.length > 0 ? exactos : cands;
  if (universo.length === 1) return universo[0];

  const medianas = VANOS_PRUEBA.map(([A, H]) => {
    const vals = universo.map((m) => evaluarModelo(m, A, H)).sort((x, y) => x - y);
    const mitad = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[mitad] : (vals[mitad - 1] + vals[mitad]) / 2;
  });

  let mejor = universo[0];
  let mejorCoste = Infinity;
  for (const m of universo) {
    let coste = 0;
    VANOS_PRUEBA.forEach(([A, H], i) => {
      coste += Math.abs(evaluarModelo(m, A, H) - medianas[i]);
    });
    // Desempates: divisor más simple, luego constante más pequeña, luego un
    // orden fijo por operación y coeficientes.
    const clave = [coste, m.n, Math.abs(m.r), m.op, m.p, m.q].join('|');
    const claveMejor = [mejorCoste, mejor.n, Math.abs(mejor.r), mejor.op, mejor.p, mejor.q].join('|');
    if (coste < mejorCoste - 1e-9 || (Math.abs(coste - mejorCoste) < 1e-9 && clave < claveMejor)) {
      mejor = m;
      mejorCoste = coste;
    }
  }
  return mejor;
}

// ---------------------------------------------------------------------------
// Lectura del origen
// ---------------------------------------------------------------------------

interface ExtraccionCruda {
  sistemaNombre: string;
  diseno: string;
  ancho: number;
  alto: number;
  perfiles: Array<{ ref: string; descripcion: string; medida: number; cantidad: number }>;
  vidrios: Array<{ descripcion: string; anchoVidrio: number; altoVidrio: number; cantidad: number }>;
}

/** Agrupa las observaciones por pieza usando (ref, descripción, nº de ocurrencia),
 * que es como el extractor original distingue dos perfiles de la misma referencia
 * que aparecen dos veces con escalas distintas (horizontal y vertical). */
function indexarPiezas(exts: ExtraccionCruda[]) {
  const perfiles = new Map<string, { ref: string; descripcion: string; puntos: Punto[] }>();
  const vidrios = new Map<string, { descripcion: string; ancho: Punto[]; alto: Punto[] }>();

  for (const e of exts) {
    const ocP = new Map<string, number>();
    for (const p of e.perfiles) {
      const base = `${p.ref}||${p.descripcion}`;
      const idx = ocP.get(base) ?? 0;
      ocP.set(base, idx + 1);
      const k = `${base}||${idx}`;
      if (!perfiles.has(k)) perfiles.set(k, { ref: p.ref, descripcion: p.descripcion, puntos: [] });
      perfiles.get(k)!.puntos.push({ A: e.ancho, H: e.alto, y: p.medida });
    }

    const ocV = new Map<string, number>();
    for (const v of e.vidrios) {
      const idx = ocV.get(v.descripcion) ?? 0;
      ocV.set(v.descripcion, idx + 1);
      const k = `${v.descripcion}||${idx}`;
      if (!vidrios.has(k)) vidrios.set(k, { descripcion: v.descripcion, ancho: [], alto: [] });
      vidrios.get(k)!.ancho.push({ A: e.ancho, H: e.alto, y: v.anchoVidrio });
      vidrios.get(k)!.alto.push({ A: e.ancho, H: e.alto, y: v.altoVidrio });
    }
  }
  return { perfiles, vidrios };
}

// ---------------------------------------------------------------------------
// Verificación del emparejamiento
// ---------------------------------------------------------------------------

/**
 * ¿La recta que el ERP tiene guardada para esta pieza es la misma que sale de
 * ajustar por mínimos cuadrados las observaciones que le estoy asignando?
 *
 * Es el candado del script. Si da falso, la pieza de la BD y la del origen no son
 * la misma (orden distinto, descripción cambiada, catálogo editado a mano) y
 * aplicarle este modelo sería asignarle la medida de OTRA pieza.
 */
function coincideConRecta(puntos: Punto[], a: number, b: number, c: number): boolean {
  for (const pt of puntos) {
    const esperado = a * pt.A + b * pt.H + c;
    // 0,51 mm de tolerancia: la recta guardada viene de coeficientes redondeados
    // a 4 decimales, así que no reproduce sus propias muestras al milímetro exacto.
    if (Math.abs(esperado - pt.y) > 0.51) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface ModeloPieza {
  orden: number;
  ref?: string;
  descripcion: string | null;
  modelo: ModeloCorte;
  dispersionMm: number;
  candidatos: number;
  observaciones: number;
}

interface ModeloVidrioPieza {
  orden: number;
  descripcion: string | null;
  ancho: { modelo: ModeloCorte; dispersionMm: number; candidatos: number };
  alto: { modelo: ModeloCorte; dispersionMm: number; candidatos: number };
  observaciones: number;
}

async function main() {
  const { default: sequelize } = await import('../config/database');
  const ruta = process.argv[2] ?? RUTA_MULTIMEDIDA_POR_DEFECTO;
  if (!fs.existsSync(ruta)) {
    throw new Error(
      `No se encuentra el archivo de extracciones: ${ruta || '(sin ruta)'}\n` +
        `Pásalo como argumento: npx ts-node src/scripts/2026-09-13_reconstruir_modelos_corte.ts <ruta>\n` +
        `O define la carpeta que lo contiene: COTIZADOR_DATOS_ORIGEN=D:/ruta/al/proyecto/data`
    );
  }

  console.log(`Leyendo extracciones de: ${ruta}`);
  const crudo = JSON.parse(fs.readFileSync(ruta, 'utf8')) as ExtraccionCruda[];
  console.log(`  ${crudo.length} extracciones\n`);

  const porDiseno = new Map<string, ExtraccionCruda[]>();
  for (const e of crudo) {
    const k = `${e.sistemaNombre}::${e.diseno}`;
    if (!porDiseno.has(k)) porDiseno.set(k, []);
    porDiseno.get(k)!.push(e);
  }

  // --- lo que hay en la BD -------------------------------------------------
  const disenos = (await sequelize.query(
    `SELECT id, sistema, diseno FROM cotizador.diseno ORDER BY id`,
    { type: QueryTypes.SELECT }
  )) as Array<{ id: string; sistema: string; diseno: string }>;

  const perfilesBd = (await sequelize.query(
    `SELECT diseno_id, orden, ref, ref_original, descripcion, formula_a, formula_b, formula_c
       FROM cotizador.diseno_perfil ORDER BY diseno_id, orden`,
    { type: QueryTypes.SELECT }
  )) as Array<Record<string, string | number | null>>;

  const vidriosBd = (await sequelize.query(
    `SELECT diseno_id, orden, descripcion,
            formula_ancho_a, formula_ancho_b, formula_ancho_c,
            formula_alto_a, formula_alto_b, formula_alto_c
       FROM cotizador.diseno_vidrio ORDER BY diseno_id, orden`,
    { type: QueryTypes.SELECT }
  )) as Array<Record<string, string | number | null>>;

  console.log(`BD: ${disenos.length} diseños, ${perfilesBd.length} perfiles, ${vidriosBd.length} paños\n`);

  const porDisenoPerfiles = new Map<string, typeof perfilesBd>();
  for (const p of perfilesBd) {
    const k = p.diseno_id as string;
    if (!porDisenoPerfiles.has(k)) porDisenoPerfiles.set(k, []);
    porDisenoPerfiles.get(k)!.push(p);
  }
  const porDisenoVidrios = new Map<string, typeof vidriosBd>();
  for (const v of vidriosBd) {
    const k = v.diseno_id as string;
    if (!porDisenoVidrios.has(k)) porDisenoVidrios.set(k, []);
    porDisenoVidrios.get(k)!.push(v);
  }

  // --- reconstrucción ------------------------------------------------------
  const salida: Record<string, { perfiles: ModeloPieza[]; vidrios: ModeloVidrioPieza[] }> = {};
  const stats = {
    perfilesConModelo: 0,
    perfilesSinOrigen: 0,
    perfilesSinModelo: 0,
    perfilesNoVerificados: 0,
    vidriosConModelo: 0,
    vidriosSinOrigen: 0,
    vidriosSinModelo: 0,
    vidriosNoVerificados: 0,
    disenosSinOrigen: [] as string[],
  };
  const histoDispersion = new Map<number, number>();

  for (const d of disenos) {
    const exts = porDiseno.get(`${d.sistema}::${d.diseno}`);
    if (!exts || exts.length < 3) {
      stats.disenosSinOrigen.push(d.id);
      continue;
    }
    const { perfiles: idxPerf, vidrios: idxVid } = indexarPiezas(exts);

    // Las piezas del origen, en el mismo orden en que se indexaron: el catálogo
    // del ERP conserva ese orden, así que se consumen por posición y se verifica
    // cada una contra su recta guardada.
    const listaPerf = [...idxPerf.values()];
    const listaVid = [...idxVid.values()];

    const modPerfiles: ModeloPieza[] = [];
    const filasPerf = porDisenoPerfiles.get(d.id) ?? [];
    filasPerf.forEach((fila, i) => {
      const origen = listaPerf[i];
      if (!origen) {
        stats.perfilesSinOrigen++;
        return;
      }
      const a = Number(fila.formula_a);
      const b = Number(fila.formula_b);
      const c = Number(fila.formula_c);
      if (!coincideConRecta(origen.puntos, a, b, c)) {
        stats.perfilesNoVerificados++;
        return;
      }
      const cands = buscarModelos(origen.puntos);
      if (cands.length === 0) {
        stats.perfilesSinModelo++;
        return;
      }
      const disp = dispersion(cands);
      histoDispersion.set(disp, (histoDispersion.get(disp) ?? 0) + 1);
      modPerfiles.push({
        orden: Number(fila.orden),
        ref: (fila.ref as string) ?? undefined,
        descripcion: (fila.descripcion as string | null) ?? null,
        modelo: elegirRepresentante(cands),
        dispersionMm: disp,
        candidatos: cands.length,
        observaciones: origen.puntos.length,
      });
      stats.perfilesConModelo++;
    });

    const modVidrios: ModeloVidrioPieza[] = [];
    const filasVid = porDisenoVidrios.get(d.id) ?? [];
    filasVid.forEach((fila, i) => {
      const origen = listaVid[i];
      if (!origen) {
        stats.vidriosSinOrigen++;
        return;
      }
      const okAncho = coincideConRecta(
        origen.ancho,
        Number(fila.formula_ancho_a),
        Number(fila.formula_ancho_b),
        Number(fila.formula_ancho_c)
      );
      const okAlto = coincideConRecta(
        origen.alto,
        Number(fila.formula_alto_a),
        Number(fila.formula_alto_b),
        Number(fila.formula_alto_c)
      );
      if (!okAncho || !okAlto) {
        stats.vidriosNoVerificados++;
        return;
      }
      const candsA = buscarModelos(origen.ancho);
      const candsH = buscarModelos(origen.alto);
      if (candsA.length === 0 || candsH.length === 0) {
        stats.vidriosSinModelo++;
        return;
      }
      const dA = dispersion(candsA);
      const dH = dispersion(candsH);
      histoDispersion.set(dA, (histoDispersion.get(dA) ?? 0) + 1);
      histoDispersion.set(dH, (histoDispersion.get(dH) ?? 0) + 1);
      modVidrios.push({
        orden: Number(fila.orden),
        descripcion: (fila.descripcion as string | null) ?? null,
        ancho: { modelo: elegirRepresentante(candsA), dispersionMm: dA, candidatos: candsA.length },
        alto: { modelo: elegirRepresentante(candsH), dispersionMm: dH, candidatos: candsH.length },
        observaciones: origen.ancho.length,
      });
      stats.vidriosConModelo++;
    });

    if (modPerfiles.length || modVidrios.length) {
      salida[d.id] = { perfiles: modPerfiles, vidrios: modVidrios };
    }
  }

  // --- informe -------------------------------------------------------------
  console.log('=== RECONSTRUCCIÓN ===');
  console.log(`  perfiles con modelo        : ${stats.perfilesConModelo}`);
  console.log(`  perfiles sin contraparte   : ${stats.perfilesSinOrigen}`);
  console.log(`  perfiles sin modelo entero : ${stats.perfilesSinModelo}`);
  console.log(`  perfiles no verificados    : ${stats.perfilesNoVerificados}  (recta de la BD ≠ observaciones)`);
  console.log(`  paños con modelo           : ${stats.vidriosConModelo}`);
  console.log(`  paños sin contraparte      : ${stats.vidriosSinOrigen}`);
  console.log(`  paños sin modelo entero    : ${stats.vidriosSinModelo}`);
  console.log(`  paños no verificados       : ${stats.vidriosNoVerificados}`);
  if (stats.disenosSinOrigen.length) {
    console.log(`  diseños sin extracciones   : ${stats.disenosSinOrigen.length} (${stats.disenosSinOrigen.slice(0, 5).join(', ')}…)`);
  }

  console.log('\n=== INCERTIDUMBRE RESIDUAL (dispersión entre modelos compatibles) ===');
  for (const d of [...histoDispersion.keys()].sort((a, b) => a - b)) {
    console.log(`  ${d} mm -> ${histoDispersion.get(d)} medidas`);
  }

  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(
    SALIDA,
    JSON.stringify(
      {
        generadoEn: new Date().toISOString(),
        origen: path.basename(ruta),
        extracciones: crudo.length,
        vanosPrueba: VANOS_PRUEBA,
        nota:
          'Modelos de corte reconstruidos por búsqueda entera sobre las observaciones reales ' +
          'del software de origen. dispersionMm es la separación máxima entre todos los modelos compatibles ' +
          'con esas observaciones, medida en los vanos de prueba: es la incertidumbre que queda, ' +
          'no un error medido contra el taller.',
        stats,
        disenos: salida,
      },
      null,
      2
    )
  );
  console.log(`\n✓ Escrito ${SALIDA}`);
  console.log(`  ${Object.keys(salida).length} diseños con modelos reconstruidos`);
  await sequelize.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('FALLO:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
