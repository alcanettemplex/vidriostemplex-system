import React, { useState, useEffect, useRef } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Plus, Minus, Trash2, X, FileCheck, DollarSign, Package, AlertCircle, ChevronRight, ChevronLeft, Briefcase, Calendar, Check, Lock } from '../../../components/ui/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector } from 'react-redux';
import { getClientesCached, getCatalogoCached } from '../../../services/listasCache';
import API from '../../../services/config';
import PartirDeCotizacion, { DatosDeCotizacion } from '../../cotizador/components/PartirDeCotizacion';
import { apiActualizarCotizacion } from '../../cotizador/services/cotizadorApi';
import { numeroCotizacion } from '../../cotizador/format';

const COLORES_VIDRIO = ['Incoloro', 'Bronce', 'Gris', 'Azul', 'Verde', 'Mate', 'Otro'];

const itemSchema = z.object({
    tipo_vidrio: z.string().nullable().optional(),
    color: z.string().nullable().optional(),
    espesor: z.string().min(1),
    ancho_mm: z.coerce.number().positive(),
    alto_mm: z.coerce.number().positive(),
    cantidad: z.coerce.number().int().positive(),
    pulidos: z.string().nullable().optional(),
    pulidos_h: z.string().nullable().optional(),
    perforaciones: z.coerce.number().int().nonnegative().optional(),
    boquetes: z.coerce.number().int().nonnegative().optional(),
    descuentos: z.string().nullable().optional(),
    otros: z.string().nullable().optional(),
    prod: z.string().nullable().optional()
});

const servicioSchema = z.object({
    cantidad: z.coerce.number().int().positive('Mayor a 0').default(1),
    tipo_servicio: z.string().min(1, 'Obligatorio'),
    descripcion: z.string().min(1, 'Obligatorio')
});

const odpSchema = z.object({
    cliente_id: z.coerce.number().positive('Debe seleccionar cliente'),
    fecha_entrega: z.string().optional(),
    servicios_detalle: z.array(servicioSchema).min(1, 'Debe agregar al menos un servicio'),
    nombre_recibe: z.string().min(1, 'Nombre del contacto en obra requerido'),
    telefono_recibe: z.string().min(1, 'Teléfono del contacto en obra requerido'),
    cargo_recibe: z.string().optional(),
    observaciones: z.string().optional(),
    direccion_instalacion: z.string().min(1, 'Dirección requerida'),
    matizado: z.boolean().optional().default(false),
    pelicula: z.boolean().optional().default(false),
    acarreo: z.boolean().optional().default(false),
    instalacion: z.boolean().optional().default(false),
    huacal: z.boolean().optional().default(false),
    carton: z.boolean().optional().default(false),
    valor_total: z.coerce.number().min(0, 'No puede ser negativo').optional(),
    forma_pago: z.string().optional(),
    proveedor_vidrio: z.string().optional(),
    numero_pedido_proveedor: z.string().optional(),
    items: z.array(itemSchema).optional(),
    requiere_visita_tecnica: z.boolean().optional().default(false),
    es_no_conformidad: z.boolean().optional().default(false),
});

type ItemFormValues = {
    id?: number;                    // presente en ítems existentes (edición); ausente = ítem nuevo
    pedido_pv_id?: number | null;   // si != null, el vidrio ya está en un Pedido PV → protegido
    estado_compra?: string;         // 'en_odc' | 'en_existencia' → ya en Compras → protegido
    tipo_vidrio?: string;
    color?: string;
    espesor: string;
    ancho_mm: number;
    alto_mm: number;
    cantidad: number;
    pulidos?: string | undefined;
    pulidos_h?: string | undefined;
    perforaciones?: number | undefined;
    boquetes?: number | undefined;
    descuentos?: string | undefined;
    otros?: string | undefined;
    prod?: string | undefined;
};

type ServicioFormValues = {
    cantidad: number;
    tipo_servicio: string;
    descripcion: string;
};

type ODPFormValues = {
    cliente_id: number;
    fecha_entrega?: string;
    servicios_detalle: ServicioFormValues[];
    nombre_recibe: string;
    telefono_recibe: string;
    cargo_recibe?: string;
    observaciones?: string;
    direccion_instalacion: string;
    matizado: boolean;
    pelicula: boolean;
    acarreo: boolean;
    instalacion: boolean;
    huacal: boolean;
    carton: boolean;
    valor_total?: number | undefined;
    forma_pago?: string;
    proveedor_vidrio?: string;
    numero_pedido_proveedor?: string;
    items: ItemFormValues[];
    requiere_visita_tecnica?: boolean;
    es_no_conformidad?: boolean;
};

interface ODPFormProps {
    onClose: () => void;
    onSuccess: () => void;
    odpToEdit?: any;
    asesorId?: number | null; // si se proporciona, sobreescribe el asesor del usuario logueado
    tipoOdp?: 'ODP' | 'OA';  // tipo de orden seleccionado antes de abrir el form
}

type CatalogoItem = { id: number; categoria: string; nombre: string; descripcion: string };

const ColorField: React.FC<{ index: number; register: any; control: any }> = ({ index, register, control }) => {
    const colorVal = useWatch({ control, name: `items.${index}.color` });
    return (
        <div className="w-full lg:w-2/12">
            <label className="block text-xs font-semibold text-slate-900 uppercase tracking-wider mb-1">Color</label>
            <select
                {...register(`items.${index}.color`)}
                className="w-full p-2 text-sm border border-slate-400 rounded focus:ring-2 focus:ring-blue-500 bg-white"
            >
                <option value="">—</option>
                {COLORES_VIDRIO.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {colorVal === 'Otro' && (
                <input
                    {...register(`items.${index}.tipo_vidrio`)}
                    placeholder="Especificar color..."
                    className="w-full mt-1 p-2 text-sm border border-blue-300 rounded focus:ring-2 focus:ring-blue-500"
                />
            )}
        </div>
    );
};

const FUENTES_CLIENTE = ['WhatsApp', 'Web', 'Facebook', 'Instagram', 'Llamada', 'Presencial', 'Show Room', 'Referidos', 'Visita Asesor', 'Cliente'];

// ─── Paso 1, rediseño visual (2026-09-27) ────────────────────────────────────
// Solo presentación: los campos, validaciones y el payload no cambian.
// Todos los controles miden 40 px (h-10) y comparten borde; `min-w-0` evita que
// un <select> con opciones largas empuje la tarjeta y abra scroll horizontal.
const CONTROL = 'h-10 w-full min-w-0 rounded-lg border bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500';
const borde = (error?: unknown) => (error ? 'border-rose-400' : 'border-slate-400');
const ROTULO = 'block text-sm font-semibold text-slate-900 mb-1';
const ROTULO_LINEA = 'block text-xs font-semibold text-slate-900 mb-1';
const REQUERIMIENTOS = [
    { key: 'matizado', label: 'Matizado' },
    { key: 'pelicula', label: 'Película' },
    { key: 'acarreo', label: 'Acarreo' },
    { key: 'instalacion', label: 'Instalación' },
    { key: 'huacal', label: 'Huacal' },
    { key: 'carton', label: 'Cartón' },
] as const;
/** 1250000 → "1.250.000"; 0 o vacío → "" (el placeholder hace de cero). */
const conMiles = (n: unknown) => {
    const v = Number(n);
    return Number.isFinite(v) && v > 0 ? Math.round(v).toLocaleString('es-CO') : '';
};

const ODPForm: React.FC<ODPFormProps> = ({ onClose, onSuccess, odpToEdit, asesorId, tipoOdp }) => {
    const authUser = useSelector((state: any) => state.auth.user);
    const userRole = (authUser?.rol || authUser?.role)?.toLowerCase() || '';
    const esEdicion = !!odpToEdit;
    // Orden Azul (OA): no aplica IVA ni subtotal. Al editar, tipoOdp llega undefined → detectar por odpToEdit.
    const esOA = tipoOdp === 'OA' || odpToEdit?.tipo_odp === 'OA';
    // La forma de pago solo puede cambiarse tras crear la ODP si el rol es admin o gerencia.
    const puedeEditarFormaPago = !esEdicion || ['admin', 'gerencia'].includes(userRole);
    const [step, setStep] = useState(1);
    const [clientes, setClientes] = useState<{ id: number; nombre_razon_social: string; numero_documento?: string; fuente?: string | null }[]>([]);
    const [clienteFuente, setClienteFuente] = useState('');
    const [catalogo, setCatalogo] = useState<CatalogoItem[]>([]);
    const [categorias, setCategorias] = useState<string[]>([]);
    const [catSeleccionada, setCatSeleccionada] = useState<Record<number, string>>({});
    const [siguienteNumeroPV, setSiguienteNumeroPV] = useState<number | null>(null);
    const [clienteBusqueda, setClienteBusqueda] = useState('');
    const [dropdownClienteAbierto, setDropdownClienteAbierto] = useState(false);
    const [clienteSeleccionadoObj, setClienteSeleccionadoObj] = useState<{ id: number; nombre_razon_social: string; numero_documento?: string; fuente?: string | null } | null>(null);
    /** Cotización aprobada de la que parte esta ODP (2026-09-27): al crearla se vincula. */
    const [deCotizacion, setDeCotizacion] = useState<DatosDeCotizacion | null>(null);
    const [prospectosBanner, setProspectosBanner] = useState<{ id: number; numero_prospecto: string; descripcion: string }[]>([]);
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [calendarMes, setCalendarMes] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [cargaDias, setCargaDias] = useState<Record<string, number>>({});
    const [modalDia, setModalDia] = useState<string | null>(null);
    const [detalleDia, setDetalleDia] = useState<any[]>([]);
    const [loadingDetalle, setLoadingDetalle] = useState(false);
    const calendarRef = useRef<HTMLDivElement>(null);

    const { register, control, handleSubmit, trigger, reset, setValue, getValues, formState: { errors, isSubmitting } } = useForm<ODPFormValues>({
        resolver: zodResolver(odpSchema as any),
        defaultValues: {
            servicios_detalle: [{ cantidad: 1, tipo_servicio: '', descripcion: '' }],
            fecha_entrega: '',
            nombre_recibe: '',
            telefono_recibe: '',
            cargo_recibe: '',
            observaciones: '',
            direccion_instalacion: '',
            matizado: false,
            pelicula: false,
            acarreo: false,
            instalacion: false,
            huacal: false,
            carton: false,
            items: [],
            valor_total: 0,
            forma_pago: '',
            es_no_conformidad: false
        }
    });

    const { fields: itemFields, append: appendItem, remove: removeItem } = useFieldArray({
        control,
        name: 'items',
        keyName: 'rhfKey', // no usar 'id' como key interno: colisiona con el id de negocio del ítem
    });

    const valorTotalRaw = useWatch({ control, name: 'valor_total' }) || 0;
    const proveedorVidrio = useWatch({ control, name: 'proveedor_vidrio' });
    const clienteIdWatch = useWatch({ control, name: 'cliente_id' });
    const fechaEntregaWatch = useWatch({ control, name: 'fecha_entrega' });
    const requerimientosWatch = useWatch({ control, name: REQUERIMIENTOS.map(r => r.key) as any }) as unknown as boolean[];
    // "Lleva vidrio" no es un campo: muestra el proveedor, que es el que crea el
    // Pedido PV al guardar. Con un pedido ya creado el backend no deja vaciar el
    // proveedor (409), así que el chip queda fijo y lo explica.
    const [llevaVidrio, setLlevaVidrio] = useState(false);
    const pedidoPvCreado = esEdicion && !!odpToEdit?.proveedor_vidrio && !!odpToEdit?.numero_pedido_proveedor;
    useEffect(() => { if (proveedorVidrio) setLlevaVidrio(true); }, [proveedorVidrio]);
    const alternarVidrio = () => {
        if (pedidoPvCreado) return;
        if (llevaVidrio) setValue('proveedor_vidrio', '');
        setLlevaVidrio(v => !v);
    };
    const clienteSeleccionadoODP = clienteSeleccionadoObj || clientes.find(c => c.id === Number(clienteIdWatch));
    // En creación, si el cliente seleccionado aún no tiene fuente registrada, hay que pedirla
    const requiereClienteFuente = !odpToEdit && !!clienteSeleccionadoODP && !clienteSeleccionadoODP.fuente;

    // Verificar prospectos en gestión al seleccionar cliente (solo en creación)
    useEffect(() => {
        if (odpToEdit || !clienteIdWatch) { setProspectosBanner([]); return; }
        const token = sessionStorage.getItem('token');
        axios.get(`${API}/api/prospectos/cliente/${clienteIdWatch}/en-gestion`, {
            headers: { Authorization: `Bearer ${token}` },
        }).then(r => setProspectosBanner(r.data)).catch(() => setProspectosBanner([]));
    }, [clienteIdWatch, odpToEdit]);

    useEffect(() => {
        if (!calendarOpen) return;
        const token = sessionStorage.getItem('token');
        axios.get(`${API}/api/odp/carga-por-fecha?mes=${calendarMes}`, {
            headers: { Authorization: `Bearer ${token}` }
        }).then(r => setCargaDias(r.data)).catch(() => setCargaDias({}));
    }, [calendarOpen, calendarMes]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
                setCalendarOpen(false);
            }
        };
        if (calendarOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [calendarOpen]);

    const IVA_RATE = 0.19;
    const subtotal = Number(valorTotalRaw) / (1 + IVA_RATE);
    const ivaValor = Number(valorTotalRaw) - subtotal;
    const fmtCOP = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

    const { fields: servicioFields, append: appendServicio, remove: removeServicio } = useFieldArray({
        control,
        name: 'servicios_detalle'
    });

    const clienteSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Búsqueda server-side de clientes para el dropdown
    useEffect(() => {
        if (clienteSearchRef.current) clearTimeout(clienteSearchRef.current);
        if (clienteBusqueda.trim().length < 2) { setClientes([]); return; }
        clienteSearchRef.current = setTimeout(async () => {
            try {
                const data = await getClientesCached(clienteBusqueda);
                setClientes(data);
            } catch { setClientes([]); }
        }, 300);
        return () => { if (clienteSearchRef.current) clearTimeout(clienteSearchRef.current); };
    }, [clienteBusqueda]);

    // Carga única al montar. `odpToEdit` no va en las dependencias a propósito: el
    // formulario se monta de nuevo cada vez que se abre (ODPListPage lo renderiza solo
    // con `isFormOpen || editingOdp`), así que no puede cambiar de ODP estando abierto.
    useEffect(() => {
        getCatalogoCached().then(data => {
            setCatalogo(data);
            const cats = Array.from(new Set<string>(data.map((i: CatalogoItem) => i.categoria)));
            setCategorias(cats);
        }).catch(() => {});
        if (!odpToEdit) {
            // El token lo pone el interceptor global (services/httpInterceptors.ts)
            axios.get(`${API}/api/pedidos-pv/siguiente-numero`)
                .then(r => setSiguienteNumeroPV(r.data.siguiente))
                .catch(() => {});
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const nextStep = async () => {
        const isStepValid = await trigger(['cliente_id', 'servicios_detalle', 'nombre_recibe', 'telefono_recibe', 'direccion_instalacion']);
        if (requiereClienteFuente && !clienteFuente) {
            toast.error('Selecciona la fuente del cliente para continuar.');
            return;
        }
        if (isStepValid) {
            setStep(2);
        }
    };

    useEffect(() => {
        if (odpToEdit) {
            if (odpToEdit.fecha_entrega) {
                setCalendarMes(odpToEdit.fecha_entrega.split('T')[0].substring(0, 7));
            }
            if (odpToEdit.cliente) {
                setClienteSeleccionadoObj({
                    id: odpToEdit.cliente_id,
                    nombre_razon_social: odpToEdit.cliente.nombre_razon_social,
                    numero_documento: odpToEdit.cliente.numero_documento,
                    fuente: odpToEdit.cliente.fuente,
                });
            }
            reset({
                cliente_id: odpToEdit.cliente_id,
                fecha_entrega: odpToEdit.fecha_entrega ? odpToEdit.fecha_entrega.split('T')[0] : '',
                servicios_detalle: odpToEdit.servicios_detalle?.length ? odpToEdit.servicios_detalle : [{ cantidad: odpToEdit.cantidad_total || 1, tipo_servicio: odpToEdit.tipo_servicio || '', descripcion: odpToEdit.descripcion_pedido || '' }],
                nombre_recibe: odpToEdit.nombre_recibe || '',
                telefono_recibe: odpToEdit.telefono_recibe || '',
                cargo_recibe: odpToEdit.cargo_recibe || '',
                observaciones: odpToEdit.observaciones || '',
                direccion_instalacion: odpToEdit.direccion_instalacion || '',
                matizado: odpToEdit.matizado || false,
                pelicula: odpToEdit.pelicula || false,
                acarreo: odpToEdit.acarreo || false,
                instalacion: odpToEdit.instalacion || false,
                huacal: odpToEdit.huacal || false,
                carton: odpToEdit.carton || false,
                items: odpToEdit.items || [],
                valor_total: odpToEdit.valor_total || 0,
                forma_pago: odpToEdit.forma_pago || '',
                proveedor_vidrio: odpToEdit.proveedor_vidrio || '',
                numero_pedido_proveedor: odpToEdit.numero_pedido_proveedor || ''
            });
        }
    }, [odpToEdit, reset]);

    const prevStep = () => {
        setStep(1);
    };

    const onSubmit = async (data: ODPFormValues) => {
        try {
            if (requiereClienteFuente && !clienteFuente) {
                toast.error('Selecciona la fuente del cliente.');
                return;
            }
            const token = sessionStorage.getItem('token');
            const { requiere_visita_tecnica, es_no_conformidad, ...rest } = data;
            const sinItems = itemFields.length === 0;
            // Adjuntar el id de negocio a cada vidrio existente para la edición incremental del
            // backend. itemFields conserva el id original por posición; los ítems nuevos no tienen id.
            const itemsConId = data.items.map((it, idx) => {
                const original = itemFields[idx] as ItemFormValues | undefined;
                return original?.id ? { ...it, id: original.id } : it;
            });
            const payload = {
                ...rest,
                items: itemsConId,
                ...(requiereClienteFuente && clienteFuente ? { cliente_fuente: clienteFuente } : {}),
                cantidad_total: data.servicios_detalle.reduce((acc, curr) => acc + curr.cantidad, 0),
                tipo_servicio: data.servicios_detalle[0].tipo_servicio,
                descripcion_pedido: data.servicios_detalle.map(s => `${s.cantidad}x ${s.tipo_servicio}: ${s.descripcion}`).join('\n'),
                ...(!odpToEdit ? {
                    estado_produccion: requiere_visita_tecnica
                        ? 'VISITA_TECNICA'
                        : itemFields.length > 0
                            ? 'MEDICION'
                            : 'EN_ESPERA'
                } : {}),
                // Si se asignó a otro asesor desde el modal previo, incluir en el payload.
                // Si parte de una cotización, manda su asesor (2026-09-27).
                ...((deCotizacion?.asesorUsuarioId ?? asesorId) ? { asesor_id: deCotizacion?.asesorUsuarioId ?? asesorId } : {}),
                // Tipo de orden (ODP normal o OA sin IVA)
                ...(!odpToEdit && tipoOdp ? { tipo_odp: tipoOdp } : {}),
                // Pago adelantado sin requerimientos de vidrio
                ...(!odpToEdit && sinItems ? { sin_items: true } : {}),
                // Reposición / No Conformidad sin cobro (solo en creación)
                ...(!odpToEdit && es_no_conformidad ? { es_no_conformidad: true } : {}),
            };

            if (odpToEdit) {
                await axios.put(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/odp/${odpToEdit.id}`, payload, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                toast.success('ODP Actualizada Exitosamente');
            } else {
                const { data: creada } = await axios.post(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/odp`, payload, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                toast.success('ODP Creada Exitosamente');
                // Vincular la cotización de la que partió (no bloquea: la ODP ya existe).
                if (deCotizacion && creada?.id) {
                    try {
                        await apiActualizarCotizacion(deCotizacion.cotizacionId, { odpId: Number(creada.id) });
                    } catch (e: any) {
                        toast.warn(`La ODP se creó, pero no se pudo vincular la cotización ${numeroCotizacion(deCotizacion.numero)}: `
                            + (e?.response?.data?.error || 'vincúlala desde la ficha de la ODP.'));
                    }
                }
            }
            onSuccess();
        } catch (error: any) {
            toast.error(error.response?.data?.error || `Error al ${odpToEdit ? 'actualizar' : 'crear'} ODP`);
        }
    };

    const MESES_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    const navegarMes = (delta: number) => {
        const [y, m] = calendarMes.split('-').map(Number);
        const d = new Date(y, m - 1 + delta, 1);
        setCalendarMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    };

    const abrirDetalleDia = async (dia: string) => {
        setModalDia(dia);
        setLoadingDetalle(true);
        setDetalleDia([]);
        const token = sessionStorage.getItem('token');
        try {
            const r = await axios.get(`${API}/api/odp/carga-por-fecha/${dia}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setDetalleDia(r.data);
        } catch {
            setDetalleDia([]);
        } finally {
            setLoadingDetalle(false);
        }
    };

    const fmtFechaBtn = (iso: string) => {
        const [y, m, d] = iso.split('-');
        return `${d}/${m}/${y}`;
    };

    const fmtFechaModal = (iso: string) => {
        const [y, m, d] = iso.split('-').map(Number);
        return `${d} de ${MESES_ES[m - 1]} de ${y}`;
    };

    const [calY, calM] = calendarMes.split('-').map(Number);
    const calPrimerDia = new Date(calY, calM - 1, 1).getDay();
    const calTotalDias = new Date(calY, calM, 0).getDate();
    const hoy = new Date().toISOString().split('T')[0];

    return (
        <>
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl border border-slate-200 shadow-float w-full max-w-6xl max-h-[90vh] overflow-y-auto"
            >
                <div className="sticky top-0 bg-white/90 backdrop-blur-md px-6 py-4 border-b border-slate-200 flex justify-between items-center z-10">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                            <FileCheck className="w-5 h-5 text-blue-600" />
                            {odpToEdit ? 'Editar Orden de Producción' : 'Nueva Orden de Producción'}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="p-6">
                    {/* STEP PROGRESS BAR */}
                    <div className="flex items-center gap-4 mb-8 max-w-lg mx-auto">
                        <div className="flex-1 text-center">
                            <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center font-bold mb-2 transition-colors ${step === 1 ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-600'}`}>
                                1
                            </div>
                            <span className={`text-xs font-bold uppercase ${step === 1 ? 'text-blue-700' : 'text-slate-700'}`}>Acuerdo Comercial</span>
                        </div>
                        <div className="flex-1 h-1 bg-slate-200 rounded-full mb-6">
                            <div className={`h-full bg-blue-600 rounded-full transition-all duration-300 ${step === 2 ? 'w-full' : 'w-0'}`}></div>
                        </div>
                        <div className="flex-1 text-center">
                            <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center font-bold mb-2 transition-colors ${step === 2 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                                2
                            </div>
                            <span className={`text-xs font-bold uppercase ${step === 2 ? 'text-blue-700' : 'text-slate-700'}`}>Desglose Técnico</span>
                        </div>
                    </div>

                    <AnimatePresence mode="wait">
                        {step === 1 && (
                            <motion.div
                                key="step1"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                {!odpToEdit && (
                                    <PartirDeCotizacion
                                        onAplicar={(d) => {
                                            setDeCotizacion(d);
                                            if (!d) return;
                                            setValue('cliente_id', d.clienteId);
                                            setClienteSeleccionadoObj({ id: d.clienteId, nombre_razon_social: d.clienteNombre });
                                            setValue('valor_total', d.valor);
                                        }}
                                    />
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Cliente */}
                                    <div>
                                        <label className={ROTULO}>Cliente <span className="text-rose-600">*</span></label>
                                        <input type="hidden" {...register('cliente_id')} />
                                        {odpToEdit ? (
                                            <div className={`${CONTROL} border-slate-300 bg-slate-100 flex items-center`}>
                                                <span className="truncate">{clienteSeleccionadoODP?.nombre_razon_social || 'Cliente'}</span>
                                            </div>
                                        ) : (
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={dropdownClienteAbierto ? clienteBusqueda : (clienteSeleccionadoObj?.nombre_razon_social || '')}
                                                    onChange={e => { setClienteBusqueda(e.target.value); setClienteSeleccionadoObj(null); setValue('cliente_id', '' as any); setDropdownClienteAbierto(true); }}
                                                    onFocus={() => { setClienteBusqueda(clienteSeleccionadoObj?.nombre_razon_social || ''); setDropdownClienteAbierto(true); }}
                                                    placeholder="Buscar cliente por nombre o documento"
                                                    className={`${CONTROL} ${borde(errors.cliente_id)}`}
                                                />
                                                {dropdownClienteAbierto && (
                                                    <>
                                                        <div className="fixed inset-0 z-10" onClick={() => setDropdownClienteAbierto(false)} />
                                                        <div className="absolute top-full mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg z-20 max-h-52 overflow-y-auto">
                                                            {clientes.length > 0 ? clientes.map(c => (
                                                                <button
                                                                    key={c.id}
                                                                    type="button"
                                                                    onClick={() => { setValue('cliente_id', c.id); setClienteSeleccionadoObj(c); setClienteBusqueda(''); setDropdownClienteAbierto(false); }}
                                                                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 hover:text-blue-700 transition-colors"
                                                                >
                                                                    <span className="block font-medium">{c.nombre_razon_social}</span>
                                                                    {c.numero_documento && <span className="block text-xs text-slate-700">{c.numero_documento}</span>}
                                                                </button>
                                                            )) : (
                                                                <p className="px-4 py-3 text-sm text-slate-700 text-center">
                                                                    {clienteBusqueda.trim().length >= 2 ? 'Sin resultados' : 'Escribe al menos 2 caracteres'}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                        {odpToEdit && (
                                            <p className="text-xs text-slate-700 mt-1">El cliente no se puede cambiar al editar una ODP.</p>
                                        )}
                                        {errors.cliente_id && <p className="text-red-500 text-xs mt-1">{errors.cliente_id.message}</p>}

                                        {/* Banner: cliente con prospectos en gestión */}
                                        {prospectosBanner.length > 0 && (
                                            <div className="mt-2 bg-amber-50 border border-amber-300 rounded-lg px-4 py-3">
                                                <div className="flex items-start gap-2">
                                                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                                    <div>
                                                        <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-1">
                                                            Este cliente tiene {prospectosBanner.length === 1 ? 'un prospecto activo' : `${prospectosBanner.length} prospectos activos`}
                                                        </p>
                                                        <ul className="text-xs text-amber-700 space-y-0.5 mb-2">
                                                            {prospectosBanner.map(p => (
                                                                <li key={p.id} className="font-semibold">
                                                                    • {p.numero_prospecto}{p.descripcion ? ` — ${p.descripcion}` : ''}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                        <p className="text-xs text-amber-700">
                                                            Realiza la ODP desde el módulo <strong>Prospectos</strong> para no dañar el flujo. <span className="font-bold">Atte: AlcaNET</span>
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Fuente del cliente (cuando el cliente aún no la tiene registrada) */}
                                        {requiereClienteFuente && (
                                            <div className="mt-2 bg-blue-50 border border-blue-300 rounded-lg px-4 py-3">
                                                <label className="block text-xs font-semibold text-blue-800 uppercase tracking-wide mb-1">
                                                    ¿Cómo nos contactó este cliente? *
                                                </label>
                                                <p className="text-xs text-blue-700 mb-2">
                                                    Este cliente no tiene fuente registrada. Selecciónala para poder crear la ODP.
                                                </p>
                                                <select
                                                    value={clienteFuente}
                                                    onChange={e => setClienteFuente(e.target.value)}
                                                    className="w-full p-2.5 bg-white border border-blue-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                >
                                                    <option value="">Seleccione fuente...</option>
                                                    {FUENTES_CLIENTE.map(f => <option key={f} value={f}>{f}</option>)}
                                                </select>
                                            </div>
                                        )}
                                    </div>

                                    {/* Fecha Entrega */}
                                    <div ref={calendarRef} className="relative">
                                        <label className={ROTULO}>Fecha ODP listo material</label>
                                        <input type="hidden" {...register('fecha_entrega')} />
                                        <button
                                            type="button"
                                            onClick={() => setCalendarOpen(v => !v)}
                                            className={`${CONTROL} border-slate-400 text-left flex items-center gap-2 hover:border-blue-400 transition`}
                                        >
                                            <Calendar className="w-4 h-4 text-slate-600 shrink-0" />
                                            <span className={fechaEntregaWatch ? 'text-slate-900 font-medium' : 'text-slate-500'}>
                                                {fechaEntregaWatch ? fmtFechaBtn(fechaEntregaWatch) : 'Seleccionar fecha'}
                                            </span>
                                        </button>
                                        {!calendarOpen && (
                                            <p className="text-xs text-slate-700 mt-1">El calendario muestra cuántas ODP tiene el taller cada día.</p>
                                        )}
                                        {calendarOpen && (
                                            <div className="mt-1 border border-slate-200 rounded-xl bg-white p-4 shadow-lg z-30 relative">
                                                <div className="flex items-center justify-between mb-3">
                                                    <button type="button" onClick={() => navegarMes(-1)} className="p-1.5 hover:bg-slate-100 rounded-lg transition">
                                                        <ChevronLeft className="w-4 h-4 text-slate-600" />
                                                    </button>
                                                    <span className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
                                                        {MESES_ES[calM - 1]} {calY}
                                                    </span>
                                                    <button type="button" onClick={() => navegarMes(1)} className="p-1.5 hover:bg-slate-100 rounded-lg transition">
                                                        <ChevronRight className="w-4 h-4 text-slate-600" />
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-7 mb-1">
                                                    {['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'].map(d => (
                                                        <div key={d} className="text-center text-xs font-semibold text-slate-900 py-1">{d}</div>
                                                    ))}
                                                </div>
                                                <div className="grid grid-cols-7 gap-y-0.5">
                                                    {Array.from({ length: calPrimerDia }, (_, i) => <div key={`e${i}`} />)}
                                                    {Array.from({ length: calTotalDias }, (_, i) => {
                                                        const dia = i + 1;
                                                        const diaStr = `${calendarMes}-${String(dia).padStart(2, '0')}`;
                                                        const count = cargaDias[diaStr] || 0;
                                                        const isSelected = fechaEntregaWatch === diaStr;
                                                        const isToday = diaStr === hoy;
                                                        return (
                                                            <button
                                                                key={dia}
                                                                type="button"
                                                                onClick={() => abrirDetalleDia(diaStr)}
                                                                className={`flex flex-col items-center justify-center py-1.5 rounded-lg text-sm transition ${isSelected ? 'bg-blue-600 text-white hover:bg-blue-700' : isToday ? 'ring-1 ring-blue-400 text-blue-600 hover:bg-blue-50' : 'hover:bg-slate-100 text-slate-700'}`}
                                                            >
                                                                <span className="leading-none font-medium">{dia}</span>
                                                                {count > 0 && (
                                                                    <span className={`text-[11px] leading-none mt-0.5 font-bold ${isSelected ? 'text-blue-100' : 'text-amber-500'}`}>{count}</span>
                                                                )}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                <p className="text-[11px] text-slate-700 mt-3 text-center">Número en naranja = ODPs programadas ese día · Click para ver detalle</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Valor Total de la Obra */}
                                    <div>
                                        <label className={ROTULO} htmlFor="odp-valor-total">{esOA ? 'Valor total de la obra (sin IVA)' : 'Valor total de la obra (con IVA)'}</label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <DollarSign className="w-4 h-4 text-slate-500" />
                                            </div>
                                            {/* Se muestra con miles ("1.250.000") y se guarda el número. */}
                                            <input type="hidden" {...register('valor_total')} />
                                            <input
                                                id="odp-valor-total"
                                                type="text"
                                                inputMode="numeric"
                                                value={conMiles(valorTotalRaw)}
                                                onChange={e => {
                                                    const digitos = e.target.value.replace(/\D/g, '');
                                                    setValue('valor_total', digitos ? Number(digitos) : 0, { shouldDirty: true });
                                                }}
                                                placeholder="0"
                                                className={`${CONTROL} border-slate-400 pl-9 text-right tabular-nums font-semibold`}
                                            />
                                        </div>
                                        {!esOA && Number(valorTotalRaw) > 0 && (
                                            <div className="mt-2 p-2.5 bg-blue-50 border border-blue-100 rounded-lg text-xs space-y-0.5">
                                                <div className="flex justify-between text-slate-800">
                                                    <span>Subtotal (sin IVA):</span>
                                                    <span className="font-semibold">{fmtCOP(subtotal)}</span>
                                                </div>
                                                <div className="flex justify-between text-slate-800">
                                                    <span>IVA 19%:</span>
                                                    <span className="font-semibold">{fmtCOP(ivaValor)}</span>
                                                </div>
                                                <div className="flex justify-between text-blue-800 font-bold border-t border-blue-200 pt-1 mt-1">
                                                    <span>Total:</span>
                                                    <span>{fmtCOP(Number(valorTotalRaw))}</span>
                                                </div>
                                            </div>
                                        )}
                                        {esOA && <p className="text-xs text-slate-700 mt-1">Esta orden no aplica IVA.</p>}
                                    </div>

                                    {/* Forma de Pago */}
                                    <div>
                                        <label className={ROTULO}>Forma de pago</label>
                                        <select
                                            {...register('forma_pago')}
                                            disabled={!puedeEditarFormaPago}
                                            className={`${CONTROL} border-slate-400 ${puedeEditarFormaPago ? '' : '!bg-slate-100 !text-slate-600 cursor-not-allowed'}`}
                                        >
                                            <option value="">Seleccionar...</option>
                                            <option value="contado">Pago Anticipado</option>
                                            <option value="credito">Crédito</option>
                                            <option value="50_50">50% anticipo / 50% entrega</option>
                                        </select>
                                        {!puedeEditarFormaPago && (
                                            <p className="text-xs text-slate-700 mt-1">La forma de pago solo puede cambiarla gerencia o un administrador.</p>
                                        )}
                                    </div>
                                </div>

                                {/* Productos / servicios — una tarjeta por línea, numerada (2026-09-27) */}
                                <section className="p-5 bg-blue-50/50 rounded-xl border border-blue-100 space-y-3 min-w-0">
                                    <h3 className="font-bold text-blue-900 flex items-center gap-2">
                                        <Briefcase className="w-5 h-5 text-blue-600" />
                                        Productos y servicios
                                        <span className="text-xs font-semibold text-blue-800 bg-white ring-1 ring-blue-200 rounded-full px-2 py-0.5">{servicioFields.length}</span>
                                    </h3>

                                    {servicioFields.map((field, index) => {
                                        const e = errors.servicios_detalle?.[index];
                                        const cambiarCantidad = (delta: number) => {
                                            const actual = Number(getValues(`servicios_detalle.${index}.cantidad`)) || 1;
                                            setValue(`servicios_detalle.${index}.cantidad`, Math.max(1, actual + delta), { shouldDirty: true, shouldValidate: true });
                                        };
                                        return (
                                            <div key={field.id} className="p-4 bg-white border border-blue-100 rounded-lg space-y-3 min-w-0">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-bold text-blue-800 bg-blue-50 ring-1 ring-blue-200 rounded-md px-2 py-0.5">#{index + 1}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeServicio(index)}
                                                        disabled={servicioFields.length === 1}
                                                        title={servicioFields.length === 1 ? 'La ODP necesita al menos una línea' : `Quitar la línea #${index + 1}`}
                                                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-rose-700 hover:bg-rose-50 rounded-md px-2 py-1 transition disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-700 disabled:cursor-not-allowed"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" /> Quitar
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                                                    <div className="md:col-span-2 min-w-0">
                                                        <label className={ROTULO_LINEA}>Cant. <span className="text-rose-600">*</span></label>
                                                        <div className={`flex h-10 items-stretch rounded-lg border bg-white overflow-hidden ${borde(e?.cantidad)}`}>
                                                            <button type="button" onClick={() => cambiarCantidad(-1)} aria-label="Menos" className="px-2.5 text-slate-700 hover:bg-slate-100">
                                                                <Minus className="w-3.5 h-3.5" />
                                                            </button>
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                {...register(`servicios_detalle.${index}.cantidad`)}
                                                                className="w-full min-w-0 text-center text-sm font-semibold text-slate-900 tabular-nums border-x border-slate-200 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                                            />
                                                            <button type="button" onClick={() => cambiarCantidad(1)} aria-label="Más" className="px-2.5 text-slate-700 hover:bg-slate-100">
                                                                <Plus className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="md:col-span-4 min-w-0">
                                                        <label className={ROTULO_LINEA}>Servicio / gestión <span className="text-rose-600">*</span></label>
                                                        <select {...register(`servicios_detalle.${index}.tipo_servicio`)} className={`${CONTROL} ${borde(e?.tipo_servicio)}`}>
                                                            <option value="">Seleccionar…</option>
                                                            <option value="Suministro e Instalación">Suministro e Instalación</option>
                                                            <option value="Solo Instalación">Solo Instalación</option>
                                                            <option value="Venta">Venta</option>
                                                            <option value="Mantenimiento">Mantenimiento</option>
                                                            <option value="Garantía / Reposición">Garantía / Reposición</option>
                                                            <option value="Otro">Otro</option>
                                                        </select>
                                                    </div>
                                                    {catalogo.length > 0 && (
                                                        <>
                                                            <div className="md:col-span-3 min-w-0">
                                                                <label className={ROTULO_LINEA}>Categoría</label>
                                                                <select
                                                                    value={catSeleccionada[index] || ''}
                                                                    onChange={ev => setCatSeleccionada(prev => ({ ...prev, [index]: ev.target.value }))}
                                                                    className={`${CONTROL} border-slate-400`}
                                                                >
                                                                    <option value="">Todas</option>
                                                                    {categorias.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                                                </select>
                                                            </div>
                                                            <div className="md:col-span-3 min-w-0">
                                                                <label className={ROTULO_LINEA}>Producto del catálogo</label>
                                                                <select
                                                                    value=""
                                                                    onChange={ev => {
                                                                        const item = catalogo.find(i => i.id === Number(ev.target.value));
                                                                        if (item) setValue(`servicios_detalle.${index}.descripcion`, item.descripcion, { shouldValidate: true });
                                                                    }}
                                                                    className={`${CONTROL} border-slate-400`}
                                                                >
                                                                    <option value="">Elegir para llenar la descripción</option>
                                                                    {catalogo
                                                                        .filter(i => !catSeleccionada[index] || i.categoria === catSeleccionada[index])
                                                                        .map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                                                                </select>
                                                            </div>
                                                        </>
                                                    )}
                                                    <div className="md:col-span-12 min-w-0">
                                                        <label className={ROTULO_LINEA}>Descripción del producto u obra <span className="text-rose-600">*</span></label>
                                                        <textarea
                                                            {...register(`servicios_detalle.${index}.descripcion`)}
                                                            placeholder="Ej.: Ventana corrediza 744 color mate, vidrio claro 4 mm, 1.200 × 1.000 mm"
                                                            rows={2}
                                                            className={`w-full min-w-0 px-3 py-2 bg-white border rounded-lg text-sm text-slate-900 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 ${borde(e?.descripcion)}`}
                                                        />
                                                        {e?.descripcion && <p className="text-xs text-rose-700 mt-1">{e.descripcion.message}</p>}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {errors.servicios_detalle?.root && <p className="text-rose-700 text-sm">{errors.servicios_detalle.root.message}</p>}

                                    <button
                                        type="button"
                                        onClick={() => appendServicio({ cantidad: 1, tipo_servicio: 'Suministro e Instalación', descripcion: '' })}
                                        className="w-full h-10 inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-blue-300 text-sm font-semibold text-blue-700 hover:bg-white hover:border-blue-400 transition"
                                    >
                                        <Plus className="w-4 h-4" /> Agregar servicio
                                    </button>
                                </section>

                                {/* Requerimientos como chips + "Lleva vidrio" con su proveedor (2026-09-27) */}
                                <section className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-3">
                                    <h3 className="font-semibold text-slate-900 text-sm uppercase tracking-wide">Requerimientos</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {REQUERIMIENTOS.map(({ key, label }, i) => {
                                            const activo = Boolean(requerimientosWatch?.[i]);
                                            return (
                                                <label key={key} className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold cursor-pointer select-none ring-1 transition focus-within:ring-2 focus-within:ring-blue-500 ${activo ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-slate-800 ring-slate-300 hover:ring-blue-400'}`}>
                                                    <input type="checkbox" {...register(key as keyof ODPFormValues)} className="sr-only" />
                                                    {activo && <Check className="w-3.5 h-3.5" />} {label}
                                                </label>
                                            );
                                        })}
                                        <button
                                            type="button"
                                            onClick={alternarVidrio}
                                            aria-pressed={llevaVidrio}
                                            title={pedidoPvCreado ? 'Ya tiene Pedido PV: el proveedor no se puede quitar.' : 'Muestra el proveedor del vidrio (crea el Pedido PV al guardar).'}
                                            className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold ring-1 transition ${llevaVidrio ? 'bg-orange-500 text-white ring-orange-500' : 'bg-white text-slate-800 ring-slate-300 hover:ring-orange-400'} ${pedidoPvCreado ? 'cursor-not-allowed' : ''}`}
                                        >
                                            {pedidoPvCreado ? <Lock className="w-3.5 h-3.5" /> : llevaVidrio ? <Check className="w-3.5 h-3.5" /> : <Package className="w-3.5 h-3.5" />}
                                            Lleva vidrio
                                        </button>
                                    </div>
                                    <input type="hidden" {...register('proveedor_vidrio')} />
                                    {llevaVidrio && (
                                        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-orange-200 bg-orange-50/60 p-3">
                                            <div className="w-full sm:w-64">
                                                <label className={ROTULO_LINEA}>Proveedor del vidrio</label>
                                                <select
                                                    value={proveedorVidrio || ''}
                                                    onChange={ev => setValue('proveedor_vidrio', ev.target.value, { shouldDirty: true })}
                                                    className={`${CONTROL} border-slate-400`}
                                                >
                                                    {!pedidoPvCreado && <option value="">Seleccionar…</option>}
                                                    <option value="Vitelsa">Vitelsa</option>
                                                    <option value="Templacol">Templacol</option>
                                                    <option value="Vidplex">Vidplex</option>
                                                    <option value="Otros">Otros</option>
                                                </select>
                                            </div>
                                            {proveedorVidrio && !odpToEdit && (
                                                <p className="text-sm text-slate-800 pb-2">
                                                    Pedido PV <span className="font-mono font-bold text-slate-900">{siguienteNumeroPV ?? '…'}</span> — se crea al guardar la ODP.
                                                </p>
                                            )}
                                            {odpToEdit?.numero_pedido_proveedor && (
                                                <p className="text-sm text-slate-800 pb-2">
                                                    Pedido PV <span className="font-mono font-bold text-slate-900">{odpToEdit.numero_pedido_proveedor}</span>
                                                    {pedidoPvCreado && ' · ya creado: se puede cambiar de proveedor, no quitarlo.'}
                                                </p>
                                            )}
                                            {!proveedorVidrio && (
                                                <p className="text-sm text-orange-800 font-semibold pb-2">Elige el proveedor o desmarca "Lleva vidrio".</p>
                                            )}
                                        </div>
                                    )}
                                </section>

                                <div className="space-y-4 mt-6">
                                    <div>
                                        <label className={ROTULO}>Dirección de instalación / entrega <span className="text-rose-600">*</span></label>
                                        <input
                                            type="text"
                                            {...register('direccion_instalacion')}
                                            placeholder="Ej. Cra 45 #23-10, Barrio El Centro"
                                            className={`${CONTROL} ${borde(errors.direccion_instalacion)}`}
                                        />
                                        {errors.direccion_instalacion && <p className="text-xs text-rose-500 mt-1">{errors.direccion_instalacion.message}</p>}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-900 mb-1">Contacto en Obra <span className="text-rose-500">*</span></label>
                                            <input
                                                type="text"
                                                {...register('nombre_recibe')}
                                                placeholder="Nombre de quien recibe"
                                                className={`${CONTROL} ${borde(errors.nombre_recibe)}`}
                                            />
                                            {errors.nombre_recibe && <p className="text-xs text-rose-500 mt-1">{errors.nombre_recibe.message}</p>}
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-900 mb-1">Teléfono Contacto <span className="text-rose-500">*</span></label>
                                            <input
                                                type="text"
                                                {...register('telefono_recibe')}
                                                placeholder="Cel. o fijo de contacto"
                                                className={`${CONTROL} ${borde(errors.telefono_recibe)}`}
                                            />
                                            {errors.telefono_recibe && <p className="text-xs text-rose-500 mt-1">{errors.telefono_recibe.message}</p>}
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-900 mb-1">Cargo Contacto</label>
                                            <input
                                                type="text"
                                                {...register('cargo_recibe')}
                                                placeholder="Ej: Administrador, Residente de obra"
                                                className={`${CONTROL} border-slate-400`}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-900 mb-1">Observaciones Esp. Cliente</label>
                                        <textarea
                                            {...register('observaciones')}
                                            placeholder="Notas, cuidados, horarios límite, indicaciones para la visita técnica, etc..."
                                            rows={3}
                                            className="w-full p-3 bg-white border border-slate-400 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                                        />
                                    </div>
                                </div>
                                {/* Visita técnica — solo para nuevas ODPs */}
                                {!odpToEdit && (
                                    <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-xl">
                                        <input
                                            type="checkbox"
                                            id="requiere_visita_tecnica"
                                            {...register('requiere_visita_tecnica')}
                                            className="mt-0.5 w-4 h-4 text-orange-500 rounded border-orange-300 focus:ring-orange-400"
                                        />
                                        <label htmlFor="requiere_visita_tecnica" className="cursor-pointer">
                                            <p className="text-sm font-bold text-orange-800">Requiere visita técnica</p>
                                            <p className="text-xs text-orange-700 mt-0.5">El cliente no tiene medidas. El jefe de producción debe realizar una visita antes de iniciar la orden.</p>
                                        </label>
                                    </div>
                                )}
                                {/* Reposición / No Conformidad — solo para nuevas ODPs */}
                                {!odpToEdit && (
                                    <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl">
                                        <input
                                            type="checkbox"
                                            id="es_no_conformidad"
                                            {...register('es_no_conformidad')}
                                            className="mt-0.5 w-4 h-4 text-rose-500 rounded border-rose-300 focus:ring-rose-400"
                                        />
                                        <label htmlFor="es_no_conformidad" className="cursor-pointer">
                                            <p className="text-sm font-bold text-rose-800">Reposición / No Conformidad (sin cobro al cliente)</p>
                                            <p className="text-xs text-rose-700 mt-0.5">Úsalo para reprocesos o reposiciones que no se cobran. La caja quedará en CANCELADO y la orden no exigirá factura electrónica para instalar.</p>
                                        </label>
                                    </div>
                                )}
                                <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-slate-200">
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={nextStep}
                                        className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg transition flex items-center gap-2"
                                    >
                                        Continuar a Desglose <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {step === 2 && (
                            <motion.div
                                key="step2"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                            >

                                <div className="mb-4 flex justify-between items-end border-b border-slate-100 pb-2">
                                    <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                        <Package className="w-5 h-5 text-emerald-600" />
                                        Ítems o Cristales
                                    </h3>
                                    <button
                                        type="button"
                                        onClick={() => appendItem({ tipo_vidrio: '', color: 'Incoloro', espesor: '6', ancho_mm: 0, alto_mm: 0, cantidad: 1, pulidos: '', pulidos_h: '', perforaciones: 0, boquetes: 0, descuentos: '', otros: '', prod: '' })}
                                        className="px-3 py-1.5 bg-slate-900 text-white text-sm rounded-md hover:bg-slate-800 transition flex items-center gap-1"
                                    >
                                        <Plus className="w-4 h-4" /> Agregar Cristal
                                    </button>
                                </div>
                                {!odpToEdit && itemFields.length === 0 && (
                                    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                                        <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                                        <p className="text-xs text-amber-700">
                                            <strong>Sin requerimientos de vidrio:</strong> La ODP se creará en modo pago adelantado. El asesor deberá aprobarla manualmente para que pase a LISTO INSTALAR.
                                        </p>
                                    </div>
                                )}

                                {errors.items?.root && (
                                    <div className="p-3 bg-red-50 text-red-600 rounded-lg flex items-center gap-2 mb-4">
                                        <AlertCircle className="w-5 h-5" />
                                        <span className="text-sm font-medium">{errors.items.root.message}</span>
                                    </div>
                                )}

                                <div className="space-y-4">
                                    <AnimatePresence>
                                        {itemFields.map((field, index) => {
                                            // Vidrio "comprometido": ya está en un Pedido PV o en Compras → no editable ni eliminable.
                                            const comprometido = field.pedido_pv_id != null || field.estado_compra === 'en_odc' || field.estado_compra === 'en_existencia';
                                            return (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                key={field.rhfKey}
                                                className="relative bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap lg:flex-nowrap gap-4 items-start"
                                            >
                                                <ColorField index={index} register={register} control={control} />
                                                <div className="w-1/2 lg:w-1/12">
                                                    <label className="block text-xs font-semibold text-slate-900 uppercase tracking-wider mb-1">Esp. (mm)</label>
                                                    <input
                                                        type="text"
                                                        {...register(`items.${index}.espesor`)}
                                                        className="w-full p-2 text-sm border border-slate-400 rounded focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                                <div className="w-1/2 lg:w-2/12 border-l border-slate-200 pl-4">
                                                    <label className="block text-xs font-semibold text-slate-900 uppercase tracking-wider mb-1">Medidas (mm)</label>
                                                    <div className="flex gap-2">
                                                        <input
                                                            type="number"
                                                            placeholder="Ancho"
                                                            {...register(`items.${index}.ancho_mm`)}
                                                            className="w-1/2 p-2 text-sm border border-slate-400 rounded focus:ring-2 focus:ring-blue-500"
                                                        />
                                                        <span className="text-slate-700 self-center">×</span>
                                                        <input
                                                            type="number"
                                                            placeholder="Alto"
                                                            {...register(`items.${index}.alto_mm`)}
                                                            className="w-1/2 p-2 text-sm border border-slate-400 rounded focus:ring-2 focus:ring-blue-500"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="w-1/3 lg:w-1/12 border-l border-slate-200 pl-4">
                                                    <label className="block text-xs font-semibold text-slate-900 uppercase tracking-wider mb-1">Cant.</label>
                                                    <input
                                                        type="number"
                                                        {...register(`items.${index}.cantidad`)}
                                                        className="w-full p-2 text-sm border border-slate-400 rounded focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>

                                                {/* Acabados + MTS PT + PROD */}
                                                <div className="w-full lg:flex-1 grid grid-cols-4 gap-2 border-l border-slate-200 pl-4">
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-900 uppercase tracking-wider mb-1">PUL A*</label>
                                                        <input type="number" min="0" max="9" {...register(`items.${index}.pulidos`)} className="w-full p-1.5 text-xs border border-slate-400 rounded text-center" placeholder="0" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-900 uppercase tracking-wider mb-1">PUL H*</label>
                                                        <input type="number" min="0" max="9" {...register(`items.${index}.pulidos_h`)} className="w-full p-1.5 text-xs border border-slate-400 rounded text-center" placeholder="0" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-900 uppercase tracking-wider mb-1">Perf.</label>
                                                        <input type="number" {...register(`items.${index}.perforaciones`)} className="w-full p-1.5 text-xs border border-slate-400 rounded text-center" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-900 uppercase tracking-wider mb-1">Boq.</label>
                                                        <input type="number" {...register(`items.${index}.boquetes`)} className="w-full p-1.5 text-xs border border-slate-400 rounded text-center" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-900 uppercase tracking-wider mb-1">Des.</label>
                                                        <input {...register(`items.${index}.descuentos`)} className="w-full p-1.5 text-xs border border-slate-400 rounded" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-900 uppercase tracking-wider mb-1">Otros**</label>
                                                        <input {...register(`items.${index}.otros`)} className="w-full p-1.5 text-xs border border-slate-400 rounded" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-900 uppercase tracking-wider mb-1">MTS PT</label>
                                                        <input
                                                            readOnly
                                                            value={(() => {
                                                                const a = parseFloat(String(itemFields[index]?.ancho_mm || 0));
                                                                const h = parseFloat(String(itemFields[index]?.alto_mm || 0));
                                                                if (a > 0 && h > 0) return ((a / 1000) * (h / 1000)).toFixed(3);
                                                                return '';
                                                            })()}
                                                            className="w-full p-1.5 text-xs border border-slate-100 rounded bg-slate-50 text-slate-700 text-center"
                                                            placeholder="m²"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-900 uppercase tracking-wider mb-1">PROD</label>
                                                        <select {...register(`items.${index}.prod`)} className="w-full p-1.5 text-xs border border-slate-400 rounded bg-white">
                                                            <option value="">—</option>
                                                            <option value="PV">PV</option>
                                                            <option value="CAMARA">CAMARA</option>
                                                            <option value="CR">CR</option>
                                                            <option value="CR-LAM">CR-LAM</option>
                                                            <option value="ESP">ESP</option>
                                                            <option value="LAM">LAM</option>
                                                            <option value="S/T">S/T</option>
                                                            <option value="TE">TE</option>
                                                            <option value="TEM-MULTILAMINADO">TEM-MULTILAMINADO</option>
                                                            <option value="TEM-LAM">TEM-LAM</option>
                                                            <option value="N.A.">N.A.</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div className="pt-6">
                                                    <button
                                                        type="button"
                                                        onClick={() => removeItem(index)}
                                                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                                                        title="Eliminar ítem"
                                                    >
                                                        <Trash2 className="w-5 h-5" />
                                                    </button>
                                                </div>
                                                {/* Vidrio comprometido (en Pedido PV o Compras): overlay invisible que conserva
                                                    la estética original y avisa solo cuando el usuario intenta editar/eliminar. */}
                                                {comprometido && (
                                                    <div
                                                        className="absolute inset-0 z-10 rounded-xl cursor-not-allowed"
                                                        title="Ya está en un Pedido PV o en Compras — no editable aquí"
                                                        onClick={() => toast.info(
                                                            'Este vidrio ya está en un Pedido PV o en una orden de compra: no se puede editar ni eliminar desde aquí. Gestiona ese cambio en Pedidos PV / Compras.',
                                                            { toastId: `pv-lock-${field.id ?? index}` }
                                                        )}
                                                    />
                                                )}
                                            </motion.div>
                                            );
                                        })}
                                    </AnimatePresence>
                                </div>

                                <div className="mt-8 flex justify-between pt-4 border-t border-slate-200">
                                    <button
                                        type="button"
                                        onClick={prevStep}
                                        className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition flex items-center gap-2"
                                    >
                                        <ChevronLeft className="w-4 h-4" /> Volver
                                    </button>
                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            onClick={onClose}
                                            className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg transition disabled:opacity-50"
                                        >
                                            {isSubmitting ? 'Guardando...' : 'Crear Orden Definitiva'}
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </form>
            </motion.div>
        </div>

        {/* Modal detalle de carga por día */}
        {modalDia && (
            <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[70vh] flex flex-col">
                    <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                        <div>
                            <h3 className="font-bold text-slate-900">Carga — {fmtFechaModal(modalDia)}</h3>
                            {!loadingDetalle && (
                                <p className="text-xs text-slate-700 mt-0.5">
                                    {detalleDia.length === 0
                                        ? 'Sin ODPs programadas para este día'
                                        : `${detalleDia.length} ODP${detalleDia.length !== 1 ? 's' : ''} programada${detalleDia.length !== 1 ? 's' : ''}`}
                                </p>
                            )}
                        </div>
                        <button type="button" onClick={() => setModalDia(null)} className="p-2 hover:bg-slate-100 rounded-full transition">
                            <X className="w-4 h-4 text-slate-500" />
                        </button>
                    </div>

                    <div className="overflow-y-auto flex-1 p-5 space-y-4">
                        {loadingDetalle ? (
                            <div className="text-center text-slate-700 py-8 text-sm">Cargando...</div>
                        ) : detalleDia.length === 0 ? (
                            <div className="text-center text-slate-700 py-8 text-sm">No hay ODPs programadas para este día</div>
                        ) : (
                            detalleDia.map((odp: any) => (
                                <div key={odp.id} className="border border-slate-200 rounded-lg overflow-hidden">
                                    <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                                        <span className="font-bold text-slate-900 text-sm">ODP {odp.numero_odp}</span>
                                        <span className="text-slate-700 text-xs">— {odp.cliente?.nombre_razon_social}</span>
                                    </div>
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="bg-slate-50/80 border-b border-slate-100">
                                                <th className="px-3 py-1.5 text-left text-slate-900 font-semibold w-10">Cant.</th>
                                                <th className="px-3 py-1.5 text-left text-slate-900 font-semibold w-36">Servicio/Gestión</th>
                                                <th className="px-3 py-1.5 text-left text-slate-900 font-semibold">Descripción</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(odp.servicios_detalle || []).map((s: any, idx: number) => (
                                                <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/50' : ''}>
                                                    <td className="px-3 py-1.5 text-center font-medium text-slate-700">{s.cantidad}</td>
                                                    <td className="px-3 py-1.5 text-slate-700">{s.tipo_servicio}</td>
                                                    <td className="px-3 py-1.5 text-slate-800">{s.descripcion}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={() => setModalDia(null)}
                            className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition"
                        >
                            Volver al Calendario
                        </button>
                        <button
                            type="button"
                            onClick={() => { setValue('fecha_entrega', modalDia!); setModalDia(null); setCalendarOpen(false); }}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition"
                        >
                            Seleccionar esta fecha
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

export default ODPForm;
