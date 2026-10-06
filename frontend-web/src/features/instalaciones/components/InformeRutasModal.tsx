import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { X, Copy, Check, Calendar, MessageCircle, ChevronLeft, ChevronRight } from '../../../components/ui/icons';
import API from '../../../services/config';
import { hoyBogotaISO, sumarDiasISO } from '../../../utils/fechas';
import { InformeRuta, generarInformeDia } from '../utils/informeRutas';

// Informe del día para pegar en los grupos de WhatsApp. Lo abren Instalaciones (pestaña
// Programados) y Control de Taller. Reemplazó a ProgramacionWhatsAppModal el 2026-10-06:
// mismo endpoint, ahora sin vehículo ni conductor y con el resultado de cada parada en
// los días pasados. El texto lo arma utils/informeRutas.ts.

/** Copia al portapapeles; si el navegador no lo permite, usa un textarea temporal. */
const copiarTexto = async (texto: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = texto;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  }
};

const InformeRutasModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const hoy = hoyBogotaISO();
  const [fecha, setFecha] = useState(hoy);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [texto, setTexto] = useState('');
  const [copiado, setCopiado] = useState(false);
  // Al cambiar de día rápido con las flechas, solo cuenta la última respuesta.
  const ultimaPeticion = useRef(0);

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return;
    const id = ++ultimaPeticion.current;
    setLoading(true);
    setError(false);
    axios.get<InformeRuta[]>(`${API}/api/rutas/programacion`, {
      headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` },
      params: { fecha },
    })
      .then((res) => { if (id === ultimaPeticion.current) setTexto(generarInformeDia(res.data, fecha)); })
      .catch(() => {
        if (id !== ultimaPeticion.current) return;
        setTexto('');
        setError(true);
        toast.error('No se pudo cargar el informe de ese día. Revisa tu conexión e intenta de nuevo.');
      })
      .finally(() => { if (id === ultimaPeticion.current) setLoading(false); });
  }, [fecha]);

  const handleCopiar = async () => {
    if (!texto.trim()) return;
    if (await copiarTexto(texto)) {
      setCopiado(true);
      toast.success('Informe copiado. Pégalo en el grupo de WhatsApp.');
      setTimeout(() => setCopiado(false), 3000);
    } else {
      toast.error('El navegador no dejó copiar. Selecciona el texto de la vista previa y cópialo con Ctrl+C.');
    }
  };

  const pasado = fecha < hoy;
  const vacio = !loading && !error && !texto;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl border border-slate-200 flex flex-col" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center shadow-sm shadow-emerald-600/25">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Informe del día</h3>
              <p className="text-xs text-slate-700">
                {pasado ? 'Resultado de cada parada, para compartir en WhatsApp' : 'Instalaciones programadas, para compartir en WhatsApp'}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Selector de día */}
        <div className="px-6 py-3 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFecha((f) => sumarDiasISO(f, -1))}
              aria-label="Día anterior"
              className="p-2 rounded-xl border border-slate-300 text-slate-800 hover:bg-slate-50 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="relative flex-1">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
              <input
                type="date"
                value={fecha}
                onChange={(e) => e.target.value && setFecha(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white outline-none"
              />
            </div>
            <button
              onClick={() => setFecha((f) => sumarDiasISO(f, 1))}
              aria-label="Día siguiente"
              className="p-2 rounded-xl border border-slate-300 text-slate-800 hover:bg-slate-50 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            {fecha !== hoy && (
              <button onClick={() => setFecha(hoy)} className="px-2 text-xs font-semibold text-indigo-700 hover:text-indigo-900 whitespace-nowrap transition-colors">
                Hoy
              </button>
            )}
          </div>
        </div>

        {/* Vista previa editable */}
        <div className="flex-1 overflow-hidden flex flex-col px-6 py-4 gap-2 min-h-0">
          <div className="flex items-center justify-between flex-shrink-0">
            <label htmlFor="informe-texto" className="text-[11px] font-semibold text-slate-900 uppercase tracking-wider">Vista previa</label>
            {loading
              ? <span className="text-xs text-emerald-700 font-medium animate-pulse">Cargando…</span>
              : !vacio && !error && <span className="text-[11px] text-slate-700">Puedes editar el texto antes de copiarlo</span>}
          </div>
          {vacio ? (
            <div className="flex-1 min-h-[12rem] flex items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-700 text-center px-6">
              No hay instalaciones {pasado ? 'registradas' : 'programadas'} para este día.
            </div>
          ) : (
            <textarea
              id="informe-texto"
              className="flex-1 min-h-[16rem] w-full border border-slate-300 rounded-xl p-4 text-[13px] font-mono text-slate-900 bg-slate-50 resize-none focus:ring-2 focus:ring-emerald-500 focus:outline-none leading-relaxed"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              spellCheck={false}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 font-semibold text-slate-800 border border-slate-300 rounded-xl hover:bg-slate-50 transition text-sm">
            Cerrar
          </button>
          <button
            onClick={handleCopiar}
            disabled={loading || !texto.trim()}
            className={`flex-1 py-2.5 font-semibold text-white rounded-xl transition text-sm flex items-center justify-center gap-2 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed
              ${copiado ? 'bg-emerald-700 shadow-emerald-700/25' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25'}`}
          >
            {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copiado ? '¡Copiado!' : 'Copiar para WhatsApp'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InformeRutasModal;
