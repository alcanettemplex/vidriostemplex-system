import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, AlertTriangle, Info, ShieldAlert, ArrowRight } from 'lucide-react';

export const PanelAlertas: React.FC<{ data: any[], isLoading: boolean, onViewOdp?: (id: number) => void }> = ({ data, isLoading, onViewOdp }) => {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex justify-between items-center mb-4">
          <div className="h-4 w-48 bg-slate-200 animate-pulse rounded" />
          <div className="h-4 w-24 bg-slate-200 animate-pulse rounded" />
        </div>
        {[1,2,3].map(i => <div key={i} className="h-16 bg-white border border-slate-200 animate-pulse rounded" />)}
      </div>
    );
  }

  const timestamp = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

  if (!data || data.length === 0) {
    return (
      <div className="bg-white p-6 rounded border border-emerald-100 flex flex-col items-center justify-center text-center">
        <ShieldAlert className="w-8 h-8 text-emerald-500 mb-3" strokeWidth={1.5} />
        <h2 className="text-[14px] font-medium text-slate-800 mb-1">Sistema operando con normalidad</h2>
        <p className="text-[12px] text-slate-500 max-w-sm">No hay alertas críticas ni retrasos detectados en este momento. La operación fluye sin interrupciones.</p>
        <span className="text-[9px] uppercase font-bold text-slate-400 mt-4 tracking-wider">Actualizado: {timestamp}</span>
      </div>
    );
  }

  // Ordenar alertas: Critico (rojo), Medio (ambar), Info (azul)
  const sortedAlerts = [...data].sort((a, b) => {
    const weights: Record<string, number> = { critico: 3, medio: 2, info: 1 };
    return (weights[b.tipo] || 0) - (weights[a.tipo] || 0);
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center mb-4 px-1 border-b border-slate-100 pb-2">
        <h3 className="text-[12px] font-medium text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <Bell className="w-4 h-4 text-slate-500" /> 
          Alertas de Sistema
        </h3>
        <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
          {timestamp}
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
              className={`p-3 rounded border flex items-start gap-3 flex-col sm:flex-row ${bgColor} ${borderColor}`}
            >
              <div className={`p-1.5 bg-white rounded flex shrink-0 border ${borderColor}`}>
                <Icon className={`w-4 h-4 ${iconColor}`} strokeWidth={2}/>
              </div>
              
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[9px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-white border ${borderColor} ${iconColor}`}>
                    {alerta.categoria}
                  </span>
                  <h4 className={`text-[12px] font-medium ${textColorTitle}`}>{alerta.titulo}</h4>
                </div>
                <p className={`text-[11px] font-normal leading-relaxed ${textColorMsg}`}>{alerta.mensaje}</p>
              </div>

              {alerta.accion && (
                <button 
                  onClick={() => {
                    if (alerta.odp_id && onViewOdp) {
                      onViewOdp(alerta.odp_id);
                    }
                  }}
                  className={`mt-2 sm:mt-0 shrink-0 flex items-center gap-1.5 px-3 py-1.5 font-medium text-[11px] bg-white border rounded hover:bg-slate-50 transition-colors ${borderColor} ${iconColor}`}
                >
                  {alerta.accion} <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default PanelAlertas;
