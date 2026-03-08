import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Plus, Trash2, X, FileCheck, DollarSign, Package, AlertCircle, ChevronRight, ChevronLeft, Briefcase } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const itemSchema = z.object({
    tipo_vidrio: z.string().min(1, 'Requerido'),
    espesor: z.coerce.number().positive(),
    ancho_mm: z.coerce.number().positive(),
    alto_mm: z.coerce.number().positive(),
    cantidad: z.coerce.number().int().positive(),
    pulidos: z.string().optional(),
    perforaciones: z.coerce.number().int().nonnegative().optional(),
    boquetes: z.coerce.number().int().nonnegative().optional(),
    descuentos: z.string().optional(),
    otros: z.string().optional()
});

const servicioSchema = z.object({
    cantidad: z.coerce.number().int().positive('Mayor a 0').default(1),
    tipo_servicio: z.string().min(1, 'Obligatorio'),
    descripcion: z.string().min(1, 'Obligatorio')
});

const odpSchema = z.object({
    cliente_id: z.coerce.number().positive('Debe seleccionar cliente'),
    servicios_detalle: z.array(servicioSchema).min(1, 'Debe agregar al menos un servicio'),
    observaciones: z.string().optional(),
    direccion_instalacion: z.string().optional(),
    matizado: z.boolean().optional().default(false),
    pelicula: z.boolean().optional().default(false),
    acarreo: z.boolean().optional().default(false),
    instalacion: z.boolean().optional().default(false),
    huacal: z.boolean().optional().default(false),
    carton: z.boolean().optional().default(false),
    abono: z.coerce.number().min(0, 'No puede ser negativo').optional(),
    proveedor_vidrio: z.string().optional(),
    numero_pedido_proveedor: z.string().optional(),
    items: z.array(itemSchema).optional()
});

type ItemFormValues = {
    tipo_vidrio: string;
    espesor: number;
    ancho_mm: number;
    alto_mm: number;
    cantidad: number;
    pulidos?: string | undefined;
    perforaciones?: number | undefined;
    boquetes?: number | undefined;
    descuentos?: string | undefined;
    otros?: string | undefined;
};

type ServicioFormValues = {
    cantidad: number;
    tipo_servicio: string;
    descripcion: string;
};

type ODPFormValues = {
    cliente_id: number;
    servicios_detalle: ServicioFormValues[];
    observaciones?: string;
    direccion_instalacion?: string;
    matizado: boolean;
    pelicula: boolean;
    acarreo: boolean;
    instalacion: boolean;
    huacal: boolean;
    carton: boolean;
    abono?: number | undefined;
    proveedor_vidrio?: string;
    numero_pedido_proveedor?: string;
    items: ItemFormValues[];
};

interface ODPFormProps {
    onClose: () => void;
    onSuccess: () => void;
    odpToEdit?: any;
}

const ODPForm: React.FC<ODPFormProps> = ({ onClose, onSuccess, odpToEdit }) => {
    const [step, setStep] = useState(1);
    const [clientes, setClientes] = useState<{ id: number; nombre_razon_social: string }[]>([]);

    const { register, control, handleSubmit, trigger, reset, formState: { errors, isSubmitting } } = useForm<ODPFormValues>({
        resolver: zodResolver(odpSchema as any),
        defaultValues: {
            servicios_detalle: [{ cantidad: 1, tipo_servicio: '', descripcion: '' }],
            observaciones: '',
            direccion_instalacion: '',
            matizado: false,
            pelicula: false,
            acarreo: false,
            instalacion: false,
            huacal: false,
            carton: false,
            items: [], // Array vacío por defecto, permitiendo que avance si no sabe medidas
            abono: 0
        }
    });

    const { fields: itemFields, append: appendItem, remove: removeItem } = useFieldArray({
        control,
        name: 'items'
    });

    const { fields: servicioFields, append: appendServicio, remove: removeServicio } = useFieldArray({
        control,
        name: 'servicios_detalle'
    });

    useEffect(() => {
        // Simulando fetch de clientes
        const fetchClientes = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await axios.get(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/clientes`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setClientes(res.data);
            } catch (error) {
                console.error('Error fetching clientes:', error);
            }
        };
        fetchClientes();
    }, []);

    const nextStep = async () => {
        const fieldsToValidate = ['cliente_id', 'servicios_detalle', 'direccion_instalacion', 'observaciones', 'abono'] as const;
        const isStepValid = await trigger();
        if (isStepValid) {
            setStep(2);
        }
    };

    useEffect(() => {
        if (odpToEdit) {
            reset({
                cliente_id: odpToEdit.cliente_id,
                servicios_detalle: odpToEdit.servicios_detalle?.length ? odpToEdit.servicios_detalle : [{ cantidad: odpToEdit.cantidad_total || 1, tipo_servicio: odpToEdit.tipo_servicio || '', descripcion: odpToEdit.descripcion_pedido || '' }],
                observaciones: odpToEdit.observaciones || '',
                direccion_instalacion: odpToEdit.direccion_instalacion || '',
                matizado: odpToEdit.matizado || false,
                pelicula: odpToEdit.pelicula || false,
                acarreo: odpToEdit.acarreo || false,
                instalacion: odpToEdit.instalacion || false,
                huacal: odpToEdit.huacal || false,
                carton: odpToEdit.carton || false,
                items: odpToEdit.items || [],
                abono: odpToEdit.abono || 0,
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
            const payload = {
                ...data,
                cantidad_total: data.servicios_detalle.reduce((acc, curr) => acc + curr.cantidad, 0),
                tipo_servicio: data.servicios_detalle[0].tipo_servicio,
                descripcion_pedido: data.servicios_detalle.map(s => `${s.cantidad}x ${s.tipo_servicio}: ${s.descripcion}`).join('\n')
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
                className="glass-panel w-full max-w-4xl max-h-[90vh] overflow-y-auto"
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
                                        <select
                                            {...register('cliente_id')}
                                            className={`w-full p-2.5 bg-white border ${errors.cliente_id ? 'border-red-400' : 'border-slate-200'} rounded-lg focus:ring-2 focus:ring-blue-500`}
                                        >
                                            <option value={0}>Seleccione un cliente...</option>
                                            {clientes.map(c => (
                                                <option key={c.id} value={c.id}>{c.nombre_razon_social}</option>
                                            ))}
                                        </select>
                                        {errors.cliente_id && <p className="text-red-500 text-xs mt-1">{errors.cliente_id.message}</p>}
                                    </div>

                                    {/* Anticipo */}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Anticipo / Abono Inicial</label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <DollarSign className="w-4 h-4 text-slate-400" />
                                            </div>
                                            <input
                                                type="number"
                                                step="0.01"
                                                {...register('abono')}
                                                className="w-full pl-9 p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
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

                                            <div className="md:col-span-6">
                                                <label className="block text-xs font-semibold text-slate-600 mb-1">Descripción del Producto/Obra *</label>
                                                <input
                                                    type="text"
                                                    {...register(`servicios_detalle.${index}.descripcion`)}
                                                    placeholder="Ej. Cabina Glassvit negra L..."
                                                    className={`w-full p-2.5 bg-slate-50 border ${errors.servicios_detalle?.[index]?.descripcion ? 'border-red-400' : 'border-slate-200'} rounded-lg focus:bg-white`}
                                                />
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
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-600 mb-1">Num. Pedido</label>
                                                <input
                                                    type="text"
                                                    {...register('numero_pedido_proveedor')}
                                                    placeholder="Ej. SAP-1234"
                                                    className="w-full text-sm p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4 mt-6">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Dirección de Instalación / Entrega</label>
                                        <input
                                            type="text"
                                            {...register('direccion_instalacion')}
                                            placeholder="Ej. Calle 123... (Opcional si es la misma del cliente)"
                                            className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Observaciones Esp. Cliente</label>
                                        <textarea
                                            {...register('observaciones')}
                                            placeholder="Notas, cuidados, horarios límite, etc..."
                                            rows={3}
                                            className="w-full p-3 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                                        />
                                    </div>
                                </div>
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
                                        onClick={() => appendItem({ tipo_vidrio: '', espesor: 6, ancho_mm: 0, alto_mm: 0, cantidad: 1, pulidos: '', perforaciones: 0, boquetes: 0, descuentos: '', otros: '' })}
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
                                                <div className="w-full lg:w-2/12">
                                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Tipo</label>
                                                    <input
                                                        {...register(`items.${index}.tipo_vidrio`)}
                                                        className="w-full p-2 text-sm border border-slate-200 rounded focus:ring-2 focus:ring-blue-500"
                                                        placeholder="Ej. Incoloro"
                                                    />
                                                </div>
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

                                                {/* Additional Finishes specifically requested from Excel format */}
                                                <div className="w-full lg:flex-1 grid grid-cols-5 gap-2 border-l border-slate-200 pl-4">
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Pul*</label>
                                                        <input {...register(`items.${index}.pulidos`)} className="w-full p-1.5 text-xs border border-slate-200 rounded" placeholder="P/B, PC" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Perf.</label>
                                                        <input type="number" {...register(`items.${index}.perforaciones`)} className="w-full p-1.5 text-xs border border-slate-200 rounded" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Boq.</label>
                                                        <input type="number" {...register(`items.${index}.boquetes`)} className="w-full p-1.5 text-xs border border-slate-200 rounded" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Des.</label>
                                                        <input {...register(`items.${index}.descuentos`)} className="w-full p-1.5 text-xs border border-slate-200 rounded" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Otros**</label>
                                                        <input {...register(`items.${index}.otros`)} className="w-full p-1.5 text-xs border border-slate-200 rounded" />
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
