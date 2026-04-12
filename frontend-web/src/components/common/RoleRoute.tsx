import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '../../store/store';

interface RoleRouteProps {
  allowedRoles: string[];
}

const RoleRoute: React.FC<RoleRouteProps> = ({ allowedRoles }) => {
  const user = useSelector((state: RootState) => state.auth.user);
  const rol: string = user?.rol || '';

  if (rol === 'root') return <Outlet />;
  if (allowedRoles.includes(rol)) return <Outlet />;

  return <Navigate to="/" replace />;
};

export default RoleRoute;
