import React from 'react';
import { getTmEstadoConfig, tmVisitaRealizada } from '../../../utils/tmEstado';

// Los colores/nombres de estado_produccion viven en `utils/estadosODP` (fuente única).

export const cajaColor: Record<string, string> = {
  PENDIENTE: 'bg-rose-100 text-rose-700',
  ABONADO: 'bg-blue-100 text-blue-700',
  CANCELADO: 'bg-emerald-100 text-emerald-700',
  CREDITO_APROBADO: 'bg-indigo-100 text-indigo-700',
};

export const getTmEstado = (estado: string) => {
  const cfg = getTmEstadoConfig(estado);
  return { label: cfg.label, cls: cfg.badgeCls };
};

export const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);

export const InfoRow: React.FC<{ label: string; value?: any; icon?: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="flex items-start gap-2 py-2 border-b border-slate-50 last:border-0">
    {icon && <span className="mt-0.5 text-slate-400 flex-shrink-0">{icon}</span>}
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-800 mt-0.5 truncate">{value || '—'}</p>
    </div>
  </div>
);

export const Badge: React.FC<{ className?: string; title?: string; children: React.ReactNode }> = ({ className, title, children }) => (
  <span title={title} className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${className}`}>{children}</span>
);

export const normalizarItemLabel = (item: string): string => {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (/^[A-Z]$/.test(item)) return item;
  const pos = parseInt(item, 10);
  if (!isNaN(pos) && pos >= 27) {
    const idx = pos - 1;
    return abc[Math.floor(idx / 26) - 1] + abc[idx % 26];
  }
  return item;
};

export { tmVisitaRealizada };
