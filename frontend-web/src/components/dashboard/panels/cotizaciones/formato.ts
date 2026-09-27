// Formato de cifras y fechas del tablero de cotizaciones.

const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

/** $1.234.567 — montos completos (tablas, tooltips). */
export const fmtCOP = (n: number): string => cop.format(Math.round(n || 0));

/** $1,2M / $850K — montos compactos (tarjetas, ejes). */
export const fmtCompacto = (n: number): string => {
  const v = Math.abs(n || 0);
  const signo = n < 0 ? '-' : '';
  if (v >= 1_000_000_000) return `${signo}$${(v / 1_000_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })}MM`;
  if (v >= 1_000_000) return `${signo}$${(v / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })}M`;
  if (v >= 1_000) return `${signo}$${Math.round(v / 1_000).toLocaleString('es-CO')}K`;
  return `${signo}$${Math.round(v).toLocaleString('es-CO')}`;
};

export const fmtPct = (n: number): string => `${(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 1 })}%`;

export const fmtEntero = (n: number): string => (n || 0).toLocaleString('es-CO');

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** '2026-09' → 'sep 26' */
export const fmtMes = (ym: string): string => {
  const [a, m] = ym.split('-').map(Number);
  return `${MESES[(m || 1) - 1]} ${String(a).slice(2)}`;
};

/** '2026-09-27' → '27 sep 2026' */
export const fmtFecha = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MESES[(m || 1) - 1]} ${a}`;
};

/** Lista de meses 'YYYY-MM' entre dos fechas ISO, ambos incluidos (máx. 36). */
export const mesesEntre = (desde: string, hasta: string): string[] => {
  const out: string[] = [];
  let [a, m] = desde.split('-').map(Number);
  const [af, mf] = hasta.split('-').map(Number);
  while ((a < af || (a === af && m <= mf)) && out.length < 36) {
    out.push(`${a}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; a += 1; }
  }
  return out;
};

/** Fecha de hoy en Bogotá, 'YYYY-MM-DD'. */
export const hoyISO = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
