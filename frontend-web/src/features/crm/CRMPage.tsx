import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import KanbanBoard from './components/KanbanBoard';
import NewLeadModal from './components/NewLeadModal';
import CRMMetrics from './components/CRMMetrics';
import DashboardGerencial from './components/DashboardGerencial';
import SinRespuestaTab from './components/SinRespuestaTab';
import PeriodSelector from '../../components/common/PeriodSelector';
import { Plus, BarChart3, Kanban, TrendingUp, PhoneMissed } from 'lucide-react';

type Tab = 'pipeline' | 'metricas' | 'gerencial' | 'sin_respuesta';

const ROLES_GLOBAL = ['admin', 'gerencia', 'asistente_administrativo', 'root', 'marketing'];
const ROLES_GERENCIAL = ['admin', 'gerencia', 'asistente_administrativo', 'root', 'marketing'];

const CRMPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('pipeline');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Estado de periodo (mes actual por defecto)
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());

  const user = useSelector((state: any) => state.auth.user);
  const rol: string = user?.rol || '';
  const asesorId: number | undefined = user?.id || undefined;
  const esVistaGlobal = ROLES_GLOBAL.includes(rol);
  const puedeVerGerencial = ROLES_GERENCIAL.includes(rol);

  const handlePeriodChange = (m: number, a: number) => {
    setMes(m);
    setAnio(a);
  };

  return (
    <div className="p-6 min-h-screen" style={{ background: '#EEF0F8' }}>
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">CRM & Leads</h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestión de prospectos, embudo de ventas y seguimiento inteligente.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PeriodSelector mes={mes} anio={anio} onChange={handlePeriodChange} />

          {(activeTab === 'pipeline' || activeTab === 'sin_respuesta') && (
            <>
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

      {/* Tabs de navegación */}
      <div className="flex items-center gap-1 mb-6 p-1 bg-slate-100 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('pipeline')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'pipeline'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Kanban className="w-4 h-4" />
          Pipeline
        </button>
        <button
          onClick={() => setActiveTab('sin_respuesta')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'sin_respuesta'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <PhoneMissed className="w-4 h-4" />
          Sin Respuesta
        </button>
        <button
          onClick={() => setActiveTab('metricas')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'metricas'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Métricas
        </button>
        {puedeVerGerencial && (
          <button
            onClick={() => setActiveTab('gerencial')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'gerencial'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Dashboard Gerencial
          </button>
        )}
      </div>

      {/* Contenido de tabs */}
      {activeTab === 'pipeline' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <KanbanBoard mes={mes} anio={anio} />
        </div>
      )}

      {activeTab === 'sin_respuesta' && (
        <SinRespuestaTab mes={mes} anio={anio} />
      )}

      {activeTab === 'metricas' && (
        <CRMMetrics
          asesorId={asesorId}
          esVistaGlobal={esVistaGlobal}
          mes={mes}
          anio={anio}
        />
      )}

      {activeTab === 'gerencial' && puedeVerGerencial && (
        <DashboardGerencial
          esVistaGlobal={esVistaGlobal}
          mes={mes}
          anio={anio}
        />
      )}

      {isModalOpen && <NewLeadModal onClose={() => setIsModalOpen(false)} />}
    </div>
  );
};

export default CRMPage;
