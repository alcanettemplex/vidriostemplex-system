import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Settings } from 'lucide-react';
import BarrasVerticales from '../charts/BarrasVerticales';
import LineaVsBarras from '../charts/LineaVsBarras';
import DonutChart from '../charts/DonutChart';

/** Constantes de Formato y UX */
const fmtM = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
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
  PAUSADA: '#e11d48',
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
  PAUSADA: 'Pausada',
};

export const PanelGeneral: React.FC<{ data: any, isLoading: boolean }> = ({ data, isLoading }) => {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-20 bg-white border border-slate-200 animate-pulse rounded" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="h-60 bg-white border border-slate-200 animate-pulse rounded" />
          <div className="h-60 bg-white border border-slate-200 animate-pulse rounded" />
        </div>
      </div>
    );
  }

  if (!data) return <div className="p-8 text-center text-[12px] text-slate-500">Sin datos operativos.</div>;

  const chartDataEstados = data.odps_por_estado?.map((s: any) => ({
    name: ESTADO_LABELS[s.estado] || s.estado,
    cantidad: s.cantidad,
    fill: ESTADO_COLORS[s.estado] || '#64748b'
  })) || [];

  const chartDataCaja = data.estado_caja_distribucion?.map((c: any) => ({
    name: c.estado,
    pct: c.pct
  })) || [];

  const cajaColors: any = {
    CANCELADO: '#10b981',
    ABONADO: '#f59e0b',
    CREDITO_APROBADO: '#3b82f6',
    PENDIENTE: '#e24b4a'
  };

  const embudoKeys = ['creadas', 'en_produccion', 'instaladas', 'entregadas', 'facturadas'];
  const embudoLabels = ['ODP creadas', 'En producción', 'Instaladas', 'Entregadas', 'Facturadas'];
  const embudoColors = ['#3266ad', '#5a8dc2', '#7baed4', '#a2c8e0', '#c5dded'];
  
  const embudoVals = embudoKeys.map(k => data.embudo_conversion?.[k] || 0);
  const maxEmbudo = Math.max(...embudoVals, 1);

  return (
    <div className="space-y-4">
      
      {/* ─── 1. KPI CARDS ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-3 border border-slate-200 rounded text-[11px]">
          <div className="text-slate-500 mb-1">ODPs activas</div>
          <div className="text-[20px] font-medium text-slate-800">{data.odps_activas}</div>
          {data.odps_activas_delta_pct !== undefined && (
            <div className={`mt-0.5 ${data.odps_activas_delta_pct > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {data.odps_activas_delta_pct > 0 ? '+' : ''}{data.odps_activas_delta_pct}% vs mes ant.
            </div>
          )}
        </div>

        <div className="bg-white p-3 border border-slate-200 rounded text-[11px] relative">
          <div className="text-slate-500 mb-1 flex justify-between items-center group">
            <span>Facturado mes</span>
            <div className="flex items-center gap-1.5">
              {data.meta_facturacion_actual > 0 && <span>Meta: {fmtM(data.meta_facturacion_actual)}</span>}
              <Link to="/configuracion" title="Ajustar Meta Variable Mensual" className="inline-flex p-0.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded transition-colors opacity-60 group-hover:opacity-100">
                <Settings className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
          <div className="text-[20px] font-medium text-slate-800">{fmtM(data.facturado_mes)}</div>
          {data.facturado_mes_delta_pct !== undefined && (
            <div className={`mt-0.5 ${data.facturado_mes_delta_pct > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {data.facturado_mes_delta_pct > 0 ? '+' : ''}{data.facturado_mes_delta_pct}%
            </div>
          )}
          {data.meta_facturacion_actual > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-100 rounded-b overflow-hidden">
               <div className="h-full bg-blue-600" style={{ width: `${Math.min((data.facturado_mes / data.meta_facturacion_actual) * 100, 100)}%` }}></div>
            </div>
          )}
        </div>

        <div className="bg-white p-3 border border-slate-200 rounded text-[11px]">
          <div className="text-slate-500 mb-1">Cartera vencida</div>
          <div className="text-[20px] font-medium text-slate-800">{fmtM(data.cartera_vencida_total)}</div>
          <div className="mt-0.5 text-rose-600">{data.cartera_vencida_clientes} clientes</div>
        </div>

        <div className="bg-white p-3 border border-slate-200 rounded text-[11px]">
          <div className="text-slate-500 mb-1 flex justify-between">
            <span>Tasa entrega a tiempo</span>
            <span>Meta: {data.meta_entrega_tiempo_pct}%</span>
          </div>
          <div className="text-[20px] font-medium text-slate-800">{data.tasa_entrega_tiempo_pct}%</div>
          <div className={`mt-0.5 ${data.tasa_entrega_tiempo_pct >= data.meta_entrega_tiempo_pct ? 'text-emerald-600' : 'text-amber-500'}`}>
             vs {data.meta_entrega_tiempo_pct}% requerido
          </div>
        </div>
      </div>

      {/* ─── 2. CHARTS PRIMCIPAL ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white p-3 border border-slate-200 rounded">
          <div className="text-[12px] font-medium text-slate-500 uppercase tracking-wider mb-3">ODPs por estado actual</div>
          <div className="h-[200px]">
            <BarrasVerticales 
              data={chartDataEstados} 
              dataKeyName="name" 
              dataKeyValue="cantidad"
              color="#818cf8"
            />
          </div>
        </div>

        <div className="bg-white p-3 border border-slate-200 rounded">
          <div className="text-[12px] font-medium text-slate-500 uppercase tracking-wider mb-3">Facturación últimos 6 meses (COP)</div>
          <div className="h-[200px]">
            <LineaVsBarras 
              data={data.facturacion_6_meses || []} 
              xKey="mes" 
              barsKey="real" 
              lineKey="meta" 
              yAxisFormatter={fmtM}
            />
          </div>
        </div>
      </div>

      {/* ─── 3. EMBUDO & CAJA ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        
        <div className="bg-white p-3 border border-slate-200 rounded">
          <div className="text-[12px] font-medium text-slate-500 uppercase tracking-wider mb-2">Embudo de conversión de órdenes</div>
          <div className="mt-2 text-[11px]">
            {embudoLabels.map((lbl, i) => {
              const val = embudoVals[i];
              const wPct = Math.max((val / maxEmbudo) * 100, 5); // at least 5% bar
              const pctOfTotal = embudoVals[0] > 0 ? Math.round((val / embudoVals[0]) * 100) : 0;
              return (
                <div key={lbl} className="flex items-center gap-2 mb-1.5">
                  <span className="text-slate-500 w-[120px] shrink-0">{lbl}</span>
                  <div 
                    className="h-[22px] rounded text-white flex items-center px-2 font-medium" 
                    style={{ width: `${wPct}%`, background: embudoColors[i], minWidth: '30px' }}
                  >
                    {val}
                  </div>
                  <span className="text-slate-500 ml-1">{pctOfTotal}%</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white p-3 border border-slate-200 rounded">
          <div className="text-[12px] font-medium text-slate-500 uppercase tracking-wider mb-2">Estado de caja</div>
          <div className="flex items-center gap-5 h-[200px]">
            <div className="w-[140px] h-[140px] shrink-0">
              <DonutChart 
                data={chartDataCaja} 
                nameKey="name" 
                dataKey="pct" 
                colors={chartDataCaja.map((c: any) => cajaColors[c.name] || '#94a3b8')} 
              />
            </div>
            <div className="flex-1 space-y-2">
              {chartDataCaja.map((c: any) => (
                <div key={c.name} className="flex items-center text-[12px] text-slate-800">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0 mr-2" style={{ background: cajaColors[c.name] || '#94a3b8' }}></span>
                  <span className="capitalize">{c.name.replace('_', ' ')}</span>
                  <span className="ml-auto font-medium">{c.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default PanelGeneral;
