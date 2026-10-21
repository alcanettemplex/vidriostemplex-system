import axios from 'axios';
import { toast } from 'react-toastify';
import API from './config';
import store from '../store/store';
import { logout } from '../features/auth/authSlice';
import { fmtHora } from '../utils/fechas';

/**
 * Interceptores globales de HTTP y vigencia de la sesión.
 *
 * - 403 de escritura: red de seguridad para los roles de solo lectura. Si algún control
 *   se escapa del filtrado visual, el backend responde 403 y aquí se traduce a un aviso
 *   legible. Los 403 de permisos por módulo los maneja cada pantalla.
 * - Sesión vencida (2026-10-21): el token dura 12 h (auth.controller.ts). Antes, al vencer,
 *   cada pantalla fallaba a su manera con el token muerto guardado. Ahora se cierra la
 *   sesión por tres vías: un 401 de la API, un temporizador a la hora de `exp` del token
 *   (cubre las pantallas que usan `fetch` y no pasan por axios) y la comprobación al
 *   cargar la app. Diez minutos antes se avisa para que el usuario guarde lo que tenga.
 */
let instalado = false;

/** Minutos de anticipación del aviso de vencimiento */
const MINUTOS_AVISO_PREVIO = 10;

/** Token de sesión, con el mismo orden de precedencia que usa toda la aplicación */
export const obtenerToken = (): string | null =>
  sessionStorage.getItem('token') || localStorage.getItem('token');

/** Momento de vencimiento del JWT en ms, o null si no se puede leer. Solo decodifica:
 *  la firma la valida el backend, aquí basta con saber cuándo vence. */
const vencimientoToken = (token: string): number | null => {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(payload));
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
};

/** Limpia todo rastro de la sesión. `ProtectedRoute` ve el token en null y lleva a /login. */
export const cerrarSesion = () => {
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('user');
  // Restos de versiones anteriores que guardaban la sesión en localStorage.
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  // El login lo fija aquí; si se queda, las peticiones seguirían saliendo con el token viejo.
  delete axios.defaults.headers.common['Authorization'];
  store.dispatch(logout());
};

const cerrarSesionExpirada = () => {
  if (!store.getState().auth.token) return;
  cerrarSesion();
  toast.warning('Tu sesión expiró. Vuelve a ingresar para continuar con tu trabajo.', {
    toastId: 'sesion-expirada',
    autoClose: 10000,
  });
};

let temporizadores: ReturnType<typeof setTimeout>[] = [];

/** Programa el aviso previo y el cierre según el `exp` del token vigente. */
const programarVencimiento = (token: string | null) => {
  temporizadores.forEach(clearTimeout);
  temporizadores = [];
  if (!token) return;

  const vence = vencimientoToken(token);
  if (!vence) return;

  const restante = vence - Date.now();
  if (restante <= 0) {
    cerrarSesionExpirada();
    return;
  }

  const antesDelAviso = restante - MINUTOS_AVISO_PREVIO * 60_000;
  if (antesDelAviso > 0) {
    temporizadores.push(setTimeout(() => {
      toast.warning(
        `Tu sesión vence a las ${fmtHora(new Date(vence))}. Guarda lo que estés haciendo; después tendrás que volver a ingresar.`,
        { toastId: 'sesion-por-vencer', autoClose: 15000 },
      );
    }, antesDelAviso));
  }
  temporizadores.push(setTimeout(cerrarSesionExpirada, restante));
};

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
      const url: string = error?.config?.url || '';
      const metodo = (error?.config?.method || '').toUpperCase();
      const esEscritura = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(metodo);

      // El login también responde 401 ante una clave errada: eso no es sesión vencida.
      if (status === 401 && !url.includes('/api/auth/login')) {
        cerrarSesionExpirada();
      }

      if (status === 403 && esEscritura) {
        const mensaje = error.response?.data?.error;
        if (typeof mensaje === 'string' && mensaje.includes('solo lectura')) {
          toast.info(mensaje, { toastId: 'solo-lectura' });
        }
      }

      return Promise.reject(error);
    },
  );

  // Reprograma el vencimiento con cada login/logout; la primera llamada cubre el token
  // que ya venía guardado al recargar la página.
  let tokenActual = store.getState().auth.token as string | null;
  programarVencimiento(tokenActual);
  store.subscribe(() => {
    const token = store.getState().auth.token as string | null;
    if (token !== tokenActual) {
      tokenActual = token;
      programarVencimiento(token);
    }
  });
};
