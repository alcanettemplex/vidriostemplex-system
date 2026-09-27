// Contrato de `GET /api/dashboard/cotizaciones` (rediseño 2026-09-27).
// Espejo de `DatosPanelCotizaciones` en backend-api/src/services/dashboardCotizaciones.service.ts.

export type EstadoCotizacion = 'PENDIENTE' | 'APROBADA' | 'PERDIDO' | 'CANCELADO';
export type Segmento = 'PA' | 'PM' | 'PB';
export type ModuloCotizador =
  | 'ventanas' | 'proyectantes' | 'cabinas-corredizas' | 'cabinas-batientes' | 'tablero' | 'espejo' | 'item-libre';

export interface FiltrosCotizaciones {
  desde: string;
  hasta: string;
  asesorId: string;
  cliente: string;
  estado: '' | EstadoCotizacion;
  montoMin: string;
  montoMax: string;
  segmento: '' | Segmento;
  producto: '' | ModuloCotizador;
}

export interface Agregado {
  cantidad: number;
  valor: number;
  aprobadas: number;
  valor_aprobado: number;
  pendientes: number;
  valor_pendiente: number;
  perdidas: number;
  valor_perdido: number;
  con_odp: number;
  valor_con_odp: number;
  conversion_pct: number;
  conversion_valor_pct: number;
  ticket_aprobado: number;
  ticket_cotizado: number;
  dias_aprobar: number | null;
}

export interface FilaAsesor extends Agregado {
  asesor_id: number | null;
  asesor: string;
}

export interface PendienteValidez {
  id: number;
  numero: number;
  cliente: string;
  asesor: string;
  total: number;
  fecha: string;
  dias: number;
  habiles_restantes: number;
  validez: 'VIGENTE' | 'POR_VENCER' | 'VENCIDA';
}

export interface DatosPanelCotizaciones {
  generado_en: string;
  validez_oferta_dias: number;
  alcance: { nivel: 'total' | 'propias'; asesor_id: number | null };
  filtros: { desde: string; hasta: string };
  kpis: Agregado & { canceladas: number; sin_valor: number };
  mensual: Array<{ mes: string; cantidad: number; valor: number; aprobadas: number; valor_aprobado: number; conversion_pct: number }>;
  por_asesor: FilaAsesor[];
  por_segmento: Array<Agregado & { segmento: Segmento }>;
  por_producto: Array<{
    modulo_id: ModuloCotizador;
    nombre: string;
    cotizaciones: number;
    aprobadas: number;
    piezas: number;
    piezas_aprobadas: number;
    valor: number;
    valor_aprobado: number;
  }>;
  por_sistema: Array<{ modulo_id: ModuloCotizador; sistema: string; piezas: number; valor: number; piezas_aprobadas: number; valor_aprobado: number }>;
  seguimiento: {
    antiguedad: Array<{ tramo: string; cantidad: number; valor: number }>;
    resumen_validez: { vigentes: number; por_vencer: number; vencidas: number; valor_por_vencer: number; valor_vencidas: number };
    pendientes: PendienteValidez[];
    perdidas_por_motivo: Array<{ motivo: string; nombre: string; cantidad: number; valor: number }>;
    perdidas_recientes: Array<{
      id: number; numero: number; cliente: string; asesor: string; total: number; motivo: string; detalle: string | null; fecha: string | null;
    }>;
  };
  asesores: Array<{ id: number; nombre: string }>;
}

export const NOMBRE_ESTADO: Record<EstadoCotizacion, string> = {
  PENDIENTE: 'Pendiente',
  APROBADA: 'Aprobada',
  PERDIDO: 'Perdida',
  CANCELADO: 'Cancelada',
};

export const NOMBRE_MODULO: Record<ModuloCotizador, string> = {
  ventanas: 'Ventanas',
  proyectantes: 'Proyectantes',
  'cabinas-corredizas': 'Cabinas corredizas',
  'cabinas-batientes': 'Cabinas batientes',
  tablero: 'Tableros',
  espejo: 'Espejos',
  'item-libre': 'Ítems libres',
};

export const NOMBRE_SEGMENTO: Record<Segmento, string> = {
  PA: 'Precio alto',
  PM: 'Precio medio',
  PB: 'Precio bajo',
};

/** Colores de serie (validados con el validador de paleta: CVD y contraste OK). */
export const COLOR = {
  cotizado: '#1f5ad6', // templex-600
  aprobado: '#0f9f6e',
  alerta: '#d97706',
} as const;
