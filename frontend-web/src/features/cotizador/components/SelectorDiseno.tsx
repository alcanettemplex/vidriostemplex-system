import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';

import { apiGetDisenos } from '../services/cotizadorApi';
import { DisenoResumen } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Selector opcional de diseño de catálogo. Solo lo usa el módulo "ventanas": si
// se elige un diseño, el backend cotiza "por diseño" (despiece real); si se deja
// en blanco, cae a "medidas libres" (ver backend-api/src/cotizador/modules/
// ventanas.ts, manejo de `input.disenoId`).
// ─────────────────────────────────────────────────────────────────────────────

const labelClass = 'block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1';
const selectClass = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200';

interface Props {
    modulo: string;
    value: string | undefined;
    onChange: (disenoId: string | undefined) => void;
}

const SelectorDiseno: React.FC<Props> = ({ modulo, value, onChange }) => {
    const [disenos, setDisenos] = useState<DisenoResumen[]>([]);

    useEffect(() => {
        let vivo = true;
        // Sin `todos`: solo se listan los diseños cotizables (aptoParaCorte y no).
        apiGetDisenos({ modulo })
            .then(res => { if (vivo) setDisenos(res.data); })
            .catch(() => {
                if (!vivo) return;
                setDisenos([]);
                toast.error('No se pudo cargar la lista de diseños.');
            });
        return () => { vivo = false; };
    }, [modulo]);

    return (
        <div>
            <label className={labelClass}>Diseño (opcional — déjalo vacío para medidas libres)</label>
            <select
                className={selectClass}
                value={value || ''}
                onChange={e => onChange(e.target.value || undefined)}
            >
                <option value="">— Medidas libres (sin diseño) —</option>
                {disenos.map(d => (
                    <option key={d.id} value={d.id}>
                        {`${d.diseno}${d.etiqueta ? ' · ' + d.etiqueta : ''} — ${d.sistema}${d.aptoParaCorte ? '' : ' ⚠ sin precio'}`}
                    </option>
                ))}
            </select>
        </div>
    );
};

export default SelectorDiseno;
