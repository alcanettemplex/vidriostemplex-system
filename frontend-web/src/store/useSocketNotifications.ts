import { useEffect } from 'react';
import socket from '../store/socket';
import { useDispatch } from 'react-redux';
import { toast } from 'react-toastify';

export const useSocketNotifications = () => {
  const dispatch = useDispatch();
  useEffect(() => {
    socket.on('notification', (data: any) => {
      dispatch({ type: 'notifications/received', payload: data });
      toast.info(`🔔 ${data.message}`, {
        position: "bottom-left",
        autoClose: 5000,
      });
    });
    return () => {
      socket.off('notification');
    };
  }, [dispatch]);
};
