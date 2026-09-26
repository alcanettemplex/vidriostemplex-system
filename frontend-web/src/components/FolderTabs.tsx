import React, { useCallback, useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Barra de pestañas estilo "carpeta de archivador" (manila): solapas con esquinas
// superiores redondeadas; la activa queda blanca y se funde con el panel de abajo.
// Cada pestaña inactiva tiene un color suave ÚNICO (paleta de pasteles fríos).
// La activa usa acento índigo uniforme.
//
// Los íconos heredan el color del texto vía currentColor (pásalos SIN clase de
// color para que tomen el color de la pestaña). badge/icon admiten cualquier nodo.
//
// Uso:
//   <div className="relative">
//     <FolderTabs tabs={tabs} activeKey={tab} onChange={setTab} />
//     <div className={FOLDER_BODY}> ...contenido del tab activo... </div>
//   </div>
// ─────────────────────────────────────────────────────────────────────────────

export interface FolderTabItem {
  key: string;
  label: string;
  icon?: React.ReactNode;   // elemento ya renderizado (hereda color vía currentColor)
  badge?: React.ReactNode;  // contador/pill opcional (número, texto…)
  badgeClassName?: string;  // color del badge cuando está inactiva (override del de la paleta)
}

// Paleta de pasteles fríos — un color único por pestaña (asignado por índice).
// Clases completas como literales para que Tailwind JIT las incluya.
const PALETA = [
  { bg: 'bg-sky-100',     text: 'text-sky-700',     border: 'border-sky-200',     hover: 'hover:bg-sky-200/70',     badge: 'bg-sky-200/70 text-sky-800' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', hover: 'hover:bg-emerald-200/70', badge: 'bg-emerald-200/70 text-emerald-800' },
  { bg: 'bg-violet-100',  text: 'text-violet-700',  border: 'border-violet-200',  hover: 'hover:bg-violet-200/70',  badge: 'bg-violet-200/70 text-violet-800' },
  { bg: 'bg-teal-100',    text: 'text-teal-700',    border: 'border-teal-200',    hover: 'hover:bg-teal-200/70',    badge: 'bg-teal-200/70 text-teal-800' },
  { bg: 'bg-cyan-100',    text: 'text-cyan-700',    border: 'border-cyan-200',    hover: 'hover:bg-cyan-200/70',    badge: 'bg-cyan-200/70 text-cyan-800' },
  { bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-200',    hover: 'hover:bg-blue-200/70',    badge: 'bg-blue-200/70 text-blue-800' },
  { bg: 'bg-indigo-100',  text: 'text-indigo-700',  border: 'border-indigo-200',  hover: 'hover:bg-indigo-200/70',  badge: 'bg-indigo-200/70 text-indigo-800' },
  { bg: 'bg-fuchsia-100', text: 'text-fuchsia-700', border: 'border-fuchsia-200', hover: 'hover:bg-fuchsia-200/70', badge: 'bg-fuchsia-200/70 text-fuchsia-800' },
  { bg: 'bg-green-100',   text: 'text-green-700',   border: 'border-green-200',   hover: 'hover:bg-green-200/70',   badge: 'bg-green-200/70 text-green-800' },
];

// Clase del cuerpo de la carpeta (panel de contenido). Reutilizable por las páginas.
export const FOLDER_BODY = 'bg-white border border-slate-200 rounded-b-2xl rounded-tr-2xl shadow-sm';

interface Props {
  tabs: FolderTabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
}

/**
 * Cuando las pestañas no caben (Instalaciones tiene 7), la barra se desplaza de lado.
 * Antes nada lo indicaba y la última pestaña quedaba cortada a la mitad: ahora el
 * borde por el que hay más pestañas se desvanece, y la activa se trae a la vista.
 * Se usa máscara (no un degradado pintado encima) porque el fondo detrás de la barra
 * cambia según la página.
 */
const FolderTabs: React.FC<Props> = ({ tabs, activeKey, onChange, className = '' }) => {
  const barraRef = useRef<HTMLDivElement>(null);
  const [desborde, setDesborde] = useState({ izquierda: false, derecha: false });

  const medir = useCallback(() => {
    const el = barraRef.current;
    if (!el) return;
    const izquierda = el.scrollLeft > 2;
    const derecha = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setDesborde(prev => (prev.izquierda === izquierda && prev.derecha === derecha ? prev : { izquierda, derecha }));
  }, []);

  useEffect(() => {
    const el = barraRef.current;
    if (!el) return;
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    el.addEventListener('scroll', medir, { passive: true });
    return () => {
      observador.disconnect();
      el.removeEventListener('scroll', medir);
    };
  }, [medir, tabs.length]);

  // Solo desplaza la barra (horizontal): scrollIntoView movería también la página.
  useEffect(() => {
    const el = barraRef.current;
    const activa = el?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!el || !activa) return;
    const inicio = activa.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
    const fin = inicio + activa.offsetWidth;
    if (inicio < el.scrollLeft) el.scrollLeft = inicio - 16;
    else if (fin > el.scrollLeft + el.clientWidth) el.scrollLeft = fin - el.clientWidth + 16;
  }, [activeKey]);

  const mascara =
    desborde.izquierda && desborde.derecha ? '[mask-image:linear-gradient(to_right,transparent,black_40px,black_calc(100%-40px),transparent)]'
    : desborde.derecha ? '[mask-image:linear-gradient(to_right,black_calc(100%-48px),transparent)]'
    : desborde.izquierda ? '[mask-image:linear-gradient(to_right,transparent,black_48px)]'
    : '';

  return (
    <div ref={barraRef} role="tablist" className={`flex items-end gap-1 px-2 pt-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${mascara} ${className}`}>
      {tabs.map((t, i) => {
        const c = PALETA[i % PALETA.length];
        const activo = t.key === activeKey;
        const hasBadge = t.badge !== undefined && t.badge !== null && t.badge !== '';
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={activo}
            onClick={() => onChange(t.key)}
            className={`flex-shrink-0 flex items-center justify-center gap-1.5 px-4 rounded-t-xl border border-b-0 transition-all ${
              activo
                ? 'bg-white border-slate-200 text-indigo-700 pt-2.5 pb-3 -mb-px z-10 shadow-[0_-2px_6px_rgba(15,23,42,0.06)]'
                : `${c.bg} ${c.border} ${c.text} ${c.hover} pt-2 pb-2.5`
            }`}
          >
            {t.icon}
            <span className={`whitespace-nowrap text-sm ${activo ? 'font-semibold' : 'font-medium'}`}>{t.label}</span>
            {hasBadge && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${activo ? 'bg-indigo-100 text-indigo-700' : (t.badgeClassName || c.badge)}`}>
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default FolderTabs;
