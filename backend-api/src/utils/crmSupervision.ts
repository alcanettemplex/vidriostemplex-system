// Helpers exclusivos del módulo Supervisión CRM (admin) — cálculo de días
// estancados y acción sugerida por lead, compartidos entre los endpoints
// /api/crm/supervision/*.

export function diasDesde(fecha: Date | string | null | undefined): number {
  if (!fecha) return 0;
  const ms = Date.now() - new Date(fecha).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export const ETAPA_LABEL: Record<string, string> = {
  ASIGNADO: 'Asignado',
  EN_CONTACTO: 'En Contacto',
  COTIZANDO: 'Cotizando',
  SEGUIMIENTO: 'Seguimiento',
  VISITA_TECNICA: 'Visita Técnica',
  APROBADO: 'Aprobado',
};

export const FECHA_POR_ESTADO: Record<string, string> = {
  ASIGNADO: 'fecha_asignado',
  EN_CONTACTO: 'fecha_en_contacto',
  COTIZANDO: 'fecha_cotizando',
  SEGUIMIENTO: 'fecha_seguimiento',
  VISITA_TECNICA: 'fecha_visita_tecnica',
  APROBADO: 'fecha_aprobado',
};

export type Prioridad = 'alta' | 'media' | 'baja';

export interface AccionSugerida {
  texto: string;
  prioridad: Prioridad;
}

interface LeadParaAccion {
  estado_crm: string;
  dias: number;
  odp_id?: number | null;
}

export function calcularAccionSugerida(lead: LeadParaAccion): AccionSugerida {
  const { estado_crm, dias, odp_id } = lead;

  if (estado_crm === 'APROBADO' && !odp_id) {
    return dias >= 7
      ? { texto: `Crear ODP urgente — aprobado hace ${dias}d sin producción`, prioridad: 'alta' }
      : { texto: `Crear ODP — aprobado hace ${dias}d`, prioridad: 'media' };
  }

  if (estado_crm === 'SEGUIMIENTO') {
    if (dias >= 7) return { texto: `Llamar hoy — ${dias}d sin contacto`, prioridad: 'alta' };
    if (dias >= 3) return { texto: `Dar seguimiento pronto — ${dias}d sin contacto`, prioridad: 'media' };
    return { texto: `En seguimiento — ${dias}d`, prioridad: 'baja' };
  }

  if (estado_crm === 'ASIGNADO') {
    return dias >= 2
      ? { texto: `Contactar — asignado hace ${dias}d sin primer contacto`, prioridad: 'alta' }
      : { texto: 'Nuevo asignado — contactar hoy', prioridad: 'media' };
  }

  if (['EN_CONTACTO', 'COTIZANDO', 'VISITA_TECNICA'].includes(estado_crm)) {
    const etapa = ETAPA_LABEL[estado_crm] || estado_crm;
    return dias >= 5
      ? { texto: `Priorizar contacto — lead de alto valor estancado en ${etapa}`, prioridad: 'alta' }
      : { texto: `En gestión — ${etapa} (${dias}d)`, prioridad: 'baja' };
  }

  return { texto: `Revisar — ${ETAPA_LABEL[estado_crm] || estado_crm}`, prioridad: 'baja' };
}
