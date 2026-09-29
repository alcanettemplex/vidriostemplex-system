import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

/**
 * Shell estándar de la aplicación: barra de navegación superior + contenido a todo el ancho.
 * Se usa para todas las rutas excepto los módulos de pantalla completa (ej. Supervisión CRM),
 * que renderizan fuera de este wrapper.
 *
 * Desde el 2026-09-28 no hay menú lateral fijo: la navegación vive en la barra (64px, `pt-16`)
 * y en tablet/celular en un panel que abre la propia barra. El contenido ya no descuenta
 * `md:pl-64`; un elemento fijo que antes usaba `md:left-64` ahora va de borde a borde.
 */
const AppShell: React.FC = () => (
  <div className="min-h-screen bg-slate-50">
    <Navbar />
    <main className="pt-16 min-h-screen">
      <Outlet />
    </main>
  </div>
);

export default AppShell;
