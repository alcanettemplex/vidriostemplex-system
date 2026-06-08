import React, { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-toastify';
import { Camera, Plus, Trash2, Pencil, X, ZoomIn, Check, ImageOff } from 'lucide-react';
import {
  apiGetLeadImagenes,
  apiUploadLeadImagen,
  apiUpdateLeadImagenNota,
  apiDeleteLeadImagen,
} from '../crmService';

interface LeadImagen {
  id: number;
  url: string;
  public_id: string;
  nota: string | null;
  created_at: string;
  subidor: { id: number; nombre_completo: string };
}

interface Props {
  leadId: number;
  rol: string;
  userId?: number;
}

const ROLES_PUEDE_SUBIR = ['asesor_comercial', 'asistente_administrativo', 'admin', 'gerencia', 'root', 'jefe_produccion'];
const MAX_IMAGENES = 5;

const LeadImagenes: React.FC<Props> = ({ leadId, rol, userId }) => {
  const [imagenes, setImagenes] = useState<LeadImagen[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<LeadImagen | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editNota, setEditNota] = useState('');
  const [guardandoNota, setGuardandoNota] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const puedeSubir = ROLES_PUEDE_SUBIR.includes(rol);
  const puedeEditar = (img: LeadImagen) =>
    img.subidor?.id === userId || ['admin', 'gerencia'].includes(rol);

  const fetchImagenes = async () => {
    setLoading(true);
    try {
      const { data } = await apiGetLeadImagenes(leadId);
      setImagenes(data);
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchImagenes(); }, [leadId]); // eslint-disable-line

  // Soporte de pegar imagen desde portapapeles
  const handlePaste = useCallback((e: ClipboardEvent) => {
    if (!puedeSubir || !showUpload) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const f = items[i].getAsFile();
        if (f) {
          setFile(f);
          setPreview(URL.createObjectURL(f));
          toast.info('Imagen pegada desde el portapapeles');
          break;
        }
      }
    }
  }, [puedeSubir, showUpload]);

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleSubir = async () => {
    if (!file) { toast.error('Selecciona una imagen'); return; }
    setSubiendo(true);
    try {
      await apiUploadLeadImagen(leadId, file, nota);
      toast.success('Imagen subida correctamente');
      setShowUpload(false);
      setFile(null);
      setPreview(null);
      setNota('');
      fetchImagenes();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al subir imagen');
    } finally {
      setSubiendo(false);
    }
  };

  const handleEliminar = async (img: LeadImagen) => {
    if (!window.confirm('¿Eliminar esta imagen?')) return;
    try {
      await apiDeleteLeadImagen(leadId, img.id);
      toast.success('Imagen eliminada');
      fetchImagenes();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al eliminar');
    }
  };

  const handleGuardarNota = async (img: LeadImagen) => {
    setGuardandoNota(true);
    try {
      await apiUpdateLeadImagenNota(leadId, img.id, editNota);
      toast.success('Nota actualizada');
      setEditandoId(null);
      fetchImagenes();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al actualizar');
    } finally {
      setGuardandoNota(false);
    }
  };

  const cancelarUpload = () => {
    setShowUpload(false);
    setFile(null);
    setPreview(null);
    setNota('');
  };

  const llegaLimite = imagenes.length >= MAX_IMAGENES;

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-4 shadow-sm">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
          <Camera className="w-3.5 h-3.5 text-indigo-500" />
          Imágenes del Lead
          {imagenes.length > 0 && (
            <span className="px-2 py-0.5 text-[10px] font-black bg-indigo-100 text-indigo-700 rounded-full">
              {imagenes.length}/{MAX_IMAGENES}
            </span>
          )}
        </h3>
        {puedeSubir && !showUpload && !llegaLimite && (
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" /> Subir imagen
          </button>
        )}
        {llegaLimite && (
          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">
            Límite alcanzado (5/5)
          </span>
        )}
      </div>

      {/* Formulario de subida */}
      {showUpload && (
        <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Nueva imagen</p>
            <button onClick={cancelarUpload}>
              <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
            </button>
          </div>

          <div
            onClick={() => fileRef.current?.click()}
            className="cursor-pointer border-2 border-dashed border-indigo-300 rounded-xl p-4 text-center hover:border-indigo-500 transition"
          >
            {preview ? (
              <img src={preview} alt="preview" className="max-h-40 mx-auto rounded-lg object-contain" />
            ) : (
              <div className="text-indigo-400">
                <Camera className="w-7 h-7 mx-auto mb-1" />
                <p className="text-xs font-bold">Clic para seleccionar · o pega (Ctrl+V)</p>
                <p className="text-[10px] text-slate-400 mt-0.5">JPG, PNG, WEBP</p>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

          <textarea
            value={nota}
            onChange={e => setNota(e.target.value)}
            placeholder="Nota opcional (ej: foto fachada, medida enviada por cliente...)"
            rows={2}
            className="w-full border border-indigo-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none bg-white"
          />

          <div className="flex gap-2">
            <button onClick={cancelarUpload}
              className="flex-1 py-2 text-xs font-bold border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition">
              Cancelar
            </button>
            <button onClick={handleSubir} disabled={subiendo || !file}
              className="flex-1 py-2 text-xs font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition disabled:opacity-40">
              {subiendo ? 'Subiendo...' : 'Subir'}
            </button>
          </div>
        </div>
      )}

      {/* Galería */}
      {loading ? (
        <div className="text-center py-4 text-slate-400 text-xs">Cargando...</div>
      ) : imagenes.length === 0 && !showUpload ? (
        <div className="border-2 border-dashed border-slate-100 rounded-xl p-6 text-center text-slate-400">
          <ImageOff className="w-8 h-8 mx-auto mb-2 text-slate-200" />
          <p className="text-xs font-bold">Sin imágenes adjuntas</p>
          {puedeSubir && (
            <p className="text-[10px] text-slate-400 mt-0.5">Usa el botón "Subir imagen" para agregar</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {imagenes.map(img => (
            <div key={img.id} className="group relative bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition">
              <div className="relative cursor-zoom-in" onClick={() => setLightbox(img)}>
                <img src={img.url} alt="Imagen lead" className="w-full aspect-square object-cover group-hover:opacity-90 transition" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/20">
                  <ZoomIn className="w-5 h-5 text-white" />
                </div>
              </div>

              <div className="p-2">
                {editandoId === img.id ? (
                  <div className="space-y-1">
                    <textarea value={editNota} onChange={e => setEditNota(e.target.value)} rows={2}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none" />
                    <div className="flex gap-1">
                      <button onClick={() => handleGuardarNota(img)} disabled={guardandoNota}
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
                    {img.nota && (
                      <p className="text-[10px] text-slate-600 italic mb-1 line-clamp-2">"{img.nota}"</p>
                    )}
                    <p className="text-[10px] text-slate-400">
                      {img.subidor?.nombre_completo} · {new Date(img.created_at).toLocaleDateString('es-CO')}
                    </p>
                    {puedeEditar(img) && (
                      <div className="flex gap-1 mt-1.5">
                        <button onClick={() => { setEditandoId(img.id); setEditNota(img.nota || ''); }}
                          className="flex-1 py-1 text-[10px] font-bold border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition flex items-center justify-center gap-1">
                          <Pencil className="w-2.5 h-2.5" /> Nota
                        </button>
                        <button onClick={() => handleEliminar(img)}
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
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 bg-white/10 rounded-full text-white hover:bg-white/20 transition"
            onClick={() => setLightbox(null)}
          >
            <X className="w-5 h-5" />
          </button>
          <div onClick={e => e.stopPropagation()} className="max-w-3xl w-full">
            <img src={lightbox.url} alt="Imagen lead" className="w-full max-h-[80vh] object-contain rounded-xl shadow-2xl" />
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

export default LeadImagenes;
