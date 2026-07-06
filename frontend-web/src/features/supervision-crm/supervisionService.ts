import axios from 'axios';

import API from '../../services/config';
import { FiltrosBuscadorODP, FiltrosBuscadorLeads } from './types';

const getHeaders = () => ({
  headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` }
});

interface FiltrosSupervision {
  fecha_desde?: string;
  fecha_hasta?: string;
  asesor_id?: number;
}

const buildParams = (filtros: FiltrosSupervision, extra?: Record<string, string | number | undefined>) => {
  const params = new URLSearchParams();
  if (filtros.fecha_desde) params.append('fecha_desde', filtros.fecha_desde);
  if (filtros.fecha_hasta) params.append('fecha_hasta', filtros.fecha_hasta);
  if (filtros.asesor_id) params.append('asesor_id', String(filtros.asesor_id));
  if (extra) {
    Object.entries(extra).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.append(k, String(v));
    });
  }
  return params.toString();
};

/** Resumen: conversión actual vs meta 20% + motivos de pérdida del período + KPIs financieros/comerciales */
export const apiGetSupervisionResumen = (filtros: FiltrosSupervision) =>
  axios.get(`${API}/api/supervision-crm/resumen?${buildParams(filtros)}`, getHeaders());

/** Ranking comercial de asesores del período (ignora el filtro de asesor_id) */
export const apiGetRankingAsesores = (filtros: Pick<FiltrosSupervision, 'fecha_desde' | 'fecha_hasta'>) =>
  axios.get(`${API}/api/supervision-crm/ranking-asesores?${buildParams(filtros)}`, getHeaders());

/** Radar de leads de alto valor sin ODP, cualquier etapa activa */
export const apiGetSupervisionAltoValor = (filtros: FiltrosSupervision, montoMin?: number) =>
  axios.get(`${API}/api/supervision-crm/alto-valor?${buildParams(filtros, { monto_min: montoMin })}`, getHeaders());

/** Cola priorizada de leads en SEGUIMIENTO, todos los asesores */
export const apiGetSupervisionSeguimiento = (filtros: FiltrosSupervision) =>
  axios.get(`${API}/api/supervision-crm/seguimiento?${buildParams(filtros)}`, getHeaders());

/** Leads ASIGNADO sin contactar, cualquier monto (radar de velocidad de respuesta) */
export const apiGetSupervisionPrimerContacto = (filtros: FiltrosSupervision) =>
  axios.get(`${API}/api/supervision-crm/primer-contacto?${buildParams(filtros)}`, getHeaders());

/** Genera (o completa) el lineamiento de hoy para un asesor */
export const apiGenerarLineamiento = (asesor_id: number, monto_min?: number) =>
  axios.post(`${API}/api/supervision-crm/lineamiento`, { asesor_id, monto_min }, getHeaders());

/** Obtiene el lineamiento de un día/asesor (por defecto, el de hoy) */
export const apiGetLineamiento = (asesor_id: number, fecha?: string) =>
  axios.get(`${API}/api/supervision-crm/lineamiento?${buildParams({}, { asesor_id, fecha })}`, getHeaders());

/** Marca un ítem del lineamiento como cumplido/no cumplido */
export const apiMarcarItemLineamiento = (itemId: number, cumplido: boolean) =>
  axios.patch(`${API}/api/supervision-crm/lineamiento/item/${itemId}`, { cumplido }, getHeaders());

/** Guarda las notas de la sesión de coaching presencial */
export const apiGuardarNotasLineamiento = (lineamientoId: number, notas_sesion: string) =>
  axios.patch(`${API}/api/supervision-crm/lineamiento/${lineamientoId}/notas`, { notas_sesion }, getHeaders());

/** % de cumplimiento agregado del lineamiento (leading indicator) */
export const apiGetAdherenciaLineamiento = (filtros: FiltrosSupervision) =>
  axios.get(`${API}/api/supervision-crm/lineamiento/adherencia?${buildParams(filtros)}`, getHeaders());

// ─── Buscador Avanzado ────────────────────────────────────────────────────────

const buildParamsGenerico = <T extends object>(filtros: T): string => {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.append(k, String(v));
  });
  return params.toString();
};

/** Búsqueda avanzada de ODPs: facturación, caja, acarreo/instalación, fuente, montos */
export const apiGetBuscadorODP = (filtros: FiltrosBuscadorODP) =>
  axios.get(`${API}/api/supervision-crm/buscador/odp?${buildParamsGenerico(filtros)}`, getHeaders());

/** Descarga el Excel de la búsqueda de ODPs con los mismos filtros activos */
export const apiExportarBuscadorODPExcel = (filtros: FiltrosBuscadorODP) =>
  axios.get(`${API}/api/supervision-crm/buscador/odp/excel?${buildParamsGenerico(filtros)}`, {
    ...getHeaders(),
    responseType: 'blob',
  });

/** Búsqueda avanzada de Leads: etapa de pipeline, fuente, historial */
export const apiGetBuscadorLeads = (filtros: FiltrosBuscadorLeads) =>
  axios.get(`${API}/api/supervision-crm/buscador/leads?${buildParamsGenerico(filtros)}`, getHeaders());

/** Descarga el Excel de la búsqueda de leads con los mismos filtros activos */
export const apiExportarBuscadorLeadsExcel = (filtros: FiltrosBuscadorLeads) =>
  axios.get(`${API}/api/supervision-crm/buscador/leads/excel?${buildParamsGenerico(filtros)}`, {
    ...getHeaders(),
    responseType: 'blob',
  });
