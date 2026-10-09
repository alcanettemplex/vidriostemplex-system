import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Avisa antes de perder un orden sin aceptar: al salir de la pantalla por el menú, Ctrl+K o
 * un enlace (`useBlocker`, requiere el enrutador de datos de AppRoutes) y al cerrar o
 * recargar la pestaña (`beforeunload`). Cambiar de pestaña dentro de Instalaciones no pasa
 * por el enrutador: ahí el borrador se pierde sin aviso.
 */
export const useAvisoSinGuardar = (sucio: boolean, mensaje: string): void => {
  const bloqueo = useBlocker(({ currentLocation, nextLocation }) => sucio && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (bloqueo.state !== 'blocked') return;
    if (window.confirm(mensaje)) bloqueo.proceed();
    else bloqueo.reset();
  }, [bloqueo, mensaje]);
  useEffect(() => {
    if (!sucio) return;
    const alSalir = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', alSalir);
    return () => window.removeEventListener('beforeunload', alSalir);
  }, [sucio]);
};
