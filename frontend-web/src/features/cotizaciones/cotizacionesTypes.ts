export type SeccionItem = 'vidrio' | 'acabado' | 'gasto_instalacion';
export type EstadoCOT = 'borrador' | 'enviada' | 'aprobada' | 'rechazada' | 'vencida' | 'convertida';
export type TipoCliente = 'PA' | 'PM' | 'PB';

export interface CotizacionItemType {
  id?: number;
  cotizacion_id?: number;
  seccion: SeccionItem;
  descripcion: string;
  codigo?: string | null;
  cantidad: number;
  unidad: 'M2' | 'ML' | 'UND' | 'GL' | 'HR' | 'X M2' | 'X METRO';
  precio_unitario: number;
  precio_venta?: number;
  producto_ref?: string | null;
  orden: number;
}

export interface CotizacionType {
  id: number;
  numero_cot: string;
  odp_id: number | null;
  prospecto_id: number | null;
  cliente_id: number;
  nombre_proyecto: string | null;
  tipo_cliente: TipoCliente | null;
  creado_por: number;
  total_vidrio: number;
  total_acabados: number;
  total_gastos_instalacion: number;
  subtotal: number;
  descuento: number;
  base_gravable: number;
  iva: number;
  valor_total: number;
  forma_pago: string | null;
  validez_dias: number;
  notas: string | null;
  estado: EstadoCOT;
  fecha_creacion: string;
  asesor?: { id: number; nombre_completo: string };
  cliente?: { id: number; nombre_razon_social: string; telefono?: string; direccion?: string };
  items?: CotizacionItemType[];
  prospecto?: { id: number; numero_prospecto: string };
  odp?: { id: number; numero_odp: string };
}

export const FORMAS_PAGO = [
  'CONTADO',
  'CRÉDITO 30 DÍAS',
  'CRÉDITO 60 DÍAS',
  '50% ADELANTO - 50% ENTREGA',
  'NEGOCIADO',
];

export const UNIDADES_VIDRIO = ['X M2', 'M2', 'ML', 'UND'] as const;
export const UNIDADES_ACABADO = ['UND', 'X METRO', 'ML', 'M2'] as const;
export const UNIDADES_GASTO = ['UND', 'GL', 'HR'] as const;
export const TODAS_UNIDADES = ['M2', 'ML', 'UND', 'GL', 'HR', 'X M2', 'X METRO'] as const;

export const LABEL_SECCION: Record<SeccionItem, string> = {
  vidrio: 'Vidrios',
  acabado: 'Acabados y Accesorios',
  gasto_instalacion: 'Gastos de Instalación',
};

export const COLOR_ESTADO: Record<EstadoCOT, 'default' | 'primary' | 'success' | 'error' | 'warning' | 'info'> = {
  borrador: 'default',
  enviada: 'info',
  aprobada: 'success',
  rechazada: 'error',
  vencida: 'warning',
  convertida: 'primary',
};

export const LABEL_TIPO_CLIENTE: Record<TipoCliente, string> = {
  PA: 'PA — Cliente Alto',
  PM: 'PM — Cliente Medio',
  PB: 'PB — Cliente Bajo',
};
