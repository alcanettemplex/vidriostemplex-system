import React, { useEffect, useRef, useState } from 'react';
import { PencilRuler, Lock } from '../../../components/ui/icons';
import { toast } from 'react-toastify';

import {
    ItemCarrito, LineaBOM, ModuloMeta, PersonalizacionItem, ResultadoCalculo as TResultadoCalculo, SegmentoCliente,
} from '../types';
import { apiCotizarItem } from '../services/cotizadorApi';
import FormularioModulo, { EstadoCalculo } from './FormularioModulo';
import ResultadoCalculo from './ResultadoCalculo';
import ModalComponente, { AccionComponente } from './modals/ModalComponente';
import DiagramaProducto from './DiagramaProducto';
import SelectorProducto from './SelectorProducto';
import { EsteProducto, EstadoPrecio } from './ResumenPropuesta';
import { usePlanoPrevisualizacion } from '../hooks/usePlano';
import { colorPropuesta, rotuloPropuesta } from '../propuestaColor';
import { BorradorCotizar } from '../totalesPropuesta';
import { descripcionDeItem, leerFicha } from '../fichaProducto';
import { descripcionComercial } from '../descripcionesModulo';

// ─────────────────────────────────────────────────────────────────────────────
// Pestaña "Cotizar" — el configurador.
//
// Dos columnas que se ven a la vez en escritorio: CONFIGURACIÓN a la izquierda
// (2/5) y RESULTADO a la derecha (3/5). Antes del rediseño (2026-09-20) el
// resultado vivía debajo del formulario y el vendedor tenía que bajar para
// saber cuánto costaba lo que acababa de armar; ahora el precio nunca sale de
// la pantalla.
//
// El panel derecho NUNCA desaparece: sin cálculo todavía explica qué falta, en
// vez de dejar medio lienzo en blanco que parece una pantalla rota.
//
// Sigue sin guardar nada: cada cálculo es local hasta que se pulsa "Agregar",
// y quien es dueño del carrito y de la propuesta activa es CotizadorPage.
//
// MODO EDICIÓN (2026-09-23): cuando Actual manda a editar un ítem, el
// formulario se abre con su input y el botón pasa a "Guardar cambios en el
// ítem N", que lo reemplaza EN SU POSICIÓN. El segmento ya no es un campo del
// formulario: es el de la cotización, que llega por `segmento`.
//
// DESTINO VISIBLE (2026-09-23): una franja del color de la propuesta dice arriba
// para cuál se está cotizando, y el botón "Agregar a Propuesta B" lleva ese
// mismo color. Antes era una línea gris de 12px que el usuario no vio. Y si
// cambia el tipo de cliente con un ítem calculado sin agregar, ese ítem se
// recalcula solo en vez de perderse.
//
// MESA DE TRABAJO (2026-09-26, rediseño integral — arquitectura A, elegida
// por el usuario sobre una maqueta): seleccionar → configurar → revisar →
// guardar sin bajar la página.
//   · Riel izquierdo: los productos (SelectorProducto).
//   · Centro: el formulario agrupado y el plano, y debajo los avisos técnicos
//     y el despiece PLEGADO (ResultadoCalculo). El precio se recalcula SOLO al
//     cambiar un campo (FormularioModulo); el botón queda como "Calcular ahora".
//   · Derecha, siempre visible: el resumen de la propuesta (ResumenPropuesta),
//     que dibuja CotizadorPage con `renderResumen` — aquí solo se le pasa lo
//     que este componente sabe: el producto en pantalla y su botón Agregar.
// La franja "Estás cotizando para…", los pasos numerados y el panel de cargos a
// lo ancho salieron: la barra de trabajo ya dice la propuesta y el tipo de
// cliente, y los cargos viven en el resumen. Nada de la lógica cambió.
// ─────────────────────────────────────────────────────────────────────────────

/** Deja fuera los arreglos vacíos; null si no queda nada (el ítem vuelve a ser
 * estándar y el input no carga una clave vacía). */
function limpiarPersonalizacion(p: PersonalizacionItem | null): PersonalizacionItem | null {
    if (!p) return null;
    const r: PersonalizacionItem = {};
    if (p.cambios?.length) r.cambios = p.cambios;
    if (p.quitados?.length) r.quitados = p.quitados;
    if (p.extras?.length) r.extras = p.extras;
    return Object.keys(r).length ? r : null;
}

/** Ítem del carrito que se está editando, con su posición para el rótulo. */
export interface ItemEnEdicion {
    item: ItemCarrito;
    posicion: number;
}

interface Props {
    modulos: ModuloMeta[];
    segmento: SegmentoCliente;
    onAgregarItem: (item: ItemCarrito) => void;
    edicion: ItemEnEdicion | null;
    onGuardarEdicion: (item: ItemCarrito) => void;
    onCancelarEdicion: () => void;
    /** Motivo por el que no se puede agregar ni editar (propuesta elegida de una
     * cotización aprobada). null = se puede. */
    bloqueo: string | null;
    /** Propuesta a la que se agregará lo que se calcule aquí. */
    destino: { etiqueta: string; nombre: string | null };
    /** Avisa al padre qué producto calculado hay en pantalla (o null), para el
     * total en vivo del resumen. Debe ser estable (un setState). */
    onBorrador?: (b: BorradorCotizar | null) => void;
    /** Columna derecha: el resumen de la propuesta, dibujado por CotizadorPage
     * con lo que aquí se sabe del producto en pantalla. */
    renderResumen: (este: EsteProducto) => React.ReactNode;
}

const TabCotizar: React.FC<Props> = ({
    modulos, segmento, onAgregarItem, edicion, onGuardarEdicion, onCancelarEdicion, bloqueo, destino,
    onBorrador, renderResumen,
}) => {
    const [moduloId, setModuloId] = useState<string>(edicion?.item.moduloId ?? modulos[0]?.id ?? '');
    const [ultimoInput, setUltimoInput] = useState<Record<string, unknown> | null>(null);
    const [ultimoResultado, setUltimoResultado] = useState<TResultadoCalculo | null>(null);
    /** Componentes cambiados / quitados / agregados del ítem en configuración. */
    const [personalizacion, setPersonalizacion] = useState<PersonalizacionItem | null>(null);
    const [recalculando, setRecalculando] = useState(false);
    const [modalComponente, setModalComponente] = useState<{ modo: 'cambiar' | 'agregar'; linea?: LineaBOM } | null>(null);
    /** Estado del cálculo automático del formulario (incompleto, calculando…). */
    const [estadoCalculo, setEstadoCalculo] = useState<EstadoCalculo | null>(null);

    // La lista de módulos llega del padre de forma asíncrona: si al montar
    // todavía estaba vacía, se elige el primero en cuanto aparece.
    useEffect(() => {
        if (!moduloId && modulos.length > 0) setModuloId(modulos[0].id);
    }, [modulos, moduloId]);

    // Entrar a editar otro ítem: su módulo y un lienzo limpio.
    const idEdicion = edicion?.item.idTemp ?? null;
    useEffect(() => {
        if (!edicion) return;
        setModuloId(edicion.item.moduloId);
        setUltimoInput(null);
        setUltimoResultado(null);
        setEstadoCalculo(null);
        setPersonalizacion(limpiarPersonalizacion(
            (edicion.item.input.personalizacion as PersonalizacionItem | undefined) ?? null
        ));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idEdicion]);

    const moduloActivo = modulos.find(m => m.id === moduloId) || null;

    // Producto en pantalla → total en vivo del paso 3. Uno con errores no se
    // cuenta: todavía no se puede agregar y su precio no es confiable.
    const idTempEditado = edicion?.item.idTemp ?? null;
    useEffect(() => {
        if (!onBorrador) return;
        const r = ultimoResultado;
        onBorrador(r && ultimoInput && moduloActivo && !r.hayErrores
            ? {
                moduloId: moduloActivo.id,
                input: ultimoInput,
                subtotalConAiu: Number(r.subtotalConAiu) || 0,
                iva: Number(r.iva) || 0,
                total: Number(r.total) || 0,
                reemplazaIdTemp: idTempEditado,
            }
            : null);
    }, [ultimoResultado, ultimoInput, moduloActivo, idTempEditado, onBorrador]);
    useEffect(() => () => onBorrador?.(null), [onBorrador]);

    // Un resultado calculado con otro tipo de cliente ya no vale: sus precios son
    // de otra lista, y el backend lo rechazaría al guardar. Antes se descartaba
    // y el vendedor tenía que volver a pulsar Calcular; ahora se recalcula solo
    // con el mismo input (y su personalización). Sólo si eso falla se descarta.
    const recalculandoSegmento = useRef(false);
    useEffect(() => {
        if (!ultimoInput || ultimoInput.segmentoCliente === segmento || !moduloActivo) return;
        if (recalculandoSegmento.current) return;
        recalculandoSegmento.current = true;
        const input = { ...ultimoInput, segmentoCliente: segmento };
        setRecalculando(true);
        apiCotizarItem(moduloActivo.id, input)
            .then(({ data }) => {
                setUltimoResultado(data);
                setUltimoInput(input);
            })
            .catch(() => {
                setUltimoResultado(null);
                setUltimoInput(null);
                toast.warn('No se pudo recalcular el ítem en curso con el tipo de cliente nuevo: vuelve a pulsar Calcular.');
            })
            .finally(() => {
                recalculandoSegmento.current = false;
                setRecalculando(false);
            });
    }, [segmento, ultimoInput, moduloActivo]);

    const cambiarModulo = (id: string) => {
        if (edicion && id !== edicion.item.moduloId) onCancelarEdicion();
        setModuloId(id);
        setUltimoInput(null);
        setUltimoResultado(null);
        setEstadoCalculo(null);
        setPersonalizacion(null);
    };

    /** Recalcula el ítem en el servidor con otra personalización. Si falla, se
     * queda todo como estaba: el vendedor ve el error y el despiece anterior. */
    const recalcularCon = async (nueva: PersonalizacionItem | null) => {
        if (!ultimoInput || !moduloActivo) return;
        const p = limpiarPersonalizacion(nueva);
        const input: Record<string, unknown> = { ...ultimoInput };
        delete input.personalizacion;
        if (p) input.personalizacion = p;
        setRecalculando(true);
        try {
            const { data } = await apiCotizarItem(moduloActivo.id, input);
            setUltimoResultado(data);
            setUltimoInput(input);
            setPersonalizacion(p);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo recalcular el ítem con ese cambio.');
        } finally {
            setRecalculando(false);
        }
    };

    const p = personalizacion ?? {};
    const acciones = {
        ocupado: recalculando,
        onCambiar: (linea: LineaBOM) => setModalComponente({ modo: 'cambiar', linea }),
        onAgregar: () => setModalComponente({ modo: 'agregar' }),
        onRestaurar: (codigo: string) => recalcularCon({ ...p, quitados: (p.quitados ?? []).filter(q => q !== codigo) }),
        onDeshacerCambio: (de: string) => recalcularCon({ ...p, cambios: (p.cambios ?? []).filter(c => c.de !== de) }),
        onQuitar: (linea: LineaBOM) => {
            if (linea.personalizada === 'agregada') {
                const extras = [...(p.extras ?? [])];
                const i = extras.findIndex(x => x.codigo.toUpperCase() === linea.codigo.toUpperCase());
                if (i >= 0) extras.splice(i, 1);
                recalcularCon({ ...p, extras });
                return;
            }
            // Quitar una línea ya cambiada = quitar el componente ORIGINAL.
            const original = typeof linea.codigoOriginal === 'string' ? linea.codigoOriginal : linea.codigo;
            recalcularCon({
                ...p,
                cambios: (p.cambios ?? []).filter(c => c.de !== original),
                quitados: [...(p.quitados ?? []).filter(q => q !== original), original],
            });
        },
    };

    const alConfirmarComponente = (accion: AccionComponente) => {
        setModalComponente(null);
        if (accion.tipo === 'cambio') {
            const cambio = { de: accion.de, a: accion.a, ...(accion.costo !== undefined ? { costo: accion.costo } : {}) };
            recalcularCon({ ...p, cambios: [...(p.cambios ?? []).filter(c => c.de !== accion.de), cambio] });
        } else {
            recalcularCon({ ...p, extras: [...(p.extras ?? []), accion.extra] });
        }
    };

    const handleResultado = (resultado: TResultadoCalculo, input: Record<string, unknown>) => {
        setUltimoResultado(resultado);
        setUltimoInput(input);
    };

    const confirmar = () => {
        if (!ultimoResultado || !ultimoInput || !moduloActivo || bloqueo) return;
        const item: ItemCarrito = {
            idTemp: edicion?.item.idTemp ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            moduloId: moduloActivo.id,
            moduloNombre: moduloActivo.nombre,
            // El nombre que escribió el vendedor, si su módulo lo pide (hoy solo
            // "Ítem libre" declara `descripcionItem`). Antes esto era `null` fijo
            // y TODOS los ítems caían al fallback `"<modulo> #N"` de
            // cotizacionStore; con un ítem libre eso le llegaría al cliente como
            // "item-libre #3" en vez de "Fachada oficina 2º piso". Es genérico:
            // cualquier módulo que declare el campo gana nombre propio.
            descripcionItem: typeof ultimoInput.descripcionItem === 'string' && ultimoInput.descripcionItem.trim()
                ? ultimoInput.descripcionItem.trim()
                : null,
            input: ultimoInput,
            resultado: ultimoResultado,
        };
        if (edicion) {
            onGuardarEdicion(item);
            // `info`: el ítem cambió en pantalla, no en la base (el título de
            // `success` es "Guardado").
            toast.info(`Ítem ${edicion.posicion} actualizado. Recuerda guardar (Ctrl+S).`);
        } else {
            // El aviso lo da CotizadorPage, que sabe cuántos ítems lleva la
            // propuesta y puede ofrecer "Ver propuesta".
            onAgregarItem(item);
        }
        setUltimoResultado(null);
        setUltimoInput(null);
        setPersonalizacion(null);
        setEstadoCalculo(null);
    };

    const disenoId = typeof ultimoInput?.disenoId === 'string' ? ultimoInput.disenoId : undefined;
    const anchoCm = Number(ultimoInput?.anchoCm ?? ultimoInput?.anchoNaveCm) || undefined;
    const altoCm = Number(ultimoInput?.altoCm ?? ultimoInput?.altoNaveCm) || undefined;
    const { plano, cargando: cargandoPlano } = usePlanoPrevisualizacion(disenoId, anchoCm, altoCm);

    const hayResultado = Boolean(ultimoResultado && ultimoInput);
    const color = colorPropuesta(destino.etiqueta);
    const rotulo = rotuloPropuesta({ etiqueta: destino.etiqueta, nombre: destino.nombre });

    // ── Lo que el resumen de la derecha necesita saber de este producto ─────
    const ficha = leerFicha(ultimoInput, ultimoResultado, moduloActivo);
    const pendiente = estadoCalculo?.tipo === 'calculando' || estadoCalculo?.tipo === 'incompleto' || estadoCalculo?.tipo === 'error';
    const hayErrores = Boolean(ultimoResultado?.hayErrores);
    const motivoNoAgregar = bloqueo
        ?? (!hayResultado ? null
            : hayErrores ? 'Corrige las líneas en rojo del despiece para poder agregarlo.'
            : pendiente || recalculando ? 'Espera a que termine el cálculo.'
            : null);
    const este: EsteProducto = {
        nombre: moduloActivo
            ? `${moduloActivo.nombre}${ficha.medidas ? ` · ${ficha.medidas}` : ''}`
            : 'Elige un producto',
        detalle: hayResultado ? descripcionDeItem(ultimoInput, ultimoResultado, moduloActivo, moduloActivo?.nombre ?? '') : '',
        nivelCorte: hayResultado ? ficha.nivelCorte : null,
        piezas: ficha.piezas,
        subtotalConAiu: ultimoResultado ? Number(ultimoResultado.subtotalConAiu) || 0 : null,
        iva: ultimoResultado ? Number(ultimoResultado.iva) || 0 : null,
        total: ultimoResultado ? Number(ultimoResultado.total) || 0 : null,
        // Sin estado y sin resultado: acaba de agregarse o de abrirse. Se dice
        // qué hacer en vez de dejar el bloque en blanco.
        estado: estadoCalculo,
        recalculando,
        hayErrores,
        editando: edicion ? edicion.posicion : null,
        textoBoton: edicion ? `Guardar cambios en el ítem ${edicion.posicion}` : `Agregar a la ${rotulo}`,
        claseBoton: edicion ? undefined : color.boton,
        puedeAgregar: hayResultado && !hayErrores && !bloqueo && !pendiente && !recalculando,
        motivoNoAgregar,
        onAgregar: confirmar,
        onCancelarEdicion: edicion ? onCancelarEdicion : undefined,
    };

    return (
        // El fondo `bg-slate-50` lo pone el cuerpo de la carpeta en
        // CotizadorPage. `pb-28` deja sitio a la barra fija de tablet/teléfono.
        <div className="p-3 sm:p-4 pb-28 xl:pb-4">
            <div className="grid gap-4 items-start lg:grid-cols-[190px_minmax(0,1fr)] xl:grid-cols-[190px_minmax(0,1fr)_340px]">
                {/* ── Riel de productos ─────────────────────────────────── */}
                <SelectorProducto modulos={modulos} moduloId={moduloId} onCambiar={cambiarModulo} />

                {/* ── Centro: configurar y revisar ──────────────────────── */}
                <section className="min-w-0 space-y-3" aria-label="Configurar el producto">
                    {bloqueo && (
                        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[12.5px] text-emerald-800">
                            <Lock className="w-4 h-4 mt-0.5 shrink-0" />
                            <p>{bloqueo}</p>
                        </div>
                    )}

                    {moduloActivo && (
                        <div className="bg-white border border-slate-200 rounded-2xl shadow-card">
                            <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5 px-4 pt-4">
                                <div className="min-w-0 basis-72 grow">
                                    <h2 className="text-[19px] font-bold text-slate-900 leading-tight">
                                        {edicion ? `Editando el ítem ${edicion.posicion} · ${moduloActivo.nombre}` : moduloActivo.nombre}
                                    </h2>
                                    <p className="mt-0.5 text-[12.5px] text-slate-700 leading-snug">{descripcionComercial(moduloActivo)}</p>
                                </div>
                                <EstadoPrecio este={este} />
                            </header>

                            <div className="grid gap-5 p-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
                                {/* La `key` incluye el ítem en edición para que el formulario
                                    se remonte con su input. */}
                                <FormularioModulo
                                    key={`${moduloActivo.id}-${idEdicion ?? 'nuevo'}`}
                                    modulo={moduloActivo}
                                    segmento={segmento}
                                    inputInicial={edicion && edicion.item.moduloId === moduloActivo.id ? edicion.item.input : null}
                                    personalizacion={personalizacion}
                                    onResultado={handleResultado}
                                    onEstado={setEstadoCalculo}
                                />

                                {/* Vista técnica: al lado del formulario en pantallas
                                    anchas, debajo en el resto. */}
                                <figure className="m-0 self-start rounded-xl bg-slate-50 border border-slate-200 p-3 2xl:sticky 2xl:top-3">
                                    <figcaption className="flex items-center gap-1.5 mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                                        <PencilRuler className="w-3.5 h-3.5" /> Vista técnica
                                    </figcaption>
                                    {hayResultado ? (
                                        <DiagramaProducto plano={plano} cargando={cargandoPlano} />
                                    ) : (
                                        <p className="py-10 text-center text-[12.5px] text-slate-700 leading-snug">
                                            El plano aparece al completar las medidas.
                                        </p>
                                    )}
                                </figure>
                            </div>
                        </div>
                    )}

                    {/* Avisos técnicos y despiece plegado. */}
                    {hayResultado && (
                        <ResultadoCalculo
                            resultado={ultimoResultado as TResultadoCalculo}
                            acciones={bloqueo ? undefined : acciones}
                        />
                    )}
                </section>

                {/* ── Derecha: resumen de la propuesta, siempre visible ─── */}
                <div className="min-w-0 lg:col-span-2 xl:col-span-1">{renderResumen(este)}</div>
            </div>

            {modalComponente && (
                <ModalComponente
                    modo={modalComponente.modo}
                    linea={modalComponente.linea ?? null}
                    segmento={segmento}
                    onClose={() => setModalComponente(null)}
                    onConfirmar={alConfirmarComponente}
                />
            )}
        </div>
    );
};

export default TabCotizar;
