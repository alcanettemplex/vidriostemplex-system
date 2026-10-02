import React from 'react';
import {
    AlertCircle, CheckCircle2, Loader2, Lock, Pencil, Plus, Save, Trash2, X,
} from '../../../components/ui/icons';

import { LineaManoObra, Parametros } from '../types';
import { fmtCOP, fmtPct } from '../format';
import { TotalesPrevistos, totalLineaManoObra } from '../totalesPropuesta';
import { EstadoCalculo } from './FormularioModulo';
import { EstadoCargos, LineaOtroCargo } from './PanelCargosObra';
import { BotonPrimario, BotonSecundario, Chip } from './ui';

// ─────────────────────────────────────────────────────────────────────────────
// Resumen de la propuesta — la columna derecha de la MESA DE TRABAJO de Cotizar
// (rediseño integral, 2026-09-26, arquitectura A elegida por el usuario sobre
// una maqueta). Responde siempre, sin bajar la página, las dos preguntas del
// asesor: ¿cuánto vale lo que estoy armando? y ¿cuánto va la propuesta?
//
//   1. Este producto  — precio del ítem en pantalla y el botón Agregar.
//   2. La propuesta   — sus ítems (clic = editar).
//   3. Mano de obra   — automática, de solo lectura (la calcula el backend).
//   4. Cargos de obra — casillas compactas y EDITABLES: al marcarlas cargan el
//      precio predeterminado de Configuración y el asesor puede cambiarlo
//      (pedido del usuario sobre la maqueta). El IVA por línea y la vista
//      completa siguen en Actual (PanelCargosObra).
//   5. Total          — el desglose de `calcularTotalesPrevistos` y Guardar.
//
// PRESENTACIÓN PURA: no guarda estado propio. Todo llega de CotizadorPage (la
// propuesta, los cargos, los totales) y de TabCotizar (este producto). Los
// cargos se editan con el mismo `EstadoCargos` y el mismo `onCambiarCargos`
// que usa el panel de Actual: editar aquí es editar allá.
//
// Por debajo de `xl` la columna baja al final de la página y aparece una barra
// fija abajo con el total y "Agregar", para no perder la acción principal.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que TabCotizar sabe del producto en pantalla. */
export interface EsteProducto {
    nombre: string;
    detalle: string;
    nivelCorte: string | null;
    piezas: number;
    /** null mientras no hay precio calculado. */
    subtotalConAiu: number | null;
    iva: number | null;
    total: number | null;
    estado: EstadoCalculo | null;
    /** Recalculando por una personalización o un cambio de tipo de cliente. */
    recalculando: boolean;
    hayErrores: boolean;
    /** Posición del ítem que se está editando, o null si es uno nuevo. */
    editando: number | null;
    textoBoton: string;
    /** Color de la propuesta para el botón (vacío = azul de marca). */
    claseBoton?: string;
    puedeAgregar: boolean;
    motivoNoAgregar: string | null;
    onAgregar: () => void;
    onCancelarEdicion?: () => void;
}

export interface ItemResumen {
    idTemp: string;
    nombre: string;
    detalle: string;
    /** Subtotal con AIU, antes de IVA. */
    subtotal: number;
}

interface Props {
    este: EsteProducto | null;
    etiquetaPropuesta: string;
    items: ItemResumen[];
    idEditando: string | null;
    onEditarItem: (idTemp: string) => void;
    onVerPropuesta: () => void;
    manoObra: LineaManoObra[];
    cargandoManoObra: boolean;
    cargos: EstadoCargos;
    onCambiarCargos: (v: EstadoCargos) => void;
    parametros: Parametros | null;
    /** Motivo por el que los cargos no se editan (propuesta aprobada o legada). */
    bloqueoCargos: string | null;
    totales: TotalesPrevistos;
    descuentoPct: number;
    /** Aclaración bajo el total (p. ej. que incluye el producto en pantalla). */
    notaTotal: string | null;
}

const nuevaKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const campoNum =
    'h-8 rounded-lg border border-slate-300 bg-white px-2 text-right text-[13px] text-slate-900 tabular-nums ' +
    'hover:border-slate-400 focus:outline-none focus:border-templex-500 focus:ring-2 focus:ring-templex-200 ' +
    'disabled:bg-slate-50 disabled:text-slate-500';

const Bloque: React.FC<{ titulo: string; nota?: React.ReactNode; className?: string; children: React.ReactNode }> = ({
    titulo, nota, className = '', children,
}) => (
    <section className={`px-4 py-3.5 border-b border-slate-200 last:border-b-0 ${className}`}>
        <div className="flex items-baseline justify-between gap-2 mb-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-600">{titulo}</h3>
            {nota && <span className="text-[11.5px] text-slate-600">{nota}</span>}
        </div>
        {children}
    </section>
);

/** Indicador del cálculo automático. El texto va siempre: el color no es el
 * único portador del estado. */
export const EstadoPrecio: React.FC<{ este: EsteProducto }> = ({ este }) => {
    const e = este.estado;
    if (este.recalculando || e?.tipo === 'calculando') {
        return (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-templex-700">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculando…
            </span>
        );
    }
    if (e?.tipo === 'incompleto') {
        return <span className="text-[12px] font-semibold text-slate-700">Completa: {e.faltante}</span>;
    }
    if (e?.tipo === 'error') {
        return (
            <span className="inline-flex items-start gap-1.5 text-[12px] font-semibold text-rose-700">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {e.mensaje}
            </span>
        );
    }
    if (este.hayErrores) {
        return (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-rose-700">
                <AlertCircle className="w-3.5 h-3.5" /> Hay líneas en error en el despiece
            </span>
        );
    }
    if (este.total !== null) {
        return (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" /> Precio al día
            </span>
        );
    }
    // Sin estado ni precio: se acaba de agregar un ítem (o se abrió la pestaña)
    // con el formulario ya lleno. El precio vuelve al cambiar un campo.
    if (!e) {
        return <span className="text-[12px] text-slate-700">Cambia un dato o pulsa "Calcular ahora" para cotizar otro.</span>;
    }
    return null;
};

// ─── Cargos compactos y editables ───────────────────────────────────────────

/** "Predeterminado" o "Editado · Restablecer $90.000": que el asesor vea si
 * el valor es el de Configuración o uno que escribió él. */
const Origen: React.FC<{ valor: number; predeterminado: number; onRestablecer: () => void; deshabilitado: boolean }> = ({
    valor, predeterminado, onRestablecer, deshabilitado,
}) => (valor === predeterminado ? (
    <Chip tono="marca">Predeterminado</Chip>
) : (
    <span className="inline-flex items-center gap-1.5">
        <Chip tono="neutro">Editado</Chip>
        {!deshabilitado && predeterminado > 0 && (
            <button type="button" onClick={onRestablecer} className="text-[11.5px] font-semibold text-templex-700 hover:underline">
                Restablecer {fmtCOP(predeterminado)}
            </button>
        )}
    </span>
));

const FilaCargo: React.FC<{
    id: string;
    titulo: string;
    activo: boolean;
    total: number;
    deshabilitado: boolean;
    onToggle: (v: boolean) => void;
    children?: React.ReactNode;
}> = ({ id, titulo, activo, total, deshabilitado, onToggle, children }) => (
    <div className="py-1.5">
        <div className="flex items-center gap-2">
            <input
                id={id}
                type="checkbox"
                checked={activo}
                disabled={deshabilitado}
                onChange={e => onToggle(e.target.checked)}
                className="w-[17px] h-[17px] accent-templex-600 shrink-0"
            />
            <label htmlFor={id} className={`flex-1 min-w-0 text-[13px] cursor-pointer ${activo ? 'font-semibold text-slate-900' : 'text-slate-800'}`}>
                {titulo}
            </label>
            <span className={`text-[12.5px] tabular-nums whitespace-nowrap ${activo ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>
                {activo ? fmtCOP(total) : '—'}
            </span>
        </div>
        {activo && children && (
            <div className="mt-1.5 ml-[25px] flex flex-wrap items-center gap-1.5 text-[12px] text-slate-700">{children}</div>
        )}
    </div>
);

/** También la usa la hoja de Resumen (2026-10-01): un solo editor de cargos. */
export const CargosCompactos: React.FC<{
    cargos: EstadoCargos;
    onChange: (v: EstadoCargos) => void;
    parametros: Parametros | null;
    deshabilitado: boolean;
}> = ({ cargos, onChange, parametros, deshabilitado }) => {
    const set = (cambios: Partial<EstadoCargos>) => onChange({ ...cargos, ...cambios });
    const num = (v: string) => Math.max(0, Number(v) || 0);
    const pAndamio = Number(parametros?.alquiler_andamio) || 0;
    const pHuacal = Number(parametros?.huacal) || 0;
    const pFlete = Number(parametros?.flete_fijo) || 0;
    const { andamio, huacal, flete, otros } = cargos;
    const cambiarOtro = (i: number, cambios: Partial<LineaOtroCargo>) => {
        const lista = [...otros];
        lista[i] = { ...lista[i], ...cambios };
        set({ otros: lista });
    };

    return (
        <div>
            <FilaCargo
                id="resumen-cargo-andamio"
                titulo="Alquiler de andamio"
                activo={andamio.activo}
                total={(Number(andamio.dias) || 0) * (Number(andamio.valorUnitario) || 0)}
                deshabilitado={deshabilitado}
                onToggle={v => set({ andamio: { ...andamio, activo: v } })}
            >
                <input
                    type="number" min={1} step={1} aria-label="Días de andamio" disabled={deshabilitado}
                    className={`${campoNum} w-14`} value={andamio.dias || ''}
                    onChange={e => set({ andamio: { ...andamio, dias: num(e.target.value) } })}
                />
                días ×
                <input
                    type="number" min={0} step={1000} aria-label="Valor por día de andamio" disabled={deshabilitado}
                    className={`${campoNum} w-[104px]`} value={andamio.valorUnitario || ''} placeholder="0"
                    onChange={e => set({ andamio: { ...andamio, valorUnitario: num(e.target.value) } })}
                />
                <Origen
                    valor={Number(andamio.valorUnitario) || 0} predeterminado={pAndamio} deshabilitado={deshabilitado}
                    onRestablecer={() => set({ andamio: { ...andamio, valorUnitario: pAndamio } })}
                />
            </FilaCargo>

            <FilaCargo
                id="resumen-cargo-huacal"
                titulo="Huacal / embalaje"
                activo={huacal.activo}
                total={(Number(huacal.unidades) || 0) * (Number(huacal.valorUnitario) || 0)}
                deshabilitado={deshabilitado}
                onToggle={v => set({ huacal: { ...huacal, activo: v } })}
            >
                <input
                    type="number" min={1} step={1} aria-label="Unidades de huacal" disabled={deshabilitado}
                    className={`${campoNum} w-14`} value={huacal.unidades || ''}
                    onChange={e => set({ huacal: { ...huacal, unidades: num(e.target.value) } })}
                />
                und ×
                <input
                    type="number" min={0} step={1000} aria-label="Valor por unidad de huacal" disabled={deshabilitado}
                    className={`${campoNum} w-[104px]`} value={huacal.valorUnitario || ''} placeholder="0"
                    onChange={e => set({ huacal: { ...huacal, valorUnitario: num(e.target.value) } })}
                />
                <Origen
                    valor={Number(huacal.valorUnitario) || 0} predeterminado={pHuacal} deshabilitado={deshabilitado}
                    onRestablecer={() => set({ huacal: { ...huacal, valorUnitario: pHuacal } })}
                />
            </FilaCargo>

            <FilaCargo
                id="resumen-cargo-flete"
                titulo="Acarreo / flete"
                activo={flete.activo}
                total={Number(flete.valor) || 0}
                deshabilitado={deshabilitado}
                onToggle={v => set({ flete: { ...flete, activo: v } })}
            >
                Valor
                <input
                    type="number" min={0} step={1000} aria-label="Valor del flete" disabled={deshabilitado}
                    className={`${campoNum} w-[104px]`} value={flete.valor || ''} placeholder="0"
                    // Tocarlo lo pasa a MANUAL: el backend guarda el origen tal como llega.
                    onChange={e => set({ flete: { ...flete, valor: num(e.target.value), origen: 'MANUAL' } })}
                />
                <Origen
                    valor={Number(flete.valor) || 0} predeterminado={pFlete} deshabilitado={deshabilitado}
                    onRestablecer={() => set({ flete: { ...flete, valor: pFlete, origen: 'SUGERIDO' } })}
                />
            </FilaCargo>

            {otros.map((o, i) => (
                <div key={o.key} className="py-1.5 flex flex-wrap items-center gap-1.5">
                    <input
                        type="text" maxLength={200} placeholder="Descripción del servicio" disabled={deshabilitado}
                        aria-label={`Descripción del servicio adicional ${i + 1}`}
                        className="h-8 flex-1 min-w-[140px] rounded-lg border border-slate-300 bg-white px-2 text-[13px] text-slate-900 hover:border-slate-400 focus:outline-none focus:border-templex-500 focus:ring-2 focus:ring-templex-200"
                        value={o.descripcion}
                        onChange={e => cambiarOtro(i, { descripcion: e.target.value })}
                    />
                    <input
                        type="number" min={0} step={1000} placeholder="0" disabled={deshabilitado}
                        aria-label={`Valor del servicio adicional ${i + 1}`}
                        className={`${campoNum} w-[104px]`} value={o.valor || ''}
                        onChange={e => cambiarOtro(i, { valor: num(e.target.value) })}
                    />
                    <button
                        type="button" disabled={deshabilitado}
                        onClick={() => set({ otros: otros.filter(x => x.key !== o.key) })}
                        aria-label={`Quitar el servicio adicional ${i + 1}`} title="Quitar"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            ))}

            <button
                type="button"
                disabled={deshabilitado}
                onClick={() => set({ otros: [...otros, { key: nuevaKey(), descripcion: '', valor: 0, aplicaIva: true }] })}
                className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-semibold text-templex-700 hover:text-templex-800 disabled:opacity-40"
            >
                <Plus className="w-3.5 h-3.5" /> Otro servicio
            </button>
        </div>
    );
};

// ─── Panel ──────────────────────────────────────────────────────────────────

const ResumenPropuesta: React.FC<Props> = ({
    este, etiquetaPropuesta, items, idEditando, onEditarItem, onVerPropuesta,
    manoObra, cargandoManoObra, cargos, onCambiarCargos, parametros, bloqueoCargos,
    totales, descuentoPct, notaTotal,
}) => {
    const botonAgregar = este && (
        <BotonPrimario
            ancho
            icono={este.editando ? Save : Plus}
            onClick={este.onAgregar}
            disabled={!este.puedeAgregar}
            title={este.motivoNoAgregar ?? undefined}
            claseColor={este.claseBoton || undefined}
            className="py-3"
        >
            {este.textoBoton}
        </BotonPrimario>
    );

    return (
        <>
            <aside
                aria-label={`Resumen de la Opción ${etiquetaPropuesta}`}
                className="bg-white border border-slate-200 rounded-2xl shadow-card overflow-hidden xl:sticky xl:top-3 xl:max-h-[calc(100vh-1.5rem)] xl:overflow-y-auto"
            >
                {/* ── 1 · Este producto ─────────────────────────────────── */}
                {este && (
                    <section className="px-4 pt-3.5 pb-4 border-b border-slate-200 bg-gradient-to-b from-templex-50 to-white">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                                {este.editando ? `Editando el ítem ${este.editando}` : 'Este producto'}
                            </h3>
                            <span className="text-[12px] font-semibold text-slate-800 tabular-nums">
                                {este.piezas} und
                            </span>
                        </div>
                        <p className="mt-1.5 text-[14px] font-bold text-slate-900 leading-snug">{este.nombre}</p>
                        {(este.detalle || este.nivelCorte) && (
                            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-slate-700 leading-snug">
                                {este.detalle}
                                {este.nivelCorte && <Chip tono="marca">Nivel {este.nivelCorte}</Chip>}
                            </p>
                        )}
                        <div className="mt-3 flex items-baseline justify-between gap-2">
                            <span className="text-[28px] font-extrabold text-slate-900 tabular-nums leading-none tracking-tight">
                                {este.total !== null ? fmtCOP(este.total) : '—'}
                            </span>
                            <span className="text-[11.5px] text-slate-600">con IVA</span>
                        </div>
                        {este.subtotalConAiu !== null && (
                            <p className="mt-1 text-[11.5px] text-slate-700 tabular-nums">
                                {fmtCOP(este.subtotalConAiu)} + IVA {fmtCOP(este.iva ?? 0)} · sin mano de obra ni cargos
                            </p>
                        )}
                        <div className="mt-1.5 min-h-[18px]"><EstadoPrecio este={este} /></div>
                        <div className="mt-3 space-y-1.5">
                            {botonAgregar}
                            {este.motivoNoAgregar && este.total !== null && (
                                <p className="text-[11.5px] text-slate-700 text-center">{este.motivoNoAgregar}</p>
                            )}
                            {este.editando && este.onCancelarEdicion && (
                                <BotonSecundario ancho compacto icono={X} onClick={este.onCancelarEdicion}>
                                    Cancelar edición
                                </BotonSecundario>
                            )}
                        </div>
                    </section>
                )}

                {/* ── 2 · La propuesta ──────────────────────────────────── */}
                <Bloque
                    titulo={`Opción ${etiquetaPropuesta}`}
                    nota={`${items.length} ítem${items.length === 1 ? '' : 's'} · antes de IVA`}
                >
                    {items.length === 0 ? (
                        <p className="text-[12.5px] text-slate-700">Todavía no hay productos. Configura uno y pulsa Agregar.</p>
                    ) : (
                        <ol className="space-y-0.5">
                            {items.map((it, i) => {
                                const editandoEste = idEditando === it.idTemp;
                                return (
                                    <li key={it.idTemp}>
                                        <button
                                            type="button"
                                            onClick={() => onEditarItem(it.idTemp)}
                                            title="Editar este ítem"
                                            className={`group w-full grid grid-cols-[18px_minmax(0,1fr)_auto] gap-2 items-baseline rounded-lg px-1.5 py-1.5 text-left ${editandoEste ? 'bg-templex-50 ring-1 ring-templex-200' : 'hover:bg-slate-50'}`}
                                        >
                                            <span className="text-[12px] text-slate-600 tabular-nums">{i + 1}</span>
                                            <span className="min-w-0">
                                                <span className="block text-[12.5px] font-semibold text-slate-900 leading-snug line-clamp-2" title={it.nombre}>{it.nombre}</span>
                                                {it.detalle && <span className="block text-[11.5px] text-slate-700 truncate">{it.detalle}</span>}
                                            </span>
                                            <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-slate-900 tabular-nums">
                                                {/* Siempre visible (2026-09-27): sin él nada decía que el ítem
                                                    se edita con un clic, y al reabrir una cotización parecía
                                                    que había que empezar de cero. */}
                                                <Pencil
                                                    aria-hidden
                                                    className={`w-3 h-3 ${editandoEste ? 'text-templex-700' : 'text-slate-500 group-hover:text-templex-700'}`}
                                                />
                                                {fmtCOP(it.subtotal)}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                    {items.length > 0 && (
                        <button type="button" onClick={onVerPropuesta} className="mt-1.5 text-[12px] font-semibold text-templex-700 hover:underline">
                            Cliente, descuento y detalle en Resumen
                        </button>
                    )}
                </Bloque>

                {/* ── 3 · Mano de obra ──────────────────────────────────── */}
                <Bloque
                    titulo="Mano de obra"
                    nota={cargandoManoObra
                        ? <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> calculando</span>
                        : 'automática · con AIU'}
                >
                    {manoObra.length === 0 ? (
                        <p className="text-[12.5px] text-slate-700 leading-snug">
                            Se calcula sola: ensamble de ventanas y proyectantes, e instalación de lo que lleve
                            "Con instalación".
                        </p>
                    ) : (
                        <ul className="space-y-1.5">
                            {manoObra.map(l => (
                                <li key={`${l.tipo}-${l.descripcion}`} className="flex items-start justify-between gap-2">
                                    <span className="min-w-0">
                                        <span className="block text-[13px] text-slate-900">{l.descripcion}</span>
                                        {l.explicacion && <span className="block text-[11.5px] text-slate-700">{l.explicacion}</span>}
                                    </span>
                                    <span className="text-[13px] font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                                        {fmtCOP(totalLineaManoObra(l))}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </Bloque>

                {/* ── 4 · Cargos de obra ────────────────────────────────── */}
                <Bloque titulo="Cargos de la obra" nota="una vez por propuesta">
                    {bloqueoCargos && (
                        <p className="mb-2 flex items-start gap-1.5 text-[12px] text-slate-800">
                            <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {bloqueoCargos}
                        </p>
                    )}
                    <CargosCompactos
                        cargos={cargos}
                        onChange={onCambiarCargos}
                        parametros={parametros}
                        deshabilitado={Boolean(bloqueoCargos)}
                    />
                </Bloque>

                {/* ── 5 · Total y guardar ───────────────────────────────── */}
                <section className="px-4 py-3.5 bg-slate-50" aria-live="polite">
                    <dl className="space-y-1 text-[13px]">
                        <div className="flex justify-between gap-2"><dt className="text-slate-800">Productos (con AIU)</dt><dd className="tabular-nums text-slate-900">{fmtCOP(totales.productos)}</dd></div>
                        <div className="flex justify-between gap-2"><dt className="text-slate-800">Mano de obra (con AIU)</dt><dd className="tabular-nums text-slate-900">{fmtCOP(totales.manoObra)}</dd></div>
                        {totales.descuento > 0 && (
                            <div className="flex justify-between gap-2"><dt className="text-slate-800">Descuento ({fmtPct(descuentoPct)})</dt><dd className="tabular-nums text-rose-700">− {fmtCOP(totales.descuento)}</dd></div>
                        )}
                        <div className="flex justify-between gap-2"><dt className="text-slate-800">Cargos de obra</dt><dd className="tabular-nums text-slate-900">{fmtCOP(totales.cargos)}</dd></div>
                        <div className="flex justify-between gap-2"><dt className="text-slate-800">IVA</dt><dd className="tabular-nums text-slate-900">{fmtCOP(totales.iva)}</dd></div>
                    </dl>
                    <div className="mt-2.5 pt-2.5 border-t border-slate-300 flex items-baseline justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-900">Total opción</span>
                        <span className="text-[26px] font-extrabold text-slate-900 tabular-nums tracking-tight leading-none">{fmtCOP(totales.total)}</span>
                    </div>
                    {notaTotal && <p className="mt-1.5 text-[11.5px] text-slate-700 leading-snug">{notaTotal}</p>}
                </section>
            </aside>

            {/* Barra fija para tablet y teléfono: el resumen queda al final de la
                página y aquí se mantienen el total y la acción principal. */}
            <div className="xl:hidden fixed inset-x-0 bottom-0 z-30 bg-white border-t border-slate-200 shadow-[0_-10px_28px_-14px_rgba(17,22,32,0.35)] px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))] flex items-center gap-3">
                <div className="min-w-0 leading-tight">
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">Total Opción {etiquetaPropuesta}</span>
                    <span className="block text-[20px] font-extrabold text-slate-900 tabular-nums">{fmtCOP(totales.total)}</span>
                </div>
                {este && (
                    <div className="ml-auto">
                        <BotonPrimario
                            icono={este.editando ? Save : Plus}
                            onClick={este.onAgregar}
                            disabled={!este.puedeAgregar}
                            claseColor={este.claseBoton || undefined}
                        >
                            {este.editando ? 'Guardar ítem' : 'Agregar'}
                        </BotonPrimario>
                    </div>
                )}
            </div>
        </>
    );
};

export default ResumenPropuesta;
