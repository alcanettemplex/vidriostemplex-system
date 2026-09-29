/**
 * Tokens de visualización de datos del ERP (2026-09-28) — ver design/sistema-visual/README.md,
 * sección "Gráficas y KPI".
 *
 * Toda gráfica, barra de progreso, embudo o tarjeta de KPI toma sus colores de aquí, nunca de
 * un hex escrito a mano. Cada paleta está validada con el script del skill `dataviz`
 * (contraste, separación para daltonismo, banda de luminosidad) contra el blanco de las
 * tarjetas; cambiar un valor obliga a volver a validar.
 *
 * Cuatro trabajos de color, cada uno con su regla:
 *   CATEGORICA  identidad (asesor, origen, serie). Se asigna por ENTIDAD y en orden fijo,
 *               nunca por la posición en la lista: un filtro no debe repintar a nadie.
 *   ORDINAL     etapas ordenadas (embudos). Un solo tono, de claro a oscuro.
 *   ESTADO      bien / atención / grave / crítico. Reservado: nunca se usa como "serie 4",
 *               y siempre va con icono o texto, nunca solo.
 *   Los estados de ODP y de caja tienen su propio semáforo (utils/estadosODP y CAJA_HEX):
 *   el usuario ya lo sabe leer y no se toca.
 */

/** Categórica, azul Templex primero. Validada: CVD ΔE adyacente mínimo 9,1; visión normal 19,6.
 *  Los tonos 3, 4 y 5 quedan por debajo de 3:1 sobre blanco: al usarlos, rotular el valor. */
export const CATEGORICA = [
  '#1f5ad6', // azul Templex
  '#eb6834', // naranja
  '#1baf7a', // aguamarina
  '#eda100', // amarillo
  '#e87ba4', // magenta
  '#008300', // verde
  '#4a3aa7', // violeta
  '#e34948', // rojo
] as const;

/** Rampa ordinal azul Templex, claro → oscuro. Validada con --ordinal (paso mínimo ΔL 0,06;
 *  el tono más claro queda en 2,25:1 sobre blanco). */
export const ORDINAL_AZUL = ['#7eaefc', '#4f8bf7', '#1f5ad6', '#1a47ad', '#142f73'] as const;

/** Estado. Mismos matices del semáforo que el ERP ya usa en badges (emerald/amber/orange/rose). */
export const ESTADO = {
  bien: '#059669',
  atencion: '#d97706',
  grave: '#ea580c',
  critico: '#e11d48',
} as const;

/** Caja de la ODP. Semáforo de negocio: se conserva, solo se centraliza. */
export const CAJA_HEX: Record<string, string> = {
  CANCELADO: '#16a34a',
  ABONADO: '#d97706',
  CREDITO_APROBADO: '#2563eb',
  PENDIENTE: '#dc2626',
};

/** Cromo: tinta, ejes y rejilla. Escala "aluminio" de tailwind.config.js. */
export const TINTA = {
  primaria: '#111620',   // slate-900
  secundaria: '#2f3746', // slate-700
  eje: '#555f71',        // slate-500 — rótulos de eje
  rejilla: '#eef0f4',    // slate-100 — línea fina y sólida, un tono sobre la superficie
  base: '#c7cdd7',       // slate-300 — línea base
  apagado: '#c7cdd7',    // series de contexto en una gráfica de énfasis
  pista: '#eef0f4',      // fondo de barras de progreso y medidores
  superficie: '#ffffff',
} as const;

/** Color fijo por entidad: la misma clave siempre recibe el mismo tono, sin importar el orden
 *  ni cuántas entidades haya en pantalla. Pensado para asesores (clave = id o nombre). */
export const colorPorEntidad = (clave: string | number): string => {
  const s = String(clave);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return CATEGORICA[h % CATEGORICA.length];
};

/** Tono ordinal para la etapa `i` de `n` (embudos): reparte la rampa de oscuro a claro, de modo
 *  que la etapa de entrada (la más grande) sea la más oscura. */
export const tonoEtapa = (i: number, n: number): string => {
  if (n <= 1) return ORDINAL_AZUL[2];
  const idx = Math.round(((n - 1 - i) / (n - 1)) * (ORDINAL_AZUL.length - 1));
  return ORDINAL_AZUL[idx];
};
