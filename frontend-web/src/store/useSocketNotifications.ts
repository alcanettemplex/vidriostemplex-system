import { useEffect } from 'react';
import socket from '../store/socket';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'react-toastify';

// Mapa de módulo → evento de Redux que dispara el refetch en cada página
// Cada módulo escucha este evento y recarga sus datos
const DATA_CHANGED_EVENT = 'SOCKET_DATA_CHANGED';

export const useSocketNotifications = () => {
  const dispatch = useDispatch();
  const user = useSelector((state: any) => state.auth.user);

  useEffect(() => {
    if (!user) return;

    const joinRooms = () => {
      socket.emit('join', {
        userId: user.id,
        rol: user.rol || user.role,
      });
    };

    joinRooms();
    socket.on('connect', joinRooms);

    socket.on('notification', (data: any) => {
      dispatch({ type: 'notifications/received', payload: data });
      toast.info(`🔔 ${data.mensaje || data.message}`, {
        position: 'bottom-left',
        autoClose: 6000,
      });
    });

    // Escucha cambios de datos emitidos por el backend y los propaga como acción Redux
    socket.on('data_changed', (data: { modulo: string }) => {
      dispatch({ type: DATA_CHANGED_EVENT, payload: data.modulo });
    });

    return () => {
      socket.off('connect', joinRooms);
      socket.off('notification');
      socket.off('data_changed');
    };
  }, [dispatch, user]);
};

/**
 * Hook para que cada módulo se suscriba a cambios en tiempo real.
 * Llama al callback `onRefresh` cuando el backend emite un cambio en el módulo indicado.
 * El debounce de 600ms evita recargas en ráfaga cuando hay múltiples eventos seguidos.
 *
 * Uso: useDataChangedSocket('odp', fetchODPs);
 */
export const useDataChangedSocket = (modulo: string, onRefresh: () => void) => {
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handler = (data: { modulo: string }) => {
      if (data.modulo !== modulo) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        onRefresh();
      }, 600);
    };

    socket.on('data_changed', handler);

    return () => {
      socket.off('data_changed', handler);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [modulo, onRefresh]);
};
