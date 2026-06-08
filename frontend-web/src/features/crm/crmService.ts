import axios from 'axios';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const getHeaders = () => ({
  headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` }
});

/** Obtener leads del pipeline (excluye sin-respuesta) o del tab sin-respuesta */
export const apiGetLeads = (mes?: number, anio?: number, vista?: 'pipeline' | 'sin_respuesta') => {
  const params = new URLSearchParams();
  if (mes && anio) { params.append('mes', String(mes)); params.append('anio', String(anio)); }
  if (vista) params.append('vista', vista);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return axios.get(`${API}/api/crm${qs}`, getHeaders());
};

/** Recuperar un lead del tab sin-respuesta → Bolsa Común (estado NUEVO, sin asesor) */
export const apiMoverAlPipeline = (id: number) =>
  axios.put(`${API}/api/crm/${id}/recuperar`, {}, getHeaders());

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

/** Reporte de actividad mensual por asesor */
export const apiGetReporteAsesor = (mes?: number, anio?: number, asesor_id?: number) => {
  const params = new URLSearchParams();
  if (mes && anio) { params.append('mes', String(mes)); params.append('anio', String(anio)); }
  if (asesor_id) params.append('asesor_id', String(asesor_id));
  return axios.get(`${API}/api/crm/reporte-asesor?${params.toString()}`, getHeaders());
};

/** Estadísticas de prospectos para el módulo CRM */
export const apiGetStatsProspectos = (mes?: number, anio?: number) => {
  const params = (mes && anio) ? `?mes=${mes}&anio=${anio}` : '';
  return axios.get(`${API}/api/crm/stats/prospectos${params}`, getHeaders());
};

/** Crear ODP mínima desde un lead APROBADO y vincularla automáticamente */
export const apiCrearODPDesdeLead = (leadId: number, data: { cliente_id?: number; nombre?: string; telefono?: string }) =>
  axios.post(`${API}/api/crm/${leadId}/crear-odp`, data, getHeaders());

/** Buscar clientes por nombre o teléfono */
export const apiSearchClientes = (buscar: string) =>
  axios.get(`${API}/api/clientes?buscar=${encodeURIComponent(buscar)}`, getHeaders());

/** Solicitar visita técnica desde un lead en VISITA_TECNICA — crea Prospecto + TM */
export const apiSolicitarVisitaTecnica = (leadId: number, data: {
  direccion: string;
  fecha_visita?: string;
  nombre_contacto?: string;
  telefono_contacto?: string;
  observaciones?: string;
}) => axios.post(`${API}/api/crm/${leadId}/solicitar-visita`, data, getHeaders());

/** Embudo de conversión etapa→etapa por asesor */
export const apiGetEmbudoAsesores = (mes?: number, anio?: number) => {
  const params = (mes && anio) ? `?mes=${mes}&anio=${anio}` : '';
  return axios.get(`${API}/api/crm/embudo${params}`, getHeaders());
};

/** Monitor de pipeline: leads activos agrupados por asesor con días en etapa */
export const apiGetMonitorAsesores = () =>
  axios.get(`${API}/api/crm/monitor`, getHeaders());

/** Obtener un lead completo por ID (para abrir LeadDetalleModal desde el Monitor) */
export const apiGetLeadById = (leadId: number) =>
  axios.get(`${API}/api/crm/${leadId}`, getHeaders());

/** Obtener imágenes de un lead */
export const apiGetLeadImagenes = (leadId: number) =>
  axios.get(`${API}/api/crm/${leadId}/imagenes`, getHeaders());

/** Subir una imagen a un lead */
export const apiUploadLeadImagen = (leadId: number, file: File, nota?: string) => {
  const fd = new FormData();
  fd.append('imagen', file);
  if (nota?.trim()) fd.append('nota', nota.trim());
  return axios.post(`${API}/api/crm/${leadId}/imagenes`, fd, {
    headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` },
  });
};

/** Editar la nota de una imagen del lead */
export const apiUpdateLeadImagenNota = (leadId: number, imgId: number, nota: string) =>
  axios.patch(`${API}/api/crm/${leadId}/imagenes/${imgId}`, { nota }, getHeaders());

/** Eliminar una imagen del lead */
export const apiDeleteLeadImagen = (leadId: number, imgId: number) =>
  axios.delete(`${API}/api/crm/${leadId}/imagenes/${imgId}`, getHeaders());
