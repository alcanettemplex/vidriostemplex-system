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
