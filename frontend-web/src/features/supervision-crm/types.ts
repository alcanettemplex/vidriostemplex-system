export interface AccionSugerida {
  texto: string;
  prioridad: 'alta' | 'media' | 'baja';
}

export interface SupervisionLeadItem {
  id: number;
  nombre: string;
  telefono: string;
  monto_proyectado_cotizacion: number;
  asesor_id: number | null;
  asesor_nombre: string;
  dias_en_etapa: number;
  accion_sugerida: AccionSugerida;
  estado_crm?: string;
  intentos_seguimiento?: number;
}

export interface MotivoPerdida {
  motivo: string;
  total: number;
}

export interface SupervisionResumen {
  meta_conversion: number;
  tasa_conversion_actual: number;
  total_leads_reales: number;
  total_aprobados: number;
  motivos_perdida: MotivoPerdida[];
  ciclo_venta_promedio_dias: number | null;
  leads_nuevos_periodo: number;
  leads_nuevos_delta_pct: number;
  meta_odps_cerradas: number;
  odps_cerradas_real: number;
  facturacion_periodo: number;
  meta_facturacion_periodo: number;
  pct_odps_facturadas: number;
  monto_pendiente_cobro_total: number;
}

export interface RankingAsesorItem {
  asesor_id: number;
  asesor_nombre: string;
  total_leads: number;
  aprobados: number;
  monto_vendido: number;
  conversion_pct: number;
}

export type OrigenLineamiento = 'PRIMER_CONTACTO' | 'ALTO_VALOR' | 'SEGUIMIENTO' | 'MANUAL';

export interface LineamientoItem {
  id: number;
  lineamiento_id: number;
  lead_id: number | null;
  texto_accion: string;
  prioridad: 'alta' | 'media' | 'baja';
  origen: OrigenLineamiento;
  cumplido: boolean;
  fecha_cumplido: string | null;
  lead?: { id: number; nombre: string; telefono: string } | null;
}

export interface Lineamiento {
  id: number;
  fecha: string;
  asesor_id: number;
  creado_por: number;
  notas_sesion: string | null;
  items: LineamientoItem[];
  asesor?: { id: number; nombre_completo: string };
}

export interface AdherenciaLineamiento {
  total_dias: number;
  total_items: number;
  cumplidos: number;
  pct_adherencia: number;
}

// ─── Buscador Avanzado ────────────────────────────────────────────────────────

export interface FiltrosBuscadorODP {
  fecha_desde?: string;
  fecha_hasta?: string;
  campo_fecha?: 'fecha_factura' | 'fecha_creacion' | 'fecha_entrega';
  asesor_id?: number;
  estado_facturacion?: string;
  estado_caja?: string;
  acarreo?: boolean;
  instalacion?: boolean;
  tipo_odp?: string;
  search?: string;
  estado_produccion?: string;
  monto_min?: number;
  monto_max?: number;
  incluir_garantias?: boolean;
  es_no_conformidad?: boolean;
  forma_pago?: string;
  cartera_vencida?: boolean;
  page?: number;
  limit?: number;
}

export interface BuscadorODPItem {
  id: number;
  numero_odp: string;
  cliente_nombre: string | null;
  fuente: string | null;
  asesor_nombre: string | null;
  estado_produccion: string;
  estado_facturacion: string;
  estado_caja: string;
  tipo_odp: string;
  forma_pago: string | null;
  es_no_conformidad: boolean;
  valor_total: number;
  abono: number;
  pendiente: number;
  factura_electronica: string | null;
  fecha_factura: string | null;
  facturas_adicionales: { numero_fe: string; fecha_factura: string | null }[];
  acarreo: boolean;
  instalacion: boolean;
  fecha_entrega: string | null;
  fecha_creacion: string | null;
}

export interface BuscadorODPResponse {
  total: number;
  page: number;
  limit: number;
  monto_instalado_pagina: number;
  items: BuscadorODPItem[];
}

export interface FiltrosBuscadorLeads {
  fecha_desde?: string;
  fecha_hasta?: string;
  asesor_id?: number;
  estado_crm?: string;
  fuente_lead?: string;
  search?: string;
  segmento?: string;
  respondio?: string;
  motivo_perdida?: string;
  monto_min?: number;
  monto_max?: number;
  tiene_odp?: boolean;
  page?: number;
  limit?: number;
}

export interface BuscadorLeadItem {
  id: number;
  nombre: string;
  telefono: string;
  asesor_id: number | null;
  asesor_nombre: string;
  estado_crm: string;
  dias_en_etapa: number;
  fuente_lead: string | null;
  segmento: string | null;
  monto_proyectado_cotizacion: number;
  monto_real_venta: number;
  motivo_perdida: string | null;
  odp_id: number | null;
  numero_odp: string | null;
  createdAt: string;
}

export interface BuscadorLeadsResponse {
  total: number;
  page: number;
  limit: number;
  items: BuscadorLeadItem[];
}
