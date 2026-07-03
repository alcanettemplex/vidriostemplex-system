import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

/**
 * Shell estándar de la aplicación (Navbar + Sidebar + contenido).
 * Se usa para todas las rutas excepto los módulos de pantalla completa
 * (ej. Supervisión CRM), que renderizan fuera de este wrapper.
 */
const AppShell: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar onToggleSidebar={() => setSidebarOpen(prev => !prev)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-16 md:pl-64 min-h-screen transition-all">
        <Outlet />
      </main>
    </div>
  );
};

export default AppShell;
