import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { X } from '../ui/icons';
import { TemplexLogo } from '../ui/TemplexLogo';
import { SECTION_LABELS, esRutaActiva, itemsVisiblesPara, ItemMenu } from './navegacion';

/**
 * Menú lateral — sistema visual "Cristal y Aluminio" (2026-09-25).
 *
 * Panel azul noche de altura completa con el logo en blanco: separa la
 * navegación del área de trabajo sin competir con ella. El mapa de ítems y el
 * filtro por rol viven en ./navegacion.ts (compartidos con la barra superior).
 *
 * En móvil es un cajón que se abre desde la barra superior; en escritorio queda
 * fijo. Ancho (w-64) y alto de cabecera (h-16) son los que AppShell y las
 * páginas ya descuentan con md:pl-64 / pt-16: no cambiarlos por separado.
 */

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const location = useLocation();
  const user = useSelector((state: any) => state.auth.user);

  // Cerrar al navegar a otra ruta
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Bloquear scroll del body cuando el drawer está abierto en mobile
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const userRole = (user?.rol || user?.role)?.toLowerCase() || '';

  // Agrupar por sección para mostrar separadores
  const sections = itemsVisiblesPara(userRole).reduce((acc: Record<string, ItemMenu[]>, item) => {
    if (!acc[item.section]) acc[item.section] = [];
    acc[item.section].push(item);
    return acc;
  }, {});

  return (
    <>
      {/* Backdrop — solo mobile */}
      <div
        className={`fixed inset-0 bg-slate-950/50 backdrop-blur-[2px] z-40 md:hidden transition-opacity duration-300
          ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer / Sidebar */}
      <aside
        className={`
          fixed left-0 top-0 bottom-0 w-64 flex flex-col
          bg-gradient-to-b from-[#101a2e] via-[#0c1424] to-[#090e19]
          border-r border-white/[0.06]
          z-[60] transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 md:z-30
        `}
      >
        {/* Resplandor de marca: luz fría sobre la esquina superior, como reflejo en vidrio */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(120%_80%_at_0%_0%,rgba(52,116,242,0.22),transparent_60%)]"
          aria-hidden="true"
        />

        {/* Cabecera — misma altura que la barra superior */}
        <div className="relative h-16 shrink-0 flex items-center justify-between px-5 border-b border-white/[0.06]">
          <Link to="/" onClick={onClose} aria-label="Ir al inicio">
            <TemplexLogo tono="blanco" className="h-9 w-32 justify-start" />
          </Link>
          <button
            onClick={onClose}
            className="md:hidden p-2 -mr-2 rounded-lg text-[#9aa4b5] hover:text-white hover:bg-white/[0.08] transition"
            aria-label="Cerrar menú"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Menú con secciones */}
        <nav className="relative flex-1 px-3 pt-4 pb-6 space-y-6 overflow-y-auto [scrollbar-color:rgba(255,255,255,0.14)_transparent]">
          {Object.entries(sections).map(([section, items]) => (
            <div key={section}>
              <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8591a5]">
                {SECTION_LABELS[section] || section}
              </p>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const isActive = esRutaActiva(location.pathname, item.path);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.text}
                      to={item.path}
                      onClick={onClose}
                      aria-current={isActive ? 'page' : undefined}
                      className={`group relative flex items-center gap-3 h-10 px-3 rounded-lg text-[13.5px] transition-colors duration-150 ${isActive
                        ? 'bg-white/[0.09] text-white font-semibold ring-1 ring-inset ring-white/[0.07]'
                        : 'text-[#c3cad6] font-medium hover:bg-white/[0.05] hover:text-white'
                        }`}
                    >
                      {isActive && (
                        <span
                          className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r-full bg-templex-400 shadow-[0_0_12px_rgba(89,151,251,0.8)]"
                          aria-hidden="true"
                        />
                      )}
                      <Icon
                        size={19}
                        weight="duotone"
                        className={`shrink-0 transition-colors ${isActive ? 'text-templex-300' : 'text-[#8591a5] group-hover:text-[#dfe4ec]'}`}
                      />
                      <span className="truncate">{item.text}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Pie — lema de la marca */}
        <div className="relative shrink-0 px-5 py-4 border-t border-white/[0.06]">
          <p className="text-[12px] font-medium text-[#c3cad6]">Respaldo y confianza</p>
          <p className="text-[11px] text-[#8591a5]">Vidrios Templex · ERP v1.0</p>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
