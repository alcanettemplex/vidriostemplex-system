import React from 'react';
import { RefreshCw, Inbox } from 'lucide-react';
import { MotivoPerdida } from '../types';

const COLORS = ['bg-rose-500', 'bg-amber-500', 'bg-violet-500', 'bg-indigo-500', 'bg-sky-500', 'bg-slate-400', 'bg-emerald-500', 'bg-fuchsia-500'];

interface Props {
  motivos: MotivoPerdida[];
  loading: boolean;
}

const MotivosPerdidaPanel: React.FC<Props> = ({ motivos, loading }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 gap-2 text-sm font-medium">
        <RefreshCw className="w-4 h-4 animate-spin" /> Cargando motivos de pérdida...
      </div>
    );
  }

  if (motivos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-300">
        <Inbox className="w-10 h-10" />
        <p className="text-sm font-semibold text-slate-400">Sin leads perdidos en este período — buena señal.</p>
      </div>
    );
  }

  const total = motivos.reduce((s, m) => s + m.total, 0);

  return (
    <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.05)] p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-base font-extrabold text-slate-800">Motivos de Pérdida del período</h3>
        <span className="text-xs font-bold text-slate-400">{total} lead{total !== 1 ? 's' : ''} perdido{total !== 1 ? 's' : ''}</span>
      </div>
      <div className="space-y-4">
        {motivos.map((m, i) => {
          const pct = total > 0 ? Math.round((m.total / total) * 100) : 0;
          return (
            <div key={m.motivo} className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-600 w-56 truncate">{m.motivo}</span>
              <div className="flex-1 h-2.5 rounded-full bg-slate-50 overflow-hidden">
                <div
                  className={`h-full rounded-full ${COLORS[i % COLORS.length]} transition-all duration-700`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs font-black text-slate-700 w-20 text-right">{m.total} ({pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MotivosPerdidaPanel;
