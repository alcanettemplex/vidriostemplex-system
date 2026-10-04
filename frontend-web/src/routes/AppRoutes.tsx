import React from 'react';
import { createBrowserRouter, createRoutesFromElements, RouterProvider, Route } from 'react-router-dom';
import AppShell from '../components/common/AppShell';
import ProtectedRoute from '../components/common/ProtectedRoute';
import RoleRoute from '../components/common/RoleRoute';
import { rolesDeRuta } from '../components/common/navegacion';
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
import InformeEjecutivoPage from '../features/informe-ejecutivo/InformeEjecutivoPage';
import SupervisionCRMPage from '../features/supervision-crm/SupervisionCRMPage';
import ProveedoresPage from '../features/proveedores/ProveedoresPage';
import CotizadorPage from '../features/cotizador/CotizadorPage';
import DetallesTecnicosPage from '../features/detalles-tecnicos/DetallesTecnicosPage';

// Enrutador "de datos" (2026-10-03): antes era <BrowserRouter>, que no admite
// `useBlocker`. El Cotizador lo necesita para avisar de cambios sin guardar al
// salir por el menú, Ctrl+K o un enlace — no solo al cerrar la pestaña. Las
// rutas son las mismas <Route> de siempre, envueltas en createRoutesFromElements.
// Se crea una sola vez, a nivel de módulo, como pide React Router.
const router = createBrowserRouter(
  createRoutesFromElements(
      <>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          {/* Módulo de pantalla completa — sin la barra de navegación del resto del sistema.
              Los roles de cada ruta viven en components/common/navegacion.ts (fuente única
              compartida con el menú): cambiarlos ahí cambia menú y protección a la vez. */}
          <Route element={<RoleRoute allowedRoles={rolesDeRuta('/supervision-crm')} />}>
            <Route path="/supervision-crm" element={<SupervisionCRMPage />} />
          </Route>

          {/* Resto de la aplicación — shell estándar (barra superior de navegación) */}
          <Route element={<AppShell />}>
            <Route path="/" element={<DashboardHome />} />
            <Route element={<RoleRoute allowedRoles={rolesDeRuta('/configuracion')} />}>
              <Route path="/configuracion" element={<ConfiguracionPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={rolesDeRuta('/clientes')} />}>
              <Route path="/clientes" element={<ClientesListPage />} />
            </Route>
            {/* Prospectos separado de Clientes: 'marketing' consulta prospectos pero no clientes. */}
            <Route element={<RoleRoute allowedRoles={rolesDeRuta('/prospectos')} />}>
              <Route path="/prospectos" element={<ProspectosPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={rolesDeRuta('/odp')} />}>
              <Route path="/odp" element={<ODPListPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={rolesDeRuta('/crm')} />}>
              <Route path="/crm" element={<CRMPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={rolesDeRuta('/produccion')} />}>
              <Route path="/produccion" element={<ProduccionPage />} />
            </Route>
            {/* Detalles técnicos (2026-09-27) — editor de planos de vidrio templado, AISLADO
                (sin backend, sin vínculo con Pedidos PV): solo admin mientras se decide su integración. */}
            <Route element={<RoleRoute allowedRoles={rolesDeRuta('/detalles-tecnicos')} />}>
              <Route path="/detalles-tecnicos" element={<DetallesTecnicosPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={rolesDeRuta('/toma-medidas')} />}>
              <Route path="/toma-medidas" element={<TomaMedidasPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={rolesDeRuta('/instalaciones')} />}>
              <Route path="/instalaciones" element={<InstalacionesPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={rolesDeRuta('/compras')} />}>
              <Route path="/compras" element={<ComprasPage />} />
            </Route>
            {/* Proveedores — precios de compra: solo root y admin (información sensible) */}
            <Route element={<RoleRoute allowedRoles={rolesDeRuta('/proveedores')} />}>
              <Route path="/proveedores" element={<ProveedoresPage />} />
            </Route>
            {/* Cotizador — integrado al ERP desde el 2026-09-27: todos los roles lo VEN;
                quién crea, edita o administra lo decide features/cotizador/permisos.ts
                (y lo impone el backend). */}
            <Route path="/cotizador" element={<CotizadorPage />} />
            <Route element={<RoleRoute allowedRoles={rolesDeRuta('/inventario')} />}>
              <Route path="/inventario" element={<InventarioPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={rolesDeRuta('/pedidos-pv')} />}>
              <Route path="/pedidos-pv" element={<PedidosPVPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={rolesDeRuta('/facturas-salidas')} />}>
              <Route path="/facturas-salidas" element={<FacturasSalidasPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={rolesDeRuta('/contabilidad')} />}>
              <Route path="/contabilidad" element={<ContabilidadPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={rolesDeRuta('/usuarios')} />}>
              <Route path="/usuarios" element={<UsuariosPage />} />
            </Route>
            <Route element={<RoleRoute allowedRoles={rolesDeRuta('/root')} />}>
              <Route path="/root" element={<RootPage />} />
              <Route path="/informe-ejecutivo" element={<InformeEjecutivoPage />} />
            </Route>
            <Route path="/manuales" element={<ManualesPage />} />
          </Route>
        </Route>
      </>
  )
);

const AppRoutes: React.FC = () => <RouterProvider router={router} />;

export default AppRoutes;
