import React, { useEffect, useState, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import { fetchLeadsStart, fetchLeadsSuccess, fetchLeadsFailure, updateLead } from '../crmSlice';
import { apiGetLeads, apiUpdateLeadStatus, apiAssignLeadToMe } from '../crmService';
import LeadCard from './LeadCard';
import MotivoPerdidaModal from './MotivoPerdidaModal';

const PIPELINE_STAGES = [
  { id: 'NUEVO',          label: 'Bolsa Común',  color: 'bg-slate-100 border-slate-200',   dot: 'bg-slate-400' },
  { id: 'ASIGNADO',       label: 'Asignados',    color: 'bg-blue-50 border-blue-200',       dot: 'bg-blue-500' },
  { id: 'EN_CONTACTO',    label: 'En Contacto',  color: 'bg-purple-50 border-purple-200',   dot: 'bg-purple-500' },
  { id: 'COTIZANDO',      label: 'Cotizando',    color: 'bg-amber-50 border-amber-200',     dot: 'bg-amber-500' },
  { id: 'VISITA_TECNICA', label: 'V. Técnica',   color: 'bg-indigo-50 border-indigo-200',   dot: 'bg-indigo-500' },
  { id: 'FRIO',           label: 'Enfriados',    color: 'bg-gray-100 border-gray-300',      dot: 'bg-gray-400' },
  { id: 'APROBADO',       label: 'Aprobados ✓',  color: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  { id: 'PERDIDO',        label: 'Perdidos',     color: 'bg-rose-50 border-rose-200',       dot: 'bg-rose-400' },
];

// Columnas donde no se puede mover mediante DnD (solo se llega automáticamente)
const COLUMNAS_BLOQUEADAS_DESTINO: string[] = [];
// Estados que requieren motivo al ser destino
const REQUIERE_MOTIVO: string[] = ['PERDIDO'];

interface PerdidaPendiente {
  leadId: number;
  leadNombre: string;
  sourceStageId: string; // para revertir si cancela
}

const KanbanBoard: React.FC = () => {
  const dispatch = useDispatch();
  const { leads, loading } = useSelector((state: any) => state.crm);
  const user = useSelector((state: any) => state.auth.user);
  const rol: string = user?.rol || '';

  const [perdidaPendiente, setPerdidaPendiente] = useState<PerdidaPendiente | null>(null);

  // ─── Carga de datos real desde la API ───────────────────────────────────────
  const fetchLeads = useCallback(async () => {
    dispatch(fetchLeadsStart());
    try {
      const { data } = await apiGetLeads();
      dispatch(fetchLeadsSuccess(data));
    } catch (err: any) {
      if (err?.response?.status === 401) {
        dispatch(fetchLeadsFailure('Sesión expirada'));
      } else {
        // Si la API falla (ej.: en dev sin datos), usar leads del store vacíos sin crash
        dispatch(fetchLeadsFailure('No se pudieron cargar los leads'));
        toast.warning('No se pudieron cargar los leads. Verifica la conexión.');
      }
    }
  }, [dispatch]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // ─── Drag & Drop Handler ─────────────────────────────────────────────────────
  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;

    // Sin destino válido (soltó fuera)
    if (!destination) return;
    // Mismo lugar
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const leadId = parseInt(draggableId, 10);
    const nuevoEstado = destination.droppableId;
    const estadoAnterior = source.droppableId;

    // Si el destino requiere modal (PERDIDO)
    if (REQUIERE_MOTIVO.includes(nuevoEstado)) {
      const lead = leads.find((l: any) => l.id === leadId);
      setPerdidaPendiente({
        leadId,
        leadNombre: lead?.nombre || `Lead #${leadId}`,
        sourceStageId: estadoAnterior,
      });
      return; // Se maneja en el modal
    }

    // Optimistic update: mover la tarjeta visualmente de inmediato
    const leadActual = leads.find((l: any) => l.id === leadId);
    if (leadActual) {
      dispatch(updateLead({ ...leadActual, estado_crm: nuevoEstado }));
    }

    // Llamada real a la API
    try {
      const { data } = await apiUpdateLeadStatus(leadId, nuevoEstado);
      dispatch(updateLead(data));

      // Si pasó a FRIO automáticamente por la regla anti-fantasma
      if (data.estado_crm === 'FRIO' && nuevoEstado !== 'FRIO') {
        toast.warning(`⚠️ Lead "${leadActual?.nombre}" pasó automáticamente a ENFRIADO por política 3-Touch.`);
      } else {
        toast.success(`Lead movido a "${PIPELINE_STAGES.find(s => s.id === nuevoEstado)?.label}"`);
      }
    } catch (err: any) {
      // Revertir el optimistic update
      if (leadActual) {
        dispatch(updateLead({ ...leadActual, estado_crm: estadoAnterior }));
      }
      toast.error(err?.response?.data?.error || 'Error al mover el lead.');
    }
  };

  // ─── Asignar lead a mí mismo ─────────────────────────────────────────────────
  const handleTakeFromPool = async (leadId: number) => {
    try {
      const { data } = await apiAssignLeadToMe(leadId);
      dispatch(updateLead(data));
      toast.success('¡Lead asignado a ti! Aparece en "Asignados".');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'No se pudo asignar el lead.');
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex bg-slate-50 overflow-x-auto min-h-[75vh] p-4 gap-4 rounded-xl border border-slate-200 shadow-inner snap-x">
          {PIPELINE_STAGES.map((stage) => {
            const colLeads = leads.filter((l: any) => l.estado_crm === stage.id);

            return (
              <Droppable droppableId={stage.id} key={stage.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-shrink-0 w-72 flex flex-col rounded-xl border snap-start transition-all duration-200 ${stage.color} ${snapshot.isDraggingOver ? 'ring-2 ring-indigo-400 ring-offset-1 scale-[1.01]' : ''}`}
                  >
                    {/* Header columna */}
                    <div className="p-3 border-b border-slate-200/60 flex items-center justify-between sticky top-0 bg-white/70 backdrop-blur-md rounded-t-xl z-10">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${stage.dot}`} />
                        <h3 className="font-extrabold text-xs uppercase tracking-wider text-slate-700">{stage.label}</h3>
                        <span className="bg-white text-slate-600 text-xs font-black px-2 py-0.5 rounded-full border border-slate-200 shadow-sm">
                          {colLeads.length}
                        </span>
                      </div>
                    </div>

                    {/* Cards */}
                    <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[120px]">
                      {loading && colLeads.length === 0 ? (
                        Array.from({ length: 2 }).map((_, i) => (
                          <div key={i} className="h-24 bg-white/60 rounded-lg border border-slate-200 animate-pulse" />
                        ))
                      ) : colLeads.length === 0 ? (
                        <div className="h-20 border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center">
                          <span className="text-xs text-slate-400 font-medium">— Vacío —</span>
                        </div>
                      ) : (
                        colLeads.map((lead: any, index: number) => (
                          <Draggable
                            key={lead.id}
                            draggableId={String(lead.id)}
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`transition-transform ${snapshot.isDragging ? 'rotate-1 scale-105 shadow-xl z-50' : ''}`}
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
                        ))
                      )}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>

      {/* Modal de motivo de pérdida */}
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
    </>
  );
};

export default KanbanBoard;
