import { useSelector } from 'react-redux';

/**
 * Roles que solo consultan: ven los módulos a los que tienen acceso, pero no crean,
 * editan ni eliminan nada.
 *
 * El bloqueo real vive en el backend (`authMiddleware` rechaza todo método distinto de
 * GET para estos roles). Lo de aquí es la capa visual: sirve para no mostrar controles
 * que igualmente serían rechazados.
 *
 * Ojo: `asistente_administrativo` NO está en esta lista. Ese rol sí escribe en algunos
 * módulos (pagos de Órdenes Azules, por ejemplo) y sus restricciones son puntuales, no
 * globales; se siguen manejando con los flags `isReadOnly` locales de cada página.
 */
export const ROLES_SOLO_LECTURA = ['marketing'];

export const esSoloLectura = (rol?: string | null): boolean =>
  ROLES_SOLO_LECTURA.includes((rol || '').toLowerCase());

/** Versión hook: lee el rol del usuario autenticado desde Redux. */
export const useSoloLectura = (): boolean => {
  const rol = useSelector((state: any) => state.auth?.user?.rol);
  return esSoloLectura(rol);
};
