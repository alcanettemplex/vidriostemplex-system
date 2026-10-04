import { useEffect, useState } from 'react';

import { apiDespieceDeItem, apiGetModulos, apiPlanoDeItem } from '../../cotizador/services/cotizadorApi';
import { Cotizacion, DespieceItem, ModuloMeta, Plano, Propuesta } from '../../cotizador/types';
import { obtenerCotizacion } from './odpCotizador.api';

// ─────────────────────────────────────────────────────────────────────────────
// Carga técnica de la cotización vinculada a una ODP (2026-10-03), compartida
// por la Hoja de trabajo (`HojaTrabajoODP`) y las hojas de planos del Det.
// Técnico (`PlanosCotizacionODP`). Antes vivía dentro de HojaTrabajoODP.
//
// Trae la cotización con su opción ELEGIDA (la activa por defecto), los módulos
// (para rotular) y, por cada ítem con diseño, su plano y —si se pide— su
// despiece. Un pedido por ítem: sin diseño no hay plano (el backend responde 400).
// Solo lee; ningún pedido escribe.
// ─────────────────────────────────────────────────────────────────────────────

export interface CotizacionTecnica {
    cot: Cotizacion | null;
    propuesta: Propuesta | null;
    modulos: ModuloMeta[];
    planos: Record<number, Plano | null>;
    despieces: Record<number, DespieceItem | null>;
    cargando: boolean;
    error: string | null;
}

export function useCotizacionTecnica(
    cotizacionId: number | null,
    { conDespieces, error: mensajeError }: { conDespieces: boolean; error: string },
): CotizacionTecnica {
    const [cot, setCot] = useState<Cotizacion | null>(null);
    const [modulos, setModulos] = useState<ModuloMeta[]>([]);
    const [planos, setPlanos] = useState<Record<number, Plano | null>>({});
    const [despieces, setDespieces] = useState<Record<number, DespieceItem | null>>({});
    const [cargando, setCargando] = useState(cotizacionId !== null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (cotizacionId === null) {
            setCot(null);
            setCargando(false);
            return;
        }
        let vigente = true;
        setCargando(true);
        setError(null);
        setPlanos({});
        setDespieces({});
        Promise.all([obtenerCotizacion(cotizacionId), apiGetModulos().catch(() => ({ data: [] as ModuloMeta[] }))])
            .then(async ([rc, rm]) => {
                if (!vigente) return;
                const c = rc.data;
                setCot(c);
                setModulos(rm.data);
                const pid = c.propuestaActivaId ?? null;
                const conDiseno = c.items.filter(it => it.disenoId);
                const [ps, ds] = await Promise.all([
                    Promise.all(conDiseno.map(it => apiPlanoDeItem(c.id, it.id, pid).then(r => [it.id, r.data] as const).catch(() => [it.id, null] as const))),
                    conDespieces
                        ? Promise.all(conDiseno.map(it => apiDespieceDeItem(c.id, it.id, pid).then(r => [it.id, r.data] as const).catch(() => [it.id, null] as const)))
                        : Promise.resolve([] as Array<readonly [number, DespieceItem | null]>),
                ]);
                if (!vigente) return;
                setPlanos(Object.fromEntries(ps));
                setDespieces(Object.fromEntries(ds));
            })
            .catch(() => { if (vigente) setError(mensajeError); })
            .finally(() => { if (vigente) setCargando(false); });
        return () => { vigente = false; };
    }, [cotizacionId, conDespieces, mensajeError]);

    const propuesta = cot ? (cot.propuestas ?? []).find(p => p.id === cot.propuestaActivaId) ?? null : null;
    return { cot, propuesta, modulos, planos, despieces, cargando, error };
}
