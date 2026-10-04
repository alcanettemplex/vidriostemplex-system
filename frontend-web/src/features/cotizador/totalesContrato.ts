// Contrato de totales del frontend, SIN React ni red (2026-10-03).
//
// Este archivo lo importa también una prueba del BACKEND
// (`pruebas_cotizador/totalesContrato.test.ts`), así que solo puede depender de
// `./types` (que no importa nada). No agregar imports de React, axios ni componentes.

import { CargoEntrada, LineaManoObra, OrigenCargo, TIPOS_MANO_OBRA } from './types';

/** Mismo redondeo que `round2` de `motorCalculo.ts` en el backend. */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

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
// Si allá cambia el orden de AIU/descuento/IVA, hay que cambiarlo aquí: lo vigila
// `backend-api/src/scripts/pruebas_cotizador/totalesContrato.test.ts`.
// La MANO DE OBRA no se calcula aquí: la devuelve el backend (`useManoObra`).
// ─────────────────────────────────────────────────────────────────────────────

// ─── Cargos de obra: estado del formulario ──────────────────────────────────

export interface LineaOtroCargo {
    /** Sólo para la key de React y para poder quitar la línea; no viaja nunca. */
    key: string;
    descripcion: string;
    valor: number;
    aplicaIva: boolean;
}

export interface EstadoCargos {
    andamio: { activo: boolean; dias: number; valorUnitario: number; aplicaIva: boolean };
    huacal: { activo: boolean; unidades: number; valorUnitario: number; aplicaIva: boolean };
    flete: { activo: boolean; valor: number; origen: OrigenCargo; aplicaIva: boolean };
    otros: LineaOtroCargo[];
}

/** El juego completo de cargos tal como lo espera `PUT .../cargos`. Una casilla
 * apagada no manda una fila en cero: no manda nada. */
export const cargosADTO = (e: EstadoCargos): CargoEntrada[] => {
    const filas: CargoEntrada[] = [];
    if (e.andamio.activo) {
        filas.push({
            tipo: 'ANDAMIO',
            descripcion: 'Alquiler de andamio',
            cantidad: Math.max(0, Number(e.andamio.dias) || 0),
            unidad: 'DIA',
            valorUnitario: Math.max(0, Number(e.andamio.valorUnitario) || 0),
            aplicaIva: e.andamio.aplicaIva,
            origen: 'MANUAL',
        });
    }
    if (e.huacal.activo) {
        filas.push({
            tipo: 'HUACAL',
            descripcion: 'Huacal / embalaje',
            cantidad: Math.max(0, Number(e.huacal.unidades) || 0),
            unidad: 'UND',
            valorUnitario: Math.max(0, Number(e.huacal.valorUnitario) || 0),
            aplicaIva: e.huacal.aplicaIva,
            origen: 'MANUAL',
        });
    }
    if (e.flete.activo) {
        filas.push({
            tipo: 'FLETE',
            descripcion: 'Acarreo / Flete',
            cantidad: 1,
            unidad: 'GLOBAL',
            valorUnitario: Math.max(0, Number(e.flete.valor) || 0),
            aplicaIva: e.flete.aplicaIva,
            origen: e.flete.origen,
        });
    }
    for (const o of e.otros) {
        // Una línea sin texto ni monto es una fila que el vendedor abrió y no
        // llenó: se descarta en vez de imprimirle al cliente un renglón vacío.
        if (!o.descripcion.trim() && !o.valor) continue;
        filas.push({
            tipo: 'OTRO',
            descripcion: o.descripcion.trim().slice(0, 200) || 'Servicio adicional',
            cantidad: 1,
            unidad: 'GLOBAL',
            valorUnitario: Math.max(0, Number(o.valor) || 0),
            aplicaIva: o.aplicaIva,
            origen: 'MANUAL',
        });
    }
    return filas;
};

/** Base de los cargos (sin IVA) y su IVA, sólo para el pie del panel. El número
 * que manda sigue siendo el que devuelve el backend en `propuesta.totales`. */
export const resumenCargos = (e: EstadoCargos, ivaPct: number) => {
    let base = 0;
    let iva = 0;
    for (const f of cargosADTO(e).filter((c) => !TIPOS_MANO_OBRA.has(c.tipo))) {
        const total = round2((f.cantidad ?? 1) * (f.valorUnitario ?? 0));
        base = round2(base + total);
        if (f.aplicaIva !== false) iva = round2(iva + round2(total * ivaPct));
    }
    return { base, iva, total: round2(base + iva) };
};

// ─── Total de la propuesta ──────────────────────────────────────────────────

export interface TotalesPrevistos {
    productos: number;
    manoObra: number;
    descuento: number;
    cargos: number;
    iva: number;
    total: number;
}

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
