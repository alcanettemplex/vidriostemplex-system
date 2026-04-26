import React, { useState } from 'react';
import { X, MapPin, Loader2, CalendarCheck, Phone, User, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { apiSolicitarVisitaTecnica } from '../crmService';

interface Props {
  lead: any;
  onClose: () => void;
  onSuccess: (prospecto_id: number, numero_prospecto: string, tm_numero: string) => void;
}

const SolicitarVisitaModal: React.FC<Props> = ({ lead, onClose, onSuccess }) => {
  const [enviando, setEnviando] = useState(false);
  const [form, setForm] = useState({
    direccion: '',
    fecha_visita: '',
    nombre_contacto: lead.nombre || '',
    telefono_contacto: lead.telefono || '',
    observaciones: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleEnviar = async () => {
    if (!form.direccion.trim()) {
      toast.warning('La dirección de visita es requerida');
      return;
    }
    setEnviando(true);
    try {
      const body: any = { direccion: form.direccion.trim() };
      if (form.fecha_visita) body.fecha_visita = form.fecha_visita;
      if (form.nombre_contacto.trim()) body.nombre_contacto = form.nombre_contacto.trim();
      if (form.telefono_contacto.trim()) body.telefono_contacto = form.telefono_contacto.trim();
      if (form.observaciones.trim()) body.observaciones = form.observaciones.trim();

      const { data } = await apiSolicitarVisitaTecnica(lead.id, body);
      toast.success(`Visita técnica solicitada — ${data.tm_numero}`);
      onSuccess(data.prospecto_id, data.numero_prospecto, data.tm_numero);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al solicitar la visita técnica');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
            <MapPin className="w-4.5 h-4.5 text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-black text-slate-800">Solicitar Visita Técnica</h2>
            <p className="text-[10px] text-slate-400 font-medium mt-0.5 truncate">Lead: {lead.nombre || `#${lead.id}`}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Formulario */}
        <div className="px-5 py-4 space-y-3">

          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Dirección de visita <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              name="direccion"
              value={form.direccion}
              onChange={handleChange}
              placeholder="Ej: Cra 15 # 80-42, Bogotá"
              className="w-full px-3 py-2.5 text-xs border border-slate-200 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-all"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <CalendarCheck className="w-3 h-3" /> Fecha tentativa de visita
            </label>
            <input
              type="date"
              name="fecha_visita"
              value={form.fecha_visita}
              onChange={handleChange}
              className="w-full px-3 py-2.5 text-xs border border-slate-200 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-all"
            />
            <p className="text-[9px] text-slate-400 mt-1">Si no se define fecha, la visita queda en estado "Solicitada"</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <User className="w-3 h-3" /> Contacto
              </label>
              <input
                type="text"
                name="nombre_contacto"
                value={form.nombre_contacto}
                onChange={handleChange}
                placeholder="Nombre"
                className="w-full px-3 py-2.5 text-xs border border-slate-200 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <Phone className="w-3 h-3" /> Teléfono
              </label>
              <input
                type="text"
                name="telefono_contacto"
                value={form.telefono_contacto}
                onChange={handleChange}
                placeholder="Ej: 3001234567"
                className="w-full px-3 py-2.5 text-xs border border-slate-200 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1.5">
              Observaciones
            </label>
            <textarea
              name="observaciones"
              value={form.observaciones}
              onChange={handleChange}
              placeholder="Ej: Preguntar por el encargado, acceso por portería norte..."
              rows={3}
              className="w-full px-3 py-2.5 text-xs border border-slate-200 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-all resize-none"
            />
          </div>
        </div>

        {/* Info */}
        <div className="mx-5 mb-4 px-3 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl">
          <p className="text-[10px] text-indigo-700 font-bold">
            Se creará un <span className="text-indigo-900">Prospecto</span> y una <span className="text-indigo-900">Toma de Medidas</span> vinculados a este lead. Podrás gestionarlos desde el módulo Prospectos.
          </p>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleEnviar}
            disabled={enviando || !form.direccion.trim()}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-black bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 rounded-xl transition-all active:scale-95 shadow-sm"
          >
            {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Solicitar Visita
          </button>
        </div>
      </div>
    </div>
  );
};

export default SolicitarVisitaModal;
