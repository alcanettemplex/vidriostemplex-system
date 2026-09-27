import React from 'react';
import PanelCotizaciones from '../PanelCotizaciones';

/**
 * Dashboard para los roles con acceso a Cotizaciones que NO ven el Dashboard gerencial
 * (hoy: `gerente`, control total del Cotizador pero fuera de `DASHBOARD_ROLES` del
 * backend). Solo la pestaña Cotizaciones: no se les exponen las demás.
 */
const TableroCotizacionesSolo: React.FC = () => (
  <div className="p-4 sm:p-6 lg:p-8 w-full min-h-screen bg-slate-50">
    <div className="mb-5">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Cotizaciones</h1>
      <p className="text-[13px] text-slate-700 mt-0.5">Tablero comercial del Cotizador</p>
    </div>
    <PanelCotizaciones />
  </div>
);

export default TableroCotizacionesSolo;
