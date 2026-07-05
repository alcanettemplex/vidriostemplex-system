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
