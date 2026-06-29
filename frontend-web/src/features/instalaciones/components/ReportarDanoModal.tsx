import React, { useState, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { X, AlertTriangle, Camera, Send, CheckCircle } from 'lucide-react';

import API from '../../../services/config';

interface Props {
  rutaODPId: number;
  numeroODP: string;
  onClose: () => void;
  onReportado: () => void;
}

const TIPOS_DANO = [
  'Vidrio roto en transporte',
  'Vidrio roto en instalación',
  'Medida incorrecta',
  'Accesorio dañado',
  'Daño en perfil de aluminio',
  'Daño en la obra del cliente',
  'Accidente en sitio',
  'Otro',
];

const ReportarDanoModal: React.FC<Props> = ({ rutaODPId, numeroODP, onClose, onReportado }) => {
  const token = sessionStorage.getItem('token');
  const [tipoDano, setTipoDano] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [exito, setExito] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFoto(f);
    setFotoPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    if (!tipoDano) { toast.error('Selecciona el tipo de daño'); return; }
    if (!descripcion.trim()) { toast.error('Describe el daño ocurrido'); return; }

    setEnviando(true);
    try {
      const form = new FormData();
      form.append('descripcion_dano', `[${tipoDano}] ${descripcion.trim()}`);
      if (foto) form.append('foto_dano', foto);

      await axios.post(
        `${API}/api/rutas/ruta-odp/${rutaODPId}/reportar-dano`,
        form,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
      );

      setExito(true);
      setTimeout(() => { onReportado(); onClose(); }, 2500);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al registrar el daño');
    } finally {
      setEnviando(false);
    }
  };

  const inputClass = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none transition';
  const labelClass = 'block text-[10px] font-black uppercase text-slate-400 mb-1 tracking-wider';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">

        {/* Header */}
        <div className="bg-orange-50 border-b border-orange-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-orange-100 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="font-black text-slate-800 text-sm">REPORTAR DAÑO EN INSTALACIÓN</p>
              <p className="text-[11px] text-orange-600 font-bold">{numeroODP}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-orange-100 rounded-xl text-slate-400 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {exito ? (
          <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-9 h-9 text-orange-500" />
            </div>
            <h3 className="text-lg font-black text-slate-800">Daño Registrado</h3>
            <p className="text-sm text-slate-500 mt-1">El asesor será notificado para tomar acción.</p>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {/* Aviso */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-800 font-medium">
              Esta instalación quedará marcada como <strong>con daño</strong>. Podrás continuar trabajando y finalizar normalmente si el daño es menor.
            </div>

            {/* Tipo de daño */}
            <div>
              <label className={labelClass}>Tipo de daño *</label>
              <select className={inputClass} value={tipoDano} onChange={e => setTipoDano(e.target.value)}>
                <option value="">Selecciona el tipo...</option>
                {TIPOS_DANO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Descripción */}
            <div>
              <label className={labelClass}>Descripción del daño *</label>
              <textarea
                rows={3}
                placeholder="Describe qué ocurrió, en qué parte del trabajo y cómo se produjo..."
                className={inputClass}
                value={descripcion}
                onChange={e => setDescripcion(e.target.value)}
              />
            </div>

            {/* Foto opcional */}
            <div>
              <label className={labelClass}>Foto del daño (opcional)</label>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFoto} />
              {fotoPreview ? (
                <div className="relative rounded-2xl overflow-hidden border border-slate-200 aspect-video">
                  <img src={fotoPreview} alt="Foto daño" className="w-full h-full object-cover" />
                  <button
                    onClick={() => { setFoto(null); setFotoPreview(null); }}
                    className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-lg transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full border-2 border-dashed border-slate-200 rounded-2xl p-6 flex flex-col items-center gap-2 text-slate-400 hover:border-orange-300 hover:text-orange-500 transition"
                >
                  <Camera className="w-7 h-7" />
                  <span className="text-xs font-bold">Tomar foto del daño</span>
                </button>
              )}
            </div>

            {/* Botones */}
            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition text-sm">
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={enviando}
                className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white font-black rounded-2xl shadow-lg shadow-orange-100 transition flex items-center justify-center gap-2 text-sm disabled:opacity-50"
              >
                {enviando ? 'Registrando...' : <><Send className="w-4 h-4" /> Registrar Daño</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportarDanoModal;
