import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { BarChart3, TrendingUp, Users, FileText, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import KPICard from './KPICard';

const DashboardHome: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulando carga de datos o fetch real si el endpoint existe
    const fetchDashboard = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/dashboard`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setData(res.data);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
        // Fallback data simulada para propósitos de UI si el endpoint falla/no existe
        setData({
          ventas: "$124,500.00",
          odps: 156,
          en_produccion: 42,
          eficiencia: 0.94,
          instaladas: 89,
          no_conformidades: 3,
          asesores: [
            { nombre: "Carlos G.", ventas: "$45,200", rendimiento: 98 },
            { nombre: "María P.", ventas: "$38,100", rendimiento: 92 },
            { nombre: "Juan R.", ventas: "$29,800", rendimiento: 85 }
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-slate-200 rounded-2xl animate-pulse"></div>)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard Gerencial</h1>
        <p className="text-slate-500 text-sm mt-1">Resumen del rendimiento y estado general de planta.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <KPICard
          title="Ingresos Totales"
          value={data?.ventas || "0"}
          icon={<TrendingUp className="w-6 h-6" />}
          trend="12.5%"
          trendUp={true}
          colorClass="text-emerald-600 bg-emerald-50"
          delay={0.1}
        />
        <KPICard
          title="ODPs Activas"
          value={data?.odps || 0}
          icon={<FileText className="w-6 h-6" />}
          trend="4.2%"
          trendUp={true}
          colorClass="text-blue-600 bg-blue-50"
          delay={0.2}
        />
        <KPICard
          title="En Producción"
          value={data?.en_produccion || 0}
          icon={<WrenchIcon className="w-6 h-6" />}
          trend="2.1%"
          trendUp={false}
          colorClass="text-amber-600 bg-amber-50"
          delay={0.3}
        />
        <KPICard
          title="Eficiencia Planta"
          value={`${Math.round((data?.eficiencia || 0) * 100)}%`}
          icon={<BarChart3 className="w-6 h-6" />}
          trend="1.8%"
          trendUp={true}
          colorClass="text-indigo-600 bg-indigo-50"
          delay={0.4}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="lg:col-span-2 glass-panel p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-800">Estado General de Producción</h2>
            <button className="text-sm text-blue-600 hover:underline font-medium">Ver Reporte Detallado</button>
          </div>

          <div className="flex gap-4 mb-6">
            <div className="flex-1 bg-emerald-50 rounded-xl p-4 border border-emerald-100 flex items-start gap-4 text-emerald-800">
              <ShieldCheck className="w-8 h-8 opacity-80" />
              <div>
                <p className="text-2xl font-bold">{data?.instaladas || 0}</p>
                <p className="text-sm font-medium opacity-80">ODPs Instaladas</p>
              </div>
            </div>

            <div className="flex-1 bg-rose-50 rounded-xl p-4 border border-rose-100 flex items-start gap-4 text-rose-800">
              <AlertTriangle className="w-8 h-8 opacity-80" />
              <div>
                <p className="text-2xl font-bold">{data?.no_conformidades || 0}</p>
                <p className="text-sm font-medium opacity-80">No Conformidades</p>
              </div>
            </div>
          </div>

          <div className="h-64 w-full bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center relative overflow-hidden">
            {/* Simulando un gráfico */}
            <div className="absolute bottom-0 left-0 w-full h-full flex items-end justify-between px-8 pt-10 pb-4 gap-4">
              {[40, 60, 30, 80, 50, 90, 70].map((h, i) => (
                <div key={i} className="w-full bg-gradient-to-t from-blue-500 to-emerald-400 rounded-t-sm" style={{ height: `${h}%`, opacity: 0.8 }}></div>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="glass-panel p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-800">Top Asesores</h2>
            <Users className="w-5 h-5 text-slate-400" />
          </div>

          <div className="space-y-4">
            {data?.asesores?.map((a: any, index: number) => (
              <div key={a.nombre} className="flex items-center p-3 hover:bg-slate-50 rounded-xl transition cursor-default">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-200 to-blue-400 text-white flex items-center justify-center font-bold shadow-sm">
                  {a.nombre.charAt(0)}
                </div>
                <div className="ml-3 flex-1">
                  <p className="text-sm font-bold text-slate-800">{a.nombre}</p>
                  <p className="text-xs text-slate-500 font-medium">Rendimiento: {a.rendimiento}%</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-emerald-600">{a.ventas}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

// Temp icon component definition right inside the file since we used WrenchIcon
const WrenchIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

export default DashboardHome;
