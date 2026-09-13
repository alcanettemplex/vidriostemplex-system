import React from 'react';

import { CampoMeta, OpcionCampo } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Un solo campo de formulario, renderizado según `campo.tipo`. Data-driven desde
// la `meta.campos` que expone cada módulo del cotizador (backend-api/src/cotizador
// /modules/*.ts) — mismo lenguaje visual que ExploradorODPPanel.tsx.
// ─────────────────────────────────────────────────────────────────────────────

const labelClass = 'block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1';
const selectClass = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200';

function esOpcionObjeto(o: string | number | OpcionCampo): o is OpcionCampo {
    return typeof o === 'object' && o !== null;
}

function esNumeroFinito(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

interface Props {
    campo: CampoMeta;
    value: unknown;
    onChange: (value: unknown) => void;
}

const CampoDinamico: React.FC<Props> = ({ campo, value, onChange }) => {
    // Conversión de PRESENTACIÓN mm↔cm: el motor de cálculo (Etapa 2, golden
    // master ya verificado) espera el campo en centímetros bajo el nombre
    // "...Cm" (anchoCm, altoCm, anchoNaveCm...), pero la etiqueta ya dice "(mm)"
    // porque así lo pide el vendedor. Este es el único punto del árbol que
    // conoce la unidad de presentación: FormularioModulo sigue leyendo/enviando
    // centímetros exactamente igual que antes.
    const esCampoMedidaCm = campo.tipo === 'number' && campo.nombre.endsWith('Cm');
    // Misma idea con el descuento: el motor y las cotizaciones ya guardadas lo
    // manejan como FRACCIÓN (0,05 = 5%), pero el vendedor escribe el porcentaje.
    // Antes el campo pedía la fracción en crudo, y un 5 escrito donde iba 0,05
    // se aplicaba como 500%: total negativo, sin error. El backend además lo
    // rechaza fuera de 0-1 (ver totalizar en motorCalculo.ts).
    const esCampoPorcentaje = campo.tipo === 'number' && campo.nombre === 'descuentoPct';
    if (campo.tipo === 'boolean') {
        return (
            <div className="flex items-center gap-2 pt-5">
                <input
                    type="checkbox"
                    className="w-4 h-4 accent-indigo-600"
                    checked={Boolean(value)}
                    onChange={e => onChange(e.target.checked)}
                />
                <label className="text-sm text-slate-700">
                    {campo.etiqueta}
                    {campo.requerido && <span className="text-rose-500"> *</span>}
                </label>
            </div>
        );
    }

    return (
        <div>
            <label className={labelClass}>
                {campo.etiqueta}
                {campo.requerido && <span className="text-rose-500"> *</span>}
            </label>

            {campo.tipo === 'select' ? (
                <select className={selectClass} value={value as string | number ?? ''} onChange={e => onChange(e.target.value)}>
                    {/* El placeholder se omite si el campo ya define qué
                        significa "vacío" (p. ej. "Sin matizado"): si no, se
                        verían dos opciones distintas con el mismo value="". */}
                    {!(campo.opciones || []).some(o => (esOpcionObjeto(o) ? o.value : o) === '') && (
                        <option value="" disabled={campo.requerido}>Selecciona…</option>
                    )}
                    {(campo.opciones || []).map((o, i) => {
                        const { val, label } = esOpcionObjeto(o) ? { val: o.value, label: o.label } : { val: o, label: o };
                        return <option key={i} value={val}>{label}</option>;
                    })}
                </select>
            ) : campo.tipo === 'number' ? (
                <input
                    type="number"
                    className={selectClass}
                    min={esCampoPorcentaje ? 0 : undefined}
                    max={esCampoPorcentaje ? 100 : undefined}
                    value={
                        esCampoMedidaCm
                            ? (esNumeroFinito(value) ? value * 10 : '')
                            // El redondeo evita el ruido de coma flotante:
                            // 0.05 * 100 da 5.000000000000001 en JS.
                            : esCampoPorcentaje
                                ? (esNumeroFinito(value) ? Math.round(value * 10000) / 100 : '')
                                : (value as number | string ?? '')
                    }
                    onChange={e => {
                        const texto = e.target.value;
                        if (texto === '') { onChange(''); return; }
                        const numero = Number(texto);
                        if (esCampoMedidaCm) return onChange(numero / 10);
                        if (esCampoPorcentaje) return onChange(numero / 100);
                        onChange(numero);
                    }}
                />
            ) : (
                <input
                    type="text"
                    className={selectClass}
                    value={value as string ?? ''}
                    onChange={e => onChange(e.target.value)}
                />
            )}
        </div>
    );
};

export default CampoDinamico;
