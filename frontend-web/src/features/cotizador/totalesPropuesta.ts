import { useEffect, useMemo, useState } from 'react';

import { apiManoObra } from './services/cotizadorApi';
import { LineaManoObra } from './types';
import { EstadoCargos, resumenCargos } from './components/PanelCargosObra';

// ─────────────────────────────────────────────────────────────────────────────
// Previsualización del total de una propuesta, en vivo (2026-09-26).
//
// Réplica deliberada de `calcularTotalesPropuesta()` de
// `backend-api/src/cotizador/lib/cargos.ts`. Es el único sitio del frontend que
// hace esta cuenta (antes vivía copiada dentro de `TabActual`), y la usan la
// barra superior, el paso 3 de Cotizar y la pestaña Actual. Mientras hay cambios
// sin guardar no existe en el servidor ninguna propuesta a la que pedirle el
// número; en cuanto se guarda, lo que manda es `propuesta.totales`.
//
//   productos  = Σ subtotalConAiu                       (ya trae AIU)
//   manoObra   = Σ round2(cantidad × valorUnitario)     (valorUnitario ya trae AIU)
//   descuento  = round2((productos + manoObra) × pct)
//   base       = productos + manoObra − descuento
//   ivaBase    = round2(base × iva)
//   cargos     = flete, andamio, huacal, otros — sin AIU ni descuento, IVA por línea
//   total      = base + ivaBase + cargos + ivaCargos
//
// Si allá cambia el orden de AIU/descuento/IVA, hay que cambiarlo aquí.
// La MANO DE OBRA no se calcula aquí: la devuelve el backend (`useManoObra`).
// ─────────────────────────────────────────────────────────────────────────────

/** El producto calculado en Cotizar que todavía no se agregó a la propuesta.
 * Entra en el total en vivo del paso 3 para que el vendedor vea cuánto quedaría. */
export interface BorradorCotizar {
    moduloId: string;
    input: Record<string, unknown>;
    subtotalConAiu: number;
    iva: number;
    total: number;
    /** Si se está editando un ítem del carrito, su idTemp: lo reemplaza, no se suma. */
    reemplazaIdTemp: string | null;
}

export interface TotalesPrevistos {
    productos: number;
    manoObra: number;
    descuento: number;
    cargos: number;
    iva: number;
    total: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function totalLineaManoObra(l: Pick<LineaManoObra, 'cantidad' | 'valorUnitario'>): number {
    return round2(num(l.cantidad) * num(l.valorUnitario));
}

export function calcularTotalesPrevistos({
    items,
    manoObra,
    cargos,
    descuentoPct,
    ivaPct,
    legado = false,
}: {
    /** Solo los tres números que importan de cada ítem. */
    items: Array<{ subtotalConAiu?: number; iva?: number; total?: number }>;
    manoObra: LineaManoObra[];
    cargos: EstadoCargos;
    descuentoPct: number;
    ivaPct: number;
    /** Propuesta anterior al 2026-09-20: sus cargos están dentro de los ítems,
     * así que es la suma pura de los ítems, sin descuento ni cargos. */
    legado?: boolean;
}): TotalesPrevistos {
    const productos = round2(items.reduce((acc, it) => acc + num(it.subtotalConAiu), 0));
    if (legado) {
        return {
            productos,
            manoObra: 0,
            descuento: 0,
            cargos: 0,
            iva: round2(items.reduce((acc, it) => acc + num(it.iva), 0)),
            total: round2(items.reduce((acc, it) => acc + num(it.total), 0)),
        };
    }
    const mo = round2(manoObra.reduce((acc, l) => acc + totalLineaManoObra(l), 0));
    const baseAntesDescuento = round2(productos + mo);
    const descuento = round2(baseAntesDescuento * (num(descuentoPct) || 0));
    const base = round2(baseAntesDescuento - descuento);
    const ivaBase = round2(base * ivaPct);
    const c = resumenCargos(cargos, ivaPct);
    return {
        productos,
        manoObra: mo,
        descuento,
        cargos: c.base,
        iva: round2(ivaBase + c.iva),
        total: round2(base + ivaBase + c.base + c.iva),
    };
}

/**
 * Líneas de mano de obra de un juego de ítems, pedidas al backend (el único
 * sitio donde vive la regla). Se vuelve a pedir solo cuando cambia el módulo o
 * el formulario de algún ítem, con una espera corta para no disparar una
 * petición por tecla. Si la petición falla se conservan las últimas líneas: el
 * total que se ve es una previsualización, y al guardar lo recalcula el backend.
 */
export function useManoObra(items: Array<{ moduloId: string; input: Record<string, unknown> }>): {
    lineas: LineaManoObra[];
    cargando: boolean;
} {
    const clave = useMemo(() => JSON.stringify(items.map((it) => [it.moduloId, it.input])), [items]);
    const [lineas, setLineas] = useState<LineaManoObra[]>([]);
    const [cargando, setCargando] = useState(false);

    useEffect(() => {
        const pedido: Array<[string, Record<string, unknown>]> = JSON.parse(clave);
        if (pedido.length === 0) {
            setLineas([]);
            return;
        }
        let vivo = true;
        setCargando(true);
        const espera = window.setTimeout(() => {
            apiManoObra(pedido.map(([moduloId, input]) => ({ moduloId, input: input ?? {} })))
                .then(({ data }) => { if (vivo) setLineas(Array.isArray(data?.lineas) ? data.lineas : []); })
                .catch(() => { /* se conservan las últimas líneas: ver comentario de la función */ })
                .finally(() => { if (vivo) setCargando(false); });
        }, 300);
        return () => { vivo = false; window.clearTimeout(espera); };
    }, [clave]);

    return { lineas, cargando };
}
