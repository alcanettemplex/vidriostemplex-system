import React from 'react';
import { LucideIcon } from 'lucide-react';

interface KPICardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  accent: 'blue' | 'purple' | 'red' | 'orange' | 'green';
  sublabel?: string;
  progress?: { current: number; target: number; unit?: string };
}

const ACCENTS: Record<KPICardProps['accent'], { badge: string; icon: string; bar: string }> = {
  blue:   { badge: 'bg-apple-blue/10',   icon: 'text-apple-blue',   bar: 'bg-apple-blue' },
  purple: { badge: 'bg-apple-purple/10', icon: 'text-apple-purple', bar: 'bg-apple-purple' },
  red:    { badge: 'bg-apple-red/10',    icon: 'text-apple-red',    bar: 'bg-apple-red' },
  orange: { badge: 'bg-apple-orange/10', icon: 'text-apple-orange', bar: 'bg-apple-orange' },
  green:  { badge: 'bg-apple-green/10',  icon: 'text-apple-green',  bar: 'bg-apple-green' },
};

const KPICard: React.FC<KPICardProps> = ({ label, value, icon: Icon, accent, sublabel, progress }) => {
  const colors = ACCENTS[accent];
  const pct = progress ? Math.min(100, Math.round((progress.current / progress.target) * 100)) : null;

  return (
    <div className="bg-white rounded-[20px] shadow-apple p-5 flex flex-col gap-3 min-w-0">
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-semibold text-apple-text-tertiary uppercase tracking-widest">{label}</span>
        <div className={`w-9 h-9 rounded-full ${colors.badge} flex items-center justify-center shrink-0`}>
          <Icon className={`w-4.5 h-4.5 ${colors.icon}`} size={18} />
        </div>
      </div>

      <p className="text-4xl font-bold text-apple-text tracking-tight truncate">{value}</p>

      {sublabel && <p className="text-xs text-apple-text-secondary font-medium truncate">{sublabel}</p>}

      {progress && pct !== null && (
        <div className="mt-1">
          <div className="w-full h-1.5 rounded-full bg-apple-gray overflow-hidden">
            <div
              className={`h-full rounded-full ${colors.bar} transition-all duration-700`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[11px] font-medium text-apple-text-tertiary mt-1.5">
            Meta: {progress.target}{progress.unit || ''} · {pct}% alcanzado
          </p>
        </div>
      )}
    </div>
  );
};

export default KPICard;
