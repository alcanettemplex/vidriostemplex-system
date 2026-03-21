import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  LayoutDashboard,
  Users,
  FileText,
  Wrench,
  Camera,
  BarChart3,
  ShoppingCart,
  Calculator,
  HardHat,
  Truck,
  Settings,
  Sliders
} from 'lucide-react';

/**
 * MAPA DE ACCESOS POR ROL
 * Cada ítem define qué roles pueden verlo.
 * Se usa el array 'allowedRoles' para filtrar en tiempo de renderizado.
 * Los roles nuevos son: 'taller', 'compras', 'contabilidad', 'gerente'
 */
const MENU_ITEMS_CONFIG = [
  {
    text: 'Dashboard',
    icon: LayoutDashboard,
    path: '/',
    allowedRoles: ['admin', 'gerente', 'gerencia', 'asesor_comercial'],
    section: 'general'
  },
  {
    text: 'Clientes',
    icon: Users,
    path: '/clientes',
    allowedRoles: ['admin', 'gerente', 'gerencia', 'asesor_comercial'],
    section: 'comercial'
  },
  {
    text: 'Órdenes (ODP)',
    icon: FileText,
    path: '/odp',
    allowedRoles: ['admin', 'gerente', 'gerencia', 'asesor_comercial', 'contabilidad', 'compras', 'jefe_produccion'],
    section: 'comercial'
  },
  {
    text: 'Producción',
    icon: Wrench,
    path: '/produccion',
    allowedRoles: ['admin', 'gerente', 'jefe_produccion', 'taller', 'produccion', 'auxiliar_produccion'],
    section: 'produccion'
  },
  {
    text: 'Instalaciones',
    icon: Truck,
    path: '/instalaciones',
    allowedRoles: ['admin', 'gerente', 'jefe_produccion', 'instalador'],
    section: 'produccion'
  },
  {
    text: 'Evidencias',
    icon: Camera,
    path: '/evidencias',
    allowedRoles: ['admin', 'gerente', 'jefe_produccion', 'instalador'],
    section: 'produccion'
  },
  {
    text: 'Compras',
    icon: ShoppingCart,
    path: '/compras',
    allowedRoles: ['admin', 'gerente', 'compras', 'jefe_produccion'],
    section: 'logistica'
  },
  {
    text: 'Contabilidad',
    icon: Calculator,
    path: '/contabilidad',
    allowedRoles: ['admin', 'gerente', 'contabilidad'],
    section: 'finanzas'
  },
  {
    text: 'Reportes',
    icon: BarChart3,
    path: '/reportes',
    allowedRoles: ['admin', 'gerente', 'contabilidad'],
    section: 'finanzas'
  },
  {
    text: 'Usuarios',
    icon: Settings,
    path: '/usuarios',
    allowedRoles: ['admin'],
    section: 'admin'
  },
  {
    text: 'Configuración',
    icon: Sliders,
    path: '/configuracion',
    allowedRoles: ['admin', 'gerencia'],
    section: 'admin'
  },
];

// Etiquetas de sección para separadores visuales en el menú
const SECTION_LABELS: Record<string, string> = {
  general: 'General',
  comercial: 'Comercial',
  produccion: 'Producción',
  logistica: 'Logística',
  finanzas: 'Finanzas',
  admin: 'Administración',
};

const Sidebar: React.FC = () => {
  const location = useLocation();
  const user = useSelector((state: any) => state.auth.user);

  const userRole = (user?.rol || user?.role)?.toLowerCase() || '';

  // Filtrar el menú por rol
  const authorizedMenu = MENU_ITEMS_CONFIG.filter(item => {
    if (!userRole) return false;
    if (userRole === 'admin') return true;
    return item.allowedRoles.includes(userRole);
  });

  // Agrupar por sección para mostrar separadores
  const sections = authorizedMenu.reduce((acc: Record<string, typeof authorizedMenu>, item) => {
    if (!acc[item.section]) acc[item.section] = [];
    acc[item.section].push(item);
    return acc;
  }, {});

  return (
    <aside className="fixed left-0 top-16 bottom-0 w-64 bg-white border-r border-slate-200 overflow-y-auto hidden md:flex flex-col">
      {/* Chip del rol actual */}
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
          <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {user?.nombre_completo?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-bold text-slate-800 truncate">{user?.nombre_completo || 'Usuario'}</p>
            <p className="text-[11px] text-indigo-600 font-semibold uppercase tracking-wider capitalize">{userRole}</p>
          </div>
        </div>
      </div>

      {/* Menú con secciones */}
      <nav className="flex-1 px-3 pb-6 space-y-5 overflow-y-auto">
        {Object.entries(sections).map(([section, items]) => (
          <div key={section}>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 px-2 mb-1">
              {SECTION_LABELS[section] || section}
            </p>
            <div className="space-y-0.5">
              {items.map((item) => {
                const isActive = location.pathname === item.path ||
                  (item.path !== '/' && location.pathname.startsWith(item.path));
                const Icon = item.icon;

                return (
                  <Link
                    key={item.text}
                    to={item.path}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isActive
                      ? 'bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                  >
                    <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                    {item.text}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer del sidebar */}
      <div className="px-4 py-3 border-t border-slate-100">
        <p className="text-[10px] text-slate-400 text-center font-medium">Vidrios Templex System v1.0</p>
      </div>
    </aside>
  );
};

export default Sidebar;
