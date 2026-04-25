import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import Sidebar from '../components/common/Sidebar';
import ProtectedRoute from '../components/common/ProtectedRoute';
import RoleRoute from '../components/common/RoleRoute';
import LoginPage from '../features/auth/LoginPage';
import DashboardHome from '../components/dashboard/DashboardHome';
import ClientesListPage from '../features/clientes/ClientesListPage';
import ODPListPage from '../features/odp/ODPListPage';
import ProduccionPage from '../features/produccion/ProduccionPage';
import InstalacionesPage from '../features/instalaciones/InstalacionesPage';
import ComprasPage from '../features/compras/ComprasPage';
import ContabilidadPage from '../features/contabilidad/ContabilidadPage';
import UsuariosPage from '../features/usuarios/UsuariosPage';
import ConfiguracionPage from '../features/configuracion/ConfiguracionPage';
import TomaMedidasPage from '../features/toma-medidas/TomaMedidasPage';
import ProspectosPage from '../features/prospectos/ProspectosPage';
import InventarioPage from '../features/inventario/InventarioPage';
import PedidosPVPage from '../features/pedidos-pv/PedidosPVPage';
import FacturasSalidasPage from '../features/facturas-salidas/FacturasSalidasPage';
import RootPage from '../features/root/RootPage';
import CRMPage from '../features/crm/CRMPage';
import ManualesPage from '../features/manuales/ManualesPage';

const AppRoutes: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
  <Router>
    <div className="min-h-screen bg-slate-50">
      <Navbar onToggleSidebar={() => setSidebarOpen(prev => !prev)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pt-16 md:pl-64 min-h-screen transition-all">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<DashboardHome />} />
            <Route element={<RoleRoute allowedRoles={['admin', 'gerencia', 'marketing']} />}>
              <Route path="/configuracion" element={<ConfiguracionPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={['admin', 'gerencia', 'marketing', 'asesor_comercial', 'jefe_produccion', 'asistente_administrativo']} />}>
              <Route path="/clientes" element={<ClientesListPage />} />
              <Route path="/prospectos" element={<ProspectosPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={['admin', 'gerencia', 'marketing', 'asesor_comercial', 'jefe_produccion', 'contabilidad', 'compras', 'produccion', 'asistente_administrativo']} />}>
              <Route path="/odp" element={<ODPListPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={['admin', 'gerencia', 'marketing', 'asesor_comercial', 'asistente_administrativo', 'jefe_produccion']} />}>
              <Route path="/crm" element={<CRMPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={['admin', 'gerencia', 'marketing', 'jefe_produccion', 'taller', 'produccion', 'auxiliar_produccion', 'asistente_administrativo']} />}>
              <Route path="/produccion" element={<ProduccionPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={['admin', 'jefe_produccion', 'asesor_comercial', 'compras', 'produccion', 'asistente_administrativo']} />}>
              <Route path="/toma-medidas" element={<TomaMedidasPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={['admin', 'gerencia', 'marketing', 'jefe_produccion', 'instalador', 'conductor', 'asesor_comercial', 'compras', 'produccion', 'asistente_administrativo']} />}>
              <Route path="/instalaciones" element={<InstalacionesPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={['admin', 'gerencia', 'marketing', 'compras', 'jefe_produccion']} />}>
              <Route path="/compras" element={<ComprasPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={['admin', 'jefe_produccion', 'produccion', 'auxiliar_produccion', 'compras']} />}>
              <Route path="/inventario" element={<InventarioPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={['admin', 'gerencia', 'marketing', 'asesor_comercial', 'jefe_produccion', 'produccion', 'auxiliar_produccion', 'compras', 'asistente_administrativo']} />}>
              <Route path="/pedidos-pv" element={<PedidosPVPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={['admin', 'gerencia', 'marketing', 'contabilidad', 'compras', 'produccion']} />}>
              <Route path="/facturas-salidas" element={<FacturasSalidasPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={['admin', 'gerencia', 'marketing', 'contabilidad', 'asistente_administrativo']} />}>
              <Route path="/contabilidad" element={<ContabilidadPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={['admin']} />}>
              <Route path="/usuarios" element={<UsuariosPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={['root']} />}>
              <Route path="/root" element={<RootPage />} />
            </Route>
            <Route path="/manuales" element={<ManualesPage />} />
          </Route>
        </Routes>
      </main>
    </div>
  </Router>
  );
};

export default AppRoutes;
