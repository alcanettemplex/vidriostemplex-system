import React, { useEffect, useRef, useState } from 'react';
import {
    Plus, ChevronDown, Check, Pencil, Save, Loader2, CheckCircle2, FilePlus2, Copy, Layers,
} from '../../../components/ui/icons';

import { fmtCOP } from '../format';
import { EstadoCotizacion, Propuesta, SegmentoCliente } from '../types';
import { colorPropuesta } from '../propuestaColor';
import { Chip, ChipEstadoCotizacion } from './ui';

// ─────────────────────────────────────────────────────────────────────────────
// Barra de trabajo (2026-09-23) — fija arriba de Cotizar y de Actual.
//
// Responde de un vistazo las tres preguntas que antes obligaban a ir a la
// pestaña Actual: ¿en qué propuesta estoy?, ¿a qué tipo de cliente le estoy
// cotizando? y ¿está guardado? Y deja hacer ahí mismo lo que se hace con esas
// respuestas: cambiar de propuesta, crear otra, renombrarla, cambiar el tipo de
// cliente y guardar.
//
// Como el resto de componentes del módulo, no llama al backend ni decide
// reglas: notifica hacia arriba y el dueño del estado es `CotizadorPage`.
//
// Fase 5 del sistema visual (2026-09-26): acento `templex-*` en vez de índigo
// (los colores POR PROPUESTA de `propuestaColor.ts` se conservan: son
// significado), rótulos en negro, y las cifras envuelven en vez de desbordar a
// 390px. El botón Guardar deshabilitado deja de ser un azul al 40%: pasa a gris
// con texto legible, para que se lea como "no disponible" y no como "borroso".
// ─────────────────────────────────────────────────────────────────────────────

export type TipoNuevaPropuesta = 'vacia' | 'copia' | 'variante';

const SEGMENTOS: { v: SegmentoCliente; titulo: string }[] = [
    { v: 'PA', titulo: 'PA — Persona / obra pequeña' },
    { v: 'PM', titulo: 'PM — Constructor mediano' },
    { v: 'PB', titulo: 'PB — Gran obra' },
];

interface Props {
    numero: number | null;
    estado: EstadoCotizacion;
    cliente: string;

    sucio: boolean;
    guardando: boolean;
    /** null = se puede guardar; si no, por qué no (sin ítems). */
    motivoNoGuardar: string | null;
    onGuardar: () => void;

    propuestas: Propuesta[];
    activaId: number | null;
    ocupado: boolean;
    onActivar: (id: number) => void;
    onNueva: (tipo: TipoNuevaPropuesta) => void;
    /** Devuelve si se guardó el nombre, para cerrar o no el campo. */
    onRenombrar: (nombre: string) => Promise<boolean>;
    /** null = se puede crear; si no, por qué no (tope, sin ítems). */
    motivoNoNueva: string | null;

    segmento: SegmentoCliente;
    onCambiarSegmento: (s: SegmentoCliente) => void;
    cambiandoSegmento: boolean;
    /** null = se puede cambiar; si no, por qué no (aprobada, legada). */
    motivoNoSegmento: string | null;

    /** `total` es el guardado si no hay cambios pendientes, y el previsto (en
     * vivo) si los hay — `sinGuardar` lo avisa (2026-09-26). */
    cifras: { items: number; productos: number; manoObra: number; cargos: number; total: number; sinGuardar: boolean };
}

/** Dato de la barra: rótulo pequeño arriba, cifra debajo. Se leen como una fila
 * de indicadores en vez de como una frase corrida, que era lo que hacía difícil
 * encontrar el total. (Viene de `CotizadorPage`, donde vivía la barra anterior.) */
const DatoContexto: React.FC<{ etiqueta: string; valor: React.ReactNode; destacado?: boolean }> = ({
    etiqueta, valor, destacado = false,
}) => (
    <div className="text-right">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-900 whitespace-nowrap">{etiqueta}</div>
        <div
            className={`tabular-nums leading-tight whitespace-nowrap ${
                destacado ? 'text-[15px] font-extrabold text-templex-700' : 'text-[13px] font-semibold text-slate-900'
            }`}
        >
            {valor}
        </div>
    </div>
);

const BarraTrabajo: React.FC<Props> = ({
    numero, estado, cliente,
    sucio, guardando, motivoNoGuardar, onGuardar,
    propuestas, activaId, ocupado, onActivar, onNueva, onRenombrar, motivoNoNueva,
    segmento, onCambiarSegmento, cambiandoSegmento, motivoNoSegmento,
    cifras,
}) => {
    const [menuAbierto, setMenuAbierto] = useState(false);
    const [renombrando, setRenombrando] = useState(false);
    const [nombreBorrador, setNombreBorrador] = useState('');
    const [guardandoNombre, setGuardandoNombre] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const activa = propuestas.find(p => p.id === activaId) ?? null;
    const guardada = numero !== null;

    // El menú se cierra al hacer clic fuera o con Esc, como cualquier menú.
    useEffect(() => {
        if (!menuAbierto) return;
        const fuera = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAbierto(false);
        };
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuAbierto(false); };
        document.addEventListener('mousedown', fuera);
        document.addEventListener('keydown', esc);
        return () => {
            document.removeEventListener('mousedown', fuera);
            document.removeEventListener('keydown', esc);
        };
    }, [menuAbierto]);

    // Cambiar de propuesta cierra el campo de nombre: estaba editando otra.
    useEffect(() => { setRenombrando(false); }, [activaId]);

    // Enter confirma y, al desmontarse el campo, el navegador puede disparar
    // además el blur: sin este candado el nombre se enviaría dos veces. Y Esc
    // tiene que ganarle al blur que viene detrás, o cancelar acabaría guardando.
    const renombreEnCurso = useRef(false);
    const renombreCancelado = useRef(false);

    const empezarRenombrar = () => {
        if (!activa || ocupado) return;
        renombreCancelado.current = false;
        setNombreBorrador(activa.nombre ?? '');
        setRenombrando(true);
    };

    const cancelarNombre = () => {
        renombreCancelado.current = true;
        setRenombrando(false);
    };

    const confirmarNombre = async () => {
        if (!activa || renombreEnCurso.current || renombreCancelado.current) return;
        const limpio = nombreBorrador.trim();
        if (limpio === (activa.nombre ?? '')) { setRenombrando(false); return; }
        renombreEnCurso.current = true;
        setGuardandoNombre(true);
        try {
            const ok = await onRenombrar(limpio);
            if (ok) setRenombrando(false);
        } finally {
            renombreEnCurso.current = false;
            setGuardandoNombre(false);
        }
    };

    const elegirNueva = (tipo: TipoNuevaPropuesta) => {
        setMenuAbierto(false);
        onNueva(tipo);
    };

    const opcionesNueva: { tipo: TipoNuevaPropuesta; icono: React.ComponentType<{ className?: string }>; titulo: string; detalle: string }[] = [
        { tipo: 'vacia', icono: FilePlus2, titulo: 'Propuesta vacía', detalle: 'Para cotizar algo distinto desde cero.' },
        {
            tipo: 'copia',
            icono: Copy,
            titulo: `Copia exacta${activa ? ` de la ${activa.etiqueta}` : ''}`,
            detalle: 'Mismos ítems y cargos; después agregas o quitas lo que cambie.',
        },
        {
            tipo: 'variante',
            icono: Layers,
            titulo: 'Variante con otro vidrio',
            detalle: 'Recalcula todos los ítems con otro vidrio, película o matizado.',
        },
    ];

    return (
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 mb-3 space-y-3">
            {/* ── Fila 1: qué cotización es · tipo de cliente · guardar ───────── */}
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${guardada ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        <span className="text-[14px] font-bold text-slate-900 tabular-nums">
                            {guardada ? `Cotización N.° ${numero}` : 'Cotización nueva'}
                        </span>
                        {guardada && <ChipEstadoCotizacion estado={estado} />}
                    </div>
                    <div className={`text-[12px] truncate mt-0.5 ${cliente ? 'text-slate-800' : 'text-slate-700'}`}>{cliente || 'Cliente sin asignar'}</div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Tipo de cliente: control segmentado, no un <select>. Son tres
                        opciones que se ven todas a la vez y se cambian de un clic. */}
                    <div className="flex flex-wrap items-center gap-2">
                        <span id="barra-segmento" className="text-[11px] font-semibold uppercase tracking-wide text-slate-900">
                            Tipo de cliente
                        </span>
                        <div
                            role="radiogroup"
                            aria-labelledby="barra-segmento"
                            title={motivoNoSegmento ?? 'Al cambiarlo se recalculan los precios de todos los ítems de todas las propuestas.'}
                            className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5"
                        >
                            {SEGMENTOS.map(s => {
                                const activo = s.v === segmento;
                                return (
                                    <button
                                        key={s.v}
                                        type="button"
                                        role="radio"
                                        aria-checked={activo}
                                        title={motivoNoSegmento ?? s.titulo}
                                        disabled={Boolean(motivoNoSegmento) || cambiandoSegmento}
                                        onClick={() => onCambiarSegmento(s.v)}
                                        className={`min-w-[42px] px-2.5 py-1 rounded-md text-[12.5px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-templex-400 disabled:cursor-not-allowed ${activo
                                            ? 'bg-white text-templex-700 font-bold shadow-sm ring-1 ring-slate-300'
                                            : 'text-slate-700 hover:text-slate-900 disabled:hover:text-slate-700'} ${!activo && motivoNoSegmento ? 'opacity-60' : ''}`}
                                    >
                                        {s.v}
                                    </button>
                                );
                            })}
                        </div>
                        {cambiandoSegmento && (
                            <span className="inline-flex items-center gap-1 text-[12px] text-templex-700 font-semibold">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Recalculando…
                            </span>
                        )}
                    </div>

                    {/* Guardar: siempre a la vista, con su estado. Deja de ser una
                        acción escondida al final de la pestaña Actual. */}
                    {guardando ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-semibold text-slate-800">
                            <Loader2 className="w-4 h-4 animate-spin" /> Guardando…
                        </span>
                    ) : sucio || !guardada ? (
                        <div className="flex flex-wrap items-center gap-2">
                            {sucio && (
                                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-amber-800">
                                    <span className="w-2 h-2 rounded-full bg-amber-500" /> Cambios sin guardar
                                </span>
                            )}
                            <button
                                type="button"
                                onClick={onGuardar}
                                disabled={Boolean(motivoNoGuardar)}
                                title={motivoNoGuardar ?? 'Guardar (Ctrl+S)'}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-templex-600 text-white text-[12.5px] font-semibold hover:bg-templex-700 shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-templex-400 disabled:bg-slate-200 disabled:text-slate-600 disabled:shadow-none disabled:cursor-not-allowed"
                            >
                                <Save className="w-4 h-4" />
                                {guardada ? 'Guardar' : 'Guardar cotización'}
                                <kbd className="hidden md:inline ml-1 px-1 rounded bg-white/20 text-[11px] font-semibold">Ctrl+S</kbd>
                            </button>
                        </div>
                    ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-semibold text-emerald-800">
                            <CheckCircle2 className="w-4 h-4" /> Guardado
                        </span>
                    )}
                </div>
            </div>

            {/* ── Fila 2: propuestas · cifras ───────────────────────────────── */}
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pt-3 border-t border-slate-100">
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-900 mr-1">Propuestas</span>

                    {!guardada ? (
                        // Sin guardar todavía no existe ninguna propuesta en el
                        // servidor, pero lo que se está armando SERÁ la A.
                        <span
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12.5px] font-bold ${colorPropuesta('A').pestanaActiva}`}
                            title="Lo que armes se guardará como Propuesta A"
                        >
                            A <span className="font-medium">· sin guardar</span>
                        </span>
                    ) : (
                        propuestas.map(p => {
                            const esActiva = p.id === activaId;
                            const color = colorPropuesta(p.etiqueta);
                            if (esActiva && renombrando) {
                                return (
                                    <span key={p.id} className={`inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-lg border ${color.pestanaActiva}`}>
                                        <span className="text-[12.5px] font-bold">{p.etiqueta}</span>
                                        <input
                                            autoFocus
                                            value={nombreBorrador}
                                            maxLength={80}
                                            placeholder="Nombre (ej. Templado + tablero)"
                                            aria-label={`Nombre de la propuesta ${p.etiqueta}`}
                                            onChange={e => setNombreBorrador(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') { e.preventDefault(); confirmarNombre(); }
                                                if (e.key === 'Escape') cancelarNombre();
                                            }}
                                            onBlur={confirmarNombre}
                                            disabled={guardandoNombre}
                                            className="w-44 sm:w-52 px-2 py-0.5 rounded-md text-[12.5px] font-normal text-slate-900 placeholder:text-slate-500 bg-white focus:outline-none focus:ring-2 focus:ring-white/70"
                                        />
                                        {guardandoNombre && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                    </span>
                                );
                            }
                            return (
                                <span key={p.id} className="inline-flex">
                                    <button
                                        type="button"
                                        onClick={() => (esActiva ? undefined : onActivar(p.id))}
                                        onDoubleClick={esActiva ? empezarRenombrar : undefined}
                                        disabled={ocupado}
                                        aria-current={esActiva ? 'true' : undefined}
                                        title={esActiva
                                            ? 'Es la propuesta que estás editando. Doble clic para cambiarle el nombre.'
                                            : `Cambiar a la propuesta ${p.etiqueta}${p.nombre ? ` (${p.nombre})` : ''}`}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 border text-[12.5px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-templex-400 disabled:cursor-wait ${esActiva
                                            ? `${color.pestanaActiva} rounded-l-lg`
                                            : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50 rounded-lg'}`}
                                    >
                                        {!esActiva && <span className={`w-2 h-2 rounded-full ${color.punto}`} />}
                                        <span className="font-bold">{p.etiqueta}</span>
                                        {p.nombre && <span className="font-medium max-w-[160px] truncate">· {p.nombre}</span>}
                                        {p.elegida && (
                                            <Check className="w-3.5 h-3.5" aria-label="elegida" />
                                        )}
                                    </button>
                                    {esActiva && (
                                        <button
                                            type="button"
                                            onClick={empezarRenombrar}
                                            disabled={ocupado}
                                            title="Cambiar el nombre de esta propuesta"
                                            className={`inline-flex items-center px-2 border border-l-0 rounded-r-lg transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-templex-400 ${color.pestanaActiva}`}
                                        >
                                            <Pencil className="w-3.5 h-3.5" />
                                            <span className="sr-only">Renombrar la propuesta {p.etiqueta}</span>
                                        </button>
                                    )}
                                </span>
                            );
                        })
                    )}

                    <div className="relative" ref={menuRef}>
                        <button
                            type="button"
                            onClick={() => setMenuAbierto(v => !v)}
                            disabled={Boolean(motivoNoNueva) || ocupado}
                            aria-haspopup="menu"
                            aria-expanded={menuAbierto}
                            title={motivoNoNueva ?? 'Crear otra propuesta para el mismo cliente'}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-slate-400 text-[12.5px] font-semibold text-slate-800 hover:border-templex-400 hover:text-templex-700 hover:bg-templex-50/50 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-templex-400 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            Nueva propuesta
                            <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                        {menuAbierto && (
                            <div role="menu" className="absolute left-0 top-full mt-1 z-30 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-xl p-1.5">
                                {!guardada && (
                                    <p className="px-2.5 pt-1.5 pb-2 text-[12px] text-slate-800 leading-snug border-b border-slate-100 mb-1">
                                        Primero se guarda la cotización (toma el número siguiente) y la que armaste queda
                                        como <span className="font-semibold text-slate-900">Propuesta A</span>.
                                    </p>
                                )}
                                {opcionesNueva.map(o => (
                                    <button
                                        key={o.tipo}
                                        type="button"
                                        role="menuitem"
                                        onClick={() => elegirNueva(o.tipo)}
                                        className="w-full flex items-start gap-2.5 text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50"
                                    >
                                        <o.icono className="w-4 h-4 mt-0.5 text-templex-600 shrink-0" />
                                        <span>
                                            <span className="block text-[12.5px] font-semibold text-slate-900">
                                                {!guardada ? `Guardar y crear: ${o.titulo.toLowerCase()}` : o.titulo}
                                            </span>
                                            <span className="block text-[12px] text-slate-700 leading-snug">{o.detalle}</span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {activa && !activa.elegida && propuestas.length > 1 && (
                        <Chip tono="ambar" title="La elegida es la que se cobra y la que sale a corte. Se marca en la pestaña Actual.">
                            No es la elegida
                        </Chip>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <DatoContexto etiqueta="Ítems" valor={cifras.items} />
                    <DatoContexto etiqueta="Productos" valor={fmtCOP(cifras.productos)} />
                    <DatoContexto etiqueta="Mano de obra" valor={fmtCOP(cifras.manoObra)} />
                    <DatoContexto etiqueta="Cargos de obra" valor={fmtCOP(cifras.cargos)} />
                    <DatoContexto
                        etiqueta={cifras.sinGuardar ? 'Total · sin guardar' : 'Total'}
                        valor={fmtCOP(cifras.total)}
                        destacado
                    />
                </div>
            </div>
        </div>
    );
};

export default BarraTrabajo;
