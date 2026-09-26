import React, { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../../features/auth/authSlice';
import { clear } from '../../store/notificationsSlice';
import { RootState } from '../../store/store';
import { useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Bell, Menu, X, CheckCheck, ChevronDown, ChevronRight } from '../ui/icons';
import { TemplexLogo } from '../ui/TemplexLogo';
import { SECTION_LABELS, etiquetaRol, itemDeRuta } from './navegacion';

/**
 * Barra superior — sistema visual "Cristal y Aluminio" (2026-09-25).
 *
 * Ocupa solo el ancho del área de trabajo (en escritorio empieza donde termina
 * el menú lateral) y muestra dónde está el usuario: sección › página, tomadas del
 * mismo mapa que el menú (./navegacion.ts). A la derecha, notificaciones y el
 * menú de usuario con el cierre de sesión.
 */

interface NavbarProps {
  onToggleSidebar: () => void;
}

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

const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [menuUsuarioOpen, setMenuUsuarioOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuUsuarioRef = useRef<HTMLDivElement>(null);

  const notifications = useSelector((state: RootState) => state.notifications.notifications);
  const user = useSelector((state: RootState) => (state as any).auth.user);
  const unreadCount = notifications.length;

  const rol = (user?.rol || user?.role || '').toLowerCase();
  const paginaActual = itemDeRuta(location.pathname);
  const PaginaIcon = paginaActual?.icon;
  const seccionActual = paginaActual ? (SECTION_LABELS[paginaActual.section] || paginaActual.section) : '';

  const cerrarNotificaciones = React.useCallback(() => setDropdownOpen(false), []);
  const cerrarMenuUsuario = React.useCallback(() => setMenuUsuarioOpen(false), []);
  useClickFuera(dropdownRef, cerrarNotificaciones);
  useClickFuera(menuUsuarioRef, cerrarMenuUsuario);

  const handleToggleDropdown = () => {
    setDropdownOpen(prev => !prev);
  };

  const handleClearAll = () => {
    dispatch(clear());
    setDropdownOpen(false);
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
    <header className="fixed top-0 right-0 left-0 md:left-64 h-16 z-50 flex items-center justify-between gap-4 px-4 sm:px-6 bg-white/85 backdrop-blur-xl border-b border-slate-200/80">
      {/* ── Izquierda: menú móvil + ubicación ── */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onToggleSidebar}
          className="md:hidden p-2 -ml-2 rounded-lg text-slate-800 hover:text-slate-900 hover:bg-slate-100 transition"
          aria-label="Abrir menú"
        >
          <Menu className="w-5 h-5" />
        </button>
        <TemplexLogo className="md:hidden h-9 w-28 justify-start" />

        {paginaActual && (
          <nav aria-label="Ubicación" className="hidden md:flex items-center gap-2.5 min-w-0">
            {/* La sección se omite cuando repite el nombre de la página (Producción › Producción) */}
            {seccionActual && seccionActual !== paginaActual.text && (
              <>
                <span className="text-[13px] font-normal text-slate-700">{seccionActual}</span>
                <ChevronRight size={12} className="text-slate-300 shrink-0" />
              </>
            )}
            <span className="flex items-center gap-2 min-w-0">
              {PaginaIcon && (
                <span className="grid place-items-center w-7 h-7 rounded-lg bg-templex-50 text-templex-600 ring-1 ring-inset ring-templex-100 shrink-0">
                  <PaginaIcon size={16} weight="duotone" />
                </span>
              )}
              <span className="text-[14px] font-semibold text-slate-900 truncate">{paginaActual.text}</span>
            </span>
          </nav>
        )}
      </div>

      {/* ── Derecha: fecha, notificaciones, usuario ── */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        <span className="hidden lg:block text-[13px] text-slate-700 first-letter:uppercase mr-1">{fechaHoy}</span>

        {/* Campana de notificaciones */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={handleToggleDropdown}
            className={`relative grid place-items-center w-9 h-9 rounded-lg transition ${dropdownOpen ? 'bg-slate-100 text-slate-900' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'}`}
            aria-label="Notificaciones"
          >
            <Bell size={19} weight={unreadCount > 0 ? 'duotone' : 'bold'} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[17px] h-[17px] px-1 flex items-center justify-center text-[10.5px] font-bold text-white bg-rose-500 rounded-full leading-none ring-2 ring-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-[22rem] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-float ring-1 ring-slate-200/80 overflow-hidden z-50">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">Notificaciones</span>
                  {unreadCount > 0 && (
                    <span className="text-[11px] font-semibold text-templex-700 bg-templex-50 ring-1 ring-inset ring-templex-100 px-1.5 py-0.5 rounded-md">{unreadCount}</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <button
                      onClick={handleClearAll}
                      className="flex items-center gap-1.5 text-xs font-semibold text-templex-700 hover:text-templex-800 px-2 py-1.5 rounded-lg hover:bg-templex-50 transition"
                      title="Marcar todas como leídas"
                    >
                      <CheckCheck className="w-3.5 h-3.5" /> Limpiar
                    </button>
                  )}
                  <button
                    onClick={() => setDropdownOpen(false)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition"
                    aria-label="Cerrar notificaciones"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Lista */}
              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                    <span className="grid place-items-center w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mb-3">
                      <Bell size={24} weight="duotone" />
                    </span>
                    <p className="text-sm font-medium text-slate-700">Estás al día</p>
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

        <span className="hidden sm:block w-px h-6 bg-slate-200" aria-hidden="true" />

        {/* Menú de usuario */}
        <div className="relative" ref={menuUsuarioRef}>
          <button
            onClick={() => setMenuUsuarioOpen(prev => !prev)}
            className={`flex items-center gap-2.5 pl-1 pr-1 sm:pr-2 h-10 rounded-xl transition ${menuUsuarioOpen ? 'bg-slate-100' : 'hover:bg-slate-100'}`}
            aria-label="Menú de usuario"
            aria-expanded={menuUsuarioOpen}
          >
            <span className="grid place-items-center w-8 h-8 rounded-lg bg-gradient-to-br from-templex-500 to-templex-700 text-white text-[12px] font-bold tracking-wide shadow-sm ring-1 ring-inset ring-white/20">
              {iniciales(user?.nombre_completo)}
            </span>
            <span className="hidden sm:flex flex-col items-start leading-tight text-left max-w-[11rem]">
              <span className="text-[13px] font-semibold text-slate-900 truncate max-w-full">{user?.nombre_completo || 'Usuario'}</span>
              <span className="text-[11.5px] text-slate-700 truncate max-w-full">{etiquetaRol(rol)}</span>
            </span>
            <ChevronDown size={14} className={`hidden sm:block text-slate-400 transition-transform ${menuUsuarioOpen ? 'rotate-180' : ''}`} />
          </button>

          {menuUsuarioOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-float ring-1 ring-slate-200/80 overflow-hidden z-50">
              <div className="px-4 py-3.5 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-900 truncate">{user?.nombre_completo || 'Usuario'}</p>
                {user?.email && <p className="text-xs text-slate-700 truncate">{user.email}</p>}
                {rol && (
                  <span className="inline-block mt-2 text-[11px] font-semibold text-templex-700 bg-templex-50 ring-1 ring-inset ring-templex-100 px-2 py-0.5 rounded-md">
                    {etiquetaRol(rol)}
                  </span>
                )}
              </div>
              <div className="p-1.5">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:text-rose-700 hover:bg-rose-50 transition"
                >
                  <LogOut size={17} />
                  Cerrar sesión
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
