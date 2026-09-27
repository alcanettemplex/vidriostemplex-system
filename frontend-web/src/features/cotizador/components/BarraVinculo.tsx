import React, { useState } from 'react';
import { Link2, Loader2 } from '../../../components/ui/icons';

import { FichaVinculo } from '../vinculo';
import BuscadorVinculo, { ChipVinculo } from './BuscadorVinculo';

// ─────────────────────────────────────────────────────────────────────────────
// "¿Para quién es esta cotización?" arriba de Cotizar (2026-09-27). Reemplaza
// al campo de texto libre: ahora es un BUSCADOR de lead / prospecto / cliente /
// ODP, porque no existen cotizaciones sin vínculo. Mientras no se elija, no se
// puede agregar el primer producto. El asesor no se elige (2026-09-27): nadie
// cotiza a nombre de otro, la cotización es de quien la crea.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    vinculo: FichaVinculo | null;
    cargandoVinculo: boolean;
    /** null = no se puede cambiar (sin permiso, o ya tiene ODP). */
    onElegir: ((f: FichaVinculo) => void) | null;
    /** Asesor al que queda asignado un lead rápido: quien crea la cotización. */
    asesorIdLeadRapido?: number | null;
    esNueva: boolean;
}

const BarraVinculo: React.FC<Props> = ({ vinculo, cargandoVinculo, onElegir, asesorIdLeadRapido = null, esNueva }) => {
    const [cambiando, setCambiando] = useState(false);
    const mostrarBuscador = Boolean(onElegir) && (!vinculo || cambiando);

    return (
        <div className="px-4 pt-4">
            <div className={`rounded-xl border px-3.5 py-2.5 space-y-2 ${vinculo ? 'border-templex-100 bg-templex-50' : 'border-amber-200 bg-amber-50'}`}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <label htmlFor="cotizador-vinculo" className="text-[13px] font-bold text-slate-900 flex items-center gap-1.5">
                        <Link2 className="w-4 h-4 text-templex-600" /> ¿Para quién es esta cotización?
                    </label>
                    {cargandoVinculo && <Loader2 className="w-4 h-4 animate-spin text-slate-600" />}
                    {vinculo && !cambiando && (
                        <div className="flex flex-1 min-w-[240px] items-center gap-2 rounded-lg border border-templex-200 bg-white px-2.5 py-1.5">
                            <ChipVinculo ficha={vinculo} className="flex-1" />
                            {onElegir && (
                                <button type="button" onClick={() => setCambiando(true)} className="text-[12px] font-semibold text-templex-700 hover:underline shrink-0">
                                    Cambiar
                                </button>
                            )}
                        </div>
                    )}
                    {mostrarBuscador && (
                        <BuscadorVinculo
                            id="cotizador-vinculo"
                            autoFocus={cambiando}
                            permitirLeadRapido
                            asesorIdLeadRapido={asesorIdLeadRapido}
                            onElegir={(f) => { setCambiando(false); onElegir?.(f); }}
                        />
                    )}
                    {cambiando && (
                        <button type="button" onClick={() => setCambiando(false)} className="text-[12px] font-semibold text-slate-700 hover:underline">
                            Cancelar
                        </button>
                    )}
                    {!vinculo && !onElegir && !cargandoVinculo && (
                        <span className="text-[12.5px] text-slate-800">Sin vínculo (cotización anterior a la integración con el ERP).</span>
                    )}
                </div>
                {!vinculo && esNueva && (
                    <p className="text-[12px] text-slate-800">
                        Busca el lead, prospecto, cliente u ODP. Si la persona solo está preguntando el precio, usa
                        <span className="font-semibold"> + Crear lead rápido</span>. El nombre y el teléfono se precargan y se
                        pueden editar en Resumen.
                    </p>
                )}
            </div>
        </div>
    );
};

export default BarraVinculo;
