import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MapPin, Truck, Users, CheckCircle2, Clock, 
  ExternalLink, RefreshCw, Play, Navigation, 
  LogIn, Printer, FileText, LayoutDashboard, 
  History, Calendar, TrendingUp, Star, Award, 
  Target, Zap, Flag
} from 'lucide-react';
import PrintableOP from '../../odp/components/PrintableOP';
import PrintableOA from '../../odp/components/PrintableOA';
import PrintableDetalleTecnico from '../../odp/components/PrintableDetalleTecnico';
import PrintableSAP from '../../odp/components/PrintableSAP';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const ESTADO_STYLES: Record<string, string> = {
  programada: 'bg-indigo-100 text-indigo-700',
  en_curso:   'bg-amber-100 text-amber-700',
  completada: 'bg-emerald-100 text-emerald-700',
};

const ConductorView: React.FC = () => {
  const token = sessionStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const [rutas, setRutas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'hoy' | 'historial' | 'metricas'>('hoy');
  const [iniciando, setIniciando] = useState<number | null>(null);
  const [finalizando, setFinalizando] = useState<number | null>(null);
  const [registrandoLlegada, setRegistrandoLlegada] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/rutas/mi-ruta-conductor`, { headers });
      setRutas(Array.isArray(data) ? data : []);
    } catch (e: any) { 
      const msg = e.response?.data?.details || 'Error al cargar tus rutas';
      toast.error(msg); 
      setRutas([]);
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // ––– Cálculos de Métricas –––
  const metrics = useMemo(() => {
    const totalParadas = rutas.reduce((acc, r) => acc + (r.ruta_odps?.length || 0), 0);
    const paradasLlegadas = rutas.reduce((acc, r) => acc + (r.ruta_odps?.filter((s:any) => s.llegada_conductor).length || 0), 0);
    const efecCount = rutas.filter(r => r.estado === 'completada').length;

    const efectividad = totalParadas > 0 ? Math.round((paradasLlegadas / totalParadas) * 100) : 100;
    
    return {
      totalRutas: rutas.length,
      rutasTerminadas: efecCount,
      totalParadas,
      efectividad,
      rutasMes: rutas.filter(r => r.creado_en && new Date(r.creado_en).getMonth() === new Date().getMonth()).length,
      insignia: efectividad > 90 ? 'Master del Volante' : 'Conductor Profesional'
    };
  }, [rutas]);

  // ––– Handlers –––
  const handleIniciarRuta = async (rutaId: number) => {
    setIniciando(rutaId);
    try {
      await axios.post(`${API}/api/rutas/${rutaId}/iniciar-ruta`, {}, { headers });
      toast.success('Ruta iniciada. ¡Buen viaje!');
      cargar();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al iniciar ruta');
    } finally { setIniciando(null); }
  };

  const handleTerminarRuta = async (rutaId: number) => {
    setFinalizando(rutaId);
    try {
      await axios.post(`${API}/api/rutas/${rutaId}/terminar-ruta`, {}, { headers });
      toast.success('¡Ruta completada con éxito!');
      cargar();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al finalizar ruta');
    } finally { setFinalizando(null); }
  };

  const registrarLlegada = async (rutaODPId: number) => {
    setRegistrandoLlegada(rutaODPId);
    try {
      await axios.post(`${API}/api/rutas/ruta-odp/${rutaODPId}/llegada`, {}, { headers });
      toast.success('Llegada registrada exitosamente');
      cargar();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al registrar llegada');
    } finally { setRegistrandoLlegada(null); }
  };

  const abrirDocumento = (odp: any, tipo: 'op' | 'tecnico' | 'sap') => {
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
      <p className="text-slate-400 font-bold animate-pulse">Optimizando tu logística...</p>
    </div>
  );

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8 bg-slate-50/50 min-h-screen">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Truck className="w-8 h-8 text-indigo-600" />
            Centro de Despacho
          </h1>
          <p className="text-slate-500 font-medium">Gestión de rutas y seguimiento de entregas</p>
        </div>
        <button onClick={cargar} className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-2xl font-black text-xs text-slate-600 uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm">
           <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      {/* MÉTRICAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={Target} label="Finalizadas" value={`${metrics.rutasTerminadas}/${metrics.totalRutas}`} color="bg-indigo-50 text-indigo-600" />
        <MetricCard icon={TrendingUp} label="Efectividad" value={`${metrics.efectividad}%`} color="bg-emerald-50 text-emerald-600" />
        <MetricCard icon={Zap} label="Rutas Mes" value={metrics.rutasMes} color="bg-amber-50 text-amber-600" />
        <MetricCard icon={Award} label="Rango" value={metrics.insignia} color="bg-rose-50 text-rose-600" />
      </div>

      {/* TABS */}
      <div className="flex bg-white p-1.5 rounded-3xl border border-slate-200 shadow-sm w-full md:w-fit overflow-hidden">
        {[
          { id: 'hoy', label: 'Asignación Activa', icon: Zap },
          { id: 'historial', label: 'Rutas Realizadas', icon: History },
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
            <div className="grid grid-cols-1 gap-8">
              {rutas.filter(r => r.estado !== 'completada').length === 0 ? (
                <EmptyState icon={Calendar} title="Día Despejado" desc="No tienes rutas pendientes por iniciar o en curso." />
              ) : (
                rutas.filter(r => r.estado !== 'completada').map(ruta => (
                  <RutaCard 
                    key={ruta.id} 
                    ruta={ruta} 
                    onIniciar={handleIniciarRuta} 
                    onTerminar={handleTerminarRuta}
                    registrarLlegada={registrarLlegada} 
                    abrirDocumento={abrirDocumento} 
                    abrirMapa={abrirMapa}
                    loadingStatus={{ iniciando, finalizando, llegadas: registrandoLlegada }}
                  />
                ))
              )}
            </div>
          )}

          {activeTab === 'historial' && (
            <div className="grid grid-cols-1 gap-8">
               {rutas.filter(r => r.estado === 'completada').length === 0 ? (
                <EmptyState icon={History} title="Sin Historial" desc="Aún no has finalizado rutas en este periodo." />
              ) : (
                rutas.filter(r => r.estado === 'completada').map(ruta => (
                   <RutaCard key={ruta.id} ruta={ruta} isHistory />
                ))
              )}
            </div>
          )}

          {activeTab === 'metricas' && (
            <div className="bg-white p-12 rounded-[40px] border border-slate-100 shadow-xl flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6">
                 <Star className="w-10 h-10 text-indigo-600" />
              </div>
              <h3 className="text-2xl font-black text-slate-800 tracking-tight">Análisis Operativo</h3>
              <p className="text-slate-500 font-medium max-w-sm mx-auto mt-2">Mantenemos un registro de tu precisión en entregas y tiempos de ruta.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full mt-10">
                 <div className="p-8 bg-slate-50 rounded-[32px] border border-slate-100">
                    <p className="text-4xl font-black text-indigo-600 mb-1">{metrics.totalParadas}</p>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">Paradas Visitadas</p>
                 </div>
                 <div className="p-8 bg-slate-50 rounded-[32px] border border-slate-100">
                    <p className="text-4xl font-black text-emerald-600 mb-1">{metrics.efectividad}%</p>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">Precisión de Llegada</p>
                 </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

// ––– SUBCOMPONENTE: RUTA CARD –––
const RutaCard = ({ ruta, onIniciar, onTerminar, registrarLlegada, abrirDocumento, abrirMapa, loadingStatus, isHistory }: any) => {
  const enCurso = ruta.estado === 'en_curso';
  const completada = ruta.estado === 'completada';
  const stops = (ruta.ruta_odps || []).sort((a: any, b: any) => a.orden - b.orden);
  
  const todasParadasRegistradas = stops.length > 0 && stops.every((s: any) => !!s.llegada_conductor);

  return (
    <div className={`bg-white rounded-[40px] border-2 shadow-sm overflow-hidden transition-all duration-300
      ${enCurso ? 'border-amber-200' : completada ? 'border-emerald-100' : 'border-slate-100 hover:border-indigo-100'}`}>
      
      <div className={`p-6 border-b border-slate-100 flex flex-col md:flex-row gap-6 md:items-center justify-between
        ${enCurso ? 'bg-amber-50/20' : completada ? 'bg-emerald-50/10' : 'bg-slate-50/30'}`}>
        
        <div className="flex items-center gap-5">
           <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg
             ${enCurso ? 'bg-amber-500 text-white' : completada ? 'bg-emerald-500 text-white' : 'bg-indigo-600 text-white'}`}>
              <Truck className="w-7 h-7" />
           </div>
           <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-black text-slate-900 text-xl tracking-tight">Ruta #{ruta.id}</span>
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${ESTADO_STYLES[ruta.estado] || 'bg-slate-100 text-slate-600'}`}>
                  {ruta.estado}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] font-black uppercase tracking-widest text-slate-400">
                <span className="flex items-center gap-1 font-bold"><Users className="w-3.5 h-3.5" /> {ruta.instaladores?.length || 0} Pers.</span>
                <span className="flex items-center gap-1 font-bold"><Clock className="w-3.5 h-3.5" /> {stops.length} Paradas</span>
                {ruta.vehiculo && <span className="flex items-center gap-1 font-bold"><Flag className="w-3.5 h-3.5" /> {ruta.vehiculo.placa}</span>}
              </div>
           </div>
        </div>

        {!isHistory && !completada && (
          enCurso ? (
            <button onClick={() => onTerminar(ruta.id)} disabled={!todasParadasRegistradas || loadingStatus?.finalizando === ruta.id}
              className={`px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.1em] transition-all flex items-center gap-2
                ${todasParadasRegistradas 
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xl shadow-emerald-100' 
                  : 'bg-slate-100 text-slate-300 border border-slate-200 cursor-not-allowed'}`}>
              {loadingStatus?.finalizando === ruta.id ? 'Cerrando...' : <><MapPin className="w-4 h-4" /> Finalizar Ruta</>}
            </button>
          ) : (
            <button onClick={() => onIniciar(ruta.id)} disabled={loadingStatus?.iniciando === ruta.id}
              className="px-8 py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-700 disabled:opacity-60 text-xs uppercase tracking-widest shadow-xl shadow-indigo-100 active:scale-95 transition-all">
              {loadingStatus?.iniciando === ruta.id ? 'Iniciando...' : 'Comenzar Recorrido'}
            </button>
          )
        )}
      </div>

      <div className="p-6 md:p-8 space-y-6">
        {stops.length === 0 ? (
          <p className="text-center text-slate-400 py-4 font-bold text-sm italic">Esta ruta no tiene paradas asignadas todavía.</p>
        ) : (
          stops.map((stop: any, idx: number) => (
            <StopItem 
              key={stop.id} 
              stop={stop} 
              idx={idx} 
              registrarLlegada={registrarLlegada} 
              abrirDocumento={abrirDocumento} 
              abrirMapa={abrirMapa}
              enCurso={enCurso}
              loading={loadingStatus?.llegadas === stop.id}
            />
          ))
        )}
      </div>
    </div>
  );
};

const StopItem = ({ stop, idx, registrarLlegada, abrirDocumento, abrirMapa, enCurso, loading }: any) => {
  const isDone = !!stop.llegada_conductor;
  const odp = stop.odp;
  const sap = odp?.saps?.[0];

  return (
    <div className={`p-6 rounded-[32px] border transition-all duration-300 flex flex-col md:flex-row gap-6
      ${isDone ? 'bg-emerald-50/10 border-emerald-100' : 'bg-slate-50/30 border-slate-100'}`}>
      
      <div className="md:w-64 space-y-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-black shadow-sm
            ${isDone ? 'bg-emerald-500 text-white' : 'bg-white border-2 border-slate-200 text-slate-400'}`}>
            {isDone ? <CheckCircle2 className="w-5 h-5" /> : idx + 1}
          </div>
          <div>
             <p className="text-base font-black text-slate-800 tracking-tight">{odp?.numero_odp}</p>
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate max-w-[150px]">{odp?.cliente?.nombre_razon_social}</p>
          </div>
        </div>

        {odp?.direccion_instalacion && (
          <div onClick={() => abrirMapa(odp.direccion_instalacion)} className="bg-white p-3 rounded-2xl border border-slate-100 cursor-pointer hover:border-indigo-200 transition-colors">
            <p className="text-[10px] text-slate-400 font-black flex items-center gap-1 mb-1 uppercase"><MapPin className="w-3 h-3 text-rose-500" /> Dirección</p>
            <p className="text-xs font-bold text-slate-700 line-clamp-2">{odp.direccion_instalacion}</p>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col justify-between space-y-4">
        <div className="space-y-4">
           <p className="text-xs text-slate-500 font-medium italic border-l-4 border-indigo-200 pl-4 py-1 leading-relaxed">
             {odp?.descripcion_pedido || "Proceder con despacho estándar según requerimientos técnicos."}
           </p>
           <div className="flex flex-wrap gap-2">
             <DocBtn onClick={() => abrirDocumento(odp, 'op')} icon={Printer} label="ODP" />
             <DocBtn onClick={() => abrirDocumento(odp, 'tecnico')} icon={FileText} label="Técnico" />
             {sap && <DocBtn onClick={() => abrirDocumento(odp, 'sap')} icon={FileText} label="SAP" color="indigo" />}
           </div>
        </div>

        {enCurso && !isDone && (
          <button onClick={() => registrarLlegada(stop.id)} disabled={loading}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl shadow-lg shadow-emerald-50 transition-all flex items-center justify-center gap-2">
            {loading ? 'Confirmando...' : <><LogIn className="w-4 h-4" /> Registrar Llegada</>}
          </button>
        )}

        {isDone && (
          <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-2xl border border-emerald-100">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <div>
               <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">En Sitio Registrado</p>
               <p className="text-xs font-bold text-emerald-700">Llegada: {new Date(stop.llegada_conductor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          </div>
        )}
      </div>

      <div className="hidden">
        <div id={`print-op-${odp?.id}`}>{odp?.tipo_odp === 'OA' ? <PrintableOA odp={odp} /> : <PrintableOP odp={odp} />}</div>
        <div id={`print-tec-${odp?.id}`}><PrintableDetalleTecnico odp={odp} /></div>
        {sap && <div id={`print-sap-${odp?.id}`}><PrintableSAP odp={odp} sap={sap} /></div>}
      </div>
    </div>
  );
};

const DocBtn = ({ icon: Icon, label, onClick, color = 'slate' }: any) => (
  <button onClick={onClick} className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all
    ${color === 'indigo' ? 'border-indigo-100 text-indigo-600 bg-indigo-50 hover:bg-indigo-100' : 'border-slate-200 text-slate-500 bg-white hover:bg-slate-50' }`}>
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

export default ConductorView;
