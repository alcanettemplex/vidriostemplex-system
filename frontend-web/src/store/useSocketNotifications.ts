import { useEffect } from 'react';
import socket from '../store/socket';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'react-toastify';

export const useSocketNotifications = () => {
  const dispatch = useDispatch();
  const user = useSelector((state: any) => state.auth.user);

  useEffect(() => {
    if (!user) return;

    // Unirse a rooms personales al conectar (o reconectar)
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

    return () => {
      socket.off('connect', joinRooms);
      socket.off('notification');
    };
  }, [dispatch, user]);
};
