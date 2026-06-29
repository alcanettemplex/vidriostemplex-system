import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Wrench, FileText, Camera, ExternalLink, Plus, Ruler, MapPin, X, CheckCircle2,
  Package, Sparkles, Film, Box, Archive, Printer, ClipboardList, Images, Trash2
} from 'lucide-react';
import { toast } from 'react-toastify';
import axios from 'axios';
import { Badge, getTmEstado, tmVisitaRealizada } from './ODPFichaModal.utils';
import Lightbox, { useLightbox } from '../../../components/ui/Lightbox';
import TMModal from './TMModal';
import API from '../../../services/config';

const chks = (odp: any) => [
  { key: 'chk_medicion',   label: 'Toma de Medidas',   icon: <Ruler className="w-4 h-4" />,         aplica: (odp.tomas_medidas?.length ?? 0) > 0 },
  { key: 'chk_corte',      label: 'Aluminio / Corte',  icon: <Wrench className="w-4 h-4" />,        aplica: !!odp.tiene_aluminio },
  { key: 'chk_vidrio',     label: 'Vidrio',            icon: <CheckCircle2 className="w-4 h-4" />,  aplica: (odp.items?.length ?? 0) > 0 },
  { key: 'chk_accesorios', label: 'Herrajes / Acceso.', icon: <Package className="w-4 h-4" />,      aplica: (odp.saps?.length ?? 0) > 0 },
  { key: 'chk_ensamble',   label: 'Ensamble',          icon: <Wrench className="w-4 h-4" />,        aplica: !!odp.tiene_aluminio },
  { key: 'chk_matizado',   label: 'Matizado',          icon: <Sparkles className="w-4 h-4" />,      aplica: !!odp.matizado },
  { key: 'chk_pelicula',   label: 'Película',          icon: <Film className="w-4 h-4" />,          aplica: !!odp.pelicula },
  { key: 'chk_huacal',     label: 'Huacal',            icon: <Box className="w-4 h-4" />,           aplica: !!odp.huacal },
  { key: 'chk_carton',     label: 'Cartón',            icon: <Archive className="w-4 h-4" />,       aplica: !!odp.carton },
].filter(c => c.aplica);

const DetalleSAPCard: React.FC<{ odpId: number; canUpload: boolean; onOpenLightbox: (src: string) => void }> = ({ odpId, canUpload, onOpenLightbox }) => {
  const [imagenes, setImagenes] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const token = sessionStorage.getItem('token');

  const fetchImagenes = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/detalle-sap-imagenes?odp_id=${odpId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setImagenes(data);
    } catch { }
  }, [odpId]);

  useEffect(() => { fetchImagenes(); }, [fetchImagenes]);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Solo se permiten imágenes'); return; }
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('imagen', file);
      formData.append('odp_id', String(odpId));
      await axios.post(`${API}/api/detalle-sap-imagenes`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await fetchImagenes();
      toast.success('Imagen subida correctamente');
    } catch {
      toast.error('Error al subir imagen');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) { handleFile(file); break; }
      }
    }
  }, [odpId]);

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const handleDelete = async (id: number) => {
    try {
      await axios.delete(`${API}/api/detalle-sap-imagenes/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await fetchImagenes();
      toast.success('Imagen eliminada');
    } catch {
      toast.error('Error al eliminar imagen');
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-500 flex items-center gap-2">
          <Images className="w-4 h-4 text-violet-600" /> Detalles Tec. SAP ({imagenes.length})
        </h3>
        {canUpload && (
          <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition cursor-pointer">
            {uploading ? 'Subiendo...' : <><Camera className="w-3.5 h-3.5" /> Subir imagen</>}
            <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleFileChange} disabled={uploading} />
          </label>
        )}
      </div>

      {imagenes.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center text-slate-400">
          <Images className="w-10 h-10 mx-auto mb-2 text-slate-200" />
          <p className="font-bold text-xs">Sin imágenes Det. SAP</p>
          {canUpload && <p className="text-[11px] mt-1">Sube imágenes o pégalas con Ctrl+V</p>}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {imagenes.map((img: any) => (
            <div key={img.id} className="group relative rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-100 aspect-square">
              <img
                src={img.url}
                alt="Det. SAP"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 cursor-zoom-in"
                onClick={() => onOpenLightbox(img.url)}
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-2 pointer-events-none" />
              {canUpload && (
                <button
                  onClick={() => handleDelete(img.id)}
                  className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-red-600 text-white rounded-full p-1 hover:bg-red-700 z-10"
                  title="Eliminar"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {canUpload && <p className="text-[10px] text-slate-400 mt-3 italic text-center">Ctrl+V para pegar imagen desde el portapapeles</p>}
    </div>
  );
};

const TabProduccion: React.FC<{ odp: any; onUpdate?: () => void; currentUser?: any }> = ({ odp, onUpdate, currentUser }) => {
  const [uploading, setUploading] = useState(false);
  const [tmModalOpen, setTmModalOpen] = useState(false);
  const [solicitandoTM, setSolicitandoTM] = useState(false);
  const [relacionarOpen, setRelacionarOpen] = useState(false);
  const [tmsSinODP, setTmsSinODP] = useState<any[]>([]);
  const [loadingTmsSinODP, setLoadingTmsSinODP] = useState(false);
  const [vinculando, setVinculando] = useState(false);
  const { lightboxSrc, openLightbox, closeLightbox } = useLightbox();

  const items = chks(odp);
  const completados = items.filter(c => odp[c.key]).length;
  const tms = odp.tomas_medidas || [];
  const canSolicitarTM = currentUser && ['asesor_comercial', 'jefe_produccion', 'admin', 'gerencia'].includes(currentUser.rol);

  const handleSolicitarTM = async () => {
    if (!window.confirm(`¿Solicitar toma de medidas para ${odp.numero_odp}? La ODP pasará a estado VISITA TÉCNICA.`)) return;
    try {
      setSolicitandoTM(true);
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post(`${API}/api/documentos/tm`, {
        odp_id: odp.id,
        direccion: odp.direccion_instalacion || odp.cliente?.direccion || '',
        nombre_contacto: odp.nombre_recibe || odp.cliente?.nombre_razon_social || '',
        telefono_contacto: odp.telefono_recibe || odp.cliente?.telefono || '',
      }, { headers });
      await axios.put(`${API}/api/odp/${odp.id}`, { estado_produccion: 'VISITA_TECNICA' }, { headers });
      toast.success('Toma de medidas solicitada');
      if (onUpdate) onUpdate();
    } catch {
      toast.error('Error al solicitar toma de medidas');
    } finally {
      setSolicitandoTM(false);
    }
  };

  const handleAbrirRelacionar = async () => {
    setRelacionarOpen(true);
    setLoadingTmsSinODP(true);
    try {
      const token = sessionStorage.getItem('token');
      const { data } = await axios.get(`${API}/api/documentos/tm/sin-odp`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTmsSinODP(data);
    } catch {
      toast.error('Error al cargar TMs disponibles');
    } finally {
      setLoadingTmsSinODP(false);
    }
  };

  const handleVincularTM = async (tmId: number, numeroTM: string) => {
    if (!window.confirm(`¿Vincular ${numeroTM} a ${odp.numero_odp}?`)) return;
    try {
      setVinculando(true);
      const token = sessionStorage.getItem('token');
      await axios.patch(`${API}/api/documentos/tm/${tmId}/vincular-odp`, { odp_id: odp.id }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success(`${numeroTM} vinculada correctamente`);
      setRelacionarOpen(false);
      if (onUpdate) onUpdate();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al vincular TM');
    } finally {
      setVinculando(false);
    }
  };

  const handleCroquisFile = async (file: File) => {
    if (!file) return;
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('croquis', file);
      const token = sessionStorage.getItem('token');
      await axios.post(`${API}/api/odp/${odp.id}/croquis`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error uploading croquis:', error);
      alert('Error al subir el croquis');
    } finally {
      setUploading(false);
    }
  };

  const handleCroquisUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleCroquisFile(file);
  };

  const handlePegarPortapapeles = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const file = new File([blob], 'croquis-pegado.png', { type: imageType });
          handleCroquisFile(file);
          return;
        }
      }
      toast.error('No hay imagen en el portapapeles');
    } catch {
      toast.error('No se pudo acceder al portapapeles. Usa Ctrl+V dentro del área.');
    }
  };

  const handleCroquisPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) { handleCroquisFile(file); break; }
      }
    }
  };

  const canUploadSAP = currentUser && ['asesor_comercial', 'jefe_produccion', 'admin', 'gerencia', 'contabilidad'].includes(currentUser.rol);

  return (
    <div className="p-6 space-y-6">
      <Lightbox src={lightboxSrc} onClose={closeLightbox} />

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-amber-600" /> Estado de Componentes de Producción
          </h3>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 bg-slate-100 rounded-full h-2.5">
              <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-700"
                style={{ width: items.length > 0 ? `${(completados / items.length) * 100}%` : '0%' }} />
            </div>
            <span className="text-sm font-black text-slate-700">{completados}/{items.length}</span>
            <Badge className={completados === items.length && items.length > 0 ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'}>
              {completados === items.length && items.length > 0 ? 'LISTO' : 'EN CURSO'}
            </Badge>
          </div>
          {items.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">Esta ODP no requiere seguimiento de componentes.</p>
          ) : (
            <div className={`grid gap-3 ${items.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {items.map(chk => (
                <div key={chk.key} className={`p-4 rounded-xl border-2 text-center transition-all ${odp[chk.key] ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                  <div className="flex justify-center mb-2">{chk.icon}</div>
                  <p className="text-xs font-bold">{chk.label}</p>
                  <p className="text-xs mt-1">{odp[chk.key] ? '✓ Completado' : 'Pendiente'}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-600" /> Croquis / Plano Técnico
          </h3>
          <div
            className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-4 min-h-[160px] relative overflow-hidden group focus:outline-none focus:border-indigo-400"
            tabIndex={0}
            onPaste={handleCroquisPaste}
          >
            {odp.croquis_url ? (
              <>
                <img src={odp.croquis_url} alt="Croquis" className="absolute inset-0 w-full h-full object-contain p-2 cursor-zoom-in"
                  onClick={() => openLightbox(odp.croquis_url)} />
                <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[2px]">
                  <button
                    type="button"
                    onClick={() => openLightbox(odp.croquis_url)}
                    className="bg-white text-slate-900 px-3 py-2 rounded-lg font-bold text-xs shadow-xl flex items-center gap-1.5 hover:scale-105 transition-transform"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Ver
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const win = window.open('', '_blank');
                      if (!win) return;
                      win.document.write(`<!DOCTYPE html><html><head><title>Croquis</title><style>*{margin:0;padding:0;box-sizing:border-box;}body{display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff;}img{max-width:100%;max-height:100vh;object-fit:contain;display:block;}@media print{img{width:100%;height:auto;}}</style></head><body><img src="${odp.croquis_url}" onload="window.print();window.close();" /></body></html>`);
                      win.document.close();
                    }}
                    className="bg-white text-slate-900 px-3 py-2 rounded-lg font-bold text-xs shadow-xl flex items-center gap-1.5 hover:scale-105 transition-transform"
                  >
                    <Printer className="w-3.5 h-3.5" /> Imprimir
                  </button>
                  <label className="cursor-pointer bg-white text-slate-900 px-3 py-2 rounded-lg font-bold text-xs shadow-xl flex items-center gap-1.5 hover:scale-105 transition-transform">
                    <Camera className="w-3.5 h-3.5" /> Cambiar
                    <input type="file" className="hidden" accept="image/*" onChange={handleCroquisUpload} />
                  </label>
                  <button
                    type="button"
                    onClick={handlePegarPortapapeles}
                    className="bg-white text-slate-900 px-3 py-2 rounded-lg font-bold text-xs shadow-xl flex items-center gap-1.5 hover:scale-105 transition-transform"
                  >
                    <ClipboardList className="w-3.5 h-3.5" /> Pegar
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                  <Camera className="w-6 h-6" />
                </div>
                <p className="text-slate-500 text-xs font-bold mb-3 uppercase tracking-wider">Aún no hay un dibujo técnico</p>
                <div className="flex flex-col items-center gap-2">
                  <label className="cursor-pointer bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-black text-xs shadow-lg shadow-indigo-600/20 flex items-center gap-2 hover:bg-indigo-700 transition">
                    {uploading ? 'SUBIENDO...' : 'SUBIR CROQUIS'}
                    <input type="file" className="hidden" accept="image/*" onChange={handleCroquisUpload} disabled={uploading} />
                  </label>
                  <button
                    type="button"
                    onClick={handlePegarPortapapeles}
                    disabled={uploading}
                    className="bg-slate-100 text-slate-700 px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-slate-200 transition border border-slate-200"
                  >
                    <ClipboardList className="w-3.5 h-3.5" /> Pegar desde portapapeles
                  </button>
                </div>
              </div>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-3 italic text-center uppercase tracking-tighter">Haz clic en el área y pega con Ctrl+V, o usa el botón para subir archivo · Aparece en el impreso</p>
        </div>
      </div>

      <DetalleSAPCard odpId={odp.id} canUpload={canUploadSAP} onOpenLightbox={openLightbox} />

      <div>
        <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
          <Ruler className="w-4 h-4 text-amber-600" /> Tomas de Medida ({tms.length})
        </h3>
        {canSolicitarTM && (
          <div className="flex gap-2 mb-3">
            {tms.length === 0 && (
              <button
                onClick={handleSolicitarTM}
                disabled={solicitandoTM}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                {solicitandoTM ? 'Solicitando...' : 'Solicitar TM'}
              </button>
            )}
            <button
              onClick={handleAbrirRelacionar}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Relacionar TM existente
            </button>
          </div>
        )}

        {tms.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center text-slate-400">
            <Ruler className="w-10 h-10 mx-auto mb-2 text-slate-200" />
            <p className="font-bold">Sin tomas de medida registradas</p>
          </div>
        ) : tms.map((tm: any) => {
          const fotos: string[] = Array.isArray(tm.medidas_json) && tm.medidas_json.every((f: any) => typeof f === 'string')
            ? tm.medidas_json : [];
          return (
            <div key={tm.id} className="bg-white border border-slate-200 rounded-2xl p-5 mb-3 shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <span className="font-black text-amber-700 text-lg">{tm.numero_tm}</span>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {tm.realizador?.nombre_completo} · {tm.fecha_visita ? new Date(tm.fecha_visita + 'T00:00:00').toLocaleDateString('es-CO') : 'Sin fecha'}
                  </p>
                  {tm.direccion && (
                    <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3" />{tm.direccion}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={getTmEstado(tm.estado).cls}>
                    {getTmEstado(tm.estado).label}
                  </Badge>
                  <button
                    onClick={() => setTmModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Ver detalles
                  </button>
                </div>
              </div>

              {fotos.length > 0 ? (
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Camera className="w-3.5 h-3.5" /> Fotos relevadas ({fotos.length})
                  </p>
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                    {fotos.map((url, i) => (
                      <img key={i} src={url} alt={`Foto ${i + 1}`}
                        className="w-full aspect-square object-cover rounded-lg border border-amber-200 hover:opacity-85 transition bg-slate-50 cursor-zoom-in"
                        onClick={() => openLightbox(url)} />
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">
                  {tmVisitaRealizada(tm.estado) ? 'Sin fotos registradas' : 'Pendiente de realizar la visita'}
                </p>
              )}

              {tm.observaciones && (
                <p className="text-xs text-slate-500 italic mt-3 pt-3 border-t border-slate-100">"{tm.observaciones}"</p>
              )}
            </div>
          );
        })}
      </div>

      {tmModalOpen && <TMModal odp={odp} onClose={() => setTmModalOpen(false)} />}

      {relacionarOpen && (
        <div className="fixed inset-0 z-[1410] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Ruler className="w-4 h-4 text-sky-600" /> Relacionar TM a {odp.numero_odp}
              </h3>
              <button onClick={() => setRelacionarOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {loadingTmsSinODP ? (
                <p className="text-center text-slate-400 py-8">Cargando TMs disponibles...</p>
              ) : tmsSinODP.length === 0 ? (
                <div className="text-center text-slate-400 py-8">
                  <Ruler className="w-10 h-10 mx-auto mb-2 text-slate-200" />
                  <p className="font-bold">No hay TMs sin ODP asignada</p>
                </div>
              ) : tmsSinODP.map((tm: any) => (
                <div key={tm.id} className="border border-slate-200 rounded-xl p-4 mb-3 hover:border-sky-300 transition">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-black text-amber-700">{tm.numero_tm}</span>
                      <span className={`ml-2 text-xs font-bold px-2 py-0.5 rounded-full ${getTmEstado(tm.estado).cls}`}>
                        {getTmEstado(tm.estado).label}
                      </span>
                      {tm.prospecto && (
                        <p className="text-xs text-sky-600 font-semibold mt-0.5">
                          Prospecto: {tm.prospecto.numero_prospecto} — {tm.prospecto.cliente?.nombre_razon_social || tm.prospecto.nombre_contacto}
                        </p>
                      )}
                      {tm.direccion && (
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3" />{tm.direccion}
                        </p>
                      )}
                      {tm.realizador && <p className="text-xs text-slate-400 mt-0.5">{tm.realizador.nombre_completo}</p>}
                    </div>
                    <button
                      onClick={() => handleVincularTM(tm.id, tm.numero_tm)}
                      disabled={vinculando}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50 transition shrink-0 ml-3"
                    >
                      <Plus className="w-3.5 h-3.5" /> Vincular
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TabProduccion;
