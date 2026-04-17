import React, { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../../features/auth/authSlice';
import { clear } from '../../store/notificationsSlice';
import { RootState } from '../../store/store';
import { useNavigate } from 'react-router-dom';
import { LogOut, Bell, Menu, X, CheckCheck } from 'lucide-react';
import { TemplexLogo } from '../ui/TemplexLogo';

interface NavbarProps {
  onToggleSidebar: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const notifications = useSelector((state: RootState) => state.notifications.notifications);
  const unreadCount = notifications.length;

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

  return (
    <nav className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 z-50 flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="md:hidden p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
          aria-label="Abrir menú"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="pt-2 pb-1">
          <TemplexLogo className="h-10 w-36" />
        </div>
      </div>

      <div className="flex items-center gap-6">
        {/* ── Campana de notificaciones ── */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={handleToggleDropdown}
            className="relative text-slate-400 hover:text-blue-600 transition p-1"
            aria-label="Notificaciones"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-black text-white bg-red-500 rounded-full leading-none">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Notificaciones</span>
                  {unreadCount > 0 && (
                    <span className="text-[10px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded-full">{unreadCount}</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <button
                      onClick={handleClearAll}
                      className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded-lg hover:bg-indigo-50 transition"
                      title="Marcar todas como leídas"
                    >
                      <CheckCheck className="w-3.5 h-3.5" /> Limpiar
                    </button>
                  )}
                  <button
                    onClick={() => setDropdownOpen(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Lista */}
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                    <Bell className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-xs font-medium">Sin notificaciones</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-50">
                    {notifications.map((n: any, i: number) => (
                      <li key={i} className="px-4 py-3 hover:bg-slate-50 transition-colors">
                        <div className="flex items-start gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
                          <p className="text-xs text-slate-700 leading-relaxed">{formatNotif(n)}</p>
                        </div>
                        {n?.fecha && (
                          <p className="text-[10px] text-slate-400 mt-1 ml-4">
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

        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-red-600 transition py-2 px-3 rounded-lg hover:bg-red-50"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Salir</span>
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
