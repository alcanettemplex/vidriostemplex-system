import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Calculator as IconCotizar, ClipboardList, Archive, Loader2, AlertTriangle } from 'lucide-react';

import FolderTabs, { FOLDER_BODY } from '../../components/FolderTabs';
import { apiEstadoCotizador, apiGetParametros } from './services/cotizadorApi';
import {
    ClienteCotizacion, Cotizacion, EstadoCotizacion, ItemCarrito, Parametros, SegmentoCliente,
} from './types';
import { fmtCOP } from './format';
import TabCotizar from './components/TabCotizar';
import TabActual from './components/TabActual';
import TabGuardadas from './components/TabGuardadas';
import { apiCrearCotizacion, apiActualizarCotizacion } from './services/cotizadorApi';

// ─────────────────────────────────────────────────────────────────────────────
// Módulo Cotizador — /cotizador, solo root/admin.
//
// Una sola página con 3 pestañas (Cotizar / Actual / Guardadas) en vez de
// rutas anidadas: mismo patrón que Proveedores, CRM y ROOT (ver plan de
// migración, "Navegación"). El carrito de la cotización en construcción vive
// aquí, en estado local — no en Redux: es estado que solo importa mientras
// esta página está montada y ningún otro módulo del ERP lo necesita leer
// (mismo criterio que ya usa el Explorador de ODP).
// ─────────────────────────────────────────────────────────────────────────────

export interface CabeceraCotizacion {
    cliente: ClienteCotizacion;
    segmentoCliente: SegmentoCliente;
    asesor: string;
    descuentoPct: number;
    estado: EstadoCotizacion;
}

const CABECERA_INICIAL: CabeceraCotizacion = {
    cliente: { nombre: '', direccion: '', telefono: '', obra: '', contacto: '' },
    segmentoCliente: 'PA',
    asesor: '',
    descuentoPct: 0,
    estado: 'PENDIENTE',
};

type TabKey = 'cotizar' | 'actual' | 'guardadas';

const CotizadorPage: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const tabInicial = (searchParams.get('tab') as TabKey) || 'cotizar';
    const [activeTab, setActiveTab] = useState<TabKey>(tabInicial);

    const [cargandoEstado, setCargandoEstado] = useState(true);
    const [disponible, setDisponible] = useState<boolean | null>(null);
    const [parametros, setParametros] = useState<Parametros | null>(null);

    const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
    const [cabecera, setCabecera] = useState<CabeceraCotizacion>(CABECERA_INICIAL);
    const [edicion, setEdicion] = useState<{ id: number; numero: number } | null>(null);
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        apiEstadoCotizador()
            .then(res => setDisponible(!!res.data?.disponible))
            .catch(() => setDisponible(false))
            .finally(() => setCargandoEstado(false));

        apiGetParametros()
            .then(res => setParametros(res.data))
            .catch(() => { /* la pestaña Actual cae a valores por defecto sin bloquear */ });
    }, []);

    const cambiarTab = (key: string) => {
        setActiveTab(key as TabKey);
        const next = new URLSearchParams(searchParams);
        next.set('tab', key);
        if (key !== 'guardadas') { next.delete('id'); next.delete('vista'); }
        setSearchParams(next, { replace: true });
    };

    const agregarItem = useCallback((item: ItemCarrito) => {
        setCarrito(c => [...c, item]);
    }, []);

    const quitarItem = useCallback((idTemp: string) => {
        setCarrito(c => c.filter(i => i.idTemp !== idTemp));
    }, []);

    const limpiarCotizacionActual = useCallback(() => {
        setCarrito([]);
        setCabecera(CABECERA_INICIAL);
        setEdicion(null);
    }, []);

    /** Carga en el carrito una cotización guardada, para editarla. */
    const reabrirCotizacion = useCallback((cot: Cotizacion) => {
        setCabecera({
            cliente: cot.cliente,
            segmentoCliente: cot.segmentoCliente,
            asesor: cot.asesor,
            descuentoPct: cot.descuentoPct,
            estado: cot.estado,
        });
        setCarrito(cot.items.map(it => ({
            idTemp: `existente-${it.id}`,
            moduloId: it.moduloId,
            moduloNombre: it.moduloId,
            descripcionItem: it.descripcionItem,
            input: it.input,
            resultado: it.resultado,
        })));
        setEdicion({ id: cot.id, numero: cot.numero });
        cambiarTab('actual');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const guardarCotizacion = useCallback(async () => {
        if (carrito.length === 0) {
            toast.error('Agrega al menos un ítem antes de guardar.');
            return;
        }
        setGuardando(true);
        try {
            const datos = {
                cliente: cabecera.cliente,
                segmentoCliente: cabecera.segmentoCliente,
                asesor: cabecera.asesor,
                descuentoPct: cabecera.descuentoPct,
                estado: cabecera.estado,
                items: carrito.map(it => ({
                    moduloId: it.moduloId,
                    descripcionItem: it.descripcionItem,
                    input: it.input,
                    resultado: it.resultado,
                })),
            };
            const resp = edicion
                ? await apiActualizarCotizacion(edicion.id, datos)
                : await apiCrearCotizacion(datos);
            toast.success(`Cotización N.° ${resp.data.numero} guardada.`);
            limpiarCotizacionActual();
            const next = new URLSearchParams(searchParams);
            next.set('tab', 'guardadas');
            next.set('id', String(resp.data.id));
            setSearchParams(next, { replace: true });
            setActiveTab('guardadas');
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo guardar la cotización.');
        } finally {
            setGuardando(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [carrito, cabecera, edicion, searchParams]);

    const abrirDetalleInicial = useMemo(() => {
        const id = searchParams.get('id');
        if (!id) return undefined;
        const vista = searchParams.get('vista') === 'tecnico' ? 'tecnico' as const : 'normal' as const;
        return { id: Number(id), vista };
    }, [searchParams]);

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

    const totalCarrito = carrito.reduce((acc, it) => acc + (it.resultado.total || 0), 0);

    return (
        <div className="p-4 md:p-6 font-cotizador">
            <div className="relative">
                {/* Barra de contexto: visible en las 3 pestañas, por eso vive en el shell
                    y no en cada Tab. No incluye el módulo de producto activo a propósito
                    — esa selección es estado interno de TabCotizar y el selector "spotlight"
                    ya la muestra ahí mismo; duplicarla aquí exigiría subirla de nivel sin
                    que ningún otro consumidor la necesite. */}
                <div className="flex flex-wrap items-center justify-between gap-2 bg-gradient-to-b from-indigo-50 to-violet-50 border border-indigo-100 rounded-xl px-4 py-2.5 mb-3">
                    <div className="flex items-center gap-2 text-[12.5px] font-bold text-indigo-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-300 flex-shrink-0" />
                        {edicion ? `Editando cotización N.° ${edicion.numero}` : 'Cotización sin guardar'}
                        {' · '}
                        {cabecera.cliente.nombre || 'Cliente sin asignar'}
                    </div>
                    <div className="flex items-center gap-4 text-[12.5px] text-indigo-700">
                        <span>{carrito.length} ítem{carrito.length === 1 ? '' : 's'} en el carrito</span>
                        <span>
                            Total estimado{' '}
                            <span className="font-cotizador-head font-bold text-sm text-indigo-950">{fmtCOP(totalCarrito)}</span>
                        </span>
                    </div>
                </div>

                <FolderTabs
                    tabs={[
                        { key: 'cotizar', label: 'Cotizar', icon: <IconCotizar className="w-4 h-4" /> },
                        { key: 'actual', label: 'Actual', icon: <ClipboardList className="w-4 h-4" />, badge: carrito.length || undefined },
                        { key: 'guardadas', label: 'Guardadas', icon: <Archive className="w-4 h-4" /> },
                    ]}
                    activeKey={activeTab}
                    onChange={cambiarTab}
                />
                <div className={FOLDER_BODY}>
                    {activeTab === 'cotizar' && (
                        <TabCotizar segmentoDefault={cabecera.segmentoCliente} onAgregarItem={agregarItem} />
                    )}
                    {activeTab === 'actual' && (
                        <TabActual
                            carrito={carrito}
                            cabecera={cabecera}
                            onCambiarCabecera={(cambios) => setCabecera(c => ({ ...c, ...cambios }))}
                            onQuitarItem={quitarItem}
                            onGuardar={guardarCotizacion}
                            guardando={guardando}
                            numeroEnEdicion={edicion?.numero ?? null}
                            asesoresSugeridos={parametros?.asesores || []}
                            estadosDisponibles={(parametros?.estados_cotizacion as EstadoCotizacion[] | undefined) || ['PENDIENTE', 'APROBADA', 'CANCELADO', 'PERDIDO']}
                        />
                    )}
                    {activeTab === 'guardadas' && (
                        <TabGuardadas onReabrir={reabrirCotizacion} abrirDetalleInicial={abrirDetalleInicial} />
                    )}
                </div>
            </div>
        </div>
    );
};

export default CotizadorPage;
