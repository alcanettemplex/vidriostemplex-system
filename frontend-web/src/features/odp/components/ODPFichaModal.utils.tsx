import React from 'react';
import { getTmEstadoConfig, tmVisitaRealizada } from '../../../utils/tmEstado';

export const estadoProdColor: Record<string, string> = {
  EN_ESPERA: 'bg-slate-100 text-slate-700 border-slate-200',
  MEDICION: 'bg-sky-100 text-sky-700 border-sky-200',
  ALUMINIO_CORTADO: 'bg-blue-100 text-blue-700 border-blue-200',
  VIDRIO_RECIBIDO: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  ACCESORIOS_SEPARADOS: 'bg-teal-100 text-teal-700 border-teal-200',
  LISTO_INSTALAR: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  PROGRAMADA: 'bg-amber-100 text-amber-700 border-amber-200',
  INSTALADA: 'bg-green-100 text-green-700 border-green-200',
  ENTREGADA: 'bg-gray-100 text-gray-700 border-gray-200',
  PAUSADA: 'bg-rose-100 text-rose-700 border-rose-200',
};

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

export const Badge: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${className}`}>{children}</span>
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
