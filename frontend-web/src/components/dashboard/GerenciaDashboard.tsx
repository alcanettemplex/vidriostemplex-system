import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboardData, PeriodParams } from './hooks/useDashboardData';
import FolderTabs from '../FolderTabs';
import { PanelGeneral }        from './panels/PanelGeneral';
import { PanelVentas }         from './panels/PanelVentas';
import { PanelProduccion }     from './panels/PanelProduccion';
import { PanelEquipo }         from './panels/PanelEquipo';
import { PanelAlertas }        from './panels/PanelAlertas';
import { PanelCotizaciones }   from './panels/PanelCotizaciones';
import ODPFichaModal from '../../features/odp/components/ODPFichaModal';
import { RefreshCw } from 'lucide-react';

const ROLES_COTIZACIONES = ['admin', 'gerencia', 'root'];

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const YEARS = [2024, 2025, 2026, 2027];

export const GerenciaDashboard: React.FC = () => {
  const today = new Date();

  const [period, setPeriod] = useState<PeriodParams>({
    mesInicio:  today.getMonth() + 1,
    anioInicio: today.getFullYear(),
    mesFin:     today.getMonth() + 1,
    anioFin:    today.getFullYear(),
  });

  const userRol = useSelector((state: any) => state.auth.user?.rol as string | undefined);
  const puedeVerCotizaciones = ROLES_COTIZACIONES.includes(userRol || '');

  const { general, ventas, produccion, equipo, alertas, cotizaciones, loading, error, refetch } = useDashboardData(period);

  const [activeTab, setActiveTab]         = useState<'general'|'ventas'|'produccion'|'equipo'|'alertas'|'cotizaciones'>('general');
  const [isRefreshing, setIsRefreshing]   = useState(false);
  const [selectedOdpId, setSelectedOdpId] = useState<number | null>(null);

  const alertasCriticas = alertas?.filter((a: any) => a.tipo === 'critico').length || 0;

  const handleRefetch = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handlePeriodChange = (field: keyof PeriodParams, value: number) => {
    setPeriod(prev => ({ ...prev, [field]: value }));
  };

  const periodLabel = (() => {
    const desdeStr = `${MESES[period.mesInicio - 1]} ${period.anioInicio}`;
    const hastaStr = `${MESES[period.mesFin - 1]} ${period.anioFin}`;
    return desdeStr === hastaStr ? desdeStr : `${desdeStr} – ${hastaStr}`;
  })();

  const tabs = [
    { id: 'general',       label: 'Visión general',  alert: 0 },
    { id: 'ventas',        label: 'Ventas & cartera', alert: 0 },
    { id: 'produccion',    label: 'Producción',       alert: 0 },
    { id: 'equipo',        label: 'Equipo',           alert: 0 },
    { id: 'alertas',       label: 'Alertas',          alert: alertasCriticas },
    ...(puedeVerCotizaciones ? [{ id: 'cotizaciones', label: 'Cotizaciones', alert: 0 }] : []),
  ] as const;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto min-h-screen bg-slate-50">

      {/* ─── HEADER ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Dashboard Gerencial</h1>
          <p className="text-[11px] text-slate-400 mt-0.5 font-medium">{periodLabel}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {error && (
            <span className="text-[11px] font-bold bg-rose-100 text-rose-700 px-2 py-1 rounded border border-rose-200">
              Error de conexión
            </span>
          )}

          {/* ── Selector de periodo ─────────────────────────────────────── */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Desde</span>
            <select
              value={period.mesInicio}
              onChange={e => handlePeriodChange('mesInicio', Number(e.target.value))}
              className="bg-transparent text-[11px] font-bold text-slate-700 outline-none cursor-pointer"
            >
              {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select
              value={period.anioInicio}
              onChange={e => handlePeriodChange('anioInicio', Number(e.target.value))}
              className="bg-transparent text-[11px] font-bold text-slate-700 outline-none cursor-pointer"
            >
              {YEARS.map(y => <option key={y}>{y}</option>)}
            </select>

            <span className="text-slate-200 font-light mx-0.5">|</span>

            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Hasta</span>
            <select
              value={period.mesFin}
              onChange={e => handlePeriodChange('mesFin', Number(e.target.value))}
              className="bg-transparent text-[11px] font-bold text-slate-700 outline-none cursor-pointer"
            >
              {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select
              value={period.anioFin}
              onChange={e => handlePeriodChange('anioFin', Number(e.target.value))}
              className="bg-transparent text-[11px] font-bold text-slate-700 outline-none cursor-pointer"
            >
              {YEARS.map(y => <option key={y}>{y}</option>)}
            </select>
          </div>

          <span className="text-[11px] font-medium text-slate-500 hidden sm:flex items-center gap-1.5 bg-white border border-slate-200 px-2 py-1 rounded">
            Auto-actualización
          </span>
          <button
            onClick={handleRefetch}
            className={`p-1.5 bg-white border border-slate-200 rounded text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors focus:outline-none ${isRefreshing ? 'animate-spin text-indigo-500' : ''}`}
            title="Sincronizar datos"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ─── TABS — estilo carpeta ───────────────────────────────────────── */}
      <FolderTabs
        tabs={tabs.map(tab => ({
          key: tab.id,
          label: tab.label,
          badge: tab.alert > 0 ? tab.alert : undefined,
          badgeClassName: 'bg-rose-50 text-rose-600',
        }))}
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as any)}
        className="mb-5 border-b border-slate-200"
      />

      {/* ─── PANELES ─────────────────────────────────────────────────────── */}
      <div className="min-h-[600px] pb-6">
        <AnimatePresence mode="wait">
          {activeTab === 'general' && (
            <motion.div key="pt-gen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <PanelGeneral data={general} isLoading={loading.general} />
            </motion.div>
          )}
          {activeTab === 'ventas' && (
            <motion.div key="pt-ven" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <PanelVentas data={ventas} isLoading={loading.ventas} />
            </motion.div>
          )}
          {activeTab === 'produccion' && (
            <motion.div key="pt-prod" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <PanelProduccion data={produccion} isLoading={loading.produccion} onViewOdp={setSelectedOdpId} />
            </motion.div>
          )}
          {activeTab === 'equipo' && (
            <motion.div key="pt-eq" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <PanelEquipo data={equipo} isLoading={loading.equipo} />
            </motion.div>
          )}
          {activeTab === 'alertas' && (
            <motion.div key="pt-al" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <PanelAlertas data={alertas} isLoading={loading.alertas} onViewOdp={setSelectedOdpId} />
            </motion.div>
          )}
          {activeTab === 'cotizaciones' && puedeVerCotizaciones && (
            <motion.div key="pt-cot" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <PanelCotizaciones data={cotizaciones} isLoading={loading.cotizaciones} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {selectedOdpId && (
          <ODPFichaModal
            odpId={selectedOdpId}
            onClose={() => setSelectedOdpId(null)}
            initialTab="general"
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default GerenciaDashboard;
