import React from 'react';
import { Loader2 } from '../../../components/ui/icons';

import PrintableHojaTrabajo from '../../cotizador/components/PrintableHojaTrabajo';
import { useCotizacionTecnica } from './useCotizacionTecnica';

// ─────────────────────────────────────────────────────────────────────────────
// Formato "Hoja de trabajo" de la pestaña Imprimir de la ficha ODP (2026-09-27).
//
// Reutiliza TAL CUAL `PrintableHojaTrabajo` del Cotizador (no se duplica) con la
// cotización vinculada y su opción ELEGIDA. La carga de planos y despieces vive
// en `useCotizacionTecnica` (2026-10-03), compartida con las hojas de planos del
// Det. Técnico: un pedido por ítem con diseño (sin diseño el backend responde
// 400 y la hoja imprime la ficha de fabricación y los materiales).
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    cotizacionId: number;
}

const OPCIONES = { conDespieces: true, error: 'No se pudo cargar la Hoja de trabajo de la cotización vinculada.' };

const HojaTrabajoODP: React.FC<Props> = ({ cotizacionId }) => {
    const { cot, propuesta, modulos, planos, despieces, cargando, error } = useCotizacionTecnica(cotizacionId, OPCIONES);

    if (cargando) {
        return <div className="py-16 flex items-center justify-center text-slate-800 text-sm"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Preparando la Hoja de trabajo…</div>;
    }
    if (error || !cot) return <p className="py-16 text-center text-sm text-rose-800">{error ?? 'Sin datos.'}</p>;
    return <PrintableHojaTrabajo cot={cot} propuesta={propuesta} modulos={modulos} planos={planos} despieces={despieces} />;
};

export default HojaTrabajoODP;
