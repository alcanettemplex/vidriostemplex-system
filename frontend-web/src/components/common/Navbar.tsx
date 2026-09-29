import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../../features/auth/authSlice';
import { clear } from '../../store/notificationsSlice';
import { RootState } from '../../store/store';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Bell, Menu, X, CheckCheck, ChevronDown, Search, Star } from '../ui/icons';
import { TemplexLogo } from '../ui/TemplexLogo';
import { areasVisiblesPara, areaPorId, etiquetaRol, itemDeRuta, itemsVisiblesPara, AreaId } from './navegacion';
import { useFavoritos } from './useFavoritos';
import MenuArea from './MenuArea';
import MenuMovil from './MenuMovil';
import LanzadorModulos from './LanzadorModulos';

/**
 * Barra de navegación global (2026-09-28) — reemplaza al menú lateral fijo.
 *
 *   [Logo]  Dashboard  Comercial▾  Producción▾  Logística▾  Finanzas▾  Administración▾   [Buscar ⌘K] [★] [🔔] [Usuario▾]
 *
 * - Las áreas y sus módulos salen de ./navegacion.ts (fuente única, filtrada por rol): un área sin
 *   módulos para el rol no aparece; con uno solo, es enlace directo.
 * - El área activa muestra el módulo actual: es la "ruta de migas" sin gastar otra fila.
 * - Alto fijo de 64px, el mismo de la barra anterior: varias pantallas calculan su alto con
 *   `calc(100vh - Npx)` y filtros fijos usan `top-16`. Cambiar el alto obliga a revisarlas.
 * - < 1024px: las áreas pasan a un panel lateral (MenuMovil) en vez de apretarse en una fila.
 * - Ctrl+K / ⌘K abre el buscador de módulos desde cualquier pantalla.
 */

const useClickFuera = (ref: React.RefObject<HTMLElement | null>, alSalir: () => void) => {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) alSalir();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, alSalir]);
};

const iniciales = (nombre?: string): string => {
  const partes = (nombre || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return 'U';
  return ((partes[0][0] || '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
};

/** true si la media query se cumple; se actualiza al redimensionar. */
const useMedia = (query: string): boolean => {
  const [ok, setOk] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setOk(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return ok;
};

const esMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** Botón de icono sobre la barra oscura. */
const botonBarra = (activo: boolean) =>
  `relative grid place-items-center w-9 h-9 rounded-lg transition outline-none focus-visible:ring-2 focus-visible:ring-templex-400 ${
    activo ? 'bg-white/[0.12] text-white' : 'text-[#c3cad6] hover:text-white hover:bg-white/[0.08]'}`;

const Navbar: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [areaAbierta, setAreaAbierta] = useState<AreaId | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [favOpen, setFavOpen] = useState(false);
  const [menuUsuarioOpen, setMenuUsuarioOpen] = useState(false);
  const [menuMovilOpen, setMenuMovilOpen] = useState(false);
  const [lanzadorOpen, setLanzadorOpen] = useState(false);

  const navRef = useRef<HTMLElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const favRef = useRef<HTMLDivElement>(null);
  const menuUsuarioRef = useRef<HTMLDivElement>(null);

  const notifications = useSelector((state: RootState) => state.notifications.notifications);
  const user = useSelector((state: RootState) => (state as any).auth.user);
  const unreadCount = notifications.length;

  const rol = (user?.rol || user?.role || '').toLowerCase();
  const grupos = areasVisiblesPara(rol);
  const visibles = itemsVisiblesPara(rol);
  const favoritos = useFavoritos();
  const listaFavoritos = visibles.filter(i => favoritos.esFavorito(i.path));
  const paginaActual = itemDeRuta(pathname);
  // Entre 1024 y 1279px las seis áreas completas no caben: rótulos compactos.
  const compacta = !useMedia('(min-width: 1280px)');

  useClickFuera(navRef, useCallback(() => setAreaAbierta(null), []));
  useClickFuera(notifRef, useCallback(() => setNotifOpen(false), []));
  useClickFuera(favRef, useCallback(() => setFavOpen(false), []));
  useClickFuera(menuUsuarioRef, useCallback(() => setMenuUsuarioOpen(false), []));

  // Cambiar de página cierra cualquier menú abierto.
  useEffect(() => { setAreaAbierta(null); setFavOpen(false); }, [pathname]);

  // Atajos globales: Ctrl/⌘+K abre el buscador; Escape cierra el área abierta.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAreaAbierta(null);
        setLanzadorOpen(v => !v);
      } else if (e.key === 'Escape') {
        setAreaAbierta(null);
        setFavOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleClearAll = () => {
    dispatch(clear());
    setNotifOpen(false);
  };

  const handleLogout = () => {
    dispatch(logout());
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const formatNotif = (n: any): string => {
    if (typeof n === 'string') return n;
    if (n?.mensaje) return n.mensaje;
    if (n?.message) return n.message;
    return JSON.stringify(n);
  };

  const fechaHoy = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <>
      <header className="fixed top-0 inset-x-0 h-16 z-50 flex items-center gap-2 lg:gap-4 px-3 sm:px-5 bg-gradient-to-r from-[#101a2e] via-[#0c1424] to-[#0c1424] border-b border-white/[0.06] shadow-[0_1px_0_rgba(255,255,255,0.03),0_8px_24px_-12px_rgba(8,11,17,0.5)]">
        {/* Resplandor de marca: luz fría sobre la esquina, como reflejo en vidrio */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-96 bg-[radial-gradient(80%_120%_at_0%_0%,rgba(52,116,242,0.20),transparent_65%)]" aria-hidden="true" />

        {/* ── Menú (tablet/celular) + logo ── */}
        <button onClick={() => setMenuMovilOpen(true)}
          className="lg:hidden relative p-2 -ml-1 rounded-lg text-[#c3cad6] hover:text-white hover:bg-white/[0.08] transition"
          aria-label="Abrir menú">
          <Menu className="w-5 h-5" />
        </button>
        <Link to="/" aria-label="Ir al inicio" className="relative shrink-0">
          <TemplexLogo tono="blanco" className="h-9 w-28 xl:w-32 justify-start" />
        </Link>

        {/* ── Áreas (escritorio) ── */}
        <nav ref={navRef} aria-label="Áreas del sistema" className="relative hidden lg:flex items-center gap-0.5 xl:gap-1 ml-2 xl:ml-4 min-w-0">
          {grupos.map(({ area, items }) => (
            <MenuArea key={area.id} area={area} items={items} pathname={pathname}
              abierta={areaAbierta === area.id}
              onAbrir={() => setAreaAbierta(area.id)}
              onCerrar={() => setAreaAbierta(null)}
              onHover={() => setAreaAbierta(actual => (actual && actual !== area.id ? area.id : actual))}
              favoritos={favoritos}
              compacta={compacta} />
          ))}
        </nav>

        {/* ── Ubicación (tablet/celular): el módulo actual junto al logo ── */}
        {paginaActual && (
          <div className="lg:hidden relative min-w-0 flex flex-col leading-tight ml-1 border-l border-white/10 pl-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-templex-300 truncate">{areaPorId(paginaActual.area).label}</span>
            <span className="text-[13px] font-semibold text-white truncate">{paginaActual.text}</span>
          </div>
        )}

        {/* ── Acciones ── */}
        <div className="relative ml-auto flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Buscador de módulos */}
          <button type="button" onClick={() => setLanzadorOpen(true)}
            className="hidden 2xl:flex items-center gap-2 h-9 w-56 pl-3 pr-2 rounded-lg bg-white/[0.06] ring-1 ring-inset ring-white/[0.08] text-[#c3cad6] text-[13px] hover:bg-white/[0.1] hover:text-white transition outline-none focus-visible:ring-2 focus-visible:ring-templex-400">
            <Search size={15} />
            <span className="flex-1 text-left">Buscar módulo…</span>
            <kbd className="text-[11px] font-semibold text-[#c3cad6] bg-white/[0.08] rounded px-1.5 py-0.5">{esMac ? '⌘K' : 'Ctrl K'}</kbd>
          </button>
          <button type="button" onClick={() => setLanzadorOpen(true)} className={`2xl:hidden ${botonBarra(false)}`}
            aria-label="Buscar módulo" title={`Buscar módulo (${esMac ? '⌘K' : 'Ctrl+K'})`}>
            <Search size={18} />
          </button>

          {/* Favoritos */}
          <div className="relative hidden sm:block" ref={favRef}>
            <button type="button" onClick={() => setFavOpen(v => !v)} className={botonBarra(favOpen)}
              aria-label="Favoritos" aria-expanded={favOpen} title="Favoritos">
              <Star size={18} weight={listaFavoritos.length ? 'fill' : 'bold'} className={listaFavoritos.length ? 'text-amber-300' : ''} />
            </button>
            {favOpen && (
              <div className="absolute right-0 top-full mt-3 w-72 bg-white rounded-2xl shadow-float ring-1 ring-slate-200/80 p-2 z-50">
                <p className="px-3 pt-1.5 pb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-700">Favoritos</p>
                {listaFavoritos.length === 0 ? (
                  <div className="px-3 pb-3 pt-1">
                    <p className="text-[13px] font-semibold text-slate-900">Aún no tienes favoritos</p>
                    <p className="text-[12px] text-slate-700 mt-0.5 leading-snug">Marca con ★ los módulos que más usas, desde el menú de cada área o el buscador.</p>
                  </div>
                ) : listaFavoritos.map(item => {
                  const Icono = item.icon;
                  return (
                    <Link key={item.path} to={item.path} onClick={() => setFavOpen(false)}
                      className="flex items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-slate-50 transition-colors">
                      <span className="grid place-items-center w-8 h-8 rounded-lg bg-templex-50 text-templex-600 ring-1 ring-inset ring-templex-100 shrink-0">
                        <Icono size={17} weight="duotone" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-semibold text-slate-900 truncate">{item.text}</span>
                        <span className="block text-[12px] text-slate-700 truncate">{areaPorId(item.area).label}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Campana de notificaciones */}
          <div className="relative" ref={notifRef}>
            <button onClick={() => setNotifOpen(prev => !prev)} className={botonBarra(notifOpen)} aria-label="Notificaciones" aria-expanded={notifOpen}>
              <Bell size={19} weight={unreadCount > 0 ? 'duotone' : 'bold'} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[17px] h-[17px] px-1 flex items-center justify-center text-[10.5px] font-bold text-white bg-rose-500 rounded-full leading-none ring-2 ring-[#0c1424]">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-full mt-3 w-[22rem] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-float ring-1 ring-slate-200/80 overflow-hidden z-50">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">Notificaciones</span>
                    {unreadCount > 0 && (
                      <span className="text-[11px] font-semibold text-templex-700 bg-templex-50 ring-1 ring-inset ring-templex-100 px-1.5 py-0.5 rounded-md">{unreadCount}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {unreadCount > 0 && (
                      <button onClick={handleClearAll}
                        className="flex items-center gap-1.5 text-xs font-semibold text-templex-700 hover:text-templex-800 px-2 py-1.5 rounded-lg hover:bg-templex-50 transition"
                        title="Marcar todas como leídas">
                        <CheckCheck className="w-3.5 h-3.5" /> Limpiar
                      </button>
                    )}
                    <button onClick={() => setNotifOpen(false)}
                      className="p-1.5 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition" aria-label="Cerrar notificaciones">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                      <span className="grid place-items-center w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 mb-3">
                        <Bell size={24} weight="duotone" />
                      </span>
                      <p className="text-sm font-medium text-slate-900">Estás al día</p>
                      <p className="text-xs text-slate-700 mt-0.5">Los avisos del sistema aparecerán aquí.</p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {notifications.map((n: any, i: number) => (
                        <li key={i} className="px-4 py-3 hover:bg-slate-50 transition-colors">
                          <div className="flex items-start gap-2.5">
                            <span className="w-2 h-2 rounded-full bg-templex-500 flex-shrink-0 mt-1.5" />
                            <p className="text-[13px] text-slate-800 leading-relaxed">{formatNotif(n)}</p>
                          </div>
                          {n?.fecha && (
                            <p className="text-[11px] text-slate-700 mt-1 ml-[18px]">
                              {new Date(n.fecha).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>

          <span className="hidden sm:block w-px h-6 bg-white/10 mx-0.5" aria-hidden="true" />

          {/* Menú de usuario */}
          <div className="relative" ref={menuUsuarioRef}>
            <button onClick={() => setMenuUsuarioOpen(prev => !prev)}
              className={`flex items-center gap-2.5 pl-1 pr-1 xl:pr-2 h-10 rounded-xl transition outline-none focus-visible:ring-2 focus-visible:ring-templex-400 ${menuUsuarioOpen ? 'bg-white/[0.12]' : 'hover:bg-white/[0.08]'}`}
              aria-label="Menú de usuario" aria-expanded={menuUsuarioOpen}>
              <span className="grid place-items-center w-8 h-8 rounded-lg bg-gradient-to-br from-templex-500 to-templex-700 text-white text-[12px] font-bold tracking-wide shadow-sm ring-1 ring-inset ring-white/20">
                {iniciales(user?.nombre_completo)}
              </span>
              <span className="hidden xl:flex flex-col items-start leading-tight text-left max-w-[10rem]">
                <span className="text-[13px] font-semibold text-white truncate max-w-full">{user?.nombre_completo || 'Usuario'}</span>
                <span className="text-[11.5px] text-[#9aa4b5] truncate max-w-full">{etiquetaRol(rol)}</span>
              </span>
              <ChevronDown size={14} className={`hidden xl:block text-[#8591a5] transition-transform ${menuUsuarioOpen ? 'rotate-180' : ''}`} />
            </button>

            {menuUsuarioOpen && (
              <div className="absolute right-0 top-full mt-3 w-64 bg-white rounded-2xl shadow-float ring-1 ring-slate-200/80 overflow-hidden z-50">
                <div className="px-4 py-3.5 border-b border-slate-100">
                  <p className="text-sm font-semibold text-slate-900 truncate">{user?.nombre_completo || 'Usuario'}</p>
                  {user?.email && <p className="text-xs text-slate-700 truncate">{user.email}</p>}
                  {rol && (
                    <span className="inline-block mt-2 text-[11px] font-semibold text-templex-700 bg-templex-50 ring-1 ring-inset ring-templex-100 px-2 py-0.5 rounded-md">
                      {etiquetaRol(rol)}
                    </span>
                  )}
                  <p className="text-[12px] text-slate-700 mt-2 first-letter:uppercase">{fechaHoy}</p>
                </div>
                <div className="p-1.5">
                  <button onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:text-rose-700 hover:bg-rose-50 transition">
                    <LogOut size={17} />
                    Cerrar sesión
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <MenuMovil abierto={menuMovilOpen} onCerrar={() => setMenuMovilOpen(false)} rol={rol}
        favoritos={favoritos} onBuscar={() => setLanzadorOpen(true)} />
      <LanzadorModulos abierto={lanzadorOpen} onCerrar={() => setLanzadorOpen(false)} items={visibles} favoritos={favoritos} />
    </>
  );
};

export default Navbar;
