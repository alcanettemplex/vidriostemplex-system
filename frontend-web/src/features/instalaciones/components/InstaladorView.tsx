import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, FileText, Play, CheckCircle2, Clock, Phone,
  AlertCircle, AlertTriangle, RefreshCw, Printer, ExternalLink,
  LayoutDashboard, History, Calendar, TrendingUp,
  Award, Target, Zap, ShieldCheck, Camera, PauseCircle
} from 'lucide-react';
import ReportarEntregaModal from './ReportarEntregaModal';
import ReportarDanoModal from './ReportarDanoModal';
import PrintableOP from '../../odp/components/PrintableOP';
import PrintableOA from '../../odp/components/PrintableOA';
import PrintableDetalleTecnico from '../../odp/components/PrintableDetalleTecnico';
import PrintableSAP from '../../odp/components/PrintableSAP';
import PrintableDetSAP from '../../odp/components/PrintableDetSAP';
import { Images } from 'lucide-react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const InstaladorView: React.FC = () => {
  const token = sessionStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };
  const currentUser = useSelector((state: any) => state.auth.user);

  const [asignacion, setAsignacion] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'hoy' | 'historial' | 'metricas'>('hoy');
  const [iniciando, setIniciando] = useState<number | null>(null);
  const [pausando, setPausando] = useState<number | null>(null);
  const [finalizando, setFinalizando] = useState<{ rutaODPId: number; numeroODP: string } | null>(null);
  const [reportandoDano, setReportandoDano] = useState<{ rutaODPId: number; numeroODP: string } | null>(null);
  const [pauseModal, setPauseModal] = useState<{ rutaODPId: number } | null>(null);
  const [pauseMotivo, setPauseMotivo] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/rutas/mi-asignacion`, { headers });
      setAsignacion(data);
    } catch { toast.error('Error al cargar asignación'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // ––– Cálculos de Métricas –––
  const metrics = useMemo(() => {
    const total = asignacion.length;
    const terminadas = asignacion.filter(a => a.estado === 'completada').length;
    const hoyCount = asignacion.filter(a => {
        const d = new Date(a.fecha_programada || a.creado_en);
        return d.toDateString() === new Date().toDateString();
    }).length;
    
    const efectividad = total > 0 ? Math.round((terminadas / total) * 100) : 100;

    return {
      total,
      terminadas,
      hoyCount,
      efectividad,
      insignia: efectividad > 85 ? 'Instalador Élite' : 'Profesional'
    };
  }, [asignacion]);

  // ––– Handlers –––
  const handleIniciar = async (rutaODPId: number) => {
    setIniciando(rutaODPId);
    try {
      await axios.post(`${API}/api/rutas/ruta-odp/${rutaODPId}/iniciar`, {}, { headers });
      toast.success('¡Instalación iniciada! Registra tus progresos.');
      cargar();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al iniciar');
    } finally { setIniciando(null); }
  };

  const abrirDocumento = async (odp: any, tipo: 'op' | 'tecnico' | 'sap' | 'det_sap') => {
    if (tipo === 'det_sap') {
      // Fetch imagenes y renderiza en nueva ventana
      try {
        const { data } = await axios.get(`${API}/api/detalle-sap-imagenes?odp_id=${odp.id}`, { headers });
        const el = document.getElementById(`print-det-sap-${odp.id}`);
        if (!el) { toast.error('Documento Det. SAP no disponible'); return; }
        const win = window.open('', '_blank', 'width=950,height=800');
        if (!win) return;
        win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Det. SAP ${odp.numero_odp}</title><script src="https://cdn.tailwindcss.com"><\/script><style>@page{size:letter portrait;margin:4mm}body{margin:0;padding:0;font-family:sans-serif}.excel-table{width:100%;border-collapse:collapse;border:2px solid #000}.excel-table th,.excel-table td{border:1px solid #000;padding:2px 4px}.excel-table th{font-weight:bold;text-align:center}</style></head><body>${el.innerHTML}</body></html>`);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); win.close(); }, 800);
      } catch { toast.error('Error al cargar Det. SAP'); }
      return;
    }
    const win = window.open('', '_blank', 'width=950,height=800');
    if (!win) return;
    let contenidoId = tipo === 'op' ? `print-op-${odp.id}` : tipo === 'tecnico' ? `print-tec-${odp.id}` : `print-sap-${odp.id}`;
    const el = document.getElementById(contenidoId);
    if (!el) return toast.error('Documento no disponible');
    win.document.write(`<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body>${el.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 600);
  };

  const handlePausar = (rutaODPId: number) => {
    setPauseMotivo('');
    setPauseModal({ rutaODPId });
  };

  const handleConfirmarPausa = async () => {
    if (!pauseModal) return;
    if (!pauseMotivo.trim()) { toast.error('Ingresa el motivo de la pausa'); return; }
    setPausando(pauseModal.rutaODPId);
    try {
      await axios.post(`${API}/api/rutas/ruta-odp/${pauseModal.rutaODPId}/pausar`,
        { motivo_pausa: pauseMotivo.trim() },
        { headers }
      );
      toast.success('Instalación pausada. La ODP quedó disponible para continuar mañana.');
      setPauseModal(null);
      cargar();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al pausar');
    } finally { setPausando(null); }
  };

  const abrirMapa = (direccion: string) => window.open(`https://maps.google.com/maps?q=${encodeURIComponent(direccion)}`, '_blank');

  // ––– Componentes Dinámicos –––
  const MetricCard = ({ icon: Icon, label, value, color }: any) => (
    <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
      <div className={`p-3 rounded-2xl ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
        <p className="text-xl font-black text-slate-800 tracking-tight">{value}</p>
      </div>
    </div>
  );

  if (loading) return (
    <div className="flex flex-col justify-center items-center h-[50vh] space-y-4">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent shadow-xl" />
      <p className="text-slate-400 font-bold animate-pulse">Cargando tablero de trabajo...</p>
    </div>
  );

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8 bg-slate-50/50 min-h-screen">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-indigo-600" />
            Centro de Instalación
          </h1>
          <p className="text-slate-500 font-medium">{metrics.hoyCount} tareas programadas para el periodo</p>
        </div>
        <button onClick={cargar} className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-2xl font-black text-xs text-slate-600 uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm">
           <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      {/* MÉTRICAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={Target} label="Completado" value={`${metrics.terminadas}/${metrics.total}`} color="bg-indigo-50 text-indigo-600" />
        <MetricCard icon={TrendingUp} label="Efectividad" value={`${metrics.efectividad}%`} color="bg-emerald-50 text-emerald-600" />
        <MetricCard icon={Zap} label="Pendientes" value={metrics.total - metrics.terminadas} color="bg-amber-50 text-amber-600" />
        <MetricCard icon={Award} label="Rango" value={metrics.insignia} color="bg-rose-50 text-rose-600" />
      </div>

      {/* TABS */}
      <div className="flex bg-white p-1.5 rounded-3xl border border-slate-200 shadow-sm w-full md:w-fit overflow-hidden">
        {[
          { id: 'hoy', label: 'Asignación Activa', icon: Calendar },
          { id: 'historial', label: 'Historial Trabajos', icon: History },
          { id: 'metricas', label: 'Mi Rendimiento', icon: LayoutDashboard }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2.5 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all
              ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-400 hover:text-slate-700'}`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* CONTENIDO */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.2 }}
          className="space-y-6"
        >
          {activeTab === 'hoy' && (
            <div className="grid grid-cols-1 gap-6">
              {asignacion.filter(a => a.estado !== 'completada').length === 0 ? (
                <EmptyState icon={ShieldCheck} title="Misión Cumplida" desc="No tienes tareas pendientes por instalar ahora." />
              ) : (
                asignacion.filter(a => a.estado !== 'completada').map(item => (
                  <TaskCard
                    key={item.id}
                    item={item}
                    onIniciar={handleIniciar}
                    onFinalizar={() => setFinalizando({ rutaODPId: item.id, numeroODP: item.odp.numero_odp })}
                    onReportarDano={() => setReportandoDano({ rutaODPId: item.id, numeroODP: item.odp.numero_odp })}
                    onPausar={handlePausar}
                    abrirDoc={abrirDocumento}
                    abrirMapa={abrirMapa}
                    iniciando={iniciando === item.id}
                    pausando={pausando === item.id}
                    currentUserId={currentUser?.id}
                  />
                ))
              )}
            </div>
          )}

          {activeTab === 'historial' && (
            <div className="grid grid-cols-1 gap-6">
               {asignacion.filter(a => a.estado === 'completada').length === 0 ? (
                <EmptyState icon={History} title="Sin registro" desc="Aún no hay instalaciones completadas en tu historial reciente." />
              ) : (
                asignacion.filter(a => a.estado === 'completada').map(item => (
                   <TaskCard key={item.id} item={item} isHistory currentUserId={currentUser?.id} />
                ))
              )}
            </div>
          )}

          {activeTab === 'metricas' && (
            <div className="bg-white p-12 rounded-[40px] border border-slate-100 shadow-xl flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-6">
                 <ShieldCheck className="w-10 h-10 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-black text-slate-800 tracking-tight">Estadísticas de Calidad</h3>
              <p className="text-slate-500 font-medium max-w-sm mx-auto mt-2">Medimos tu precisión técnica y cumplimiento de tiempos de instalación.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full mt-10">
                 <div className="p-8 bg-slate-50 rounded-[32px] border border-slate-100">
                    <p className="text-4xl font-black text-indigo-600 mb-1">{metrics.terminadas}</p>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">Instalaciones Exitosas</p>
                 </div>
                 <div className="p-8 bg-slate-50 rounded-[32px] border border-slate-100">
                    <p className="text-4xl font-black text-emerald-600 mb-1">100%</p>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">Garantía de Calidad</p>
                 </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* MODAL FINALIZAR */}
      {finalizando && (
        <ReportarEntregaModal
          rutaODPId={finalizando.rutaODPId}
          numeroODP={finalizando.numeroODP}
          onClose={() => setFinalizando(null)}
          onCompletado={() => { setFinalizando(null); cargar(); }}
        />
      )}

      {/* MODAL REPORTAR DAÑO */}
      {reportandoDano && (
        <ReportarDanoModal
          rutaODPId={reportandoDano.rutaODPId}
          numeroODP={reportandoDano.numeroODP}
          onClose={() => setReportandoDano(null)}
          onReportado={() => { setReportandoDano(null); cargar(); }}
        />
      )}

      {/* MODAL MOTIVO PAUSA */}
      {pauseModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-violet-100 rounded-2xl flex items-center justify-center">
                <PauseCircle className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <h3 className="font-black text-slate-800 text-base">Pausar instalación</h3>
                <p className="text-xs text-slate-400 font-medium">La ODP volverá a "Listo para instalar"</p>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Motivo de la pausa *</label>
              <textarea
                rows={3}
                value={pauseMotivo}
                onChange={e => setPauseMotivo(e.target.value)}
                placeholder="Ej. El cliente no estaba en el sitio, faltó material..."
                className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPauseModal(null)}
                className="flex-1 py-3 bg-slate-100 text-slate-600 font-black text-xs rounded-2xl hover:bg-slate-200 transition">
                Cancelar
              </button>
              <button onClick={handleConfirmarPausa} disabled={!!pausando}
                className="flex-1 py-3 bg-violet-600 text-white font-black text-xs rounded-2xl hover:bg-violet-700 transition shadow-lg shadow-violet-100 disabled:opacity-40">
                {pausando ? 'Pausando...' : 'Confirmar pausa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ––– SUBCOMPONENTE: TASK CARD –––
const TaskCard = ({ item, onIniciar, onFinalizar, onReportarDano, onPausar, abrirDoc, abrirMapa, iniciando, pausando, isHistory, currentUserId }: any) => {
  const odp = item.odp;
  const enCurso = item.estado === 'en_curso';
  const completada = item.estado === 'completada';
  const sap = odp?.saps?.[0];
  const esOficial = item.ruta?.oficial?.id === currentUserId;

  const telefono = odp?.telefono_recibe || odp?.cliente?.celular || odp?.cliente?.telefono;

  return (
    <div className={`bg-white rounded-[40px] border-2 shadow-sm overflow-hidden transition-all duration-300
      ${enCurso ? 'border-amber-200' : completada ? 'border-emerald-100' : 'border-slate-100 hover:border-indigo-100'}`}>

      {/* HEADER */}
      <div className={`p-6 border-b border-slate-100 ${enCurso ? 'bg-amber-50/20' : completada ? 'bg-emerald-50/10' : 'bg-slate-50/30'}`}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg
              ${enCurso ? 'bg-amber-500 text-white shadow-lg shadow-amber-100' : completada ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
              {item.orden}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-black text-slate-900 text-xl tracking-tight">{odp?.numero_odp}</h3>
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter
                  ${enCurso ? 'bg-amber-100 text-amber-700' : completada ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {item.estado}
                </span>
                {esOficial && (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-700 uppercase tracking-tighter">
                    Oficial
                  </span>
                )}
              </div>
              <p className="text-sm font-bold text-slate-700 mt-0.5">{odp?.cliente?.nombre_razon_social}</p>
            </div>
          </div>
          {/* Solo el oficial puede iniciar el trabajo */}
          {!isHistory && !completada && !enCurso && esOficial && (
            <button onClick={() => onIniciar(item.id)} disabled={iniciando}
              className="px-8 py-3 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-indigo-100 active:scale-95 transition-all">
              {iniciando ? 'Iniciando...' : 'Iniciar Trabajo'}
            </button>
          )}
        </div>
      </div>

      {/* BODY */}
      <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Columna izquierda: ubicación + contacto + vehículo */}
        <div className="md:col-span-4 space-y-3">
          {odp?.direccion_instalacion && (
            <div onClick={() => abrirMapa?.(odp.direccion_instalacion)}
              className="bg-slate-50 p-4 rounded-3xl border border-slate-100 cursor-pointer hover:border-indigo-200 transition-all">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-1">
                <MapPin className="w-3 h-3 text-rose-500" /> Dirección
              </p>
              <p className="text-xs font-bold text-slate-700 leading-relaxed">{odp.direccion_instalacion}</p>
            </div>
          )}
          {telefono && (
            <a href={`tel:${telefono}`}
              className="flex items-center gap-3 px-4 py-3 bg-emerald-50/50 rounded-2xl border border-emerald-100 hover:bg-emerald-50 transition-all">
              <Phone className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
              <div>
                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                  {odp?.nombre_recibe || odp?.cliente?.nombre_razon_social}
                </p>
                <p className="text-xs font-bold text-emerald-700">{telefono}</p>
              </div>
            </a>
          )}
          {item.ruta?.vehiculo && (
            <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50/30 rounded-2xl text-[11px] font-black text-indigo-700 uppercase tracking-widest">
              <Truck className="w-4 h-4" /> Placa {item.ruta.vehiculo.placa}
            </div>
          )}
        </div>

        {/* Columna derecha: descripción + documentos + acciones */}
        <div className="md:col-span-8 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            {odp?.descripcion_pedido && (
              <p className="text-sm text-slate-500 font-medium leading-relaxed italic bg-blue-50/30 p-4 rounded-3xl border border-blue-50">
                {odp.descripcion_pedido}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <DocBtn icon={Printer} label="ODP" onClick={() => abrirDoc(odp, 'op')} />
              <DocBtn icon={FileText} label="Ficha Técnica" onClick={() => abrirDoc(odp, 'tecnico')} />
              {sap && <DocBtn icon={ShieldCheck} label="SAP" color="indigo" onClick={() => abrirDoc(odp, 'sap')} />}
              <DocBtn icon={Images} label="Det. SAP" color="violet" onClick={() => abrirDoc(odp, 'det_sap')} />
            </div>
          </div>

          {/* Acciones en curso — solo oficial */}
          {enCurso && esOficial && (
            <div className="flex flex-col gap-2">
              <button onClick={onFinalizar}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-emerald-50 transition-all flex items-center justify-center gap-3">
                <Camera className="w-4 h-4" /> Reportar y Finalizar
              </button>
              <button onClick={onReportarDano}
                className="w-full py-3 bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-200 font-black text-xs uppercase tracking-[0.15em] rounded-2xl transition-all flex items-center justify-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Instalación con Daño
              </button>
              <button onClick={() => onPausar(item.id)} disabled={pausando}
                className="w-full py-3 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 font-black text-xs uppercase tracking-[0.15em] rounded-2xl transition-all flex items-center justify-center gap-2 disabled:opacity-40">
                <PauseCircle className="w-4 h-4" /> {pausando ? 'Pausando...' : 'Pausar Instalación'}
              </button>
            </div>
          )}

          {completada && (
            <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-3xl border border-emerald-100">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <div>
                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">TRABAJO COMPLETADO</p>
                <p className="text-xs font-bold text-emerald-700">{new Date(item.fin_instalacion).toLocaleString()}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="hidden">
        <div id={`print-op-${odp?.id}`}>{odp?.tipo_odp === 'OA' ? <PrintableOA odp={odp} /> : <PrintableOP odp={odp} />}</div>
        <div id={`print-tec-${odp?.id}`}><PrintableDetalleTecnico odp={odp} /></div>
        {sap && <div id={`print-sap-${odp?.id}`}><PrintableSAP odp={odp} sap={sap} /></div>}
        <div id={`print-det-sap-${odp?.id}`}><PrintableDetSAP odp={odp} imagenes={[]} /></div>
      </div>
    </div>
  );
};

const DocBtn = ({ icon: Icon, label, onClick, color = 'slate' }: any) => (
  <button onClick={onClick} className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all
    ${color === 'indigo' ? 'border-indigo-100 text-indigo-600 bg-indigo-50 hover:bg-indigo-100' :
      color === 'violet' ? 'border-violet-100 text-violet-600 bg-violet-50 hover:bg-violet-100' :
      'border-slate-200 text-slate-500 bg-white hover:bg-slate-50' }`}>
    <Icon className="w-3.5 h-3.5" /> {label}
  </button>
);

const EmptyState = ({ icon: Icon, title, desc }: any) => (
  <div className="bg-white rounded-[40px] border border-slate-200 p-20 text-center">
    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
      <Icon className="w-10 h-10 text-slate-300" />
    </div>
    <h3 className="text-xl font-black text-slate-700 tracking-tight">{title}</h3>
    <p className="text-sm text-slate-400 font-medium max-w-xs mx-auto mt-2">{desc}</p>
  </div>
);

const Truck = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
  </svg>
);

export default InstaladorView;
