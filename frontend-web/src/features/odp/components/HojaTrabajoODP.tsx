import React, { useEffect, useState } from 'react';
import { Loader2 } from '../../../components/ui/icons';

import PrintableHojaTrabajo from '../../cotizador/components/PrintableHojaTrabajo';
import { apiDespieceDeItem, apiGetModulos, apiPlanoDeItem } from '../../cotizador/services/cotizadorApi';
import { Cotizacion, DespieceItem, ModuloMeta, Plano } from '../../cotizador/types';
import { obtenerCotizacion } from './odpCotizador.api';

// ─────────────────────────────────────────────────────────────────────────────
// Formato "Hoja de trabajo" de la pestaña Imprimir de la ficha ODP (2026-09-27).
//
// Reutiliza TAL CUAL `PrintableHojaTrabajo` del Cotizador (no se duplica) con la
// cotización vinculada y su opción ELEGIDA, y carga planos y despieces por ítem
// igual que `ModalDetalleCotizacion`: por la propuesta activa, un pedido por
// ítem con diseño (sin diseño el backend responde 400 y la hoja imprime la
// ficha de fabricación y los materiales).
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    cotizacionId: number;
}

const HojaTrabajoODP: React.FC<Props> = ({ cotizacionId }) => {
    const [cot, setCot] = useState<Cotizacion | null>(null);
    const [modulos, setModulos] = useState<ModuloMeta[]>([]);
    const [planos, setPlanos] = useState<Record<number, Plano | null>>({});
    const [despieces, setDespieces] = useState<Record<number, DespieceItem | null>>({});
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
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
                    Promise.all(conDiseno.map(it => apiDespieceDeItem(c.id, it.id, pid).then(r => [it.id, r.data] as const).catch(() => [it.id, null] as const))),
                ]);
                if (!vigente) return;
                setPlanos(Object.fromEntries(ps));
                setDespieces(Object.fromEntries(ds));
            })
            .catch(() => { if (vigente) setError('No se pudo cargar la Hoja de trabajo de la cotización vinculada.'); })
            .finally(() => { if (vigente) setCargando(false); });
        return () => { vigente = false; };
    }, [cotizacionId]);

    if (cargando) {
        return <div className="py-16 flex items-center justify-center text-slate-800 text-sm"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Preparando la Hoja de trabajo…</div>;
    }
    if (error || !cot) return <p className="py-16 text-center text-sm text-rose-800">{error ?? 'Sin datos.'}</p>;
    const propuesta = (cot.propuestas ?? []).find(p => p.id === cot.propuestaActivaId) ?? null;
    return <PrintableHojaTrabajo cot={cot} propuesta={propuesta} modulos={modulos} planos={planos} despieces={despieces} />;
};

export default HojaTrabajoODP;
