import React from 'react';
import { useSelector } from 'react-redux';
import GerenciaDashboard from './GerenciaDashboard';

// Interfaz para esquivar el error de typed useSelector si rootState no tiene typings estrictos del usuario
interface AuthStateUser {
  id: number;
  nombre_completo: string;
  email: string;
  rol: string;
}

const DashboardHome: React.FC = () => {
  const user = useSelector((state: any) => state.auth.user as AuthStateUser | null);

  if (!user) {
    return null;
  }

  // Si es administrador o gerencia u otro rol autorizado para esto
  if (['admin', 'gerencia', 'contabilidad', 'jefe_produccion', 'root', 'marketing', 'asesor_comercial', 'produccion', 'compras', 'asistente_administrativo'].includes(user.rol)) {
    return <GerenciaDashboard />;
  }

  // Fallbacks visuales para otros roles por ahora si llegan aquí
  return (
    <div className="p-10 text-center">
      <h2 className="text-2xl font-bold text-slate-800">Bienvenido, {user.nombre_completo}</h2>
      <p className="text-slate-500 mt-2">Visita la sección de ODPs para gestionar tu trabajo.</p>
    </div>
  );
};

export default DashboardHome;


