import { useEffect, Dispatch, SetStateAction } from 'react';
import socket from '../store/socket';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import { clearODPCache } from '../features/odp/odpSlice';

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
      const prefijo = data.numero_odp ? `ODP ${data.numero_odp.split('-').pop()} — ` : '';
      toast.info(`🔔 ${prefijo}${data.mensaje || data.message}`, {
        position: 'bottom-left',
        autoClose: 6000,
      });
    });

    // Escucha cambios de datos emitidos por el backend y los propaga como acción Redux
    socket.on('data_changed', (data: { modulo: string }) => {
      dispatch({ type: DATA_CHANGED_EVENT, payload: data.modulo });
    });

    // Invalida la caché de una ODP puntual (state.odp.cache) cuando llega un patch.
    // No se mergea el payload del evento: emitirODPPatch usa un include liviano
    // (SAP sin items) para no pesar el broadcast global, así que mergearlo borraría
    // datos ya cargados. Invalidar fuerza un refetch limpio vía fetchODPById cuando
    // el componente que la tenga abierta (p.ej. ODPFichaModal) lo necesite.
    socket.on('odp_patch', (data: { id: number }) => {
      dispatch(clearODPCache(data.id));
    });

    return () => {
      socket.off('connect', joinRooms);
      socket.off('notification');
      socket.off('data_changed');
      socket.off('odp_patch');
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
type SetODPs = Dispatch<SetStateAction<any[]>>;

interface ODPPatchPayload {
  accion: 'create' | 'update' | 'delete';
  id: number;
  odp?: any;
}

/**
 * Hook para actualizar el estado local de ODPs sin re-fetchear la lista completa.
 * Escucha el evento 'odp_patch' emitido por emitirODPPatch() en el backend.
 *
 * RIESGO DOCUMENTADO: ContabilidadPage divide odps en dos arrays (odps / odpsOA).
 * Pasar SIEMPRE setOdpsOA en ese contexto — si se omite, las OAs quedarán
 * desactualizadas silenciosamente. Ver memory/project_odp_patch_riesgo.md.
 *
 * Uso en ODPListPage:       useODPSocketPatch({ setOdps, setGarantias })
 * Uso en ContabilidadPage:  useODPSocketPatch({ setOdps, setOdpsOA })
 */
export const useODPSocketPatch = (params: {
  setOdps: SetODPs;
  setGarantias?: SetODPs;
  setOdpsOA?: SetODPs;
}) => {
  const { setOdps, setGarantias, setOdpsOA } = params;

  useEffect(() => {
    const handler = ({ accion, id, odp }: ODPPatchPayload) => {
      if (accion === 'delete') {
        setOdps(prev => prev.filter(o => o.id !== id));
        setGarantias?.(prev => prev.filter(o => o.id !== id));
        setOdpsOA?.(prev => prev.filter(o => o.id !== id));
        return;
      }

      if (!odp) return;

      if (accion === 'create') {
        if (odp.tipo_odp === 'OA') {
          setOdpsOA?.(prev => [odp, ...prev]);
        } else if (odp.es_garantia) {
          setGarantias?.(prev => [odp, ...prev]);
        } else {
          setOdps(prev => [odp, ...prev]);
        }
        return;
      }

      // update: parchar en todos los arrays; el .map es no-op donde el ID no existe
      const patch = (arr: any[]) => arr.map(o => o.id === id ? odp : o);
      setOdps(prev => patch(prev));
      setGarantias?.(prev => patch(prev));
      setOdpsOA?.(prev => patch(prev));
    };

    socket.on('odp_patch', handler);
    return () => { socket.off('odp_patch', handler); };
  }, [setOdps, setGarantias, setOdpsOA]);
};

export const useDataChangedSocket = (modulo: string, onRefresh: () => void) => {
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let pendiente = false; // hubo un cambio mientras la pestaña estaba oculta

    const ejecutarRefresh = () => {
      pendiente = false;
      onRefresh();
    };

    const handler = (data: { modulo: string }) => {
      if (data.modulo !== modulo) return;
      // Si la pestaña no está visible (segundo plano), no re-fetchear: marcar
      // pendiente y sincronizar una sola vez cuando el usuario vuelva al foco.
      // Evita refetches de listas completas en clientes que no están mirando.
      if (document.hidden) {
        pendiente = true;
        return;
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(ejecutarRefresh, 600);
    };

    const onVisibilityChange = () => {
      if (!document.hidden && pendiente) {
        if (debounceTimer) clearTimeout(debounceTimer);
        ejecutarRefresh();
      }
    };

    socket.on('data_changed', handler);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      socket.off('data_changed', handler);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [modulo, onRefresh]);
};
