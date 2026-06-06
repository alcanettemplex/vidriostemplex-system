import React from 'react';
import { motion } from 'framer-motion';

interface PanelCotizacionesProps {
  data: any | null;
  isLoading: boolean;
}

const fmtM = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────
const Skeleton: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = '', style }) => (
  <div className={`animate-pulse bg-slate-200 rounded ${className}`} style={style} />
);

// ─── KPI Card ─────────────────────────────────────────────────────────────────
interface KpiCardProps {
  label: string;
  value: number | string;
  sub?: string;
  color: string;
  isLoading: boolean;
}

const KpiCard: React.FC<KpiCardProps> = ({ label, value, sub, color, isLoading }) => (
  <div className={`bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-col gap-1 border-l-4 ${color}`}>
    {isLoading ? (
      <>
        <Skeleton className="h-3 w-24 mb-1" />
        <Skeleton className="h-8 w-16" />
      </>
    ) : (
      <>
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
        <span className="text-3xl font-bold text-slate-800">{value}</span>
        {sub && <span className="text-[11px] text-slate-500">{sub}</span>}
      </>
    )}
  </div>
);

// ─── Gráfica de barras apiladas ───────────────────────────────────────────────
const BarChart: React.FC<{ rows: any[] }> = ({ rows }) => {
  if (!rows || rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
        Sin datos en el período seleccionado
      </div>
    );
  }

  const maxVal = Math.max(...rows.map(r => r.realizadas), 1);

  const COLORS = {
    aprobadas:      '#22c55e',
    en_seguimiento: '#f59e0b',
    rechazadas:     '#ef4444',
  };

  return (
    <div className="flex items-end gap-2 h-44 pt-2">
      {rows.map((row, i) => {
        const pctAprob   = (row.aprobadas / maxVal) * 100;
        const pctSeg     = (row.en_seguimiento / maxVal) * 100;
        const pctRech    = (row.rechazadas / maxVal) * 100;

        return (
          <div key={i} className="flex flex-col items-center flex-1 gap-0.5" title={`${row.mes}: ${row.realizadas} realizadas`}>
            <div className="w-full flex flex-col-reverse gap-px" style={{ height: '140px' }}>
              {/* rechazadas (abajo) */}
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${pctRech}%` }}
                transition={{ duration: 0.7, delay: i * 0.05, ease: 'easeOut' }}
                className="w-full rounded-sm"
                style={{ backgroundColor: COLORS.rechazadas, minHeight: pctRech > 0 ? 3 : 0 }}
                title={`Rechazadas: ${row.rechazadas}`}
              />
              {/* en seguimiento */}
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${pctSeg}%` }}
                transition={{ duration: 0.7, delay: i * 0.05 + 0.05, ease: 'easeOut' }}
                className="w-full rounded-sm"
                style={{ backgroundColor: COLORS.en_seguimiento, minHeight: pctSeg > 0 ? 3 : 0 }}
                title={`En seguimiento: ${row.en_seguimiento}`}
              />
              {/* aprobadas (arriba) */}
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${pctAprob}%` }}
                transition={{ duration: 0.7, delay: i * 0.05 + 0.1, ease: 'easeOut' }}
                className="w-full rounded-sm"
                style={{ backgroundColor: COLORS.aprobadas, minHeight: pctAprob > 0 ? 3 : 0 }}
                title={`Aprobadas: ${row.aprobadas}`}
              />
            </div>
            <span className="text-[9px] text-slate-400 font-medium mt-1 truncate w-full text-center">{row.mes}</span>
          </div>
        );
      })}
    </div>
  );
};

// ─── Panel principal ──────────────────────────────────────────────────────────
export const PanelCotizaciones: React.FC<PanelCotizacionesProps> = ({ data, isLoading }) => {
  const resumen = data?.resumen_periodo || {};
  const porMes  = data?.por_mes || [];
  const activas = data?.en_seguimiento_activo || [];

  return (
    <div className="space-y-5">

      {/* ─── KPI Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Realizadas"
          value={resumen.total_realizadas ?? '—'}
          sub="en el período"
          color="border-l-indigo-400"
          isLoading={isLoading}
        />
        <KpiCard
          label="En seguimiento"
          value={resumen.total_en_seguimiento ?? '—'}
          sub="esperando respuesta"
          color="border-l-amber-400"
          isLoading={isLoading}
        />
        <KpiCard
          label="Aprobadas"
          value={resumen.total_aprobadas ?? '—'}
          sub={resumen.valor_total_aprobadas ? fmtM(resumen.valor_total_aprobadas) : ''}
          color="border-l-emerald-400"
          isLoading={isLoading}
        />
        <KpiCard
          label="Rechazadas / Vencidas"
          value={resumen.total_rechazadas ?? '—'}
          sub="descartadas"
          color="border-l-rose-400"
          isLoading={isLoading}
        />
      </div>

      {/* ─── Gráfica mes a mes ──────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">Cotizaciones por mes</h3>
          <div className="flex items-center gap-3 text-[10px] font-medium text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-emerald-500" />Aprobadas</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-amber-400" />En seguimiento</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-red-400" />Rechazadas</span>
          </div>
        </div>
        {isLoading ? (
          <div className="flex items-end gap-2 h-44">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="flex-1" style={{ height: `${40 + Math.random() * 60}%` } as React.CSSProperties} />
            ))}
          </div>
        ) : (
          <BarChart rows={porMes} />
        )}
      </div>

      {/* ─── En seguimiento activo ──────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">
            En seguimiento activo
            <span className="ml-2 text-[11px] font-normal text-slate-400">(todas las pendientes de respuesta)</span>
          </h3>
          {!isLoading && (
            <span className="text-[11px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
              {activas.length} pendientes
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : activas.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">
            No hay cotizaciones en seguimiento actualmente
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left border-b border-slate-100">
                  <th className="pb-2 font-semibold text-slate-400 pr-4">Número</th>
                  <th className="pb-2 font-semibold text-slate-400 pr-4">Cliente</th>
                  <th className="pb-2 font-semibold text-slate-400 pr-4 hidden md:table-cell">Proyecto</th>
                  <th className="pb-2 font-semibold text-slate-400 pr-4 hidden lg:table-cell">Asesor</th>
                  <th className="pb-2 font-semibold text-slate-400 pr-4 text-right">Valor</th>
                  <th className="pb-2 font-semibold text-slate-400 text-right">Días</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {activas.map((c: any) => {
                  const vencida  = c.dias_transcurridos > c.validez_dias;
                  const proxVenc = !vencida && c.dias_transcurridos >= c.validez_dias - 3;
                  return (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2 pr-4 font-mono font-semibold text-indigo-600">{c.numero_cot}</td>
                      <td className="py-2 pr-4 text-slate-700 max-w-[160px] truncate">{c.cliente}</td>
                      <td className="py-2 pr-4 text-slate-500 hidden md:table-cell max-w-[180px] truncate">{c.nombre_proyecto}</td>
                      <td className="py-2 pr-4 text-slate-500 hidden lg:table-cell">{c.asesor}</td>
                      <td className="py-2 pr-4 text-right font-semibold text-slate-700">{fmtM(c.valor_total)}</td>
                      <td className="py-2 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold
                          ${vencida  ? 'bg-rose-100 text-rose-700' :
                            proxVenc ? 'bg-amber-100 text-amber-700' :
                                       'bg-slate-100 text-slate-600'}`}>
                          {c.dias_transcurridos}d
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
