import { TipoCargo } from './types';

/** Etiqueta legible de un tipo de cargo de obra, para vistas con espacio (cada
 * cargo en su propia fila): `ModalDetalleCotizacion`. */
export const ETIQUETA_CARGO: Record<TipoCargo, string> = {
    SMO: 'Mano de obra',
    ANDAMIO: 'Alquiler de andamio',
    HUACAL: 'Huacal / embalaje',
    FLETE: 'Acarreo / flete',
    OTRO: 'Otro servicio',
};

/** Misma etiqueta, versión corta: para `ComparadorPropuestas`, donde varios
 * cargos se listan uno tras otro en una sola celda ("Mano de obra $450.000 ·
 * Flete $200.000…") y la versión larga no cabe. */
export const ETIQUETA_CARGO_CORTA: Record<TipoCargo, string> = {
    SMO: 'Mano de obra',
    ANDAMIO: 'Andamio',
    HUACAL: 'Huacal',
    FLETE: 'Flete',
    OTRO: 'Otro',
};

export const fmtCOP = (v: number | null | undefined) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(v) || 0);

export const fmtFecha = (v?: string | null) =>
    v ? new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';

export const fmtPct = (fraccion: number | null | undefined) =>
    `${Math.round((Number(fraccion) || 0) * 100)}%`;

/**
 * Monto abreviado: "$1,8 M", "$450 K". Existe SOLO para el rango de una
 * cotización sin propuesta elegida en la pestaña Guardadas ("$1,1 M – $1,8 M ·
 * sin decidir"): dos importes completos en una celda de tabla no caben y, sobre
 * todo, un rango no es una cifra que nadie vaya a cobrar, así que el redondeo
 * no engaña a nadie. Para cualquier importe real se usa `fmtCOP`.
 */
export const fmtCOPCorto = (v: number | null | undefined) => {
    const n = Math.abs(Number(v) || 0);
    if (n >= 1_000_000) return `$${(n / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`;
    if (n >= 1_000) return `$${Math.round(n / 1_000).toLocaleString('es-CO')} K`;
    return fmtCOP(n);
};
