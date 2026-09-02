/**
 * Fuente única de verdad para presentar `odp.estado_produccion` al usuario.
 *
 * Antes existían 7 diccionarios paralelos y desincronizados (ODPFichaModal.utils,
 * ODPTabHistorial, ODPListPage, FacturasSalidasPage, ComprasPage, PanelGeneral y
 * PanelProduccion): `LISTO_INSTALAR` se llamaba "A Instalar", "Listo Instalar" y
 * "Listo instalar" según la pantalla, y `ENTREGADA` era gris, violeta o verde.
 *
 * ⚠️ Esto es SOLO presentación. Los valores del ENUM de Postgres y toda la lógica de
 * negocio quedan intactos. No usar este módulo para decidir filtros ni transiciones.
 *
 * Sobre INSTALANDO e INSTALADA — hasta 2026-09-02 el mismo valor `INSTALADA` servía
 * para las dos cosas: el instalador pulsaba «Iniciar» y la ODP quedaba INSTALADA aunque
 * el trabajo apenas empezara. Una orden en obra y una terminada eran indistinguibles.
 * Hoy están separadas:
 *
 *   INSTALANDO  el instalador está en la obra, el trabajo no ha culminado (ámbar)
 *   INSTALADA   el trabajo culminó (verde)
 *   ENTREGADA   cierre definitivo, con foto y firma del cliente (verde)
 *
 * Ver `backend-api/src/scripts/2026-09-02_agregar_estado_instalando.ts`.
 */

export type EstadoProduccion =
  | 'EN_ESPERA'
  | 'VISITA_TECNICA'
  | 'MEDICION'
  | 'ALUMINIO_CORTADO'
  | 'VIDRIO_RECIBIDO'
  | 'ACCESORIOS_SEPARADOS'
  | 'LISTO_INSTALAR'
  | 'PROGRAMADA'
  | 'INSTALANDO'
  | 'INSTALADA'
  | 'ENTREGADA'
  | 'PAUSADA'
  | 'PEDIDO_PROVEEDOR';

export interface EstadoConfig {
  /** Nombre completo, para badges y fichas. */
  label: string;
  /** Versión corta para tablas densas, ejes de gráficos y leyendas. */
  corto: string;
  /** Clases Tailwind del badge (fondo + texto + borde). */
  badge: string;
  /** Color sólido para Recharts y otros gráficos. */
  hex: string;
  /** Texto de apoyo (tooltip / title). */
  descripcion: string;
}

export const ESTADOS_ODP: Record<EstadoProduccion, EstadoConfig> = {
  EN_ESPERA: {
    label: 'En espera',
    corto: 'En espera',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    hex: '#94a3b8',
    descripcion: 'La orden aún no ha entrado a producción.',
  },
  VISITA_TECNICA: {
    label: 'Visita técnica',
    corto: 'Visita',
    badge: 'bg-purple-100 text-purple-700 border-purple-200',
    hex: '#c084fc',
    descripcion: 'Pendiente de visita técnica en sitio.',
  },
  MEDICION: {
    label: 'Medición',
    corto: 'Medición',
    badge: 'bg-sky-100 text-sky-700 border-sky-200',
    hex: '#38bdf8',
    descripcion: 'En toma de medidas.',
  },
  ALUMINIO_CORTADO: {
    label: 'Aluminio cortado',
    corto: 'Al. cortado',
    badge: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    hex: '#06b6d4',
    descripcion: 'El aluminio ya fue cortado en taller.',
  },
  VIDRIO_RECIBIDO: {
    label: 'Vidrio recibido',
    corto: 'Vidrio',
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
    hex: '#3b82f6',
    descripcion: 'El vidrio del proveedor llegó al taller.',
  },
  ACCESORIOS_SEPARADOS: {
    label: 'Accesorios separados',
    corto: 'Accesorios',
    badge: 'bg-violet-100 text-violet-700 border-violet-200',
    hex: '#8b5cf6',
    descripcion: 'Accesorios alistados para el despacho.',
  },
  LISTO_INSTALAR: {
    label: 'Listo para instalar',
    corto: 'A instalar',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    hex: '#10b981',
    descripcion: 'Lista para programarse en una ruta de instalación.',
  },
  PROGRAMADA: {
    label: 'Programada',
    corto: 'Programada',
    badge: 'bg-teal-100 text-teal-700 border-teal-200',
    hex: '#14b8a6',
    descripcion: 'Asignada a una ruta de instalación.',
  },
  INSTALANDO: {
    label: 'Instalando',
    corto: 'Instalando',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    hex: '#f59e0b',
    descripcion: 'El instalador está en la obra. El trabajo aún no ha culminado.',
  },
  INSTALADA: {
    label: 'Instalada',
    corto: 'Instalada',
    badge: 'bg-green-100 text-green-700 border-green-200',
    hex: '#22c55e',
    descripcion: 'La instalación culminó.',
  },
  ENTREGADA: {
    label: 'Entregada',
    corto: 'Entregada',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    hex: '#059669',
    descripcion: 'Cierre definitivo: recibida por el cliente, con foto y firma.',
  },
  PAUSADA: {
    label: 'Pausada',
    corto: 'Pausada',
    badge: 'bg-rose-100 text-rose-700 border-rose-200',
    hex: '#e11d48',
    descripcion: 'Detenida, generalmente por una no conformidad en curso.',
  },
  // Existe en el ENUM de Postgres (posición 3) pero está retirado del flujo. Se mantiene
  // aquí solo para que la UI no se rompa si una ODP llega a él por edición directa en BD.
  PEDIDO_PROVEEDOR: {
    label: 'Pedido a proveedor',
    corto: 'Pedido prov.',
    badge: 'bg-stone-100 text-stone-700 border-stone-200',
    hex: '#78716c',
    descripcion: 'Estado legado: el seguimiento al proveedor vive hoy en Compras y Pedidos PV.',
  },
};

/** Fallback seguro: un estado desconocido nunca debe romper la pantalla. */
export const getEstadoODP = (estado?: string | null): EstadoConfig =>
  ESTADOS_ODP[estado as EstadoProduccion] ?? {
    label: estado ? estado.replace(/_/g, ' ') : '—',
    corto: estado ? estado.replace(/_/g, ' ') : '—',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    hex: '#94a3b8',
    descripcion: '',
  };

/** Atajos para los usos más frecuentes. */
export const labelEstadoODP = (estado?: string | null): string => getEstadoODP(estado).label;
export const badgeEstadoODP = (estado?: string | null): string => getEstadoODP(estado).badge;

/** Mapas planos, para componentes que esperan Record<string, string>. */
export const ESTADO_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(ESTADOS_ODP).map(([k, v]) => [k, v.label])
);
export const ESTADO_LABELS_CORTOS: Record<string, string> = Object.fromEntries(
  Object.entries(ESTADOS_ODP).map(([k, v]) => [k, v.corto])
);
export const ESTADO_BADGES: Record<string, string> = Object.fromEntries(
  Object.entries(ESTADOS_ODP).map(([k, v]) => [k, v.badge])
);
export const ESTADO_HEX: Record<string, string> = Object.fromEntries(
  Object.entries(ESTADOS_ODP).map(([k, v]) => [k, v.hex])
);
