// Motor de CALIBRACIÓN: convierte el conocimiento del maestro del taller en
// parámetros del sistema.
//
// EL PROBLEMA QUE RESUELVE
// Las fórmulas de despiece se ajustaron con 3 medidas y 3 incógnitas, así que
// reproducen sus muestras por construcción y no están validadas. Hoy quien sabe
// la medida correcta es el maestro, de memoria. Aquí se registra, pieza por
// pieza, lo que calcula el sistema frente a lo que el maestro corta de verdad, y
// de esa comparación salen los márgenes.
//
// DOS PROBLEMAS DISTINTOS QUE NO COMPARTEN DATOS
// El error de las fórmulas no es todo de la misma naturaleza:
//
//   Nivel A  -> la fórmula es exacta. Lo que falte es un margen real del taller:
//               parámetro continuo, se estima con estadística robusta.
//   Nivel B  -> hay una división limpia (/2, /4) cuyo modo de redondeo se
//               desconoce. NO es un margen: es un parámetro discreto. Se resuelve
//               midiendo 2-3 anchos elegidos a propósito, no acumulando decenas
//               de contrastes.
//   Nivel C  -> el denominador delata la rejilla de muestreo de 500 mm: el modelo
//               lineal es falso para esa pieza y su error cambia con el tamaño.
//               Un margen constante lo arregla en un punto y lo empeora en el
//               resto, así que aquí NO se propone margen ninguno.
//
// Mezclarlos contamina la dispersión con error de modelo y hace saltar falsas
// alarmas de "hay una variable oculta".
//
// DOS RESTAS ENCADENADAS, NO UNA
// El vendedor escribe el VANO (el hueco de obra). El maestro hace dos descuentos
// de naturaleza distinta antes de cortar:
//   1. holgura de instalación : vano -> medida de fabricación de la ventana.
//      Depende del tipo de instalación y de la obra, no del perfil.
//   2. descuento de corte     : fabricación -> medida de cada pieza.
//      Depende de la sección del perfil.
// Si se mezclan en un solo número, el margen deja de tener sentido en cuanto
// cambia el tipo de instalación. Por eso son dos parámetros separados.
import { round2 } from "./motorCalculo";
import type { Holguras, Margenes } from "../tipos";

/** Un contraste es la comparación entre lo que calculó el sistema y lo que
 * cortó el maestro. `medidaSistemaBrutaMm` es SIEMPRE sin margen aplicado. */
export interface ContrasteEntrada {
  medidaSistemaBrutaMm: number;
  medidaMaestroMm: number;
  anchoVanoMm?: number | null;
  altoVanoMm?: number | null;
  [clave: string]: unknown;
}

export type Material = keyof typeof UMBRALES;

// ---------------------------------------------------------------------------
// Umbrales
// ---------------------------------------------------------------------------
// El aluminio y el vidrio templado no se pueden calibrar con el mismo rasero:
// una barra mal cortada se vuelve a cortar; un vidrio templado mal cortado es
// chatarra, porque el temple es posterior al corte y no admite retoque.
export const UMBRALES = {
  aluminio: {
    minContrastes: 5,
    minTamanosDistintos: 3,
    minRangoMm: 600, // sin rango se aprende el número, no la regla
    maxDispersionMm: 1.0,
    // Ante la duda se corta LARGO: sobra material que se recorta.
    cuantil: 0.8,
    redondeo: "ceil",
  },
  vidrio: {
    minContrastes: 8,
    minTamanosDistintos: 3,
    minRangoMm: 600,
    maxDispersionMm: 2.0, // la tolerancia del propio horno ronda ±1 mm
    // Ante la duda se corta CORTO: un vidrio grande no se recorta, se pierde.
    cuantil: 0.17,
    redondeo: "floor",
  },
};

// Precisión con la que se puede leer una medida en el taller (cuantización de
// 1 mm más lectura). Sirve de piso: sin él, tres contrastes idénticos darían
// dispersión 0 y el sistema se creería infalible.
const PISO_SIGMA_MM = 0.35;

// Diferencia tan grande que sólo puede ser un error de transcripción.
const LIMITE_IMPOSIBLE_PCT = 0.25;

export const ESTADOS_MADUREZ = ["EN_CALIBRACION", "VALIDADO", "EN_PRODUCCION"];

// ---------------------------------------------------------------------------
// Estadística robusta
// ---------------------------------------------------------------------------
// Se usan mediana y MAD en vez de media y desviación estándar porque un solo
// error de digitación (1183 tecleado 1138) desplaza la media más que el efecto
// completo que se quiere medir, mientras la mediana ni se entera.
export function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const s = [...valores].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function mad(valores: number[]): number | null {
  const med = mediana(valores);
  if (med === null) return null;
  return mediana(valores.map((v: number) => Math.abs(v - med)));
}

/** Desviación robusta comparable a σ, con piso: MAD × 1.4826. */
export function sigmaRobusta(valores: number[]): number | null {
  const m = mad(valores);
  if (m === null) return null;
  return Math.max(m * 1.4826, PISO_SIGMA_MM);
}

export function cuantil(valores: number[], p: number): number | null {
  if (!valores.length) return null;
  const s = [...valores].sort((a, b) => a - b);
  const pos = (s.length - 1) * p;
  const bajo = Math.floor(pos);
  const alto = Math.ceil(pos);
  if (bajo === alto) return s[bajo];
  return s[bajo] + (s[alto] - s[bajo]) * (pos - bajo);
}

/**
 * Pendiente de Theil–Sen: mediana de las pendientes entre todos los pares.
 * Resiste hasta un 29% de datos corruptos, cosa que una regresión por mínimos
 * cuadrados no hace, y con 10-30 puntos es lo único defendible.
 */
export function pendienteTheilSen(puntos: Array<{ x: number; y: number }>): number | null {
  const pendientes: number[] = [];
  for (let i = 0; i < puntos.length; i++) {
    for (let j = i + 1; j < puntos.length; j++) {
      const dx = puntos[j].x - puntos[i].x;
      if (Math.abs(dx) < 1e-9) continue;
      pendientes.push((puntos[j].y - puntos[i].y) / dx);
    }
  }
  return pendientes.length ? mediana(pendientes) : null;
}

// ---------------------------------------------------------------------------
// Clasificación de cada contraste
// ---------------------------------------------------------------------------
/**
 * Tres niveles, no dos: descartar todo lo raro borra señal real, y aceptarlo
 * todo deja pasar erratas.
 *   imposible  -> se rechaza en la entrada (no puede ser una medida de taller)
 *   sospechoso -> se conserva y se marca; si varios sospechosos concuerdan entre
 *                 sí, no son basura sino un segundo régimen (una variable oculta)
 *   normal     -> entra en el cálculo
 */
export function clasificarContraste(contraste: ContrasteEntrada, todosLosDeltas: number[] = []) {
  const d = contraste.medidaMaestroMm - contraste.medidaSistemaBrutaMm;
  const relativo = Math.abs(d) / Math.max(contraste.medidaSistemaBrutaMm, 1);

  if (!Number.isFinite(d)) return { clase: "imposible", motivo: "Medida no numérica.", delta: null };
  if (relativo > LIMITE_IMPOSIBLE_PCT) {
    return {
      clase: "imposible",
      motivo: `La diferencia es del ${Math.round(relativo * 100)}% de la medida: parece un error al teclear, no un ajuste de taller.`,
      delta: d,
    };
  }

  if (todosLosDeltas.length >= 4) {
    const med = mediana(todosLosDeltas);
    const sigma = sigmaRobusta(todosLosDeltas);
    const z = Math.abs(d - med!) / sigma!;
    if (z > 3.5) {
      return {
        clase: "sospechoso",
        motivo: `Se aparta ${z.toFixed(1)} veces de lo habitual en esta pieza. Se guarda, pero conviene revisarlo.`,
        delta: d,
      };
    }
  }
  return { clase: "normal", motivo: null, delta: d };
}

// ---------------------------------------------------------------------------
// Propuesta de margen
// ---------------------------------------------------------------------------
/**
 * Analiza los contrastes de UNA pieza y decide si se puede proponer un margen.
 *
 * Devuelve siempre un diagnóstico legible: cuando el sistema no puede proponer,
 * lo importante no es el "no", sino el motivo — casi siempre significa que hay
 * una variable que el registro no está capturando.
 *
 * @param {Array} contrastes - [{ medidaSistemaBrutaMm, medidaMaestroMm, anchoVanoMm, altoVanoMm }]
 * @param {Object} opts - { material: "aluminio"|"vidrio", nivelCorte: "A"|"B"|"C" }
 */
export function analizarPieza(
  contrastes: ContrasteEntrada[],
  { material = "aluminio", nivelCorte = "A" }: { material?: string; nivelCorte?: string } = {}
) {
  const u = UMBRALES[material as Material] ?? UMBRALES.aluminio;
  const base = { material, nivelCorte, umbrales: u, totalContrastes: contrastes.length };

  // Nivel C: el error no es constante, así que ningún margen constante lo
  // arregla. Con el offset perfecto el error residual sigue siendo la mitad de
  // la amplitud del diente de sierra, y según en qué tamaños caigan los
  // contrastes puede incluso empeorar el resto. No se propone nada.
  if (nivelCorte === "C") {
    return {
      ...base,
      puedeProponer: false,
      motivo:
        "Esta pieza usa una fórmula que se sabe incorrecta: su error cambia con el tamaño, " +
        "así que un margen fijo lo corregiría en una medida y lo empeoraría en las demás. " +
        "Hay que averiguar la fórmula real antes de calibrar nada.",
      accionSugerida: "identificar-formula",
    };
  }

  // Nivel B: falta un dato discreto (cómo redondea la división), no un margen.
  // Se resuelve con dos o tres medidas en anchos que nunca se muestrearon.
  if (nivelCorte === "B") {
    return {
      ...base,
      puedeProponer: false,
      motivo:
        "A esta pieza no le falta un margen: le falta saber cómo redondea su división. " +
        "Con dos o tres cortes en anchos que no sean múltiplos redondos queda resuelta para siempre.",
      accionSugerida: "identificar-formula",
      anchosSugeridos: [901, 1207, 1503],
    };
  }

  const validos = contrastes.filter((c) => Number.isFinite(c.medidaMaestroMm) && Number.isFinite(c.medidaSistemaBrutaMm));
  const deltas = validos.map((c) => c.medidaMaestroMm - c.medidaSistemaBrutaMm);

  if (validos.length < u.minContrastes) {
    return {
      ...base,
      puedeProponer: false,
      motivo: `Faltan contrastes: hay ${validos.length} y hacen falta ${u.minContrastes}.`,
      accionSugerida: "seguir-midiendo",
      faltan: u.minContrastes - validos.length,
    };
  }

  // Exigir variedad de tamaños: con todos los contrastes en 1000×1200 se
  // aprendería el número de esa ventana, no la regla de la pieza.
  const tamanos = new Set(validos.map((c) => `${c.anchoVanoMm}x${c.altoVanoMm}`));
  const anchos = validos
    .map((c) => c.anchoVanoMm)
    .filter((v): v is number => Number.isFinite(v));
  const rango = anchos.length ? Math.max(...anchos) - Math.min(...anchos) : 0;
  if (tamanos.size < u.minTamanosDistintos || rango < u.minRangoMm) {
    return {
      ...base,
      puedeProponer: false,
      motivo:
        `Todos los contrastes están en medidas parecidas (${tamanos.size} tamaños, ${Math.round(rango)} mm de diferencia). ` +
        `Hacen falta al menos ${u.minTamanosDistintos} tamaños distintos separados por ${u.minRangoMm} mm ` +
        `para distinguir un descuento fijo de uno que crece con la medida.`,
      accionSugerida: "medir-otros-tamanos",
      tamanosDistintos: tamanos.size,
      rangoMm: Math.round(rango),
    };
  }

  const med = mediana(deltas);
  const sigma = sigmaRobusta(deltas);

  // ¿El descuento es constante o crece con la medida? Se mira la pendiente de la
  // diferencia contra la medida: plana = descuento fijo, inclinada = proporcional.
  const puntos = validos.map((c) => ({ x: c.medidaSistemaBrutaMm, y: c.medidaMaestroMm - c.medidaSistemaBrutaMm }));
  const pendiente = pendienteTheilSen(puntos);
  const medidas = puntos.map((p) => p.x);
  const rangoMedida = Math.max(...medidas) - Math.min(...medidas);
  // Sólo se declara "proporcional" si a lo largo del rango observado la
  // inclinación produce al menos 1 mm de diferencia: por debajo de eso es ruido.
  const efectoPendiente = pendiente !== null ? Math.abs(pendiente) * rangoMedida : 0;
  const tipo = efectoPendiente >= 1 ? "factor" : "offset";

  if (sigma! > u.maxDispersionMm) {
    return {
      ...base,
      puedeProponer: false,
      motivo:
        `Las diferencias no se repiten: varían ±${sigma!.toFixed(1)} mm y el máximo admisible es ` +
        `±${u.maxDispersionMm} mm. Eso no es un margen que aprender, es una señal de que algo cambia ` +
        `entre una pieza y otra y no se está anotando.`,
      accionSugerida: "buscar-variable-oculta",
      dispersionMm: round2(sigma!),
      medianaMm: round2(med!),
      deltas: deltas.map(round2),
    };
  }

  // Sesgo asimétrico según qué cuesta más equivocarse: en aluminio se prefiere
  // pasarse (se recorta); en vidrio templado, quedarse corto (lo contrario es
  // tirar la pieza).
  const valorSesgado = cuantil(deltas, u.cuantil);
  const margenMm = u.redondeo === "ceil" ? Math.ceil(valorSesgado!) : Math.floor(valorSesgado!);

  return {
    ...base,
    puedeProponer: true,
    tipo,
    margenMm,
    medianaMm: round2(med!),
    dispersionMm: round2(sigma!),
    pendiente: pendiente !== null ? Number(pendiente.toFixed(5)) : null,
    efectoPendienteMm: round2(efectoPendiente),
    tamanosDistintos: tamanos.size,
    rangoMm: Math.round(rango),
    contrastes: validos.length,
    deltas: deltas.map(round2),
    explicacion:
      tipo === "offset"
        ? `El sistema se queda ${Math.abs(med!).toFixed(1)} mm ${med! > 0 ? "corto" : "largo"} de forma pareja en todas las medidas.`
        : `La diferencia crece con el tamaño de la pieza (${efectoPendiente.toFixed(1)} mm a lo largo del rango medido): ` +
          `no es un descuento fijo, conviene revisar la fórmula antes de fijar un margen.`,
  };
}

// ---------------------------------------------------------------------------
// Cascada de márgenes
// ---------------------------------------------------------------------------
// AUSENTE y CERO no son lo mismo: "no he medido esta pieza" y "la medí y no
// lleva descuento" llevan a decisiones distintas. Por eso un nivel sin valor se
// omite del objeto en vez de guardarse como 0.
//
// El nivel más específico REEMPLAZA a los de arriba, no se suma: el margen se
// estima como la diferencia total entre lo que corta el maestro y lo que calcula
// la fórmula, así que ya incluye todo. Si se sumaran, el mismo contraste daría
// un margen distinto según lo que hubiera definido en los niveles superiores.
export function margenEfectivo(
  margenes: Margenes | null | undefined,
  { sistema, material, ref }: { sistema?: string; material?: string; ref?: string }
) {
  const candidatos = [
    { nivel: "pieza", clave: `${sistema}|${ref}`, valor: margenes?.pieza?.[`${sistema}|${ref}`] },
    { nivel: "material", clave: `${sistema}|${material}`, valor: margenes?.material?.[`${sistema}|${material}`] },
    { nivel: "sistema", clave: sistema, valor: margenes?.sistema?.[sistema as string] },
    { nivel: "global", clave: "global", valor: margenes?.global },
  ];
  for (const c of candidatos) {
    if (c.valor !== undefined && c.valor !== null) {
      return { margenMm: c.valor, origen: c.nivel, clave: c.clave };
    }
  }
  return { margenMm: 0, origen: "sin-calibrar", clave: null };
}

// ---------------------------------------------------------------------------
// Holgura de instalación — la PRIMERA de las dos restas
// ---------------------------------------------------------------------------
// El vendedor mide el VANO. La ventana no se fabrica a esa medida: se fabrica
// más pequeña, para que entre y para que quede espacio de aplomar y sellar.
// Ese descuento es la holgura de instalación, y NO es lo mismo que el margen de
// corte:
//
//   · la holgura depende de la obra y del tipo de instalación (a boquilla, con
//     contramarco, sobre alfajía existente). Cambia de proyecto a proyecto.
//   · el margen de corte depende de la sección del perfil. Es del taller y no
//     cambia mientras no cambie el proveedor de perfilería.
//
// Si se dejan mezclados en un solo número, el margen calibrado deja de valer en
// cuanto llega una obra que se instala distinto — y lo peor es que nadie se
// entera, porque el número sigue "funcionando" en promedio.
//
// Igual que con los márgenes: AUSENTE y CERO son distintos. "Todavía no he
// medido cuánta holgura deja el maestro" y "la medí y este sistema va justo al
// vano" llevan a decisiones opuestas, así que ausente se marca y se avisa, no se
// hace pasar por cero en silencio.
export function holguraEfectiva(
  holguras: Holguras | null | undefined,
  { sistema }: { sistema?: string } = {}
) {
  const candidatos = [
    { nivel: "sistema", clave: sistema, valor: holguras?.sistema?.[sistema as string] },
    { nivel: "global", clave: "global", valor: holguras?.global },
  ];
  for (const c of candidatos) {
    if (c.valor) {
      return {
        anchoMm: Number(c.valor.anchoMm) || 0,
        altoMm: Number(c.valor.altoMm) || 0,
        origen: c.nivel,
        clave: c.clave,
        nota: c.valor.nota ?? null,
      };
    }
  }
  return { anchoMm: 0, altoMm: 0, origen: "ausente", clave: null, nota: null };
}

// ---------------------------------------------------------------------------
// Madurez de un sistema
// ---------------------------------------------------------------------------
/**
 * Un sistema no se pone en producción de golpe: avanza cuando sus piezas están
 * cubiertas. Salir de producción tiene que ser más fácil que entrar.
 */
export function evaluarMadurez({
  piezasTotales,
  piezasConMargen,
  piezasVetadas,
  firmaMaestro,
}: {
  piezasTotales: number;
  piezasConMargen: number;
  piezasVetadas: number;
  firmaMaestro?: boolean;
}) {
  const calibrables = Math.max(piezasTotales - piezasVetadas, 0);
  const cobertura = calibrables > 0 ? piezasConMargen / calibrables : 0;

  if (cobertura >= 1 && firmaMaestro) {
    return { estado: "EN_PRODUCCION", cobertura, motivo: "Todas las piezas calibrables tienen margen aprobado y el maestro firmó." };
  }
  if (cobertura >= 1) {
    return {
      estado: "VALIDADO",
      cobertura,
      motivo: "Todas las piezas calibrables tienen margen aprobado. Falta la firma del maestro para pasar a producción.",
    };
  }
  return {
    estado: "EN_CALIBRACION",
    cobertura,
    motivo: `${piezasConMargen} de ${calibrables} piezas calibradas.`,
    faltan: calibrables - piezasConMargen,
  };
}
