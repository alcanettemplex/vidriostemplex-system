import React, { useMemo, useState } from 'react';
import { X, Copy, Check, MessageSquare, Search, Phone, Lightbulb, Tag } from 'lucide-react';
import { toast } from 'react-toastify';
import { MENSAJES_COMERCIALES, MensajeComercial } from '../data/mensajesComerciales';

interface Props {
  onClose: () => void;
}

const FASE_COLORS: Record<string, string> = {
  'Primer contacto': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Diagnóstico y cotización': 'bg-amber-50 text-amber-700 border-amber-200',
  'Visita técnica': 'bg-blue-50 text-blue-700 border-blue-200',
  'Seguimiento y cierre': 'bg-teal-50 text-teal-700 border-teal-200',
  'Postventa y reactivación': 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const GuiaMensajesModal: React.FC<Props> = ({ onClose }) => {
  const [busqueda, setBusqueda] = useState('');
  const [situacionId, setSituacionId] = useState<number>(MENSAJES_COMERCIALES[0].id);
  const [tipoIdx, setTipoIdx] = useState(0);
  const [telefono, setTelefono] = useState('');
  const [copiado, setCopiado] = useState(false);

  const situacionesFiltradas = useMemo(() => {
    if (!busqueda.trim()) return MENSAJES_COMERCIALES;
    const q = busqueda.toLowerCase();
    return MENSAJES_COMERCIALES.filter(
      s =>
        s.titulo.toLowerCase().includes(q) ||
        s.descripcion.toLowerCase().includes(q) ||
        s.mensajes.some(m => m.texto.toLowerCase().includes(q))
    );
  }, [busqueda]);

  const situacion: MensajeComercial | undefined =
    MENSAJES_COMERCIALES.find(s => s.id === situacionId) || situacionesFiltradas[0];

  const mensajeActual = situacion?.mensajes[tipoIdx] ?? situacion?.mensajes[0];

  const handleCopiar = async () => {
    if (!mensajeActual) return;
    try {
      await navigator.clipboard.writeText(mensajeActual.texto);
      setCopiado(true);
      toast.success('¡Mensaje copiado! Pégalo en WhatsApp.');
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      toast.error('No se pudo copiar al portapapeles.');
    }
  };

  const handleAbrirWhatsApp = () => {
    if (!mensajeActual) return;
    const tel = telefono.replace(/[^\d]/g, '');
    if (!tel) {
      toast.warning('Escribe el número de teléfono del cliente para abrir WhatsApp.');
      return;
    }
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(mensajeActual.texto)}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl border border-slate-200 flex flex-col"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-emerald-50 border-b border-emerald-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-md shadow-emerald-100">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-black text-slate-800 text-base">Guía de Mensajes Comerciales</h2>
              <p className="text-xs text-slate-500 font-medium">
                20 situaciones · 100 mensajes redactados para cerrar la venta con profesionalismo
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Lista de situaciones */}
          <div className="w-72 border-r border-slate-100 flex flex-col flex-shrink-0">
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={busqueda}
                  onChange={e => {
                    setBusqueda(e.target.value);
                    if (situacionId !== (situacionesFiltradas[0]?.id ?? 0)) setSituacionId(situacionesFiltradas[0]?.id ?? 0);
                  }}
                  placeholder="Buscar por palabra clave..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-300 text-slate-700"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {situacionesFiltradas.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-6">Sin resultados para "{busqueda}"</p>
              )}
              {situacionesFiltradas.map(s => (
                <button
                  key={s.id}
                  onClick={() => { setSituacionId(s.id); setTipoIdx(0); }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all border ${
                    situacionId === s.id
                      ? 'bg-emerald-50 border-emerald-200 shadow-sm'
                      : 'bg-white border-transparent hover:bg-slate-50'
                  }`}
                >
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border mb-1 ${FASE_COLORS[s.fase] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                    {s.fase}
                  </span>
                  <p className={`text-xs font-bold leading-snug ${situacionId === s.id ? 'text-emerald-800' : 'text-slate-600'}`}>
                    {s.titulo}
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                    {s.estadoCrm} · {s.mensajes.length} mensajes
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Panel del mensaje */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {situacion && mensajeActual ? (
              <>
                <div className="px-6 py-4 border-b border-slate-100 flex-shrink-0">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${FASE_COLORS[situacion.fase] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {situacion.fase}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                      <Tag className="w-3 h-3" /> {situacion.estadoCrm}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">🕐 {situacion.momento}</span>
                  </div>
                  <h3 className="font-black text-slate-800 text-lg">{situacion.titulo}</h3>
                  <p className="text-xs text-slate-500 mt-1">{situacion.descripcion}</p>

                  {/* Selector de variante */}
                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {situacion.mensajes.map((m, idx) => (
                      <button
                        key={idx}
                        onClick={() => setTipoIdx(idx)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                          tipoIdx === idx
                            ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-700'
                        }`}
                      >
                        {m.tipo}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4">
                  {/* Burbuja estilo WhatsApp */}
                  <div className="max-w-2xl">
                    <div className="bg-[#DCF8C6] rounded-2xl rounded-tl-sm border border-emerald-100 shadow-sm p-4">
                      <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{mensajeActual.texto}</p>
                      <p className="text-[10px] text-emerald-700/60 text-right mt-2 font-medium">Vidrios Templex · {mensajeActual.tipo}</p>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1.5 font-medium">
                      Edita los corchetes [así] antes de enviar — personalizar el mensaje es lo que cierra la venta.
                    </p>
                  </div>

                  {/* Tip de coaching */}
                  <div className="flex items-start gap-2.5 mt-5 bg-indigo-50 border border-indigo-100 rounded-xl p-3.5 max-w-2xl">
                    <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <Lightbulb className="w-3.5 h-3.5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">Tip de coaching</p>
                      <p className="text-xs text-indigo-900 leading-relaxed mt-0.5">{situacion.tip}</p>
                    </div>
                  </div>
                </div>

                {/* Acciones */}
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex-shrink-0">
                  <div className="flex flex-wrap items-center gap-2 max-w-2xl">
                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 flex-1 min-w-[220px]">
                      <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <input
                        value={telefono}
                        onChange={e => setTelefono(e.target.value)}
                        placeholder="Número del cliente (opcional para abrir WhatsApp)"
                        className="w-full text-sm text-slate-700 placeholder-slate-400 focus:outline-none"
                      />
                    </div>
                    <button
                      onClick={handleCopiar}
                      className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-bold text-sm shadow-sm hover:shadow-md transition-all"
                    >
                      {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copiado ? '¡Copiado!' : 'Copiar'}
                    </button>
                    <button
                      onClick={handleAbrirWhatsApp}
                      className="flex items-center gap-2 px-5 py-2.5 bg-[#25D366] text-white rounded-xl hover:bg-[#1fb457] font-bold text-sm shadow-sm hover:shadow-md transition-all"
                    >
                      <MessageSquare className="w-4 h-4" />
                      Abrir WhatsApp
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                Selecciona una situación para ver sus mensajes.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GuiaMensajesModal;