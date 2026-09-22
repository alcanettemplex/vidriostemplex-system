import React from 'react';
import { AlertCircle } from 'lucide-react';

import { CampoMeta, OpcionCampo } from '../types';
import { CONTROL_ERROR, CONTROL_LABEL_CLASS, CONTROL_NORMAL } from './ui';

// ─────────────────────────────────────────────────────────────────────────────
// Un solo campo de formulario, renderizado según `campo.tipo`. Data-driven desde
// la `meta.campos` que expone cada módulo del cotizador (backend-api/src/cotizador
// /modules/*.ts) — mismo lenguaje visual que el resto del configurador.
//
// Todo control lleva su `<label htmlFor>`, foco visible, sufijo de unidad cuando
// la unidad no es obvia, y estado de error con `aria-invalid` +
// `aria-describedby`. El color nunca es el único portador del error: siempre va
// acompañado de icono y texto.
//
// El alto fijo (40px), el ring de foco y el estado de error son los tokens
// compartidos de `ui/index.tsx` — este archivo fue su origen (ver ese archivo,
// "Campos de formulario") y sigue componiendo su propia cadena de clases en vez
// de usar `<Input>` porque necesita el sufijo de unidad (mm/%) dentro del
// control, que un override por className no puede garantizar en este build de
// Tailwind (ver CotizadorPage.tsx, comentario de CUERPO_TRABAJO).
const labelClass = CONTROL_LABEL_CLASS;

// 40px de alto: el objetivo de clic mínimo que pide la guía, y suficiente para
// que el sufijo de unidad quepa dentro del control sin apretar el texto.
const controlBase =
    'w-full h-10 px-3 text-sm rounded-lg bg-white text-slate-800 border transition ' +
    'focus:outline-none focus:ring-2';
const controlNormal = CONTROL_NORMAL;
const controlError = CONTROL_ERROR;

// Las flechas nativas del input numérico se pisan con el sufijo de unidad: se
// ocultan sólo en esos campos (las teclas de flecha siguen funcionando igual).
const sinFlechas =
    '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

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
    /** Mensaje de error del campo. Quién valida y cuándo lo decide el
     * formulario (FormularioModulo); aquí sólo se pinta. Ausente o `null` =
     * campo sano. */
    error?: string | null;
}

const CampoDinamico: React.FC<Props> = ({ campo, value, onChange, error }) => {
    const idBase = React.useId();
    const controlId = `${idBase}-${campo.nombre}`;
    const errorId = `${controlId}-error`;
    const hayError = Boolean(error);
    const clasesControl = `${controlBase} ${hayError ? controlError : controlNormal}`;
    const describedBy = hayError ? errorId : undefined;

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
    // Sufijo visible: exactamente la misma unidad que usa la conversión de
    // arriba, para que nadie tenga que deducir si el número que ve son mm, cm
    // o una fracción.
    const sufijo = esCampoMedidaCm ? 'mm' : esCampoPorcentaje ? '%' : null;

    const mensajeError = hayError ? (
        <p id={errorId} className="flex items-start gap-1 text-[11px] font-semibold text-rose-600 mt-1">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>{error}</span>
        </p>
    ) : null;

    if (campo.tipo === 'boolean') {
        return (
            <div className="flex flex-col justify-center min-h-[40px] sm:pt-5">
                <div className="flex items-center gap-2">
                    <input
                        id={controlId}
                        type="checkbox"
                        className="w-4 h-4 accent-indigo-600 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-indigo-400"
                        checked={Boolean(value)}
                        aria-invalid={hayError || undefined}
                        aria-describedby={describedBy}
                        onChange={e => onChange(e.target.checked)}
                    />
                    <label htmlFor={controlId} className="text-sm text-slate-700 cursor-pointer">
                        {campo.etiqueta}
                        {campo.requerido && <span className="text-rose-500"> *</span>}
                    </label>
                </div>
                {mensajeError}
            </div>
        );
    }

    return (
        <div>
            <label htmlFor={controlId} className={labelClass}>
                {campo.etiqueta}
                {campo.requerido && <span className="text-rose-500"> *</span>}
            </label>

            {campo.tipo === 'select' ? (
                <select
                    id={controlId}
                    className={clasesControl}
                    value={value as string | number ?? ''}
                    aria-invalid={hayError || undefined}
                    aria-describedby={describedBy}
                    onChange={e => onChange(e.target.value)}
                >
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
                <div className="relative">
                    <input
                        id={controlId}
                        type="number"
                        className={`${clasesControl} ${sufijo ? `pr-10 ${sinFlechas}` : ''}`}
                        min={esCampoPorcentaje ? 0 : undefined}
                        max={esCampoPorcentaje ? 100 : undefined}
                        aria-invalid={hayError || undefined}
                        aria-describedby={describedBy}
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
                    {sufijo && (
                        <span className="absolute inset-y-0 right-3 flex items-center text-[11px] font-bold text-slate-400 font-cotizador-head pointer-events-none">
                            {sufijo}
                        </span>
                    )}
                </div>
            ) : (
                <input
                    id={controlId}
                    type="text"
                    className={clasesControl}
                    value={value as string ?? ''}
                    aria-invalid={hayError || undefined}
                    aria-describedby={describedBy}
                    onChange={e => onChange(e.target.value)}
                />
            )}

            {mensajeError}
        </div>
    );
};

export default CampoDinamico;
