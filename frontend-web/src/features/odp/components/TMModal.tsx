import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { X, Plus, Printer, Ruler, MapPin, Camera, Upload, CheckCircle2, Phone, User, CalendarCheck, Clock, Image } from 'lucide-react';
import { toast } from 'react-toastify';

interface TM {
  id: number;
  numero_tm: string;
  odp_id: number;
  fecha_visita: string | null;
  direccion: string;
  contacto_obra: string;
  telefono_obra: string;
  observaciones: string;
  croquis_url: string | null;
  medidas_json: string[] | null;
  fecha_creacion: string;
  realizador: { nombre_completo: string };
}

interface Props { odp: any; onClose: () => void; }

const TMModal: React.FC<Props> = ({ odp, onClose }) => {
  const [tms, setTMs] = useState<TM[]>([]);
  const [mode, setMode] = useState<'programar' | 'fotos' | 'view'>('programar');
  const [selected, setSelected] = useState<TM | null>(null);
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [fotos, setFotos] = useState<{ file: File; preview: string }[]>([]);
  // Pre-cargar desde la TM ya existente si viene de prospecto (odp.id = null)
  const tmPreload = !odp.id ? odp.tomas_medidas?.[0] : null;
  const [formProgramar, setFormProgramar] = useState({
    fecha_visita: tmPreload?.fecha_visita || '',
    direccion: tmPreload?.direccion || odp.direccion_instalacion || '',
    contacto_obra: tmPreload?.contacto_obra || odp.nombre_recibe || '',
    telefono_obra: tmPreload?.telefono_obra || odp.telefono_recibe || '',
    observaciones: tmPreload?.observaciones || '',
  });
  const fotoInputRef = useRef<HTMLInputElement>(null);

  const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
  const token = localStorage.getItem('token');

  useEffect(() => { fetchTMs(); }, []); // eslint-disable-line

  const fetchTMs = async () => {
    setFetching(true);
    try {
      // Si no hay odp.id (TM de prospecto), usar las tomas_medidas ya incluidas en el shape
      if (!odp.id) {
        const data: TM[] = odp.tomas_medidas || [];
        setTMs(data);
        if (data.length === 0) {
          setMode('programar');
        } else {
          const sinFoto = data.find((tm: TM) => !tm.croquis_url);
          if (sinFoto) { setSelected(sinFoto); setMode('fotos'); }
          else { setSelected(data[0]); setMode('view'); }
        }
        setFetching(false);
        return;
      }

      const res = await axios.get(`${API}/api/documentos/tm/odp/${odp.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data: TM[] = res.data;
      setTMs(data);

      if (data.length === 0) {
        setMode('programar');
      } else {
        const sinFoto = data.find(tm => !tm.croquis_url);
        if (sinFoto) {
          setSelected(sinFoto);
          setMode('fotos');
        } else {
          setSelected(data[0]);
          setMode('view');
        }
      }
    } catch {
      setTMs([]);
      setMode('programar');
    } finally {
      setFetching(false);
    }
  };

  // ── PASO 1: Programar visita → cierra modal, panel recarga ───────────────
  const handleProgramar = async () => {
    if (!formProgramar.fecha_visita) {
      toast.error('La fecha de visita es obligatoria');
      return;
    }
    setLoadingCreate(true);
    try {
      const res = await axios.post(`${API}/api/documentos/tm`, {
        odp_id: odp.id,
        ...formProgramar,
        medidas_json: [],
      }, { headers: { Authorization: `Bearer ${token}` } });

      toast.success(`${res.data.numero_tm} programada · ODP pasó a "Programadas"`);
      onClose(); // cierra el modal — el panel recargará en TomaMedidasPage
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al programar la visita');
      setLoadingCreate(false);
    }
  };

  // ── PASO 2: Seleccionar fotos ─────────────────────────────────────────────
  const handleAddFotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const nuevas = files.map(f => ({ file: f, preview: URL.createObjectURL(f) }));
    setFotos(prev => [...prev, ...nuevas]);
    if (fotoInputRef.current) fotoInputRef.current.value = '';
  };

  const removeFoto = (idx: number) => {
    setFotos(prev => prev.filter((_, i) => i !== idx));
  };

  // ── PASO 2: Subir fotos → ODP pasa a MEDICION ────────────────────────────
  const handleSubirFotos = async () => {
    if (!selected) return;
    if (fotos.length === 0) {
      toast.error('Debes seleccionar al menos una foto');
      return;
    }
    setUploadingFoto(true);
    try {
      // Subir todas las fotos; el backend usa la última como croquis_url principal
      for (const foto of fotos) {
        const formData = new FormData();
        formData.append('foto', foto.file);
        await axios.post(`${API}/api/documentos/tm/${selected.id}/foto`, formData, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
        });
      }
      toast.success('Fotos subidas — TM marcada como realizada');
      setFotos([]);
      onClose();
    } catch {
      toast.error('Error al subir las fotos');
    } finally {
      setUploadingFoto(false);
    }
  };

  if (fetching) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
        <div className="bg-white rounded-2xl p-8 flex items-center gap-3 shadow-xl">
          <Ruler className="w-5 h-5 text-amber-500 animate-pulse" />
          <span className="font-medium text-slate-600">Cargando TMs...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col border border-slate-200">

        {/* ── Header ── */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-xl"><Ruler className="w-5 h-5 text-amber-600" /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Toma de Medidas</h2>
              <p className="text-xs text-slate-500">{odp.numero_odp} · {odp.cliente?.nombre_razon_social}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {tms.length > 0 && mode !== 'view' && (
              <button onClick={() => { setSelected(tms[0]); setMode('view'); }}
                className="px-3 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition">
                Ver TM
              </button>
            )}
            {mode === 'view' && !tms[0]?.croquis_url && (
              <button onClick={() => { setSelected(tms[0]); setFotos([]); setMode('fotos'); }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-amber-700 border border-amber-200 rounded-xl bg-amber-50 hover:bg-amber-100 transition">
                <Camera className="w-3.5 h-3.5" /> Subir fotos
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Indicador de pasos ── */}
        <div className="flex border-b border-slate-100 flex-shrink-0">
          {[
            { key: 'programar', label: 'Paso 1 · Programar visita', icon: CalendarCheck, done: tms.length > 0 },
            { key: 'fotos', label: 'Paso 2 · Subir fotos', icon: Camera, done: !!tms[0]?.croquis_url },
          ].map(step => {
            const Icon = step.icon;
            const isActive = mode === step.key || (mode === 'view' && step.key === 'fotos');
            return (
              <div key={step.key}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold border-b-2 transition-colors
                  ${step.done ? 'border-emerald-500 text-emerald-700 bg-emerald-50/40'
                    : isActive ? 'border-amber-500 text-amber-700'
                    : 'border-transparent text-slate-400'}`}>
                {step.done
                  ? <CheckCircle2 className="w-3.5 h-3.5" />
                  : <Icon className="w-3.5 h-3.5" />}
                {step.label}
              </div>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* ════ PASO 1: PROGRAMAR VISITA ════ */}
          {mode === 'programar' && (
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase">
                    Fecha de Visita <span className="text-rose-500">*</span>
                  </label>
                  <input type="date" value={formProgramar.fecha_visita}
                    onChange={e => setFormProgramar(p => ({ ...p, fecha_visita: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Dirección de Obra
                  </label>
                  <input value={formProgramar.direccion}
                    onChange={e => setFormProgramar(p => ({ ...p, direccion: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase flex items-center gap-1">
                    <User className="w-3 h-3" /> Contacto en Obra
                  </label>
                  <input value={formProgramar.contacto_obra}
                    onChange={e => setFormProgramar(p => ({ ...p, contacto_obra: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase flex items-center gap-1">
                    <Phone className="w-3 h-3" /> Teléfono
                  </label>
                  <input value={formProgramar.telefono_obra}
                    onChange={e => setFormProgramar(p => ({ ...p, telefono_obra: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase">Observaciones</label>
                <textarea value={formProgramar.observaciones}
                  onChange={e => setFormProgramar(p => ({ ...p, observaciones: e.target.value }))}
                  rows={2} placeholder="Acceso al sitio, indicaciones del asesor, etc..."
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div className="pt-2 border-t border-slate-100">
                <button onClick={handleProgramar} disabled={loadingCreate}
                  className="w-full flex items-center justify-center gap-2 py-3.5 font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition shadow-md disabled:opacity-50">
                  <CalendarCheck className="w-4 h-4" />
                  {loadingCreate ? 'Programando...' : 'Programar Visita Técnica'}
                </button>
              </div>
            </div>
          )}

          {/* ════ PASO 2: SUBIR FOTOS ════ */}
          {mode === 'fotos' && selected && (
            <div className="p-6 space-y-5">
              <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <CalendarCheck className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-bold text-slate-700">{selected.numero_tm} · Visita: {selected.fecha_visita ? new Date(selected.fecha_visita + 'T00:00:00').toLocaleDateString('es-CO') : '—'}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Sube una o varias fotos de la hoja de medidas. Al confirmar la ODP avanza a Medición.</p>
                </div>
              </div>

              {/* Input de fotos */}
              <input ref={fotoInputRef} type="file" accept="image/*" multiple capture="environment"
                onChange={handleAddFotos} className="hidden" />

              {/* Grid de previews */}
              {fotos.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {fotos.map((f, i) => (
                    <div key={i} className="relative rounded-xl overflow-hidden border border-amber-200 aspect-square bg-slate-50">
                      <img src={f.preview} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                      <button onClick={() => removeFoto(i)}
                        className="absolute top-1 right-1 bg-white rounded-full p-0.5 shadow border border-slate-200 hover:bg-rose-50 transition">
                        <X className="w-3.5 h-3.5 text-rose-500" />
                      </button>
                    </div>
                  ))}
                  {/* Botón agregar más */}
                  <button onClick={() => fotoInputRef.current?.click()}
                    className="aspect-square rounded-xl border-2 border-dashed border-amber-300 flex flex-col items-center justify-center gap-1 text-amber-600 hover:bg-amber-50 transition">
                    <Plus className="w-5 h-5" />
                    <span className="text-xs font-bold">Agregar</span>
                  </button>
                </div>
              )}

              {/* Zona de drop / primer upload */}
              {fotos.length === 0 && (
                <button onClick={() => fotoInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-amber-300 rounded-xl py-12 flex flex-col items-center gap-2 text-amber-600 hover:bg-amber-50 transition">
                  <Image className="w-10 h-10" />
                  <span className="text-sm font-bold">Seleccionar foto(s) de medidas</span>
                  <span className="text-xs text-slate-400">Puedes tomar la foto con la cámara directamente</span>
                </button>
              )}

              <div className="flex gap-3 pt-2 border-t border-slate-100">
                <button onClick={() => { setSelected(tms[0]); setMode('view'); }}
                  className="px-5 py-3 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition">
                  Ver TM
                </button>
                <button onClick={handleSubirFotos} disabled={uploadingFoto || fotos.length === 0}
                  className="flex-1 flex items-center justify-center gap-2 py-3 font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition shadow-md disabled:opacity-50">
                  <Upload className="w-4 h-4" />
                  {uploadingFoto ? 'Subiendo fotos...' : `Confirmar ${fotos.length > 0 ? `(${fotos.length} foto${fotos.length > 1 ? 's' : ''})` : ''}`}
                </button>
              </div>
            </div>
          )}

          {/* ════ VISTA / IMPRESIÓN ════ */}
          {mode === 'view' && selected && (
            <div>
              <div className="flex gap-3 p-4 border-b border-slate-100 print:hidden">
                {!selected.croquis_url && (
                  <button onClick={() => { setFotos([]); setMode('fotos'); }}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-amber-700 border border-amber-200 rounded-xl bg-amber-50 hover:bg-amber-100 transition">
                    <Camera className="w-4 h-4" /> Subir fotos de medidas
                  </button>
                )}
                <button onClick={() => window.print()}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition ml-auto">
                  <Printer className="w-4 h-4" /> Imprimir
                </button>
              </div>

              {/* Documento imprimible */}
              <div id="tm-print-area" className="p-8 text-black text-sm font-sans">
                <div className="flex justify-between items-start border-b-4 border-black pb-4 mb-6">
                  <div>
                    <h1 className="text-3xl font-black uppercase tracking-widest">Vidrios Templex</h1>
                    <p className="text-sm font-bold text-gray-600 uppercase mt-1">Toma de Medidas — Registro de Campo</p>
                  </div>
                  <div className="text-right border-l-4 border-black pl-6">
                    <div className="bg-black text-white px-4 py-2 mb-2 text-center">
                      <p className="text-xs font-bold uppercase">N° TM</p>
                      <p className="text-2xl font-black">{selected.numero_tm}</p>
                    </div>
                    <p className="text-xs font-bold">Fecha visita: {selected.fecha_visita ? new Date(selected.fecha_visita + 'T00:00:00').toLocaleDateString('es-CO') : '—'}</p>
                    <p className="text-xs font-bold">ODP: {odp.numero_odp}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-6">
                  <table className="border-collapse border border-black text-xs w-full">
                    <tbody>
                      <tr><td className="border border-black p-2 font-bold bg-gray-100 w-1/3">Cliente</td><td className="border border-black p-2 font-bold">{odp.cliente?.nombre_razon_social}</td></tr>
                      <tr><td className="border border-black p-2 font-bold bg-gray-100">Dirección</td><td className="border border-black p-2">{selected.direccion || '—'}</td></tr>
                      <tr><td className="border border-black p-2 font-bold bg-gray-100">Contacto</td><td className="border border-black p-2">{selected.contacto_obra || '—'}</td></tr>
                      <tr><td className="border border-black p-2 font-bold bg-gray-100">Teléfono</td><td className="border border-black p-2">{selected.telefono_obra || '—'}</td></tr>
                    </tbody>
                  </table>
                  <table className="border-collapse border border-black text-xs w-full">
                    <tbody>
                      <tr><td className="border border-black p-2 font-bold bg-gray-100 w-1/3">Realizado por</td><td className="border border-black p-2 font-bold">{selected.realizador?.nombre_completo}</td></tr>
                      <tr><td className="border border-black p-2 font-bold bg-gray-100">Tipo Servicio</td><td className="border border-black p-2">{odp.tipo_servicio || '—'}</td></tr>
                      <tr><td className="border border-black p-2 font-bold bg-gray-100">ODP Ref</td><td className="border border-black p-2 text-red-700 font-bold">{odp.numero_odp}</td></tr>
                      <tr><td className="border border-black p-2 font-bold bg-gray-100">Registrado</td><td className="border border-black p-2">{new Date(selected.fecha_creacion).toLocaleDateString('es-CO')}</td></tr>
                    </tbody>
                  </table>
                </div>

                {/* Fotos de medidas */}
                <div className="mb-6">
                  <h3 className="font-bold bg-black text-white px-3 py-1.5 mb-2 uppercase text-xs tracking-wider">
                    Fotos de Medidas Relevadas en Campo
                    {selected.medidas_json?.length ? ` (${selected.medidas_json.length})` : ''}
                  </h3>
                  {selected.medidas_json && selected.medidas_json.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2 border border-black p-2">
                      {selected.medidas_json.map((url, idx) => (
                        <img key={idx} src={url} alt={`Foto ${idx + 1} — ${selected.numero_tm}`}
                          className="w-full object-contain max-h-72 border border-gray-200" />
                      ))}
                    </div>
                  ) : (
                    <div className="border border-dashed border-gray-400 p-8 text-center text-gray-400 min-h-[120px] flex items-center justify-center">
                      <p className="text-sm font-medium">Foto pendiente — visita aún no realizada</p>
                    </div>
                  )}
                </div>

                {selected.observaciones && (
                  <div className="border border-black p-3 min-h-[60px] mb-6">
                    <p className="font-bold text-xs uppercase border-b border-gray-300 pb-1 mb-2">Observaciones</p>
                    <p className="text-xs">{selected.observaciones}</p>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-6 mt-10">
                  {['Jefe de Producción', 'Técnico Relevador', 'Aprobado por'].map(l => (
                    <div key={l} className="text-center text-xs">
                      <div className="border-t-2 border-black pt-2 mt-12">
                        <p className="font-bold uppercase tracking-wider">{l}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t-2 border-black pt-3 mt-8 flex justify-between text-[10px] text-gray-500">
                  <span>Vidrios Templex — Registro de Campo</span>
                  <span>{selected.numero_tm} · ODP {odp.numero_odp}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden; }
          #tm-print-area, #tm-print-area * { visibility: visible; }
          #tm-print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 15px; }
          @page { margin: 1cm; size: portrait; }
        }
      ` }} />
    </div>
  );
};

export default TMModal;
