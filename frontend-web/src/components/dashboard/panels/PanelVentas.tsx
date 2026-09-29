import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, TrendingUp } from '../../ui/icons';
import { Iniciales, Medidor, ESTADO, ORDINAL_AZUL, colorPorEntidad } from '../../charts';

const fmtM = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
};

/** Semáforo del avance contra la meta. Siempre con icono y texto: el color no va solo. */
const estadoMeta = (pct: number) =>
  pct >= 100 ? { color: ESTADO.bien,     cls: 'text-emerald-700', texto: 'Meta cumplida', Icono: CheckCircle2 }
  : pct >= 60 ? { color: ESTADO.atencion, cls: 'text-amber-700',   texto: 'En camino',     Icono: TrendingUp }
  :             { color: ESTADO.critico,  cls: 'text-rose-700',    texto: 'Rezagado',      Icono: AlertTriangle };

// ─── Avance contra la meta ────────────────────────────────────────────────────
// Antes era un anillo de 220px. Un anillo obliga a estimar un ángulo; una cifra grande con una
// barra horizontal y un estado en palabras se lee en un segundo, y ocupa la mitad.
const AvanceMeta: React.FC<{ real: number; meta: number }> = ({ real, meta }) => {
  if (meta <= 0) {
    return (
      <div className="w-full">
        <p className="text-[28px] font-extrabold tracking-tight leading-none text-slate-900 [font-variant-numeric:normal]">{fmtM(real)}</p>
        <p className="mt-2 text-[12px] text-slate-700">Facturado del período. No hay meta configurada: se define en Configuración.</p>
      </div>
    );
  }
  const pctReal = (real / meta) * 100;
  const est     = estadoMeta(pctReal);
  const falta   = Math.max(meta - real, 0);
  return (
    <div className="w-full">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[44px] font-extrabold tracking-tight leading-none text-slate-900 [font-variant-numeric:normal]">
            {Math.round(pctReal)}%
          </p>
          <p className={`mt-1.5 flex items-center gap-1 text-[12px] font-semibold ${est.cls}`}>
            <est.Icono className="w-3.5 h-3.5" /> {est.texto}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[17px] font-bold text-slate-900 tabular-nums whitespace-nowrap">{fmtM(real)}</p>
          <p className="text-[12px] text-slate-700 tabular-nums whitespace-nowrap">de {fmtM(meta)}</p>
        </div>
      </div>
      <Medidor pct={pctReal} color={est.color} alto={10} className="mt-3" />
      <p className="mt-1.5 text-[12px] text-slate-700">
        {falta > 0 ? <>Faltan <span className="font-semibold text-slate-900 tabular-nums">{fmtM(falta)}</span> para la meta</> : 'La meta del período ya se alcanzó'}
      </p>
    </div>
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cardVar: any = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.5, ease: [0.22, 1, 0.36, 1] } }),
};

// ─── Panel ────────────────────────────────────────────────────────────────────
export const PanelVentas: React.FC<{ data: any; isLoading: boolean }> = ({ data, isLoading }) => {
  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 lg:col-span-5 h-80 rounded-2xl bg-slate-200" />
          <div className="col-span-12 lg:col-span-7 h-80 rounded-2xl bg-slate-200" />
        </div>
        <div className="grid grid-cols-3 gap-3">{[0,1,2].map(i => <div key={i} className="h-20 rounded-2xl bg-slate-200" />)}</div>
        <div className="h-56 rounded-2xl bg-slate-200" />
      </div>
    );
  }

  if (!data) return <div className="p-10 text-center text-slate-700 text-sm">Sin datos disponibles</div>;

  const totalFacturado = data.total_facturado_mes || 0;
  // La meta vive en configuracion_global: sin fila configurada no se inventa un valor.
  const meta           = data.meta_facturacion_actual || 0;
  const asesores       = (data.meta_vs_real_asesores || []).slice().sort((a: any, b: any) => b.real - a.real);

  const IVA_RATE = 0.19;
  // oa = porción del monto que proviene de OAs (Órdenes Azules, SIN IVA). Con oa=0 el cálculo es idéntico al original.
  const ivaOf    = (n: number, oa = 0) => { const c = n - oa; return c - c / (1 + IVA_RATE); };
  const baseOf   = (n: number, oa = 0) => n - ivaOf(n, oa);

  // Ticket promedio: la porción OA se estima proporcional al peso de las OAs en el total facturado
  const totalFact = data.total_facturado_mes || 0;
  const ticketOA  = totalFact > 0
    ? (data.ticket_promedio || 0) * ((data.total_facturado_mes_oa || 0) / totalFact)
    : 0;

  // Helper: columna con desglose IVA apilado
  const MontoCol = ({ n, oa = 0, colorCls = 'text-slate-900' }: { n: number; oa?: number; colorCls?: string }) => (
    <div className="w-20 text-right shrink-0">
      <p className={`text-[12px] font-semibold tabular-nums ${colorCls}`}>{fmtM(n)}</p>
      <p className="text-[12px] text-slate-700 tabular-nums">{fmtM(baseOf(n, oa))}</p>
      <p className="text-[12px] text-indigo-700 tabular-nums">IVA {fmtM(ivaOf(n, oa))}</p>
    </div>
  );
  const cartera        = data.cartera_vencida_detalle || [];
  const carteraCritica = data.cartera_por_antiguedad?.find((c: any) => c.rango === '>60 días')?.total || 0;

  return (
    <div className="space-y-3">

      {/* ── ROW 1: Gauge + Ranking ───────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-3">

        {/* Gauge */}
        <motion.div custom={0} variants={cardVar} initial="hidden" animate="visible"
          className="col-span-12 lg:col-span-5 bg-white border border-slate-200 rounded-2xl shadow-card p-5 flex flex-col gap-4">
          <div>
            <p className="text-[15px] font-semibold text-slate-900">Meta mensual de facturación</p>
            <p className="text-[12px] text-slate-700 leading-snug mt-1">Avance del período sobre la meta total de todos los asesores</p>
          </div>
          <AvanceMeta real={totalFacturado} meta={meta} />
          <div className="grid grid-cols-2 gap-2 w-full">
            {[
              { label: 'Recaudado',    desc: 'Abonos cobrados',       raw: data.total_abonado   || 0, oa: data.total_abonado_oa   || 0, color: 'text-emerald-700', ivaColor: 'text-emerald-700' },
              { label: 'Pendiente',    desc: 'Por cobrar',            raw: data.total_pendiente || 0, oa: data.total_pendiente_oa || 0, color: 'text-rose-700',    ivaColor: 'text-rose-700' },
              { label: 'Ticket prom.', desc: 'Valor promedio por ODP', raw: data.ticket_promedio || 0, oa: ticketOA,                    color: 'text-slate-900',   ivaColor: 'text-indigo-700' },
            ].map((item, i) => (
              <div key={i} className="bg-slate-50 rounded-xl p-3 text-center border border-slate-200">
                <p className="text-[11px] font-semibold text-slate-900 uppercase tracking-wide">{item.label}</p>
                <p className="text-[12px] text-slate-700 mb-1.5">{item.desc}</p>
                <p className={`text-[17px] font-extrabold tabular-nums whitespace-nowrap ${item.color}`}>{fmtM(item.raw)}</p>
                <p className="text-[12px] text-slate-700 tabular-nums mt-0.5">{fmtM(baseOf(item.raw, item.oa))}</p>
                <p className={`text-[12px] tabular-nums ${item.ivaColor}`}>IVA {fmtM(ivaOf(item.raw, item.oa))}</p>
              </div>
            ))}
            <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-200">
              <p className="text-[11px] font-semibold text-slate-900 uppercase tracking-wide">Sin facturar</p>
              <p className="text-[12px] text-slate-700 mb-1.5">ODPs sin número de factura</p>
              <p className={`text-[17px] font-extrabold tabular-nums whitespace-nowrap ${(data.odps_sin_facturar || 0) > 5 ? 'text-amber-700' : 'text-slate-900'}`}>
                {data.odps_sin_facturar || 0} ODPs
              </p>
            </div>
          </div>
        </motion.div>

        {/* Ranking asesores */}
        <motion.div custom={1} variants={cardVar} initial="hidden" animate="visible"
          className="col-span-12 lg:col-span-7 bg-white border border-slate-200 rounded-2xl shadow-card p-5 flex flex-col">
          <p className="text-[15px] font-semibold text-slate-900">Ranking — meta vs real por asesor</p>
          <p className="text-[12px] text-slate-700 leading-snug mt-1">Facturado y recaudado del período vs la meta asignada a cada asesor</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 mb-3 text-[12px] text-slate-800">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: ORDINAL_AZUL[0] }} />Facturado</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: ORDINAL_AZUL[3] }} />Recaudado</span>
            <span className="text-slate-700">La barra completa es la meta del asesor</span>
          </div>
          {/* Header cols */}
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="flex-1" />
            <div className="w-20 text-right">
              <p className="text-[11px] font-semibold text-slate-900 uppercase tracking-wide">Meta</p>
              <p className="text-[12px] text-slate-700">Base / IVA</p>
            </div>
            <div className="w-20 text-right">
              <p className="text-[11px] font-semibold text-slate-900 uppercase tracking-wide">Facturado</p>
              <p className="text-[12px] text-slate-700">Base / IVA</p>
            </div>
            <div className="w-20 text-right">
              <p className="text-[11px] font-semibold text-slate-900 uppercase tracking-wide">Recaudado</p>
              <p className="text-[12px] text-slate-700">Base / IVA</p>
            </div>
            <span className="text-[11px] font-semibold text-slate-900 uppercase tracking-wide w-9 text-right">%</span>
          </div>
          {asesores.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-700 text-[12px]">No hay usuarios registrados</div>
          ) : (
            <div className="flex-1 space-y-4 overflow-y-auto pr-1">
              {asesores.map((as: any, i: number) => {
                const pct       = as.meta > 0 ? Math.min((as.real / as.meta) * 100, 100) : 0;
                const pctLabel  = as.meta > 0 ? Math.round((as.real / as.meta) * 100) : 0;
                const est       = estadoMeta(pctLabel);
                const pctRec    = as.meta > 0 ? Math.min((as.recaudado / as.meta) * 100, 100) : 0;
                const rolBadge: Record<string, { label: string; cls: string }> = {
                  asesor_comercial: { label: 'Asesor', cls: 'bg-indigo-50 text-indigo-700' },
                  gerencia:         { label: 'Gerencia', cls: 'bg-purple-50 text-purple-700' },
                  jefe_produccion:  { label: 'J. Prod.', cls: 'bg-amber-50 text-amber-700' },
                };
                const badge = rolBadge[as.rol] || { label: as.rol, cls: 'bg-slate-100 text-slate-800' };
                return (
                  <div key={as.asesor_id}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`w-5 shrink-0 text-center text-[12px] font-bold tabular-nums ${i < 3 ? 'text-templex-700' : 'text-slate-700'}`}>{i + 1}</span>
                      <Iniciales nombre={as.nombre || 'U'} tamano={28} color={colorPorEntidad(as.asesor_id ?? as.nombre)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px] font-semibold text-slate-900 truncate">{as.nombre}</span>
                          <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${badge.cls}`}>{badge.label}</span>
                        </div>
                      </div>
                      <MontoCol n={as.meta}      colorCls="text-slate-800" />
                      <MontoCol n={as.real}      oa={as.real_oa}      colorCls="text-slate-900" />
                      <MontoCol n={as.recaudado} oa={as.recaudado_oa} colorCls="text-emerald-700" />
                      <span className={`text-[12px] font-bold tabular-nums w-9 text-right ${est.cls}`} title={est.texto}>{pctLabel}%</span>
                    </div>
                    {/* Facturado (claro) y recaudado (oscuro) sobre la misma pista = meta del asesor */}
                    <div className="relative h-2 rounded-full overflow-hidden ml-7 bg-slate-100">
                      <motion.div className="absolute inset-y-0 left-0 rounded-full"
                        style={{ background: ORDINAL_AZUL[0] }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 + i * 0.05 }} />
                      <motion.div className="absolute inset-y-0 left-0 rounded-full"
                        style={{ background: ORDINAL_AZUL[3] }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pctRec}%` }}
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 + i * 0.05 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>

      {/* ── ROW 2: Chips rápidos ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <motion.div custom={2} variants={cardVar} initial="hidden" animate="visible"
          className={`rounded-2xl p-4 border ${carteraCritica > 0 ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200 shadow-card'}`}>
          <p className={`text-[14px] font-semibold ${carteraCritica > 0 ? 'text-rose-800' : 'text-slate-900'}`}>
            Cartera Crítica &gt;60 días
          </p>
          <p className="text-[12px] text-slate-700 leading-snug mt-1 mb-2">Saldo de créditos vencidos sin pago a más de 60 días</p>
          <p className={`text-[24px] font-extrabold tracking-tight tabular-nums whitespace-nowrap ${carteraCritica > 0 ? 'text-rose-700' : 'text-slate-700'}`}>
            {carteraCritica > 0 ? fmtM(carteraCritica) : 'Sin cartera crítica'}
          </p>
        </motion.div>

        <motion.div custom={3} variants={cardVar} initial="hidden" animate="visible"
          className={`rounded-2xl p-4 border ${(data.odps_atrasadas || 0) > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200 shadow-card'}`}>
          <p className={`text-[14px] font-semibold ${(data.odps_atrasadas || 0) > 0 ? 'text-amber-900' : 'text-slate-900'}`}>
            ODPs Vencidas sin Entregar
          </p>
          <p className="text-[12px] text-slate-700 leading-snug mt-1 mb-2">Fecha de entrega pasada que aún no han llegado a Instalada</p>
          <p className={`text-[24px] font-extrabold tracking-tight tabular-nums whitespace-nowrap ${(data.odps_atrasadas || 0) > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
            {(data.odps_atrasadas || 0) > 0 ? `${data.odps_atrasadas} ODPs` : 'Sin atrasos'}
          </p>
        </motion.div>

        <motion.div custom={4} variants={cardVar} initial="hidden" animate="visible"
          className="bg-white border border-slate-200 rounded-2xl shadow-card p-4">
          <p className="text-[14px] font-semibold text-slate-900">Top Cliente</p>
          <p className="text-[12px] text-slate-700 leading-snug mt-1 mb-2">Cliente con mayor facturación acumulada en el período</p>
          {data.top_clientes?.[0] ? (
            <>
              <p className="text-[16px] font-bold text-slate-900 truncate">{data.top_clientes[0].nombre}</p>
              <p className="text-[12px] font-semibold text-indigo-700 tabular-nums mt-0.5">{fmtM(data.top_clientes[0].total)} · {data.top_clientes[0].odps} pedidos</p>
            </>
          ) : <p className="text-slate-700 text-[12px]">Sin datos</p>}
        </motion.div>
      </div>

      {/* ── ROW 3: Cartera detalle ────────────────────────────────────── */}
      <motion.div custom={5} variants={cardVar} initial="hidden" animate="visible"
        className="bg-white border border-slate-200 rounded-2xl shadow-card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <p className="text-[15px] font-semibold text-slate-900">Alertas de Cartera</p>
          <p className="text-[12px] text-slate-700 leading-snug mt-0.5">Clientes con créditos vencidos, ordenados por antigüedad del saldo</p>
          <div className="flex gap-3">
            {(data.cartera_por_antiguedad || []).map((cpa: any, i: number) => (
              <div key={i} className="flex items-center gap-1.5 text-[12px]">
                <span className={`w-1.5 h-1.5 rounded-full ${i===0?'bg-emerald-500':i===1?'bg-amber-500':'bg-rose-500'}`} />
                <span className="text-slate-800">{cpa.rango}</span>
                <span className="text-slate-900 font-semibold tabular-nums">{fmtM(cpa.total)}</span>
              </div>
            ))}
          </div>
        </div>
        {cartera.length === 0 ? (
          <p className="text-center text-slate-700 py-6 text-[12px]">Sin alertas de cartera activas</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[11px] text-slate-900 uppercase tracking-wide border-b border-slate-200">
                  <th className="pb-2 font-semibold">Cliente</th>
                  <th className="pb-2 font-semibold text-right">Monto</th>
                  <th className="pb-2 font-semibold text-center">Días</th>
                  <th className="pb-2 font-semibold text-center">Riesgo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cartera.map((cv: any, i: number) => (
                  <motion.tr key={i}
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.04 }}
                    className="text-[12px] hover:bg-slate-50 transition-colors">
                    <td className="py-2 pr-3 text-slate-900 font-semibold max-w-[200px] truncate">{cv.nombre}</td>
                    <td className="py-2 pr-3 text-right text-slate-900 font-semibold tabular-nums">{fmtM(cv.monto)}</td>
                    <td className="py-2 text-center text-rose-700 font-semibold tabular-nums">+{cv.dias_vencido}d</td>
                    <td className="py-2 text-center">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                        cv.riesgo === 'critico' ? 'bg-rose-100 text-rose-700'
                          : cv.riesgo === 'alerta' ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                      }`}>{cv.riesgo}</span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

    </div>
  );
};

export default PanelVentas;
