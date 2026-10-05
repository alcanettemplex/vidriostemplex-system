/**
 * Fechas en hora de Bogotá — fuente única del frontend (espejo de
 * `backend-api/src/utils/fechas.ts`).
 *
 * Hay dos tipos de fecha en el ERP y cada uno se maneja de una sola forma:
 *
 * 1. DÍA DE CALENDARIO (sin hora): `odp.fecha_entrega` ("listo material"), `fecha_factura`,
 *    `fecha_vencimiento_credito`, fechas del Pedido PV, `fecha_programada` de ruta,
 *    agenda, visita de toma de medidas… Llegan como `'YYYY-MM-DD'` o, `fecha_entrega`,
 *    como `'YYYY-MM-DDT00:00:00.000Z'`. NUNCA pasarlas por `new Date(v)`: eso las lee
 *    como medianoche UTC, que en Bogotá (UTC-5) son las 7 p.m. del día ANTERIOR, y la
 *    pantalla muestra un día menos. Usar `fmtDia`, `diaCalendario`, `diasHasta`.
 *
 * 2. MOMENTO CON HORA: `fecha_creacion`, historial, pagos… Se muestran en hora de Bogotá
 *    con `fmtMomento`.
 *
 * "Hoy" es siempre el de Bogotá (`hoyBogotaISO`), nunca `toISOString().split('T')[0]`,
 * que después de las 7 p.m. devuelve la fecha de mañana.
 */

const ZONA = 'America/Bogota';
const formatoISO = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA });

type Valor = string | Date | null | undefined;

/** Hoy en Bogotá, como `'YYYY-MM-DD'`. */
export const hoyBogotaISO = (): string => formatoISO.format(new Date());

/** Día de Bogotá (`'YYYY-MM-DD'`) al que pertenece un momento. */
export const diaBogotaISO = (instante: Date | string): string => formatoISO.format(new Date(instante));

/** `'YYYY-MM-DD'` de un día de calendario, sin convertir de zona. `null` si no es válido. */
export const diaISO = (v: Valor): string | null => {
    if (!v) return null;
    const s = typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

/**
 * Día de calendario como `Date` a medianoche LOCAL (para `toLocaleDateString`, `format`
 * de date-fns, `getMonth()`…). Toma los 10 primeros caracteres: no convierte de zona.
 */
export const diaCalendario = (v: Valor): Date | null => {
    const iso = diaISO(v);
    if (!iso) return null;
    const [a, m, d] = iso.split('-').map(Number);
    return new Date(a, m - 1, d);
};

/** Formatea un día de calendario. Sin opciones: `dd/mm/aaaa` de es-CO. */
export const fmtDia = (v: Valor, opciones?: Intl.DateTimeFormatOptions, vacio = ''): string => {
    const d = diaCalendario(v);
    return d ? d.toLocaleDateString('es-CO', opciones) : vacio;
};

/** Día de calendario como `dd/MM/yyyy` (formato de los imprimibles). */
export const fmtDiaNumerico = (v: Valor, vacio = ''): string => {
    const iso = diaISO(v);
    if (!iso) return vacio;
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
};

/** Formatea un momento (fecha con hora) en hora de Bogotá. */
export const fmtMomento = (v: Valor, opciones?: Intl.DateTimeFormatOptions, vacio = ''): string => {
    if (!v) return vacio;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? vacio : d.toLocaleDateString('es-CO', { ...opciones, timeZone: ZONA });
};

/**
 * ¿Es un día de calendario? `'YYYY-MM-DD'` o un instante exactamente a medianoche UTC
 * (así se guarda `odp.fecha_entrega`, y así quedaron las `fecha_creacion` de ODPs que el
 * CRM creó solo con el día). Un momento real cae a medianoche UTC al milisegundo casi nunca.
 */
const esDiaCalendario = (v: string | Date): boolean => {
    if (typeof v === 'string') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return true;
        if (!/^\d{4}-\d{2}-\d{2}T00:00:00(\.0+)?(Z|\+00:00|\+00)$/.test(v)) return false;
    }
    const d = new Date(v);
    return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
};

/**
 * Formatea una fecha sin saber de antemano su tipo: un día de calendario se muestra tal
 * cual, un momento en hora de Bogotá. Para pantallas que reciben columnas de los dos tipos
 * por el mismo formateador; si el tipo se conoce, preferir `fmtDia` / `fmtMomento`.
 */
export const fmtFecha = (v: Valor, opciones?: Intl.DateTimeFormatOptions, vacio = ''): string => {
    if (!v) return vacio;
    return esDiaCalendario(v) ? fmtDia(v, opciones, vacio) : fmtMomento(v, opciones, vacio);
};

/** `fmtFecha` como `dd/mm/aaaa` (imprimibles). */
export const fmtFechaNumerica = (v: Valor, vacio = ''): string =>
    fmtFecha(v, { day: '2-digit', month: '2-digit', year: 'numeric' }, vacio);

/** Suma (o resta) días a un `'YYYY-MM-DD'`. */
export const sumarDiasISO = (iso: string, dias: number): string => {
    const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
};

/** Días de calendario de `desde` a `hasta` (positivo si `hasta` es posterior). */
export const diferenciaDias = (desdeISO: string, hastaISO: string): number =>
    Math.round((Date.parse(`${hastaISO.slice(0, 10)}T00:00:00Z`) - Date.parse(`${desdeISO.slice(0, 10)}T00:00:00Z`)) / 86400000);

/**
 * Días de calendario que faltan para un día (0 = hoy, negativo = ya pasó), contados
 * en Bogotá. `null` si no hay fecha.
 */
export const diasHasta = (v: Valor): number | null => {
    const iso = diaISO(v);
    return iso ? diferenciaDias(hoyBogotaISO(), iso) : null;
};

/**
 * `Date` local → `'YYYY-MM-DD'` con sus campos locales. Para fechas que el navegador ya
 * armó en hora local (lunes de la semana, primer día del mes…); `toISOString()`
 * convertiría a UTC y correría el día.
 */
export const isoLocal = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
