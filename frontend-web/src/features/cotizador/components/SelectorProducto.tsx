import React from 'react';
import {
    LayoutGrid, PanelTop, DoorOpen, DoorClosed, Square, Sparkles, Package, ListPlus,
} from '../../../components/ui/icons';

import { ModuloMeta } from '../types';
import { descripcionComercial } from '../descripcionesModulo';

// ─────────────────────────────────────────────────────────────────────────────
// Selector de producto del cotizador: una tarjeta por módulo (seis productos más
// "Ítem libre" desde el 2026-09-22) y, debajo, la descripción del elegido.
//
// Es presentación pura: no conoce el carrito, ni el resultado, ni las
// propuestas. Quién resetea el cálculo al cambiar de módulo sigue siendo el
// padre (TabCotizar).
//
// FORMA (2026-09-26, Fase 5 del sistema visual): es el PASO 1 de la pestaña y
// va a lo ancho, arriba de todo. Las siete tarjetas caben en UNA fila en
// escritorio, con alto fijo de 64 px: hasta hoy compartían fila con Cargos de
// obra y se estiraban hasta su alto, y quedaban de ~200 px casi vacías. En
// tableta 4 + 3; en móvil una rejilla compacta de 2 columnas (sin scroll
// horizontal: con siete opciones, esconder tres detrás de un deslizamiento
// es esconderlas). La activa lleva el azul de marca (`templex`); antes era
// índigo, el acento propio que tenía el módulo.
//
// DESCRIPCIÓN: la frase comercial de `descripcionesModulo.ts`, no el texto
// técnico del backend (que sigue siendo el respaldo si falta la frase).
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

    return (
        <div className="rounded-xl border border-slate-200 bg-white shadow-card p-3 space-y-2.5">
            <div
                role="group"
                aria-label="Producto a cotizar"
                className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2"
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
                            title={descripcionComercial(m)}
                            className={
                                'min-w-0 h-16 text-left rounded-xl border px-2.5 flex items-center gap-2.5 transition ' +
                                'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-templex-400 ' +
                                (esActivo
                                    ? 'bg-templex-50 border-templex-500 ring-1 ring-templex-500'
                                    : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-templex-300')
                            }
                        >
                            <span
                                className={
                                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ' +
                                    (esActivo ? 'bg-templex-600' : 'bg-slate-100')
                                }
                            >
                                <Icono className={`w-4 h-4 ${esActivo ? 'text-white' : 'text-slate-600'}`} />
                            </span>
                            <span
                                className={
                                    'min-w-0 text-[13px] font-semibold leading-tight ' +
                                    (esActivo ? 'text-templex-900' : 'text-slate-900')
                                }
                            >
                                {m.nombre}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Una línea para el asesor: qué cotiza el módulo elegido. */}
            {activo && (
                <p className="text-[12.5px] text-slate-800 leading-snug" title={descripcionComercial(activo)}>
                    <span className="font-semibold text-slate-900">{activo.nombre}:</span>{' '}
                    {descripcionComercial(activo)}
                </p>
            )}
        </div>
    );
};

export default SelectorProducto;
