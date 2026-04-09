import axios from 'axios';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const getHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
});

/** Obtener leads del pipeline (excluye sin-respuesta) o del tab sin-respuesta */
export const apiGetLeads = (mes?: number, anio?: number, vista?: 'pipeline' | 'sin_respuesta') => {
  const params = new URLSearchParams();
  if (mes && anio) { params.append('mes', String(mes)); params.append('anio', String(anio)); }
  if (vista) params.append('vista', vista);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return axios.get(`${API}/api/crm${qs}`, getHeaders());
};

/** Recuperar un lead del tab sin-respuesta y enviarlo al pipeline */
export const apiMoverAlPipeline = (id: number) =>
  axios.patch(`${API}/api/crm/${id}`, { respondio: 'Espera de información' }, getHeaders());

/** Crear un nuevo lead */
export const apiCreateLead = (data: Record<string, any>) =>
  axios.post(`${API}/api/crm`, data, getHeaders());

/** Cambiar el estado de un lead (mover entre columnas) */
export const apiUpdateLeadStatus = (id: number, nuevo_estado: string, motivo_perdida?: string) =>
  axios.put(`${API}/api/crm/${id}/estado`, { nuevo_estado, motivo_perdida }, getHeaders());

/** Asesor toma un lead de la bolsa común (Auto-reclamación) */
export const apiAssignLeadToMe = (id: number) =>
  axios.put(`${API}/api/crm/${id}/reclamar`, {}, getHeaders());

/** Asignar manualmente un lead a un asesor específico (Solo admin/asistente/gerencia) */
export const apiAssignLeadToUser = (id: number, asesor_id: number) =>
  axios.put(`${API}/api/crm/${id}/asignar`, { asesor_id }, getHeaders());

/** Obtener el timeline de eventos de un lead */
export const apiGetLeadTimeline = (id: number) =>
  axios.get(`${API}/api/crm/${id}/eventos`, getHeaders());

/** Actualizar el monto proyectado de cotización de un lead */
export const apiUpdateLeadMonto = (id: number, monto: number) =>
  axios.patch(`${API}/api/crm/${id}/monto`, { monto_proyectado_cotizacion: monto }, getHeaders());

/** Actualizar detalles generales del lead (segmento, producto, etc.) */
export const apiUpdateLeadDetails = (id: number, data: any) =>
  axios.patch(`${API}/api/crm/${id}`, data, getHeaders());

/** Registrar un intento de seguimiento (Touch) */
export const apiRegisterLeadSeguimiento = (id: number, nota?: string) =>
  axios.post(`${API}/api/crm/${id}/seguimiento`, { nota }, getHeaders());

/** Convertir un lead en cliente */
export const apiConvertLeadToCliente = (id: number, data: any) =>
  axios.post(`${API}/api/crm/${id}/convertir`, data, getHeaders());

/** Obtener estadísticas de CRM */
export const apiGetCRMStats = (mes?: number, anio?: number) => {
  const params = (mes && anio) ? `?mes=${mes}&anio=${anio}` : '';
  return axios.get(`${API}/api/crm/stats/resumen${params}`, getHeaders());
};

/** Obtener lista de asesores para asignación */
export const apiGetAsesores = () =>
  axios.get(`${API}/api/usuarios`, getHeaders());

/** Buscar ODPs para vincular a un lead aprobado */
export const apiSearchODPs = (q?: string, cliente_id?: number) => {
  const params = new URLSearchParams();
  if (q) params.append('q', q);
  if (cliente_id) params.append('cliente_id', String(cliente_id));
  return axios.get(`${API}/api/crm/odps/buscar?${params.toString()}`, getHeaders());
};

/** Vincular un lead aprobado a una ODP existente (odp_id=null desvincula) */
export const apiVincularODP = (leadId: number, odp_id: number | null) =>
  axios.patch(`${API}/api/crm/${leadId}/vincular-odp`, { odp_id }, getHeaders());
