import React from 'react';
import type { IconComponent } from '../../../ui/icons';

/** Tarjeta de bloque: título + subtítulo + acción opcional. */
export const Bloque: React.FC<{
  titulo: string;
  subtitulo?: React.ReactNode;
  icono: IconComponent;
  accion?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ titulo, subtitulo, icono: Icono, accion, className = '', children }) => (
  <section className={`bg-white border border-slate-200 rounded-2xl shadow-card p-4 sm:p-5 min-w-0 ${className}`}>
    <header className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-start gap-2.5 min-w-0">
        <span className="w-8 h-8 shrink-0 rounded-lg bg-templex-50 ring-1 ring-templex-100 flex items-center justify-center">
          <Icono weight="duotone" className="w-[18px] h-[18px] text-templex-600" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-slate-900 leading-tight">{titulo}</h3>
          {subtitulo && <p className="text-[12px] text-slate-700 mt-0.5 leading-snug">{subtitulo}</p>}
        </div>
      </div>
      {accion}
    </header>
    {children}
  </section>
);

/** Título de sección grande entre bloques. */
export const TituloSeccion: React.FC<{ numero: number; titulo: string; detalle?: string }> = ({ numero, titulo, detalle }) => (
  <div className="flex items-baseline gap-2.5 pt-2">
    <span className="text-[11px] font-bold text-templex-700 bg-templex-50 ring-1 ring-templex-100 rounded-md px-1.5 py-0.5 tabular-nums">{numero}</span>
    <h2 className="text-[16px] font-bold text-slate-900">{titulo}</h2>
    {detalle && <span className="hidden sm:inline text-[12px] text-slate-700">{detalle}</span>}
  </div>
);

/** Barra horizontal proporcional (HTML, sin librería): marca delgada, extremo redondeado. */
export const BarraH: React.FC<{ valor: number; maximo: number; color: string; alto?: number; titulo?: string }> = ({
  valor, maximo, color, alto = 8, titulo,
}) => {
  const pct = maximo > 0 ? Math.max(0, Math.min(100, (valor / maximo) * 100)) : 0;
  return (
    <div className="w-full bg-slate-100 rounded-full overflow-hidden" style={{ height: alto }} title={titulo}>
      <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: color, minWidth: valor > 0 ? 3 : 0 }} />
    </div>
  );
};

/** Leyenda de series: punto de color + nombre en tinta de texto (nunca el color de la serie). */
export const Leyenda: React.FC<{ series: Array<{ color: string; nombre: string }> }> = ({ series }) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
    {series.map((s) => (
      <span key={s.nombre} className="inline-flex items-center gap-1.5 text-[12px] text-slate-800">
        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
        {s.nombre}
      </span>
    ))}
  </div>
);

export const Vacio: React.FC<{ texto: string }> = ({ texto }) => (
  <div className="py-8 text-center text-[13px] text-slate-700 bg-slate-50 rounded-xl border border-dashed border-slate-300">{texto}</div>
);
