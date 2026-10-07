import React, { useEffect, useState } from 'react';
import { Loader2 } from '../../../../components/ui/icons';
import { fmtMomento } from '../../../../utils/fechas';

import { apiContextoLead } from '../../services/cotizadorApi';
import { ContextoLead } from '../../vinculo';
import { BotonSecundario, Chip, CONTROL_LABEL_CLASS, FilaDato, ModalShell } from '../ui';

// ─────────────────────────────────────────────────────────────────────────────
// "Ver contexto" del lead vinculado (2026-10-07). Muestra la Descripción /
// Contexto que el asesor escribió en el CRM, para cotizar sin salir del
// Cotizador. Solo lectura: se edita desde el detalle del lead en CRM & Leads.
// Se pide al abrir el modal (no viaja en el buscador: el texto puede ser largo).
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    leadId: number;
    onClose: () => void;
}

const ModalContextoLead: React.FC<Props> = ({ leadId, onClose }) => {
    const [contexto, setContexto] = useState<ContextoLead | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let vigente = true;
        apiContextoLead(leadId)
            .then(r => { if (vigente) setContexto(r.data); })
            .catch(e => {
                if (vigente) setError(e?.response?.data?.error || 'No se pudo cargar el contexto del lead. Revisa tu conexión e inténtalo de nuevo.');
            });
        return () => { vigente = false; };
    }, [leadId]);

    useEffect(() => {
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', esc);
        return () => window.removeEventListener('keydown', esc);
    }, [onClose]);

    return (
        <ModalShell
            titulo={contexto?.nombre ?? 'Contexto del lead'}
            subtitulo="Descripción registrada en CRM & Leads"
            anchoMaximo="max-w-lg"
            onClose={onClose}
            pie={<BotonSecundario compacto onClick={onClose}>Cerrar</BotonSecundario>}
        >
            <div className="px-6 py-5 space-y-4">
                {!contexto && !error && (
                    <p className="flex items-center gap-2 text-[13px] text-slate-700">
                        <Loader2 className="w-4 h-4 animate-spin" /> Cargando el contexto del lead…
                    </p>
                )}
                {error && (
                    <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-800">{error}</p>
                )}
                {contexto && (
                    <>
                        <div>
                            <p className={CONTROL_LABEL_CLASS}>Descripción / Contexto</p>
                            {contexto.descripcion ? (
                                <p className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-[13px] leading-relaxed text-slate-900">
                                    {contexto.descripcion}
                                </p>
                            ) : (
                                <p className="rounded-xl border border-dashed border-slate-300 px-3.5 py-3 text-[13px] text-slate-700">
                                    Este lead no tiene descripción registrada. Se agrega desde su detalle en CRM &amp; Leads.
                                </p>
                            )}
                        </div>
                        <dl>
                            <FilaDato
                                etiqueta="Estado"
                                valor={contexto.estado && <Chip tono={contexto.estado === 'PERDIDO' ? 'rosa' : 'neutro'}>{contexto.estado.replace(/_/g, ' ').toLowerCase()}</Chip>}
                            />
                            <FilaDato etiqueta="Teléfono" valor={contexto.telefono} numerico />
                            <FilaDato etiqueta="¿Cómo llegó?" valor={contexto.fuente} />
                            <FilaDato etiqueta="Asesor" valor={contexto.asesor ?? 'Bolsa común'} />
                            <FilaDato etiqueta="Creado" valor={fmtMomento(contexto.creado)} />
                        </dl>
                    </>
                )}
            </div>
        </ModalShell>
    );
};

export default ModalContextoLead;
