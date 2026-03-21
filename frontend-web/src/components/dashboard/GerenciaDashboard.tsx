import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboardData } from './hooks/useDashboardData';
import { PanelGeneral } from './panels/PanelGeneral';
import { PanelVentas } from './panels/PanelVentas';
import { PanelProduccion } from './panels/PanelProduccion';
import { PanelEquipo } from './panels/PanelEquipo';
import { PanelAlertas } from './panels/PanelAlertas';
import ODPFichaModal from '../../features/odp/components/ODPFichaModal';
import { RefreshCw } from 'lucide-react';

/**
 * GerenciaDashboard: Centro de mando gerencial con 5 pestañas.
 * Diseño ultra-denso y corporativo (HTML reference).
 */
export const GerenciaDashboard: React.FC = () => {
  const { general, ventas, produccion, equipo, alertas, loading, error, refetch } = useDashboardData();
  const [activeTab, setActiveTab] = useState<'general'|'ventas'|'produccion'|'equipo'|'alertas'>('general');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedOdpId, setSelectedOdpId] = useState<number | null>(null);

  const alertasCriticas = alertas?.filter((a: any) => a.tipo === 'critico').length || 0;

  const handleRefetch = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 500); 
  };

  const tabs = [
    { id: 'general', label: 'Visión general', alert: 0 },
    { id: 'ventas', label: 'Ventas & cartera', alert: 0 },
    { id: 'produccion', label: 'Producción', alert: 0 },
    { id: 'equipo', label: 'Equipo', alert: 0 },
    { id: 'alertas', label: 'Alertas', alert: alertasCriticas }
  ] as const;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto min-h-screen bg-slate-50">
      
      {/* ─── HEADER Y CONTROLES ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            Dashboard Gerencial
          </h1>
        </div>
        
        <div className="flex items-center gap-3">
          {error && (
            <span className="text-[11px] font-bold bg-rose-100 text-rose-700 px-2 py-1 rounded border border-rose-200">
              Error de conexión
            </span>
          )}
          <span className="text-[11px] font-medium text-slate-500 hidden sm:flex items-center gap-1.5 bg-white border border-slate-200 px-2 py-1 rounded">
            Actualización automática
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

      {/* ─── TABS DE NAVEGACIÓN ESTILO MINIMALISTA ────────────────────────── */}
      <div className="flex gap-1 mb-5 border-b border-slate-200">
        {tabs.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-4 py-2 text-[12px] font-medium transition-colors outline-none
                ${isActive ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-800 border-b-2 border-transparent'}
              `}
              style={{ marginBottom: '-1px' }}
            >
              {tab.label}
              {tab.alert > 0 && (
                <span className="ml-1.5 bg-rose-50 text-rose-600 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                  {tab.alert}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ─── CONTENIDO DE LOS PANELES ──────────────────────────────────── */}
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
        </AnimatePresence>
      </div>

      {/* MODAL ODP */}
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

