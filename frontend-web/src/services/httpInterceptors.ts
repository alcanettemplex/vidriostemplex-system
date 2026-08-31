import axios from 'axios';
import { toast } from 'react-toastify';
import API from './config';

/**
 * Interceptor global de respuestas HTTP.
 *
 * Red de seguridad para los roles de solo lectura: si algún control de escritura se
 * escapa del filtrado visual, el backend responde 403 y aquí se traduce a un aviso
 * legible en vez de dejar el error crudo en consola o un toast técnico.
 *
 * Solo actúa sobre 403 de métodos de escritura para no interferir con los 403 de
 * permisos por módulo, que cada pantalla ya maneja a su manera.
 */
let instalado = false;

/** Token de sesión, con el mismo orden de precedencia que usa toda la aplicación */
export const obtenerToken = (): string | null =>
  sessionStorage.getItem('token') || localStorage.getItem('token');

export const instalarInterceptores = () => {
  if (instalado) return;
  instalado = true;

  /**
   * Adjunta el token a las peticiones dirigidas a nuestra API.
   *
   * Se limita a las URLs del backend propio para no filtrar credenciales a
   * terceros, y respeta una cabecera Authorization ya presente: las pantallas que
   * la envían a mano siguen funcionando igual mientras se van migrando.
   */
  axios.interceptors.request.use((config) => {
    const url = config.url ?? '';
    const esApiPropia = url.startsWith(API) || url.startsWith('/api');
    const yaTieneAuth = !!(config.headers as any)?.Authorization;

    if (esApiPropia && !yaTieneAuth) {
      const token = obtenerToken();
      if (token) {
        (config.headers as any).Authorization = `Bearer ${token}`;
      }
    }
    return config;
  });

  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = error?.response?.status;
      const metodo = (error?.config?.method || '').toUpperCase();
      const esEscritura = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(metodo);

      if (status === 403 && esEscritura) {
        const mensaje = error.response?.data?.error;
        if (typeof mensaje === 'string' && mensaje.includes('solo lectura')) {
          toast.info(mensaje, { toastId: 'solo-lectura' });
        }
      }

      return Promise.reject(error);
    },
  );
};
