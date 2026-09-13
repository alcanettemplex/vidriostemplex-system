import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Check, ChevronDown, LayoutGrid, Search, X } from 'lucide-react';

import { apiGetDisenos } from '../services/cotizadorApi';
import { DisenoResumen } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Selector de diseño de catálogo. Solo lo usa el módulo "ventanas": si se elige
// un diseño, el backend cotiza "por diseño" (despiece real); si se deja vacío,
// cae a "medidas libres" (ver backend-api/src/cotizador/modules/ventanas.ts,
// manejo de `input.disenoId`). El sistema 7038 es la excepción: no tiene mapa de
// perfilería para medidas libres, así que ahí el diseño es obligatorio.
//
// No es un <select> nativo porque cada diseño son cuatro datos (código, forma,
// paneles y nivel de corte) y un option de texto plano los aplasta en una línea
// ilegible; con 25 diseños en 8025, además, hace falta buscador.
// ─────────────────────────────────────────────────────────────────────────────

// Qué diseños pertenecen a cada opción del selector "Sistema". El valor del
// campo ("5020") no coincide con el nombre del sistema en el catálogo de
// diseños ("Sistema5020"), y 5020 agrupa además su variante reforzada, que no
// tiene opción propia en el formulario.
const SISTEMAS_POR_OPCION: Record<string, string[]> = {
    '5020': ['Sistema5020', 'Sistema5020Reforzado'],
    '744': ['Sistema744'],
    '8025': ['Sistema8025'],
    '7038': ['Sistema7038-Interior'],
};

/** "Sistema5020Reforzado" → "Sistema 5020 Reforzado" */
function nombreSistema(sistema: string): string {
    return sistema
        .replace(/^Sistema/, 'Sistema ')
        .replace(/-/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2');
}

// El nivel de corte dice qué tan exacto es el despiece, NO si el diseño tiene
// precio (ver `aptoParaCorte: d.nivelCorte === "A"` en motorDespiece.ts). Para
// cotizar sirve cualquiera: unos milímetros no mueven el precio. Solo el nivel A
// es defendible para mandar a cortar vidrio templado, que es irreversible — y
// hoy solo 2 de los 71 diseños de ventanas lo alcanzan, así que se marca el A
// como distintivo positivo en vez de sembrar una advertencia en los otros 69.
const NIVEL_ESTILO: Record<string, { chip: string; titulo: string }> = {
    A: { chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', titulo: 'Nivel A — medidas exactas, apto para orden de corte' },
    B: { chip: 'bg-amber-50 text-amber-700 ring-amber-200', titulo: 'Nivel B — aproximado; sirve para cotizar, no para cortar' },
    C: { chip: 'bg-slate-100 text-slate-500 ring-slate-200', titulo: 'Nivel C — estimado; sirve para cotizar, no para cortar' },
};

const labelClass = 'block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1';

interface Props {
    modulo: string;
    value: string | undefined;
    onChange: (disenoId: string | undefined) => void;
    /** Opción elegida en el campo "Sistema". Si no llega, se listan todos. */
    sistema?: string;
}

const SelectorDiseno: React.FC<Props> = ({ modulo, value, onChange, sistema }) => {
    const [disenos, setDisenos] = useState<DisenoResumen[]>([]);
    const [abierto, setAbierto] = useState(false);
    const [busqueda, setBusqueda] = useState('');
    const contenedorRef = useRef<HTMLDivElement>(null);
    const inputBusquedaRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let vivo = true;
        // Sin `todos`: solo se listan los diseños cotizables.
        apiGetDisenos({ modulo })
            .then(res => { if (vivo) setDisenos(res.data); })
            .catch(() => {
                if (!vivo) return;
                setDisenos([]);
                toast.error('No se pudo cargar la lista de diseños.');
            });
        return () => { vivo = false; };
    }, [modulo]);

    const permitidos = sistema ? SISTEMAS_POR_OPCION[sistema] : undefined;
    const visibles = useMemo(
        () => (permitidos ? disenos.filter(d => permitidos.includes(d.sistema)) : disenos),
        [disenos, permitidos]
    );

    // Si al cambiar de sistema el diseño elegido ya no pertenece a la lista, se
    // limpia: dejarlo puesto cotizaría un diseño de otro sistema sin que se vea.
    //
    // El guard de `disenos.length` no es decorativo: en el primer render la
    // lista aún está vacía porque el fetch no ha resuelto, y sin él este efecto
    // borraría un diseño ya elegido antes de poder comprobar si era válido.
    useEffect(() => {
        if (!value || disenos.length === 0) return;
        if (!visibles.some(d => d.id === value)) onChange(undefined);
    }, [value, disenos, visibles, onChange]);

    useEffect(() => {
        if (!abierto) return;
        const alClickear = (e: MouseEvent) => {
            if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) setAbierto(false);
        };
        const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
        document.addEventListener('mousedown', alClickear);
        document.addEventListener('keydown', alTeclear);
        inputBusquedaRef.current?.focus();
        return () => {
            document.removeEventListener('mousedown', alClickear);
            document.removeEventListener('keydown', alTeclear);
        };
    }, [abierto]);

    const filtrados = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        if (!q) return visibles;
        return visibles.filter(d =>
            d.diseno.toLowerCase().includes(q) ||
            (d.etiqueta || '').toLowerCase().includes(q) ||
            nombreSistema(d.sistema).toLowerCase().includes(q)
        );
    }, [visibles, busqueda]);

    const grupos = useMemo(() => {
        const mapa = new Map<string, DisenoResumen[]>();
        filtrados.forEach(d => {
            if (!mapa.has(d.sistema)) mapa.set(d.sistema, []);
            mapa.get(d.sistema)!.push(d);
        });
        // Array.from y no [...mapa.entries()]: el target de TS del frontend no
        // permite iterar un Map con spread sin downlevelIteration.
        return Array.from(mapa.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }, [filtrados]);

    const seleccionado = visibles.find(d => d.id === value) || null;
    // Sólo 7038 depende del diseño para poder cotizar: el backend rechaza ese
    // sistema por medidas libres porque no tiene mapa de perfilería.
    const exigeDiseno = sistema === '7038';

    const elegir = (id: string | undefined) => {
        onChange(id);
        setAbierto(false);
        setBusqueda('');
    };

    return (
        <div ref={contenedorRef} className="relative">
            <label className={labelClass}>
                {exigeDiseno ? 'Diseño · obligatorio en el sistema 7038' : 'Diseño · opcional'}
            </label>

            <button
                type="button"
                onClick={() => setAbierto(v => !v)}
                aria-haspopup="listbox"
                aria-expanded={abierto}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border bg-white text-left transition
                    ${abierto ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-slate-300'}
                    ${exigeDiseno && !seleccionado ? 'border-amber-300 bg-amber-50/40' : ''}`}
            >
                {seleccionado ? (
                    <>
                        <span className="px-2 py-0.5 rounded-lg bg-indigo-600 text-white text-[12px] font-extrabold font-cotizador-head tracking-wide flex-shrink-0">
                            {seleccionado.diseno}
                        </span>
                        <span className="flex-1 min-w-0">
                            <span className="block text-[13px] font-bold text-slate-700 truncate">
                                {seleccionado.etiqueta || seleccionado.diseno}
                            </span>
                            <span className="block text-[11px] text-slate-400 truncate">
                                {nombreSistema(seleccionado.sistema)}
                            </span>
                        </span>
                        <span
                            onClick={e => { e.stopPropagation(); elegir(undefined); }}
                            title="Quitar el diseño y volver a medidas libres"
                            className="p-1 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 flex-shrink-0"
                        >
                            <X className="w-3.5 h-3.5" />
                        </span>
                    </>
                ) : (
                    <>
                        <LayoutGrid className="w-4 h-4 text-slate-300 flex-shrink-0" />
                        <span className="flex-1 text-[13px] text-slate-400">
                            {exigeDiseno ? 'Selecciona un diseño…' : 'Medidas libres (sin diseño)'}
                        </span>
                    </>
                )}
                <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition ${abierto ? 'rotate-180' : ''}`} />
            </button>

            {abierto && (
                <div className="absolute z-30 mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-xl shadow-slate-900/10 overflow-hidden">
                    <div className="p-2 border-b border-slate-100">
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-300 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                                ref={inputBusquedaRef}
                                value={busqueda}
                                onChange={e => setBusqueda(e.target.value)}
                                placeholder="Buscar por código o forma…"
                                className="w-full pl-8 pr-2 py-1.5 text-[12.5px] rounded-lg bg-slate-50 border border-transparent focus:bg-white focus:border-indigo-200 focus:outline-none"
                            />
                        </div>
                    </div>

                    <div className="max-h-[320px] overflow-y-auto">
                        {!exigeDiseno && (
                            <button
                                type="button"
                                onClick={() => elegir(undefined)}
                                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 transition
                                    ${!value ? 'bg-indigo-50/60' : ''}`}
                            >
                                <span className="w-4 flex-shrink-0">
                                    {!value && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                                </span>
                                <span className="flex-1">
                                    <span className="block text-[13px] font-bold text-slate-600">Medidas libres</span>
                                    <span className="block text-[11px] text-slate-400">
                                        Sin diseño: el motor estima el despiece con reglas generales
                                    </span>
                                </span>
                            </button>
                        )}

                        {grupos.length === 0 && (
                            <p className="px-3 py-6 text-center text-[12.5px] text-slate-400">
                                {visibles.length === 0
                                    ? 'No hay diseños para este sistema.'
                                    : `Ningún diseño coincide con “${busqueda}”.`}
                            </p>
                        )}

                        {grupos.map(([nombre, items]) => (
                            <div key={nombre}>
                                <div className="sticky top-0 px-3 py-1.5 bg-slate-50/95 backdrop-blur border-y border-slate-100 flex items-center justify-between">
                                    <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-slate-500 font-cotizador-head">
                                        {nombreSistema(nombre)}
                                    </span>
                                    <span className="text-[10.5px] font-bold text-slate-400">{items.length}</span>
                                </div>
                                {items.map(d => {
                                    const activo = d.id === value;
                                    const nivel = NIVEL_ESTILO[d.nivelCorte] || NIVEL_ESTILO.C;
                                    return (
                                        <button
                                            key={d.id}
                                            type="button"
                                            role="option"
                                            aria-selected={activo}
                                            onClick={() => elegir(d.id)}
                                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-indigo-50/50 transition
                                                ${activo ? 'bg-indigo-50' : ''}`}
                                        >
                                            <span className="w-4 flex-shrink-0">
                                                {activo && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                                            </span>
                                            <span
                                                className={`px-2 py-0.5 rounded-lg text-[12px] font-extrabold font-cotizador-head tracking-wide flex-shrink-0 min-w-[3.25rem] text-center
                                                    ${activo ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}
                                            >
                                                {d.diseno}
                                            </span>
                                            <span className="flex-1 min-w-0">
                                                <span className="block text-[12.5px] font-semibold text-slate-700 truncate">
                                                    {d.etiqueta || '—'}
                                                </span>
                                                {d.paneles !== null && (
                                                    <span className="block text-[11px] text-slate-400">
                                                        {d.paneles} {d.paneles === 1 ? 'panel' : 'paneles'} · {d.piezasPerfil} perfiles
                                                    </span>
                                                )}
                                            </span>
                                            <span
                                                title={nivel.titulo}
                                                className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ring-1 ring-inset flex-shrink-0 ${nivel.chip}`}
                                            >
                                                {d.nivelCorte}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                    </div>

                    <p className="px-3 py-2 border-t border-slate-100 bg-slate-50/60 text-[10.5px] text-slate-400 leading-snug">
                        <span className="font-bold text-slate-500">A · B · C</span> = precisión del despiece.
                        Todos cotizan igual; solo el <span className="font-bold text-emerald-600">A</span> sirve para orden de corte.
                    </p>
                </div>
            )}
        </div>
    );
};

export default SelectorDiseno;
