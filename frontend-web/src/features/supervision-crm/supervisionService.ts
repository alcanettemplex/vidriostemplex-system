import axios from 'axios';

import API from '../../services/config';

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

/** Resumen: conversión actual vs meta 20% + motivos de pérdida del período */
export const apiGetSupervisionResumen = (filtros: FiltrosSupervision) =>
  axios.get(`${API}/api/supervision-crm/resumen?${buildParams(filtros)}`, getHeaders());

/** Radar de leads de alto valor sin ODP, cualquier etapa activa */
export const apiGetSupervisionAltoValor = (filtros: FiltrosSupervision, montoMin?: number) =>
  axios.get(`${API}/api/supervision-crm/alto-valor?${buildParams(filtros, { monto_min: montoMin })}`, getHeaders());

/** Cola priorizada de leads en SEGUIMIENTO, todos los asesores */
export const apiGetSupervisionSeguimiento = (filtros: FiltrosSupervision) =>
  axios.get(`${API}/api/supervision-crm/seguimiento?${buildParams(filtros)}`, getHeaders());
