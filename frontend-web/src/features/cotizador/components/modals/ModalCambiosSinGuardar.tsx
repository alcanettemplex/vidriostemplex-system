import React, { useEffect } from 'react';
import { AlertTriangle, Save, Trash2 } from 'lucide-react';

import { BotonPeligro, BotonPrimario, BotonSecundario, ModalShell } from '../ui';

// ─────────────────────────────────────────────────────────────────────────────
// "Tienes cambios sin guardar" (2026-09-23).
//
// Sustituye al `window.confirm` que preguntaba "¿Seguir? Se perderán": obligaba
// a elegir entre perder el trabajo o no hacer nada, cuando lo que el vendedor
// quiere casi siempre es GUARDAR y seguir. Por eso esa es la acción principal y
// la que toma Enter; descartar queda como acción destructiva explícita, y Esc o
// la X cancelan sin tocar nada.
// ─────────────────────────────────────────────────────────────────────────────

export type DecisionCambios = 'guardar' | 'descartar' | 'cancelar';

interface Props {
    /** Qué iba a hacer el vendedor, en infinitivo: "cambiar a la Propuesta B". */
    accion: string;
    /** Dónde están los cambios: "la Propuesta A" o "la cotización nueva". */
    donde: string;
    /** Sin ítems no se puede guardar: la opción principal se explica y se apaga. */
    puedeGuardar: boolean;
    onDecidir: (d: DecisionCambios) => void;
}

const ModalCambiosSinGuardar: React.FC<Props> = ({ accion, donde, puedeGuardar, onDecidir }) => {
    // Esc cancela. Enter no se escucha aquí: "Guardar y continuar" lleva el foco
    // de entrada (`autoFocus`) y el propio botón responde a Enter — escucharlo
    // también en la ventana dispararía el guardado dos veces.
    useEffect(() => {
        const alTeclado = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onDecidir('cancelar');
        };
        window.addEventListener('keydown', alTeclado);
        return () => window.removeEventListener('keydown', alTeclado);
    }, [onDecidir]);

    return (
        <ModalShell
            titulo="Tienes cambios sin guardar"
            subtitulo={`En ${donde}`}
            anchoMaximo="max-w-md"
            onClose={() => onDecidir('cancelar')}
            pie={
                <>
                    <BotonSecundario compacto onClick={() => onDecidir('cancelar')}>
                        Cancelar
                    </BotonSecundario>
                    <BotonPeligro compacto icono={Trash2} onClick={() => onDecidir('descartar')}>
                        Descartar cambios
                    </BotonPeligro>
                    <BotonPrimario
                        compacto
                        icono={Save}
                        onClick={() => onDecidir('guardar')}
                        disabled={!puedeGuardar}
                        autoFocus
                    >
                        Guardar y continuar
                    </BotonPrimario>
                </>
            }
        >
            <div className="px-6 py-5 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-[13px] text-slate-600 leading-relaxed space-y-2">
                    <p>
                        Antes de <span className="font-bold text-slate-800">{accion}</span>, decide qué hacer con lo
                        que cambiaste en {donde} (ítems, descuento o cargos de obra).
                    </p>
                    {puedeGuardar ? (
                        <p className="text-slate-500">
                            <span className="font-semibold">Guardar y continuar</span> lo deja grabado y sigue.
                            <span className="font-semibold"> Descartar</span> lo pierde y no se puede deshacer.
                        </p>
                    ) : (
                        <p className="text-amber-700">
                            No se puede guardar una propuesta sin ítems: agrega uno o descarta los cambios.
                        </p>
                    )}
                </div>
            </div>
        </ModalShell>
    );
};

export default ModalCambiosSinGuardar;
