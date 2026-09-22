import React from 'react';
import {
    LayoutGrid, PanelTop, DoorOpen, DoorClosed, Square, Sparkles, Package,
} from 'lucide-react';

import { ModuloMeta } from '../types';
import { Etiqueta } from './ui';

// ─────────────────────────────────────────────────────────────────────────────
// Selector de producto del cotizador: las seis tarjetas de módulo en una fila,
// la activa en indigo sólido y el resto neutras, más la descripción completa
// del módulo elegido debajo.
//
// Vivía dentro de `TabCotizar` como bloque suelto; se extrae para que la
// pestaña quede con la estructura del configurador (contexto → cargos →
// selector → configuración | resultado) y no con 40 líneas de markup de
// botones en medio. Es presentación pura: no conoce el carrito, ni el
// resultado, ni las propuestas. Quién resetea el cálculo al cambiar de módulo
// sigue siendo el padre, exactamente como antes.
//
// PANEL DE DESCRIPCIÓN (2026-09-22): antes la tarjeta activa metía su propia
// descripción recortada a 3 líneas (`descripcionCorta`) dentro del botón, lo
// que además la hacía más alta que las otras cinco. Se sacó de ahí a un panel
// aparte, debajo de la fila — todas las tarjetas quedan del mismo alto, y el
// texto ya no se trunca. El panel lleva `flex-1` para llenar el espacio que
// sobra cuando este selector vive al lado de Cargos de obra (más alto) en
// `TabCotizar`: la altura la fuerza el padre con `items-stretch` + `h-full`
// aquí, este panel es lo único elástico dentro.
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

interface Props {
    modulos: ModuloMeta[];
    moduloId: string;
    onCambiar: (id: string) => void;
}

const SelectorProducto: React.FC<Props> = ({ modulos, moduloId, onCambiar }) => {
    if (modulos.length === 0) return null;
    const activo = modulos.find(m => m.id === moduloId) ?? null;
    const IconoActivo = activo ? (ICONOS_MODULO[activo.id] || Package) : Package;

    return (
        <div className="h-full flex flex-col gap-2.5">
            <div
                role="group"
                aria-label="Producto a cotizar"
                // `auto-fit`/`minmax` en vez de `sm:`/`lg:grid-cols-N`: ese breakpoint
                // reacciona al ANCHO DEL VIEWPORT, no al del contenedor. Desde que este
                // selector puede vivir al lado de Cargos de obra (ancho variable, no
                // toda la pantalla), necesita acomodarse solo al espacio real que le
                // toque, sin importar qué tan angosto o ancho sea el viewport.
                className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2.5"
            >
                {modulos.map(m => {
                    const esActivo = moduloId === m.id;
                    const Icono = ICONOS_MODULO[m.id] || Package;
                    return (
                        <button
                            key={m.id}
                            type="button"
                            onClick={() => onCambiar(m.id)}
                            aria-pressed={esActivo}
                            title={m.descripcion}
                            className={
                                'min-w-0 text-left rounded-xl px-3 py-3 flex items-center gap-2.5 transition ' +
                                'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-indigo-400 ' +
                                (esActivo
                                    ? 'bg-indigo-600 border border-indigo-600 shadow-lg shadow-indigo-600/25'
                                    : 'bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300')
                            }
                        >
                            <span
                                className={
                                    'w-8 h-8 rounded-full flex items-center justify-center shrink-0 ' +
                                    (esActivo ? 'bg-white/15' : 'bg-slate-100')
                                }
                            >
                                <Icono className={`w-4 h-4 ${esActivo ? 'text-white' : 'text-slate-400'}`} />
                            </span>
                            <span
                                className={
                                    'min-w-0 text-[12.5px] font-extrabold font-cotizador-head leading-tight ' +
                                    (esActivo ? 'text-white' : 'text-slate-700')
                                }
                            >
                                {m.nombre}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Descripción completa del módulo elegido — sin recortar, sin
                `title` como único lugar donde leerla. Crece con `flex-1` para
                ocupar el resto de la columna cuando el hermano (Cargos de
                obra) es más alto. */}
            {activo && (
                <div className="flex-1 min-h-0 rounded-xl border border-slate-200 bg-white p-4">
                    <Etiqueta icono={IconoActivo}>{activo.nombre}</Etiqueta>
                    <p className="mt-2 text-[13px] text-slate-600 leading-relaxed">{activo.descripcion}</p>
                </div>
            )}
        </div>
    );
};

export default SelectorProducto;
