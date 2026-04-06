import axios from 'axios';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const getHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
});

/** Obtener todos los leads (el backend filtra por rol automáticamente) */
export const apiGetLeads = () =>
  axios.get(`${API}/api/crm`, getHeaders());

/** Crear un nuevo lead */
export const apiCreateLead = (data: Record<string, any>) =>
  axios.post(`${API}/api/crm`, data, getHeaders());

/** Cambiar el estado de un lead (mover entre columnas) */
export const apiUpdateLeadStatus = (id: number, nuevo_estado: string, motivo_perdida?: string) =>
  axios.put(`${API}/api/crm/${id}/estado`, { nuevo_estado, motivo_perdida }, getHeaders());

/** Asesor toma un lead de la bolsa común */
export const apiAssignLeadToMe = (id: number) =>
  axios.put(`${API}/api/crm/${id}/reclamar`, {}, getHeaders());

/** Obtener el timeline de eventos de un lead */
export const apiGetLeadTimeline = (id: number) =>
  axios.get(`${API}/api/crm/${id}/eventos`, getHeaders());

/** Obtener lista de asesores para asignación directa */
export const apiGetAsesores = () =>
  axios.get(`${API}/api/usuarios`, getHeaders());
