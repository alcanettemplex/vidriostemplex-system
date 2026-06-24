import React, { useState } from 'react';
import { UserCheck, X, FileText, CreditCard, MapPin, Mail, Phone, AlertCircle, Tag } from 'lucide-react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useDispatch } from 'react-redux';
import { updateLead } from '../crmSlice';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const getHeaders = () => ({ headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` } });

const TIPOS_DOCUMENTO = ['NIT', 'C.C', 'C.E', 'PPT', 'Otros'];
const CONDICIONES_PAGO = [
  { value: 'CONTADO',     label: 'Contado' },
  { value: 'CREDITO_30',  label: 'Crédito 30 días' },
  { value: 'CREDITO_60',  label: 'Crédito 60 días' },
  { value: 'CUPO_APROBADO', label: 'Cupo Aprobado' },
];
const SEGMENTOS = [
  { value: 'CLIENTE FINAL',  label: 'Cliente Final' },
  { value: 'INSTITUCIONAL',  label: 'Institucional' },
  { value: 'INTERVID',       label: 'Intervid' },
  { value: 'ARQUITECTO',     label: 'Arquitecto' },
  { value: 'INDUSTRIAL',     label: 'Industrial' },
];
const FUENTES = ['WhatsApp', 'Web', 'Facebook', 'Instagram', 'Llamada', 'Presencial', 'Show Room', 'Referidos', 'Visita Asesor', 'Cliente'];

interface Props {
  lead: any;
  onClose: () => void;
}

const ConvertirClienteModal: React.FC<Props> = ({ lead, onClose }) => {
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    nombre_razon_social: lead.nombre || '',
    tipo_documento:      'C.C',
    numero_documento:    '',
    telefono:            lead.telefono || '',
    celular:             lead.telefono || '',
    email:               '',
    segmento:            lead.segmento || '',
    fuente:              lead.fuente_lead || '',
    direccion:           '',
    condicion_pago:      'CONTADO',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(p => ({ ...p, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.numero_documento.trim() || form.numero_documento.length < 5) {
      toast.warning('El número de documento debe tener al menos 5 caracteres.');
      return;
    }
    if (!form.fuente) {
      toast.warning('Selecciona la fuente del cliente.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await axios.post(
        `${API}/api/crm/${lead.id}/convertir`,
        form,
        getHeaders()
      );
      dispatch(updateLead({ ...lead, cliente_id: data.cliente.id, fecha_cierre: data.lead.fecha_cierre }));
      toast.success(
        data.esNuevo
          ? `Cliente "${data.cliente.nombre_razon_social}" creado exitosamente.`
          : `Lead vinculado al cliente existente "${data.cliente.nombre_razon_social}".`
      );
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al convertir el lead.');
    } finally {
      setLoading(false);
    }
  };

  const field = (label: string, icon: React.ReactNode, content: React.ReactNode, required = false) => (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
        {icon} {label}{required && ' *'}
      </label>
      {content}
    </div>
  );

  const inputCls = "w-full px-3 py-2.5 border border-slate-200 rounded-lg bg-slate-50 text-sm font-medium focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all";
  const selectCls = "w-full px-3 py-2.5 border border-slate-200 rounded-lg bg-slate-50 text-sm font-medium focus:outline-none focus:border-emerald-400 transition-all";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="font-black text-slate-800">Convertir Lead → Cliente</h2>
              <p className="text-xs text-slate-500">El lead quedará vinculado al nuevo cliente</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {/* Info lead origen */}
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-xs text-emerald-800">
              <span className="font-bold">Lead origen: </span>{lead.nombre} · {lead.telefono}
              {lead.producto_interes && <> · <span className="italic">{lead.producto_interes}</span></>}
            </p>
          </div>

          {/* Nombre / Razón Social */}
          {field('Nombre / Razón Social', <FileText className="w-3.5 h-3.5" />,
            <input name="nombre_razon_social" value={form.nombre_razon_social} onChange={handleChange}
              required className={inputCls} />, true)}

          {/* Tipo doc + Número doc */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-widest">Tipo Doc.</label>
              <select name="tipo_documento" value={form.tipo_documento} onChange={handleChange} className={selectCls}>
                {TIPOS_DOCUMENTO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5" /> Número Doc. *
              </label>
              <input name="numero_documento" value={form.numero_documento} onChange={handleChange}
                required placeholder="Ej: 1234567890" className={`${inputCls} font-mono`} />
            </div>
          </div>

          {/* Teléfono + Celular */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" /> Teléfono Fijo
              </label>
              <input name="telefono" value={form.telefono} onChange={handleChange}
                placeholder="Fijo..." className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" /> Celular
              </label>
              <input name="celular" value={form.celular} onChange={handleChange}
                placeholder="Celular..." className={inputCls} />
            </div>
          </div>

          {/* Email */}
          {field('Correo para Factura Electrónica', <Mail className="w-3.5 h-3.5" />,
            <input type="email" name="email" value={form.email} onChange={handleChange}
              placeholder="email@empresa.com" className={inputCls} />)}

          {/* Segmento + Fuente */}
          <div className="grid grid-cols-2 gap-4">
            {field('Segmento', <Tag className="w-3.5 h-3.5" />,
              <select name="segmento" value={form.segmento} onChange={handleChange} className={selectCls}>
                <option value="">Seleccione segmento...</option>
                {SEGMENTOS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>)}
            {field('Fuente', <Tag className="w-3.5 h-3.5" />,
              <select name="fuente" value={form.fuente} onChange={handleChange} className={selectCls}>
                <option value="">Seleccione fuente...</option>
                {FUENTES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>, true)}
          </div>

          {/* Dirección */}
          {field('Dirección', <MapPin className="w-3.5 h-3.5" />,
            <input name="direccion" value={form.direccion} onChange={handleChange}
              placeholder="Calle, ciudad..." className={inputCls} />)}

          {/* Condición de pago */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-widest">Condición de Pago</label>
            <select name="condicion_pago" value={form.condicion_pago} onChange={handleChange} className={selectCls}>
              {CONDICIONES_PAGO.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          {/* Botones */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm">
              {loading
                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <><UserCheck className="w-4 h-4" /> Crear Cliente</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ConvertirClienteModal;
