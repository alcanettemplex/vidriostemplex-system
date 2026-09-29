import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calculator, ExternalLink, Loader2 } from '../../../components/ui/icons';

import { fmtCOP, numeroCotizacion } from '../format';
import { usePermisosCotizador } from '../permisos';
import { apiCotizacionesDe } from '../services/cotizadorApi';
import { CotizacionLigera } from '../types';
import { enlaceCotizador, TipoVinculo } from '../vinculo';

// ─────────────────────────────────────────────────────────────────────────────
// Entrada al Cotizador desde otro módulo (2026-09-27): las cotizaciones de un
// lead o de un prospecto y el botón "Nueva cotización", que abre el Cotizador
// con el vínculo ya elegido (`/cotizador?nuevo=1&vinculo=<tipo>:<id>`). Lo usan
// el detalle del lead (CRM) y el modal del prospecto. Solo lee: crear la
// cotización pasa en el Cotizador.
// ─────────────────────────────────────────────────────────────────────────────

const ESTADO: Record<string, { rotulo: string; clase: string }> = {
    PENDIENTE: { rotulo: 'Pendiente', clase: 'bg-amber-50 text-amber-800' },
    APROBADA: { rotulo: 'Aprobada', clase: 'bg-emerald-50 text-emerald-800' },
    PERDIDO: { rotulo: 'Perdida', clase: 'bg-rose-50 text-rose-800' },
    CANCELADO: { rotulo: 'Cancelada', clase: 'bg-slate-100 text-slate-800' },
};

interface Props {
    tipo: TipoVinculo;
    id: number;
    /** Estilo compacto para los modales del CRM y Prospectos. */
    titulo?: string;
}

const CotizacionesDeRegistro: React.FC<Props> = ({ tipo, id, titulo = 'Cotizaciones' }) => {
    const navigate = useNavigate();
    const permisos = usePermisosCotizador();
    const [lista, setLista] = useState<CotizacionLigera[] | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let vigente = true;
        apiCotizacionesDe(tipo, id)
            .then(r => { if (vigente) setLista(r.data); })
            .catch(() => { if (vigente) setError(true); });
        return () => { vigente = false; };
    }, [tipo, id]);

    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <Calculator className="w-3.5 h-3.5 text-templex-600" /> {titulo}
                </h3>
                {permisos.puedeCrear && (
                    <button
                        type="button"
                        onClick={() => navigate(enlaceCotizador({ nuevo: { tipo, id } }))}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-templex-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-templex-700"
                    >
                        <Calculator className="w-3.5 h-3.5" /> Nueva cotización
                    </button>
                )}
            </div>
            {!lista && !error && <p className="flex items-center gap-2 text-[12px] text-slate-700"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando…</p>}
            {error && <p className="text-[12px] text-rose-700">No se pudieron cargar las cotizaciones.</p>}
            {lista && lista.length === 0 && <p className="text-[12px] text-slate-700">Todavía no tiene cotizaciones en el Cotizador.</p>}
            {lista && lista.length > 0 && (
                <ul className="divide-y divide-slate-100">
                    {lista.map(c => {
                        const e = ESTADO[c.estado] ?? { rotulo: c.estado, clase: 'bg-slate-100 text-slate-800' };
                        return (
                            <li key={c.id}>
                                <button
                                    type="button"
                                    onClick={() => navigate(enlaceCotizador({ abrir: c.id }))}
                                    className="w-full flex items-center gap-2 py-2 text-left hover:bg-slate-50 rounded-lg px-1"
                                >
                                    <span className="text-[12.5px] font-bold text-slate-900 tabular-nums">{numeroCotizacion(c.numero)}</span>
                                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${e.clase}`}>{e.rotulo}</span>
                                    <span className="flex-1 text-[12px] text-slate-700 truncate">{c.asesor}</span>
                                    <span className="text-[12.5px] font-bold text-slate-900 tabular-nums">{fmtCOP(c.totales?.total ?? 0)}</span>
                                    <ExternalLink className="w-3.5 h-3.5 text-slate-600" />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

export default CotizacionesDeRegistro;
