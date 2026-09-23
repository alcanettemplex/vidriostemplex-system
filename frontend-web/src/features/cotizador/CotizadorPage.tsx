import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Calculator as IconCotizar, ClipboardList, Archive, Loader2, AlertTriangle, Gauge, Settings } from 'lucide-react';

import FolderTabs, { FOLDER_BODY } from '../../components/FolderTabs';
import {
    apiEstadoCotizador, apiGetParametros, apiCrearCotizacion, apiActualizarCotizacion,
    apiObtenerCotizacion, apiCrearPropuesta, apiElegirPropuesta, apiEliminarPropuesta,
    apiGuardarCargos, apiGetModulos, apiCambiarSegmento, apiCotizarItem,
} from './services/cotizadorApi';
import {
    ClienteCotizacion, Cotizacion, EstadoCotizacion, ItemCarrito, ModuloMeta, Parametros, Propuesta,
    RespuestaPropuesta, SegmentoCliente,
} from './types';
import { fmtCOP } from './format';
import TabCotizar, { ItemEnEdicion } from './components/TabCotizar';
import TabActual from './components/TabActual';
import TabGuardadas from './components/TabGuardadas';
import TabCalibracion from './components/TabCalibracion';
import TabConfiguracion from './components/TabConfiguracion';
import PanelCargosObra, { EstadoCargos, cargosADTO, cargosDesdeApi, cargosIniciales, resumenCargos } from './components/PanelCargosObra';
import ModalClonarPropuesta from './components/modals/ModalClonarPropuesta';
import { Chip } from './components/ui';

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

/** Dato de la barra de contexto: rótulo pequeño arriba, cifra debajo. Los tres
 * (ítems, productos, total) se leen como una fila de indicadores en vez de
 * como una frase corrida, que era lo que hacía difícil encontrar el total. */
const DatoContexto: React.FC<{ etiqueta: string; valor: React.ReactNode; destacado?: boolean }> = ({
    etiqueta, valor, destacado = false,
}) => (
    <div className="text-right">
        <div className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">{etiqueta}</div>
        <div
            className={`font-cotizador-head tabular-nums font-bold leading-tight whitespace-nowrap ${
                destacado ? 'text-[15px] text-indigo-700' : 'text-[13px] text-slate-800'
            }`}
        >
            {valor}
        </div>
    </div>
);

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

    const agregarItem = useCallback((item: ItemCarrito) => {
        setCarrito(c => [...c, item]);
        setSucio(true);
    }, []);

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
        const activaId = cot.propuestaActivaId
            ?? lista.find(p => p.elegida)?.id
            ?? lista[0]?.id
            ?? null;
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

    /** Toda acción de propuesta recarga desde el servidor: si hay cambios sin
     * guardar, se pregunta antes en vez de perderlos en silencio. */
    const confirmarDescarte = useCallback(() => {
        if (!sucio) return true;
        return window.confirm(
            'Tienes cambios sin guardar en esta propuesta (ítems, descuento o cargos). ' +
            'Si continúas se perderán. ¿Seguir de todas formas?'
        );
    }, [sucio]);

    const conError = (e: any, respaldo: string) => toast.error(e?.response?.data?.error || respaldo);

    const activarPropuesta = useCallback(async (pid: number) => {
        if (!edicion || pid === propuestaActivaId) return;
        if (!confirmarDescarte()) return;
        setOcupado(true);
        try {
            const { data } = await apiObtenerCotizacion(edicion.id, pid);
            aplicarCotizacion(data);
        } catch (e) {
            conError(e, 'No se pudo abrir esa propuesta.');
        } finally {
            setOcupado(false);
        }
    }, [edicion, propuestaActivaId, confirmarDescarte, aplicarCotizacion]);

    /** Propuesta nueva y VACÍA: el vendedor la llena desde Cotizar. */
    const nuevaPropuesta = useCallback(async () => {
        if (!edicion || !confirmarDescarte()) return;
        setOcupado(true);
        try {
            const { data } = await apiCrearPropuesta(edicion.id, {});
            aplicarCotizacion(data.cotizacion);
            toast.success('Propuesta creada. Agrégale ítems desde la pestaña Cotizar.');
        } catch (e) {
            conError(e, 'No se pudo crear la propuesta.');
        } finally {
            setOcupado(false);
        }
    }, [edicion, confirmarDescarte, aplicarCotizacion]);

    /** Copia EXACTA de la activa (mismos ítems, mismos cargos, sin recalcular).
     * Para cambiar el vidrio de golpe está el modal de clonado. */
    const duplicarPropuesta = useCallback(async () => {
        if (!edicion || !propuestaActivaId || !confirmarDescarte()) return;
        setOcupado(true);
        try {
            const { data } = await apiCrearPropuesta(edicion.id, { desdePropuestaId: propuestaActivaId });
            aplicarCotizacion(data.cotizacion);
            toast.success('Propuesta duplicada.');
        } catch (e) {
            conError(e, 'No se pudo duplicar la propuesta.');
        } finally {
            setOcupado(false);
        }
    }, [edicion, propuestaActivaId, confirmarDescarte, aplicarCotizacion]);

    const elegirPropuesta = useCallback(async (pid: number) => {
        if (!edicion || !confirmarDescarte()) return;
        setOcupado(true);
        try {
            const { data } = await apiElegirPropuesta(edicion.id, pid);
            aplicarCotizacion(data);
            toast.success('Propuesta marcada como elegida: es la que se cobra y la que sale a corte.');
        } catch (e) {
            conError(e, 'No se pudo elegir la propuesta.');
        } finally {
            setOcupado(false);
        }
    }, [edicion, confirmarDescarte, aplicarCotizacion]);

    const borrarPropuesta = useCallback(async (pid: number) => {
        if (!edicion) return;
        const p = propuestas.find(x => x.id === pid);
        if (!window.confirm(`¿Borrar la propuesta ${p?.etiqueta ?? ''}? Se pierden sus ítems y sus cargos.`)) return;
        setOcupado(true);
        try {
            const { data } = await apiEliminarPropuesta(edicion.id, pid);
            aplicarCotizacion(data);
            toast.success('Propuesta borrada.');
        } catch (e) {
            conError(e, 'No se pudo borrar la propuesta.');
        } finally {
            setOcupado(false);
        }
    }, [edicion, propuestas, aplicarCotizacion]);

    const abrirClonado = useCallback(() => {
        if (!confirmarDescarte()) return;
        const activa = propuestas.find(p => p.id === propuestaActivaId);
        if (activa) setClonando(activa);
    }, [confirmarDescarte, propuestas, propuestaActivaId]);

    const trasClonar = useCallback((r: RespuestaPropuesta) => {
        setClonando(null);
        aplicarCotizacion(r.cotizacion);
        toast.success('Variante creada con los cambios pedidos.');
        // El clonado no bloquea si algún ítem sale con errores de precio: se
        // avisa, una a una, para que el vendedor sepa qué revisar.
        for (const aviso of r.advertencias ?? []) toast.warn(aviso, { autoClose: 9000 });
    }, [aplicarCotizacion]);

    const guardarCotizacion = useCallback(async () => {
        if (carrito.length === 0) {
            toast.error('Agrega al menos un ítem antes de guardar.');
            return;
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
                toast.success(`Cotización N.° ${cot.numero} actualizada.`);
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
                cambiarTab('actual');
                toast.success(`Cotización N.° ${data.numero} guardada. Ya puedes añadirle propuestas alternativas.`);
            }
        } catch (e) {
            conError(e, 'No se pudo guardar la cotización.');
        } finally {
            setGuardando(false);
        }
    }, [carrito, cabecera, descuentoPct, cargos, cargosTocados, edicion, propuestaActivaId, aplicarCotizacion, cambiarTab]);

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
            if (!confirmarDescarte()) return;
            setCambiandoSegmento(true);
            try {
                const { data } = await apiCambiarSegmento(edicion.id, segmento, propuestaActivaId);
                aplicarCotizacion(data.cotizacion);
                toast.success(`Segmento cambiado a ${segmento}: se recalcularon los ítems de todas las propuestas.`);
                for (const aviso of data.advertencias ?? []) toast.warn(aviso, { autoClose: 9000 });
            } catch (e) {
                conError(e, 'No se pudo cambiar el segmento. No se modificó nada.');
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
            toast.success(`Segmento cambiado a ${segmento}: ${recalculados.length} ítem(s) recalculados.`);
        } catch (e) {
            conError(e, 'No se pudo recalcular algún ítem con el segmento nuevo. No se modificó nada.');
        } finally {
            setCambiandoSegmento(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cabecera.segmentoCliente, edicion, carrito, propuestaActivaId, confirmarDescarte, aplicarCotizacion]);

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

    const propuestaActiva = useMemo(
        () => propuestas.find(p => p.id === propuestaActivaId) ?? null,
        [propuestas, propuestaActivaId]
    );

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

    if (cargandoEstado) {
        return (
            <div className="p-10 flex items-center justify-center text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando cotizador…
            </div>
        );
    }

    if (!disponible) {
        return (
            <div className="p-10 text-center">
                <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                <p className="text-slate-700 font-semibold">El cotizador no está disponible en este momento.</p>
                <p className="text-slate-400 text-sm mt-1">
                    La caché de precios y diseños no cargó al iniciar el servidor. Avisa a soporte técnico.
                </p>
            </div>
        );
    }

    // Sólo el precio de lista de los productos. Ni el descuento ni los cargos ni
    // el IVA se suman aquí a propósito: esa cadena la resuelve el backend y su
    // resultado es `propuestaActiva.totales`, que es lo que se muestra al lado.
    const totalProductos = carrito.reduce((acc, it) => acc + (it.resultado.subtotalConAiu || 0), 0);
    // Cargos aparte de productos en la barra superior: son las dos mitades de lo
    // que se cobra y responden preguntas distintas ("¿cuánto vale el producto?"
    // y "¿cuánto la obra?"). Verlas sumadas sin desglosar obligaba a abrir la
    // pestaña Actual para saber por qué una cotización con el producto en cero
    // ya tiene total. El IVA no entra aquí: esto es el precio antes de impuesto,
    // que es como lo habla el vendedor.
    const totalCargosObra = resumenCargos(cargos, 0).base;

    const controlPropuestas = {
        propuestas,
        activaId: propuestaActivaId,
        cotizacionId: edicion?.id ?? null,
        ocupado,
        onActivar: activarPropuesta,
        onNueva: nuevaPropuesta,
        onDuplicar: duplicarPropuesta,
        onClonar: abrirClonado,
        onElegir: elegirPropuesta,
        onBorrar: borrarPropuesta,
    };

    return (
        <div className="p-4 md:p-6 font-cotizador">
            <div className="relative">
                {/* Barra de contexto: visible en las pestañas de cotización (no en
                    Calibración ni Configuración, que no tienen carrito ni cliente en
                    construcción), por eso vive en el shell y no en cada Tab. */}
                {activeTab !== 'calibracion' && activeTab !== 'configuracion' && (
                    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 bg-white border border-slate-200 rounded-xl px-4 py-2.5 mb-3">
                        {/* Izquierda: en qué estás. El punto de color y los chips dicen
                            el estado; el cliente va debajo en gris, que es donde el ojo
                            no lo confunde con el número de cotización. */}
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${edicion ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                />
                                <span className="text-[13px] font-bold text-slate-800 font-cotizador-head tabular-nums">
                                    {edicion ? `Cotización N.° ${edicion.numero}` : 'Cotización sin guardar'}
                                </span>
                                {propuestaActiva && (
                                    <Chip tono="indigo">
                                        Propuesta {propuestaActiva.etiqueta}
                                        {propuestaActiva.elegida ? ' · elegida' : ''}
                                    </Chip>
                                )}
                                {sucio && <Chip tono="ambar">Cambios sin guardar</Chip>}
                            </div>
                            <div className="text-[12px] text-slate-500 truncate mt-0.5">
                                {cabecera.cliente.nombre || 'Cliente sin asignar'}
                            </div>
                        </div>

                        {/* Derecha: las cifras. Mismos tres datos de siempre —los ítems
                            de la propuesta, el precio de lista de los productos y el
                            total que quedó guardado—, ahora alineados y con el total
                            destacado. */}
                        <div className="flex items-center gap-5">
                            <DatoContexto etiqueta="Ítems" valor={carrito.length} />
                            <DatoContexto etiqueta="Productos" valor={fmtCOP(totalProductos)} />
                            <DatoContexto etiqueta="Cargos de obra" valor={fmtCOP(totalCargosObra)} />
                            {propuestaActiva && (
                                <DatoContexto
                                    etiqueta="Total guardado"
                                    valor={fmtCOP(propuestaActiva.totales.total)}
                                    destacado
                                />
                            )}
                        </div>
                    </div>
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
                            panelCargos={
                                <PanelCargosObra
                                    valor={cargos}
                                    onChange={cambiarCargos}
                                    parametros={parametros}
                                    cotizacionId={edicion?.id ?? null}
                                    propuestaId={propuestaActivaId}
                                    // Con la cotización aún sin guardar no hay propuesta
                                    // a la que pedirle la sugerencia de mano de obra, así
                                    // que va el carrito: el cálculo sigue siendo del
                                    // backend, sólo cambia de dónde saca los ítems.
                                    itemsBorrador={carrito.map(it => ({
                                        moduloId: it.moduloId,
                                        input: it.input,
                                        resultado: it.resultado as unknown as Record<string, unknown>,
                                    }))}
                                    etiquetaPropuesta={propuestaActiva?.etiqueta ?? null}
                                    legado={propuestaActiva?.legadoCargosEnItems}
                                    onDuplicarLegado={duplicarPropuesta}
                                    aprobada={Boolean(bloqueoEdicion)}
                                />
                            }
                            destino={
                                propuestaActiva
                                    ? `Propuesta ${propuestaActiva.etiqueta}${propuestaActiva.nombre ? ` · ${propuestaActiva.nombre}` : ''}`
                                    : 'Cotización nueva sin guardar'
                            }
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
                            propuestas={controlPropuestas}
                            hayCambiosSinGuardar={sucio}
                            onNuevaCotizacion={limpiarCotizacionActual}
                            onEditarItem={editarItem}
                            onDuplicarItem={duplicarItem}
                            onCambiarSegmento={cambiarSegmento}
                            cambiandoSegmento={cambiandoSegmento}
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
        </div>
    );
};

export default CotizadorPage;
