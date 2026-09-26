import {
  LayoutDashboard,
  Users,
  FileText,
  Wrench,
  ShoppingCart,
  Calculator,
  Truck,
  Settings,
  Sliders,
  Ruler,
  UserPlus,
  Package,
  GlassWater,
  PackageCheck,
  Shield,
  Target,
  BookOpen,
  BarChart2,
  Crosshair,
  Building2,
  FileSpreadsheet,
  IconComponent,
} from '../ui/icons';

/**
 * Mapa de navegación del ERP — fuente única para el menú lateral (Sidebar) y la
 * ruta de migas de la barra superior (Navbar). Antes vivía dentro de Sidebar.tsx;
 * se extrajo el 2026-09-25 para que la barra superior pudiera nombrar la página
 * activa sin duplicar la lista.
 *
 * `allowedRoles` decide la visibilidad SOLO en el menú: la protección real de cada
 * ruta sigue en <RoleRoute> (routes/AppRoutes.tsx) y en el backend.
 */
export interface ItemMenu {
  text: string;
  icon: IconComponent;
  path: string;
  allowedRoles: string[];
  section: string;
}

export const MENU_ITEMS_CONFIG: ItemMenu[] = [
  {
    text: 'Dashboard',
    icon: LayoutDashboard,
    path: '/',
    allowedRoles: ['root', 'admin', 'gerencia', 'marketing', 'asesor_comercial', 'jefe_produccion', 'produccion', 'auxiliar_produccion', 'instalador', 'conductor', 'contabilidad', 'compras', 'asistente_administrativo'],
    section: 'general'
  },
  {
    text: 'Clientes',
    icon: Users,
    path: '/clientes',
    allowedRoles: ['admin', 'gerencia', 'asesor_comercial', 'jefe_produccion', 'asistente_administrativo'],
    section: 'comercial'
  },
  {
    text: 'Prospectos',
    icon: UserPlus,
    path: '/prospectos',
    allowedRoles: ['admin', 'marketing', 'gerencia', 'asesor_comercial', 'jefe_produccion', 'asistente_administrativo'],
    section: 'comercial'
  },
  {
    text: 'Órdenes (ODP)',
    icon: FileText,
    path: '/odp',
    allowedRoles: ['admin', 'marketing', 'gerencia', 'asesor_comercial', 'jefe_produccion', 'contabilidad', 'compras', 'produccion', 'asistente_administrativo'],
    section: 'comercial'
  },
  {
    text: 'CRM & Leads',
    icon: Target,
    path: '/crm',
    allowedRoles: ['admin', 'gerencia', 'asesor_comercial', 'asistente_administrativo', 'marketing', 'jefe_produccion'],
    section: 'comercial'
  },
  {
    text: 'Producción',
    icon: Wrench,
    path: '/produccion',
    allowedRoles: ['admin', 'marketing', 'gerencia', 'jefe_produccion', 'taller', 'produccion', 'auxiliar_produccion', 'asistente_administrativo'],
    section: 'produccion'
  },
  {
    text: 'Toma de Medidas',
    icon: Ruler,
    path: '/toma-medidas',
    allowedRoles: ['admin', 'marketing', 'gerencia', 'jefe_produccion', 'asesor_comercial', 'compras', 'produccion', 'asistente_administrativo'],
    section: 'produccion'
  },
  {
    text: 'Instalaciones',
    icon: Truck,
    path: '/instalaciones',
    allowedRoles: ['admin', 'marketing', 'gerencia', 'jefe_produccion', 'instalador', 'conductor', 'asesor_comercial', 'compras', 'produccion', 'asistente_administrativo'],
    section: 'produccion'
  },
  {
    text: 'Compras',
    icon: ShoppingCart,
    path: '/compras',
    allowedRoles: ['admin', 'marketing', 'gerencia', 'compras', 'jefe_produccion'],
    section: 'logistica'
  },
  {
    // Precios de compra — información comercialmente sensible (margen/negociación)
    text: 'Proveedores',
    icon: Building2,
    path: '/proveedores',
    allowedRoles: ['root', 'admin'],
    section: 'logistica'
  },
  {
    // Módulo aislado del flujo del ERP (no genera ODP) — ver plan de migración
    text: 'Cotizador',
    icon: FileSpreadsheet,
    path: '/cotizador',
    allowedRoles: ['root', 'admin'],
    section: 'comercial'
  },
  {
    text: 'Inventario Perfilería',
    icon: Package,
    path: '/inventario',
    allowedRoles: ['admin', 'marketing', 'gerencia', 'jefe_produccion', 'produccion', 'auxiliar_produccion', 'compras'],
    section: 'logistica'
  },
  {
    text: 'Pedidos PV',
    icon: GlassWater,
    path: '/pedidos-pv',
    allowedRoles: ['admin', 'marketing', 'gerencia', 'asesor_comercial', 'jefe_produccion', 'produccion', 'auxiliar_produccion', 'compras', 'asistente_administrativo'],
    section: 'logistica'
  },
  {
    text: 'Facturas vs Salidas',
    icon: PackageCheck,
    path: '/facturas-salidas',
    allowedRoles: ['admin', 'marketing', 'gerencia', 'contabilidad', 'compras', 'produccion'],
    section: 'logistica'
  },
  {
    text: 'Contabilidad',
    icon: Calculator,
    path: '/contabilidad',
    allowedRoles: ['admin', 'gerencia', 'contabilidad', 'asistente_administrativo'],
    section: 'finanzas'
  },
  {
    text: 'Usuarios',
    icon: Settings,
    path: '/usuarios',
    allowedRoles: ['admin', 'gerencia'],
    section: 'admin'
  },
  {
    text: 'Supervisión CRM',
    icon: Crosshair,
    path: '/supervision-crm',
    allowedRoles: ['root'],
    section: 'sistema'
  },
  {
    text: 'Configuración',
    icon: Sliders,
    path: '/configuracion',
    allowedRoles: ['admin', 'gerencia'],
    section: 'admin'
  },
  {
    text: 'ROOT',
    icon: Shield,
    path: '/root',
    allowedRoles: ['root'],
    section: 'sistema'
  },
  {
    text: 'Informe Ejecutivo',
    icon: BarChart2,
    path: '/informe-ejecutivo',
    allowedRoles: ['root'],
    section: 'sistema'
  },
  {
    text: 'Manuales',
    icon: BookOpen,
    path: '/manuales',
    allowedRoles: ['root', 'admin', 'gerencia', 'marketing', 'asesor_comercial', 'jefe_produccion', 'taller', 'produccion', 'auxiliar_produccion', 'instalador', 'conductor', 'contabilidad', 'compras', 'asistente_administrativo'],
    section: 'ayuda'
  },
];

// Etiquetas de sección para separadores visuales en el menú y la ruta de migas
export const SECTION_LABELS: Record<string, string> = {
  general: 'General',
  comercial: 'Comercial',
  produccion: 'Producción',
  logistica: 'Logística',
  finanzas: 'Finanzas',
  admin: 'Administración',
  sistema: 'Sistema',
  ayuda: 'Ayuda',
};

/** Nombre legible del rol. Un rol sin entrada se muestra con guiones → espacios. */
const ETIQUETAS_ROL: Record<string, string> = {
  root: 'Root',
  admin: 'Administrador',
  gerencia: 'Gerencia',
  gerente: 'Gerente',
  jefe_produccion: 'Jefe de producción',
  asesor_comercial: 'Asesor comercial',
  produccion: 'Producción',
  auxiliar_produccion: 'Auxiliar de producción',
  taller: 'Taller',
  instalador: 'Instalador',
  conductor: 'Conductor',
  contabilidad: 'Contabilidad',
  compras: 'Compras',
  asistente_administrativo: 'Asistente administrativo',
  marketing: 'Marketing',
};

export const etiquetaRol = (rol: string): string => {
  if (!rol) return '';
  if (ETIQUETAS_ROL[rol]) return ETIQUETAS_ROL[rol];
  const texto = rol.replace(/_/g, ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

/** Mismo filtro que aplicaba Sidebar.tsx: root ve Sistema + Ayuda, admin todo menos Sistema. */
export const itemsVisiblesPara = (rol: string): ItemMenu[] =>
  MENU_ITEMS_CONFIG.filter(item => {
    if (!rol) return false;
    if (rol === 'root') return item.allowedRoles.includes('root') || item.section === 'ayuda';
    if (rol === 'admin') return item.section !== 'sistema';
    return item.allowedRoles.includes(rol);
  });

export const esRutaActiva = (pathname: string, path: string): boolean =>
  pathname === path || (path !== '/' && pathname.startsWith(path));

/** Ítem del menú al que pertenece la ruta actual (el de prefijo más largo). */
export const itemDeRuta = (pathname: string): ItemMenu | undefined =>
  MENU_ITEMS_CONFIG
    .filter(item => esRutaActiva(pathname, item.path))
    .sort((a, b) => b.path.length - a.path.length)[0];
