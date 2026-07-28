import axios from 'axios';
import { toast } from 'react-toastify';

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

export const instalarInterceptores = () => {
  if (instalado) return;
  instalado = true;

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
