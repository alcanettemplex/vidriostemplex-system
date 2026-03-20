import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, AlertTriangle, Info, ShieldAlert, ArrowRight } from 'lucide-react';

export const PanelAlertas: React.FC<{ data: any[], isLoading: boolean }> = ({ data, isLoading }) => {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 bg-slate-200 animate-pulse rounded mb-6" />
        {[1,2,3].map(i => <div key={i} className="h-24 bg-slate-200 animate-pulse rounded-2xl" />)}
      </div>
    );
  }

  const timestamp = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

  if (!data || data.length === 0) {
    return (
      <div className="bg-white p-12 rounded-2xl border border-emerald-200 shadow-sm flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
          <ShieldAlert className="w-10 h-10 text-emerald-500" />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-800">Sistema operando con normalidad ✓</h2>
        <p className="text-slate-500 font-medium mt-2 max-w-sm">
          No hay alertas críticas ni retrasos detectados en este momento. La operación fluye sin interrupciones.
        </p>
        <span className="text-xs font-bold text-slate-400 mt-6 bg-slate-100 px-3 py-1 rounded-full">Actualizado: {timestamp}</span>
      </div>
    );
  }

  // Ordenar alertas: Critico (rojo), Medio (ambar), Info (azul)
  const sortedAlerts = [...data].sort((a, b) => {
    const weights: Record<string, number> = { critico: 3, medio: 2, info: 1 };
    return (weights[b.tipo] || 0) - (weights[a.tipo] || 0);
  });

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex justify-between items-center mb-6 px-1">
        <h3 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
          <Bell className="w-6 h-6 text-indigo-500" /> 
          Alertas Automáticas del Sistema
        </h3>
        <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
          Actualizado: {timestamp}
        </span>
      </div>

      <AnimatePresence>
        {sortedAlerts.map((alerta, index) => {
          let bgColor = 'bg-slate-50';
          let borderColor = 'border-slate-200';
          let textColorTitle = 'text-slate-800';
          let textColorMsg = 'text-slate-600';
          let Icon = Info;
          let iconColor = 'text-slate-500';

          if (alerta.tipo === 'critico') {
            bgColor = 'bg-rose-50';
            borderColor = 'border-rose-200';
            textColorTitle = 'text-rose-900';
            textColorMsg = 'text-rose-700';
            Icon = ShieldAlert;
            iconColor = 'text-rose-600';
          } else if (alerta.tipo === 'medio') {
            bgColor = 'bg-amber-50';
            borderColor = 'border-amber-200';
            textColorTitle = 'text-amber-900';
            textColorMsg = 'text-amber-700';
            Icon = AlertTriangle;
            iconColor = 'text-amber-600';
          } else if (alerta.tipo === 'info') {
            bgColor = 'bg-blue-50';
            borderColor = 'border-blue-200';
            textColorTitle = 'text-blue-900';
            textColorMsg = 'text-blue-700';
            Icon = Info;
            iconColor = 'text-blue-600';
          }

          return (
            <motion.div 
              key={index}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`p-5 rounded-2xl border flex items-start sm:items-center gap-4 shadow-sm flex-col sm:flex-row ${bgColor} ${borderColor}`}
            >
              <div className={`p-3 bg-white rounded-xl shrink-0 shadow-sm border ${borderColor}`}>
                <Icon className={`w-6 h-6 ${iconColor}`} strokeWidth={2.5}/>
              </div>
              
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-white border shadow-sm ${borderColor} ${iconColor}`}>
                    {alerta.categoria}
                  </span>
                  <h4 className={`text-base font-extrabold ${textColorTitle}`}>{alerta.titulo}</h4>
                </div>
                <p className={`text-sm font-medium leading-relaxed ${textColorMsg}`}>{alerta.mensaje}</p>
              </div>

              {alerta.accion && (
                <button className={`mt-3 sm:mt-0 shrink-0 flex items-center gap-1.5 px-4 py-2 font-bold text-sm bg-white border shadow-sm rounded-lg hover:bg-slate-50 transition-colors ${borderColor} ${iconColor}`}>
                  {alerta.accion} <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );
};

export default PanelAlertas;
