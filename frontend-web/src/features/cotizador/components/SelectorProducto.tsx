import React from 'react';
import {
    LayoutGrid, PanelTop, DoorOpen, DoorClosed, Square, Sparkles, Package, ListPlus,
} from 'lucide-react';

import { ModuloMeta } from '../types';
import { Etiqueta } from './ui';

// ─────────────────────────────────────────────────────────────────────────────
// Selector de producto del cotizador: una tarjeta por módulo (seis productos más
// "Ítem libre" desde el 2026-09-22), la activa en indigo sólido y el resto
// neutras, más la descripción completa del módulo elegido debajo.
//
// Vivía dentro de `TabCotizar` como bloque suelto; se extrae para que la
// pestaña quede con la estructura del configurador (contexto → cargos →
// selector → configuración | resultado) y no con 40 líneas de markup de
// botones en medio. Es presentación pura: no conoce el carrito, ni el
// resultado, ni las propuestas. Quién resetea el cálculo al cambiar de módulo
// sigue siendo el padre, exactamente como antes.
//
// DESCRIPCIÓN (2026-09-22, ajustada 2026-09-23): la descripción del módulo
// activo va debajo de las tarjetas, completa, como texto corto. Hasta el
// 2026-09-23 era un panel con `flex-1` que se estiraba hasta el alto de Cargos
// de obra y quedaba casi vacío; ahora lo elástico son las filas de tarjetas.
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
    'item-libre': ListPlus,
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
        // Tarjeta con borde, como Cargos de obra a su lado: las dos llenan el
        // mismo alto (`h-full` + `items-stretch` del padre) y sus bordes caen
        // en la misma línea.
        <div className="h-full flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <div
                role="group"
                aria-label="Producto a cotizar"
                // 4 columnas fijas (2026-09-23): con `auto-fit` las 7 tarjetas caían
                // en una sola fila y los nombres se partían en dos líneas. Con 4 quedan
                // 4 + 3, y `auto-rows-fr` + `flex-1` reparten la altura sobrante entre
                // las filas en vez de dejar un bloque vacío debajo.
                className="flex-1 grid grid-cols-2 sm:grid-cols-4 auto-rows-fr gap-2.5"
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

            {/* Descripción completa del módulo elegido, sin recortar. Ya no es un
                panel que se estira: la altura sobrante la toman las tarjetas. */}
            {activo && (
                <div className="border-t border-slate-100 pt-2.5">
                    <Etiqueta icono={IconoActivo}>{activo.nombre}</Etiqueta>
                    <p className="mt-1 text-[12px] text-slate-500 leading-snug">{activo.descripcion}</p>
                </div>
            )}
        </div>
    );
};

export default SelectorProducto;
