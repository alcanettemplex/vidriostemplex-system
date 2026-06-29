import React, { useState, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X, FileText, Wrench, Truck, DollarSign, Package, Ruler, Plus,
  CheckCircle2, AlertCircle, AlertTriangle, MapPin, User, Calendar, Phone,
  Building2, ExternalLink, CreditCard, Camera, History, Shield, ChevronDown,
  ClipboardList, TrendingUp, Printer, PenTool, Images, Trash2,
  Sparkles, Film, Box, Archive, ChevronUp, Loader2, MessageSquare,
  ArrowRight, RefreshCw, Tag
} from 'lucide-react';
import { estadoProdColor, cajaColor, Badge } from './ODPFichaModal.utils';
import Lightbox, { useLightbox } from '../../../components/ui/Lightbox';
import ReportarProblemaForm from './ReportarProblemaForm';
import GarantiaFormModal from './GarantiaFormModal';
import TabDatosGenerales from './ODPTabDatosGenerales';
import TabComercial from './ODPTabComercial';
import TabProduccion from './ODPTabProduccion';
import TabInstalacion from './ODPTabInstalacion';
import TabFinanciero from './ODPTabFinanciero';
import TabHistorial from './ODPTabHistorial';
import TabImprimir from './ODPTabImprimir';
import { fetchODPById } from '../odpSlice';
import { RootState, AppDispatch } from '../../../store/store';

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

interface Props { odpId: number; onClose: () => void; initialTab?: string; }

const ODPFichaModal: React.FC<Props> = ({ odpId, onClose, initialTab = 'general' }) => {
  const [odp, setOdp] = useState<any | null>(null);
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [showReportarForm, setShowReportarForm] = useState(false);
  const [showGarantiaForm, setShowGarantiaForm] = useState(false);
  const [reportarMenuOpen, setReportarMenuOpen] = useState(false);
  const reportarMenuRef = useRef<HTMLDivElement>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const { lightboxSrc, openLightbox, closeLightbox } = useLightbox();

  const dispatch = useDispatch<AppDispatch>();
  const cachedOdp = useSelector((state: RootState) => state.odp.cache[odpId]);
  const loadingFromCache = useSelector((state: RootState) => state.odp.loading[odpId] ?? true);

  const loading = odp ? false : (loadingLocal && loadingFromCache);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('user');
      if (stored) setCurrentUser(JSON.parse(stored));
    } catch { /* ignorar */ }
  }, []);

  // Usar cache de Redux si está disponible, si no hacer fetch
  useEffect(() => {
    if (cachedOdp) {
      setOdp(cachedOdp);
      setLoadingLocal(false);
    } else {
      setLoadingLocal(true);
      dispatch(fetchODPById(odpId));
    }
  }, [odpId, cachedOdp, dispatch]);

  // Sincronizar cuando cambie la cache
  useEffect(() => {
    if (cachedOdp && !odp) {
      setOdp(cachedOdp);
      setLoadingLocal(false);
    }
  }, [cachedOdp, odp]);

  const fetchODP = () => {
    dispatch(fetchODPById(odpId));
  };

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

        {showGarantiaForm && odp && (
          <GarantiaFormModal
            odp={odp}
            onClose={() => setShowGarantiaForm(false)}
            onCreada={() => { fetchODP(); setShowGarantiaForm(false); }}
          />
        )}

        {loading ? (
          <div className="h-24 bg-white border-b border-slate-200 animate-pulse" />
        ) : odp && (
          <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
            {odp.es_no_conformidad && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mb-3 flex items-center gap-2 text-xs">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span className="font-black text-amber-700">ODP DE REPROCESO</span>
                <span className="text-amber-600">·</span>
                <span className="text-amber-600">Referencia: <strong>{odp.odp_padre?.numero_odp || `ODP Padre #${odp.odp_padre_id}`}</strong></span>
              </div>
            )}
            {odp.es_garantia && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 mb-3 flex items-center gap-2 text-xs">
                <Shield className="w-3.5 h-3.5 text-blue-600" />
                <span className="font-black text-blue-700">ODP DE GARANTÍA</span>
                <span className="text-blue-400">·</span>
                <span className="text-blue-600">{odp.numero_garantia} · ODP Origen: <strong>{odp.odp_padre?.numero_odp || `#${odp.odp_padre_id}`}</strong></span>
              </div>
            )}
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
                {(() => {
                  if (!currentUser) return null;
                  const role = currentUser.rol;
                  const isOwner = currentUser.id === odp.asesor_id;
                  const canReport = ['admin', 'gerencia', 'produccion', 'jefe_produccion'].includes(role) || isOwner;
                  if (!canReport) return null;
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

        <div className="bg-white border-b border-slate-200 flex overflow-x-auto flex-shrink-0 scrollbar-none">
          {tabs.map(tab => (
            <TabButton key={tab.id} active={activeTab === tab.id} icon={tab.icon} label={tab.label} badge={tab.badge} onClick={() => setActiveTab(tab.id)} />
          ))}
        </div>

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
