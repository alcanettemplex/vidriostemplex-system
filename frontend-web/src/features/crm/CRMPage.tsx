import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import KanbanBoard from './components/KanbanBoard';
import NewLeadModal from './components/NewLeadModal';
import CRMMetrics from './components/CRMMetrics';
import DashboardGerencial from './components/DashboardGerencial';
import SinRespuestaTab from './components/SinRespuestaTab';
import ReporteAsesor from './components/ReporteAsesor';
import ProspectosStats from './components/ProspectosStats';
import MonitorAsesores from './components/MonitorAsesores';
import EmbudoAsesores from './components/EmbudoAsesores';
import DateRangeSelector from '../../components/common/DateRangeSelector';
import FolderTabs from '../../components/FolderTabs';
import { Plus, BarChart3, Kanban, TrendingUp, PhoneMissed, Search, X, ClipboardList, Users, ScanEye, Filter } from 'lucide-react';

type Tab = 'pipeline' | 'metricas' | 'gerencial' | 'sin_respuesta' | 'reportes' | 'prospectos' | 'monitor' | 'embudo';

const ROLES_GLOBAL = ['admin', 'gerencia', 'asistente_administrativo', 'root', 'marketing', 'jefe_produccion'];
const ROLES_GERENCIAL = ['admin', 'gerencia', 'asistente_administrativo', 'root', 'marketing', 'jefe_produccion'];

// Inicializar periodo con el mes actual (Desde = mes actual, Hasta = mes actual)
const mesActual = (): string => {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  return `${anio}-${mes}`;
};

/**
 * Convierte "YYYY-MM" al último día del mes en formato "YYYY-MM-DD".
 * Ej: "2026-07" → "2026-07-31"
 * Esto garantiza que el filtro de Hasta incluya todos los leads del mes seleccionado.
 */
const ultimoDiaMes = (ym: string | null): string | null => {
  if (!ym) return null;
  const [anio, mes] = ym.split('-').map(Number);
  if (!anio || !mes) return null;
  // new Date(anio, mes, 0) devuelve el último día del mes anterior al mes+1, es decir el último día de `mes`
  const ultimo = new Date(anio, mes, 0).getDate();
  return `${anio}-${String(mes).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
};

/**
 * Convierte "YYYY-MM" al primer día del mes en formato "YYYY-MM-DD".
 * Ej: "2026-07" → "2026-07-01"
 */
const primerDiaMes = (ym: string | null): string | null => {
  if (!ym) return null;
  const [anio, mes] = ym.split('-').map(Number);
  if (!anio || !mes) return null;
  return `${anio}-${String(mes).padStart(2, '0')}-01`;
};

const CRMPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('pipeline');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  // Estado de periodo (rango de fechas, máx 4 meses) — inicializado con el mes actual
  const [fechaDesde, setFechaDesde] = useState<string | null>(mesActual);
  const [fechaHasta, setFechaHasta] = useState<string | null>(mesActual);

  const user = useSelector((state: any) => state.auth.user);
  const rol: string = user?.rol || '';
  const asesorId: number | undefined = user?.id || undefined;
  const esVistaGlobal = ROLES_GLOBAL.includes(rol);
  const puedeVerGerencial = ROLES_GERENCIAL.includes(rol);

  const handleDateRangeChange = (desde: string | null, hasta: string | null) => {
    setFechaDesde(desde);
    setFechaHasta(hasta);
  };

  // Fechas expandidas a día completo para enviar al backend:
  // Desde → primer día del mes (YYYY-MM-01)
  // Hasta → último día del mes (YYYY-MM-DD con el último día real)
  const fechaDesdeApi = primerDiaMes(fechaDesde);
  const fechaHastaApi = ultimoDiaMes(fechaHasta);

  return (
    <div className="p-6 min-h-screen" style={{ background: '#EEF0F8' }}>
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">CRM & Leads</h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestión de prospectos, embudo de ventas y seguimiento inteligente.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <DateRangeSelector desde={fechaDesde} hasta={fechaHasta} onChange={handleDateRangeChange} />

          {(activeTab === 'pipeline' || activeTab === 'sin_respuesta') && (
            <>
              {/* Buscador global — aplica a pipeline Y sin_respuesta */}
              <div className="relative min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar nombre o teléfono..."
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white shadow-sm"
                />
                {busqueda && (
                  <button onClick={() => setBusqueda('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {(esVistaGlobal || rol === 'asesor_comercial') && rol !== 'marketing' && (
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold text-sm shadow-sm hover:shadow-md transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Nuevo Lead
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Tabs de navegación — estilo carpeta */}
      <div className="mb-6">
        <FolderTabs
          tabs={[
            { key: 'pipeline',      label: 'Pipeline',      icon: <Kanban className="w-4 h-4" /> },
            { key: 'sin_respuesta', label: 'Sin Respuesta', icon: <PhoneMissed className="w-4 h-4" /> },
            { key: 'metricas',      label: 'Métricas',      icon: <BarChart3 className="w-4 h-4" /> },
            ...(puedeVerGerencial ? [{ key: 'gerencial', label: 'Dashboard Gerencial', icon: <TrendingUp className="w-4 h-4" /> }] : []),
            { key: 'prospectos',    label: 'Prospectos',    icon: <Users className="w-4 h-4" /> },
            ...(puedeVerGerencial ? [{ key: 'monitor', label: 'Monitor', icon: <ScanEye className="w-4 h-4" /> }] : []),
            ...(puedeVerGerencial ? [{ key: 'embudo',  label: 'Embudo',  icon: <Filter className="w-4 h-4" /> }] : []),
            { key: 'reportes',      label: 'Reportes',      icon: <ClipboardList className="w-4 h-4" /> },
          ]}
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as Tab)}
          className="border-b border-slate-200"
        />
      </div>

      {/* Contenido de tabs */}
      {activeTab === 'pipeline' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <KanbanBoard fecha_desde={fechaDesdeApi} fecha_hasta={fechaHastaApi} busqueda={busqueda} setBusqueda={setBusqueda} />
        </div>
      )}

      {activeTab === 'sin_respuesta' && (
        <SinRespuestaTab fecha_desde={fechaDesdeApi} fecha_hasta={fechaHastaApi} busqueda={busqueda} />
      )}

      {activeTab === 'metricas' && (
        <CRMMetrics
          asesorId={asesorId}
          esVistaGlobal={esVistaGlobal}
          fecha_desde={fechaDesdeApi}
          fecha_hasta={fechaHastaApi}
        />
      )}

      {activeTab === 'gerencial' && puedeVerGerencial && (
        <DashboardGerencial
          esVistaGlobal={esVistaGlobal}
          fecha_desde={fechaDesdeApi}
          fecha_hasta={fechaHastaApi}
        />
      )}

      {activeTab === 'prospectos' && (
        <ProspectosStats
          esVistaGlobal={esVistaGlobal}
          fecha_desde={fechaDesdeApi}
          fecha_hasta={fechaHastaApi}
        />
      )}

      {activeTab === 'monitor' && puedeVerGerencial && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
              <ScanEye className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Monitor de Pipeline</h2>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">Leads activos por asesor · tiempo en etapa actual</p>
            </div>
          </div>
          <MonitorAsesores rol={rol} userId={asesorId} />
        </div>
      )}

      {activeTab === 'embudo' && puedeVerGerencial && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center">
              <Filter className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Embudo de Conversión</h2>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                Tasa de conversión etapa→etapa por asesor · período seleccionado
              </p>
            </div>
          </div>
          <EmbudoAsesores fecha_desde={fechaDesdeApi} fecha_hasta={fechaHastaApi} />
        </div>
      )}

      {activeTab === 'reportes' && (
        <ReporteAsesor
          esVistaGlobal={esVistaGlobal}
          fecha_desde={fechaDesdeApi}
          fecha_hasta={fechaHastaApi}
        />
      )}

      {isModalOpen && <NewLeadModal onClose={() => setIsModalOpen(false)} />}
    </div>
  );
};

export default CRMPage;
