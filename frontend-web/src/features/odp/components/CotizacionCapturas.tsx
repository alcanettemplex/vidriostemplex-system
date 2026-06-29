import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import { Camera, Plus, Trash2, Pencil, X, ZoomIn, Check, Hash } from 'lucide-react';
import { RootState } from '../../../store/store';
import API from '../../../services/config';

interface Captura {
  id: number;
  url: string;
  public_id: string;
  nota: string | null;
  created_at: string;
  subidor: { id: number; nombre_completo: string };
}

interface Props {
  odp_id?: number;
  prospecto_id?: number;
  numeroCotizacion?: string;
  onRefresh?: () => void;
}

const PUEDE_SUBIR = ['asesor_comercial', 'jefe_produccion', 'admin', 'gerencia'];

const CotizacionCapturas: React.FC<Props> = ({ odp_id, prospecto_id, numeroCotizacion, onRefresh }) => {
  const user = useSelector((state: RootState) => state.auth.user) as any;
  const rol = (user?.rol || user?.role || '').toLowerCase();
  const userId = user?.id;

  const [capturas, setCapturas] = useState<Captura[]>([]);
  const [loading, setLoading] = useState(false);
  const [lightbox, setLightbox] = useState<Captura | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [nota, setNota] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editNota, setEditNota] = useState('');
  const [guardandoNota, setGuardandoNota] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ─── Número de cotización ────────────────────────────────────────────
  const [numCot, setNumCot] = useState(numeroCotizacion || '');
  const [editandoNumCot, setEditandoNumCot] = useState(false);
  const [guardandoNumCot, setGuardandoNumCot] = useState(false);

  const token = sessionStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };
  const params = odp_id ? { odp_id } : { prospecto_id };

  const fetchCapturas = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/cotizacion-capturas`, { headers, params });
      setCapturas(res.data);
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCapturas(); }, []); // eslint-disable-line

  const handleGuardarNumCot = async () => {
    setGuardandoNumCot(true);
    try {
      if (odp_id) {
        await axios.put(`${API}/api/odp/${odp_id}`, { numero_cotizacion: numCot.trim() }, { headers });
      } else if (prospecto_id) {
        await axios.put(`${API}/api/prospectos/${prospecto_id}`, { numero_cotizacion: numCot.trim() }, { headers });
      }
      toast.success('Número de cotización guardado');
      setEditandoNumCot(false);
      onRefresh?.();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al guardar');
    } finally {
      setGuardandoNumCot(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handlePaste = useCallback((e: ClipboardEvent) => {
    if (!PUEDE_SUBIR.includes(rol)) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const f = items[i].getAsFile();
        if (f) {
          setFile(f);
          setPreview(URL.createObjectURL(f));
          setShowUpload(true);
          toast.info('Imagen pegada desde el portapapeles');
          break;
        }
      }
    }
  }, [rol]);

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const handleSubir = async () => {
    if (!file) { toast.error('Selecciona una imagen'); return; }
    if (!numCot.trim()) { toast.error('Debes ingresar el número de cotización antes de subir'); return; }
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append('imagen', file);
      if (nota.trim()) fd.append('nota', nota.trim());
      if (odp_id) fd.append('odp_id', String(odp_id));
      if (prospecto_id) fd.append('prospecto_id', String(prospecto_id));

      await axios.post(`${API}/api/cotizacion-capturas`, fd, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Captura subida');
      setShowUpload(false);
      setFile(null);
      setPreview(null);
      setNota('');
      fetchCapturas();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al subir');
    } finally {
      setSubiendo(false);
    }
  };

  const handleDelete = async (c: Captura) => {
    if (!window.confirm('¿Eliminar esta captura?')) return;
    try {
      await axios.delete(`${API}/api/cotizacion-capturas/${c.id}`, { headers });
      toast.success('Captura eliminada');
      fetchCapturas();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al eliminar');
    }
  };

  const handleEditNota = async (c: Captura) => {
    setGuardandoNota(true);
    try {
      await axios.patch(`${API}/api/cotizacion-capturas/${c.id}`, { nota: editNota }, { headers });
      toast.success('Nota actualizada');
      setEditandoId(null);
      fetchCapturas();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al actualizar');
    } finally {
      setGuardandoNota(false);
    }
  };

  const puedeEditar = (c: Captura) => c.subidor?.id === userId || ['admin', 'gerencia'].includes(rol);
  const puedeEditarNumCot = PUEDE_SUBIR.includes(rol);

  return (
    <div>
      {/* ─── Número de Cotización ─────────────────────────────────────── */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3">
        <Hash className="w-4 h-4 text-blue-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1">N° Cotización</p>
          {editandoNumCot ? (
            <div className="flex items-center gap-2">
              <input
                value={numCot}
                onChange={e => setNumCot(e.target.value)}
                placeholder="Ej: COT-2026-045"
                className="flex-1 border border-blue-300 rounded-lg px-2 py-1 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleGuardarNumCot(); if (e.key === 'Escape') setEditandoNumCot(false); }}
              />
              <button
                onClick={handleGuardarNumCot}
                disabled={guardandoNumCot}
                className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-40"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => { setEditandoNumCot(false); setNumCot(numeroCotizacion || ''); }}
                className="p-1.5 border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-50 transition">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold ${numCot ? 'text-blue-800' : 'text-slate-400 italic'}`}>
                {numCot || 'Sin número registrado'}
              </span>
              {puedeEditarNumCot && (
                <button onClick={() => setEditandoNumCot(true)}
                  className="p-1 text-blue-400 hover:text-blue-600 transition rounded">
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Encabezado capturas */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-500 flex items-center gap-2">
          <Camera className="w-4 h-4 text-indigo-500" /> Capturas de Cotización
          {capturas.length > 0 && (
            <span className="ml-1 px-2 py-0.5 text-[10px] font-black bg-indigo-100 text-indigo-700 rounded-full">
              {capturas.length}
            </span>
          )}
        </h3>
        {PUEDE_SUBIR.includes(rol) && !showUpload && (
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" /> Subir captura
          </button>
        )}
      </div>

      {/* Formulario de subida */}
      {showUpload && (
        <div className="mb-4 p-4 bg-indigo-50 border border-indigo-200 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Nueva captura</p>
            <button onClick={() => { setShowUpload(false); setFile(null); setPreview(null); setNota(''); }}>
              <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
            </button>
          </div>

          <div
            onClick={() => fileRef.current?.click()}
            className="cursor-pointer border-2 border-dashed border-indigo-300 rounded-xl p-4 text-center hover:border-indigo-500 transition"
          >
            {preview ? (
              <img src={preview} alt="preview" className="max-h-48 mx-auto rounded-lg object-contain" />
            ) : (
              <div className="text-indigo-400">
                <Camera className="w-8 h-8 mx-auto mb-1" />
                <p className="text-xs font-bold">Clic para seleccionar imagen</p>
                <p className="text-[10px] text-slate-400 mt-0.5">JPG, PNG, WEBP</p>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

          <textarea
            value={nota}
            onChange={e => setNota(e.target.value)}
            placeholder="Nota (opcional): ej. cotización enviada por WhatsApp el 4/4..."
            rows={2}
            className="w-full border border-indigo-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none bg-white"
          />

          <div className="flex gap-2">
            <button
              onClick={() => { setShowUpload(false); setFile(null); setPreview(null); setNota(''); }}
              className="flex-1 py-2 text-sm font-bold border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubir}
              disabled={subiendo || !file || !numCot.trim()}
              className="flex-1 py-2 text-sm font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition disabled:opacity-40"
              title={!numCot.trim() ? 'Ingresa el N° de cotización primero' : ''}
            >
              {subiendo ? 'Subiendo...' : 'Subir'}
            </button>
          </div>
        </div>
      )}

      {/* Galería */}
      {loading ? (
        <div className="text-center py-6 text-slate-400 text-sm">Cargando...</div>
      ) : capturas.length === 0 && !showUpload ? (
        <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400">
          <Camera className="w-10 h-10 mx-auto mb-2 text-slate-200" />
          <p className="font-bold text-sm">No hay capturas registradas</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {capturas.map(c => (
            <div key={c.id} className="group relative bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition">
              <div className="relative cursor-zoom-in" onClick={() => setLightbox(c)}>
                <img src={c.url} alt="Captura cotización" className="w-full aspect-square object-cover group-hover:opacity-90 transition" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/20">
                  <ZoomIn className="w-6 h-6 text-white" />
                </div>
              </div>

              <div className="p-2">
                {editandoId === c.id ? (
                  <div className="space-y-1">
                    <textarea value={editNota} onChange={e => setEditNota(e.target.value)} rows={2}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none" />
                    <div className="flex gap-1">
                      <button onClick={() => handleEditNota(c)} disabled={guardandoNota}
                        className="flex-1 py-1 text-[10px] font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-40 flex items-center justify-center gap-1">
                        <Check className="w-3 h-3" /> Guardar
                      </button>
                      <button onClick={() => setEditandoId(null)}
                        className="px-2 py-1 text-[10px] font-bold border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {c.nota && <p className="text-[10px] text-slate-600 italic mb-1 line-clamp-2">"{c.nota}"</p>}
                    <p className="text-[10px] text-slate-400">
                      {c.subidor?.nombre_completo} · {new Date(c.created_at).toLocaleDateString('es-CO')}
                    </p>
                    {puedeEditar(c) && (
                      <div className="flex gap-1 mt-1.5">
                        <button onClick={() => { setEditandoId(c.id); setEditNota(c.nota || ''); }}
                          className="flex-1 py-1 text-[10px] font-bold border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition flex items-center justify-center gap-1">
                          <Pencil className="w-2.5 h-2.5" /> Editar
                        </button>
                        <button onClick={() => handleDelete(c)}
                          className="py-1 px-2 text-[10px] font-bold border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition flex items-center justify-center">
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 p-2 bg-white/10 rounded-full text-white hover:bg-white/20 transition" onClick={() => setLightbox(null)}>
            <X className="w-5 h-5" />
          </button>
          <div onClick={e => e.stopPropagation()} className="max-w-4xl w-full">
            <img src={lightbox.url} alt="Captura cotización" className="w-full max-h-[80vh] object-contain rounded-xl shadow-2xl" />
            <div className="mt-3 text-center">
              {lightbox.nota && <p className="text-white/90 text-sm italic mb-1">"{lightbox.nota}"</p>}
              <p className="text-white/60 text-xs">
                {lightbox.subidor?.nombre_completo} · {new Date(lightbox.created_at).toLocaleDateString('es-CO')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CotizacionCapturas;
