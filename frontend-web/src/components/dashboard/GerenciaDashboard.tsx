import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboardData } from './hooks/useDashboardData';
import { 
  BarChart4, 
  Wallet, 
  Wrench, 
  Users, 
  Bell, 
  RefreshCw 
} from 'lucide-react';
import { PanelGeneral } from './panels/PanelGeneral';
import { PanelVentas } from './panels/PanelVentas';
import { PanelProduccion } from './panels/PanelProduccion';
import { PanelEquipo } from './panels/PanelEquipo';
import { PanelAlertas } from './panels/PanelAlertas';

// --- MAIN WRAPPER -----------------------------------------------------

/**
 * GerenciaDashboard: Centro de mando gerencial con 5 pestañas.
 * Recibe el custom hook y provee estructura, tabs y orquestación visual.
 */
export const GerenciaDashboard: React.FC = () => {
  const { general, ventas, produccion, equipo, alertas, loading, error, refetch } = useDashboardData();
  const [activeTab, setActiveTab] = useState<'general'|'ventas'|'produccion'|'equipo'|'alertas'>('general');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Alertas críticas count para el badge rojo en el tab
  const alertasCriticas = alertas?.filter((a: any) => a.tipo === 'critico').length || 0;

  // Handler visual para force refetch
  const handleRefetch = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 500); // Visual cue
  };

  const tabs = [
    { id: 'general', label: 'General', icon: BarChart4, alert: 0 },
    { id: 'ventas', label: 'Ventas & Cartera', icon: Wallet, alert: 0 },
    { id: 'produccion', label: 'Taller & Entregas', icon: Wrench, alert: 0 },
    { id: 'equipo', label: 'Rendimiento Equipo', icon: Users, alert: 0 },
    { id: 'alertas', label: 'Alertas', icon: Bell, alert: alertasCriticas }
  ] as const;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto min-h-screen bg-slate-50/50">
      
      {/* ─── HEADER Y CONTROLES ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-8">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            Dashboard Gerencia
          </h1>
          <p className="text-sm font-semibold text-slate-500 mt-1 max-w-xl">
            Centro de control integrado. KPIs financieros, operativos y desempeño comercial en tiempo real.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {error && (
            <span className="text-xs font-bold bg-rose-100 text-rose-700 px-3 py-1.5 rounded-lg border border-rose-200">
              Error de conexión
            </span>
          )}
          <span className="text-xs font-bold text-slate-400 hidden sm:flex items-center gap-1.5 bg-white border border-slate-200 shadow-sm px-3 py-1.5 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Actualización automática síncrona
          </span>
          <button 
            onClick={handleRefetch}
            className={`p-2 bg-white border border-slate-200 shadow-sm rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors focus:ring-2 focus:ring-indigo-500 focus:outline-none ${isRefreshing ? 'animate-spin text-indigo-500' : ''}`}
            title="Sincronizar datos"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ─── TABS DE NAVEGACIÓN ────────────────────────────────────────── */}
      <div className="flex overflow-x-auto hide-scroll-bar border-b-2 border-slate-200 mb-8 pb-px">
        <div className="flex gap-2 min-w-max">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 px-5 py-3 text-sm font-extrabold transition-colors rounded-t-xl
                  ${isActive ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}
                `}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                {tab.label}
                
                {/* Badge Alertas Críticas (Especial para la pestaña alertas) */}
                {tab.alert > 0 && (
                  <span className="ml-1 bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-black min-w-[20px] text-center shadow-sm border border-rose-600">
                    {tab.alert}
                  </span>
                )}

                {/* Animated active border bottom (indicador de la tab activa) */}
                {isActive && (
                  <motion.div 
                    layoutId="activeTabIndicator"
                    className="absolute -bottom-[2px] left-0 right-0 h-1 bg-indigo-600 rounded-t-lg"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── CONTENIDO DE LOS PANELES ──────────────────────────────────── */}
      <div className="min-h-[600px]">
        <AnimatePresence mode="wait">
          
          {activeTab === 'general' && (
            <motion.div key="pt-gen" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
              <PanelGeneral data={general} isLoading={loading.general} />
            </motion.div>
          )}

          {activeTab === 'ventas' && (
            <motion.div key="pt-ven" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
              <PanelVentas data={ventas} isLoading={loading.ventas} />
            </motion.div>
          )}

          {activeTab === 'produccion' && (
            <motion.div key="pt-prod" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
              <PanelProduccion data={produccion} isLoading={loading.produccion} />
            </motion.div>
          )}

          {activeTab === 'equipo' && (
            <motion.div key="pt-eq" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
              <PanelEquipo data={equipo} isLoading={loading.equipo} />
            </motion.div>
          )}

          {activeTab === 'alertas' && (
            <motion.div key="pt-al" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              <PanelAlertas data={alertas} isLoading={loading.alertas} />
            </motion.div>
          )}

        </AnimatePresence>
      </div>

    </div>
  );
};

export default GerenciaDashboard;
