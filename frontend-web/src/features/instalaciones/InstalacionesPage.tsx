import React from 'react';
import { useSelector } from 'react-redux';
import JefeView from './components/JefeView';
import InstaladorView from './components/InstaladorView';
import ConductorView from './components/ConductorView';

const InstalacionesPage: React.FC = () => {
  const user = useSelector((state: any) => state.auth.user);
  const rol = (user?.rol || '').toLowerCase();

  if (rol === 'instalador') return <InstaladorView />;
  if (rol === 'conductor') return <ConductorView />;
  // admin, gerencia, jefe_produccion
  return <JefeView />;
};

export default InstalacionesPage;
