import React from 'react';
import {
    LayoutGrid, PanelTop, DoorOpen, DoorClosed, Square, Sparkles, Package, ListPlus,
} from '../../../components/ui/icons';

import { ModuloMeta } from '../types';
import { descripcionComercial, subtituloRiel } from '../descripcionesModulo';

// ─────────────────────────────────────────────────────────────────────────────
// Selector de producto del cotizador: una tarjeta por módulo (seis productos más
// "Ítem libre" desde el 2026-09-22) y, debajo, la descripción del elegido.
//
// Es presentación pura: no conoce el carrito, ni el resultado, ni las
// propuestas. Quién resetea el cálculo al cambiar de módulo sigue siendo el
// padre (TabCotizar).
//
// FORMA (2026-09-26, mesa de trabajo): es el RIEL izquierdo de Cotizar. Desde
// `lg` es una columna vertical fija (sticky) con el nombre y una línea de qué
// cotiza cada producto; por debajo, una rejilla compacta de 2 a 4 columnas, sin
// scroll horizontal: con siete opciones, esconder tres detrás de un
// deslizamiento es esconderlas. La activa lleva el azul de marca.
//
// DESCRIPCIÓN: la frase comercial completa va en el encabezado del panel
// central (TabCotizar); aquí solo un subtítulo corto (`subtituloRiel`) y la
// frase entera como `title`.
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

    return (
        <nav aria-label="Producto a cotizar" className="lg:sticky lg:top-3">
            <h2 className="hidden lg:block px-1 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Producto
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-1 gap-1.5">
                {modulos.map(m => {
                    const esActivo = moduloId === m.id;
                    const Icono = ICONOS_MODULO[m.id] || Package;
                    return (
                        <button
                            key={m.id}
                            type="button"
                            onClick={() => onCambiar(m.id)}
                            aria-pressed={esActivo}
                            title={descripcionComercial(m)}
                            className={
                                'min-w-0 text-left rounded-xl border px-2.5 py-2 flex items-center gap-2.5 transition ' +
                                'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-templex-400 ' +
                                (esActivo
                                    ? 'bg-white border-templex-300 shadow-card'
                                    : 'bg-transparent border-transparent hover:bg-white hover:border-slate-200')
                            }
                        >
                            <span
                                className={
                                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ' +
                                    (esActivo ? 'bg-templex-600' : 'bg-white ring-1 ring-slate-200')
                                }
                            >
                                <Icono className={`w-4 h-4 ${esActivo ? 'text-white' : 'text-slate-600'}`} />
                            </span>
                            <span className="min-w-0">
                                <span className={`block text-[13px] font-semibold leading-tight ${esActivo ? 'text-templex-800' : 'text-slate-900'}`}>
                                    {m.nombre}
                                </span>
                                {subtituloRiel(m.id) && (
                                    <span className="hidden lg:block text-[11.5px] text-slate-600 leading-snug truncate">
                                        {subtituloRiel(m.id)}
                                    </span>
                                )}
                            </span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
};

export default SelectorProducto;
