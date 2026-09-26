import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Calculator as IconCotizar, ClipboardList, Archive, Loader2, AlertTriangle, Gauge, Settings } from '../../components/ui/icons';

import FolderTabs, { FOLDER_BODY } from '../../components/FolderTabs';
import {
    apiEstadoCotizador, apiGetParametros, apiCrearCotizacion, apiActualizarCotizacion,
    apiObtenerCotizacion, apiCrearPropuesta, apiElegirPropuesta, apiEliminarPropuesta,
    apiGuardarCargos, apiGetModulos, apiCambiarSegmento, apiCotizarItem, apiActualizarPropuesta,
} from './services/cotizadorApi';
import {
    ClienteCotizacion, Cotizacion, EstadoCotizacion, ItemCarrito, ModuloMeta, Parametros, Propuesta,
    RespuestaPropuesta, SegmentoCliente,
} from './types';
import { rotuloPropuesta } from './propuestaColor';
import TabCotizar, { ItemEnEdicion } from './components/TabCotizar';
import TabActual from './components/TabActual';
import TabGuardadas from './components/TabGuardadas';
import TabCalibracion from './components/TabCalibracion';
import TabConfiguracion from './components/TabConfiguracion';
import BarraTrabajo, { TipoNuevaPropuesta } from './components/BarraTrabajo';
import PanelCargosObra, { EstadoCargos, cargosADTO, cargosDesdeApi, cargosIniciales } from './components/PanelCargosObra';
import TotalPropuestaEnVivo from './components/TotalPropuestaEnVivo';
import { BorradorCotizar, calcularTotalesPrevistos, useManoObra } from './totalesPropuesta';
import ModalClonarPropuesta from './components/modals/ModalClonarPropuesta';
import ModalCambiosSinGuardar, { DecisionCambios } from './components/modals/ModalCambiosSinGuardar';

// ─────────────────────────────────────────────────────────────────────────────
// Módulo Cotizador — /cotizador, solo root/admin.
//
// Una sola página con 5 pestañas en vez de rutas anidadas: mismo patrón que
// Proveedores, CRM y ROOT. El estado de la cotización en construcción vive
// aquí, local — no en Redux: sólo importa mientras esta página está montada y
// ningún otro módulo del ERP lo necesita leer.
//
// DESDE EL 2026-09-20 EL "CARRITO" SON LOS ÍTEMS DE UNA PROPUESTA.
// Una cotización es un contenedor de propuestas A/B/C… (la misma obra en 5 mm y
// en templado) y su total es el de la ELEGIDA. Por eso esta página lleva, junto
// al carrito, tres cosas más que antes no existían:
//
//   · `propuestas` / `propuestaActivaId` — cuál se está mirando y editando.
//   · `descuentoPct` — UN solo descuento, el de esa propuesta (el de la
//     cabecera quedó legado y el del formulario por ítem se retiró).
//   · `cargos` — mano de obra, andamio, huacal, flete y otros. UN SOLO ESTADO
//     que se pinta en dos ventanas (Cotizar y Actual): editarlo en una es
//     editarlo en la otra.
//
// El reparto de responsabilidades con el backend no cambia: aquí no se calcula
// ningún total de propuesta. Toda escritura devuelve la cotización recargada y
// esta página la vuelca tal cual con `aplicarCotizacion`.
// ─────────────────────────────────────────────────────────────────────────────

export interface CabeceraCotizacion {
    cliente: ClienteCotizacion;
    segmentoCliente: SegmentoCliente;
    asesor: string;
    estado: EstadoCotizacion;
}

const CABECERA_INICIAL: CabeceraCotizacion = {
    cliente: { nombre: '', direccion: '', telefono: '', obra: '', contacto: '' },
    segmentoCliente: 'PA',
    asesor: '',
    estado: 'PENDIENTE',
};

type TabKey = 'cotizar' | 'actual' | 'guardadas' | 'calibracion' | 'configuracion';

/**
 * Cuerpo de la carpeta para las pestañas de trabajo (Cotizar y Actual), que van
 * sobre `bg-slate-50` para que las tarjetas blancas se despeguen del fondo.
 *
 * Se sustituye la clase de fondo en vez de añadir `bg-slate-50` junto a
 * `FOLDER_BODY`: en el CSS que genera Tailwind `.bg-slate-50` se emite ANTES que
 * `.bg-white`, así que combinarlas dejaría ganando al blanco sin importar el
 * orden en el atributo `class`. Y `FOLDER_BODY` no se toca porque es de todo el
 * ERP. Si allá cambiara el nombre de la clase de fondo, esto simplemente vuelve
 * a pintar blanco: degrada, no rompe.
 *
 * La clase sale de un `replace` en tiempo de ejecución, que el escáner de
 * Tailwind no ve; existe en el CSS porque `TabCotizar` y `TabActual` la escriben
 * literal en su raíz. Es también el motivo de que el fondo esté en los dos
 * sitios: la carpeta lo pone para que las esquinas redondeadas queden teñidas.
 */
const CUERPO_TRABAJO = FOLDER_BODY.replace('bg-white', 'bg-slate-50');

/** Tope de propuestas por cotización. Réplica de `MAX_PROPUESTAS` del store: no
 * es un número técnico, es donde el comparador deja de caber en una pantalla
 * girada hacia el cliente. Aquí sólo deshabilita el botón; quien de verdad lo
 * impone (con un 409) es el backend. */
const MAX_PROPUESTAS = 5;

/** Qué propuesta queda activa al volcar una cotización del servidor: la que
 * nombra el backend; si no la manda —dato viejo sin propuestas— la elegida, y
 * si no, la primera. */
function idPropuestaActiva(cot: Cotizacion): number | null {
    const lista = cot.propuestas ?? [];
    return cot.propuestaActivaId ?? lista.find(p => p.elegida)?.id ?? lista[0]?.id ?? null;
}

/** Contexto con que arranca una acción de propuesta, ya con lo pendiente resuelto. */
interface ContextoAccion {
    cotId: number;
    pid: number | null;
    /** La cotización recién guardada, si hubo que guardar: el estado de React no
     * se actualiza hasta el próximo render, y la acción la necesita ya. */
    cot: Cotizacion | null;
}

const CotizadorPage: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const tabInicial = (searchParams.get('tab') as TabKey) || 'cotizar';
    const [activeTab, setActiveTab] = useState<TabKey>(tabInicial);

    const [cargandoEstado, setCargandoEstado] = useState(true);
    const [disponible, setDisponible] = useState<boolean | null>(null);
    const [parametros, setParametros] = useState<Parametros | null>(null);

    const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
    const [cabecera, setCabecera] = useState<CabeceraCotizacion>(CABECERA_INICIAL);
    /** Cotización guardada que se está editando. `estado` es el GUARDADO, no el
     * del select: el freno de "aprobada" depende de lo que hay en la base. */
    const [edicion, setEdicion] = useState<{ id: number; numero: number; estado: EstadoCotizacion } | null>(null);
    const [guardando, setGuardando] = useState(false);

    /** Una sola carga por visita. Antes la pedía TabCotizar al montarse, o sea
     * en cada cambio de pestaña, y esta página no la tenía para rotular los
     * ítems al reabrir una cotización (salían con el id: "ventanas"). */
    const [modulos, setModulos] = useState<ModuloMeta[]>([]);
    /** idTemp del ítem del carrito que se está editando en Cotizar. */
    const [itemEditandoId, setItemEditandoId] = useState<string | null>(null);
    const [cambiandoSegmento, setCambiandoSegmento] = useState(false);

    const [propuestas, setPropuestas] = useState<Propuesta[]>([]);
    const [propuestaActivaId, setPropuestaActivaId] = useState<number | null>(null);
    const [descuentoPct, setDescuentoPct] = useState(0);
    const [cargos, setCargos] = useState<EstadoCargos>(() => cargosIniciales(null));
    /** ¿El vendedor tocó el panel? AUSENTE ≠ VACÍO: si no lo tocó, al crear la
     * cotización NO se envían cargos y el backend sugiere mano de obra y flete
     * —que es lo que el vendedor obtenía antes automáticamente, porque ambos
     * venían dentro del BOM—. Mandar un arreglo vacío significaría "esta
     * propuesta no lleva cargos" y le borraría el flete sin avisar. */
    const [cargosTocados, setCargosTocados] = useState(false);
    /** Espejo del anterior en un ref: la carga de parámetros es asíncrona y su
     * callback no puede leer el valor de estado sin quedarse con el del primer
     * render. */
    const cargosTocadosRef = useRef(false);
    /** Hay cambios en el carrito/cabecera/cargos que todavía no se guardaron. Se
     * usa para pedir confirmación antes de una acción de propuesta, que recarga
     * desde el servidor y los descartaría en silencio. */
    const [sucio, setSucio] = useState(false);
    const [ocupado, setOcupado] = useState(false);
    const [clonando, setClonando] = useState<Propuesta | null>(null);
    /** Pregunta abierta de "cambios sin guardar": qué iba a hacer el vendedor y
     * a quién devolverle la respuesta (ver `preguntarCambios`). */
    const [preguntaCambios, setPreguntaCambios] = useState<{
        accion: string;
        resolver: (d: DecisionCambios) => void;
    } | null>(null);

    useEffect(() => {
        apiEstadoCotizador()
            .then(res => setDisponible(!!res.data?.disponible))
            .catch(() => setDisponible(false))
            .finally(() => setCargandoEstado(false));

        apiGetParametros()
            .then(res => {
                setParametros(res.data);
                // Las tarifas de andamio, huacal y flete salen de parámetros y
                // llegan después del primer render. Se precargan SÓLO si el
                // vendedor todavía no tocó el panel: escribir encima de lo que
                // ya puso sería peor que arrancar en cero.
                if (!cargosTocadosRef.current) setCargos(cargosIniciales(res.data));
            })
            .catch(() => { /* la pestaña Actual cae a valores por defecto sin bloquear */ });

        apiGetModulos()
            .then(res => setModulos(res.data))
            .catch(() => toast.error('No se pudo cargar la lista de productos del cotizador. Recarga la página.'));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const nombreModulo = useCallback(
        (id: string) => modulos.find(m => m.id === id)?.nombre ?? id,
        [modulos]
    );

    // Si se reabrió una cotización antes de que llegara la lista de módulos, sus
    // ítems quedaron rotulados con el id: se corrigen en cuanto la lista llega.
    useEffect(() => {
        if (modulos.length === 0) return;
        setCarrito(c => c.map(it => ({ ...it, moduloNombre: nombreModulo(it.moduloId) })));
    }, [modulos, nombreModulo]);

    const cambiarTab = useCallback((key: string) => {
        setActiveTab(key as TabKey);
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.set('tab', key);
            if (key !== 'guardadas') { next.delete('id'); next.delete('vista'); }
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    const marcarSucio = useCallback(() => setSucio(true), []);

    const propuestaActiva = useMemo(
        () => propuestas.find(p => p.id === propuestaActivaId) ?? null,
        [propuestas, propuestaActivaId]
    );

    /** Agrega el ítem y dice DÓNDE quedó y qué falta: antes el aviso era "Ítem
     * agregado a la cotización actual", que no nombraba la propuesta ni recordaba
     * que agregar no es guardar. Va como `info` y no `success` a propósito: el
     * adaptador de avisos (`services/configurarNotificaciones.ts`) titula todo
     * `success` como "Guardado", y aquí todavía no se guardó nada. */
    const agregarItem = useCallback((item: ItemCarrito) => {
        setCarrito(c => [...c, item]);
        setSucio(true);
        const n = carrito.length + 1;
        const nombre = item.descripcionItem || item.moduloNombre;
        toast.info(
            <div className="text-[13px] leading-snug">
                <p>
                    <span className="font-bold">{nombre}</span> agregado a la{' '}
                    <span className="font-bold">{rotuloPropuesta(propuestaActiva)}</span> ({n} ítem{n === 1 ? '' : 's'}).
                </p>
                <p className="text-[12px] opacity-80 mt-0.5">Recuerda guardar (Ctrl+S).</p>
                <button
                    type="button"
                    onClick={() => cambiarTab('actual')}
                    className="mt-1.5 text-[12px] font-bold underline underline-offset-2"
                >
                    Ver propuesta
                </button>
            </div>
        );
    }, [carrito.length, propuestaActiva, cambiarTab]);

    const quitarItem = useCallback((idTemp: string) => {
        setCarrito(c => c.filter(i => i.idTemp !== idTemp));
        setItemEditandoId(actual => (actual === idTemp ? null : actual));
        setSucio(true);
    }, []);

    /** Copia exacta justo debajo del original: mismo input, mismo resultado.
     * No se recalcula — es la misma pieza con los precios con que ya se cotizó. */
    const duplicarItem = useCallback((idTemp: string) => {
        setCarrito(c => {
            const i = c.findIndex(x => x.idTemp === idTemp);
            if (i < 0) return c;
            const copia: ItemCarrito = { ...c[i], idTemp: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
            return [...c.slice(0, i + 1), copia, ...c.slice(i + 1)];
        });
        setSucio(true);
    }, []);

    const reemplazarItem = useCallback((item: ItemCarrito) => {
        setCarrito(c => c.map(x => (x.idTemp === item.idTemp ? item : x)));
        setItemEditandoId(null);
        setSucio(true);
    }, []);

    const cambiarCargos = useCallback((v: EstadoCargos) => {
        setCargos(v);
        setCargosTocados(true);
        cargosTocadosRef.current = true;
        setSucio(true);
    }, []);

    const limpiarCotizacionActual = useCallback(() => {
        setCarrito([]);
        setCabecera(CABECERA_INICIAL);
        setEdicion(null);
        setPropuestas([]);
        setPropuestaActivaId(null);
        setDescuentoPct(0);
        setCargos(cargosIniciales(parametros));
        setCargosTocados(false);
        cargosTocadosRef.current = false;
        setItemEditandoId(null);
        setSucio(false);
    }, [parametros]);

    /**
     * Vuelca una cotización del servidor sobre el estado local.
     *
     * `cot.items` son SIEMPRE los de la propuesta activa (los únicos que traen
     * los blobs `input`/`resultado`), así que el carrito es literalmente esa
     * propuesta. `propuestaActivaId` la nombra; si el backend no la manda —dato
     * viejo sin propuestas— se cae a la elegida y luego a la primera.
     */
    const aplicarCotizacion = useCallback((cot: Cotizacion) => {
        const lista = cot.propuestas ?? [];
        const activaId = idPropuestaActiva(cot);
        const activa = lista.find(p => p.id === activaId) ?? null;

        setCabecera({
            cliente: cot.cliente,
            segmentoCliente: cot.segmentoCliente,
            asesor: cot.asesor,
            estado: cot.estado,
        });
        setCarrito(cot.items.map(it => ({
            idTemp: `existente-${it.id}`,
            moduloId: it.moduloId,
            moduloNombre: nombreModulo(it.moduloId),
            descripcionItem: it.descripcionItem,
            input: it.input,
            resultado: it.resultado,
        })));
        setPropuestas(lista);
        setPropuestaActivaId(activaId);
        setDescuentoPct(Number(activa?.descuentoPct) || 0);
        setCargos(cargosDesdeApi(activa?.cargos, parametros));
        setCargosTocados(false);
        cargosTocadosRef.current = false;
        setEdicion({ id: cot.id, numero: cot.numero, estado: cot.estado });
        setItemEditandoId(null);
        setSucio(false);
    }, [parametros, nombreModulo]);

    /** Carga en el carrito una cotización guardada, para editarla. */
    const reabrirCotizacion = useCallback((cot: Cotizacion) => {
        aplicarCotizacion(cot);
        cambiarTab('actual');
    }, [aplicarCotizacion, cambiarTab]);

    const conError = (e: any, respaldo: string) => toast.error(e?.response?.data?.error || respaldo);

    /** Abre "Tienes cambios sin guardar" y espera la respuesta del vendedor. Es
     * una promesa para que cada acción se lea de corrido: pregunto → según la
     * respuesta, guardo, descarto o no hago nada. */
    const preguntarCambios = useCallback((accion: string) => new Promise<DecisionCambios>(resolve => {
        setPreguntaCambios({
            accion,
            resolver: (d) => {
                setPreguntaCambios(null);
                resolve(d);
            },
        });
    }), []);

    /**
     * Guarda la propuesta activa y devuelve la cotización tal como quedó en el
     * servidor, o null si no se pudo (el motivo ya se le mostró al vendedor).
     *
     * Es el guardado de siempre, separado de `guardarCotizacion` para que las
     * acciones de propuesta puedan "guardar y continuar" con la respuesta en la
     * mano: el estado de React no se actualiza hasta el próximo render.
     *
     * Ya no salta a la pestaña Actual al guardar por primera vez: con el botón
     * Guardar en la barra de trabajo, el vendedor puede estar en Cotizar y
     * sacarlo de ahí sin pedirlo le rompe el flujo.
     */
    const persistir = useCallback(async (): Promise<Cotizacion | null> => {
        if (carrito.length === 0) {
            toast.error('Agrega al menos un ítem antes de guardar.');
            return null;
        }
        setGuardando(true);
        try {
            const items = carrito.map(it => ({
                moduloId: it.moduloId,
                descripcionItem: it.descripcionItem,
                input: it.input,
                resultado: it.resultado,
            }));

            if (edicion) {
                // Los ítems y el descuento van por el contrato de siempre, con
                // `propuestaId` para que caigan en la propuesta que se está
                // mirando y no en la elegida. Los cargos son un PUT aparte: el
                // endpoint reemplaza el juego completo y puede rechazarlo con
                // 409 si la propuesta es legada, y eso no debe tumbar el guardado
                // de los ítems.
                const destino = propuestaActivaId ?? undefined;
                const { data } = await apiActualizarCotizacion(edicion.id, {
                    cliente: cabecera.cliente,
                    segmentoCliente: cabecera.segmentoCliente,
                    asesor: cabecera.asesor,
                    estado: cabecera.estado,
                    descuentoPct,
                    items,
                    propuestaId: destino,
                });
                let cot = data;
                if (cargosTocados && destino) {
                    try {
                        const r = await apiGuardarCargos(edicion.id, destino, cargosADTO(cargos));
                        cot = r.data;
                    } catch (e) {
                        conError(e, 'Los ítems se guardaron, pero los cargos de obra no.');
                    }
                }
                // Ya no hace falta volver a leer: `PUT /cotizaciones/:id` responde
                // con la propuesta que se escribió (`obtener(id, {propuesta})` en
                // el store), igual que el PUT de cargos.
                aplicarCotizacion(cot);
                toast.success(`Cotización N.° ${cot.numero} guardada.`);
                return cot;
            } else {
                // Al crear se usa el contrato NUEVO (`propuestas: [...]`) para que
                // los cargos que el vendedor ya ajustó en Cotizar entren en la
                // misma escritura. Sin `cargos`, el backend sugiere mano de obra
                // y flete: por eso la clave sólo viaja si tocó el panel.
                const { data } = await apiCrearCotizacion({
                    cliente: cabecera.cliente,
                    segmentoCliente: cabecera.segmentoCliente,
                    asesor: cabecera.asesor,
                    estado: cabecera.estado,
                    propuestas: [{
                        elegida: true,
                        descuentoPct,
                        items,
                        ...(cargosTocados ? { cargos: cargosADTO(cargos) } : {}),
                    }],
                });
                aplicarCotizacion(data);
                toast.success(
                    `Cotización N.° ${data.numero} guardada como Propuesta A. ` +
                    'Si el cliente quiere otra opción, usa "Nueva propuesta" en la barra de arriba.',
                    { autoClose: 7000 }
                );
                return data;
            }
        } catch (e) {
            conError(e, 'No se pudo guardar la cotización. Tus cambios siguen en pantalla: revisa el aviso e inténtalo de nuevo.');
            return null;
        } finally {
            setGuardando(false);
        }
    }, [carrito, cabecera, descuentoPct, cargos, cargosTocados, edicion, propuestaActivaId, aplicarCotizacion]);

    const guardarCotizacion = useCallback(async () => {
        await persistir();
    }, [persistir]);

    /** Cómo se nombra dónde están los cambios pendientes, en el modal. */
    const dondeCambios = edicion ? `la ${rotuloPropuesta(propuestaActiva)}` : 'la cotización nueva';

    /**
     * Deja todo listo para una acción que recarga desde el servidor (cambiar de
     * propuesta, crear otra, elegir, borrar, cambiar el tipo de cliente) y
     * devuelve con qué ids seguir, o null si el vendedor canceló o el guardado
     * falló.
     *
     *   · Cotización nueva: no existe en el servidor, así que se guarda primero
     *     — es lo que permite "Guardar y crear Propuesta B" de un solo clic.
     *   · Guardada y sin cambios: se sigue directo.
     *   · Guardada con cambios: se pregunta. Antes era un `window.confirm` que
     *     sólo ofrecía perderlos o no hacer nada.
     */
    const prepararAccion = useCallback(async (accion: string): Promise<ContextoAccion | null> => {
        if (!edicion) {
            const cot = await persistir();
            return cot ? { cotId: cot.id, pid: idPropuestaActiva(cot), cot } : null;
        }
        if (!sucio) return { cotId: edicion.id, pid: propuestaActivaId, cot: null };

        const decision = await preguntarCambios(accion);
        if (decision === 'cancelar') return null;
        if (decision === 'descartar') return { cotId: edicion.id, pid: propuestaActivaId, cot: null };
        const cot = await persistir();
        return cot ? { cotId: cot.id, pid: idPropuestaActiva(cot), cot } : null;
    }, [edicion, sucio, propuestaActivaId, persistir, preguntarCambios]);

    const activarPropuesta = useCallback(async (pid: number) => {
        if (!edicion || pid === propuestaActivaId) return;
        const destino = propuestas.find(p => p.id === pid) ?? null;
        const ctx = await prepararAccion(`cambiar a la ${rotuloPropuesta(destino)}`);
        if (!ctx) return;
        setOcupado(true);
        try {
            const { data } = await apiObtenerCotizacion(ctx.cotId, pid);
            aplicarCotizacion(data);
        } catch (e) {
            conError(e, 'No se pudo abrir esa propuesta. Recarga la página si el problema sigue.');
        } finally {
            setOcupado(false);
        }
    }, [edicion, propuestaActivaId, propuestas, prepararAccion, aplicarCotizacion]);

    /**
     * Crea otra propuesta para el mismo cliente, de las tres maneras que ofrece
     * el menú "Nueva propuesta" de la barra:
     *   · vacía  → se abre Cotizar para armar su primer ítem;
     *   · copia  → mismos ítems y cargos, sin recalcular;
     *   · variante → abre el modal que recalcula todo con otro vidrio.
     * Con la cotización sin guardar, primero la guarda (ver `prepararAccion`).
     */
    const nuevaPropuesta = useCallback(async (tipo: TipoNuevaPropuesta) => {
        const accion = tipo === 'vacia'
            ? 'crear una propuesta vacía'
            : tipo === 'copia' ? 'copiar la propuesta' : 'crear una variante con otro vidrio';
        const ctx = await prepararAccion(accion);
        if (!ctx) return;

        if (tipo === 'variante') {
            const lista = ctx.cot?.propuestas ?? propuestas;
            const base = lista.find(p => p.id === ctx.pid) ?? null;
            if (base) setClonando(base);
            return;
        }

        setOcupado(true);
        try {
            const { data } = await apiCrearPropuesta(
                ctx.cotId,
                tipo === 'copia' && ctx.pid ? { desdePropuestaId: ctx.pid } : {}
            );
            aplicarCotizacion(data.cotizacion);
            const nueva = (data.cotizacion.propuestas ?? []).find(p => p.id === data.propuestaId) ?? null;
            if (tipo === 'vacia') {
                cambiarTab('cotizar');
                toast.success(`${rotuloPropuesta(nueva)} creada y vacía: configura aquí su primer ítem.`);
            } else {
                const origen = (ctx.cot?.propuestas ?? propuestas).find(p => p.id === ctx.pid) ?? null;
                toast.success(
                    `${rotuloPropuesta(nueva)} creada como copia de la ${origen?.etiqueta ?? 'anterior'}. ` +
                    'Agrega, quita o edita lo que cambie.'
                );
            }
        } catch (e) {
            conError(e, 'No se pudo crear la propuesta.');
        } finally {
            setOcupado(false);
        }
    }, [prepararAccion, propuestas, aplicarCotizacion, cambiarTab]);

    /** Copia exacta de la activa. La usa el aviso de propuesta legada ("duplícala
     * a la forma nueva"), que es el único sitio que la pide por nombre. */
    const duplicarPropuesta = useCallback(() => { nuevaPropuesta('copia'); }, [nuevaPropuesta]);

    const elegirPropuesta = useCallback(async (pid: number) => {
        if (!edicion) return;
        const destino = propuestas.find(p => p.id === pid) ?? null;
        const ctx = await prepararAccion(`marcar la ${rotuloPropuesta(destino)} como elegida`);
        if (!ctx) return;
        setOcupado(true);
        try {
            const { data } = await apiElegirPropuesta(ctx.cotId, pid);
            aplicarCotizacion(data);
            toast.success('Propuesta marcada como elegida: es la que se cobra y la que sale a corte.');
        } catch (e) {
            conError(e, 'No se pudo elegir la propuesta.');
        } finally {
            setOcupado(false);
        }
    }, [edicion, propuestas, prepararAccion, aplicarCotizacion]);

    const borrarPropuesta = useCallback(async (pid: number) => {
        if (!edicion) return;
        const p = propuestas.find(x => x.id === pid) ?? null;
        if (!window.confirm(`¿Borrar la ${rotuloPropuesta(p)}? Se pierden sus ítems y sus cargos, y no se puede deshacer.`)) return;
        // Borrar recarga la cotización: sin esto, los cambios pendientes de la
        // propuesta activa se perdían en silencio aunque se borrara otra.
        const ctx = await prepararAccion(`borrar la ${rotuloPropuesta(p)}`);
        if (!ctx) return;
        setOcupado(true);
        try {
            const { data } = await apiEliminarPropuesta(ctx.cotId, pid);
            aplicarCotizacion(data);
            toast.success('Propuesta borrada.');
        } catch (e) {
            conError(e, 'No se pudo borrar la propuesta.');
        } finally {
            setOcupado(false);
        }
    }, [edicion, propuestas, prepararAccion, aplicarCotizacion]);

    const trasClonar = useCallback((r: RespuestaPropuesta) => {
        setClonando(null);
        aplicarCotizacion(r.cotizacion);
        const nueva = (r.cotizacion.propuestas ?? []).find(p => p.id === r.propuestaId) ?? null;
        toast.success(
            <div className="text-[13px] leading-snug">
                <p><span className="font-bold">{rotuloPropuesta(nueva)}</span> creada con el vidrio nuevo.</p>
                <button
                    type="button"
                    onClick={() => cambiarTab('cotizar')}
                    className="mt-1.5 text-[12px] font-bold underline underline-offset-2"
                >
                    Agregarle más ítems en Cotizar
                </button>
            </div>,
            { autoClose: 8000 }
        );
        // El clonado no bloquea si algún ítem sale con errores de precio: se
        // avisa, una a una, para que el vendedor sepa qué revisar.
        for (const aviso of r.advertencias ?? []) toast.warn(aviso, { autoClose: 9000 });
    }, [aplicarCotizacion, cambiarTab]);

    /** Nombre de la propuesta activa ("Templado + tablero"). Sólo toca la lista de
     * propuestas: volcar la cotización entera pisaría los ítems sin guardar. */
    const renombrarPropuesta = useCallback(async (nombre: string): Promise<boolean> => {
        if (!edicion || !propuestaActivaId) return false;
        try {
            const { data } = await apiActualizarPropuesta(edicion.id, propuestaActivaId, { nombre: nombre || null });
            if (data.propuestas) setPropuestas(data.propuestas);
            toast.success(nombre ? `Nombre guardado: "${nombre}".` : 'Nombre quitado.');
            return true;
        } catch (e) {
            conError(e, 'No se pudo cambiar el nombre de la propuesta.');
            return false;
        }
    }, [edicion, propuestaActivaId]);

    /** "Cotización nueva": con cambios pendientes, pregunta igual que las demás
     * acciones — también en una cotización todavía sin guardar, que es donde más
     * trabajo se podía perder con el `window.confirm` anterior. */
    const nuevaCotizacion = useCallback(async () => {
        if (sucio) {
            const decision = await preguntarCambios('empezar una cotización nueva');
            if (decision === 'cancelar') return;
            if (decision === 'guardar' && !(await persistir())) return;
        }
        limpiarCotizacionActual();
        cambiarTab('cotizar');
    }, [sucio, preguntarCambios, persistir, limpiarCotizacionActual, cambiarTab]);

    /**
     * Cambia el segmento (PA/PM/PB) y RECALCULA los ítems con la lista nueva.
     *
     * Con la cotización guardada lo hace el backend, sobre TODAS sus propuestas
     * y en una sola transacción: el carrito sólo tiene la activa, y recalcular
     * aquí dejaría las demás con la lista vieja. Como eso recarga desde el
     * servidor, antes se pregunta por los cambios sin guardar.
     *
     * Sin guardar todavía, el carrito ES toda la cotización: se recalcula ítem
     * por ítem con el mismo motor (`POST /cotizar`). Si uno falla no se cambia
     * nada, igual que en el backend.
     */
    const cambiarSegmento = useCallback(async (segmento: SegmentoCliente) => {
        if (segmento === cabecera.segmentoCliente) return;

        if (edicion) {
            const ctx = await prepararAccion(`cambiar el tipo de cliente a ${segmento}`);
            if (!ctx) return;
            setCambiandoSegmento(true);
            try {
                const { data } = await apiCambiarSegmento(ctx.cotId, segmento, ctx.pid);
                aplicarCotizacion(data.cotizacion);
                toast.success(`Tipo de cliente cambiado a ${segmento}: se recalcularon los precios de todas las propuestas.`);
                for (const aviso of data.advertencias ?? []) toast.warn(aviso, { autoClose: 9000 });
            } catch (e) {
                conError(e, 'No se pudo cambiar el tipo de cliente. No se modificó nada.');
            } finally {
                setCambiandoSegmento(false);
            }
            return;
        }

        if (carrito.length === 0) {
            setCabecera(c => ({ ...c, segmentoCliente: segmento }));
            return;
        }
        setCambiandoSegmento(true);
        try {
            const recalculados: ItemCarrito[] = [];
            for (const it of carrito) {
                const input = { ...it.input, segmentoCliente: segmento };
                const { data } = await apiCotizarItem(it.moduloId, input);
                if (data.hayErrores) {
                    toast.warn(`"${it.descripcionItem || it.moduloNombre}" quedó con líneas sin precio en ${segmento}.`, { autoClose: 9000 });
                }
                recalculados.push({ ...it, input, resultado: data });
            }
            setCarrito(recalculados);
            setCabecera(c => ({ ...c, segmentoCliente: segmento }));
            setSucio(true);
            // `info`: sin guardar todavía (el título de `success` diría "Guardado").
            toast.info(`Tipo de cliente cambiado a ${segmento}: ${recalculados.length} ítem(s) recalculados. Recuerda guardar.`);
        } catch (e) {
            conError(e, 'No se pudo recalcular algún ítem con el tipo de cliente nuevo. No se modificó nada.');
        } finally {
            setCambiandoSegmento(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cabecera.segmentoCliente, edicion, carrito, prepararAccion, aplicarCotizacion]);

    const editarItem = useCallback((idTemp: string) => {
        setItemEditandoId(idTemp);
        cambiarTab('cotizar');
    }, [cambiarTab]);

    const guardarEdicionItem = useCallback((item: ItemCarrito) => {
        reemplazarItem(item);
        cambiarTab('actual');
    }, [reemplazarItem, cambiarTab]);

    const abrirDetalleInicial = useMemo(() => {
        const id = searchParams.get('id');
        if (!id) return undefined;
        const vista = searchParams.get('vista') === 'tecnico' ? 'tecnico' as const : 'normal' as const;
        return { id: Number(id), vista };
    }, [searchParams]);

    /**
     * Regla 4 ampliada (2026-09-23): la propuesta elegida de una cotización
     * APROBADA no se edita — ítems, descuento, cargos ni segmento. Lo impone el
     * backend (409); aquí sólo se explica antes de que el vendedor lo intente.
     * Mira el estado GUARDADO y el del select: si el vendedor la pasa a Pendiente
     * en el select, puede editar y guardar ambas cosas juntas (el backend lo
     * acepta porque en ese mismo guardado deja de estar aprobada).
     */
    const bloqueoEdicion = edicion?.estado === 'APROBADA' && cabecera.estado === 'APROBADA' && propuestaActiva?.elegida
        ? `La cotización N.° ${edicion.numero} está aprobada y la propuesta ${propuestaActiva.etiqueta} es la elegida: ` +
          'no se pueden cambiar sus ítems, descuento, cargos ni segmento porque puede haber material cortado. ' +
          'Para editarla, cambia el estado a Pendiente.'
        : null;

    const itemEnEdicion: ItemEnEdicion | null = useMemo(() => {
        if (!itemEditandoId) return null;
        const i = carrito.findIndex(x => x.idTemp === itemEditandoId);
        return i < 0 ? null : { item: carrito[i], posicion: i + 1 };
    }, [itemEditandoId, carrito]);

    const modulosDisponibles = useMemo(() => new Set(modulos.map(m => m.id)), [modulos]);

    // ─── Mano de obra y total en vivo (2026-09-26) ──────────────────────────
    // La mano de obra por producto la calcula el backend (`POST /mano-obra`); aquí
    // se pide para dos juegos de ítems: el carrito (barra y Actual) y el carrito
    // más el producto que está en pantalla en Cotizar (paso 3). El segundo solo
    // se pide cuando hay un producto en pantalla.
    const [borrador, setBorrador] = useState<BorradorCotizar | null>(null);
    const itemsManoObra = useMemo(() => carrito.map(it => ({ moduloId: it.moduloId, input: it.input })), [carrito]);
    const { lineas: manoObraCarrito, cargando: cargandoManoObraCarrito } = useManoObra(itemsManoObra);
    const carritoSinEditado = useMemo(
        () => (borrador?.reemplazaIdTemp ? carrito.filter(it => it.idTemp !== borrador.reemplazaIdTemp) : carrito),
        [carrito, borrador]
    );
    const itemsManoObraCotizar = useMemo(
        () => (borrador
            ? [...carritoSinEditado.map(it => ({ moduloId: it.moduloId, input: it.input })), { moduloId: borrador.moduloId, input: borrador.input }]
            : []),
        [carritoSinEditado, borrador]
    );
    const { lineas: manoObraBorrador, cargando: cargandoManoObraBorrador } = useManoObra(itemsManoObraCotizar);
    const manoObraCotizar = borrador ? manoObraBorrador : manoObraCarrito;

    // Cerrar la pestaña o recargar con cambios pendientes: el navegador pregunta.
    // No cubre los clics en el menú lateral del ERP — la app usa `BrowserRouter`,
    // y bloquear la navegación interna (`useBlocker`) exige un router de datos.
    useEffect(() => {
        if (!sucio) return;
        const alSalir = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', alSalir);
        return () => window.removeEventListener('beforeunload', alSalir);
    }, [sucio]);

    // Ctrl+S (⌘S en Mac) guarda desde Cotizar o Actual. En esas dos pestañas se
    // anula siempre el "Guardar página como…" del navegador, aunque no haya nada
    // que guardar: abrirlo ahí nunca es lo que el vendedor quería.
    useEffect(() => {
        const alTeclado = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return;
            if (activeTab !== 'cotizar' && activeTab !== 'actual') return;
            e.preventDefault();
            if (guardando || preguntaCambios) return;
            if (edicion && !sucio) {
                toast.info('No hay cambios por guardar.', { autoClose: 2500 });
                return;
            }
            guardarCotizacion();
        };
        window.addEventListener('keydown', alTeclado);
        return () => window.removeEventListener('keydown', alTeclado);
    }, [activeTab, guardando, preguntaCambios, edicion, sucio, guardarCotizacion]);

    if (cargandoEstado) {
        return (
            <div className="p-10 flex items-center justify-center text-slate-700">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando cotizador…
            </div>
        );
    }

    if (!disponible) {
        return (
            <div className="p-10 text-center">
                <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                <p className="text-slate-900 font-semibold">El cotizador no está disponible en este momento.</p>
                <p className="text-slate-700 text-sm mt-1">
                    La caché de precios y diseños no cargó al iniciar el servidor. Avisa a soporte técnico.
                </p>
            </div>
        );
    }

    // Totales en vivo (2026-09-26). La cuenta es la réplica del backend en
    // `totalesPropuesta.ts`. Sin cambios pendientes, la barra muestra el total
    // GUARDADO, que es exactamente el que quedó en la base.
    const ivaPct = Number(parametros?.iva) || 0;
    const legadoActiva = Boolean(propuestaActiva?.legadoCargosEnItems);
    const totalesCarrito = calcularTotalesPrevistos({
        items: carrito.map(it => it.resultado),
        manoObra: manoObraCarrito,
        cargos,
        descuentoPct,
        ivaPct,
        legado: legadoActiva,
    });
    const totalesCotizar = calcularTotalesPrevistos({
        items: borrador ? [...carritoSinEditado.map(it => it.resultado), borrador] : carrito.map(it => it.resultado),
        manoObra: manoObraCotizar,
        cargos,
        descuentoPct,
        ivaPct,
        legado: legadoActiva,
    });
    const usarGuardado = !sucio && Boolean(propuestaActiva);
    const notaTotalCotizar = borrador
        ? (borrador.reemplazaIdTemp
            ? 'Incluye los cambios del ítem en edición, aún sin guardar en la propuesta.'
            : 'Incluye el producto en pantalla, aún sin agregar a la propuesta.')
        : null;

    const controlPropuestas = {
        propuestas,
        activaId: propuestaActivaId,
        cotizacionId: edicion?.id ?? null,
        ocupado,
        onActivar: activarPropuesta,
        onDuplicar: duplicarPropuesta,
        onElegir: elegirPropuesta,
        onBorrar: borrarPropuesta,
    };

    // El tipo de cliente se recalcula en TODAS las propuestas (el backend lo
    // hace en una transacción), así que lo frena cualquier propuesta que no se
    // pueda recalcular — no sólo la que se está mirando: la elegida de una
    // aprobada o una legada. Antes sólo se miraba la activa y, parado en la B de
    // una aprobada, el control parecía disponible y el backend respondía 409.
    const motivoNoSegmento = edicion?.estado === 'APROBADA' && cabecera.estado === 'APROBADA'
        ? 'La cotización está aprobada: pásala a Pendiente (pestaña Actual) para cambiar el tipo de cliente.'
        : propuestas.some(p => p.legadoCargosEnItems)
            ? 'Hay una propuesta legada: duplícala a la forma nueva antes de cambiar el tipo de cliente.'
            : null;

    const motivoNoNueva = propuestas.length >= MAX_PROPUESTAS
        ? `Una cotización admite como máximo ${MAX_PROPUESTAS} propuestas.`
        : !edicion && carrito.length === 0
            ? 'Agrega al menos un ítem antes de crear otra propuesta.'
            : null;

    const barraVisible = activeTab === 'cotizar' || activeTab === 'actual';

    return (
        <div className="p-4 md:p-6">
            <div className="relative">
                {/* Barra de trabajo: en Cotizar y Actual, que son las dos pestañas
                    donde se arma la cotización. Vive en el shell y no en cada Tab
                    para que cambiar de pestaña no la mueva de sitio. */}
                {barraVisible && (
                    <BarraTrabajo
                        numero={edicion?.numero ?? null}
                        estado={edicion?.estado ?? cabecera.estado}
                        cliente={cabecera.cliente.nombre ?? ''}
                        sucio={sucio}
                        guardando={guardando}
                        motivoNoGuardar={carrito.length === 0 ? 'Agrega al menos un ítem a esta propuesta antes de guardar.' : null}
                        onGuardar={guardarCotizacion}
                        propuestas={propuestas}
                        activaId={propuestaActivaId}
                        ocupado={ocupado}
                        onActivar={activarPropuesta}
                        onNueva={nuevaPropuesta}
                        onRenombrar={renombrarPropuesta}
                        motivoNoNueva={motivoNoNueva}
                        segmento={cabecera.segmentoCliente}
                        onCambiarSegmento={cambiarSegmento}
                        cambiandoSegmento={cambiandoSegmento}
                        motivoNoSegmento={motivoNoSegmento}
                        cifras={{
                            items: carrito.length,
                            productos: totalesCarrito.productos,
                            manoObra: totalesCarrito.manoObra,
                            cargos: totalesCarrito.cargos,
                            total: usarGuardado && propuestaActiva ? propuestaActiva.totales.total : totalesCarrito.total,
                            sinGuardar: !usarGuardado && carrito.length > 0,
                        }}
                    />
                )}

                <FolderTabs
                    tabs={[
                        { key: 'cotizar', label: 'Cotizar', icon: <IconCotizar className="w-4 h-4" /> },
                        { key: 'actual', label: 'Actual', icon: <ClipboardList className="w-4 h-4" />, badge: carrito.length || undefined },
                        { key: 'guardadas', label: 'Guardadas', icon: <Archive className="w-4 h-4" /> },
                        { key: 'calibracion', label: 'Calibración', icon: <Gauge className="w-4 h-4" /> },
                        { key: 'configuracion', label: 'Configuración', icon: <Settings className="w-4 h-4" /> },
                    ]}
                    activeKey={activeTab}
                    onChange={cambiarTab}
                />
                <div className={activeTab === 'cotizar' || activeTab === 'actual' ? CUERPO_TRABAJO : FOLDER_BODY}>
                    {activeTab === 'cotizar' && (
                        <TabCotizar
                            modulos={modulos}
                            segmento={cabecera.segmentoCliente}
                            onAgregarItem={agregarItem}
                            edicion={itemEnEdicion}
                            onGuardarEdicion={guardarEdicionItem}
                            onCancelarEdicion={() => setItemEditandoId(null)}
                            bloqueo={bloqueoEdicion}
                            // El panel de cargos va SIEMPRE visible en Cotizar (lo pidió
                            // el usuario): el mismo estado que se ve en Actual, para que
                            // el vendedor no tenga que cambiar de pestaña para ajustar la
                            // mano de obra mientras arma el producto.
                            onBorrador={setBorrador}
                            panelCargos={
                                <>
                                    <PanelCargosObra
                                        // Plegable sólo aquí, al pie del flujo de Cotizar (paso 3);
                                        // en Actual se monta completo, como siempre.
                                        plegable
                                        valor={cargos}
                                        onChange={cambiarCargos}
                                        parametros={parametros}
                                        cotizacionId={edicion?.id ?? null}
                                        manoObra={legadoActiva ? [] : manoObraCotizar}
                                        cargandoManoObra={borrador ? cargandoManoObraBorrador : cargandoManoObraCarrito}
                                        notaManoObra={notaTotalCotizar}
                                        cantidadItems={carrito.length}
                                        etiquetaPropuesta={propuestaActiva?.etiqueta ?? null}
                                        legado={propuestaActiva?.legadoCargosEnItems}
                                        onDuplicarLegado={duplicarPropuesta}
                                        aprobada={Boolean(bloqueoEdicion)}
                                    />
                                    {/* Total en vivo: se mueve al marcar un cargo o cambiar el
                                        producto, sin ir a Actual ni guardar (pedido del usuario). */}
                                    <TotalPropuestaEnVivo
                                        totales={totalesCotizar}
                                        descuentoPct={descuentoPct}
                                        nota={notaTotalCotizar}
                                    />
                                </>
                            }
                            destino={{
                                etiqueta: propuestaActiva?.etiqueta ?? 'A',
                                nombre: propuestaActiva?.nombre ?? null,
                                items: carrito.length,
                                guardada: Boolean(edicion),
                            }}
                            onVerPropuesta={() => cambiarTab('actual')}
                        />
                    )}
                    {activeTab === 'actual' && (
                        <TabActual
                            carrito={carrito}
                            cabecera={cabecera}
                            onCambiarCabecera={(cambios) => { setCabecera(c => ({ ...c, ...cambios })); marcarSucio(); }}
                            onQuitarItem={quitarItem}
                            onGuardar={guardarCotizacion}
                            guardando={guardando}
                            numeroEnEdicion={edicion?.numero ?? null}
                            asesoresSugeridos={parametros?.asesores || []}
                            estadosDisponibles={(parametros?.estados_cotizacion as EstadoCotizacion[] | undefined) || ['PENDIENTE', 'APROBADA', 'CANCELADO', 'PERDIDO']}
                            parametros={parametros}
                            descuentoPct={descuentoPct}
                            onCambiarDescuento={(v) => { setDescuentoPct(v); marcarSucio(); }}
                            cargos={cargos}
                            onCambiarCargos={cambiarCargos}
                            manoObra={legadoActiva ? [] : manoObraCarrito}
                            cargandoManoObra={cargandoManoObraCarrito}
                            totalesPrevistos={totalesCarrito}
                            propuestas={controlPropuestas}
                            hayCambiosSinGuardar={sucio}
                            onNuevaCotizacion={nuevaCotizacion}
                            onEditarItem={editarItem}
                            onDuplicarItem={duplicarItem}
                            bloqueoEdicion={bloqueoEdicion}
                            modulosDisponibles={modulosDisponibles}
                        />
                    )}
                    {activeTab === 'guardadas' && (
                        <TabGuardadas onReabrir={reabrirCotizacion} abrirDetalleInicial={abrirDetalleInicial} />
                    )}
                    {activeTab === 'calibracion' && <TabCalibracion />}
                    {activeTab === 'configuracion' && <TabConfiguracion />}
                </div>
            </div>

            {clonando && edicion && (
                <ModalClonarPropuesta
                    cotizacionId={edicion.id}
                    propuesta={clonando}
                    segmentoCliente={cabecera.segmentoCliente}
                    onClose={() => setClonando(null)}
                    onClonada={trasClonar}
                />
            )}

            {preguntaCambios && (
                <ModalCambiosSinGuardar
                    accion={preguntaCambios.accion}
                    donde={dondeCambios}
                    puedeGuardar={carrito.length > 0}
                    onDecidir={preguntaCambios.resolver}
                />
            )}
        </div>
    );
};

export default CotizadorPage;
