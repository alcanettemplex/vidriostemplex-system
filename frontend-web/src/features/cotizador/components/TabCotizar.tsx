import React, { useEffect, useRef, useState } from 'react';
import { Plus, Layers, Calculator, PencilRuler, Pencil, X, Save, Lock } from 'lucide-react';
import { toast } from 'react-toastify';

import {
    ItemCarrito, LineaBOM, ModuloMeta, PersonalizacionItem, ResultadoCalculo as TResultadoCalculo, SegmentoCliente,
} from '../types';
import { apiCotizarItem } from '../services/cotizadorApi';
import FormularioModulo from './FormularioModulo';
import ResultadoCalculo from './ResultadoCalculo';
import ModalComponente, { AccionComponente } from './modals/ModalComponente';
import DiagramaProducto from './DiagramaProducto';
import FichaProducto from './FichaProducto';
import SelectorProducto from './SelectorProducto';
import { BotonPrimario, BotonSecundario, EstadoVacio, Tarjeta } from './ui';
import { usePlanoPrevisualizacion } from '../hooks/usePlano';
import { colorPropuesta, rotuloPropuesta } from '../propuestaColor';

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
    /** Panel de cargos de obra, inyectado por el padre: pertenece a la
     * PROPUESTA, no al ítem que se está configurando, y por eso va arriba del
     * todo y no dentro de la columna de configuración. */
    panelCargos?: React.ReactNode;
    /** Propuesta a la que se agregará lo que se calcule aquí. */
    destino: { etiqueta: string; nombre: string | null; items: number; guardada: boolean };
    onVerPropuesta: () => void;
}

const TabCotizar: React.FC<Props> = ({
    modulos, segmento, onAgregarItem, edicion, onGuardarEdicion, onCancelarEdicion, bloqueo, panelCargos, destino,
    onVerPropuesta,
}) => {
    const [moduloId, setModuloId] = useState<string>(edicion?.item.moduloId ?? modulos[0]?.id ?? '');
    const [ultimoInput, setUltimoInput] = useState<Record<string, unknown> | null>(null);
    const [ultimoResultado, setUltimoResultado] = useState<TResultadoCalculo | null>(null);
    /** Componentes cambiados / quitados / agregados del ítem en configuración. */
    const [personalizacion, setPersonalizacion] = useState<PersonalizacionItem | null>(null);
    const [recalculando, setRecalculando] = useState(false);
    const [modalComponente, setModalComponente] = useState<{ modo: 'cambiar' | 'agregar'; linea?: LineaBOM } | null>(null);

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
        setPersonalizacion(limpiarPersonalizacion(
            (edicion.item.input.personalizacion as PersonalizacionItem | undefined) ?? null
        ));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idEdicion]);

    const moduloActivo = modulos.find(m => m.id === moduloId) || null;

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
            recalcularCon({ ...p, cambios: [...(p.cambios ?? []).filter(c => c.de !== accion.de), { de: accion.de, a: accion.a }] });
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
    };

    const disenoId = typeof ultimoInput?.disenoId === 'string' ? ultimoInput.disenoId : undefined;
    const anchoCm = Number(ultimoInput?.anchoCm ?? ultimoInput?.anchoNaveCm) || undefined;
    const altoCm = Number(ultimoInput?.altoCm ?? ultimoInput?.altoNaveCm) || undefined;
    const { plano, cargando: cargandoPlano } = usePlanoPrevisualizacion(disenoId, anchoCm, altoCm);

    const hayResultado = Boolean(ultimoResultado && ultimoInput);
    const color = colorPropuesta(destino.etiqueta);
    const rotulo = rotuloPropuesta({ etiqueta: destino.etiqueta, nombre: destino.nombre });
    const textoBoton = edicion
        ? `Guardar cambios en el ítem ${edicion.posicion}`
        : `Agregar a la ${rotulo}`;

    return (
        // El fondo `bg-slate-50` lo pone el cuerpo de la carpeta en
        // CotizadorPage, para las dos pestañas a la vez. Aquí sería redundante.
        <div className="p-4 space-y-3">
            {/* Destino y cargos van arriba del todo porque no pertenecen al ítem
                que se está configurando sino a la propuesta entera: el flete y la
                mano de obra se cobran una vez, no una por producto. La franja
                lleva el color de la propuesta, el mismo de su pestaña en la barra
                y del botón "Agregar a". */}
            {!edicion && (
                <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-3.5 py-2.5 ${color.franja}`}>
                    <Layers className={`w-4 h-4 shrink-0 ${color.texto}`} />
                    <p className="flex-1 min-w-[240px] text-[13px] leading-snug">
                        Estás cotizando para la <span className="font-extrabold">{rotulo}</span>
                        <span className="opacity-80">
                            {' '}· precios {segmento}
                            {' '}· {destino.items === 0
                                ? 'todavía sin ítems'
                                : `${destino.items} ítem${destino.items === 1 ? '' : 's'}`}
                            {!destino.guardada && ' · sin guardar'}
                        </span>
                    </p>
                    {destino.items > 0 && (
                        <button
                            type="button"
                            onClick={onVerPropuesta}
                            className={`text-[12px] font-bold underline underline-offset-2 ${color.texto}`}
                        >
                            Ver sus ítems
                        </button>
                    )}
                </div>
            )}

            {bloqueo && (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[12.5px] text-emerald-800">
                    <Lock className="w-4 h-4 mt-0.5 shrink-0" />
                    <p>{bloqueo}</p>
                </div>
            )}

            {edicion && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-[12.5px] text-indigo-800">
                    <Pencil className="w-4 h-4 shrink-0" />
                    <p className="flex-1 min-w-[220px]">
                        Editando el <span className="font-bold">ítem {edicion.posicion}</span> ({edicion.item.moduloNombre}).
                        Cambia lo que necesites, pulsa Calcular y luego guarda: el ítem conserva su lugar en la lista.
                    </p>
                    <BotonSecundario compacto icono={X} onClick={onCancelarEdicion}>
                        Cancelar edición
                    </BotonSecundario>
                </div>
            )}

            {/* Cargos de obra (2/5) y producto (3/5): la MISMA rejilla de 5
                columnas que la fila de configuración | resultado de abajo, para
                que los bordes de las cuatro tarjetas caigan en la misma línea
                (2026-09-23; antes esta fila era flex con otro reparto y no
                alineaba). `items-stretch` iguala el alto; en SelectorProducto
                lo absorben las filas de tarjetas. En pantallas angostas se
                apilan. */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 items-stretch">
                <div className="lg:col-span-2 min-w-0">{panelCargos}</div>
                <div className="lg:col-span-3 min-w-0">
                    <SelectorProducto modulos={modulos} moduloId={moduloId} onCambiar={cambiarModulo} />
                </div>
            </div>

            {moduloActivo && (
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 items-start">
                    {/* ── Configuración (2/5) ─────────────────────────────── */}
                    {/* Sin tarjeta envolvente: cada grupo de campos trae la suya
                        (ver FormularioModulo) y anidarlas daría blanco sobre
                        blanco con doble borde. La `key` incluye el ítem en
                        edición para que el formulario se remonte con su input. */}
                    <div className="lg:col-span-2 space-y-3">
                        <FormularioModulo
                            key={`${moduloActivo.id}-${idEdicion ?? 'nuevo'}`}
                            modulo={moduloActivo}
                            segmento={segmento}
                            inputInicial={edicion && edicion.item.moduloId === moduloActivo.id ? edicion.item.input : null}
                            personalizacion={personalizacion}
                            onResultado={handleResultado}
                        />
                    </div>

                    {/* ── Resultado (3/5) ─────────────────────────────────── */}
                    <div className="lg:col-span-3 space-y-3">
                        {hayResultado ? (
                            <>
                                {/* Sólo con resultado (2026-09-23): antes se pintaba
                                    siempre y, sin nada calculado, quedaban dos avisos
                                    vacíos seguidos diciendo lo mismo. El diagrama
                                    resuelve solo "cargando" y "sin plano". */}
                                <Tarjeta titulo="Vista técnica" icono={PencilRuler}>
                                    <DiagramaProducto plano={plano} cargando={cargandoPlano} />
                                </Tarjeta>

                                {/* Ficha y despiece traen su propia Tarjeta: envolverlos
                                    otra vez daría doble borde. */}
                                <FichaProducto
                                    input={ultimoInput as Record<string, unknown>}
                                    resultado={ultimoResultado}
                                    modulo={moduloActivo}
                                />

                                <ResultadoCalculo
                                    resultado={ultimoResultado as TResultadoCalculo}
                                    acciones={bloqueo ? undefined : acciones}
                                />

                                {/* Anclado al fondo de la ventana mientras se recorre
                                    el despiece: con 15-20 líneas de materiales, el
                                    botón quedaba fuera de pantalla justo cuando el
                                    vendedor termina de revisarlas y quiere agregarlo.
                                    La franja de fondo evita que el texto de la tabla
                                    se lea por debajo del botón al desplazarse. */}
                                <div className="sticky bottom-0 -mx-1 px-1 pt-2 pb-1 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent">
                                    <BotonPrimario
                                        ancho
                                        icono={edicion ? Save : Plus}
                                        cargando={recalculando}
                                        onClick={confirmar}
                                        disabled={Boolean(ultimoResultado?.hayErrores || bloqueo)}
                                        title={bloqueo ?? undefined}
                                        claseColor={edicion ? undefined : color.boton}
                                        className="py-3 shadow-lg"
                                    >
                                        {textoBoton}
                                    </BotonPrimario>
                                    {ultimoResultado?.hayErrores && !bloqueo && (
                                        <p className="mt-1.5 text-center text-[11.5px] font-semibold text-rose-600">
                                            Corrige las líneas en rojo del despiece para poder agregar el ítem.
                                        </p>
                                    )}
                                </div>
                            </>
                        ) : (
                            <Tarjeta>
                                <EstadoVacio
                                    icono={Calculator}
                                    titulo={edicion ? 'Recalcula para guardar los cambios' : 'Todavía no hay nada calculado'}
                                    detalle={edicion
                                        ? 'El formulario ya trae los datos del ítem. Ajusta lo que necesites y pulsa Calcular.'
                                        : 'Completa la configuración de la izquierda y pulsa Calcular. Aquí aparecerán la ficha del producto, el despiece de materiales y el total.'}
                                />
                            </Tarjeta>
                        )}
                    </div>
                </div>
            )}

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
