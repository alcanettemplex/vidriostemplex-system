import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  LayoutDashboard,
  Users,
  FileText,
  Settings,
  Wrench,
  Camera,
  BarChart3
} from 'lucide-react';

// Expandimos la configuración de cada item con los roles autorizados
const MENU_ITEMS_CONFIG = [
  { text: 'Dashboard', icon: LayoutDashboard, path: '/', allowedRoles: ['admin', 'gerencia', 'asesor_comercial'] },
  { text: 'Clientes', icon: Users, path: '/clientes', allowedRoles: ['admin', 'gerencia', 'asesor_comercial'] },
  { text: 'Órdenes (ODP)', icon: FileText, path: '/odp', allowedRoles: ['admin', 'gerencia', 'asesor_comercial', 'contabilidad'] },
  { text: 'Producción', icon: Wrench, path: '/produccion', allowedRoles: ['admin', 'gerencia', 'produccion', 'auxiliar_produccion'] },
  { text: 'Instalaciones', icon: Settings, path: '/instalaciones', allowedRoles: ['admin', 'gerencia', 'instalador'] },
  { text: 'Evidencias', icon: Camera, path: '/evidencias', allowedRoles: ['admin', 'gerencia'] },
  { text: 'Reportes', icon: BarChart3, path: '/reportes', allowedRoles: ['admin', 'gerencia', 'contabilidad'] },
];

const Sidebar: React.FC = () => {
  const location = useLocation();
  const user = useSelector((state: any) => state.auth.user);

  // Filtramos el menú para mostrar SOLO lo que su rol tiene permitido
  const authorizedMenu = MENU_ITEMS_CONFIG.filter(item => {
    if (!user || (!user.rol && user.role === undefined)) return false; // Por seguridad si no hay login no pinta nada.

    // Si es administrador supremo ve absolutamente todo
    const userRole = (user.rol || user.role)?.toLowerCase();
    if (userRole === 'admin') return true;

    // Si no es admin, filtramos basándonos en los 'allowedRoles'
    return item.allowedRoles.includes(userRole);
  });

  return (
    <aside className="fixed left-0 top-16 bottom-0 w-64 bg-white border-r border-slate-200 overflow-y-auto hidden md:block">
      <div className="p-4">
        <div className="space-y-1">
          {authorizedMenu.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;

            return (
              <Link
                key={item.text}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                {item.text}
              </Link>
            );
          })}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
