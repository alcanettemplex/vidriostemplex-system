import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { 
  TrendingUp, 
  Wallet, 
  Wrench, 
  AlertTriangle, 
  Percent,
  AlertCircle,
  PackageX,
  Clock,
  Briefcase,
  PlaySquare,
  BarChart3,
  CalendarDays,
  Users
} from 'lucide-react';
import KPICard from './KPICard';

const DashboardHome: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/dashboard`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setData(res.data);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
        // Fallback data simulada para propósitos de UI Gerencial
        setData({
          // 5 Critical Numbers
          ventas_mes: "$1,245,600.00",
          en_produccion: 87,
          pedidos_atrasados: 12,
          flujo_caja: "$450,200.00",
          margen_promedio: "34.5%",
          
          // Alertas
          alertas_inventario: [
            { item: "Vidrio Templado 6mm Claro", stock: "15 m²", status: "Crítico" },
            { item: "Herraje Bisagra M-M Negra", stock: "4 und", status: "Crítico" },
            { item: "Vidrio Laminado 4+4", stock: "28 m²", status: "Bajo" }
          ],
          alertas_atrasos: [
            { odp: "ODP-1042", cliente: "Constructora Apex", dias: 4 },
            { odp: "ODP-1055", cliente: "Hotel Marina", dias: 2 },
            { odp: "ODP-1058", cliente: "Residencial Los Pinos", dias: 1 }
          ],
          alertas_cartera: [
            { cliente: "Fachadas Modernas", monto: "$12,500", dias_vencido: 45 },
            { cliente: "Edificio Central", monto: "$8,200", dias_vencido: 30 }
          ],

          // Actividad Reciente
          actividad: [
            { tipo: 'nueva_venta', texto: 'ODP-1089 aprobada por Asesor Carlos', tiempo: 'hace 10 min' },
            { tipo: 'produccion', texto: 'ODP-1060 pasó a estado Templado', tiempo: 'hace 45 min' },
            { tipo: 'alerta', texto: 'Máquina canteadora detenida (Mantenimiento)', tiempo: 'hace 2 horas' },
            { tipo: 'entrega', texto: 'ODP-1050 entregada exitosamente', tiempo: 'hace 3 horas' }
          ]
        });
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="h-8 w-64 bg-slate-200 rounded animate-pulse mb-8"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-32 bg-slate-200 rounded-2xl animate-pulse"></div>)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* HEADER PRINCIPAL */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Panel de Control Gerencial</h1>
          <p className="text-slate-500 font-medium mt-1">Indicadores clave de negocio y alertas operativas en tiempo real.</p>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition-all flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            Este Mes
          </button>
        </div>
      </div>

      {/* FILA 1: 5 NÚMEROS CRÍTICOS (RESUMEN) */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KPICard
          title="Ventas del Mes"
          value={data?.ventas_mes}
          icon={<TrendingUp className="w-6 h-6" />}
          trend="15%" trendUp={true}
          colorClass="text-emerald-700 bg-emerald-100"
          delay={0.1}
        />
        <KPICard
          title="Flujo de Caja"
          value={data?.flujo_caja}
          icon={<Wallet className="w-6 h-6" />}
          trend="8%" trendUp={true}
          colorClass="text-blue-700 bg-blue-100"
          delay={0.2}
        />
        <KPICard
          title="Margen Promedio"
          value={data?.margen_promedio}
          icon={<Percent className="w-6 h-6" />}
          trend="2.1%" trendUp={true}
          colorClass="text-indigo-700 bg-indigo-100"
          delay={0.3}
        />
        <KPICard
          title="En Producción"
          value={data?.en_produccion}
          icon={<Wrench className="w-6 h-6" />}
          trend="5%" trendUp={false}
          colorClass="text-amber-700 bg-amber-100"
          delay={0.4}
        />
        <KPICard
          title="Atrasados"
          value={data?.pedidos_atrasados}
          icon={<AlertTriangle className="w-6 h-6" />}
          trend="3" trendUp={false}
          colorClass="text-rose-700 bg-rose-100"
          delay={0.5}
        />
      </div>

      {/* FILA 2: GRÁFICOS Y ESTADO GENERAL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* GRAFICO VENTAS */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-2 glass-panel p-6 border border-slate-200 shadow-sm rounded-2xl bg-white"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-500" />
              Rendimiento de Ventas y Producción (Mensual)
            </h2>
          </div>
          <div className="h-72 w-full bg-slate-50/50 rounded-xl flex items-end justify-between px-4 pt-10 pb-4 gap-3 relative">
             {/* Simulación Gráfico de Barras */}
             {[45, 60, 55, 80, 75, 95, 85, 100, 90].map((h, i) => (
                <div key={i} className="w-full flex justify-center group h-full items-end">
                  <div 
                    className="w-full max-w-[40px] bg-gradient-to-t from-indigo-500 to-blue-400 rounded-t-md transition-all group-hover:opacity-80 relative" 
                    style={{ height: `${h}%` }}
                  >
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-slate-800 text-white text-xs py-1 px-2 rounded transition-opacity">
                      {h}k
                    </div>
                  </div>
                </div>
              ))}
              <div className="absolute bottom-2 w-full flex justify-between px-6 text-xs text-slate-400 font-medium">
                <span>Sem 1</span><span>Sem 2</span><span>Sem 3</span><span>Sem 4</span>
              </div>
          </div>
        </motion.div>

        {/* FEED ACTIVIDAD (Semáforo de estado general oculto aquí como listado rápido) */}
        <motion.div
           initial={{ opacity: 0, scale: 0.95 }}
           animate={{ opacity: 1, scale: 1 }}
           transition={{ delay: 0.4 }}
           className="glass-panel p-6 border border-slate-200 shadow-sm rounded-2xl bg-white flex flex-col"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <PlaySquare className="w-5 h-5 text-emerald-500" />
              Resumen en Vivo
            </h2>
          </div>
          
          <div className="space-y-4 overflow-y-auto pr-2 flex-grow">
            {data?.actividad?.map((act: any, idx: number) => (
               <div key={idx} className="flex items-start gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                  <div className={`mt-1 p-2 rounded-full 
                    ${act.tipo === 'nueva_venta' ? 'bg-emerald-100 text-emerald-600' :
                      act.tipo === 'produccion' ? 'bg-blue-100 text-blue-600' :
                      act.tipo === 'entrega' ? 'bg-indigo-100 text-indigo-600' :
                      'bg-rose-100 text-rose-600'}
                  `}>
                    {act.tipo === 'nueva_venta' ? <Wallet className="w-4 h-4"/> : 
                     act.tipo === 'alerta' ? <AlertCircle className="w-4 h-4"/> : <Wrench className="w-4 h-4" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{act.texto}</p>
                    <p className="text-xs font-medium text-slate-400 mt-0.5">{act.tiempo}</p>
                  </div>
               </div>
            ))}
          </div>

          <button className="w-full mt-4 py-2 text-sm font-semibold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors">
            Ver Todo el Historial
          </button>
        </motion.div>
      </div>

      {/* FILA 3: ALERTAS (3 COLUMNAS) */}
      <h2 className="text-2xl font-bold text-slate-800 mt-10 mb-4 flex items-center gap-2">
        <AlertTriangle className="w-6 h-6 text-rose-500" />
        Alertas Críticas
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* INVENTARIO */}
        <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ delay: 0.5 }}
           className="glass-panel border-t-4 border-t-amber-400 p-5 bg-white shadow-sm rounded-b-xl"
        >
          <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
            <PackageX className="w-5 h-5 text-amber-500" />
            Control de Inventario
          </h3>
          <div className="space-y-3">
            {data?.alertas_inventario?.map((item: any, i: number) => (
              <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-sm font-semibold text-slate-700">{item.item}</p>
                  <p className="text-xs text-amber-600 font-bold mt-1">Stock: {item.stock}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-bold ${item.status === 'Crítico' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* PRODUCCION ATRASADA */}
        <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ delay: 0.6 }}
           className="glass-panel border-t-4 border-t-rose-500 p-5 bg-white shadow-sm rounded-b-xl"
        >
          <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-rose-500" />
            Retrasos en Producción
          </h3>
          <div className="space-y-3">
            {data?.alertas_atrasos?.map((item: any, i: number) => (
              <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-sm font-bold text-slate-700">{item.odp}</p>
                  <p className="text-xs text-slate-500 font-medium mt-1">{item.cliente}</p>
                </div>
                <div className="text-right">
                  <span className="text-rose-600 font-bold text-sm block">+{item.dias} días</span>
                  <span className="text-xs text-slate-400">atraso</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* CARTERA / FINANZAS */}
        <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ delay: 0.7 }}
           className="glass-panel border-t-4 border-t-blue-500 p-5 bg-white shadow-sm rounded-b-xl"
        >
          <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
            <Briefcase className="w-5 h-5 text-blue-500" />
            Cuentas por Cobrar (Riesgo)
          </h3>
          <div className="space-y-3">
            {data?.alertas_cartera?.map((item: any, i: number) => (
              <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border-l-2 border-slate-300">
                <div>
                  <p className="text-sm font-semibold text-slate-700 truncate max-w-[140px]">{item.cliente}</p>
                  <p className="text-xs text-rose-500 font-bold mt-1">Vencido: {item.dias_vencido} días</p>
                </div>
                <div className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded text-sm font-bold">
                  {item.monto}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

    </div>
  );
};

export default DashboardHome;
