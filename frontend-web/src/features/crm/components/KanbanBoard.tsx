import React, { useEffect, useState, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import {
  Search, X, ChevronDown, ChevronRight, LayoutList,
  Columns, DollarSign, AlertTriangle, Zap, ArrowUpDown,
  User, Phone, Tag, Clock, UserCheck, Filter
} from 'lucide-react';
import { fetchLeadsStart, fetchLeadsSuccess, fetchLeadsFailure, updateLead } from '../crmSlice';
import { apiGetLeads, apiUpdateLeadStatus, apiAssignLeadToMe } from '../crmService';
import LeadCard from './LeadCard';
import MotivoPerdidaModal from './MotivoPerdidaModal';

// ─── Etapas del pipeline ─────────────────────────────────────────────────────
const PIPELINE_STAGES = [
  { id: 'NUEVO',          label: 'Bolsa Común',  color: 'bg-slate-50 border-slate-200',     dot: 'bg-slate-400',   headerBg: 'bg-slate-100' },
  { id: 'ASIGNADO',       label: 'Asignados',    color: 'bg-blue-50 border-blue-200',       dot: 'bg-blue-500',    headerBg: 'bg-blue-100' },
  { id: 'EN_CONTACTO',    label: 'En Contacto',  color: 'bg-purple-50 border-purple-200',   dot: 'bg-purple-500',  headerBg: 'bg-purple-100' },
  { id: 'COTIZANDO',      label: 'Cotizando',    color: 'bg-amber-50 border-amber-200',     dot: 'bg-amber-500',   headerBg: 'bg-amber-100' },
  { id: 'VISITA_TECNICA', label: 'V. Técnica',   color: 'bg-indigo-50 border-indigo-200',   dot: 'bg-indigo-500',  headerBg: 'bg-indigo-100' },
  { id: 'FRIO',           label: 'Enfriados',    color: 'bg-gray-100 border-gray-300',      dot: 'bg-gray-400',    headerBg: 'bg-gray-200' },
  { id: 'APROBADO',       label: 'Aprobados ✓',  color: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500', headerBg: 'bg-emerald-100' },
  { id: 'PERDIDO',        label: 'Perdidos',     color: 'bg-rose-50 border-rose-200',       dot: 'bg-rose-400',    headerBg: 'bg-rose-100' },
];

const REQUIERE_MOTIVO = ['PERDIDO'];
const SEGMENTOS = ['Arquitecto', 'Cliente final', 'Industrial', 'Institucional', 'Intervid'];
const CARDS_POR_PAGINA = 7;

// ─── Prioridad automática ──────────────────────────────────────────────────────
type Prioridad = 'urgente' | 'normal' | 'frio';

function calcularPrioridad(lead: any): Prioridad {
  if (lead.intentos_seguimiento >= 2) return 'urgente';
  const dias = lead.createdAt
    ? (Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    : 0;
  if (dias > 7 && !lead.intentos_seguimiento) return 'frio';
  return 'normal';
}

function sortByPriority(leads: any[]): any[] {
  const orden: Record<Prioridad, number> = { urgente: 0, normal: 1, frio: 2 };
  return [...leads].sort((a, b) => orden[calcularPrioridad(a)] - orden[calcularPrioridad(b)]);
}

// ─── Badge de prioridad ───────────────────────────────────────────────────────
const PrioridadBadge: React.FC<{ prioridad: Prioridad }> = ({ prioridad }) => {
  if (prioridad === 'urgente') return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-600 animate-pulse border border-rose-200">
      <AlertTriangle className="w-2.5 h-2.5" /> URGENTE
    </span>
  );
  if (prioridad === 'frio') return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 border border-slate-200">
      ❄️ SIN ACTIVIDAD
    </span>
  );
  return null;
};

// ─── Colores de segmento ──────────────────────────────────────────────────────
const SEGMENTO_COLOR: Record<string, string> = {
  'Arquitecto':    'bg-violet-100 text-violet-700',
  'Cliente final': 'bg-blue-100 text-blue-700',
  'Industrial':    'bg-amber-100 text-amber-700',
  'Institucional': 'bg-emerald-100 text-emerald-700',
  'Intervid':      'bg-fuchsia-100 text-fuchsia-700',
};

// ─── Fila de tabla ────────────────────────────────────────────────────────────
const TablaFila: React.FC<{
  lead: any; rol: string;
  onVerDetalle: (lead: any) => void;
  onTomar: (id: number) => void;
}> = ({ lead, rol, onVerDetalle, onTomar }) => {
  const prioridad = calcularPrioridad(lead);
  const stage = PIPELINE_STAGES.find(s => s.id === lead.estado_crm);
  const monto = lead.monto_proyectado_cotizacion
    ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(lead.monto_proyectado_cotizacion)
    : '—';
  const fecha = lead.createdAt
    ? new Date(lead.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
    : '—';

  return (
    <tr className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${
      prioridad === 'urgente' ? 'bg-rose-50/40' : ''
    }`}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-8 rounded-full ${
            prioridad === 'urgente' ? 'bg-rose-400' :
            prioridad === 'frio' ? 'bg-slate-300' : 'bg-indigo-400'
          }`} />
          <div>
            <p className="text-sm font-bold text-slate-800 leading-tight">{lead.nombre || '—'}</p>
            <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
              <Phone className="w-2.5 h-2.5" /> {lead.telefono || '—'}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${stage?.dot || 'bg-slate-300'}`} />
          <span className="text-xs font-semibold text-slate-700">{stage?.label || lead.estado_crm}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-slate-500">{lead.asesor?.nombre_completo || (
          <span className="italic text-slate-400">Sin asignar</span>
        )}</span>
      </td>
      <td className="px-4 py-3">
        {lead.segmento ? (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${SEGMENTO_COLOR[lead.segmento] || 'bg-slate-100 text-slate-600'}`}>
            {lead.segmento}
          </span>
        ) : '—'}
      </td>
      <td className="px-4 py-3">
        <span className="text-xs font-bold text-emerald-700">{monto}</span>
      </td>
      <td className="px-4 py-3">
        <PrioridadBadge prioridad={prioridad} />
        {prioridad === 'normal' && <span className="text-[10px] text-slate-400">{fecha}</span>}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onVerDetalle(lead)}
            className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-slate-800 text-white hover:bg-slate-700 transition-colors"
          >
            Ver
          </button>
          {lead.estado_crm === 'NUEVO' && rol === 'asesor_comercial' && (
            <button
              onClick={() => onTomar(lead.id)}
              className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors flex items-center gap-1"
            >
              <Zap className="w-2.5 h-2.5" /> Tomar
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};

// ─── Componente principal ─────────────────────────────────────────────────────
interface PerdidaPendiente { leadId: number; leadNombre: string; sourceStageId: string; }
type ViewMode = 'kanban' | 'tabla';

interface KanbanBoardProps {
  mes?: number;
  anio?: number;
}

const KanbanBoard: React.FC<KanbanBoardProps> = ({ mes, anio }) => {
  const dispatch = useDispatch();
  const { leads, loading } = useSelector((state: any) => state.crm);
  const user = useSelector((state: any) => state.auth.user);
  const rol: string = user?.rol || '';

  const [perdidaPendiente, setPerdidaPendiente] = useState<PerdidaPendiente | null>(null);
  const [busqueda, setBusqueda]       = useState('');
  const [filtroSegmento, setFiltroSegmento] = useState('');
  const [filtroEstado, setFiltroEstado]     = useState('');
  const [viewMode, setViewMode]       = useState<ViewMode>('kanban');
  const [columnaActiva, setColumnaActiva]   = useState<string>('NUEVO');

  // Estado de columnas colapsadas { 'NUEVO': false, ... }
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PIPELINE_STAGES.map(s => [s.id, false]))
  );
  // Paginación por columna { 'NUEVO': 1, ... }
  const [pagina, setPagina] = useState<Record<string, number>>(() =>
    Object.fromEntries(PIPELINE_STAGES.map(s => [s.id, 1]))
  );

  // Lead seleccionado para panel lateral (propuesta 5)
  const [leadSeleccionado, setLeadSeleccionado] = useState<any>(null);
  const LeadDetalleModal = React.lazy(() => import('./LeadDetalleModal'));

  // ─── Carga de datos ──────────────────────────────────────────────────────────
  const fetchLeads = useCallback(async () => {
    dispatch(fetchLeadsStart());
    try {
      const { data } = await apiGetLeads(mes, anio);
      dispatch(fetchLeadsSuccess(data));
    } catch (err: any) {
      if (err?.response?.status === 401) {
        dispatch(fetchLeadsFailure('Sesión expirada'));
      } else {
        dispatch(fetchLeadsFailure('No se pudieron cargar los leads'));
        toast.warning('No se pudieron cargar los leads. Verifica la conexión.');
      }
    }
  }, [dispatch, mes, anio]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // ─── Filtrado central ────────────────────────────────────────────────────────
  const filtrarLeads = (leads: any[], extras: { stageId?: string } = {}) => {
    return leads.filter((l: any) => {
      if (extras.stageId && l.estado_crm !== extras.stageId) return false;
      if (busqueda) {
        const q = busqueda.toLowerCase();
        if (!l.nombre?.toLowerCase().includes(q) && !l.telefono?.includes(q) && !l.producto_interes?.toLowerCase().includes(q)) return false;
      }
      if (filtroSegmento && l.segmento !== filtroSegmento) return false;
      if (filtroEstado && l.estado_crm !== filtroEstado) return false;
      return true;
    });
  };

  // ─── Drag & Drop Handler ──────────────────────────────────────────────────────
  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const leadId = parseInt(draggableId, 10);
    const nuevoEstado = destination.droppableId;
    const estadoAnterior = source.droppableId;

    if (REQUIERE_MOTIVO.includes(nuevoEstado)) {
      const lead = leads.find((l: any) => l.id === leadId);
      setPerdidaPendiente({ leadId, leadNombre: lead?.nombre || `Lead #${leadId}`, sourceStageId: estadoAnterior });
      return;
    }

    const leadActual = leads.find((l: any) => l.id === leadId);
    if (leadActual) dispatch(updateLead({ ...leadActual, estado_crm: nuevoEstado }));

    try {
      const { data } = await apiUpdateLeadStatus(leadId, nuevoEstado);
      dispatch(updateLead(data));
      if (data.estado_crm === 'FRIO' && nuevoEstado !== 'FRIO') {
        toast.warning(`⚠️ "${leadActual?.nombre}" pasó automáticamente a ENFRIADO.`);
      } else {
        toast.success(`Lead movido a "${PIPELINE_STAGES.find(s => s.id === nuevoEstado)?.label}"`);
      }
    } catch (err: any) {
      if (leadActual) dispatch(updateLead({ ...leadActual, estado_crm: estadoAnterior }));
      toast.error(err?.response?.data?.error || 'Error al mover el lead.');
    }
  };

  // ─── Tomar lead de bolsa ──────────────────────────────────────────────────────
  const handleTakeFromPool = async (leadId: number) => {
    try {
      const { data } = await apiAssignLeadToMe(leadId);
      dispatch(updateLead(data));
      toast.success('¡Lead asignado! Aparece en "Asignados".');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'No se pudo asignar el lead.');
    }
  };

  const toggleCollapse = (stageId: string) =>
    setCollapsed(prev => ({ ...prev, [stageId]: !prev[stageId] }));

  const cargarMas = (stageId: string) =>
    setPagina(prev => ({ ...prev, [stageId]: (prev[stageId] || 1) + 1 }));

  const totalLeadsFiltrados = filtrarLeads(leads).length;

  // ─── Métricas rápidas por columna ────────────────────────────────────────────
  const getColStats = (stageId: string) => {
    const colLeads = filtrarLeads(leads, { stageId });
    const monto = colLeads.reduce((s: number, l: any) => s + parseFloat(l.monto_proyectado_cotizacion || '0'), 0);
    const urgentes = colLeads.filter(l => calcularPrioridad(l) === 'urgente').length;
    return { count: colLeads.length, monto, urgentes };
  };

  // ─── Vista tabla ──────────────────────────────────────────────────────────────
  const renderTabla = () => {
    const leadsTabla = sortByPriority(filtrarLeads(leads));
    return (
      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {['Prospecto', 'Estado', 'Asesor', 'Segmento', 'Monto', 'Prioridad', 'Acciones'].map(h => (
                <th key={h} className="px-4 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                  <div className="flex items-center gap-1">{h}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leadsTabla.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400 text-sm italic">
                  No hay leads que coincidan con los filtros activos.
                </td>
              </tr>
            ) : (
              leadsTabla.map((lead: any) => (
                <TablaFila
                  key={lead.id}
                  lead={lead}
                  rol={rol}
                  onVerDetalle={setLeadSeleccionado}
                  onTomar={handleTakeFromPool}
                />
              ))
            )}
          </tbody>
        </table>
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-400 font-medium">
          {leadsTabla.length} lead(s) encontrados de {leads.length} total
        </div>
      </div>
    );
  };

  // ─── Vista Pipeline Vertical (Propuesta 5) ────────────────────────────────────
  const renderPipelineVertical = () => {
    const colLeads = sortByPriority(filtrarLeads(leads, { stageId: columnaActiva }));
    const pageSize = pagina[columnaActiva] * CARDS_POR_PAGINA;
    const leadsVisible = colLeads.slice(0, pageSize);
    const hayMas = colLeads.length > pageSize;
    const stageActual = PIPELINE_STAGES.find(s => s.id === columnaActiva);

    return (
      <div className="flex h-[78vh] gap-0 rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Sidebar: etapas */}
        <div className="w-48 flex-shrink-0 bg-slate-800 flex flex-col overflow-y-auto">
          {PIPELINE_STAGES.map(stage => {
            const stats = getColStats(stage.id);
            const activo = columnaActiva === stage.id;
            return (
              <button
                key={stage.id}
                onClick={() => setColumnaActiva(stage.id)}
                className={`flex items-center justify-between px-4 py-3.5 text-left transition-all border-l-4 ${
                  activo
                    ? 'bg-white/10 border-white text-white'
                    : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${stage.dot}`} />
                  <span className="text-xs font-bold truncate">{stage.label}</span>
                </div>
                <div className="flex flex-col items-end gap-0.5 ml-2">
                  <span className={`text-xs font-black px-1.5 py-0.5 rounded-full ${
                    activo ? 'bg-white text-slate-800' : 'bg-white/10 text-slate-400'
                  }`}>
                    {stats.count}
                  </span>
                  {stats.urgentes > 0 && (
                    <span className="text-[9px] text-rose-400 font-bold animate-pulse">
                      {stats.urgentes} 🔴
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Panel central: lista de leads */}
        <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden border-r border-slate-200">
          {/* Header de la etapa */}
          <div className={`px-4 py-3 border-b border-slate-200 flex items-center justify-between ${stageActual?.headerBg}`}>
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${stageActual?.dot}`} />
              <h3 className="font-black text-sm text-slate-800">{stageActual?.label}</h3>
              <span className="text-xs font-bold bg-white px-2 py-0.5 rounded-full shadow-sm border border-slate-200">
                {colLeads.length}
              </span>
            </div>
            {colLeads.some(l => calcularPrioridad(l) === 'urgente') && (
              <span className="text-xs text-rose-600 font-bold flex items-center gap-1 animate-pulse">
                <AlertTriangle className="w-3.5 h-3.5" />
                {colLeads.filter(l => calcularPrioridad(l) === 'urgente').length} urgente(s)
              </span>
            )}
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {colLeads.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-slate-400 text-sm italic border-2 border-dashed border-slate-200 rounded-xl">
                — Sin leads en esta etapa —
              </div>
            ) : (
              leadsVisible.map((lead: any) => {
                const prioridad = calcularPrioridad(lead);
                const monto = lead.monto_proyectado_cotizacion
                  ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(lead.monto_proyectado_cotizacion)
                  : null;
                return (
                  <div
                    key={lead.id}
                    className={`flex items-center gap-3 p-3 bg-white rounded-xl border transition-all hover:shadow-md ${
                      leadSeleccionado?.id === lead.id ? 'border-indigo-400 ring-2 ring-indigo-200' :
                      prioridad === 'urgente' ? 'border-rose-200 hover:border-rose-300' :
                      'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {/* Barra prioridad */}
                    <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${
                      prioridad === 'urgente' ? 'bg-rose-400' :
                      prioridad === 'frio' ? 'bg-slate-300' : 'bg-indigo-300'
                    }`} />
                    {/* Avatar inicial */}
                    <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-black text-slate-600 flex-shrink-0">
                      {(lead.nombre || '?')[0].toUpperCase()}
                    </div>
                    {/* Info — clickeable para abrir detalle */}
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setLeadSeleccionado(lead)}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-slate-800 truncate">{lead.nombre || 'Sin nombre'}</p>
                        <PrioridadBadge prioridad={prioridad} />
                      </div>
                      <p className="text-[10px] text-slate-500 truncate">{lead.producto_interes || '—'}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {lead.segmento && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${SEGMENTO_COLOR[lead.segmento] || 'bg-slate-100 text-slate-600'}`}>
                            {lead.segmento}
                          </span>
                        )}
                        {monto && (
                          <span className="text-[9px] font-bold text-emerald-700">💰 {monto}</span>
                        )}
                      </div>
                    </div>
                    {/* Acción rápida: Tomar lead (solo asesor en Bolsa Común) */}
                    {columnaActiva === 'NUEVO' && rol === 'asesor_comercial' ? (
                      <button
                        onClick={e => { e.stopPropagation(); handleTakeFromPool(lead.id); }}
                        className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 text-white text-[10px] font-black rounded-lg hover:bg-indigo-700 active:scale-95 transition-all shadow-sm"
                        title="Tomar este lead y asignármelo"
                      >
                        <Zap className="w-3 h-3" />
                        Tomar
                      </button>
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0 cursor-pointer" onClick={() => setLeadSeleccionado(lead)} />
                    )}
                  </div>
                );
              })
            )}

            {/* Cargar más */}
            {hayMas && (
              <button
                onClick={() => cargarMas(columnaActiva)}
                className="w-full py-2 text-xs font-bold text-slate-500 hover:text-slate-700 border border-dashed border-slate-300 rounded-xl hover:bg-slate-100 transition-all"
              >
                Ver {colLeads.length - pageSize} más →
              </button>
            )}
          </div>
        </div>

        {/* Panel derecho: detalle permanente */}
        {leadSeleccionado ? (
          <div className="w-[380px] flex-shrink-0 bg-white border-l border-slate-200 overflow-y-auto">
            <React.Suspense fallback={<div className="p-4 text-slate-400 text-sm">Cargando...</div>}>
              <LeadDetalleModal
                lead={leadSeleccionado}
                rol={rol}
                onClose={() => setLeadSeleccionado(null)}
                inlineMode
              />
            </React.Suspense>
          </div>
        ) : (
          <div className="w-[380px] flex-shrink-0 bg-slate-50 border-l border-slate-200 flex flex-col items-center justify-center text-center p-6">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <User className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-sm font-bold text-slate-400">Selecciona un lead</p>
            <p className="text-xs text-slate-300 mt-1">El detalle aparecerá aquí sin abrir ningún popup</p>
          </div>
        )}
      </div>
    );
  };

  // ─── Vista Kanban Colapsable (Propuesta 4) ────────────────────────────────────
  const renderKanban = () => (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex bg-slate-50 overflow-x-auto min-h-[75vh] p-4 gap-3 rounded-xl border border-slate-200 shadow-inner snap-x">
        {PIPELINE_STAGES.map((stage) => {
          const colLeadsRaw = filtrarLeads(leads, { stageId: stage.id });
          const colLeads = sortByPriority(colLeadsRaw);
          const isCollapsed = collapsed[stage.id];
          const pageSize = (pagina[stage.id] || 1) * CARDS_POR_PAGINA;
          const leadsVisible = colLeads.slice(0, pageSize);
          const hayMas = colLeads.length > pageSize;
          const urgentes = colLeads.filter(l => calcularPrioridad(l) === 'urgente').length;
          const montoCol = colLeads.reduce((s: number, l: any) => s + parseFloat(l.monto_proyectado_cotizacion || '0'), 0);
          const montoCOPFmt = montoCol > 0
            ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0, notation: 'compact' }).format(montoCol)
            : null;

          return (
            <div
              key={stage.id}
              className={`flex-shrink-0 flex flex-col rounded-xl border snap-start transition-all duration-300 ${stage.color} ${
                isCollapsed ? 'w-14' : 'w-72'
              }`}
            >
              {/* ── Header columna ── */}
              <div
                className={`flex items-center justify-between p-3 border-b border-slate-200/60 sticky top-0 backdrop-blur-md rounded-t-xl z-10 cursor-pointer ${stage.headerBg}`}
                onClick={() => toggleCollapse(stage.id)}
              >
                {isCollapsed ? (
                  /* Columna colapsada: solo dot + contador vertical */
                  <div className="flex flex-col items-center gap-2 w-full">
                    <span className={`w-2.5 h-2.5 rounded-full ${stage.dot}`} />
                    <span className="text-[10px] font-black text-slate-500 writing-vertical"
                      style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)' }}>
                      {stage.label}
                    </span>
                    <span className="bg-white text-slate-600 text-[10px] font-black px-1.5 py-0.5 rounded-full border border-slate-200">
                      {colLeads.length}
                    </span>
                    {urgentes > 0 && <span className="text-[8px] text-rose-500 font-black animate-pulse">{urgentes}🔴</span>}
                  </div>
                ) : (
                  /* Columna expandida: cabecera completa */
                  <>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${stage.dot}`} />
                      <h3 className="font-extrabold text-xs uppercase tracking-wider text-slate-700 truncate">{stage.label}</h3>
                      <span className="bg-white text-slate-600 text-xs font-black px-2 py-0.5 rounded-full border border-slate-200 shadow-sm flex-shrink-0">
                        {colLeads.length}
                      </span>
                      {urgentes > 0 && (
                        <span className="text-[9px] text-rose-500 font-black animate-pulse flex-shrink-0">
                          {urgentes}🔴
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {montoCOPFmt && (
                        <span className="text-[9px] text-emerald-700 font-bold hidden lg:block">{montoCOPFmt}</span>
                      )}
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </>
                )}
              </div>

              {/* ── Cards (solo si no está colapsado) ── */}
              {!isCollapsed && (
                <Droppable droppableId={stage.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 p-2 space-y-2 overflow-y-auto min-h-[120px] transition-colors ${
                        snapshot.isDraggingOver ? 'bg-indigo-50/50' : ''
                      }`}
                    >
                      {loading && colLeads.length === 0 ? (
                        Array.from({ length: 2 }).map((_, i) => (
                          <div key={i} className="h-20 bg-white/60 rounded-lg border border-slate-200 animate-pulse" />
                        ))
                      ) : colLeads.length === 0 ? (
                        <div className="h-16 border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center">
                          <span className="text-xs text-slate-400 font-medium">— Vacío —</span>
                        </div>
                      ) : (
                        <>
                          {/* Sección URGENTE */}
                          {colLeads.some(l => calcularPrioridad(l) === 'urgente') && (
                            <div className="text-[9px] font-black text-rose-500 uppercase tracking-wider px-1 pt-1 flex items-center gap-1">
                              <AlertTriangle className="w-2.5 h-2.5" /> Requiere atención
                            </div>
                          )}
                          {leadsVisible.map((lead: any, index: number) => {
                            const prioridad = calcularPrioridad(lead);
                            const esNuevaSec = index > 0 && calcularPrioridad(colLeads[index - 1]) !== prioridad;
                            return (
                              <React.Fragment key={lead.id}>
                                {esNuevaSec && prioridad === 'normal' && (
                                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider px-1 pt-1">Normal</div>
                                )}
                                {esNuevaSec && prioridad === 'frio' && (
                                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider px-1 pt-1">❄️ Sin actividad reciente</div>
                                )}
                                <Draggable draggableId={String(lead.id)} index={index}>
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      className={`transition-transform ${snapshot.isDragging ? 'rotate-1 scale-105 shadow-xl z-50' : ''} ${
                                        prioridad === 'frio' ? 'opacity-60' : ''
                                      }`}
                                    >
                                      <LeadCard
                                        lead={lead}
                                        stageId={stage.id}
                                        rol={rol}
                                        onTakeFromPool={() => handleTakeFromPool(lead.id)}
                                      />
                                    </div>
                                  )}
                                </Draggable>
                              </React.Fragment>
                            );
                          })}
                          {/* Cargar más */}
                          {hayMas && (
                            <button
                              onClick={() => cargarMas(stage.id)}
                              className="w-full py-1.5 text-[10px] font-bold text-slate-400 hover:text-slate-700 border border-dashed border-slate-200 rounded-lg hover:bg-slate-100 transition-all"
                            >
                              + {colLeads.length - pageSize} leads más →
                            </button>
                          )}
                        </>
                      )}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              )}
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );

  // ─── Render principal ─────────────────────────────────────────────────────────
  return (
    <>
      {/* Barra de herramientas */}
      <div className="flex flex-wrap items-center gap-3 px-4 pt-4 pb-3 border-b border-slate-200 bg-white">
        {/* Buscador */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, teléfono, producto..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-slate-50"
          />
          {busqueda && (
            <button onClick={() => setBusqueda('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filtro segmento */}
        <select
          value={filtroSegmento}
          onChange={e => setFiltroSegmento(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 text-slate-600"
        >
          <option value="">Todos los segmentos</option>
          {SEGMENTOS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* Filtro estado (solo en tabla) */}
        {viewMode === 'tabla' && (
          <select
            value={filtroEstado}
            onChange={e => setFiltroEstado(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 text-slate-600"
          >
            <option value="">Todos los estados</option>
            {PIPELINE_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        )}

        {/* Limpiar */}
        {(busqueda || filtroSegmento || filtroEstado) && (
          <button
            onClick={() => { setBusqueda(''); setFiltroSegmento(''); setFiltroEstado(''); }}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-rose-600 font-semibold transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Limpiar
          </button>
        )}

        {/* Contador */}
        <span className="text-xs text-slate-500">
          <span className="font-bold text-slate-700">{totalLeadsFiltrados}</span> lead(s)
        </span>

        {/* Toggle de vista */}
        <div className="ml-auto flex items-center gap-0.5 bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('kanban')}
            title="Vista Kanban (Pipeline vertical)"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              viewMode === 'kanban' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Columns className="w-3.5 h-3.5" /> Pipeline
          </button>
          <button
            onClick={() => setViewMode('tabla')}
            title="Vista Tabla"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              viewMode === 'tabla' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <LayoutList className="w-3.5 h-3.5" /> Tabla
          </button>
        </div>
      </div>

      {/* Contenido principal */}
      <div className="p-4">
        {viewMode === 'tabla' ? renderTabla() : renderPipelineVertical()}
      </div>

      {/* Modal motivo pérdida */}
      {perdidaPendiente && (
        <MotivoPerdidaModal
          leadId={perdidaPendiente.leadId}
          leadNombre={perdidaPendiente.leadNombre}
          onClose={() => setPerdidaPendiente(null)}
          onConfirm={(leadActualizado) => {
            dispatch(updateLead(leadActualizado));
            setPerdidaPendiente(null);
          }}
        />
      )}

      {/* Modal flotante (para vista tabla) */}
      {viewMode === 'tabla' && leadSeleccionado && (
        <React.Suspense fallback={null}>
          <LeadDetalleModal
            lead={leadSeleccionado}
            rol={rol}
            onClose={() => setLeadSeleccionado(null)}
          />
        </React.Suspense>
      )}
    </>
  );
};

export default KanbanBoard;
