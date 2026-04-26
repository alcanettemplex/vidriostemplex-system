import React, { useState, useEffect, useCallback } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import {
  X, CheckCircle2, Plus, Briefcase, DollarSign, Package, Building2, UserCheck,
} from 'lucide-react';
import { motion } from 'framer-motion';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// ─── Schemas ────────────────────────────────────────────────────────────────

const servicioSchema = z.object({
  cantidad: z.coerce.number().int().positive('Mayor a 0').default(1),
  tipo_servicio: z.string().min(1, 'Obligatorio'),
  descripcion: z.string().min(1, 'Obligatorio'),
});

const odpSchema = z.object({
  fecha_entrega: z.string().min(1, 'La fecha de entrega es requerida'),
  servicios_detalle: z.array(servicioSchema).min(1, 'Debe agregar al menos un servicio'),
  forma_pago: z.string().optional(),
  observaciones: z.string().optional(),
  valor_total: z.coerce.number().min(0).optional(),
  matizado: z.boolean().default(false),
  pelicula: z.boolean().default(false),
  acarreo: z.boolean().default(false),
  instalacion: z.boolean().default(false),
  huacal: z.boolean().default(false),
  carton: z.boolean().default(false),
  proveedor_vidrio: z.string().optional(),
  numero_pedido_proveedor: z.string().optional(),
});

type ODPFormValues = z.infer<typeof odpSchema>;
type CatalogoItem = { id: number; categoria: string; nombre: string; descripcion: string };
type ClienteItem = { id: number; nombre_razon_social: string; telefono: string | null; celular: string | null; email: string | null; };

interface Props {
  prospecto: any;
  onClose: () => void;
  onAprobado: () => void;
  asesorId?: number | null;
  tipoOdp?: 'ODP' | 'OA';
}

// ─── Componente ──────────────────────────────────────────────────────────────

const AprobarProspectoModal: React.FC<Props> = ({ prospecto, onClose, onAprobado, asesorId, tipoOdp }) => {
  const navigate = useNavigate();
  const token = sessionStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const esContactoNuevo = !prospecto.cliente_id;
  const tm = prospecto.tomas_medidas?.[0];
  const contacto = prospecto.cliente?.nombre_razon_social || prospecto.nombre_contacto || '—';

  // Estado para definir cliente (solo si es contacto nuevo)
  const [tipoCliente, setTipoCliente] = useState<'existente' | 'nuevo'>('existente');
  const [clienteId, setClienteId] = useState<string>('');
  const [nuevoCliente, setNuevoCliente] = useState({
    nombre_razon_social: prospecto.nombre_contacto || '',
    tipo_documento: 'CC',
    numero_documento: '',
    telefono: prospecto.telefono_contacto || '',
    email: prospecto.email_contacto || '',
    direccion: prospecto.direccion || '',
  });
  const [clientes, setClientes] = useState<ClienteItem[]>([]);
  const [cargoRecibe, setCargoRecibe] = useState('');

  const [catalogo, setCatalogo] = useState<CatalogoItem[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [catSeleccionada, setCatSeleccionada] = useState<Record<number, string>>({});
  const [siguienteNumeroPV, setSiguienteNumeroPV] = useState<number | null>(null);

  const { register, control, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<ODPFormValues>({
    resolver: zodResolver(odpSchema) as any,
    defaultValues: {
      fecha_entrega: '',
      servicios_detalle: [{ cantidad: 1, tipo_servicio: 'Suministro e Instalación', descripcion: prospecto.descripcion || '' }],
      forma_pago: '',
      observaciones: '',
      valor_total: 0,
      matizado: false,
      pelicula: false,
      acarreo: false,
      instalacion: false,
      huacal: false,
      carton: false,
      proveedor_vidrio: '',
      numero_pedido_proveedor: '',
    },
  });

  const { fields: servicioFields, append: appendServicio, remove: removeServicio } = useFieldArray({
    control,
    name: 'servicios_detalle',
  });

  const valorTotalRaw = useWatch({ control, name: 'valor_total' }) || 0;
  const proveedorVidrio = useWatch({ control, name: 'proveedor_vidrio' });
  const IVA_RATE = 0.19;
  const subtotal = Number(valorTotalRaw) / (1 + IVA_RATE);
  const ivaValor = Number(valorTotalRaw) - subtotal;
  const fmtCOP = (n: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

  const loadData = useCallback(async () => {
    try {
      const [catRes, cliRes] = await Promise.all([
        axios.get(`${API}/api/catalogo`, { headers }),
        axios.get(`${API}/api/clientes`, { headers }),
      ]);
      setCatalogo(catRes.data);
      const cats = Array.from(new Set<string>(catRes.data.map((i: CatalogoItem) => i.categoria)));
      setCategorias(cats);
      setClientes(cliRes.data);
    } catch { /* opcional */ }
  }, []); // eslint-disable-line

  useEffect(() => {
    loadData();
    axios.get(`${API}/api/pedidos-pv/siguiente-numero`, { headers })
      .then(r => setSiguienteNumeroPV(r.data.siguiente))
      .catch(() => {});
  }, [loadData]); // eslint-disable-line

  const setNC = (k: string, v: string) => setNuevoCliente(prev => ({ ...prev, [k]: v }));

  const onSubmit = async (data: any) => {
    // Validar definición de cliente para contacto nuevo
    if (esContactoNuevo) {
      if (tipoCliente === 'existente' && !clienteId) {
        toast.error('Selecciona un cliente existente'); return;
      }
      if (tipoCliente === 'nuevo') {
        if (!nuevoCliente.nombre_razon_social.trim()) { toast.error('Ingresa la razón social del cliente'); return; }
        if (!nuevoCliente.numero_documento.trim()) { toast.error('Ingresa el número de documento del cliente'); return; }
      }
    }

    try {
      const payload: any = {
        ...data,
        // Datos de contacto de instalación siempre del prospecto/TM
        nombre_recibe: tm?.contacto_obra || prospecto.nombre_contacto || '',
        telefono_recibe: tm?.telefono_obra || prospecto.telefono_contacto || '',
        direccion_instalacion: tm?.direccion || prospecto.direccion || '',
        cargo_recibe: cargoRecibe || null,
      };

      // Definición de cliente
      if (esContactoNuevo) {
        if (tipoCliente === 'existente') {
          payload.cliente_id = Number(clienteId);
        } else {
          payload.nuevo_cliente = nuevoCliente;
        }
      }

      if (asesorId) payload.asesor_id = asesorId;
      if (tipoOdp) payload.tipo_odp = tipoOdp;

      const res = await axios.post(`${API}/api/prospectos/${prospecto.id}/aprobar`, payload, { headers });
      toast.success('Prospecto aprobado — ODP creada');
      onAprobado();
      if (res.data?.odp?.id) navigate('/odp');
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al aprobar');
    }
  };

  const clienteSeleccionado = clientes.find(c => String(c.id) === clienteId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-slate-200"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-100 flex justify-between items-center flex-shrink-0 rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              Aprobar Prospecto — Generar ODP
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{prospecto.numero_prospecto} · {contacto}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">

            {/* ── DEFINIR CLIENTE (solo si es contacto nuevo) ── */}
            {esContactoNuevo && (
              <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl space-y-4">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-amber-600" />
                  <p className="text-sm font-bold text-amber-800">Definir cliente para esta ODP</p>
                </div>
                <p className="text-xs text-amber-600">
                  El prospecto fue registrado como contacto nuevo. Ahora debes asociarlo a un cliente.
                </p>

                {/* Selector tipo cliente */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTipoCliente('existente')}
                    className={`py-2.5 text-sm font-bold rounded-xl border transition flex items-center justify-center gap-2 ${
                      tipoCliente === 'existente' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <UserCheck className="w-4 h-4" /> Cliente existente
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoCliente('nuevo')}
                    className={`py-2.5 text-sm font-bold rounded-xl border transition flex items-center justify-center gap-2 ${
                      tipoCliente === 'nuevo' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Building2 className="w-4 h-4" /> Crear cliente nuevo
                  </button>
                </div>

                {/* Cliente existente */}
                {tipoCliente === 'existente' && (
                  <div className="space-y-2">
                    <select
                      value={clienteId}
                      onChange={e => setClienteId(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    >
                      <option value="">Seleccionar cliente...</option>
                      {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre_razon_social}</option>)}
                    </select>
                    {clienteSeleccionado && (
                      <div className="p-2.5 bg-white border border-amber-100 rounded-lg text-xs text-slate-600 space-y-0.5">
                        {(clienteSeleccionado.telefono || clienteSeleccionado.celular) && (
                          <p>📞 {clienteSeleccionado.telefono || clienteSeleccionado.celular}</p>
                        )}
                        {clienteSeleccionado.email && <p>✉️ {clienteSeleccionado.email}</p>}
                      </div>
                    )}
                  </div>
                )}

                {/* Nuevo cliente */}
                {tipoCliente === 'nuevo' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
                        Razón social / Nombre <span className="text-red-400">*</span>
                      </label>
                      <input
                        value={nuevoCliente.nombre_razon_social}
                        onChange={e => setNC('nombre_razon_social', e.target.value)}
                        placeholder="Empresa o nombre completo"
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">Tipo doc.</label>
                      <select
                        value={nuevoCliente.tipo_documento}
                        onChange={e => setNC('tipo_documento', e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      >
                        <option value="CC">CC</option>
                        <option value="NIT">NIT</option>
                        <option value="CE">CE</option>
                        <option value="DNI">DNI</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
                        Número doc. <span className="text-red-400">*</span>
                      </label>
                      <input
                        value={nuevoCliente.numero_documento}
                        onChange={e => setNC('numero_documento', e.target.value)}
                        placeholder="Cédula o NIT"
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">Teléfono</label>
                      <input
                        value={nuevoCliente.telefono}
                        onChange={e => setNC('telefono', e.target.value)}
                        placeholder="3001234567"
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">Email</label>
                      <input
                        value={nuevoCliente.email}
                        onChange={e => setNC('email', e.target.value)}
                        placeholder="correo@ejemplo.com"
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">Dirección fiscal</label>
                      <input
                        value={nuevoCliente.direccion}
                        onChange={e => setNC('direccion', e.target.value)}
                        placeholder="Dirección de facturación"
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                  </div>
                )}

                {/* Resumen contacto de instalación */}
                <div className="p-3 bg-green-50 border border-green-200 rounded-xl space-y-2">
                  <p className="text-xs font-bold text-green-700">Contacto de instalación (del prospecto)</p>
                  <div className="text-xs text-green-700 space-y-0.5">
                    <p>👤 {tm?.contacto_obra || prospecto.nombre_contacto || '—'}</p>
                    <p>📞 {tm?.telefono_obra || prospecto.telefono_contacto || '—'}</p>
                    <p>📍 {tm?.direccion || prospecto.direccion || '—'}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-green-700 mb-1 uppercase tracking-wider">Cargo del contacto</label>
                    <input
                      value={cargoRecibe}
                      onChange={e => setCargoRecibe(e.target.value)}
                      placeholder="Ej: Administrador, Residente de obra..."
                      className="w-full border border-green-200 bg-white rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Cliente ya definido — mostrar + cargo editable */}
            {!esContactoNuevo && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-start gap-3">
                  <Building2 className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-slate-600">Cliente: {prospecto.cliente?.nombre_razon_social}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Contacto instalación: {tm?.contacto_obra || prospecto.nombre_contacto || '—'} · {tm?.telefono_obra || prospecto.telefono_contacto || '—'}
                    </p>
                    {(tm?.direccion || prospecto.direccion) && (
                      <p className="text-xs text-slate-400 mt-0.5">📍 {tm?.direccion || prospecto.direccion}</p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Cargo del contacto</label>
                  <input
                    value={cargoRecibe}
                    onChange={e => setCargoRecibe(e.target.value)}
                    placeholder="Ej: Administrador, Residente de obra..."
                    className="w-full border border-slate-200 bg-white rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              </div>
            )}

            {/* TM asociada */}
            {tm && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-green-700">Toma de medidas: {tm.numero_tm}</p>
                  <p className="text-xs text-green-600">Los datos de contacto de instalación se tomarán de la visita técnica</p>
                </div>
              </div>
            )}

            {/* Fecha entrega + Valor total */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Fecha ODP Listo Material <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  {...register('fecha_entrega')}
                  className={`w-full p-2.5 bg-white border rounded-lg focus:ring-2 focus:ring-green-500 ${errors.fecha_entrega ? 'border-rose-400' : 'border-slate-200'}`}
                />
                {errors.fecha_entrega && <p className="text-xs text-rose-500 mt-1">{errors.fecha_entrega.message}</p>}
              </div>

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
                    className="w-full pl-9 p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
                {Number(valorTotalRaw) > 0 && (
                  <div className="mt-2 p-2.5 bg-blue-50 border border-blue-100 rounded-lg text-xs space-y-0.5">
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal (sin IVA):</span><span className="font-semibold">{fmtCOP(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>IVA 19%:</span><span className="font-semibold">{fmtCOP(ivaValor)}</span>
                    </div>
                    <div className="flex justify-between text-blue-800 font-bold border-t border-blue-200 pt-1 mt-1">
                      <span>Total:</span><span>{fmtCOP(Number(valorTotalRaw))}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Información de Productos / Servicios */}
            <div className="p-5 bg-blue-50/50 rounded-xl border border-blue-100 space-y-4">
              <h3 className="font-bold text-blue-900 flex items-center justify-between">
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
                    <button type="button" onClick={() => removeServicio(index)}
                      className="absolute -top-3 -right-3 bg-red-100 text-red-600 p-1.5 rounded-full hover:bg-red-200 shadow-sm">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Cant. *</label>
                    <input type="number" {...register(`servicios_detalle.${index}.cantidad`)} min="1"
                      className={`w-full p-2.5 bg-slate-50 border ${errors.servicios_detalle?.[index]?.cantidad ? 'border-red-400' : 'border-slate-200'} rounded-lg focus:bg-white`} />
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Servicio/Gestión *</label>
                    <select {...register(`servicios_detalle.${index}.tipo_servicio`)}
                      className={`w-full p-2.5 bg-slate-50 border ${errors.servicios_detalle?.[index]?.tipo_servicio ? 'border-red-400' : 'border-slate-200'} rounded-lg focus:bg-white`}>
                      <option value="Suministro e Instalación">Suministro e Instalación</option>
                      <option value="Solo Instalación">Solo Instalación</option>
                      <option value="Venta">Venta</option>
                      <option value="Mantenimiento">Mantenimiento</option>
                      <option value="Garantía / Reposición">Garantía / Reposición</option>
                      <option value="Otro">Otro</option>
                    </select>
                  </div>
                  <div className="md:col-span-6 space-y-2">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Descripción del Producto/Obra *</label>
                    {catalogo.length > 0 && (
                      <div className="flex gap-2">
                        <select value={catSeleccionada[index] || ''} onChange={e => setCatSeleccionada(prev => ({ ...prev, [index]: e.target.value }))}
                          className="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-400">
                          <option value="">-- Categoría --</option>
                          {categorias.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                        <select value="" onChange={e => {
                          const item = catalogo.find(i => i.id === Number(e.target.value));
                          if (item) setValue(`servicios_detalle.${index}.descripcion`, item.descripcion);
                        }} className="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-400">
                          <option value="">-- Producto --</option>
                          {catalogo.filter(i => !catSeleccionada[index] || i.categoria === catSeleccionada[index]).map(i => (
                            <option key={i.id} value={i.id}>{i.nombre}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <textarea {...register(`servicios_detalle.${index}.descripcion`)}
                      placeholder="Descripción del producto u obra..." rows={3}
                      className={`w-full p-2.5 bg-slate-50 border ${errors.servicios_detalle?.[index]?.descripcion ? 'border-red-400' : 'border-slate-200'} rounded-lg focus:bg-white text-xs resize-none`} />
                    {errors.servicios_detalle?.[index]?.descripcion && (
                      <p className="text-xs text-red-500">{errors.servicios_detalle[index]?.descripcion?.message}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Requerimientos adicionales + Pedido externo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4">
                <h3 className="font-bold text-slate-800 text-sm uppercase">Requerimientos Adicionales</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'matizado', label: 'Matizado' },
                    { key: 'pelicula', label: 'Película' },
                    { key: 'acarreo', label: 'Acarreo' },
                    { key: 'instalacion', label: 'Instalación' },
                    { key: 'huacal', label: 'Huacal' },
                    { key: 'carton', label: 'Cartón' },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer group">
                      <div className="relative flex items-center">
                        <input type="checkbox" {...register(key as keyof ODPFormValues)} className="peer sr-only" />
                        <div className="w-5 h-5 bg-white border-2 border-slate-300 rounded group-hover:border-blue-500 peer-checked:bg-blue-600 peer-checked:border-blue-600 transition flex items-center justify-center">
                          <svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      </div>
                      <span className="text-sm text-slate-700 font-medium group-hover:text-slate-900 transition">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="bg-orange-50/50 p-5 rounded-xl border border-orange-200/50 space-y-4">
                <h3 className="font-bold text-slate-800 text-sm uppercase flex items-center gap-2">
                  <Package className="w-4 h-4 text-orange-500" /> Pedido Externo (Vidrio)
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Proveedor</label>
                    <select {...register('proveedor_vidrio')} className="w-full text-sm p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500">
                      <option value="">Seleccionar...</option>
                      <option value="Vitelsa">Vitelsa</option>
                      <option value="Templacol">Templacol</option>
                      <option value="Vidplex">Vidplex</option>
                      <option value="Otros">Otros</option>
                    </select>
                  </div>
                  {proveedorVidrio && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Núm. Pedido PV (auto)</label>
                      <div className="w-full text-sm p-2.5 bg-slate-100 border border-slate-200 rounded-lg text-slate-700 font-mono font-bold">
                        {siguienteNumeroPV ?? '...'}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">Se asigna automáticamente al crear la ODP</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Forma de pago + Observaciones */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Forma de Pago</label>
                <select {...register('forma_pago')} className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 text-sm">
                  <option value="">Seleccionar...</option>
                  <option value="contado">Pago Anticipado</option>
                  <option value="credito">Crédito</option>
                  <option value="50_50">50% anticipo / 50% entrega</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Observaciones Esp. Cliente</label>
              <textarea {...register('observaciones')}
                placeholder="Notas, cuidados, horarios límite, etc..." rows={3}
                className="w-full p-3 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 resize-none" />
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 flex gap-3 flex-shrink-0 rounded-b-2xl">
            <button type="button" onClick={onClose}
              className="flex-1 py-3 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition text-sm">
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting}
              className="flex-1 py-3 font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 transition disabled:opacity-40 text-sm flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {isSubmitting ? 'Creando ODP...' : 'Aprobar y crear ODP'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default AprobarProspectoModal;
