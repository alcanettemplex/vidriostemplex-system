// Aptitud para ORDEN DE CORTE: única fuente de verdad sobre si una cotización
// (o un ítem suyo) se puede imprimir como orden de corte DEFINITIVA para el
// taller. El cliente (React) nunca decide esto por su cuenta: sólo pinta lo
// que esta función devuelve. Si algún día se necesita el mismo criterio desde
// otro sitio (un job de background, un script de exportación...), se importa
// esta función — no se reescribe la regla.
//
// POR QUÉ NO BASTA CON "aptoParaCorte" NI CON "nivelCorte === A"
// `resultado.aptoParaCorte` (cotizarPorDiseno.js) ya dice si ESE despiece, en
// abstracto, es matemáticamente confiable. Pero una orden de corte no se
// imprime en abstracto: se imprime para UNA cotización concreta, en UN
// momento concreto, y el negocio le añade condiciones que no son del
// despiece sino del PROCESO — que esté aprobada, que el sistema ya esté
// calibrado en producción (no sólo que exista una fórmula de nivel A), que no
// haya errores de precio. `aptoParaCorte` es una de las ocho condiciones de
// abajo, no la única.
//
// LA CONDICIÓN MÁS SUTIL: `resultado` ES UNA FOTO, NO UNA VISTA EN VIVO
// `item.resultado` se persiste ÍNTEGRO en el momento de cotizar. Nada lo
// vuelve a tocar después. Eso es correcto para los TOTALES ($: lo que se le
// cotizó al cliente no debe moverse solo porque alguien calibró un margen la
// semana siguiente) pero es peligroso para el DESPIECE: si el vendedor
// cotizó con la holgura de instalación sin configurar (o con un margen de
// taller distinto al de hoy) y DESPUÉS alguien calibra el sistema, las
// condiciones 1-7 de abajo pueden estar todas en verde con medidas que ya no
// son las que el sistema calcularía ahora mismo. La condición 8 es la única
// forma de detectar esto: recalcula el despiece con los parámetros
// originales y compara contra lo guardado. Ver `verificarVigencia` más abajo.
import { evaluarMadurez, margenEfectivo } from "./calibracion";
import { getMargenes, getSistemas } from "../store/calibracionStore";
import * as cache from "../cache";
import type { Holguras, Margenes, Sistemas } from "../tipos";
import { cotizarPorDiseno } from "./cotizarPorDiseno";


const RUTA_CALIBRACION = "/calibracion";

/** Códigos estables de cada motivo — para que un test (o el propio cliente,
 * si algún día quiere distinguir casos sin parsear texto) pueda comprobar
 * "por qué" sin depender de la redacción exacta. La redacción SÍ puede
 * cambiar libremente; el código, no, o rompe a quien lo esté comparando. */
export const CODIGOS_MOTIVO = {
  COTIZACION_NO_APROBADA: "COTIZACION_NO_APROBADA",
  SIN_DESPIECE_POR_DISENO: "SIN_DESPIECE_POR_DISENO",
  NIVEL_NO_VALIDADO: "NIVEL_NO_VALIDADO",
  HOLGURA_AUSENTE: "HOLGURA_AUSENTE",
  NO_APTO_PARA_CORTE: "NO_APTO_PARA_CORTE",
  HAY_ERRORES_EN_ITEM: "HAY_ERRORES_EN_ITEM",
  SISTEMA_NO_EN_PRODUCCION: "SISTEMA_NO_EN_PRODUCCION",
  MEDIDA_PERFIL_DESACTUALIZADA: "MEDIDA_PERFIL_DESACTUALIZADA",
  MEDIDA_VIDRIO_DESACTUALIZADA: "MEDIDA_VIDRIO_DESACTUALIZADA",
  DESPIECE_NO_VERIFICABLE: "DESPIECE_NO_VERIFICABLE",
};

export interface MotivoAptitud {
  codigo: string;
  texto: string;
  comoSeArregla: string | null;
}

/** El JSONB `resultado` (y el `input`) de un ítem ya guardado.
 *
 * Se tipa laxo A PROPÓSITO, y es el único `any` deliberado del port: es un
 * artefacto inmutable que pudo escribirlo una versión anterior del motor, con
 * campos que hoy ya no existen o que aún no existían. Tiparlo estricto sería
 * declarar una garantía que el dato histórico no ofrece; todo el código que lo
 * lee valida cada campo antes de usarlo (`Number(...)`, `?? []`, comparaciones
 * con tolerancia), que es la forma correcta de tratar un blob de otra época. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ResultadoGuardado = Record<string, any>;

/** Un ítem de cotización tal como se guarda: el input original y el resultado
 * calculado en su momento. La condición 8 recalcula el primero y lo compara
 * contra el segundo. */
export interface ItemCotizacion {
  input?: ResultadoGuardado;
  resultado?: ResultadoGuardado | null;
  [clave: string]: unknown;
}

export interface CotizacionAptitud {
  items?: ItemCotizacion[];
  [clave: string]: unknown;
}

function crearMotivo(codigo: string, texto: string, comoSeArregla: string | null = null): MotivoAptitud {
  return { codigo, texto, comoSeArregla };
}

// ---------------------------------------------------------------------------
// Madurez del sistema (condición 7)
// ---------------------------------------------------------------------------
// `routes/calibracion.routes.js` (GET /calibracion/sistemas) ya calcula
// exactamente esto para TODOS los sistemas a la vez, pero es lógica privada
// de ese router (no exportada) y ese archivo no está en la lista de "tocar
// con cuidado" de esta tarea — así que en vez de arriesgar un choque con
// quien lo esté tocando en paralelo, se replica aquí el mismo algoritmo,
// scoped a UN sistema. No se reinventa la REGLA de madurez (eso se importa
// tal cual de calibracion.js: `evaluarMadurez`) — lo que se repite es sólo el
// INVENTARIO de piezas por sistema a partir de disenos.json, que es un mero
// conteo, no una decisión de negocio.
//
// SI ESTE ARCHIVO Y calibracion.routes.js ALGUNA VEZ DIVERGEN: el criterio
// real, el que ve el usuario en /calibracion, es el de calibracion.routes.js.
// Si se toca la forma de contar piezas/vetadas/con-margen allá, hay que
// traer el mismo cambio aquí o esta función y esa pantalla dejan de estar de
// acuerdo sobre qué sistemas están "en producción".
const ORDEN_NIVEL = ["A", "B", "C"];
const peorNivel = (a: string | null, b: string | null): string | null =>
  ORDEN_NIVEL.indexOf(b ?? "A") > ORDEN_NIVEL.indexOf(a ?? "A") ? b : a;

/**
 * Inventario de piezas calibrables de UN sistema: una entrada por referencia
 * de perfil (nivel = el PEOR de todas sus variantes de fórmula, igual que en
 * calibracion.routes.js) más, si el sistema tiene vidrio, una pieza
 * `{ref:"VIDRIO"}` — su nivel es el `nivelVidrio` del PRIMER diseño de ese
 * sistema que trae vidrio, sin combinar con los demás (mismo comportamiento,
 * intencional o no, de `inventarioPiezas()` en calibracion.routes.js: se
 * replica tal cual para no divergir).
 *
 * Exportada (además de para uso interno) porque construir a mano, en un
 * test, un `margenes.pieza` que cubra el 100% de un sistema real requiere
 * saber qué referencias tiene — y es preferible que el test la pida aquí a
 * que mantenga su propia lista de referencias que se desactualizaría en
 * cuanto cambie disenos.json.
 *
 * @param {string} sistema
 * @returns {Array<{ref:string, material:"aluminio"|"vidrio", nivelCorte:"A"|"B"|"C"}>}
 */
export function inventarioPiezasDeSistema(
  sistema: string
): Array<{ ref: string; material: string; nivelCorte: string | null }> {
  const piezas = new Map<string, { ref: string; material: string; nivelCorte: string | null }>();
  for (const d of cache.getDisenos()) {
    if (d.sistema !== sistema) continue;
    for (const p of d.perfiles) {
      const existente = piezas.get(p.ref);
      if (!existente) piezas.set(p.ref, { ref: p.ref, material: "aluminio", nivelCorte: p.nivelCorte });
      else existente.nivelCorte = peorNivel(existente.nivelCorte, p.nivelCorte);
    }
    if (d.vidrios.length && !piezas.has("VIDRIO")) {
      piezas.set("VIDRIO", { ref: "VIDRIO", material: "vidrio", nivelCorte: d.nivelVidrio });
    }
  }
  return [...piezas.values()];
}

/**
 * Estado de madurez de un sistema, replicando la derivación final de
 * `GET /calibracion/sistemas` (no sólo `evaluarMadurez` en crudo): un estado
 * guardado a mano en "EN_CALIBRACION" DEGRADA el resultado calculado (se
 * puede sacar un sistema de producción a mano, nunca meterlo sin cumplir la
 * cobertura) — perderse ese detalle haría que esta función aprobara un
 * sistema que el jefe de taller acaba de frenar manualmente.
 */
function madurezDeSistema(
  sistema: string,
  { margenes, sistemas }: { margenes: Margenes; sistemas: Sistemas }
) {
  const piezas = inventarioPiezasDeSistema(sistema);
  let piezasTotales = 0;
  let piezasVetadas = 0;
  let piezasConMargen = 0;
  for (const p of piezas) {
    piezasTotales++;
    if (p.nivelCorte === "C") piezasVetadas++;
    // Sólo cuenta el margen aprobado al nivel más específico ("pieza"): un
    // margen de sistema/material/global es un valor por defecto razonable
    // para cotizar, pero no es evidencia de que ESA pieza se contrastó contra
    // el taller — igual que en calibracion.routes.js.
    const m = margenEfectivo(margenes, { sistema, material: p.material, ref: p.ref });
    if (m.origen === "pieza") piezasConMargen++;
  }
  const guardado = sistemas?.[sistema] ?? {};
  const madurez = evaluarMadurez({ piezasTotales, piezasConMargen, piezasVetadas, firmaMaestro: Boolean(guardado.firmaMaestro) });
  const estado = guardado.estado === "EN_CALIBRACION" ? "EN_CALIBRACION" : madurez.estado;
  return { estado, estadoCalculado: madurez.estado, cobertura: madurez.cobertura, motivo: madurez.motivo };
}

// ---------------------------------------------------------------------------
// Vigencia del despiece guardado (condición 8)
// ---------------------------------------------------------------------------
/**
 * Vuelve a cotizar el ítem con los datos que el vendedor escribió
 * originalmente (`item.input`) y compara el despiece recién calculado contra
 * el que quedó guardado en `item.resultado.cortes`.
 *
 * QUÉ PARÁMETROS SE REUTILIZAN Y POR QUÉ SÓLO ÉSOS: de todo lo que acepta
 * `cotizarPorDiseno`, las medidas de corte (`cortes.perfiles[].medidaMm` y
 * `cortes.vidrios[].anchoMm/altoMm`) sólo dependen de `disenoId`, de la
 * medida de fabricación resultante (`anchoCm`/`altoCm`/`medidaEs`/
 * `holguraAnchoMm`/`holguraAltoMm`, que es la cadena vano→fabricación) y de
 * `incluirAlfajia` (cambia qué perfiles entran en la lista). Se comprobó
 * leyendo motorDespiece.js: `colorPerfileria`, `codigoVidrio`,
 * `segmentoCliente`, `cantidadPiezas`, `descuentoPct`, `matizado` y
 * `pelicula` sólo afectan precio/BOM, nunca la medida de corte en sí — así
 * que no hace falta reproducir el resto del `input` (que además varía de un
 * módulo a otro) ni la función `accesorios` de cada módulo para que esta
 * comparación sea exacta.
 *
 * OJO: `cotizarPorDiseno` (y, dentro de él, `calcularDespiece`) leen
 * `getMargenes()`/`getHolguras()` DIRECTAMENTE de `storeCalibracion.js` — no
 * aceptan un override. Por eso esta verificación siempre compara contra la
 * calibración REAL del disco en el momento de llamar, sin importar qué
 * `margenes`/`holguras` se le hayan pasado a `evaluarAptitudOrden`. Es lo
 * correcto para uso real (el objetivo es detectar cambios reales de
 * calibración) y es também lo que hace que un test pueda construir un
 * escenario "sin discrepancia" sin depender del disco: si el `resultado`
 * guardado se generó llamando a `cotizarPorDiseno` una vez, y esta función lo
 * llama de nuevo sin que nada cambie entre medias, el resultado es
 * idéntico por construcción.
 *
 * @param {Object} item - un ítem de cotización con `input` y `resultado`.
 * @returns {{desactualizado: boolean, motivos: Array}}
 */
function verificarVigencia(item: ItemCotizacion) {
  const resultado = item.resultado;
  const input = item.input ?? {};
  const disenoId = input.disenoId ?? resultado?.diseno?.id ?? null;
  const anchoCm = Number(input.anchoCm);
  const altoCm = Number(input.altoCm);

  if (!disenoId || !Number.isFinite(anchoCm) || !Number.isFinite(altoCm)) {
    return {
      desactualizado: true,
      motivos: [
        crearMotivo(
          CODIGOS_MOTIVO.DESPIECE_NO_VERIFICABLE,
          "No se pudo volver a calcular este ítem para comprobar que las medidas siguen vigentes " +
            "(falta disenoId, anchoCm o altoCm en los datos originales del ítem). Revísalo manualmente " +
            "antes de emitir la orden.",
          null
        ),
      ],
    };
  }

  let recalculado;
  try {
    recalculado = cotizarPorDiseno({
      disenoId,
      anchoCm,
      altoCm,
      medidaEs: input.medidaEs,
      holguraAnchoMm: input.holguraAnchoMm,
      holguraAltoMm: input.holguraAltoMm,
      incluirAlfajia: input.incluirAlfajia,
    });
  } catch (e) {
    return {
      desactualizado: true,
      motivos: [
        crearMotivo(
          CODIGOS_MOTIVO.DESPIECE_NO_VERIFICABLE,
          `No se pudo volver a calcular este ítem para comprobar que sigue vigente (${e instanceof Error ? e.message : e}). ` +
            "Revísalo manualmente antes de emitir la orden.",
          null
        ),
      ],
    };
  }

  if (!recalculado) {
    return {
      desactualizado: true,
      motivos: [
        crearMotivo(
          CODIGOS_MOTIVO.DESPIECE_NO_VERIFICABLE,
          `El diseño "${disenoId}" ya no existe en el catálogo, así que no se puede confirmar que las ` +
            "medidas guardadas sigan vigentes. Revísalo manualmente antes de emitir la orden.",
          null
        ),
      ],
    };
  }

  const motivos = [];

  const perfilesGuardados = resultado?.cortes?.perfiles ?? [];
  const perfilesRecalc = recalculado.cortes?.perfiles ?? [];
  if (perfilesGuardados.length !== perfilesRecalc.length) {
    motivos.push(
      crearMotivo(
        CODIGOS_MOTIVO.DESPIECE_NO_VERIFICABLE,
        `El despiece guardado tiene ${perfilesGuardados.length} pieza(s) de perfil y el recalculado tiene ` +
          `${perfilesRecalc.length}: la estructura del diseño cambió (¿se editó el catálogo?). Recalcula el ` +
          "ítem manualmente antes de emitir la orden.",
        null
      )
    );
  } else {
    perfilesGuardados.forEach((guardado: Record<string, unknown>, i: number) => {
      const nuevo = perfilesRecalc[i];
      if (Math.abs(Number(guardado.medidaMm) - Number(nuevo.medidaMm)) > 0.005) {
        motivos.push(
          crearMotivo(
            CODIGOS_MOTIVO.MEDIDA_PERFIL_DESACTUALIZADA,
            `La pieza ${guardado.ref ?? nuevo.ref} daba ${guardado.medidaMm} mm y ahora da ${nuevo.medidaMm} mm ` +
              "— recalcula el ítem antes de emitir la orden.",
            null
          )
        );
      }
    });
  }

  // Extensión sobre lo mínimo pedido: el vidrio nunca lleva margen de
  // calibración (motorDespiece.js no se lo aplica), pero SÍ depende de la
  // medida de fabricación — así que una holgura recién configurada puede
  // desactualizar un paño sin tocar ni un perfil (diseños con pocos o
  // ningún perfil nivel A). Mismo mecanismo, mismo motivo de fondo que la
  // condición 8 pedida; se separa sólo para que el mensaje nombre el paño en
  // vez de una "pieza".
  const vidriosGuardados = resultado?.cortes?.vidrios ?? [];
  const vidriosRecalc = recalculado.cortes?.vidrios ?? [];
  if (vidriosGuardados.length === vidriosRecalc.length) {
    vidriosGuardados.forEach((guardado: Record<string, unknown>, i: number) => {
      const nuevo = vidriosRecalc[i];
      const cambioAncho = Math.abs(Number(guardado.anchoMm) - Number(nuevo.anchoMm)) > 0.005;
      const cambioAlto = Math.abs(Number(guardado.altoMm) - Number(nuevo.altoMm)) > 0.005;
      if (cambioAncho || cambioAlto) {
        const nombre = guardado.descripcion || `paño ${i + 1}`;
        motivos.push(
          crearMotivo(
            CODIGOS_MOTIVO.MEDIDA_VIDRIO_DESACTUALIZADA,
            `El ${nombre} daba ${guardado.anchoMm}×${guardado.altoMm} mm y ahora da ${nuevo.anchoMm}×${nuevo.altoMm} mm ` +
              "— recalcula el ítem antes de emitir la orden.",
            null
          )
        );
      }
    });
  }
  // (si difiere hasta la CANTIDAD de paños no se compara aquí: ya lo habría
  // señalado el chequeo de perfiles como cambio de estructura en la enorme
  // mayoría de los casos reales, y añadir un tercer tipo de motivo para un
  // caso tan raro no aporta claridad.)

  return { desactualizado: motivos.length > 0, motivos };
}

// ---------------------------------------------------------------------------
// Evaluación por ítem
// ---------------------------------------------------------------------------
function evaluarItem(
  item: ItemCotizacion,
  cotizacion: CotizacionAptitud,
  { margenes, sistemas }: { margenes: Margenes; sistemas: Sistemas }
) {
  const motivos = [];
  const resultado = item.resultado;

  // 1. Cotización aprobada. Se evalúa siempre (incluso para un ítem sin
  // diseño): un Tablero en una cotización pendiente tiene DOS razones para no
  // imprimirse y conviene que las vea las dos, no sólo la primera que se nos
  // ocurrió revisar.
  if (cotizacion?.estado !== "APROBADA") {
    motivos.push(
      crearMotivo(
        CODIGOS_MOTIVO.COTIZACION_NO_APROBADA,
        `Sólo se corta con cotización aprobada. Esta cotización está en estado ${cotizacion?.estado ?? "desconocido"}.`,
        null
      )
    );
  }

  // 2. Tiene despiece por diseño. Sin esto (Tablero, medidas libres) el resto
  // de condiciones no tiene nada que evaluar: se corta aquí.
  if (!resultado?.cortes) {
    motivos.push(
      crearMotivo(CODIGOS_MOTIVO.SIN_DESPIECE_POR_DISENO, "Este producto no tiene despiece por diseño.", null)
    );
    return { itemId: item.id, imprimible: false, motivos };
  }

  const sistema = resultado.diseno?.sistema ?? null;
  const nivel = resultado.diseno?.nivelCorte ?? null;

  // 3. Nivel de corte A.
  if (nivel !== "A") {
    motivos.push(
      crearMotivo(
        CODIGOS_MOTIVO.NIVEL_NO_VALIDADO,
        `Nivel ${nivel ?? "desconocido"}: la fórmula de este diseño no está validada, no se arregla ` +
          "calibrando — hace falta identificarla primero.",
        RUTA_CALIBRACION
      )
    );
  }

  // 4. Holgura de instalación configurada — la que quedó GUARDADA en el
  // momento de cotizar. "no-aplica" (medida dada por fabricación, no por
  // vano) pasa igual que una holgura configurada: no le falta nada por
  // definir. Sólo "ausente" bloquea.
  if (resultado.medidas?.holgura?.origen === "ausente") {
    motivos.push(
      crearMotivo(
        CODIGOS_MOTIVO.HOLGURA_AUSENTE,
        `El sistema ${sistema ?? "de este diseño"} no tiene holgura de instalación configurada.`,
        RUTA_CALIBRACION
      )
    );
  }

  // 5. aptoParaCorte, ya calculado por cotizarPorDiseno/calcularDespiece: no
  // se recalcula aquí, se reutiliza tal cual.
  if (resultado.aptoParaCorte !== true) {
    motivos.push(
      crearMotivo(
        CODIGOS_MOTIVO.NO_APTO_PARA_CORTE,
        "El propio despiece quedó marcado como no apto para corte (nivel de corte o medida inválida). " +
          "Revisa las advertencias guardadas en el ítem.",
        null
      )
    );
  }

  // 6. Sin errores de presupuesto (códigos de catálogo inexistentes, etc.).
  if (resultado.hayErrores !== false) {
    motivos.push(
      crearMotivo(
        CODIGOS_MOTIVO.HAY_ERRORES_EN_ITEM,
        "Este ítem tiene líneas de presupuesto marcadas en error (por ejemplo, un código de catálogo " +
          "que no existe). Corrígelas antes de emitir la orden.",
        null
      )
    );
  }

  // 7. El sistema del diseño, en producción.
  if (sistema) {
    const madurez = madurezDeSistema(sistema, { margenes, sistemas });
    if (madurez.estado !== "EN_PRODUCCION") {
      motivos.push(
        crearMotivo(
          CODIGOS_MOTIVO.SISTEMA_NO_EN_PRODUCCION,
          `El sistema ${sistema} todavía no está en producción (estado actual: ${madurez.estado}). ${madurez.motivo}`,
          RUTA_CALIBRACION
        )
      );
    }
  }

  // 8. El despiece guardado sigue vigente: recalculado con los mismos datos
  // de entrada, da las mismas medidas ahora mismo.
  const vigencia = verificarVigencia(item);
  if (vigencia.desactualizado) motivos.push(...vigencia.motivos);

  return { itemId: item.id, imprimible: motivos.length === 0, motivos };
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------
/**
 * Evalúa si una cotización guardada (y cada uno de sus ítems) se puede
 * imprimir como ORDEN DE CORTE definitiva para el taller.
 *
 * SOBRE LA FIRMA: el segundo parámetro replica, campo por campo, lo que
 * devuelven los tres getters de `storeCalibracion.js`
 * (`getMargenes`/`getHolguras`/`getSistemas`) — a propósito, para dos usos
 * distintos:
 *   · Cómodo desde una ruta HTTP: se llama `evaluarAptitudOrden(cotizacion)`
 *     sin más, y la función arma su propio contexto leyendo el disco.
 *   · Testeable con datos sintéticos: un test puede construir un `margenes`/
 *     `sistemas` a mano (sin escribir nada en `calibracion.json`) y pasarlos
 *     aquí para probar un escenario de calibración concreto sin depender del
 *     estado real del disco ni de otros tests que lo modifiquen.
 *
 * `holguras` se acepta por la misma simetría (y por si una condición futura
 * lo necesita), pero NINGUNA condición de HOY lo lee directamente: la
 * condición 4 usa la holgura ya fotografiada en `item.resultado.medidas`
 * (así fue la cotización cuando se creó) y la condición 8 recalcula llamando
 * a `cotizarPorDiseno`, que lee `getHolguras()` DIRECTAMENTE del disco (no
 * acepta un override — ver `verificarVigencia`). Es decir: pasar un
 * `holguras` sintético aquí no cambia nada de lo que esta función decide hoy
 * — se documenta así, explícitamente, para que nadie pierda tiempo
 * intentando controlar la condición 8 a través de este parámetro.
 *
 * @param {Object} cotizacion - cotización guardada completa, forma de
 *   `store.js`/`cotizaciones.routes.js`: `{id, estado, items: [...], ...}`.
 * @param {Object} [ctx]
 * @param {Object} [ctx.margenes] - forma de `storeCalibracion.getMargenes()`.
 *   Por defecto, se lee del disco.
 * @param {Object} [ctx.holguras] - forma de `storeCalibracion.getHolguras()`.
 *   Aceptado por simetría; ver nota de arriba sobre por qué no afecta el
 *   resultado hoy. Por defecto, se lee del disco (aunque no se use).
 * @param {Object} [ctx.sistemas] - forma de `storeCalibracion.getSistemas()`.
 *   Por defecto, se lee del disco.
 * @returns {{
 *   imprimible: boolean,
 *   porItem: Array<{itemId: string, imprimible: boolean, motivos: Array<{codigo:string, texto:string, comoSeArregla:string|null}>}>
 * }}
 *   `imprimible` (el de arriba, el de toda la cotización) es `true` sólo si
 *   HAY al menos un ítem y TODOS sus ítems son individualmente imprimibles.
 *   Una cotización con un ítem de Tablero mezclado con ítems de diseño nunca
 *   llega a `imprimible:true` como conjunto — es correcto: no hay una única
 *   orden de corte que represente "toda" esa cotización, porque el Tablero
 *   no tiene nada que cortar por este camino. Lo que de verdad importa para
 *   el taller es `porItem`, ítem por ítem; `imprimible` es sólo el resumen de
 *   un vistazo.
 */
export function evaluarAptitudOrden(
  cotizacion: CotizacionAptitud,
  {
    margenes,
    holguras,
    sistemas,
  }: { margenes?: Margenes; holguras?: Holguras; sistemas?: Sistemas } = {}
) {
  void holguras; // aceptado por simetría con el store de calibración — ver JSDoc: ninguna condición lo usa hoy.
  const margenesEfectivos = margenes ?? getMargenes();
  const sistemasEfectivos = sistemas ?? getSistemas();

  const items = cotizacion?.items ?? [];
  const porItem = items.map((item: ItemCotizacion) =>
    evaluarItem(item, cotizacion, { margenes: margenesEfectivos, sistemas: sistemasEfectivos })
  );
  const imprimible = porItem.length > 0 && porItem.every((it) => it.imprimible);

  return { imprimible, porItem };
}
