import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store/store';
import { clear } from '../../store/notificationsSlice';

const NotificationsList: React.FC = () => {
  const notifications = useSelector((state: RootState) => state.notifications.notifications);
  const dispatch = useDispatch();
  useEffect(() => {
    return () => { dispatch(clear()); };
  }, [dispatch]);
  return (
    <div style={{ position: 'fixed', top: 70, right: 16, zIndex: 9999 }}>
      {notifications.map((n, i) => (
        <div key={i} style={{ background: '#1976d2', color: '#fff', marginBottom: 8, padding: 12, borderRadius: 6 }}>
          {typeof n === 'string' ? n : JSON.stringify(n)}
        </div>
      ))}
    </div>
  );
};
export default NotificationsList;
