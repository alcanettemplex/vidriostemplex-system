import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X, Star, Search } from '../ui/icons';
import { TemplexLogo } from '../ui/TemplexLogo';
import { ItemMenu, areasVisiblesPara, esRutaActiva } from './navegacion';
import type { Favoritos } from './useFavoritos';

/**
 * Navegación en tablet y celular (< 1024px), donde las seis áreas no caben en una fila sin
 * apretarse. Panel que entra desde la izquierda con las áreas como secciones y, arriba, los
 * favoritos. Mismo mapa y mismo filtro por rol que la barra de escritorio (./navegacion.ts).
 *
 * Reemplaza al antiguo menú lateral fijo (Sidebar.tsx, retirado el 2026-09-28): en escritorio la
 * navegación vive en la barra superior y el contenido usa todo el ancho.
 */

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  rol: string;
  favoritos: Favoritos;
  onBuscar: () => void;
}

const MenuMovil: React.FC<Props> = ({ abierto, onCerrar, rol, favoritos, onBuscar }) => {
  const { pathname } = useLocation();
  const grupos = areasVisiblesPara(rol);
  const favs = grupos.flatMap(g => g.items).filter(i => favoritos.esFavorito(i.path));

  // Cerrar al navegar
  useEffect(() => {
    onCerrar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a la ruta
  }, [pathname]);

  // Bloquear el scroll de la página detrás del panel
  useEffect(() => {
    document.body.style.overflow = abierto ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [abierto]);

  const Enlace: React.FC<{ item: ItemMenu }> = ({ item }) => {
    const activo = esRutaActiva(pathname, item.path);
    const Icono = item.icon;
    return (
      <Link to={item.path} onClick={onCerrar} aria-current={activo ? 'page' : undefined}
        className={`relative flex items-center gap-3 h-11 px-3 rounded-lg text-[14px] transition-colors ${activo
          ? 'bg-white/[0.09] text-white font-semibold ring-1 ring-inset ring-white/[0.07]'
          : 'text-[#c3cad6] font-medium hover:bg-white/[0.05] hover:text-white'}`}>
        {activo && <span className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r-full bg-templex-400" aria-hidden="true" />}
        <Icono size={19} weight="duotone" className={activo ? 'text-templex-300' : 'text-[#8591a5]'} />
        <span className="truncate">{item.text}</span>
      </Link>
    );
  };

  return (
    <>
      <div className={`fixed inset-0 bg-slate-950/50 backdrop-blur-[2px] z-[60] lg:hidden transition-opacity duration-300 ${abierto ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onCerrar} aria-hidden="true" />

      <aside aria-label="Navegación" aria-hidden={!abierto}
        className={`fixed left-0 top-0 bottom-0 w-[18rem] max-w-[85vw] flex flex-col lg:hidden z-[61]
          bg-gradient-to-b from-[#101a2e] via-[#0c1424] to-[#090e19] border-r border-white/[0.06]
          transition-transform duration-300 ease-out ${abierto ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-16 shrink-0 flex items-center justify-between px-5 border-b border-white/[0.06]">
          <Link to="/" onClick={onCerrar} aria-label="Ir al inicio">
            <TemplexLogo tono="blanco" className="h-9 w-32 justify-start" />
          </Link>
          <button onClick={onCerrar} className="p-2 -mr-2 rounded-lg text-[#9aa4b5] hover:text-white hover:bg-white/[0.08] transition" aria-label="Cerrar menú">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-3 pt-3">
          <button type="button" onClick={() => { onCerrar(); onBuscar(); }}
            className="w-full flex items-center gap-2.5 h-10 px-3 rounded-lg bg-white/[0.06] text-[#c3cad6] text-[13.5px] hover:bg-white/[0.1] hover:text-white transition">
            <Search size={16} /> Buscar módulo…
          </button>
        </div>

        <nav className="flex-1 px-3 pt-4 pb-6 space-y-5 overflow-y-auto [scrollbar-color:rgba(255,255,255,0.14)_transparent]">
          {favs.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-300">
                <Star size={12} weight="fill" /> Favoritos
              </p>
              <div className="space-y-0.5">{favs.map(item => <Enlace key={`f-${item.path}`} item={item} />)}</div>
            </div>
          )}
          {grupos.map(({ area, items }) => (
            <div key={area.id}>
              <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8591a5]">{area.label}</p>
              <div className="space-y-0.5">{items.map(item => <Enlace key={item.path} item={item} />)}</div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 px-5 py-4 border-t border-white/[0.06]">
          <p className="text-[12px] font-medium text-[#c3cad6]">Respaldo y confianza</p>
          <p className="text-[11px] text-[#8591a5]">Vidrios Templex · ERP v1.0</p>
        </div>
      </aside>
    </>
  );
};

export default MenuMovil;
