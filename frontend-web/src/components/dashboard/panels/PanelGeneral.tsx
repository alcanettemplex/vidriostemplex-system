import React from 'react';
import { motion } from 'framer-motion';
import { PieChart, List, FileCheck, CheckCircle2, FileText, ArrowRight } from 'lucide-react';
import BarrasVerticales from '../charts/BarrasVerticales';
import LineaVsBarras from '../charts/LineaVsBarras';
import DonutChart from '../charts/DonutChart';

/** Constantes de Formato y UX */
const fmtCOP = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
const fmtM = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return fmtCOP(n);
};

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
  PEDIDO_PROVEEDOR: 'Ped. Prov.',
  ALUMINIO_CORTADO: 'Corte',
  VIDRIO_RECIBIDO: 'Vidrio',
  ACCESORIOS_SEPARADOS: 'Accesorios',
  LISTO_INSTALAR: 'A Instalar',
  PROGRAMADA: 'Prog.',
  INSTALADA: 'Instalada',
  ENTREGADA: 'Entregada',
};

export const PanelGeneral: React.FC<{ data: any, isLoading: boolean }> = ({ data, isLoading }) => {
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-32 bg-slate-200 animate-pulse rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-80 bg-slate-200 animate-pulse rounded-2xl" />
          <div className="h-80 bg-slate-200 animate-pulse rounded-2xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-72 bg-slate-200 animate-pulse rounded-2xl" />
          <div className="h-72 bg-slate-200 animate-pulse rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!data) return <div className="p-8 text-center text-slate-500">Sin datos disponibles.</div>;

  // -- Procesar datos para gráficos
  const chartDataEstados = data.odps_por_estado?.map((s: any) => ({
    name: ESTADO_LABELS[s.estado] || s.estado,
    cantidad: s.cantidad,
    fill: ESTADO_COLORS[s.estado] || '#64748b'
  })) || [];

  const chartDataCaja = data.estado_caja_distribucion?.map((c: any) => ({
    name: c.estado,
    pct: c.pct
  })) || [];

  const cajaColors = {
    CANCELADO: '#22c55e',
    ABONADO: '#eab308',
    CREDITO_APROBADO: '#3b82f6',
    PENDIENTE: '#ef4444'
  };

  const embudoData = [
    { key: 'creadas', label: 'ODP Creadas', val: data.embudo_conversion?.creadas || 0 },
    { key: 'en_produccion', label: 'En Producción', val: data.embudo_conversion?.en_produccion || 0 },
    { key: 'instaladas', label: 'Instaladas', val: data.embudo_conversion?.instaladas || 0 },
    { key: 'entregadas', label: 'Entregadas', val: data.embudo_conversion?.entregadas || 0 },
    { key: 'facturadas', label: 'Facturadas', val: data.embudo_conversion?.facturadas || 0 },
  ];
  const maxEmbudo = Math.max(...embudoData.map(d => d.val), 1);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      
      {/* ─── 1. KPI CARDS ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* ODPs activas */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-sm font-semibold text-slate-500 mb-1">ODPs Activas (en Taller)</p>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl font-extrabold text-slate-800">{data.odps_activas}</h3>
            {data.odps_activas_delta_pct !== undefined && (
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${data.odps_activas_delta_pct > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                {data.odps_activas_delta_pct > 0 ? '+' : ''}{data.odps_activas_delta_pct}%
              </span>
            )}
          </div>
        </div>

        {/* Facturado Mes */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-sm font-semibold text-slate-500 mb-1">Facturado Este Mes</p>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl font-extrabold text-slate-800">{fmtM(data.facturado_mes)}</h3>
            {data.facturado_mes_delta_pct !== undefined && (
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${data.facturado_mes_delta_pct > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                {data.facturado_mes_delta_pct > 0 ? '+' : ''}{data.facturado_mes_delta_pct}%
              </span>
            )}
          </div>
        </div>

        {/* Cartera Vencida */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-sm font-semibold text-slate-500 mb-1">Cartera Vencida</p>
          <div className="flex items-end justify-between">
            <h3 className={`text-3xl font-extrabold ${data.cartera_vencida_total > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {fmtM(data.cartera_vencida_total)}
            </h3>
            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
              {data.cartera_vencida_clientes} clientes
            </span>
          </div>
        </div>

        {/* Tasa Entrega */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-1">
            <p className="text-sm font-semibold text-slate-500">Tasa Entrega a Tiempo</p>
            <span className="text-xs font-bold text-slate-400">Meta: {data.meta_entrega_tiempo_pct}%</span>
          </div>
          <div className="mt-2">
            <div className="flex justify-between items-end mb-1">
              <h3 className="text-2xl font-extrabold text-slate-800">{data.tasa_entrega_tiempo_pct}%</h3>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${data.tasa_entrega_tiempo_pct >= data.meta_entrega_tiempo_pct ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                style={{ width: `${Math.min(data.tasa_entrega_tiempo_pct, 100)}%` }}>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 2. CHARTS PRIMCIPAL ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ODPs por Estado */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h4 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <List className="w-5 h-5 text-indigo-500"/> ODPs Activas por Estado
          </h4>
          <BarrasVerticales 
            data={chartDataEstados} 
            dataKeyName="name" 
            dataKeyValue="cantidad"
            color="#818cf8"
          />
        </div>

        {/* Facturación 6 Meses */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h4 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-emerald-500"/> Facturación Histórica vs Meta
          </h4>
          <LineaVsBarras 
            data={data.facturacion_6_meses || []} 
            xKey="mes" 
            barsKey="real" 
            lineKey="meta" 
            yAxisFormatter={fmtM}
          />
        </div>
      </div>

      {/* ─── 3. EMBUDO & CAJA ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Embudo */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h4 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <ArrowRight className="w-5 h-5 text-blue-500"/> Embudo Operativo Mensual
          </h4>
          <div className="space-y-4 pt-2">
            {embudoData.map((d, i) => {
              const widthPct = Math.max((d.val / maxEmbudo) * 100, 5); // min 5% visual
              const isLast = i === embudoData.length - 1;
              const nextVal = isLast ? 0 : embudoData[i+1].val;
              const conversion = d.val > 0 ? Math.round((nextVal / d.val) * 100) : 0;

              return (
                <div key={d.key} className="relative">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-600 w-32 truncate">{d.label}</span>
                    <div className="flex-1 bg-slate-50 rounded-r-md h-8 relative flex items-center">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${widthPct}%` }}
                        className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-r-md"
                      />
                      <span className="relative z-10 text-white font-bold text-sm pl-3 shadow-sm">{d.val}</span>
                    </div>
                  </div>
                  {/* Etiqueta de conversión intermedia */}
                  {!isLast && d.val > 0 && (
                     <div className="ml-[140px] border-l-2 border-slate-200 pl-2 py-1 mt-1 mb-1 relative">
                       <span className="text-[10px] font-bold text-slate-400 bg-white absolute -left-2.5 px-1 top-1.5">{conversion}% pasan</span>
                     </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Donut Caja */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
          <h4 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-500"/> Estado de Ingresos y Cartera
          </h4>
          <div className="flex-1 flex items-center px-4">
            <div className="w-1/2">
              <DonutChart 
                data={chartDataCaja} 
                nameKey="name" 
                dataKey="pct" 
                colors={chartDataCaja.map((c: any) => (cajaColors as any)[c.name] || '#94a3b8')} 
              />
            </div>
            <div className="w-1/2 pl-6 space-y-3">
              {chartDataCaja.map((c: any) => (
                <div key={c.name} className="flex justify-between items-center bg-slate-50 px-3 py-2 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: (cajaColors as any)[c.name] || '#94a3b8' }}></span>
                    <span className="text-xs font-bold text-slate-600 capitalize">{c.name.replace('_', ' ')}</span>
                  </div>
                  <span className="text-sm font-extrabold text-slate-800">{c.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </motion.div>
  );
};

export default PanelGeneral;
