import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, FileText, Wrench, Truck, DollarSign, Package, Ruler, Plus,
  CheckCircle2, AlertCircle, AlertTriangle, MapPin, User, Calendar, Phone,
  Building2, ExternalLink, CreditCard, Camera, History, Shield, ChevronDown,
  ClipboardList, TrendingUp, Printer, PenTool, Images, Trash2,
  Sparkles, Film, Box, Archive, ChevronUp, Loader2, MessageSquare,
  ArrowRight, RefreshCw, Tag
} from 'lucide-react';
import { toast } from 'react-toastify';
import PrintableTalonario from './PrintableTalonario';
import PrintableGarantia from './PrintableGarantia';
import PrintableNoConformidad from './PrintableNoConformidad';
import PrintableProduccion from './PrintableProduccion';
import PrintableOA from './PrintableOA';
import PrintableDetalleTecnico from './PrintableDetalleTecnico';
import PrintableDetSAP from './PrintableDetSAP';
import PrintableSAP from './PrintableSAP';
import ReportarProblemaForm from './ReportarProblemaForm';
import GarantiaFormModal from './GarantiaFormModal';
import SAPModal from './SAPModal';
import TMModal from './TMModal';
import CotizacionCapturas from './CotizacionCapturas';
import Lightbox, { useLightbox } from '../../../components/ui/Lightbox';
import { getTmEstadoConfig, tmVisitaRealizada } from '../../../utils/tmEstado';

// ─── Paleta de estado ─────────────────────────────────────────────────────────
const estadoProdColor: Record<string, string> = {
  EN_ESPERA: 'bg-slate-100 text-slate-700 border-slate-200',
  MEDICION: 'bg-sky-100 text-sky-700 border-sky-200',
  ALUMINIO_CORTADO: 'bg-blue-100 text-blue-700 border-blue-200',
  VIDRIO_RECIBIDO: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  ACCESORIOS_SEPARADOS: 'bg-teal-100 text-teal-700 border-teal-200',
  LISTO_INSTALAR: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  PROGRAMADA: 'bg-amber-100 text-amber-700 border-amber-200',
  INSTALADA: 'bg-green-100 text-green-700 border-green-200',
  ENTREGADA: 'bg-gray-100 text-gray-700 border-gray-200',
  PAUSADA: 'bg-rose-100 text-rose-700 border-rose-200',
};

const cajaColor: Record<string, string> = {
  PENDIENTE: 'bg-rose-100 text-rose-700',
  ABONADO: 'bg-blue-100 text-blue-700',
  CANCELADO: 'bg-emerald-100 text-emerald-700',
  CREDITO_APROBADO: 'bg-indigo-100 text-indigo-700',
};

const getTmEstado = (estado: string) => {
  const cfg = getTmEstadoConfig(estado);
  return { label: cfg.label, cls: cfg.badgeCls };
};

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);

// ─── Componentes auxiliares ────────────────────────────────────────────────────
const InfoRow: React.FC<{ label: string; value?: any; icon?: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="flex items-start gap-2 py-2 border-b border-slate-50 last:border-0">
    {icon && <span className="mt-0.5 text-slate-400 flex-shrink-0">{icon}</span>}
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-800 mt-0.5 truncate">{value || '—'}</p>
    </div>
  </div>
);

const Badge: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${className}`}>{children}</span>
);

const TabButton: React.FC<{ active: boolean; icon: React.ReactNode; label: string; badge?: number; onClick: () => void }> = ({ active, icon, label, badge, onClick }) => (
  <button onClick={onClick}
    className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${active ? 'border-indigo-600 text-indigo-700 bg-indigo-50/60' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
    {icon}
    {label}
    {badge !== undefined && badge > 0 && (
      <span className={`ml-1 min-w-[18px] h-[18px] text-[10px] font-black rounded-full flex items-center justify-center px-1 ${active ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'}`}>{badge}</span>
    )}
  </button>
);

// ─── Tabs ──────────────────────────────────────────────────────────────────────
const TabDatosGenerales: React.FC<{ odp: any }> = ({ odp }) => {
  const servicios: string[] = [];
  if (odp.instalacion) servicios.push('Instalación');
  if (odp.matizado) servicios.push('Matizado');
  if (odp.pelicula) servicios.push('Película');
  if (odp.acarreo) servicios.push('Acarreo');
  if (odp.huacal) servicios.push('Huacal');
  if (odp.carton) servicios.push('Cartón');

  return (
    <div className="grid md:grid-cols-3 gap-6 p-6">
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2"><FileText className="w-3.5 h-3.5" />Datos de la Orden</h3>
        <InfoRow label="N° ODP" value={<span className="text-indigo-700 font-black text-base">{odp.numero_odp}</span>} />
        <InfoRow label="Tipo de Servicio" value={odp.tipo_servicio?.replace(/_/g, ' ')} />
        <InfoRow label="Dirección de Instalación" value={odp.direccion_instalacion} icon={<MapPin className="w-3.5 h-3.5" />} />
        <InfoRow label="Fecha de Entrega" value={(() => { const d = odp.fecha_entrega ? new Date(odp.fecha_entrega.includes('T') ? odp.fecha_entrega : odp.fecha_entrega + 'T00:00:00') : null; return d && !isNaN(d.getTime()) ? d.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }) : null; })() } icon={<Calendar className="w-3.5 h-3.5" />} />
        <InfoRow label="Creado el" value={new Date(odp.fecha_creacion).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })} />
        <InfoRow label="Descripción" value={odp.descripcion_pedido} />
        {odp.observaciones && <InfoRow label="Observaciones" value={odp.observaciones} />}
      </div>

      <div className="space-y-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2"><Building2 className="w-3.5 h-3.5" />Cliente</h3>
          <InfoRow label="Nombre / Razón Social" value={<span className="text-slate-900 font-bold">{odp.cliente?.nombre_razon_social}</span>} />
          <InfoRow label={`${odp.cliente?.tipo_documento || 'Documento'}`} value={odp.cliente?.numero_documento} />
          <InfoRow label="Contacto" value={odp.nombre_recibe} icon={<User className="w-3.5 h-3.5" />} />
          <InfoRow label="Teléfono Contacto" value={odp.telefono_recibe} icon={<Phone className="w-3.5 h-3.5" />} />
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2"><User className="w-3.5 h-3.5" />Asesor Responsable</h3>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-black text-sm flex-shrink-0">
              {odp.asesor?.nombre_completo?.[0]?.toUpperCase() || '?'}
            </div>
            <div>
              <p className="font-bold text-slate-800">{odp.asesor?.nombre_completo}</p>
              <p className="text-xs text-slate-500">{odp.asesor?.username} · {odp.asesor?.email}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-4">Servicios Incluidos</h3>
          {servicios.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {servicios.map(s => <Badge key={s} className="bg-indigo-50 text-indigo-700 border-indigo-100"><CheckCircle2 className="w-3 h-3" />{s}</Badge>)}
            </div>
          ) : <p className="text-slate-400 text-sm">Sin servicios adicionales</p>}
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-4">Ítems de Vidrio ({odp.items?.length || 0})</h3>
          {odp.items?.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {odp.items.map((item: any, i: number) => (
                <div key={i} className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 text-xs">
                  <div className="flex justify-between items-start">
                    <p className="font-bold text-slate-700">{item.tipo_vidrio || item.item}</p>
                    <Badge className="bg-slate-100 text-slate-600 border-slate-200">{item.cantidad}x</Badge>
                  </div>
                  <p className="text-slate-500 mt-0.5">{item.ancho_mm}mm × {item.alto_mm}mm {item.espesor && `· ${item.espesor}`} {item.color && `· ${item.color}`}</p>
                </div>
              ))}
            </div>
          ) : <p className="text-slate-400 text-sm">Sin ítems registrados</p>}
        </div>
      </div>
    </div>
  );
};

/** Convierte la clave `item` de la BD a letra legible: A–Z directas, 27→AA, 28→AB… */
const normalizarItemLabel = (item: string): string => {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (/^[A-Z]$/.test(item)) return item;
  const pos = parseInt(item, 10);
  if (!isNaN(pos) && pos >= 27) {
    const idx = pos - 1; // 27 → índice 26
    return abc[Math.floor(idx / 26) - 1] + abc[idx % 26]; // 26→AA, 27→AB…
  }
  return item;
};

const TabComercial: React.FC<{ odp: any; onRefresh: () => void }> = ({ odp, onRefresh }) => {
  const [sapModalOpen, setSapModalOpen] = useState(false);
  const saps = odp.saps || [];
  const cots = odp.cotizaciones || [];
  const estadoCotColor: Record<string, string> = {
    enviada: 'bg-blue-100 text-blue-700 border-blue-200',
    aprobada: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    rechazada: 'bg-rose-100 text-rose-700 border-rose-200',
    vencida: 'bg-slate-100 text-slate-600 border-slate-200',
  };

  return (
    <div className="p-6 space-y-6">
      {/* SAP */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-500 flex items-center gap-2">
            <Package className="w-4 h-4 text-indigo-600" /> Solicitudes de Accesorios y Perfilería (SAP)
          </h3>
          {saps.length === 0 ? (
            <button
              onClick={() => setSapModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" /> Gestionar SAP
            </button>
          ) : (
            <button
              onClick={() => setSapModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-100 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition"
            >
              <Package className="w-3.5 h-3.5" /> Ver SAP
            </button>
          )}
        </div>
        {saps.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400">
            <Package className="w-10 h-10 mx-auto mb-2 text-slate-200" />
            <p className="font-bold">No hay SAPs registradas</p>
          </div>
        ) : saps.map((sap: any) => (
          <div key={sap.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-3 shadow-sm">
            <div className="flex justify-between items-center px-5 py-3 bg-slate-50 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <span className="font-black text-indigo-700 text-lg">{sap.numero_sap}</span>
                <Badge className="bg-slate-100 text-slate-600 border-slate-200">{sap.estado}</Badge>
              </div>
              <p className="text-xs text-slate-500">{sap.asesor?.nombre_completo} · {new Date(sap.fecha_creacion).toLocaleDateString('es-CO')}</p>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-slate-700 text-white">
                <tr>
                  <th className="px-3 py-1.5 text-center w-10">ITEM</th>
                  <th className="px-3 py-1.5 w-28">CÓDIGO</th>
                  <th className="px-3 py-1.5">DESCRIPCIÓN</th>
                  <th className="px-3 py-1.5 w-24">DIMENSIÓN</th>
                  <th className="px-3 py-1.5 text-center w-16">CANT.</th>
                  <th className="px-3 py-1.5 w-32">OBSERV.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...(sap.items || [])].sort((a: any, b: any) => {
                  const toIdx = (it: string) => {
                    if (/^[A-Z]$/.test(it)) return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(it);
                    const n = parseInt(it, 10);
                    return isNaN(n) ? 9999 : n - 1;
                  };
                  return toIdx(a.item) - toIdx(b.item);
                }).map((item: any, i: number) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="px-3 py-1.5 text-center font-black text-slate-600">{normalizarItemLabel(item.item)}</td>
                    <td className="px-3 py-1.5 font-mono text-blue-700 font-bold">{item.codigo || '—'}</td>
                    <td className="px-3 py-1.5 text-slate-700">{item.descripcion || '—'}</td>
                    <td className="px-3 py-1.5 text-slate-500">{item.dimension || '—'}</td>
                    <td className="px-3 py-1.5 text-center font-bold">{Number(item.cantidad) % 1 === 0 ? Math.round(Number(item.cantidad)) : item.cantidad}</td>
                    <td className="px-3 py-1.5 text-slate-400 text-[10px] max-w-[120px] truncate" title={item.observacion || ''}>{item.observacion || '—'}</td>
                  </tr>
                ))}
              </tbody>

            </table>
            {sap.notas && <p className="px-5 py-2 text-xs text-slate-500 italic border-t border-slate-100">"{sap.notas}"</p>}
          </div>
        ))}
      </div>

      {sapModalOpen && (
        <SAPModal
          odp={odp}
          onClose={() => { setSapModalOpen(false); onRefresh(); }}
        />
      )}

      <CotizacionCapturas odp_id={odp.id} numeroCotizacion={odp.numero_cotizacion || ''} onRefresh={onRefresh} />

      <div>
        <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-blue-600" /> Cotizaciones (COT)
        </h3>
        {cots.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400">
            <DollarSign className="w-10 h-10 mx-auto mb-2 text-slate-200" />
            <p className="font-bold">No hay cotizaciones registradas</p>
          </div>
        ) : cots.map((cot: any) => (
            <div key={cot.id} className="bg-white border border-slate-200 rounded-2xl p-5 mb-3 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-black text-blue-700 text-lg">{cot.numero_cot}</span>
                    <Badge className={estadoCotColor[cot.estado] || 'bg-slate-100 text-slate-600 border-slate-200'}>{cot.estado}</Badge>
                  </div>
                  <p className="text-xs text-slate-500">{cot.asesor?.nombre_completo} · {new Date(cot.fecha_creacion).toLocaleDateString('es-CO')} · Válida {cot.validez_dias} días</p>
                  {cot.descuento > 0 && (
                    <p className="text-xs text-slate-400 mt-1">
                      Subtotal: {fmt(cot.subtotal || cot.valor_total)} — Descuento {cot.descuento}% — IVA: {fmt(cot.iva || 0)}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  {/* valor_total ya es el TOTAL NETO (con descuento + IVA aplicados) */}
                  <p className="text-2xl font-black text-slate-900">{fmt(cot.valor_total)}</p>
                  <p className="text-xs text-slate-400 mt-0.5">TOTAL NETO</p>
                  <p className="text-xs font-bold text-slate-600 mt-0.5">{cot.forma_pago}</p>
                </div>
              </div>
              {cot.notas && <p className="text-xs text-slate-500 italic mt-2 pt-2 border-t border-slate-100">"{cot.notas}"</p>}
            </div>
          ))}
      </div>
    </div>
  );
};

// ─── Card Det. SAP (galería de imágenes técnicas) ─────────────────────────────
const DetalleSAPCard: React.FC<{ odpId: number; canUpload: boolean; onOpenLightbox: (src: string) => void }> = ({ odpId, canUpload, onOpenLightbox }) => {
  const [imagenes, setImagenes] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
  const token = sessionStorage.getItem('token');

  const fetchImagenes = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/detalle-sap-imagenes?odp_id=${odpId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setImagenes(data);
    } catch { /* ignorar */ }
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
  const tms = odp.tomas_medidas || [];
  const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
  const canSolicitarTM = currentUser && ['asesor_comercial', 'jefe_produccion', 'admin', 'gerencia'].includes(currentUser.rol);
  const todosLosChks = [
    { key: 'chk_medicion',   label: 'Toma de Medidas',   icon: <Ruler className="w-4 h-4" />,         aplica: (tms?.length ?? 0) > 0 },
    { key: 'chk_corte',      label: 'Aluminio / Corte',  icon: <Wrench className="w-4 h-4" />,        aplica: !!odp.tiene_aluminio },
    { key: 'chk_vidrio',     label: 'Vidrio',            icon: <CheckCircle2 className="w-4 h-4" />,  aplica: (odp.items?.length ?? 0) > 0 },
    { key: 'chk_accesorios', label: 'Herrajes / Acceso.', icon: <Package className="w-4 h-4" />,      aplica: (odp.saps?.length ?? 0) > 0 },
    { key: 'chk_ensamble',   label: 'Ensamble',          icon: <Wrench className="w-4 h-4" />,        aplica: !!odp.tiene_aluminio },
    { key: 'chk_matizado',   label: 'Matizado',          icon: <Sparkles className="w-4 h-4" />,      aplica: !!odp.matizado },
    { key: 'chk_pelicula',   label: 'Película',          icon: <Film className="w-4 h-4" />,          aplica: !!odp.pelicula },
    { key: 'chk_huacal',     label: 'Huacal',            icon: <Box className="w-4 h-4" />,           aplica: !!odp.huacal },
    { key: 'chk_carton',     label: 'Cartón',            icon: <Archive className="w-4 h-4" />,       aplica: !!odp.carton },
  ];
  const chks = todosLosChks.filter(c => c.aplica);
  const completados = chks.filter(c => odp[c.key]).length;

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
      const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
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
                style={{ width: chks.length > 0 ? `${(completados / chks.length) * 100}%` : '0%' }} />
            </div>
            <span className="text-sm font-black text-slate-700">{completados}/{chks.length}</span>
            <Badge className={completados === chks.length && chks.length > 0 ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'}>
              {completados === chks.length && chks.length > 0 ? 'LISTO' : 'EN CURSO'}
            </Badge>
          </div>
          {chks.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">Esta ODP no requiere seguimiento de componentes.</p>
          ) : (
            <div className={`grid gap-3 ${chks.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {chks.map(chk => (
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
                  {/* Ver en grande */}
                  <button
                    type="button"
                    onClick={() => openLightbox(odp.croquis_url)}
                    className="bg-white text-slate-900 px-3 py-2 rounded-lg font-bold text-xs shadow-xl flex items-center gap-1.5 hover:scale-105 transition-transform"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Ver
                  </button>
                  {/* Imprimir */}
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
                  {/* Cambiar imagen */}
                  <label className="cursor-pointer bg-white text-slate-900 px-3 py-2 rounded-lg font-bold text-xs shadow-xl flex items-center gap-1.5 hover:scale-105 transition-transform">
                    <Camera className="w-3.5 h-3.5" /> Cambiar
                    <input type="file" className="hidden" accept="image/*" onChange={handleCroquisUpload} />
                  </label>
                  {/* Pegar desde portapapeles */}
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
        {/* Botones de acción — visibles para roles autorizados */}
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
              {/* Header TM */}
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

              {/* Fotos */}
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

      {/* TMModal */}
      {tmModalOpen && (
        <TMModal odp={odp} onClose={() => setTmModalOpen(false)} />
      )}

      {/* Modal Relacionar TM existente */}
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
                      {tm.realizador && (
                        <p className="text-xs text-slate-400 mt-0.5">{tm.realizador.nombre_completo}</p>
                      )}
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

const ESTADO_RUTA_ODP: Record<string, { label: string; cls: string }> = {
  pendiente:   { label: 'Pendiente',  cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  en_curso:    { label: 'En curso',   cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  pausada:     { label: 'Pausada',    cls: 'bg-violet-100 text-violet-700 border-violet-200' },
  con_dano:    { label: 'Con daño',   cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  completada:  { label: 'Completada', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

const TabInstalacion: React.FC<{ odp: any; onOpenLightbox: (src: string) => void; currentUser?: any; onRefresh?: () => void }> = ({ odp, onOpenLightbox, currentUser, onRefresh }) => {
  const rutaOdps: any[] = odp.ruta_odps || [];
  const evidencias = odp.evidencias || [];
  const rutasConDano = rutaOdps.filter((r: any) => r.estado === 'con_dano');

  const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
  const token = sessionStorage.getItem('token');

  const isOwner = currentUser?.id === odp.asesor_id;
  const puedeRevisar = isOwner || ['admin', 'gerencia', 'produccion', 'jefe_produccion'].includes(currentUser?.rol);

  const handleRevisarDano = async () => {
    if (!window.confirm('¿Marcar el daño como revisado? La ODP saldrá del tab "Con Daños".')) return;
    try {
      await axios.patch(`${API}/api/odp/${odp.id}/revisar-dano`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Daño marcado como revisado');
      onRefresh?.();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al revisar el daño');
    }
  };

  return (
    <div className="p-6 space-y-6">

      {/* ── Banner de daño pendiente de revisión ── */}
      {odp.tiene_dano_instalacion && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-black text-orange-800">Instalación con daño reportado</p>
              <p className="text-xs text-orange-600 mt-0.5">El instalador reportó un problema durante la ejecución. Revisa el detalle abajo y decide si procede una No Conformidad.</p>
            </div>
          </div>
          {puedeRevisar && (
            <button
              onClick={handleRevisarDano}
              className="flex-shrink-0 px-4 py-2 bg-white border border-orange-300 text-orange-700 text-xs font-black rounded-xl hover:bg-orange-50 transition whitespace-nowrap"
            >
              Revisado / Sin acción
            </button>
          )}
        </div>
      )}

      {/* ── Cards de daño ── */}
      {rutasConDano.length > 0 && (
        <div>
          <h3 className="text-sm font-extrabold uppercase tracking-widest text-orange-500 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Reportes de Daño ({rutasConDano.length})
          </h3>
          <div className="space-y-3">
            {rutasConDano.map((r: any) => (
              <div key={r.id} className="bg-orange-50 border border-orange-200 rounded-2xl p-5 shadow-sm">
                <div className="flex flex-col md:flex-row gap-4">
                  {r.foto_dano_url && (
                    <div
                      className="w-full md:w-36 h-36 rounded-xl overflow-hidden border border-orange-200 flex-shrink-0 cursor-zoom-in bg-orange-100"
                      onClick={() => onOpenLightbox(r.foto_dano_url)}
                    >
                      <img src={r.foto_dano_url} alt="Foto daño" className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
                    </div>
                  )}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 bg-orange-100 text-orange-700 text-[10px] font-black rounded-lg uppercase tracking-wider">
                        Daño en instalación
                      </span>
                      {r.inicio_instalacion && (
                        <span className="text-[10px] text-slate-400 font-medium">
                          {new Date(r.inicio_instalacion).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">{r.descripcion_dano || '—'}</p>
                    {r.ruta?.instaladores?.length > 0 && (
                      <p className="text-xs text-slate-500">
                        Instalador(es): <strong>{r.ruta.instaladores.map((i: any) => i.nombre_completo).join(', ')}</strong>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
          <Truck className="w-4 h-4 text-indigo-600" /> Programaciones de Instalación ({rutaOdps.length})
        </h3>
        {rutaOdps.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400">
            <Truck className="w-10 h-10 mx-auto mb-2 text-slate-200" />
            <p className="font-bold">Sin programaciones asignadas</p>
          </div>
        ) : rutaOdps.map((prog: any) => {
          const estadoBadge = ESTADO_RUTA_ODP[prog.estado] || ESTADO_RUTA_ODP['pendiente'];
          const oficial = prog.ruta?.oficial;
          const ayudantes = (prog.ruta?.instaladores || []).filter((i: any) => i.id !== oficial?.id);
          const todoInstaladores = [oficial, ...ayudantes].filter(Boolean);
          const instaladores = todoInstaladores.length > 0 ? todoInstaladores.map((i: any) => i.nombre_completo).join(', ') : '—';
          const vehiculo = prog.ruta?.vehiculo ? `${prog.ruta.vehiculo.tipo.toUpperCase()} — ${prog.ruta.vehiculo.placa}` : '—';
          return (
            <div key={prog.id} className="bg-white border border-slate-200 rounded-2xl p-5 mb-3 shadow-sm">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase">Fecha programada</p>
                  <p className="font-bold">{prog.fecha_programada ? new Date(prog.fecha_programada).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase">Vehículo</p>
                  <p className="font-bold">{vehiculo}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase">Instaladores</p>
                  <p className="font-bold text-xs">{instaladores}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase">Estado</p>
                  <Badge className={`${estadoBadge.cls} mt-0.5`}>{estadoBadge.label}</Badge>
                </div>
              </div>
              {prog.inicio_instalacion && (
                <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-4 text-xs text-slate-500">
                  <span>Inicio: <strong>{new Date(prog.inicio_instalacion).toLocaleString('es-CO')}</strong></span>
                  {prog.fin_instalacion && <span>Fin: <strong>{new Date(prog.fin_instalacion).toLocaleString('es-CO')}</strong></span>}
                </div>
              )}
              {prog.datos_receptor && (
                <p className="text-xs text-slate-500 mt-2">Recibió: <strong>{prog.datos_receptor}</strong></p>
              )}
              {prog.motivo_pausa && (
                <p className="text-xs text-violet-600 mt-1.5 font-medium">Motivo de pausa: <strong>{prog.motivo_pausa}</strong></p>
              )}
            </div>
          );
        })}
      </div>

      <div>
        <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
          <Camera className="w-4 h-4 text-emerald-600" /> Evidencias Fotográficas ({evidencias.length})
        </h3>
        {evidencias.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400">
            <Camera className="w-10 h-10 mx-auto mb-2 text-slate-200" />
            <p className="font-bold">Sin evidencias cargadas</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {evidencias.map((ev: any) => (
              <div key={ev.id} className="group relative rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-100 aspect-square">
                {ev.archivo_url ? (
                  <>
                    <img src={ev.archivo_url} alt="Evidencia" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 cursor-zoom-in"
                      onClick={() => onOpenLightbox(ev.archivo_url)} />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <ExternalLink className="w-6 h-6 text-white" />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400">
                    <Camera className="w-8 h-8 mb-1" />
                    <p className="text-xs">Sin imagen</p>
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-2">
                  <p className="text-white text-[10px] font-bold truncate">{ev.instalador?.nombre_completo}</p>
                  <p className="text-white/70 text-[10px]">{ev.fecha ? new Date(ev.fecha).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Firmas del cliente ── */}
      {(() => {
        const firmas = rutaOdps.filter((r: any) => r.firma_receptor);
        if (firmas.length === 0) return null;
        return (
          <div>
            <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
              <PenTool className="w-4 h-4 text-violet-600" /> Firma(s) del Cliente ({firmas.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {firmas.map((r: any) => (
                <div key={r.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">
                    Recibió: <span className="text-slate-800 font-bold">{r.datos_receptor || '—'}</span>
                  </p>
                  <div
                    className="border border-slate-200 rounded-xl overflow-hidden cursor-zoom-in bg-slate-50"
                    onClick={() => onOpenLightbox(r.firma_receptor)}
                  >
                    <img src={r.firma_receptor} alt="Firma del cliente" className="w-full max-h-40 object-contain p-2" />
                  </div>
                  {r.fin_instalacion && (
                    <p className="text-[10px] text-slate-400 mt-2">
                      {new Date(r.fin_instalacion).toLocaleString('es-CO')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

const TabFinanciero: React.FC<{ odp: any }> = ({ odp }) => {
  const valorTotal = Number(odp.valor_total) || 0;
  const abono = Number(odp.abono) || 0;
  const pendiente = Number(odp.pendiente) || 0;
  const pctCobrado = valorTotal > 0 ? Math.min(100, (abono / valorTotal) * 100) : (abono > 0 ? 100 : 0);

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Valor Total ODP', value: fmt(valorTotal), color: 'bg-slate-50 border-slate-200 text-slate-800' },
          { label: 'Abonado', value: fmt(abono), color: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
          { label: 'Por Cobrar', value: fmt(pendiente), color: pendiente > 0 ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800' },
          { label: 'Estado Caja', value: odp.estado_caja?.replace(/_/g, ' '), color: cajaColor[odp.estado_caja] || 'bg-slate-100' },
        ].map((k, i) => (
          <div key={i} className={`border rounded-2xl p-5 ${k.color}`}>
            <p className="text-[10px] font-extrabold uppercase tracking-widest opacity-70 mb-1">{k.label}</p>
            <p className="text-xl font-black leading-none">{k.value}</p>
          </div>
        ))}
      </div>

      {valorTotal > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <p className="text-xs font-extrabold uppercase tracking-widest text-slate-500">Progreso de Cobro</p>
            <p className="text-sm font-black text-slate-700">{pctCobrado.toFixed(0)}%</p>
          </div>
          <div className="bg-slate-100 rounded-full h-3">
            <div className={`h-3 rounded-full transition-all duration-700 ${pctCobrado === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${pctCobrado}%` }} />
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] text-slate-400 font-bold">
            <span>$0</span><span>{fmt(valorTotal)}</span>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2"><CreditCard className="w-3.5 h-3.5" />Facturación Electrónica</h3>
        <div className="grid grid-cols-2 gap-4">
          <InfoRow label="Estado Facturación" value={<Badge className={odp.estado_facturacion === 'FACTURADA' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'}>{odp.estado_facturacion}</Badge>} />
          <InfoRow label="N° Factura Electrónica" value={odp.factura_electronica ? <span className="font-mono font-bold text-emerald-700">#{odp.factura_electronica}</span> : <span className="text-slate-400 text-xs italic">No emitida</span>} />
          <InfoRow label="Forma de Pago ODP" value={odp.forma_pago} />
          {odp.autorizacion_especial_despacho && <InfoRow label="Autorización Especial" value={<Badge className="bg-amber-100 text-amber-700 border-amber-200"><AlertCircle className="w-3 h-3" />Sí</Badge>} />}
        </div>
        {odp.url_documento_factura && (
          <a href={odp.url_documento_factura} target="_blank" rel="noopener noreferrer"
            className="mt-4 flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-800 transition">
            <ExternalLink className="w-4 h-4" /> Ver Documento de Factura
          </a>
        )}
      </div>
    </div>
  );
};

// ─── Datos de presentación por tipo de evento ─────────────────────────────────
const TIPO_VISUAL: Record<string, { icon: (cls: string) => React.ReactNode; dot: string; peso: 'alto' | 'medio' | 'bajo' }> = {
  ODP_CREADA:         { icon: (c) => <FileText className={c} />,     dot: 'bg-indigo-600',  peso: 'alto'  },
  ESTADO_CAMBIADO:    { icon: (c) => <History className={c} />,      dot: 'bg-slate-500',   peso: 'medio' },
  TM_SOLICITADA:      { icon: (c) => <Ruler className={c} />,        dot: 'bg-amber-500',   peso: 'bajo'  },
  TM_REALIZADA:       { icon: (c) => <CheckCircle2 className={c} />, dot: 'bg-amber-600',   peso: 'medio' },
  SAP_CREADA:         { icon: (c) => <Package className={c} />,      dot: 'bg-violet-500',  peso: 'bajo'  },
  COT_CREADA:         { icon: (c) => <DollarSign className={c} />,   dot: 'bg-blue-500',    peso: 'medio' },
  ODC_CREADA:         { icon: (c) => <Package className={c} />,      dot: 'bg-purple-500',  peso: 'bajo'  },
  ODC_RECIBIDA:       { icon: (c) => <CheckCircle2 className={c} />, dot: 'bg-green-500',   peso: 'medio' },
  PV_CREADO:          { icon: (c) => <Truck className={c} />,        dot: 'bg-sky-500',     peso: 'bajo'  },
  PV_LLEGADO:         { icon: (c) => <Truck className={c} />,        dot: 'bg-emerald-500', peso: 'medio' },
  PV_VERIFICADO:      { icon: (c) => <CheckCircle2 className={c} />, dot: 'bg-emerald-600', peso: 'bajo'  },
  PV_PROBLEMA:        { icon: (c) => <AlertTriangle className={c} />,dot: 'bg-orange-500',  peso: 'alto'  },
  PAGO_REGISTRADO:    { icon: (c) => <CreditCard className={c} />,   dot: 'bg-teal-500',    peso: 'alto'  },
  SA_GENERADA:        { icon: (c) => <Archive className={c} />,      dot: 'bg-teal-600',    peso: 'medio' },
  RUTA_PROGRAMADA:    { icon: (c) => <Calendar className={c} />,     dot: 'bg-orange-500',  peso: 'medio' },
  INSTALACION_INICIO: { icon: (c) => <Truck className={c} />,        dot: 'bg-emerald-500', peso: 'medio' },
  INSTALACION_FIN:    { icon: (c) => <CheckCircle2 className={c} />, dot: 'bg-green-600',   peso: 'alto'  },
  DANO_REPORTADO:     { icon: (c) => <AlertTriangle className={c} />,dot: 'bg-rose-500',    peso: 'alto'  },
  EVIDENCIA_SUBIDA:   { icon: (c) => <Camera className={c} />,       dot: 'bg-emerald-500', peso: 'bajo'  },
  NC_REPORTADA:       { icon: (c) => <AlertCircle className={c} />,  dot: 'bg-rose-600',    peso: 'alto'  },
  GARANTIA_CREADA:    { icon: (c) => <Shield className={c} />,       dot: 'bg-blue-500',    peso: 'alto'  },
  NOTA_PRODUCCION:    { icon: (c) => <MessageSquare className={c} />,dot: 'bg-slate-400',   peso: 'bajo'  },
};

const HIST_CATS: Record<string, { bg: string; text: string; border: string; dot: string; label: string; icon: React.ReactNode }> = {
  comercial:   { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200',  dot: 'bg-indigo-500',  label: 'Comercial',   icon: <DollarSign className="w-3 h-3" /> },
  produccion:  { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500',   label: 'Producción',  icon: <Wrench className="w-3 h-3" /> },
  instalacion: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500', label: 'Instalación', icon: <Truck className="w-3 h-3" /> },
  financiero:  { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200',    dot: 'bg-teal-500',    label: 'Financiero',  icon: <CreditCard className="w-3 h-3" /> },
  calidad:     { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    dot: 'bg-rose-500',    label: 'Calidad',     icon: <AlertTriangle className="w-3 h-3" /> },
  sistema:     { bg: 'bg-slate-50',   text: 'text-slate-600',   border: 'border-slate-200',   dot: 'bg-slate-400',   label: 'Sistema',     icon: <MessageSquare className="w-3 h-3" /> },
};

const ESTADO_HIST_COLOR: Record<string, string> = {
  EN_ESPERA: 'bg-slate-100 text-slate-600 border-slate-200',
  MEDICION: 'bg-sky-100 text-sky-700 border-sky-200',
  ALUMINIO_CORTADO: 'bg-blue-100 text-blue-700 border-blue-200',
  VIDRIO_RECIBIDO: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  ACCESORIOS_SEPARADOS: 'bg-teal-100 text-teal-700 border-teal-200',
  LISTO_INSTALAR: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  PROGRAMADA: 'bg-amber-100 text-amber-700 border-amber-200',
  INSTALADA: 'bg-green-100 text-green-700 border-green-200',
  ENTREGADA: 'bg-gray-100 text-gray-700 border-gray-200',
  PAUSADA: 'bg-rose-100 text-rose-700 border-rose-200',
};

const fmtHora   = (f: string) => f ? new Date(f).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '—';
const fmtTs     = (f: string) => f ? new Date(f).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDate   = (f: string) => f ? new Date(f.includes('T') ? f : f + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

const getDayKey = (f: string) => {
  const d = new Date(f);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
};

const fmtDayLabel = (iso: string) => {
  const d = new Date(iso);
  const hoy  = new Date(); hoy.setHours(0,0,0,0);
  const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1);
  if (d.getTime() === hoy.getTime())  return 'Hoy';
  if (d.getTime() === ayer.getTime()) return 'Ayer';
  return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

// ─── Panel de detalle expandible por tipo ─────────────────────────────────────
function renderHistDetalle(ev: any, onOpenLightbox?: (src: string) => void): React.ReactNode {
  const { tipo, meta } = ev;

  if (tipo === 'ESTADO_CAMBIADO') return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        {meta.estado_anterior && <>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${ESTADO_HIST_COLOR[meta.estado_anterior] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>{meta.estado_anterior.replace(/_/g, ' ')}</span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        </>}
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${ESTADO_HIST_COLOR[meta.estado_nuevo] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>{meta.estado_nuevo?.replace(/_/g, ' ')}</span>
      </div>
      {meta.observacion && <p className="text-xs text-slate-600 bg-white rounded-lg px-3 py-2 border border-slate-200 italic leading-relaxed">"{meta.observacion}"</p>}
    </div>
  );

  if (tipo === 'NC_REPORTADA') return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-xs">
        {[
          { l: 'Tipo de error',   v: meta.tipo_error?.replace(/_/g, ' ') },
          { l: 'Área',            v: meta.area_error },
          { l: 'Responsable',     v: meta.responsable },
          { l: 'Costo',           v: meta.costo_total > 0 ? <strong className="text-rose-600">{fmt(Number(meta.costo_total))}</strong> : null },
          { l: 'Estado NC',       v: meta.estado },
          { l: 'Reportó',         v: meta.usuario_reporta?.nombre_completo },
        ].filter(r => r.v).map(r => (
          <div key={r.l}>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{r.l}</p>
            <p className="font-semibold text-slate-700 mt-0.5">{r.v}</p>
          </div>
        ))}
      </div>
      {meta.causa       && <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Causa</p><p className="text-xs text-slate-600 bg-white rounded-lg px-3 py-2 border border-slate-200">{meta.causa}</p></div>}
      {meta.efecto      && <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Efecto</p><p className="text-xs text-slate-600 bg-white rounded-lg px-3 py-2 border border-slate-200">{meta.efecto}</p></div>}
      {meta.observaciones && <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Observaciones</p><p className="text-xs text-slate-600 bg-white rounded-lg px-3 py-2 border border-slate-200">{meta.observaciones}</p></div>}
      <div className="flex items-center gap-2 pt-0.5 flex-wrap">
        {[
          { label: 'Vo.Bo. Responsable', ok: meta.vo_bo_responsable },
          { label: 'Vo.Bo. Gerencia',    ok: meta.vo_bo_gerencia },
        ].map(vb => (
          <span key={vb.label} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${vb.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
            <CheckCircle2 className="w-3 h-3" />{vb.label}
          </span>
        ))}
        {meta.nueva_odp && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <ExternalLink className="w-3 h-3" />Reproceso: {meta.nueva_odp.numero_odp}
          </span>
        )}
      </div>
    </div>
  );

  if (tipo === 'NOTA_PRODUCCION') return (
    <p className="text-xs text-slate-700 bg-white rounded-lg px-3 py-2.5 border border-slate-200 leading-relaxed">{meta.texto}</p>
  );

  if (tipo === 'RUTA_PROGRAMADA') return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
      {meta.vehiculo  && <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Vehículo</p><p className="font-semibold text-slate-700 mt-0.5">{meta.vehiculo.tipo.toUpperCase()} · {meta.vehiculo.placa}</p></div>}
      {meta.conductor && <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Conductor</p><p className="font-semibold text-slate-700 mt-0.5">{meta.conductor.nombre_completo}</p></div>}
      {meta.oficial   && <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Oficial</p><p className="font-semibold text-slate-700 mt-0.5">{meta.oficial.nombre_completo}</p></div>}
      {(() => { const ayud = meta.instaladores?.filter((i: any) => i.id !== meta.oficial?.id); return ayud?.length > 0 ? <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Ayudantes</p><p className="font-semibold text-slate-700 mt-0.5">{ayud.map((i: any) => i.nombre_completo).join(', ')}</p></div> : null; })()}
    </div>
  );

  if (tipo === 'DANO_REPORTADO') return (
    <div className="flex gap-4">
      {meta.foto_url && (
        <div className="w-32 h-24 rounded-xl overflow-hidden border border-rose-200 flex-shrink-0 cursor-zoom-in bg-rose-50" onClick={() => onOpenLightbox?.(meta.foto_url)}>
          <img src={meta.foto_url} alt="Foto daño" className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
        </div>
      )}
      {meta.instaladores?.length > 0 && (
        <div className="text-xs">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Equipo</p>
          <div className="space-y-0.5">{meta.instaladores.map((ins: any) => <p key={ins.id} className="font-medium text-slate-700">{ins.nombre_completo}</p>)}</div>
        </div>
      )}
    </div>
  );

  if (tipo === 'PAGO_REGISTRADO') return (
    <div className="space-y-1 text-xs text-slate-600">
      {meta.registrador  && <p>Registró: <strong>{meta.registrador.nombre_completo}</strong></p>}
      {meta.observaciones && <p className="italic text-slate-400">"{meta.observaciones}"</p>}
    </div>
  );

  if (tipo === 'PV_PROBLEMA') return (
    <div className="space-y-1 text-xs text-slate-600">
      {meta.tipo_problema    && <p>Tipo: <strong>{meta.tipo_problema}</strong></p>}
      {meta.estado_reposicion && <p>Reposición: <strong>{meta.estado_reposicion}</strong></p>}
      {meta.observaciones    && <p className="italic text-slate-400">"{meta.observaciones}"</p>}
    </div>
  );

  return null;
}

// ─── Chips informativos inline ─────────────────────────────────────────────────
function renderHistChips(ev: any): React.ReactNode {
  const { tipo, meta } = ev;

  if (tipo === 'INSTALACION_FIN' && meta.datos_receptor)
    return <span className="text-xs text-slate-500">Recibió: <strong>{meta.datos_receptor}</strong></span>;

  if (tipo === 'PV_LLEGADO' && meta.dias_diferencia != null)
    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta.dias_diferencia > 0 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>{meta.dias_diferencia > 0 ? `${meta.dias_diferencia}d retraso` : 'A tiempo'}</span>;

  if (tipo === 'ODC_CREADA' || tipo === 'ODC_RECIBIDA')
    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta.tipo === 'vidrio' ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-violet-50 text-violet-700 border-violet-200'}`}><Tag className="w-2.5 h-2.5" />{meta.tipo === 'vidrio' ? 'Vidrio' : 'Perfilería'}</span>;

  if (tipo === 'SA_GENERADA' && meta.fecha_sa)
    return <span className="text-xs text-slate-500">Fecha SA: {fmtDate(meta.fecha_sa)}</span>;

  if (tipo === 'COT_CREADA' && meta.estado) {
    const c: Record<string, string> = { aprobada: 'bg-emerald-50 text-emerald-700 border-emerald-200', enviada: 'bg-blue-50 text-blue-700 border-blue-200', rechazada: 'bg-rose-50 text-rose-700 border-rose-200' };
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${c[meta.estado] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>{meta.estado}</span>;
  }

  if (tipo === 'GARANTIA_CREADA' && meta.estado_produccion)
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${ESTADO_HIST_COLOR[meta.estado_produccion] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>{meta.estado_produccion.replace(/_/g, ' ')}</span>;

  return null;
}

// ─── Strip de estadísticas ─────────────────────────────────────────────────────
function renderHistStats(eventos: any[]): React.ReactNode {
  const pagos   = eventos.filter(e => e.tipo === 'PAGO_REGISTRADO');
  const totalPagado = pagos.reduce((s, e) => s + Number(e.meta.monto || 0), 0);
  const alertas = eventos.filter(e => ['NC_REPORTADA', 'DANO_REPORTADO', 'PV_PROBLEMA'].includes(e.tipo)).length;
  const instFin = eventos.filter(e => e.tipo === 'INSTALACION_FIN').length;

  const stats = [
    { label: 'Total eventos',    value: eventos.length, color: 'text-slate-700', sub: '' },
    { label: 'Pagos recibidos',  value: pagos.length > 0 ? fmt(totalPagado) : '—', color: 'text-teal-700', sub: pagos.length > 0 ? `${pagos.length} registro${pagos.length > 1 ? 's' : ''}` : '' },
    { label: 'Instalaciones',    value: instFin > 0 ? `${instFin} completada${instFin > 1 ? 's' : ''}` : '—', color: 'text-emerald-700', sub: '' },
    { label: 'Alertas calidad',  value: alertas > 0 ? alertas : '—', color: alertas > 0 ? 'text-rose-600' : 'text-slate-400', sub: alertas > 0 ? 'NC / daños / PV' : '' },
  ];

  return (
    <div className="grid grid-cols-4 gap-3 mb-5">
      {stats.map(s => (
        <div key={s.label} className="bg-white rounded-xl border border-slate-100 px-4 py-3 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{s.label}</p>
          <p className={`text-lg font-black leading-tight ${s.color}`}>{s.value}</p>
          {s.sub && <p className="text-[10px] text-slate-400 mt-0.5">{s.sub}</p>}
        </div>
      ))}
    </div>
  );
}

// ─── Tab Historial principal ───────────────────────────────────────────────────
const TabHistorial: React.FC<{ odp: any; onOpenLightbox?: (src: string) => void }> = ({ odp, onOpenLightbox }) => {
  const [eventos, setEventos]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [filtros, setFiltros]   = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

  const fetchHistorial = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const token = sessionStorage.getItem('token');
      const { data } = await axios.get(`${API}/api/odp/${odp.id}/historial`, { headers: { Authorization: `Bearer ${token}` } });
      setEventos(data.eventos || []);
    } catch { setError('No se pudo cargar el historial'); }
    finally { setLoading(false); }
  }, [odp.id]);  // eslint-disable-line

  useEffect(() => { fetchHistorial(); }, [fetchHistorial]);

  const toggleFiltro  = (cat: string) => setFiltros(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  const toggleExpanded = (key: string) => setExpanded(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });

  const filtrados = filtros.length === 0 ? eventos : eventos.filter(e => filtros.includes(e.categoria));

  // Agrupar por día (los eventos ya vienen desc → invertir para agrupar asc y luego re-invertir)
  const byDay: [string, any[]][] = Object.entries(
    [...filtrados].reverse().reduce((acc: Record<string, any[]>, ev) => {
      const k = getDayKey(ev.fecha);
      if (!acc[k]) acc[k] = [];
      acc[k].push(ev);
      return acc;
    }, {})
  ).reverse(); // días más recientes primero

  // Tipos que pueden expandirse
  const EXPANDIBLES = new Set(['ESTADO_CAMBIADO', 'NC_REPORTADA', 'NOTA_PRODUCCION', 'DANO_REPORTADO', 'RUTA_PROGRAMADA', 'PAGO_REGISTRADO', 'PV_PROBLEMA']);
  const puedeExpandir = (ev: any, key: string) => {
    if (!EXPANDIBLES.has(ev.tipo)) return false;
    if (ev.tipo === 'ESTADO_CAMBIADO' && !ev.meta.estado_anterior && !ev.meta.observacion) return false;
    if (ev.tipo === 'PAGO_REGISTRADO' && !ev.meta.observaciones && !ev.meta.registrador) return false;
    if (ev.tipo === 'DANO_REPORTADO'  && !ev.meta.foto_url && !ev.meta.instaladores?.length) return false;
    return true;
  };

  // ── Skeleton ──
  if (loading) return (
    <div className="p-6">
      <div className="grid grid-cols-4 gap-3 mb-5">{Array.from({length:4}).map((_,i)=><div key={i} className="h-16 bg-white rounded-xl border border-slate-100 animate-pulse"/>)}</div>
      <div className="h-8 bg-slate-100 rounded-lg animate-pulse mb-4 w-48" />
      <div className="space-y-2">{Array.from({length:7}).map((_,i)=><div key={i} className="flex gap-3 pl-14"><div className="absolute left-[1.25rem] w-7 h-7 rounded-full bg-slate-200 animate-pulse"/><div className={`flex-1 h-${i%3===0?'16':i%3===1?'12':'10'} bg-white rounded-xl border border-slate-100 animate-pulse`}/></div>)}</div>
      <div className="flex justify-center mt-6"><Loader2 className="w-5 h-5 text-slate-300 animate-spin"/></div>
    </div>
  );

  // ── Error ──
  if (error) return (
    <div className="p-12 text-center text-slate-400">
      <AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-200"/>
      <p className="font-bold">{error}</p>
      <button onClick={fetchHistorial} className="mt-3 flex items-center gap-1.5 mx-auto text-xs text-indigo-600 hover:text-indigo-800 font-bold">
        <RefreshCw className="w-3.5 h-3.5"/> Reintentar
      </button>
    </div>
  );

  return (
    <div className="p-6">

      {/* ── Stats ── */}
      {eventos.length > 0 && renderHistStats(eventos)}

      {/* ── Filtros ── */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <button
          onClick={() => setFiltros([])}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${filtros.length === 0 ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
        >
          Todos <span className={`ml-1 text-[10px] ${filtros.length === 0 ? 'text-slate-300' : 'text-slate-400'}`}>{eventos.length}</span>
        </button>
        {Object.entries(HIST_CATS).map(([cat, cfg]) => {
          const count = eventos.filter(e => e.categoria === cat).length;
          if (count === 0) return null;
          const activo = filtros.includes(cat);
          return (
            <button key={cat} onClick={() => toggleFiltro(cat)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${activo ? `${cfg.bg} ${cfg.text} ${cfg.border}` : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'}`}>
              {cfg.icon}{cfg.label}
              <span className={`text-[10px] rounded-full min-w-[16px] text-center ${activo ? 'text-current opacity-70' : 'text-slate-400'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── Timeline ── */}
      {filtrados.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <History className="w-10 h-10 mx-auto mb-3 text-slate-200"/>
          <p className="font-bold">Sin eventos para esta categoría</p>
        </div>
      ) : (
        <div className="space-y-6">
          {byDay.map(([dayIso, dayEvs]) => (
            <div key={dayIso}>

              {/* ── Separador de día ── */}
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-shrink-0 bg-slate-800 text-white rounded-lg px-3 py-1 text-xs font-black tracking-wide capitalize">
                  {fmtDayLabel(dayIso)}
                </div>
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-[10px] text-slate-400 font-bold flex-shrink-0">{dayEvs.length} evento{dayEvs.length > 1 ? 's' : ''}</span>
              </div>

              {/* ── Eventos del día ── */}
              <div className="relative pl-10">
                {/* Línea vertical del día */}
                <div className="absolute left-[13px] top-0 bottom-0 w-px bg-slate-200" />

                <div className="space-y-1.5">
                  {dayEvs.map((ev, i) => {
                    const vis   = TIPO_VISUAL[ev.tipo] || { icon: (c: string) => <History className={c}/>, dot: 'bg-slate-400', peso: 'bajo' as const };
                    const cat   = HIST_CATS[ev.categoria] || HIST_CATS.sistema;
                    const evKey = `${dayIso}-${i}`;
                    const isExp = expanded.has(evKey);
                    const expandible = puedeExpandir(ev, evKey);

                    // Estilos según peso del evento
                    const esAlerta   = ['DANO_REPORTADO','NC_REPORTADA','PV_PROBLEMA'].includes(ev.tipo);
                    const esHito     = vis.peso === 'alto';
                    const dotSize    = esHito ? 'w-7 h-7' : 'w-5 h-5';
                    const dotOffset  = esHito ? '-left-[27px]' : '-left-[21px]';
                    const iconScale  = esHito ? 'w-3.5 h-3.5' : 'w-3 h-3';

                    return (
                      <motion.div key={evKey}
                        initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(i * 0.025, 0.3) }}
                        className="relative"
                      >
                        {/* Dot con ícono */}
                        <div className={`absolute top-2.5 ${dotOffset} ${dotSize} rounded-full ${vis.dot} flex items-center justify-center text-white shadow-sm z-10 ring-2 ring-white`}>
                          {vis.icon(iconScale)}
                        </div>

                        {/* Tarjeta del evento */}
                        <div
                          className={`
                            rounded-xl border transition-all overflow-hidden
                            ${esAlerta   ? 'border-rose-200 bg-rose-50/40 border-l-4 border-l-rose-400' : ''}
                            ${!esAlerta && esHito ? 'border-slate-200 bg-white shadow-sm' : ''}
                            ${!esAlerta && !esHito ? 'border-slate-100 bg-white hover:border-slate-200' : ''}
                            ${isExp ? 'shadow-md' : ''}
                            ${expandible ? 'cursor-pointer' : ''}
                          `}
                          onClick={() => expandible && toggleExpanded(evKey)}
                        >
                          {/* Fila principal */}
                          <div className={`flex items-start gap-3 ${esHito ? 'px-4 py-3' : 'px-4 py-2.5'}`}>

                            {/* Hora */}
                            <span className="text-[11px] font-mono text-slate-400 flex-shrink-0 mt-0.5 w-10 text-right">
                              {fmtHora(ev.fecha)}
                            </span>

                            {/* Contenido */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <p className={`font-bold leading-snug ${esHito ? 'text-sm text-slate-900' : 'text-xs text-slate-700'}`}>
                                  {ev.titulo}
                                </p>
                                {renderHistChips(ev)}
                              </div>
                              {ev.subtitulo && (
                                <p className="text-xs text-slate-500 mt-0.5 leading-snug">{ev.subtitulo}</p>
                              )}
                            </div>

                            {/* Actor + expand */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {ev.meta?.usuario?.nombre_completo && (
                                <span className="hidden md:inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5 font-medium">
                                  <User className="w-2.5 h-2.5" />
                                  {ev.meta.usuario.nombre_completo.split(' ')[0]}
                                </span>
                              )}
                              {ev.meta?.asesor?.nombre_completo && !ev.meta?.usuario?.nombre_completo && (
                                <span className="hidden md:inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5 font-medium">
                                  <User className="w-2.5 h-2.5" />
                                  {ev.meta.asesor.nombre_completo.split(' ')[0]}
                                </span>
                              )}
                              {expandible && (
                                <div className={`flex-shrink-0 transition-colors ${isExp ? cat.text : 'text-slate-300'}`}>
                                  {isExp ? <ChevronUp className="w-3.5 h-3.5"/> : <ChevronDown className="w-3.5 h-3.5"/>}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Panel expandido */}
                          <AnimatePresence>
                            {isExp && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.16 }}
                                className="overflow-hidden"
                              >
                                <div className={`px-4 pb-4 pt-1 border-t ${esAlerta ? 'border-rose-200 bg-rose-50/30' : 'border-slate-100 bg-slate-50/50'}`}>
                                  {renderHistDetalle(ev, onOpenLightbox)}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Centro de Impresión: Sistema de Formatos por Rol ──────────────────────────
const TabImprimir: React.FC<{ odp: any }> = ({ odp }) => {
  const tieneNC = (odp?.no_conformidades?.length || 0) > 0;
  const tieneGarantias = (odp?.garantias?.length || 0) > 0;
  const esGarantia = !!odp?.es_garantia;
  const esNC = !!odp?.es_no_conformidad;

  type FormatId = 'compra' | 'op' | 'tecnico' | 'det_sap' | 'garantia' | 'noconformidad' | 'sap';
  const [selectedFormat, setSelectedFormat] = useState<FormatId>(esNC ? 'noconformidad' : 'op');
  const [ncIndex, setNcIndex] = useState(0);
  const [garantiaIndex, setGarantiaIndex] = useState(0);
  const [detSapImagenes, setDetSapImagenes] = useState<any[]>([]);
  const [ncOrigenData, setNcOrigenData] = useState<any>(null);

  const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
  const token = sessionStorage.getItem('token');

  useEffect(() => {
    if (selectedFormat !== 'det_sap') return;
    axios.get(`${API}/api/detalle-sap-imagenes?odp_id=${odp.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => setDetSapImagenes(r.data)).catch(() => setDetSapImagenes([]));
  }, [selectedFormat, odp.id]);

  // Cuando la ODP es una NC hija, carga el registro NC del padre para el printable
  useEffect(() => {
    if (!esNC || !odp?.odp_padre_id) return;
    axios.get(`${API}/api/no-conformidad/odp/${odp.odp_padre_id}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => {
      const nc = (r.data as any[]).find((n: any) => n.nueva_odp_id === odp.id);
      if (nc) setNcOrigenData(nc);
    }).catch(() => {});
  }, [esNC, odp?.odp_padre_id, odp?.id]);

  const handlePrint = () => {
    const area = document.getElementById('printable-area');
    if (!area) return;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <title>Impresión ODP ${odp?.numero_odp || ''}</title>
      <script src="https://cdn.tailwindcss.com"><\/script>
      <style>
        @page { size: letter portrait; margin: 4mm; }
        body { margin: 0; padding: 0; font-family: sans-serif; }
        /* Tablas estilo Excel (otros formatos) */
        .excel-table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
        .excel-table th, .excel-table td { border: 1px solid #000; padding: 2px 4px; }
        .excel-table th { font-weight: bold; text-align: center; }
        /* Tablas SAP */
        .sap-table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
        .sap-table th, .sap-table td { border: 1px solid #000; padding: 2px 4px; }
        .sap-table th { font-weight: bold; text-align: center; background-color: #f0f0f0; }
        .thick-b { border-bottom: 2px solid #000 !important; }
        /* Páginas SAP */
        .sap-page { display: block; width: 21.5cm; min-height: 29cm; background: white; color: black; font-family: sans-serif; font-size: 14px; margin: 0 auto; overflow: hidden; page-break-after: always; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .sap-page:last-child { page-break-after: avoid; }
        .print-container { padding: 8px; }
        /* Colores inline para bg- clases de Tailwind que pueden no cargar a tiempo */
        .bg-blue-100 { background-color: #dbeafe !important; }
        .bg-slate-50 { background-color: #f8fafc !important; }
      </style>
    </head><body>${area.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 800);
  };


  return (
    <div className="flex flex-col bg-slate-100 min-h-screen">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 px-6 py-4 bg-white border-b border-slate-200 print:hidden shadow-sm">
        
        <div className="flex flex-wrap gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
          {odp?.tipo_odp !== 'OA' && (
            <button onClick={() => setSelectedFormat('compra')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition ${selectedFormat === 'compra' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
              <FileText className="w-3 h-3" /> Ord. Compra
            </button>
          )}
          <button onClick={() => setSelectedFormat('op')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition ${selectedFormat === 'op' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
            <Package className="w-3 h-3" /> OP
          </button>
          <button onClick={() => setSelectedFormat('tecnico')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition ${selectedFormat === 'tecnico' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
            <Ruler className="w-3 h-3" /> Det. Técnico
          </button>
          <button onClick={() => setSelectedFormat('det_sap')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition ${selectedFormat === 'det_sap' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
            <Images className="w-3 h-3" /> Det. SAP
          </button>
          {/* Garantía: visible si la ODP tiene garantías hijas O si esta ODP ES una garantía */}
          {(tieneGarantias || esGarantia) && (
            <button onClick={() => setSelectedFormat('garantia')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition ${selectedFormat === 'garantia' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
              <Shield className="w-3 h-3 text-blue-500" /> Garantía
              {tieneGarantias && <span className="text-[10px] bg-blue-500 text-white px-1.5 rounded-full">{odp.garantias.length}</span>}
            </button>
          )}
          {/* NC: visible si la ODP tiene NCs hijas O si esta ODP ES una NC */}
          {(tieneNC || esNC) && (
            <button onClick={() => setSelectedFormat('noconformidad')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition ${selectedFormat === 'noconformidad' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
              <AlertCircle className="w-3 h-3" /> No Conform.
              {tieneNC && <span className="text-[10px] bg-rose-500 text-white px-1.5 rounded-full">{odp.no_conformidades.length}</span>}
            </button>
          )}
          {/* SAP: visible solo si la ODP tiene al menos un SAP gestionado */}
          {odp?.saps?.length > 0 && (
            <button onClick={() => setSelectedFormat('sap')} className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition ${selectedFormat === 'sap' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
              <Package className="w-3 h-3" /> SAP
              <span className="text-[10px] bg-indigo-500 text-white px-1.5 rounded-full">{odp.saps.length}</span>
            </button>
          )}
        </div>

        {selectedFormat === 'noconformidad' && odp?.no_conformidades?.length > 1 && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1 px-3">
                <span className="text-[10px] font-black text-slate-400 uppercase">REPORTE:</span>
                <select className="bg-transparent text-xs font-bold outline-none" value={ncIndex} onChange={e => setNcIndex(parseInt(e.target.value))}>
                    {odp.no_conformidades.map((nc: any, idx: number) => (
                        <option key={idx} value={idx}>{nc.numero_reporte} - {new Date(nc.creado_en).toLocaleDateString()}</option>
                    ))}
                </select>
            </div>
        )}
        {selectedFormat === 'garantia' && tieneGarantias && odp?.garantias?.length > 1 && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1 px-3">
                <span className="text-[10px] font-black text-slate-400 uppercase">GARANTÍA:</span>
                <select className="bg-transparent text-xs font-bold outline-none" value={garantiaIndex} onChange={e => setGarantiaIndex(parseInt(e.target.value))}>
                    {odp.garantias.map((g: any, idx: number) => (
                        <option key={idx} value={idx}>{g.numero_garantia} - {new Date(g.fecha_creacion).toLocaleDateString()}</option>
                    ))}
                </select>
            </div>
        )}

        <button onClick={handlePrint} className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white font-black text-xs rounded-xl hover:bg-indigo-700 transition shadow-lg shadow-indigo-600/30">
          <Printer className="w-3 h-3" /> IMPRIMIR
        </button>
      </div>

      <div className="p-8 overflow-y-auto flex-1 flex flex-col items-center justify-start" id="printable-area">
        {selectedFormat === 'compra' && <PrintableTalonario odp={odp} />}
        {selectedFormat === 'op' && (odp?.tipo_odp === 'OA' ? <PrintableOA odp={odp} /> : <PrintableProduccion odp={odp} />)}
        {selectedFormat === 'tecnico' && <PrintableDetalleTecnico odp={odp} />}
        {selectedFormat === 'det_sap' && <PrintableDetSAP odp={odp} imagenes={detSapImagenes} />}
        {selectedFormat === 'garantia' && (
          esGarantia
            ? <PrintableGarantia garantia={odp} odp={odp.odp_padre} />
            : <PrintableGarantia garantia={odp.garantias?.[garantiaIndex]} odp={odp} />
        )}
        {selectedFormat === 'noconformidad' && (
          esNC && !tieneNC
            ? <PrintableNoConformidad odp={odp.odp_padre || odp} data={ncOrigenData} />
            : <PrintableNoConformidad odp={odp} data={odp?.no_conformidades?.[ncIndex]} />
        )}
        {selectedFormat === 'sap' && <PrintableSAP odp={odp} sap={odp?.saps?.[0]} />}
      </div>
    </div>
  );
};

// ─── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────
interface Props { odpId: number; onClose: () => void; initialTab?: string; }

const ODPFichaModal: React.FC<Props> = ({ odpId, onClose, initialTab = 'general' }) => {
  const [odp, setOdp] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [showReportarForm, setShowReportarForm] = useState(false);
  const [showGarantiaForm, setShowGarantiaForm] = useState(false);
  const [reportarMenuOpen, setReportarMenuOpen] = useState(false);
  const reportarMenuRef = useRef<HTMLDivElement>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const { lightboxSrc, openLightbox, closeLightbox } = useLightbox();

  const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
  const token = sessionStorage.getItem('token');

  // Obtener usuario actual para validar permisos
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('user');
      if (stored) setCurrentUser(JSON.parse(stored));
    } catch { /* ignorar */ }
  }, []);

  const fetchODP = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/api/odp/${odpId}`, { headers: { Authorization: `Bearer ${token}` } });
      setOdp(res.data);
    } catch (err) {
      console.error("Error al cargar ODP:", err);
      setOdp(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchODP();
  }, [odpId]);

  // Cerrar el menú "Reportar" al hacer click fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (reportarMenuRef.current && !reportarMenuRef.current.contains(e.target as Node)) {
        setReportarMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const tabs = [
    { id: 'general',     label: 'Datos Generales', icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'comercial',   label: 'Comercial',        icon: <DollarSign className="w-4 h-4" />,    badge: (odp?.saps?.length || 0) + (odp?.cotizaciones?.length || 0) },
    { id: 'produccion',  label: 'Producción',        icon: <Wrench className="w-4 h-4" />,         badge: odp?.tomas_medidas?.length || 0 },
    { id: 'instalacion', label: 'Instalación',       icon: <Truck className="w-4 h-4" />,          badge: (odp?.evidencias?.length || 0) + (odp?.ruta_odps?.length || 0) },
    { id: 'financiero',  label: 'Financiero',         icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'historial',   label: 'Historial',          icon: <History className="w-4 h-4" />,        badge: odp?.no_conformidades?.length || 0 },
    { id: 'imprimir',    label: 'Imprimir ODP',       icon: <Printer className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-[1400] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-3">
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[96vh] flex flex-col border border-slate-200 overflow-hidden relative">

        {/* MODAL REPORTAR NO CONFORMIDAD */}
        <AnimatePresence>
          {showReportarForm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-[70] bg-white flex items-center justify-center overflow-y-auto">
              <div className="w-full max-w-3xl">
                <ReportarProblemaForm odp={odp} onClose={() => setShowReportarForm(false)} onSuccess={fetchODP} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* MODAL CREAR GARANTÍA */}
        {showGarantiaForm && odp && (
          <GarantiaFormModal
            odp={odp}
            onClose={() => setShowGarantiaForm(false)}
            onCreada={() => { fetchODP(); setShowGarantiaForm(false); }}
          />
        )}

        {/* HEADER */}
        {loading ? (
          <div className="h-24 bg-white border-b border-slate-200 animate-pulse" />
        ) : odp && (
          <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
            {/* Banner visual: ODP de Reproceso */}
            {odp.es_no_conformidad && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mb-3 flex items-center gap-2 text-xs">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span className="font-black text-amber-700">ODP DE REPROCESO</span>
                <span className="text-amber-600">·</span>
                <span className="text-amber-600">Referencia: <strong>{odp.odp_padre?.numero_odp || `ODP Padre #${odp.odp_padre_id}`}</strong></span>
              </div>
            )}
            {/* Banner visual: ODP de Garantía */}
            {odp.es_garantia && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 mb-3 flex items-center gap-2 text-xs">
                <Shield className="w-3.5 h-3.5 text-blue-600" />
                <span className="font-black text-blue-700">ODP DE GARANTÍA</span>
                <span className="text-blue-400">·</span>
                <span className="text-blue-600">{odp.numero_garantia} · ODP Origen: <strong>{odp.odp_padre?.numero_odp || `#${odp.odp_padre_id}`}</strong></span>
              </div>
            )}
            {/* Banner: ODP Pausada por No Conformidad */}
            {odp.estado_produccion === 'PAUSADA' && (
              <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5 mb-3 flex items-center gap-2 text-xs">
                <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                <span className="font-black text-rose-700">ODP PAUSADA</span>
                <span className="text-rose-500">Esta ODP tiene un reporte de No Conformidad activo. Se marcará como completada al instalar la ODP de reproceso.</span>
              </div>
            )}
            <div className="flex justify-between items-start">
              <div className="flex items-start gap-4">
                <div className="hidden md:flex flex-col items-center gap-1 pt-1">
                  <div className={`w-3 h-3 rounded-full ${odp.estado_produccion === 'INSTALADA' || odp.estado_produccion === 'ENTREGADA' ? 'bg-emerald-500' : odp.estado_produccion === 'PAUSADA' ? 'bg-rose-500' : 'bg-amber-400'} animate-pulse`} />
                </div>
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {odp.es_no_conformidad && (
                      <span className="text-[10px] font-black bg-amber-500 text-white px-1.5 py-0.5 rounded">REPROCESO</span>
                    )}
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">{odp.numero_odp}</h1>
                    <Badge className={estadoProdColor[odp.estado_produccion] || 'bg-slate-100 text-slate-700 border-slate-200'}>
                      {odp.estado_produccion?.replace(/_/g, ' ')}
                    </Badge>
                    {!odp.es_garantia && (
                      <Badge className={cajaColor[odp.estado_caja] || 'bg-slate-100'}>
                        <CreditCard className="w-3 h-3" />{odp.estado_caja?.replace(/_/g, ' ')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 font-medium mt-1">
                    <span className="font-bold text-slate-700">{odp.cliente?.nombre_razon_social}</span>
                    {' · '}Asesor: {odp.asesor?.nombre_completo}
                    {' · '}Creado: {new Date(odp.fecha_creacion).toLocaleDateString('es-CO')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Botón Reportar: dueño de la ODP (cualquier rol), o admin/gerencia/produccion. Solo para ODPs normales (no garantía, no reproceso) */}
                {(() => {
                  if (!currentUser) return null;
                  const role = currentUser.rol;
                  const isOwner = currentUser.id === odp.asesor_id;
                  const canReport = ['admin', 'gerencia', 'produccion', 'jefe_produccion'].includes(role) || isOwner;
                  if (!canReport) return null;
                  // Para garantías y reprocesos: solo NC, sin opción de crear otra garantía
                  const esDerivada = odp.es_garantia || odp.es_no_conformidad;
                  if (esDerivada) {
                    return (
                      <button onClick={() => setShowReportarForm(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-rose-50 border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-100 transition print:hidden">
                        <AlertCircle className="w-3.5 h-3.5" /> REPORTAR NC
                      </button>
                    );
                  }
                  return (
                    <div className="relative print:hidden" ref={reportarMenuRef}>
                      <button
                        onClick={() => setReportarMenuOpen(v => !v)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-rose-50 border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-100 transition"
                      >
                        <AlertCircle className="w-3.5 h-3.5" /> REPORTAR PROBLEMA <ChevronDown className="w-3 h-3" />
                      </button>
                      <AnimatePresence>
                        {reportarMenuOpen && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -4 }}
                            transition={{ duration: 0.12 }}
                            className="absolute right-0 top-9 z-[80] bg-white border border-slate-200 rounded-xl shadow-xl w-52 overflow-hidden"
                          >
                            <button
                              onClick={() => { setShowReportarForm(true); setReportarMenuOpen(false); }}
                              className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition text-left border-b border-slate-100"
                            >
                              <AlertCircle className="w-4 h-4 text-rose-500" />
                              <div>
                                <p className="font-bold text-xs">No Conformidad</p>
                                <p className="text-[10px] text-slate-400">Crear ODP de reproceso</p>
                              </div>
                            </button>
                            <button
                              onClick={() => { setShowGarantiaForm(true); setReportarMenuOpen(false); }}
                              className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition text-left"
                            >
                              <Shield className="w-4 h-4 text-blue-500" />
                              <div>
                                <p className="font-bold text-xs">Garantía</p>
                                <p className="text-[10px] text-slate-400">Crear ODP de garantía</p>
                              </div>
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })()}
                <button onClick={() => setActiveTab('imprimir')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition print:hidden">
                  <Printer className="w-3.5 h-3.5" /> Imprimir
                </button>
                <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition flex-shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TABS */}
        <div className="bg-white border-b border-slate-200 flex overflow-x-auto flex-shrink-0 scrollbar-none">
          {tabs.map(tab => (
            <TabButton key={tab.id} active={activeTab === tab.id} icon={tab.icon} label={tab.label} badge={tab.badge} onClick={() => setActiveTab(tab.id)} />
          ))}
        </div>

        {/* CONTENIDO */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 bg-white rounded-xl border border-slate-100 animate-pulse" />
              ))}
            </div>
          ) : !odp ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8">
              <AlertCircle className="w-16 h-16 mb-4 text-slate-200" />
              <p className="font-bold text-lg">No se pudo cargar la ODP</p>
            </div>
          ) : (
            <>
              <AnimatePresence mode="wait">
                <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                  {activeTab === 'general'     && <TabDatosGenerales odp={odp} />}
                  {activeTab === 'comercial'   && odp && <TabComercial odp={odp} onRefresh={fetchODP} />}
                  {activeTab === 'produccion'  && <TabProduccion odp={odp} onUpdate={fetchODP} currentUser={currentUser} />}
                  {activeTab === 'instalacion' && <TabInstalacion odp={odp} onOpenLightbox={openLightbox} currentUser={currentUser} onRefresh={fetchODP} />}
                  {activeTab === 'financiero'  && <TabFinanciero odp={odp} />}
                  {activeTab === 'historial'   && <TabHistorial odp={odp} onOpenLightbox={openLightbox} />}
                  {activeTab === 'imprimir'    && <TabImprimir odp={odp} />}
                </motion.div>
              </AnimatePresence>
              <Lightbox src={lightboxSrc} onClose={closeLightbox} />
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default ODPFichaModal;
