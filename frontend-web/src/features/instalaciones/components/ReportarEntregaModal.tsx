import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { X, Camera, MapPin, AlertTriangle, Check, RotateCcw, ChevronRight } from 'lucide-react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface Props {
  rutaODPId: number;
  numeroODP: string;
  onClose: () => void;
  onCompletado: () => void;
}

type Step = 'foto_gps' | 'firma';

const ReportarEntregaModal: React.FC<Props> = ({ rutaODPId, numeroODP, onClose, onCompletado }) => {
  const token = sessionStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const [step, setStep] = useState<Step>('foto_gps');
  const [gps, setGps] = useState<string>('');
  const [gpsStatus, setGpsStatus] = useState<'cargando' | 'ok' | 'error'>('cargando');
  const [fotos, setFotos] = useState<File[]>([]);
  const [fotosPreview, setFotosPreview] = useState<string[]>([]);
  const [datosReceptor, setDatosReceptor] = useState('');
  const [firmaTrazada, setFirmaTrazada] = useState(false);
  const [subiendo, setSubiendo] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujandoRef = useRef(false);
  const ultimoPuntoRef = useRef<{ x: number; y: number } | null>(null);

  // GPS al montar
  useEffect(() => {
    if (!navigator.geolocation) { setGpsStatus('error'); return; }
    navigator.geolocation.getCurrentPosition(
      pos => { setGps(`${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`); setGpsStatus('ok'); },
      () => setGpsStatus('error'),
      { timeout: 8000 }
    );
  }, []);

  // Canvas de firma
  useEffect(() => {
    if (step !== 'firma') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e293b';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [step]);

  const getPunto = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const handleCanvasStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    dibujandoRef.current = true;
    ultimoPuntoRef.current = getPunto(e, canvas);
  };

  const handleCanvasMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!dibujandoRef.current) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const punto = getPunto(e, canvas);
    const desde = ultimoPuntoRef.current || punto;
    ctx.beginPath();
    ctx.moveTo(desde.x, desde.y);
    ctx.lineTo(punto.x, punto.y);
    ctx.stroke();
    ultimoPuntoRef.current = punto;
    setFirmaTrazada(true);
  }, []);

  const handleCanvasEnd = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    dibujandoRef.current = false;
    ultimoPuntoRef.current = null;
  };

  const limpiarFirma = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setFirmaTrazada(false);
  };

  const handleFotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const restantes = 10 - fotos.length;
    if (files.length > restantes) return toast.error(`Máximo 10 fotos. Puedes agregar ${restantes} más.`);
    setFotos(prev => [...prev, ...files]);
    setFotosPreview(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
  };

  const removerFoto = (idx: number) => {
    URL.revokeObjectURL(fotosPreview[idx]);
    setFotos(prev => prev.filter((_, i) => i !== idx));
    setFotosPreview(prev => prev.filter((_, i) => i !== idx));
  };

  const handlePaste = useCallback((e: ClipboardEvent) => {
    if (step !== 'foto_gps') return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const f = items[i].getAsFile();
        if (f) { setFotos([f]); setFotosPreview([URL.createObjectURL(f)]); toast.info('Imagen pegada desde portapapeles'); break; }
      }
    }
  }, [step]);

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const handleSubmit = async () => {
    if (!fotos.length) return toast.error('Se requiere al menos una foto de evidencia');
    if (!datosReceptor.trim()) return toast.error('Ingresa los datos de quien recibe');
    if (!firmaTrazada) return toast.error('El cliente debe firmar');

    const canvas = canvasRef.current;
    const firmaBase64 = canvas ? canvas.toDataURL('image/png') : '';

    setSubiendo(true);
    try {
      const fd = new FormData();
      for (const f of fotos) fd.append('fotos', f);
      fd.append('gps', gps || '');
      fd.append('datos_receptor', datosReceptor);
      fd.append('firma_receptor', firmaBase64);

      await axios.post(`${API}/api/rutas/ruta-odp/${rutaODPId}/finalizar`, fd, {
        headers,
      });

      toast.success(`ODP ${numeroODP} entregada exitosamente`);
      onCompletado();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al subir entrega');
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-800">Reportar Entrega</h2>
            <p className="text-xs text-indigo-600 font-semibold">{numeroODP}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>

        {/* Steps indicator */}
        <div className="flex gap-2 px-5 py-3">
          {(['foto_gps', 'firma'] as Step[]).map((s, i) => (
            <div key={s} className={`flex-1 h-1 rounded-full transition-all ${step === s || (s === 'foto_gps' && step === 'firma') ? 'bg-indigo-500' : 'bg-slate-200'}`} />
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {step === 'foto_gps' ? (
            <>
              {/* GPS */}
              <div className={`flex items-center gap-3 p-3 rounded-xl border ${gpsStatus === 'ok' ? 'bg-emerald-50 border-emerald-200' : gpsStatus === 'error' ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                <MapPin className={`w-4 h-4 flex-shrink-0 ${gpsStatus === 'ok' ? 'text-emerald-600' : gpsStatus === 'error' ? 'text-red-500' : 'text-slate-400'}`} />
                <div>
                  <p className={`text-xs font-semibold ${gpsStatus === 'ok' ? 'text-emerald-700' : gpsStatus === 'error' ? 'text-red-600' : 'text-slate-500'}`}>
                    {gpsStatus === 'cargando' ? 'Obteniendo ubicación...' : gpsStatus === 'ok' ? `GPS: ${gps}` : 'GPS desactivado — Continúa sin coordenadas'}
                  </p>
                  {gpsStatus === 'error' && (
                    <p className="text-[10px] text-red-400 mt-0.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Activa el GPS para mayor precisión</p>
                  )}
                </div>
              </div>

              {/* Fotos */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Evidencia Fotográfica *</p>
                  <span className="text-[10px] text-slate-400 font-medium">{fotos.length}/10</span>
                </div>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFotos} />
                {fotosPreview.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {fotosPreview.map((preview, i) => (
                      <div key={i} className="relative rounded-xl overflow-hidden border border-slate-200 aspect-square">
                        <img src={preview} alt={`Evidencia ${i + 1}`} className="w-full h-full object-cover" />
                        <button onClick={() => removerFoto(i)}
                          className="absolute top-1 right-1 p-1 rounded-full bg-slate-900/60 text-white hover:bg-red-600">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {fotos.length < 10 && (
                  <button onClick={() => fileRef.current?.click()}
                    className="w-full h-24 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center gap-1 text-slate-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50 transition-all">
                    <Camera className="w-6 h-6" />
                    <span className="text-xs font-medium">Agregar foto{fotos.length > 0 ? ' más' : ''}</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Firma digital */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Firma del Cliente *</p>
                  <button onClick={limpiarFirma} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
                    <RotateCcw className="w-3 h-3" /> Limpiar
                  </button>
                </div>
                <div className="rounded-xl overflow-hidden border-2 border-slate-200 touch-none">
                  <canvas ref={canvasRef} width={400} height={160} className="w-full bg-white cursor-crosshair"
                    onMouseDown={handleCanvasStart} onMouseMove={handleCanvasMove} onMouseUp={handleCanvasEnd} onMouseLeave={handleCanvasEnd}
                    onTouchStart={handleCanvasStart} onTouchMove={handleCanvasMove} onTouchEnd={handleCanvasEnd}
                  />
                </div>
                {!firmaTrazada && <p className="text-xs text-slate-400 text-center mt-1">Dibuja la firma aquí</p>}
              </div>

              {/* Datos de recepción */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Datos de Recepción *</label>
                <input type="text" value={datosReceptor} onChange={e => setDatosReceptor(e.target.value)}
                  placeholder="Ej. Juan Pérez — 45689012"
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                <p className="text-[10px] text-slate-400 mt-1">Nombre completo e identificación de quien recibe</p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100">
          {step === 'foto_gps' ? (
            <button onClick={() => { if (!fotos.length) return toast.error('Se requiere al menos una foto'); setStep('firma'); }}
              disabled={!fotos.length}
              className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 shadow-lg shadow-indigo-200">
              Continuar — Firma <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex gap-3">
              <button onClick={() => setStep('foto_gps')} className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-600">
                Atrás
              </button>
              <button onClick={handleSubmit} disabled={subiendo || !firmaTrazada || !datosReceptor.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 shadow-lg shadow-emerald-200">
                {subiendo ? (
                  <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Subiendo...</>
                ) : (
                  <><Check className="w-4 h-4" /> Subir y Cerrar ODP</>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportarEntregaModal;
