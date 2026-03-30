import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import Sidebar from '../components/common/Sidebar';
import ProtectedRoute from '../components/common/ProtectedRoute';
import LoginPage from '../features/auth/LoginPage';
import DashboardHome from '../components/dashboard/DashboardHome';
import ClientesListPage from '../features/clientes/ClientesListPage';
import ODPListPage from '../features/odp/ODPListPage';
import ProduccionPage from '../features/produccion/ProduccionPage';
import InstalacionesPage from '../features/instalaciones/InstalacionesPage';
import EvidenciasPage from '../features/evidencias/EvidenciasPage';
import ReportesPage from '../features/reportes/ReportesPage';
import ComprasPage from '../features/compras/ComprasPage';
import ContabilidadPage from '../features/contabilidad/ContabilidadPage';
import UsuariosPage from '../features/usuarios/UsuariosPage';
import ConfiguracionPage from '../features/configuracion/ConfiguracionPage';
import TomaMedidasPage from '../features/toma-medidas/TomaMedidasPage';
import ProspectosPage from '../features/prospectos/ProspectosPage';
import InventarioPage from '../features/inventario/InventarioPage';

const AppRoutes: React.FC = () => (
  <Router>
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Sidebar />
      <main className="pt-16 md:pl-64 min-h-screen transition-all">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<DashboardHome />} />
            <Route path="/clientes" element={<ClientesListPage />} />
            <Route path="/odp" element={<ODPListPage />} />
            <Route path="/produccion" element={<ProduccionPage />} />
            <Route path="/instalaciones" element={<InstalacionesPage />} />
            <Route path="/evidencias" element={<EvidenciasPage />} />
            <Route path="/reportes" element={<ReportesPage />} />
            <Route path="/compras" element={<ComprasPage />} />
            <Route path="/contabilidad" element={<ContabilidadPage />} />
            <Route path="/usuarios" element={<UsuariosPage />} />
            <Route path="/configuracion" element={<ConfiguracionPage />} />
            <Route path="/toma-medidas" element={<TomaMedidasPage />} />
            <Route path="/prospectos" element={<ProspectosPage />} />
            <Route path="/inventario" element={<InventarioPage />} />
          </Route>
        </Routes>
      </main>
    </div>
  </Router>
);

export default AppRoutes;
