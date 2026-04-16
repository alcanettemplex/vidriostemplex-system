import React, { useState, useEffect, useCallback } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Plus, Trash2, X, FileCheck, DollarSign, Package, AlertCircle, ChevronRight, ChevronLeft, Briefcase } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const COLORES_VIDRIO = ['Incoloro', 'Bronce', 'Bronce Oscuro', 'Gris', 'Gris Oscuro', 'Azul', 'Verde', 'Mate', 'Otro'];

const itemSchema = z.object({
    tipo_vidrio: z.string().optional(),
    color: z.string().optional(),
    espesor: z.coerce.number().positive(),
    ancho_mm: z.coerce.number().positive(),
    alto_mm: z.coerce.number().positive(),
    cantidad: z.coerce.number().int().positive(),
    pulidos: z.string().optional(),
    pulidos_h: z.string().optional(),
    perforaciones: z.coerce.number().int().nonnegative().optional(),
    boquetes: z.coerce.number().int().nonnegative().optional(),
    descuentos: z.string().optional(),
    otros: z.string().optional(),
    prod: z.string().optional()
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
    items: z.array(itemSchema).optional()
});

type ItemFormValues = {
    tipo_vidrio?: string;
    color?: string;
    espesor: number;
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
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Color</label>
            <select
                {...register(`items.${index}.color`)}
                className="w-full p-2 text-sm border border-slate-200 rounded focus:ring-2 focus:ring-blue-500 bg-white"
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

const ODPForm: React.FC<ODPFormProps> = ({ onClose, onSuccess, odpToEdit, asesorId, tipoOdp }) => {
    const [step, setStep] = useState(1);
    const [clientes, setClientes] = useState<{ id: number; nombre_razon_social: string }[]>([]);
    const [catalogo, setCatalogo] = useState<CatalogoItem[]>([]);
    const [categorias, setCategorias] = useState<string[]>([]);
    const [catSeleccionada, setCatSeleccionada] = useState<Record<number, string>>({});
    const [siguienteNumeroPV, setSiguienteNumeroPV] = useState<number | null>(null);
    const [clienteBusqueda, setClienteBusqueda] = useState('');
    const [dropdownClienteAbierto, setDropdownClienteAbierto] = useState(false);

    const { register, control, handleSubmit, trigger, reset, setValue, formState: { errors, isSubmitting } } = useForm<ODPFormValues>({
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
            forma_pago: ''
        }
    });

    const { fields: itemFields, append: appendItem, remove: removeItem } = useFieldArray({
        control,
        name: 'items'
    });

    const valorTotalRaw = useWatch({ control, name: 'valor_total' }) || 0;
    const proveedorVidrio = useWatch({ control, name: 'proveedor_vidrio' });
    const clienteIdWatch = useWatch({ control, name: 'cliente_id' });
    const clienteSeleccionadoODP = clientes.find(c => c.id === Number(clienteIdWatch));
    const IVA_RATE = 0.19;
    const subtotal = Number(valorTotalRaw) / (1 + IVA_RATE);
    const ivaValor = Number(valorTotalRaw) - subtotal;
    const fmtCOP = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

    const { fields: servicioFields, append: appendServicio, remove: removeServicio } = useFieldArray({
        control,
        name: 'servicios_detalle'
    });

    useEffect(() => {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const base = process.env.REACT_APP_API_URL || 'http://localhost:3001';

        axios.get(`${base}/api/clientes`, { headers }).then(r => setClientes(r.data)).catch(() => {});
        axios.get(`${base}/api/catalogo`, { headers }).then(r => {
            setCatalogo(r.data);
            const cats = Array.from(new Set<string>(r.data.map((i: CatalogoItem) => i.categoria)));
            setCategorias(cats);
        }).catch(() => {});
        if (!odpToEdit) {
            axios.get(`${base}/api/pedidos-pv/siguiente-numero`, { headers })
                .then(r => setSiguienteNumeroPV(r.data.siguiente))
                .catch(() => {});
        }
    }, []);

    const nextStep = async () => {
        const isStepValid = await trigger(['cliente_id', 'servicios_detalle', 'nombre_recibe', 'telefono_recibe', 'direccion_instalacion']);
        if (isStepValid) {
            setStep(2);
        }
    };

    useEffect(() => {
        if (odpToEdit) {
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
            const token = localStorage.getItem('token');
            const { requiere_visita_tecnica, ...rest } = data;
            const payload = {
                ...rest,
                cantidad_total: data.servicios_detalle.reduce((acc, curr) => acc + curr.cantidad, 0),
                tipo_servicio: data.servicios_detalle[0].tipo_servicio,
                descripcion_pedido: data.servicios_detalle.map(s => `${s.cantidad}x ${s.tipo_servicio}: ${s.descripcion}`).join('\n'),
                ...(!odpToEdit && requiere_visita_tecnica ? { estado_produccion: 'VISITA_TECNICA' } : {}),
                // Si se asignó a otro asesor desde el modal previo, incluir en el payload
                ...(asesorId ? { asesor_id: asesorId } : {}),
                // Tipo de orden (ODP normal o OA sin IVA)
                ...(!odpToEdit && tipoOdp ? { tipo_odp: tipoOdp } : {}),
            };

            if (odpToEdit) {
                await axios.put(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/odp/${odpToEdit.id}`, payload, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                toast.success('ODP Actualizada Exitosamente');
            } else {
                await axios.post(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/odp`, payload, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                toast.success('ODP Creada Exitosamente');
            }
            onSuccess();
        } catch (error: any) {
            toast.error(error.response?.data?.error || `Error al ${odpToEdit ? 'actualizar' : 'crear'} ODP`);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="glass-panel w-full max-w-6xl max-h-[90vh] overflow-y-auto"
            >
                <div className="sticky top-0 bg-white/90 backdrop-blur-md px-6 py-4 border-b border-slate-200 flex justify-between items-center z-10">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
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
                            <span className={`text-xs font-bold uppercase ${step === 1 ? 'text-blue-600' : 'text-slate-400'}`}>Acuerdo Comercial</span>
                        </div>
                        <div className="flex-1 h-1 bg-slate-200 rounded-full mb-6">
                            <div className={`h-full bg-blue-600 rounded-full transition-all duration-300 ${step === 2 ? 'w-full' : 'w-0'}`}></div>
                        </div>
                        <div className="flex-1 text-center">
                            <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center font-bold mb-2 transition-colors ${step === 2 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                2
                            </div>
                            <span className={`text-xs font-bold uppercase ${step === 2 ? 'text-blue-600' : 'text-slate-400'}`}>Desglose Técnico</span>
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
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Cliente */}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Cliente *</label>
                                        <input type="hidden" {...register('cliente_id')} />
                                        {odpToEdit ? (
                                            <div className={`w-full p-2.5 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-500`}>
                                                {clienteSeleccionadoODP?.nombre_razon_social || 'Cliente'}
                                            </div>
                                        ) : (
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={dropdownClienteAbierto ? clienteBusqueda : (clienteSeleccionadoODP?.nombre_razon_social || clienteBusqueda)}
                                                    onChange={e => { setClienteBusqueda(e.target.value); setDropdownClienteAbierto(true); }}
                                                    onFocus={() => { setClienteBusqueda(''); setDropdownClienteAbierto(true); }}
                                                    placeholder="Buscar cliente..."
                                                    className={`w-full p-2.5 bg-white border ${errors.cliente_id ? 'border-red-400' : 'border-slate-200'} rounded-lg focus:ring-2 focus:ring-blue-500`}
                                                />
                                                {dropdownClienteAbierto && (
                                                    <>
                                                        <div className="fixed inset-0 z-10" onClick={() => setDropdownClienteAbierto(false)} />
                                                        <div className="absolute top-full mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg z-20 max-h-52 overflow-y-auto">
                                                            {clientes
                                                                .filter(c => c.nombre_razon_social.toLowerCase().includes(clienteBusqueda.toLowerCase()))
                                                                .map(c => (
                                                                    <button
                                                                        key={c.id}
                                                                        type="button"
                                                                        onClick={() => { setValue('cliente_id', c.id); setClienteBusqueda(''); setDropdownClienteAbierto(false); }}
                                                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 hover:text-blue-700 transition-colors"
                                                                    >
                                                                        {c.nombre_razon_social}
                                                                    </button>
                                                                ))}
                                                            {clientes.filter(c => c.nombre_razon_social.toLowerCase().includes(clienteBusqueda.toLowerCase())).length === 0 && (
                                                                <p className="px-4 py-3 text-sm text-slate-400 text-center">Sin resultados</p>
                                                            )}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                        {odpToEdit && (
                                            <p className="text-xs text-slate-400 mt-1">El cliente no se puede cambiar al editar una ODP.</p>
                                        )}
                                        {errors.cliente_id && <p className="text-red-500 text-xs mt-1">{errors.cliente_id.message}</p>}
                                    </div>

                                    {/* Fecha Entrega */}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Fecha ODP Listo Material</label>
                                        <input
                                            type="date"
                                            {...register('fecha_entrega')}
                                            className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>

                                    {/* Valor Total de la Obra */}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Valor Total de la Obra (con IVA)</label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <DollarSign className="w-4 h-4 text-slate-400" />
                                            </div>
                                            <input
                                                type="number"
                                                step="1"
                                                {...register('valor_total')}
                                                placeholder="0"
                                                className="w-full pl-9 p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        {Number(valorTotalRaw) > 0 && (
                                            <div className="mt-2 p-2.5 bg-blue-50 border border-blue-100 rounded-lg text-xs space-y-0.5">
                                                <div className="flex justify-between text-slate-600">
                                                    <span>Subtotal (sin IVA):</span>
                                                    <span className="font-semibold">{fmtCOP(subtotal)}</span>
                                                </div>
                                                <div className="flex justify-between text-slate-600">
                                                    <span>IVA 19%:</span>
                                                    <span className="font-semibold">{fmtCOP(ivaValor)}</span>
                                                </div>
                                                <div className="flex justify-between text-blue-800 font-bold border-t border-blue-200 pt-1 mt-1">
                                                    <span>Total:</span>
                                                    <span>{fmtCOP(Number(valorTotalRaw))}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Forma de Pago */}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Forma de Pago</label>
                                        <select
                                            {...register('forma_pago')}
                                            className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                                        >
                                            <option value="">Seleccionar...</option>
                                            <option value="contado">Contado</option>
                                            <option value="credito">Crédito</option>
                                            <option value="50_50">50% anticipo / 50% entrega</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="p-5 bg-blue-50/50 rounded-xl border border-blue-100 space-y-6">
                                    <h3 className="font-bold text-blue-900 flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <Briefcase className="w-5 h-5 text-blue-600" />
                                            Información de Productos / Servicios
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => appendServicio({ cantidad: 1, tipo_servicio: 'Suministro e Instalación', descripcion: '' })}
                                            className="text-sm flex items-center gap-1 text-blue-600 hover:text-blue-700 bg-white px-3 py-1.5 rounded-lg border border-blue-200 shadow-sm transition"
                                        >
                                            <Plus className="w-4 h-4" /> Agregar Servicio
                                        </button>
                                    </h3>

                                    {servicioFields.map((field, index) => (
                                        <div key={field.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 bg-white border border-blue-100 rounded-lg relative">
                                            {servicioFields.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeServicio(index)}
                                                    className="absolute -top-3 -right-3 bg-red-100 text-red-600 p-1.5 rounded-full hover:bg-red-200 shadow-sm"
                                                    title="Eliminar este servicio"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            )}

                                            <div className="md:col-span-2">
                                                <label className="block text-xs font-semibold text-slate-600 mb-1">Cant. *</label>
                                                <input
                                                    type="number"
                                                    {...register(`servicios_detalle.${index}.cantidad`)}
                                                    min="1"
                                                    className={`w-full p-2.5 bg-slate-50 border ${errors.servicios_detalle?.[index]?.cantidad ? 'border-red-400' : 'border-slate-200'} rounded-lg focus:bg-white`}
                                                />
                                            </div>

                                            <div className="md:col-span-4">
                                                <label className="block text-xs font-semibold text-slate-600 mb-1">Servicio/Gestión *</label>
                                                <select
                                                    {...register(`servicios_detalle.${index}.tipo_servicio`)}
                                                    className={`w-full p-2.5 bg-slate-50 border ${errors.servicios_detalle?.[index]?.tipo_servicio ? 'border-red-400' : 'border-slate-200'} rounded-lg focus:bg-white`}
                                                >
                                                    <option value="Suministro e Instalación">Suministro e Instalación</option>
                                                    <option value="Solo Instalación">Solo Instalación</option>
                                                    <option value="Venta / Suministro">Venta / Suministro</option>
                                                    <option value="Mantenimiento">Mantenimiento</option>
                                                    <option value="Garantía / Reposición">Garantía / Reposición</option>
                                                    <option value="Otro">Otro</option>
                                                </select>
                                            </div>

                                            <div className="md:col-span-6 space-y-2">
                                                <label className="block text-xs font-semibold text-slate-600 mb-1">Descripción del Producto/Obra *</label>
                                                {catalogo.length > 0 && (
                                                    <div className="flex gap-2">
                                                        <select
                                                            value={catSeleccionada[index] || ''}
                                                            onChange={e => setCatSeleccionada(prev => ({ ...prev, [index]: e.target.value }))}
                                                            className="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-400"
                                                        >
                                                            <option value="">-- Categoría --</option>
                                                            {categorias.map(cat => (
                                                                <option key={cat} value={cat}>{cat}</option>
                                                            ))}
                                                        </select>
                                                        <select
                                                            value=""
                                                            onChange={e => {
                                                                const item = catalogo.find(i => i.id === Number(e.target.value));
                                                                if (item) setValue(`servicios_detalle.${index}.descripcion`, item.descripcion);
                                                            }}
                                                            className="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-400"
                                                        >
                                                            <option value="">-- Producto --</option>
                                                            {catalogo
                                                                .filter(i => !catSeleccionada[index] || i.categoria === catSeleccionada[index])
                                                                .map(i => (
                                                                    <option key={i.id} value={i.id}>{i.nombre}</option>
                                                                ))}
                                                        </select>
                                                    </div>
                                                )}
                                                <textarea
                                                    {...register(`servicios_detalle.${index}.descripcion`)}
                                                    placeholder="Descripción del producto u obra..."
                                                    rows={3}
                                                    className={`w-full p-2.5 bg-slate-50 border ${errors.servicios_detalle?.[index]?.descripcion ? 'border-red-400' : 'border-slate-200'} rounded-lg focus:bg-white text-xs resize-none`}
                                                />
                                                {errors.servicios_detalle?.[index]?.descripcion && (
                                                    <p className="text-xs text-red-500">{errors.servicios_detalle[index]?.descripcion?.message}</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {errors.servicios_detalle?.root && <p className="text-red-500 text-sm">{errors.servicios_detalle.root.message}</p>}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4">
                                        <h3 className="font-bold text-slate-800 text-sm uppercase">Requerimientos Adicionales</h3>
                                        <div className="grid grid-cols-2 gap-3">
                                            {[
                                                { key: 'matizado', label: 'Matizado' },
                                                { key: 'pelicula', label: 'Película' },
                                                { key: 'acarreo', label: 'Acarreo' },
                                                { key: 'instalacion', label: 'Instalación' },
                                                { key: 'huacal', label: 'Huacal' },
                                                { key: 'carton', label: 'Cartón' }
                                            ].map(({ key, label }) => (
                                                <label key={key} className="flex items-center gap-2 cursor-pointer group">
                                                    <div className="relative flex items-center">
                                                        <input
                                                            type="checkbox"
                                                            {...register(key as keyof ODPFormValues)}
                                                            className="peer sr-only"
                                                        />
                                                        <div className="w-5 h-5 bg-white border-2 border-slate-300 rounded group-hover:border-blue-500 peer-checked:bg-blue-600 peer-checked:border-blue-600 transition flex items-center justify-center">
                                                            <svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                                        </div>
                                                    </div>
                                                    <span className="text-sm text-slate-700 font-medium group-hover:text-slate-900 transition">{label}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="bg-orange-50/50 p-5 rounded-xl border border-orange-200/50 space-y-4">
                                        <h3 className="font-bold text-slate-800 text-sm uppercase flex items-center gap-2">
                                            <Package className="w-4 h-4 text-orange-500" />
                                            Pedido Externo (Vidrio)
                                        </h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-600 mb-1">Proveedor</label>
                                                <select
                                                    {...register('proveedor_vidrio')}
                                                    className="w-full text-sm p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                                                >
                                                    <option value="">Seleccionar...</option>
                                                    <option value="Vitelsa">Vitelsa</option>
                                                    <option value="Templacol">Templacol</option>
                                                    <option value="Vidplex">Vidplex</option>
                                                    <option value="Otros">Otros</option>
                                                </select>
                                            </div>
                                            {proveedorVidrio && !odpToEdit && (
                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Núm. Pedido PV (auto)</label>
                                                    <div className="w-full text-sm p-2.5 bg-slate-100 border border-slate-200 rounded-lg text-slate-700 font-mono font-bold">
                                                        {siguienteNumeroPV ?? '...'}
                                                    </div>
                                                    <p className="text-xs text-slate-400 mt-1">Se asigna automáticamente al crear la ODP</p>
                                                </div>
                                            )}
                                            {odpToEdit && odpToEdit.numero_pedido_proveedor && (
                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Núm. Pedido PV</label>
                                                    <div className="w-full text-sm p-2.5 bg-slate-100 border border-slate-200 rounded-lg text-slate-700 font-mono font-bold">
                                                        {odpToEdit.numero_pedido_proveedor}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4 mt-6">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Dirección de Instalación / Entrega <span className="text-rose-500">*</span></label>
                                        <input
                                            type="text"
                                            {...register('direccion_instalacion')}
                                            placeholder="Ej. Cra 45 #23-10, Barrio El Centro"
                                            className={`w-full p-2.5 bg-white border rounded-lg focus:ring-2 focus:ring-blue-500 ${errors.direccion_instalacion ? 'border-rose-400' : 'border-slate-200'}`}
                                        />
                                        {errors.direccion_instalacion && <p className="text-xs text-rose-500 mt-1">{errors.direccion_instalacion.message}</p>}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Contacto en Obra <span className="text-rose-500">*</span></label>
                                            <input
                                                type="text"
                                                {...register('nombre_recibe')}
                                                placeholder="Nombre de quien recibe"
                                                className={`w-full p-2.5 bg-white border rounded-lg focus:ring-2 focus:ring-blue-500 ${errors.nombre_recibe ? 'border-rose-400' : 'border-slate-200'}`}
                                            />
                                            {errors.nombre_recibe && <p className="text-xs text-rose-500 mt-1">{errors.nombre_recibe.message}</p>}
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono Contacto <span className="text-rose-500">*</span></label>
                                            <input
                                                type="text"
                                                {...register('telefono_recibe')}
                                                placeholder="Cel. o fijo de contacto"
                                                className={`w-full p-2.5 bg-white border rounded-lg focus:ring-2 focus:ring-blue-500 ${errors.telefono_recibe ? 'border-rose-400' : 'border-slate-200'}`}
                                            />
                                            {errors.telefono_recibe && <p className="text-xs text-rose-500 mt-1">{errors.telefono_recibe.message}</p>}
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Cargo Contacto</label>
                                            <input
                                                type="text"
                                                {...register('cargo_recibe')}
                                                placeholder="Ej: Administrador, Residente de obra"
                                                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Observaciones Esp. Cliente</label>
                                        <textarea
                                            {...register('observaciones')}
                                            placeholder="Notas, cuidados, horarios límite, indicaciones para la visita técnica, etc..."
                                            rows={3}
                                            className="w-full p-3 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
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
                                            <p className="text-xs text-orange-600 mt-0.5">El cliente no tiene medidas. El jefe de producción debe realizar una visita antes de iniciar la orden.</p>
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
                                        onClick={() => appendItem({ tipo_vidrio: '', color: 'Incoloro', espesor: 6, ancho_mm: 0, alto_mm: 0, cantidad: 1, pulidos: '', pulidos_h: '', perforaciones: 0, boquetes: 0, descuentos: '', otros: '', prod: '' })}
                                        className="px-3 py-1.5 bg-slate-900 text-white text-sm rounded-md hover:bg-slate-800 transition flex items-center gap-1"
                                    >
                                        <Plus className="w-4 h-4" /> Agregar Cristal
                                    </button>
                                </div>

                                {errors.items?.root && (
                                    <div className="p-3 bg-red-50 text-red-600 rounded-lg flex items-center gap-2 mb-4">
                                        <AlertCircle className="w-5 h-5" />
                                        <span className="text-sm font-medium">{errors.items.root.message}</span>
                                    </div>
                                )}

                                <div className="space-y-4">
                                    <AnimatePresence>
                                        {itemFields.map((field, index) => (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                key={field.id}
                                                className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap lg:flex-nowrap gap-4 items-start"
                                            >
                                                <ColorField index={index} register={register} control={control} />
                                                <div className="w-1/2 lg:w-1/12">
                                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Esp. (mm)</label>
                                                    <input
                                                        type="number"
                                                        {...register(`items.${index}.espesor`)}
                                                        className="w-full p-2 text-sm border border-slate-200 rounded focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                                <div className="w-1/2 lg:w-2/12 border-l border-slate-200 pl-4">
                                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Medidas (mm)</label>
                                                    <div className="flex gap-2">
                                                        <input
                                                            type="number"
                                                            placeholder="Ancho"
                                                            {...register(`items.${index}.ancho_mm`)}
                                                            className="w-1/2 p-2 text-sm border border-slate-200 rounded focus:ring-2 focus:ring-blue-500"
                                                        />
                                                        <span className="text-slate-400 self-center">×</span>
                                                        <input
                                                            type="number"
                                                            placeholder="Alto"
                                                            {...register(`items.${index}.alto_mm`)}
                                                            className="w-1/2 p-2 text-sm border border-slate-200 rounded focus:ring-2 focus:ring-blue-500"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="w-1/3 lg:w-1/12 border-l border-slate-200 pl-4">
                                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Cant.</label>
                                                    <input
                                                        type="number"
                                                        {...register(`items.${index}.cantidad`)}
                                                        className="w-full p-2 text-sm border border-slate-200 rounded focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>

                                                {/* Acabados + MTS PT + PROD */}
                                                <div className="w-full lg:flex-1 grid grid-cols-4 gap-2 border-l border-slate-200 pl-4">
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">PUL A*</label>
                                                        <input type="number" min="0" max="9" {...register(`items.${index}.pulidos`)} className="w-full p-1.5 text-xs border border-slate-200 rounded text-center" placeholder="0" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">PUL H*</label>
                                                        <input type="number" min="0" max="9" {...register(`items.${index}.pulidos_h`)} className="w-full p-1.5 text-xs border border-slate-200 rounded text-center" placeholder="0" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Perf.</label>
                                                        <input type="number" {...register(`items.${index}.perforaciones`)} className="w-full p-1.5 text-xs border border-slate-200 rounded text-center" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Boq.</label>
                                                        <input type="number" {...register(`items.${index}.boquetes`)} className="w-full p-1.5 text-xs border border-slate-200 rounded text-center" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Des.</label>
                                                        <input {...register(`items.${index}.descuentos`)} className="w-full p-1.5 text-xs border border-slate-200 rounded" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Otros**</label>
                                                        <input {...register(`items.${index}.otros`)} className="w-full p-1.5 text-xs border border-slate-200 rounded" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">MTS PT</label>
                                                        <input
                                                            readOnly
                                                            value={(() => {
                                                                const a = parseFloat(String(itemFields[index]?.ancho_mm || 0));
                                                                const h = parseFloat(String(itemFields[index]?.alto_mm || 0));
                                                                if (a > 0 && h > 0) return ((a / 1000) * (h / 1000)).toFixed(3);
                                                                return '';
                                                            })()}
                                                            className="w-full p-1.5 text-xs border border-slate-100 rounded bg-slate-50 text-slate-500 text-center"
                                                            placeholder="m²"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">PROD</label>
                                                        <select {...register(`items.${index}.prod`)} className="w-full p-1.5 text-xs border border-slate-200 rounded bg-white">
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
                                            </motion.div>
                                        ))}
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
    );
};

export default ODPForm;
