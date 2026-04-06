import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import KanbanBoard from './components/KanbanBoard';
import NewLeadModal from './components/NewLeadModal';
import CRMMetrics from './components/CRMMetrics';
import DashboardGerencial from './components/DashboardGerencial';
import { Plus, Filter, BarChart3, LayoutKanban, TrendingUp } from 'lucide-react';

type Tab = 'pipeline' | 'metricas' | 'gerencial';

const ROLES_GLOBAL = ['admin', 'gerencia', 'asistente_administrativo'];
const ROLES_GERENCIAL = ['admin', 'gerencia', 'asistente_administrativo'];

const CRMPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('pipeline');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const user = useSelector((state: any) => state.auth.user);
  const rol: string = user?.rol || '';
  const asesorId: number | null = user?.id || null;
  const esVistaGlobal = ROLES_GLOBAL.includes(rol);
  const puedeVerGerencial = ROLES_GERENCIAL.includes(rol);

  return (
    <div className="p-6">
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">CRM & Leads</h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestión de prospectos, embudo de ventas y seguimiento inteligente.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeTab === 'pipeline' && (
            <>
              <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium text-sm transition-colors shadow-sm">
                <Filter className="w-4 h-4" />
                Filtros
              </button>
              {(esVistaGlobal || rol === 'asesor_comercial') && (
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
          <LayoutKanban className="w-4 h-4" />
          Pipeline
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
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
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
          <KanbanBoard />
        </div>
      )}

      {activeTab === 'metricas' && (
        <CRMMetrics
          asesorId={asesorId}
          esVistaGlobal={esVistaGlobal}
        />
      )}

      {activeTab === 'gerencial' && puedeVerGerencial && (
        <DashboardGerencial esVistaGlobal={esVistaGlobal} />
      )}

      {isModalOpen && <NewLeadModal onClose={() => setIsModalOpen(false)} />}
    </div>
  );
};

export default CRMPage;
