/**
 * Fechas en hora de Bogotá — fuente única del backend.
 *
 * El backend de producción corre en Render, cuyo reloj está en UTC; el PC de desarrollo
 * corre en hora de Bogotá. Todo cálculo que dependa de la zona del proceso
 * (`new Date(y, m, d)`, `setHours`, `toISOString().split('T')[0]`, `CURRENT_DATE`)
 * se comporta distinto en cada máquina y, en producción, cambia de día a las 7 p.m.
 * Por eso aquí nada usa la zona del proceso: Colombia es UTC-5 fijo todo el año
 * (no tiene horario de verano), así que el desfase se escribe explícito.
 *
 * Hay dos tipos de fecha en el ERP, y cada uno tiene su regla:
 *
 * 1. DÍA DE CALENDARIO (sin hora): `odp.fecha_entrega`, toda columna `DATEONLY`
 *    (`fecha_factura`, `fecha_vencimiento_credito`, fechas del Pedido PV,
 *    `ruta_odp.fecha_programada`, …). Se representan como `'YYYY-MM-DD'` y se comparan
 *    contra `hoyBogotaISO()`. `odp.fecha_entrega` es TIMESTAMPTZ por herencia, pero
 *    todas sus filas están a las 00:00 UTC: comparada contra un `'YYYY-MM-DD'`, Postgres
 *    (sesión en UTC) la trata como el día que digitó el usuario.
 *
 * 2. MOMENTO CON HORA: `fecha_creacion`, historial, pagos, `fecha_listo_instalar`…
 *    Su "día" es el de Bogotá: los cortes de día y de mes se hacen con
 *    `inicioDiaBogota` / `finDiaBogota` / `rangoMesesBogota`, o en SQL con
 *    `diaBogotaSQL(col)`.
 */

/** Desfase fijo de Colombia respecto a UTC. */
const OFFSET_BOGOTA = '-05:00';
const MS_OFFSET_BOGOTA = 5 * 60 * 60 * 1000;

/** Hoy en Bogotá, como `'YYYY-MM-DD'`. */
export function hoyBogotaISO(): string {
  return diaBogotaISO(new Date());
}

/** Día de Bogotá (`'YYYY-MM-DD'`) al que pertenece un instante. */
export function diaBogotaISO(instante: Date): string {
  return new Date(instante.getTime() - MS_OFFSET_BOGOTA).toISOString().slice(0, 10);
}

/**
 * Suma (o resta) días a un día de calendario `'YYYY-MM-DD'`. Aritmética pura en UTC
 * sobre la fecha, sin pasar por la zona del proceso.
 */
export function sumarDiasISO(fechaISO: string, dias: number): string {
  const d = new Date(`${fechaISO.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * `'YYYY-MM-DD'` de un valor de tipo DÍA DE CALENDARIO: un `DATEONLY` (string) o
 * `odp.fecha_entrega` (TIMESTAMPTZ guardado a las 00:00 UTC, llega como `Date`).
 * No convierte de zona: el día es el que digitó el usuario.
 */
export function diaCalendarioISO(valor: Date | string): string {
  return typeof valor === 'string' ? valor.slice(0, 10) : valor.toISOString().slice(0, 10);
}

/** Días de calendario de `desdeISO` a `hastaISO` (positivo si `hasta` es posterior). */
export function diferenciaDias(desdeISO: string, hastaISO: string): number {
  const desde = Date.parse(`${desdeISO.slice(0, 10)}T00:00:00Z`);
  const hasta = Date.parse(`${hastaISO.slice(0, 10)}T00:00:00Z`);
  return Math.round((hasta - desde) / 86400000);
}

/** Instante en que empieza un día de Bogotá (00:00 Bogotá = 05:00 UTC). */
export function inicioDiaBogota(fechaISO: string): Date {
  return new Date(`${fechaISO.slice(0, 10)}T00:00:00.000${OFFSET_BOGOTA}`);
}

/** Último milisegundo de un día de Bogotá (23:59:59.999 Bogotá). */
export function finDiaBogota(fechaISO: string): Date {
  return new Date(`${fechaISO.slice(0, 10)}T23:59:59.999${OFFSET_BOGOTA}`);
}

/**
 * Rango de instantes que cubre los días de Bogotá `desdeISO`..`hastaISO` completos.
 * Para filtrar columnas de tipo MOMENTO con lo que el usuario eligió en un selector de fechas.
 */
export function rangoDiasBogota(desdeISO: string, hastaISO: string): { inicio: Date; fin: Date } {
  return { inicio: inicioDiaBogota(desdeISO), fin: finDiaBogota(hastaISO) };
}

/** Meses de calendario entre dos días `'YYYY-MM-DD'` (solo año y mes; ignora el día). */
export function diferenciaMeses(desdeISO: string, hastaISO: string): number {
  const [a1, m1] = desdeISO.split('-').map(Number);
  const [a2, m2] = hastaISO.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}

/**
 * Suma (o resta) meses a un día `'YYYY-MM-DD'`. Si el día no existe en el mes destino,
 * desborda como `Date` (31-mar − 1 mes = 3-mar), igual que el `setUTCMonth` que reemplaza.
 */
export function sumarMesesISO(fechaISO: string, meses: number): string {
  const [a, m, d] = fechaISO.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1 + meses, d)).toISOString().slice(0, 10);
}

/** `'YYYY-MM-DD'` del primer día de un mes (mes 1-12). */
export function primerDiaMesISO(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, '0')}-01`;
}

/** `'YYYY-MM-DD'` del último día de un mes (mes 1-12). */
export function ultimoDiaMesISO(anio: number, mes: number): string {
  const d = new Date(Date.UTC(anio, mes, 0));
  return d.toISOString().slice(0, 10);
}

/** Año y mes (1-12) de hoy en Bogotá. */
export function mesActualBogota(): { anio: number; mes: number } {
  const [anio, mes] = hoyBogotaISO().split('-').map(Number);
  return { anio, mes };
}

/**
 * Rango de instantes [inicio, fin] que cubre de `mesInicio/anioInicio` a `mesFin/anioFin`
 * completos, en hora de Bogotá. Para filtrar columnas de tipo MOMENTO.
 */
export function rangoMesesBogota(anioInicio: number, mesInicio: number, anioFin: number, mesFin: number): { firstDay: Date; lastDay: Date } {
  return {
    firstDay: inicioDiaBogota(primerDiaMesISO(anioInicio, mesInicio)),
    lastDay: finDiaBogota(ultimoDiaMesISO(anioFin, mesFin)),
  };
}

/** Hoy en Bogotá, en SQL (tipo `date`). Reemplaza a `CURRENT_DATE`, que va en UTC. */
export const HOY_BOGOTA_SQL = `(now() AT TIME ZONE 'America/Bogota')::date`;

/** Día de Bogotá de una columna TIMESTAMPTZ de tipo MOMENTO, en SQL (tipo `date`). */
export const diaBogotaSQL = (columna: string): string => `(${columna} AT TIME ZONE 'America/Bogota')::date`;

/** Una columna TIMESTAMPTZ expresada en hora local de Bogotá (para `DATE_TRUNC`). */
export const horaBogotaSQL = (columna: string): string => `(${columna} AT TIME ZONE 'America/Bogota')`;
