export const fmtCOP = (v: number | null | undefined) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(v) || 0);

export const fmtFecha = (v?: string | null) =>
    v ? new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';

export const fmtPct = (fraccion: number | null | undefined) =>
    `${Math.round((Number(fraccion) || 0) * 100)}%`;
