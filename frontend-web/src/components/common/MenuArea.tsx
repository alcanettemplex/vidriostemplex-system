import React, { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Star } from '../ui/icons';
import { Area, ItemMenu, esRutaActiva } from './navegacion';
import type { Favoritos } from './useFavoritos';

/**
 * Un área de la barra superior (Comercial, Producción…) y su panel de módulos.
 *
 * - Área con un solo módulo visible para el rol: enlace directo con el NOMBRE DEL MÓDULO, sin
 *   panel. Un instalador ve "Dashboard · Cotizador · Instalaciones · Manuales": un botón
 *   "Comercial" que lleva al Cotizador confundiría, y un desplegable de un ítem es un clic de más.
 * - Área activa (contiene la página actual): se marca y muestra debajo el módulo en el que está
 *   el usuario, así la barra hace también de ruta de migas sin gastar una segunda fila.
 * - El panel lista cada módulo con icono, nombre y una línea de para qué sirve, y una ★ para
 *   marcarlo como favorito. Se alinea a la derecha si no cabe en la pantalla.
 *
 * El estado abierto/cerrado lo lleva la barra (una sola área abierta a la vez).
 */

interface MenuAreaProps {
  area: Area;
  items: ItemMenu[];
  pathname: string;
  abierta: boolean;
  onAbrir: () => void;
  onCerrar: () => void;
  /** El mouse entró al botón: si otra área está abierta, la barra pasa a esta. */
  onHover: () => void;
  favoritos: Favoritos;
  /** Pantallas medianas: rótulos más compactos. */
  compacta: boolean;
}

const MenuArea: React.FC<MenuAreaProps> = ({
  area, items, pathname, abierta, onAbrir, onCerrar, onHover, favoritos, compacta,
}) => {
  const boton = useRef<HTMLButtonElement>(null);
  const [alDerecha, setAlDerecha] = useState(false);
  const activo = items.find(i => esRutaActiva(pathname, i.path));
  const directo = items.length === 1 ? items[0] : null;
  const anchoPanel = items.length > 4 ? 620 : 360;

  useLayoutEffect(() => {
    if (!abierta || !boton.current) return;
    const r = boton.current.getBoundingClientRect();
    setAlDerecha(r.left + anchoPanel > window.innerWidth - 16);
  }, [abierta, anchoPanel]);

  const Rotulo = (
    <span className="flex flex-col items-start leading-tight min-w-0">
      {activo ? (
        <>
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-templex-300">{area.label}</span>
          <span className={`text-[13px] font-semibold text-white truncate ${compacta ? 'max-w-[7.5rem]' : 'max-w-[11rem]'}`}>{activo.text}</span>
        </>
      ) : (
        <span className="text-[13.5px] font-medium">{area.label}</span>
      )}
    </span>
  );

  const clases = `relative flex items-center gap-1.5 h-12 ${compacta ? 'px-2.5' : 'px-3'} rounded-xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-templex-400 ${
    activo ? 'bg-white/[0.09] text-white ring-1 ring-inset ring-white/[0.07]'
      : abierta ? 'bg-white/[0.07] text-white'
        : 'text-[#c3cad6] hover:bg-white/[0.05] hover:text-white'}`;

  const Indicador = activo ? (
    <span className="absolute left-3 right-3 -bottom-[8px] h-[3px] rounded-t-full bg-templex-400 shadow-[0_0_12px_rgba(89,151,251,0.8)]" aria-hidden="true" />
  ) : null;

  if (directo) {
    return (
      <Link to={directo.path} className={clases} aria-current={activo ? 'page' : undefined}
        title={directo.descripcion} onMouseEnter={onHover}>
        <span className={`text-[13.5px] ${activo ? 'font-semibold' : 'font-medium'}`}>{directo.text}</span>
        {Indicador}
      </Link>
    );
  }

  return (
    <div className="relative">
      <button ref={boton} type="button" className={clases}
        aria-haspopup="true" aria-expanded={abierta}
        onClick={() => (abierta ? onCerrar() : onAbrir())}
        onMouseEnter={onHover}>
        {Rotulo}
        {!compacta && <ChevronDown size={13} className={`shrink-0 transition-transform ${abierta ? 'rotate-180' : ''} ${activo ? 'text-templex-300' : 'text-[#8591a5]'}`} />}
        {Indicador}
      </button>

      {abierta && (
        <div role="menu" aria-label={area.label}
          className={`absolute top-full mt-3 ${alDerecha ? 'right-0' : 'left-0'} bg-white rounded-2xl shadow-float ring-1 ring-slate-200/80 p-2 z-50`}
          style={{ width: `min(${anchoPanel}px, calc(100vw - 2rem))` }}>
          <p className="px-3 pt-1.5 pb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-700">{area.label}</p>
          <div className={`grid gap-0.5 ${items.length > 4 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {items.map(item => {
              const actual = esRutaActiva(pathname, item.path);
              const fav = favoritos.esFavorito(item.path);
              const Icono = item.icon;
              return (
                <div key={item.path} className={`group relative flex items-start gap-3 rounded-xl p-2.5 transition-colors ${actual ? 'bg-templex-50 ring-1 ring-inset ring-templex-100' : 'hover:bg-slate-50'}`}>
                  <Link to={item.path} role="menuitem" onClick={onCerrar} aria-current={actual ? 'page' : undefined}
                    className="flex items-start gap-3 flex-1 min-w-0 outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-templex-400">
                    <span className={`grid place-items-center w-9 h-9 rounded-lg shrink-0 ring-1 ring-inset ${actual ? 'bg-templex-600 text-white ring-templex-600' : 'bg-templex-50 text-templex-600 ring-templex-100'}`}>
                      <Icono size={19} weight="duotone" />
                    </span>
                    <span className="min-w-0 pr-6">
                      <span className="block text-[13.5px] font-semibold text-slate-900">{item.text}</span>
                      <span className="block text-[12px] text-slate-700 leading-snug mt-0.5">{item.descripcion}</span>
                    </span>
                  </Link>
                  <button type="button" onClick={() => favoritos.alternar(item.path)}
                    aria-pressed={fav} aria-label={fav ? `Quitar ${item.text} de favoritos` : `Agregar ${item.text} a favoritos`}
                    title={fav ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                    className={`absolute top-2 right-2 z-10 grid place-items-center w-7 h-7 rounded-lg transition focus-visible:opacity-100 outline-none focus-visible:ring-2 focus-visible:ring-templex-400 ${
                      fav ? 'text-amber-500 opacity-100' : 'text-slate-400 opacity-0 group-hover:opacity-100 hover:text-amber-500 hover:bg-white'}`}>
                    <Star size={15} weight={fav ? 'fill' : 'bold'} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default MenuArea;
