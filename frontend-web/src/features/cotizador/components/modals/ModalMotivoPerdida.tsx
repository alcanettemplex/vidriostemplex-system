import React, { useEffect, useState } from 'react';
import { XCircle } from '../../../../components/ui/icons';

import { MotivoPerdida } from '../../types';
import { numeroCotizacion } from '../../format';
import { MOTIVOS_PERDIDA } from '../../vinculo';
import { BotonPeligro, BotonSecundario, CONTROL_LABEL_CLASS, ModalShell } from '../ui';

// ─────────────────────────────────────────────────────────────────────────────
// "¿Por qué se perdió?" (2026-09-27). Marcar una cotización como Perdida exige
// el motivo (lo impone el backend): alimenta la estadística comercial. Si la
// cotización es de un lead que sigue vivo en el CRM, se pregunta además si el
// lead también se perdió — no se asume: el cliente puede seguir interesado en
// otra cosa.
// ─────────────────────────────────────────────────────────────────────────────

export interface CierrePerdida {
    motivo: MotivoPerdida;
    detalle: string | null;
    marcarLead: boolean;
}

interface Props {
    numero: number | null;
    /** Nombre del lead si la cotización es de un lead que todavía se puede perder. */
    leadNombre: string | null;
    onCancelar: () => void;
    onConfirmar: (c: CierrePerdida) => void;
}

const ModalMotivoPerdida: React.FC<Props> = ({ numero, leadNombre, onCancelar, onConfirmar }) => {
    const [motivo, setMotivo] = useState<MotivoPerdida | null>(null);
    const [detalle, setDetalle] = useState('');
    const [marcarLead, setMarcarLead] = useState(false);

    useEffect(() => {
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancelar(); };
        window.addEventListener('keydown', esc);
        return () => window.removeEventListener('keydown', esc);
    }, [onCancelar]);

    const faltaDetalle = motivo === 'OTRO' && !detalle.trim();

    return (
        <ModalShell
            titulo="¿Por qué se perdió?"
            subtitulo={numero ? `Cotización ${numeroCotizacion(numero)}` : undefined}
            anchoMaximo="max-w-lg"
            onClose={onCancelar}
            pie={
                <>
                    <BotonSecundario compacto onClick={onCancelar}>Cancelar</BotonSecundario>
                    <BotonPeligro
                        compacto
                        icono={XCircle}
                        disabled={!motivo || faltaDetalle}
                        onClick={() => motivo && onConfirmar({ motivo, detalle: detalle.trim() || null, marcarLead })}
                    >
                        Marcar como perdida
                    </BotonPeligro>
                </>
            }
        >
            <div className="px-6 py-5 space-y-4">
                <fieldset>
                    <legend className={CONTROL_LABEL_CLASS}>Motivo <span className="text-rose-500">*</span></legend>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {MOTIVOS_PERDIDA.map(m => (
                            <label
                                key={m.valor}
                                className={`flex items-start gap-2 rounded-xl border px-3 py-2 cursor-pointer transition ${motivo === m.valor
                                    ? 'border-rose-300 bg-rose-50 ring-1 ring-rose-200'
                                    : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                            >
                                <input
                                    type="radio"
                                    name="motivo-perdida"
                                    className="mt-1"
                                    checked={motivo === m.valor}
                                    onChange={() => setMotivo(m.valor)}
                                />
                                <span>
                                    <span className="block text-[13px] font-semibold text-slate-900">{m.rotulo}</span>
                                    <span className="block text-[12px] text-slate-700 leading-snug">{m.detalle}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                </fieldset>
                <div>
                    <label className={CONTROL_LABEL_CLASS} htmlFor="motivo-perdida-detalle">
                        Detalle{motivo === 'OTRO' ? <span className="text-rose-500"> *</span> : ' (opcional)'}
                    </label>
                    <textarea
                        id="motivo-perdida-detalle"
                        value={detalle}
                        maxLength={500}
                        rows={2}
                        onChange={e => setDetalle(e.target.value)}
                        placeholder="Ej.: la competencia le ofreció 15 % menos"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-templex-500 focus:ring-2 focus:ring-templex-200"
                    />
                </div>
                {leadNombre && (
                    <label className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 cursor-pointer">
                        <input type="checkbox" className="mt-1" checked={marcarLead} onChange={e => setMarcarLead(e.target.checked)} />
                        <span className="text-[13px] text-slate-900">
                            <span className="font-semibold">¿Marcar también el lead como perdido?</span>
                            <span className="block text-[12px] text-slate-800">
                                "{leadNombre}" pasa a Perdido en el CRM con este motivo. Déjalo sin marcar si todavía puede
                                comprarte otra cosa.
                            </span>
                        </span>
                    </label>
                )}
            </div>
        </ModalShell>
    );
};

export default ModalMotivoPerdida;
