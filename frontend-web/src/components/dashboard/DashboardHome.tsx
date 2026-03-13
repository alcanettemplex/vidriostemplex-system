import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { 
  TrendingUp, 
  Wallet, 
  Wrench, 
  AlertTriangle, 
  Percent,
  AlertCircle,
  Clock,
  Briefcase,
  PlaySquare,
  BarChart3,
  CalendarDays,
  Users,
  Package
} from 'lucide-react';
import KPICard from './KPICard';

/** Colores para gráfico de distribución de estados */
const ESTADO_COLORS: Record<string, string> = {
  EN_ESPERA: '#94a3b8',
  MEDICION: '#818cf8',
  PEDIDO_PROVEEDOR: '#f59e0b',
  ALUMINIO_CORTADO: '#06b6d4',
  VIDRIO_RECIBIDO: '#3b82f6',
  ACCESORIOS_SEPARADOS: '#8b5cf6',
  LISTO_INSTALAR: '#f97316',
  PROGRAMADA: '#14b8a6',
  INSTALADA: '#22c55e',
  ENTREGADA: '#10b981',
};

const ESTADO_LABELS: Record<string, string> = {
  EN_ESPERA: 'En Espera',
  MEDICION: 'Medición',
  PEDIDO_PROVEEDOR: 'Ped. Proveedor',
  ALUMINIO_CORTADO: 'Aluminio Cortado',
  VIDRIO_RECIBIDO: 'Vidrio Recibido',
  ACCESORIOS_SEPARADOS: 'Accesorios Sep.',
  LISTO_INSTALAR: 'Listo p/ Instalar',
  PROGRAMADA: 'Programada',
  INSTALADA: 'Instalada',
  ENTREGADA: 'Entregada',
};

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
        console.error("Error al cargar dashboard:", error);
        setData(null);
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          <div className="lg:col-span-2 h-80 bg-slate-200 rounded-2xl animate-pulse"></div>
          <div className="h-80 bg-slate-200 rounded-2xl animate-pulse"></div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-slate-800">No se pudieron cargar los datos</h2>
          <p className="text-slate-500 mt-2">Verifica tu conexión o intenta de nuevo más tarde.</p>
          <button onClick={() => window.location.reload()} className="mt-4 px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // Preparar datos para Recharts
  const tendenciaData = (data.tendencia_mensual || []).map((item: any) => ({
    mes: new Date(item.mes).toLocaleDateString('es-CO', { month: 'short', year: '2-digit' }),
    odps: Number(item.total) || 0,
    abonos: Number(item.total_abonos) || 0,
    pendiente: Number(item.total_pendiente) || 0,
  }));

  const distribucionData = (data.distribucion_estados || []).map((item: any) => ({
    name: ESTADO_LABELS[item.estado_produccion] || item.estado_produccion,
    value: Number(item.total) || 0,
    key: item.estado_produccion,
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* HEADER */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Panel de Control Gerencial</h1>
          <p className="text-slate-500 font-medium mt-1">Indicadores clave de negocio y alertas operativas en tiempo real.</p>
        </div>
        <div className="flex gap-3 items-center">
          {data.total_clientes !== undefined && (
            <span className="flex items-center gap-1.5 text-sm font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">
              <Users className="w-4 h-4" /> {data.total_clientes} clientes
            </span>
          )}
          <span className="flex items-center gap-1.5 text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg">
            <CalendarDays className="w-4 h-4" /> Este Mes
          </span>
        </div>
      </div>

      {/* KPIs PRINCIPALES */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KPICard
          title="Ventas del Mes"
          value={data.ventas_mes}
          icon={<TrendingUp className="w-6 h-6" />}
          colorClass="text-emerald-700 bg-emerald-100"
          delay={0.1}
        />
        <KPICard
          title="Flujo de Caja"
          value={data.flujo_caja}
          icon={<Wallet className="w-6 h-6" />}
          colorClass="text-blue-700 bg-blue-100"
          delay={0.2}
        />
        <KPICard
          title="Recaudo"
          value={data.margen_recaudo || data.margen_promedio}
          icon={<Percent className="w-6 h-6" />}
          colorClass="text-indigo-700 bg-indigo-100"
          delay={0.3}
        />
        <KPICard
          title="En Producción"
          value={data.en_produccion}
          icon={<Wrench className="w-6 h-6" />}
          colorClass="text-amber-700 bg-amber-100"
          delay={0.4}
        />
        <KPICard
          title="Atrasados"
          value={data.pedidos_atrasados}
          icon={<AlertTriangle className="w-6 h-6" />}
          colorClass="text-rose-700 bg-rose-100"
          delay={0.5}
        />
      </div>

      {/* KPIs SECUNDARIOS */}
      {(data.total_por_cobrar || data.odps_este_mes) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KPICard
            title="Por Cobrar Total"
            value={data.total_por_cobrar}
            icon={<Briefcase className="w-6 h-6" />}
            colorClass="text-rose-700 bg-rose-100"
            delay={0.6}
          />
          <KPICard
            title="ODPs Este Mes"
            value={data.odps_este_mes}
            icon={<Package className="w-6 h-6" />}
            colorClass="text-cyan-700 bg-cyan-100"
            delay={0.7}
          />
          <KPICard
            title="Total ODPs"
            value={data.total_odps}
            icon={<BarChart3 className="w-6 h-6" />}
            colorClass="text-violet-700 bg-violet-100"
            delay={0.8}
          />
        </div>
      )}

      {/* GRÁFICOS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tendencia Mensual */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}
          className="lg:col-span-2 p-6 border border-slate-200 shadow-sm rounded-2xl bg-white"
        >
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-6">
            <BarChart3 className="w-5 h-5 text-indigo-500" />
            Tendencia Mensual de ODPs
          </h2>
          {tendenciaData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={tendenciaData} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="mes" tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontWeight: 600 }}
                  formatter={(value: any) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value) || 0)}
                />
                <Bar dataKey="abonos" name="Cobrado" fill="#22c55e" radius={[6, 6, 0, 0]} />
                <Bar dataKey="pendiente" name="Pendiente" fill="#f97316" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-72 flex items-center justify-center text-slate-400 font-bold">
              Sin datos de tendencia disponibles
            </div>
          )}
        </motion.div>

        {/* Distribución de Estados */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }}
          className="p-6 border border-slate-200 shadow-sm rounded-2xl bg-white"
        >
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-6">
            <PlaySquare className="w-5 h-5 text-emerald-500" />
            Estados de Producción
          </h2>
          {distribucionData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={distribucionData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  innerRadius={50}
                  paddingAngle={2}
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
                >
                  {distribucionData.map((entry: any) => (
                    <Cell key={entry.key} fill={ESTADO_COLORS[entry.key] || '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => `${value} ODPs`} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-72 flex items-center justify-center text-slate-400 font-bold">
              Sin datos de estados disponibles
            </div>
          )}
        </motion.div>
      </div>

      {/* ALERTAS */}
      <h2 className="text-2xl font-bold text-slate-800 mt-10 mb-4 flex items-center gap-2">
        <AlertTriangle className="w-6 h-6 text-rose-500" />
        Alertas Críticas
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Retrasos en Producción */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          className="border-t-4 border-t-rose-500 p-5 bg-white shadow-sm rounded-b-2xl border border-slate-200"
        >
          <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-rose-500" />
            Retrasos en Producción
            {data.pedidos_atrasados > 0 && (
              <span className="ml-auto text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">{data.pedidos_atrasados} total</span>
            )}
          </h3>
          <div className="space-y-3">
            {data.alertas_atrasos?.length > 0 ? data.alertas_atrasos.map((item: any, i: number) => (
              <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-sm font-bold text-slate-700">{item.odp}</p>
                  <p className="text-xs text-slate-500 font-medium mt-1">{item.cliente}</p>
                </div>
                <div className="text-right">
                  <span className="text-rose-600 font-bold text-sm block">+{item.dias} días</span>
                  {item.estado && <span className="text-xs text-slate-400">{ESTADO_LABELS[item.estado] || item.estado}</span>}
                </div>
              </div>
            )) : (
              <p className="text-center text-slate-400 py-4 font-medium">🎉 Sin atrasos — ¡Excelente!</p>
            )}
          </div>
        </motion.div>

        {/* Cuentas por Cobrar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
          className="border-t-4 border-t-blue-500 p-5 bg-white shadow-sm rounded-b-2xl border border-slate-200"
        >
          <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
            <Briefcase className="w-5 h-5 text-blue-500" />
            Cuentas por Cobrar (Riesgo)
          </h3>
          <div className="space-y-3">
            {data.alertas_cartera?.length > 0 ? data.alertas_cartera.map((item: any, i: number) => (
              <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border-l-2 border-slate-300">
                <div>
                  <p className="text-sm font-semibold text-slate-700 truncate max-w-[180px]">{item.cliente}</p>
                  {item.odp && <p className="text-xs text-slate-400 font-mono">{item.odp}</p>}
                  <p className="text-xs text-rose-500 font-bold mt-1">Vencido: {item.dias_vencido} días</p>
                </div>
                <div className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded text-sm font-bold whitespace-nowrap">
                  {item.monto}
                </div>
              </div>
            )) : (
              <p className="text-center text-slate-400 py-4 font-medium">✅ Cartera al día</p>
            )}
          </div>
        </motion.div>
      </div>

      {/* ACTIVIDAD */}
      {data.actividad?.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
          className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
            <PlaySquare className="w-5 h-5 text-emerald-500" />
            Resumen del Mes
          </h3>
          <div className="space-y-3">
            {data.actividad.map((act: any, idx: number) => (
              <div key={idx} className="flex items-start gap-4 p-3 rounded-lg bg-slate-50">
                <div className="mt-1 p-2 rounded-full bg-indigo-100 text-indigo-600">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">{act.texto}</p>
                  {act.detalle && <p className="text-xs text-slate-500 font-medium mt-0.5">{act.detalle}</p>}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default DashboardHome;
