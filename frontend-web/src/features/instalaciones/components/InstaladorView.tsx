import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, FileText, CheckCircle2, Phone,
  AlertTriangle, RefreshCw, Printer, LayoutDashboard, History, Calendar, TrendingUp,
  Award, Target, Zap, ShieldCheck, Camera, PauseCircle, Search
} from '../../../components/ui/icons';
import ReportarEntregaModal from './ReportarEntregaModal';
import ReportarDanoModal from './ReportarDanoModal';
import PrintableProduccion from '../../odp/components/PrintableProduccion';
import PrintableOA from '../../odp/components/PrintableOA';
import PrintableDetalleTecnico from '../../odp/components/PrintableDetalleTecnico';
import PrintableSAP from '../../odp/components/PrintableSAP';
import PrintableDetSAP from '../../odp/components/PrintableDetSAP';
import { abrirDocumento as abrirDocumentoPrint } from '../utils/printDocument';
import { abrirVentanaImpresion } from '../../../utils/printWindow';
import { Images } from '../../../components/ui/icons';
import { useDataChangedSocket } from '../../../store/useSocketNotifications';

import API from '../../../services/config';

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
  const [busqueda, setBusqueda] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/rutas/mi-asignacion`, { headers });
      setAsignacion(data);
    } catch { toast.error('Error al cargar asignación'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Refresca la asignación si Compras marca/revierte existencia, elimina o edita una ODC —
  // el imprimible de la SAP mostrado aquí debe reflejarlo sin recargar la pantalla.
  useDataChangedSocket('compras', cargar);

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

  const abrirDocumentoConDetSap = async (odp: any, tipo: 'op' | 'tecnico' | 'sap' | 'det_sap') => {
    if (tipo === 'det_sap') {
      try {
        const el = document.getElementById(`print-det-sap-${odp.id}`);
        if (!el) { toast.error('Documento Det. SAP no disponible'); return; }
        abrirVentanaImpresion({
          titulo: `Det. SAP ${odp.numero_odp}`,
          contenidoHtml: el.innerHTML,
          ancho: 950,
          alto: 800,
          estilos: `
            @page { size: letter portrait; margin: 4mm; }
            body { font-family: sans-serif; }
            .excel-table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
            .excel-table th, .excel-table td { border: 1px solid #000; padding: 2px 4px; }
            .excel-table th { font-weight: bold; text-align: center; }
          `,
        });
      } catch { toast.error('Error al abrir Det. SAP'); }
      return;
    }
    abrirDocumentoPrint(odp, tipo);
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
    <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-card flex flex-col sm:flex-row items-start sm:items-center gap-2.5 sm:gap-4">
      <div className={`p-2.5 sm:p-3 rounded-xl ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-900">{label}</p>
        <p className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-tight">{value}</p>
      </div>
    </div>
  );

  if (loading) return (
    <div className="flex flex-col justify-center items-center h-[50vh] space-y-4">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent shadow-xl" />
      <p className="text-slate-800 font-medium animate-pulse">Cargando tablero de trabajo...</p>
    </div>
  );

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8 bg-slate-50/50 min-h-screen">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-indigo-600" />
            Centro de Instalación
          </h1>
          <p className="text-slate-800">{metrics.hoyCount} tareas programadas para el periodo</p>
        </div>
        <button onClick={cargar} className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-300 rounded-xl font-semibold text-sm text-slate-900 hover:bg-slate-50 transition-all shadow-card">
           <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      {/* MÉTRICAS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard icon={Target} label="Completado" value={`${metrics.terminadas}/${metrics.total}`} color="bg-indigo-50 text-indigo-600" />
        <MetricCard icon={TrendingUp} label="Efectividad" value={`${metrics.efectividad}%`} color="bg-emerald-50 text-emerald-600" />
        <MetricCard icon={Zap} label="Pendientes" value={metrics.total - metrics.terminadas} color="bg-amber-50 text-amber-600" />
        <MetricCard icon={Award} label="Rango" value={metrics.insignia} color="bg-rose-50 text-rose-600" />
      </div>

      {/* Buscador (visible en tabs de trabajo) */}
      {activeTab !== 'metricas' && (
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por N° ODP o nombre de cliente..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-11 pr-4 py-3 text-base sm:text-sm text-slate-900 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder-slate-500 shadow-card"
          />
        </div>
      )}

      {/* TABS */}
      <div className="flex gap-1 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-card w-full md:w-fit">
        {[
          { id: 'hoy', label: 'Asignación Activa', icon: Calendar },
          { id: 'historial', label: 'Historial Trabajos', icon: History },
          { id: 'metricas', label: 'Mi Rendimiento', icon: LayoutDashboard }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-2 sm:px-5 py-3 rounded-xl text-xs sm:text-sm font-semibold text-center leading-tight transition-all
              ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-800 hover:text-slate-900 hover:bg-slate-50'}`}
          >
            <tab.icon className="w-4 h-4 flex-shrink-0 hidden sm:block" />
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
              {(() => {
                const q = busqueda.toLowerCase().trim();
                const items = asignacion
                  .filter(a => a.estado !== 'completada')
                  .filter(a => !q ||
                    a.odp?.numero_odp?.toLowerCase().includes(q) ||
                    a.odp?.cliente?.nombre_razon_social?.toLowerCase().includes(q)
                  );
                return items.length === 0 ? (
                <EmptyState icon={ShieldCheck} title={q ? 'Sin resultados' : 'Misión Cumplida'} desc={q ? 'Ninguna tarea coincide con la búsqueda.' : 'No tienes tareas pendientes por instalar ahora.'} />
              ) : (
                items.map(item => (
                  <TaskCard
                    key={item.id}
                    item={item}
                    onIniciar={handleIniciar}
                    onFinalizar={() => setFinalizando({ rutaODPId: item.id, numeroODP: item.odp.numero_odp })}
                    onReportarDano={() => setReportandoDano({ rutaODPId: item.id, numeroODP: item.odp.numero_odp })}
                    onPausar={handlePausar}
                    abrirDoc={abrirDocumentoConDetSap}
                    abrirMapa={abrirMapa}
                    iniciando={iniciando === item.id}
                    pausando={pausando === item.id}
                    currentUserId={currentUser?.id}
                  />
                ))
              );
              })()}
            </div>
          )}

          {activeTab === 'historial' && (
            <div className="grid grid-cols-1 gap-6">
              {(() => {
                const q = busqueda.toLowerCase().trim();
                const items = asignacion
                  .filter(a => a.estado === 'completada')
                  .filter(a => !q ||
                    a.odp?.numero_odp?.toLowerCase().includes(q) ||
                    a.odp?.cliente?.nombre_razon_social?.toLowerCase().includes(q)
                  );
                return items.length === 0 ? (
                  <EmptyState icon={History} title={q ? 'Sin resultados' : 'Sin registro'} desc={q ? 'Ninguna instalación coincide con la búsqueda.' : 'Aún no hay instalaciones completadas en tu historial reciente.'} />
                ) : (
                  items.map(item => (
                    <TaskCard key={item.id} item={item} isHistory currentUserId={currentUser?.id} />
                  ))
                );
              })()}
            </div>
          )}

          {activeTab === 'metricas' && (
            <div className="bg-white p-6 sm:p-12 rounded-3xl border border-slate-200 shadow-card flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-6">
                 <ShieldCheck weight="duotone" className="w-10 h-10 text-emerald-700" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Estadísticas de Calidad</h3>
              <p className="text-slate-800 max-w-sm mx-auto mt-2">Medimos tu precisión técnica y cumplimiento de tiempos de instalación.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 w-full mt-8 sm:mt-10">
                 <div className="p-6 sm:p-8 bg-slate-50 rounded-2xl border border-slate-200">
                    <p className="text-4xl font-extrabold text-indigo-700 mb-1">{metrics.terminadas}</p>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-900">Instalaciones Exitosas</p>
                 </div>
                 <div className="p-6 sm:p-8 bg-slate-50 rounded-2xl border border-slate-200">
                    <p className="text-4xl font-extrabold text-emerald-700 mb-1">100%</p>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-900">Garantía de Calidad</p>
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
                <h3 className="font-bold text-slate-900 text-base">Pausar instalación</h3>
                <p className="text-xs text-slate-700">La ODP volverá a "Listo para instalar"</p>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-900 mb-1.5">Motivo de la pausa *</label>
              <textarea
                rows={3}
                value={pauseMotivo}
                onChange={e => setPauseMotivo(e.target.value)}
                placeholder="Ej. El cliente no estaba en el sitio, faltó material..."
                className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base sm:text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPauseModal(null)}
                className="flex-1 py-3.5 bg-slate-100 text-slate-900 font-semibold text-sm rounded-xl hover:bg-slate-200 transition">
                Cancelar
              </button>
              <button onClick={handleConfirmarPausa} disabled={!!pausando}
                className="flex-1 py-3.5 bg-violet-600 text-white font-semibold text-sm rounded-xl hover:bg-violet-700 transition shadow-lg shadow-violet-100 disabled:opacity-40">
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
    <div className={`bg-white rounded-3xl border-2 shadow-card overflow-hidden transition-all duration-300
      ${enCurso ? 'border-amber-300' : completada ? 'border-emerald-200' : 'border-slate-200 hover:border-indigo-200'}`}>

      {/* HEADER */}
      <div className={`p-4 sm:p-6 border-b border-slate-200 ${enCurso ? 'bg-amber-50/60' : completada ? 'bg-emerald-50/50' : 'bg-slate-50'}`}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className={`w-12 h-12 flex-shrink-0 rounded-2xl flex items-center justify-center font-extrabold text-lg
              ${enCurso ? 'bg-amber-500 text-white shadow-lg shadow-amber-100' : completada ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-900'}`}>
              {item.orden}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-slate-900 text-xl tracking-tight">{odp?.numero_odp}</h3>
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide
                  ${enCurso ? 'bg-amber-100 text-amber-800' : completada ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-800'}`}>
                  {item.estado}
                </span>
                {esOficial && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-100 text-indigo-800 uppercase tracking-wide">
                    Oficial
                  </span>
                )}
              </div>
              <p className="text-base font-semibold text-slate-900 mt-0.5">{odp?.cliente?.nombre_razon_social}</p>
            </div>
          </div>
          {/* Solo el oficial puede iniciar el trabajo */}
          {!isHistory && !completada && !enCurso && esOficial && (
            <button onClick={() => onIniciar(item.id)} disabled={iniciando}
              className="w-full md:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm uppercase tracking-wide rounded-2xl shadow-xl shadow-indigo-100 active:scale-95 transition-all">
              {iniciando ? 'Iniciando...' : 'Iniciar Trabajo'}
            </button>
          )}
        </div>
      </div>

      {/* BODY */}
      <div className="p-4 sm:p-6 md:p-8 grid grid-cols-1 md:grid-cols-12 gap-5 sm:gap-6">
        {/* Columna izquierda: ubicación + contacto + vehículo */}
        <div className="md:col-span-4 space-y-3">
          {odp?.direccion_instalacion && (
            <div onClick={() => abrirMapa?.(odp.direccion_instalacion)}
              className="bg-slate-50 p-4 rounded-2xl border border-slate-200 cursor-pointer hover:border-indigo-300 transition-all">
              <p className="text-[11px] font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-2 mb-1">
                <MapPin className="w-3.5 h-3.5 text-rose-600" /> Dirección
              </p>
              <p className="text-sm text-slate-900 leading-relaxed">{odp.direccion_instalacion}</p>
            </div>
          )}
          {telefono && (
            <a href={`tel:${telefono}`}
              className="flex items-center gap-3 px-4 py-3 bg-emerald-50 rounded-2xl border border-emerald-200 hover:bg-emerald-100 transition-all">
              <Phone className="w-4 h-4 text-emerald-700 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">
                  {odp?.nombre_recibe || odp?.cliente?.nombre_razon_social}
                </p>
                <p className="text-base font-bold text-emerald-900">{telefono}</p>
              </div>
            </a>
          )}
          {item.ruta?.vehiculo && (
            <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-2xl text-xs font-semibold text-indigo-800 uppercase tracking-wider">
              <Truck className="w-4 h-4" /> Placa {item.ruta.vehiculo.placa}
            </div>
          )}
        </div>

        {/* Columna derecha: descripción + documentos + acciones */}
        <div className="md:col-span-8 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            {odp?.descripcion_pedido && (
              <p className="text-sm text-slate-800 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-200">
                {odp.descripcion_pedido}
              </p>
            )}
            {!isHistory && (
            <div className="flex flex-wrap gap-2">
              <DocBtn icon={Printer} label="ODP" onClick={() => abrirDoc(odp, 'op')} />
              <DocBtn icon={FileText} label="Ficha Técnica" onClick={() => abrirDoc(odp, 'tecnico')} />
              {sap && <DocBtn icon={ShieldCheck} label="SAP" color="indigo" onClick={() => abrirDoc(odp, 'sap')} />}
              <DocBtn icon={Images} label="Det. SAP" color="violet" onClick={() => abrirDoc(odp, 'det_sap')} />
            </div>
            )}
          </div>

          {/* Acciones en curso — solo oficial */}
          {enCurso && esOficial && (
            <div className="flex flex-col gap-2">
              <button onClick={onFinalizar}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm uppercase tracking-wide rounded-2xl shadow-xl shadow-emerald-50 transition-all flex items-center justify-center gap-3">
                <Camera className="w-5 h-5" /> Reportar y Finalizar
              </button>
              <button onClick={onReportarDano}
                className="w-full py-3.5 bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-300 font-semibold text-sm uppercase tracking-wide rounded-2xl transition-all flex items-center justify-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Instalación con Daño
              </button>
              <button onClick={() => onPausar(item.id)} disabled={pausando}
                className="w-full py-3.5 bg-slate-50 hover:bg-slate-100 text-slate-900 border border-slate-300 font-semibold text-sm uppercase tracking-wide rounded-2xl transition-all flex items-center justify-center gap-2 disabled:opacity-40">
                <PauseCircle className="w-4 h-4" /> {pausando ? 'Pausando...' : 'Pausar Instalación'}
              </button>
            </div>
          )}

          {completada && (
            <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-2xl border border-emerald-200">
              <CheckCircle2 className="w-5 h-5 text-emerald-700" />
              <div>
                <p className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">TRABAJO COMPLETADO</p>
                <p className="text-sm text-emerald-900">{new Date(item.fin_instalacion).toLocaleString()}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="hidden">
        {/* Mismo componente que la ficha ODP: antes usaba PrintableOP, que
            mostraba VALOR, SUBTOTAL/IVA/TOTAL y FORMA DE PAGO al instalador. */}
        <div id={`print-op-${odp?.id}`}>{odp?.tipo_odp === 'OA' ? <PrintableOA odp={odp} /> : <PrintableProduccion odp={odp} />}</div>
        <div id={`print-tec-${odp?.id}`}><PrintableDetalleTecnico odp={odp} /></div>
        {sap && <div id={`print-sap-${odp?.id}`}><PrintableSAP odp={odp} sap={sap} /></div>}
        <div id={`print-det-sap-${odp?.id}`}><PrintableDetSAP odp={odp} imagenes={[]} /></div>
      </div>
    </div>
  );
};

const DocBtn = ({ icon: Icon, label, onClick, color = 'slate' }: any) => (
  <button onClick={onClick} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-semibold uppercase tracking-wide transition-all
    ${color === 'indigo' ? 'border-indigo-200 text-indigo-800 bg-indigo-50 hover:bg-indigo-100' :
      color === 'violet' ? 'border-violet-200 text-violet-800 bg-violet-50 hover:bg-violet-100' :
      'border-slate-300 text-slate-900 bg-white hover:bg-slate-50' }`}>
    <Icon className="w-4 h-4" /> {label}
  </button>
);

const EmptyState = ({ icon: Icon, title, desc }: any) => (
  <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-10 sm:p-20 text-center">
    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
      <Icon weight="duotone" className="w-10 h-10 text-slate-500" />
    </div>
    <h3 className="text-xl font-bold text-slate-900 tracking-tight">{title}</h3>
    <p className="text-sm text-slate-800 max-w-xs mx-auto mt-2">{desc}</p>
  </div>
);

const Truck = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
  </svg>
);

export default InstaladorView;
