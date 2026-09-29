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
  PencilRuler,
  Factory,
  Route,
  Wallet,
  GearSix,
  IconComponent,
} from '../ui/icons';

/**
 * Mapa de navegación del ERP — FUENTE ÚNICA de módulos, áreas y roles por ruta (2026-09-28).
 *
 * Lo consumen:
 *   - routes/AppRoutes.tsx  → `rolesDeRuta(path)` alimenta cada <RoleRoute>.
 *   - Navbar / MenuMovil / LanzadorModulos → qué módulos ve cada rol y dónde está el usuario.
 *
 * Antes el menú (este archivo) y las rutas (AppRoutes) tenían listas de roles separadas que se
 * desincronizaron: `gerencia` veía Toma de Medidas, Inventario y Usuarios en el menú, pero la
 * ruta lo devolvía al Dashboard. Al unificar se conservaron los valores de las RUTAS, que eran
 * los que decidían el acceso real: nadie ganó ni perdió acceso, solo desaparecieron los
 * enlaces muertos. Cambiar un rol aquí cambia el menú Y la protección de la ruta a la vez.
 *
 * ⚠️ Esto es la protección del frontend. El backend (rbacMiddleware) sigue siendo la autoridad.
 */

export type AreaId = 'dashboard' | 'comercial' | 'produccion' | 'logistica' | 'finanzas' | 'admin';

export interface Area {
  id: AreaId;
  label: string;
  icon: IconComponent;
}

/** Orden de las áreas en la barra superior. */
export const AREAS: Area[] = [
  { id: 'dashboard',  label: 'Dashboard',      icon: LayoutDashboard },
  { id: 'comercial',  label: 'Comercial',      icon: Target },
  { id: 'produccion', label: 'Producción',     icon: Factory },
  { id: 'logistica',  label: 'Logística',      icon: Route },
  { id: 'finanzas',   label: 'Finanzas',       icon: Wallet },
  { id: 'admin',      label: 'Administración', icon: GearSix },
];

/** `'todos'` = la ruta no lleva <RoleRoute>: cualquier usuario autenticado entra. */
export type RolesRuta = string[] | 'todos';

export interface ItemMenu {
  text: string;
  /** Una línea: para qué sirve el módulo. Se muestra en el menú del área y en el buscador. */
  descripcion: string;
  icon: IconComponent;
  path: string;
  area: AreaId;
  /** Roles que pueden entrar a la ruta. Lo usa <RoleRoute> y el filtro del menú. */
  roles: RolesRuta;
  /** Root entra a todo (RoleRoute lo deja pasar), pero su menú solo muestra estos módulos. */
  paraRoot?: boolean;
  /** Palabras extra para el buscador de módulos. */
  claves?: string;
}

export const MENU_ITEMS_CONFIG: ItemMenu[] = [
  // ── Dashboard ──────────────────────────────────────────────────────────────
  {
    text: 'Dashboard', descripcion: 'Indicadores de ventas, producción, equipo y alertas',
    icon: LayoutDashboard, path: '/', area: 'dashboard', roles: 'todos', paraRoot: true,
    claves: 'inicio tablero kpi gerencial',
  },

  // ── Comercial ──────────────────────────────────────────────────────────────
  {
    text: 'CRM & Leads', descripcion: 'Pipeline de leads, métricas comerciales y reportes por asesor',
    icon: Target, path: '/crm', area: 'comercial',
    roles: ['admin', 'gerencia', 'marketing', 'asesor_comercial', 'asistente_administrativo', 'jefe_produccion'],
    claves: 'leads pipeline embudo monitor asesores',
  },
  {
    text: 'Prospectos', descripcion: 'Proyectos en captación, previos a la ODP',
    icon: UserPlus, path: '/prospectos', area: 'comercial',
    // Separado de Clientes: 'marketing' consulta prospectos pero no clientes.
    roles: ['admin', 'gerencia', 'marketing', 'asesor_comercial', 'jefe_produccion', 'asistente_administrativo'],
  },
  {
    text: 'Clientes', descripcion: 'Directorio de clientes y sus datos de contacto',
    icon: Users, path: '/clientes', area: 'comercial',
    roles: ['admin', 'gerencia', 'asesor_comercial', 'jefe_produccion', 'asistente_administrativo'],
  },
  {
    // Integrado al ERP (2026-09-27): todos lo ven; quién crea o edita lo decide
    // features/cotizador/permisos.ts (y lo impone el backend).
    text: 'Cotizador', descripcion: 'Cotizaciones de ventanas, puertas y vidrios',
    icon: FileSpreadsheet, path: '/cotizador', area: 'comercial', roles: 'todos', paraRoot: true,
    claves: 'cotizacion precios presupuesto',
  },
  {
    text: 'Órdenes (ODP)', descripcion: 'Órdenes de producción: crear, editar y seguir',
    icon: FileText, path: '/odp', area: 'comercial',
    roles: ['admin', 'gerencia', 'marketing', 'asesor_comercial', 'jefe_produccion', 'contabilidad', 'compras', 'produccion', 'asistente_administrativo'],
    claves: 'odp orden pedido',
  },

  // ── Producción ─────────────────────────────────────────────────────────────
  {
    text: 'Producción', descripcion: 'Tablero del taller, cola de impresión y pausadas',
    icon: Wrench, path: '/produccion', area: 'produccion',
    roles: ['admin', 'gerencia', 'marketing', 'jefe_produccion', 'taller', 'produccion', 'auxiliar_produccion', 'asistente_administrativo'],
    claves: 'taller kanban checks',
  },
  {
    text: 'Toma de Medidas', descripcion: 'Visitas técnicas y medidas en obra',
    icon: Ruler, path: '/toma-medidas', area: 'produccion',
    roles: ['admin', 'marketing', 'jefe_produccion', 'asesor_comercial', 'compras', 'produccion', 'asistente_administrativo'],
    claves: 'medicion visita tecnica',
  },
  {
    // Editor de planos de vidrio templado (2026-09-27). Aislado y solo admin
    // hasta que el usuario decida cómo se integra con Pedidos PV.
    text: 'Detalles Técnicos', descripcion: 'Planos de vidrio templado (FOR-005)',
    icon: PencilRuler, path: '/detalles-tecnicos', area: 'produccion', roles: ['admin'],
    claves: 'planos templado vitelsa templacol',
  },

  // ── Logística ──────────────────────────────────────────────────────────────
  {
    text: 'Instalaciones', descripcion: 'Agenda, rutas, instaladores y conductores',
    icon: Truck, path: '/instalaciones', area: 'logistica',
    roles: ['admin', 'gerencia', 'marketing', 'jefe_produccion', 'instalador', 'conductor', 'asesor_comercial', 'compras', 'produccion', 'asistente_administrativo'],
    claves: 'rutas agenda vehiculos entrega',
  },
  {
    text: 'Pedidos PV', descripcion: 'Pedidos de vidrio a proveedores',
    icon: GlassWater, path: '/pedidos-pv', area: 'logistica',
    roles: ['admin', 'gerencia', 'marketing', 'asesor_comercial', 'jefe_produccion', 'produccion', 'auxiliar_produccion', 'compras', 'asistente_administrativo'],
    claves: 'vidrio vitelsa templacol',
  },
  {
    text: 'Compras', descripcion: 'SAP y órdenes de compra de perfilería y vidrio',
    icon: ShoppingCart, path: '/compras', area: 'logistica',
    roles: ['admin', 'gerencia', 'marketing', 'compras', 'jefe_produccion'],
    claves: 'sap odc orden de compra',
  },
  {
    // Precios de compra — información comercialmente sensible (margen/negociación)
    text: 'Proveedores', descripcion: 'Precios de compra, facturas electrónicas y equivalencias',
    icon: Building2, path: '/proveedores', area: 'logistica', roles: ['root', 'admin'], paraRoot: true,
    claves: 'precios facturas dian comparador',
  },
  {
    text: 'Inventario Perfilería', descripcion: 'Existencias de perfiles de aluminio',
    icon: Package, path: '/inventario', area: 'logistica',
    roles: ['admin', 'marketing', 'jefe_produccion', 'produccion', 'auxiliar_produccion', 'compras'],
    claves: 'stock aluminio perfiles',
  },

  // ── Finanzas ───────────────────────────────────────────────────────────────
  {
    text: 'Contabilidad', descripcion: 'Facturación, caja, pagos y cartera',
    icon: Calculator, path: '/contabilidad', area: 'finanzas',
    roles: ['admin', 'gerencia', 'contabilidad', 'asistente_administrativo'],
    claves: 'caja abonos cartera factura',
  },
  {
    text: 'Facturas vs Salidas', descripcion: 'Salidas de almacén contra facturas (SA)',
    icon: PackageCheck, path: '/facturas-salidas', area: 'finanzas',
    roles: ['admin', 'gerencia', 'marketing', 'contabilidad', 'compras', 'produccion'],
    claves: 'salida almacen sa',
  },

  // ── Administración ─────────────────────────────────────────────────────────
  {
    text: 'Usuarios', descripcion: 'Cuentas, roles y permisos del equipo',
    icon: Settings, path: '/usuarios', area: 'admin', roles: ['admin'],
  },
  {
    text: 'Configuración', descripcion: 'Metas, umbrales y parámetros del sistema',
    icon: Sliders, path: '/configuracion', area: 'admin', roles: ['admin', 'gerencia'],
    claves: 'metas umbrales',
  },
  {
    text: 'Manuales', descripcion: 'Manual de usuario y manual técnico',
    icon: BookOpen, path: '/manuales', area: 'admin', roles: 'todos', paraRoot: true,
    claves: 'ayuda guia',
  },
  {
    text: 'Informe Ejecutivo', descripcion: 'KPIs y semáforos de finanzas y producción',
    icon: BarChart2, path: '/informe-ejecutivo', area: 'admin', roles: ['root'], paraRoot: true,
  },
  {
    // Pantalla completa: se monta fuera del AppShell (ver AppRoutes).
    text: 'Supervisión CRM', descripcion: 'Ranking de asesores y coaching diario',
    icon: Crosshair, path: '/supervision-crm', area: 'admin', roles: ['root'], paraRoot: true,
  },
  {
    text: 'ROOT', descripcion: 'Base de datos, auditoría, respaldos y servicios',
    icon: Shield, path: '/root', area: 'admin', roles: ['root'], paraRoot: true,
    claves: 'auditoria backup sistema',
  },
];

/** Roles de la ruta, tal como los recibe <RoleRoute>. Lanza si la ruta no está en el mapa:
 *  una ruta protegida sin entrada aquí sería un error de configuración, no un caso a tolerar. */
export const rolesDeRuta = (path: string): string[] => {
  const item = MENU_ITEMS_CONFIG.find(i => i.path === path);
  if (!item || item.roles === 'todos') throw new Error(`navegacion: ${path} no tiene roles definidos`);
  return item.roles;
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

/** Módulos que el menú muestra al rol. Misma regla que <RoleRoute> (roles de la ruta), salvo
 *  root: entra a todo, pero su menú se limita a sus módulos (`paraRoot`) para no saturarlo. */
export const itemsVisiblesPara = (rol: string): ItemMenu[] =>
  MENU_ITEMS_CONFIG.filter(item => {
    if (!rol) return false;
    if (rol === 'root') return !!item.paraRoot;
    return item.roles === 'todos' || item.roles.includes(rol);
  });

/** Áreas con al menos un módulo visible para el rol, con sus módulos en el orden del mapa. */
export const areasVisiblesPara = (rol: string): { area: Area; items: ItemMenu[] }[] => {
  const visibles = itemsVisiblesPara(rol);
  return AREAS
    .map(area => ({ area, items: visibles.filter(i => i.area === area.id) }))
    .filter(g => g.items.length > 0);
};

export const areaPorId = (id: AreaId): Area => AREAS.find(a => a.id === id)!;

export const esRutaActiva = (pathname: string, path: string): boolean =>
  pathname === path || (path !== '/' && pathname.startsWith(path));

/** Ítem del menú al que pertenece la ruta actual (el de prefijo más largo). */
export const itemDeRuta = (pathname: string): ItemMenu | undefined =>
  MENU_ITEMS_CONFIG
    .filter(item => esRutaActiva(pathname, item.path))
    .sort((a, b) => b.path.length - a.path.length)[0];

/** Texto sin tildes y en minúsculas, para el buscador de módulos. */
export const normalizar = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
