import React from 'react';
import {
    LayoutGrid, PanelTop, DoorOpen, DoorClosed, Square, Sparkles, Package,
} from 'lucide-react';

import { ModuloMeta } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Selector de producto del cotizador: las seis tarjetas de módulo en una fila,
// la activa en indigo sólido y el resto neutras.
//
// Vivía dentro de `TabCotizar` como bloque suelto; se extrae para que la
// pestaña quede con la estructura del configurador (contexto → cargos →
// selector → configuración | resultado) y no con 40 líneas de markup de
// botones en medio. Es presentación pura: no conoce el carrito, ni el
// resultado, ni las propuestas. Quién resetea el cálculo al cambiar de módulo
// sigue siendo el padre, exactamente como antes.
// ─────────────────────────────────────────────────────────────────────────────

// Íconos por id de módulo (backend-api/src/cotizador/modules/registry.ts). No
// viene de `meta`: es puramente decorativo, así que un módulo nuevo cae al
// ícono genérico en vez de romper la pantalla.
const ICONOS_MODULO: Record<string, React.ComponentType<{ className?: string }>> = {
    ventanas: LayoutGrid,
    proyectantes: PanelTop,
    'cabinas-corredizas': DoorOpen,
    'cabinas-batientes': DoorClosed,
    tablero: Square,
    espejo: Sparkles,
};

/** Recorta la descripción del módulo (puede ser un párrafo largo) a su primera
 * oración, o a ~70 caracteres si esa "oración" sigue siendo muy larga — la
 * tarjeta es angosta, no un lugar para el texto completo. */
function descripcionCorta(descripcion: string): string {
    const primeraOracion = descripcion.match(/^[^.!?]*[.!?]/)?.[0]?.trim() || descripcion;
    if (primeraOracion.length <= 90) return primeraOracion;
    return `${descripcion.slice(0, 70).trimEnd()}…`;
}

interface Props {
    modulos: ModuloMeta[];
    moduloId: string;
    onCambiar: (id: string) => void;
}

const SelectorProducto: React.FC<Props> = ({ modulos, moduloId, onCambiar }) => {
    if (modulos.length === 0) return null;

    return (
        <div
            role="group"
            aria-label="Producto a cotizar"
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5"
        >
            {modulos.map(m => {
                const activo = moduloId === m.id;
                const Icono = ICONOS_MODULO[m.id] || Package;
                return (
                    <button
                        key={m.id}
                        type="button"
                        onClick={() => onCambiar(m.id)}
                        aria-pressed={activo}
                        title={m.descripcion}
                        className={
                            'min-w-0 text-left rounded-xl px-3 py-3 flex flex-col gap-2 transition ' +
                            'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-indigo-400 ' +
                            (activo
                                ? 'bg-indigo-600 border border-indigo-600 shadow-lg shadow-indigo-600/25'
                                : 'bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300')
                        }
                    >
                        <span
                            className={
                                'w-8 h-8 rounded-full flex items-center justify-center shrink-0 ' +
                                (activo ? 'bg-white/15' : 'bg-slate-100')
                            }
                        >
                            <Icono className={`w-4 h-4 ${activo ? 'text-white' : 'text-slate-400'}`} />
                        </span>
                        <span className="min-w-0">
                            <span
                                className={
                                    'block text-[12.5px] font-extrabold font-cotizador-head leading-tight ' +
                                    (activo ? 'text-white' : 'text-slate-700')
                                }
                            >
                                {m.nombre}
                            </span>
                            {/* La descripción sólo en la activa: en las otras cinco
                                convertía la fila en un muro de texto y el objetivo
                                del selector es que se vea de un golpe cuál está
                                elegida. El resto la conserva en el `title`. */}
                            {activo && (
                                <span className="block text-[11px] text-indigo-100 leading-snug mt-1 line-clamp-3">
                                    {descripcionCorta(m.descripcion)}
                                </span>
                            )}
                        </span>
                    </button>
                );
            })}
        </div>
    );
};

export default SelectorProducto;
