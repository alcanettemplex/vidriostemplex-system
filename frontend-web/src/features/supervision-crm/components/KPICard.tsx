import React from 'react';
import { LucideIcon } from 'lucide-react';

interface KPICardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  accent: 'indigo' | 'violet' | 'rose' | 'amber' | 'emerald';
  sublabel?: string;
  progress?: { current: number; target: number; unit?: string };
}

const ACCENTS: Record<KPICardProps['accent'], { badge: string; icon: string; bar: string }> = {
  indigo:  { badge: 'bg-indigo-50',  icon: 'text-indigo-600',  bar: 'bg-indigo-600' },
  violet:  { badge: 'bg-violet-50',  icon: 'text-violet-600',  bar: 'bg-violet-600' },
  rose:    { badge: 'bg-rose-50',    icon: 'text-rose-600',    bar: 'bg-rose-500' },
  amber:   { badge: 'bg-amber-50',   icon: 'text-amber-600',   bar: 'bg-amber-500' },
  emerald: { badge: 'bg-emerald-50', icon: 'text-emerald-600', bar: 'bg-emerald-500' },
};

const KPICard: React.FC<KPICardProps> = ({ label, value, icon: Icon, accent, sublabel, progress }) => {
  const colors = ACCENTS[accent];
  const pct = progress ? Math.min(100, Math.round((progress.current / progress.target) * 100)) : null;

  return (
    <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.05)] p-5 flex flex-col gap-3 min-w-0">
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">{label}</span>
        <div className={`w-9 h-9 rounded-2xl ${colors.badge} flex items-center justify-center shrink-0`}>
          <Icon className={`w-4.5 h-4.5 ${colors.icon}`} size={18} />
        </div>
      </div>

      <p className="text-3xl font-extrabold text-slate-800 tracking-tight truncate">{value}</p>

      {sublabel && <p className="text-xs text-slate-400 font-medium truncate">{sublabel}</p>}

      {progress && pct !== null && (
        <div className="mt-1">
          <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full ${colors.bar} transition-all duration-700`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[11px] font-semibold text-slate-400 mt-1.5">
            Meta: {progress.target}{progress.unit || ''} · {pct}% alcanzado
          </p>
        </div>
      )}
    </div>
  );
};

export default KPICard;
