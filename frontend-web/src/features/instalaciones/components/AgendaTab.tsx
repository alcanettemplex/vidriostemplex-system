import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import {
  Calendar, ChevronLeft, ChevronRight, Plus, X as XIcon, GripVertical,
  MapPin, Route, Inbox, Search, StickyNote, Check,
} from 'lucide-react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// ─── Helpers de fecha ─────────────────────────────────────────────────────────

// Fecha local 'YYYY-MM-DD' (NO toISOString, que devuelve UTC y de noche adelanta el día)
const fmt = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const hoyMedianoche = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const addDias = (d: Date, n: number): Date => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

const HOY_STR = fmt(new Date());

const formatRango = (inicio: Date): string => {
  const fin = addDias(inicio, 6);
  const f = (d: Date) => d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
  return `${f(inicio)} — ${f(fin)}`;
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  odpsListos: any[];                         // odps.listos del JefeView (cada una puede traer .agenda)
  readOnly?: boolean;
  onVerODP: (id: number) => void;            // abre ODPFichaModal
  onCrearRutaDia: (odps: any[], fecha: string) => void; // abre ProgramarRutaModal precargado
  onAgendaChange: () => void;                // refresca datos de gestión del padre (badges + bandeja)
}

// ─── Componente ─────────────────────────────────────────────────────────────────

const AgendaTab: React.FC<Props> = ({ odpsListos, readOnly = false, onVerODP, onCrearRutaDia, onAgendaChange }) => {
  const token = sessionStorage.getItem('token');
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  // La ventana siempre arranca en "hoy"; se avanza/retrocede de a 7 días (nunca antes de hoy).
  const [inicio, setInicio] = useState<Date>(() => hoyMedianoche());
  const [agenda, setAgenda] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [pickerDia, setPickerDia] = useState<string | null>(null); // fecha con el dropdown "+ ODP" abierto
  const [notaEdit, setNotaEdit] = useState<{ id: number; valor: string } | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  const desde = fmt(inicio);
  const hasta = fmt(addDias(inicio, 6));
  const esBloqueHoy = desde === HOY_STR;

  const cargarAgenda = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/rutas/agenda`, { headers, params: { desde, hasta } });
      setAgenda(Array.isArray(data?.agenda) ? data.agenda : []);
      if (data?.vencidas_reagendadas > 0) {
        toast.info(`${data.vencidas_reagendadas} ODP${data.vencidas_reagendadas > 1 ? 's' : ''} volvió a "Sin agendar" por vencimiento`);
        onAgendaChange(); // refresca la bandeja del padre con las reaparecidas
      }
    } catch { toast.error('Error al cargar la agenda'); }
    finally { setLoading(false); }
  }, [headers, desde, hasta, onAgendaChange]);

  useEffect(() => { cargarAgenda(); }, [cargarAgenda]);

  // Cerrar el dropdown "+ ODP" al hacer clic fuera
  useEffect(() => {
    if (!pickerDia) return;
    const close = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerDia(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [pickerDia]);

  // Refresca agenda local + datos del padre tras una mutación
  const refrescar = useCallback(async () => {
    await cargarAgenda();
    onAgendaChange();
  }, [cargarAgenda, onAgendaChange]);

  // ── Datos derivados ──
  const q = busqueda.toLowerCase().trim();

  const odpsSinAgendar = useMemo(
    () => odpsListos
      .filter((o: any) => !o.agenda)
      .filter((o: any) => !q || o.numero_odp?.toLowerCase().includes(q) || o.cliente?.nombre_razon_social?.toLowerCase().includes(q)),
    [odpsListos, q]
  );

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => fmt(addDias(inicio, i))), [inicio]);

  const entriesPorDia = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const f of dias) map[f] = [];
    for (const e of agenda) {
      if (q && !(e.odp?.numero_odp?.toLowerCase().includes(q) || e.odp?.cliente?.nombre_razon_social?.toLowerCase().includes(q))) continue;
      if (map[e.fecha_tentativa]) map[e.fecha_tentativa].push(e);
    }
    for (const f of dias) map[f].sort((a, b) => a.orden - b.orden);
    return map;
  }, [agenda, dias, q]);

  // ── Mutaciones ──
  const colocar = async (odpId: number, fecha: string) => {
    try {
      await axios.post(`${API}/api/rutas/agenda`, { odp_id: odpId, fecha_tentativa: fecha }, { headers });
      await refrescar();
    } catch (e: any) { toast.error(e.response?.data?.error || 'No se pudo agendar la ODP'); }
  };

  const mover = async (entryId: number, fecha: string) => {
    try {
      await axios.put(`${API}/api/rutas/agenda/${entryId}`, { fecha_tentativa: fecha }, { headers });
      await refrescar();
    } catch (e: any) { toast.error(e.response?.data?.error || 'No se pudo mover'); }
  };

  const quitar = async (entryId: number) => {
    try {
      await axios.delete(`${API}/api/rutas/agenda/${entryId}`, { headers });
      await refrescar();
    } catch (e: any) { toast.error(e.response?.data?.error || 'No se pudo quitar'); }
  };

  const persistirOrden = async (items: { id: number; orden: number }[]) => {
    try {
      await axios.post(`${API}/api/rutas/agenda/reordenar`, { items }, { headers });
    } catch { toast.error('No se pudo guardar el orden'); cargarAgenda(); }
  };

  const guardarNota = async () => {
    if (!notaEdit) return;
    try {
      await axios.put(`${API}/api/rutas/agenda/${notaEdit.id}`, { nota: notaEdit.valor.trim() || null }, { headers });
      setNotaEdit(null);
      await cargarAgenda();
    } catch (e: any) { toast.error(e.response?.data?.error || 'No se pudo guardar la nota'); }
  };

  // ── Drag & Drop ──
  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination || readOnly) return;

    const src = source.droppableId;
    const dst = destination.droppableId;
    if (src === dst && source.index === destination.index) return;

    // bandeja → día : agendar
    if (src === 'bandeja' && dst.startsWith('dia:')) {
      const odpId = Number(draggableId.replace('odp:', ''));
      await colocar(odpId, dst.replace('dia:', ''));
      return;
    }

    // día → bandeja : desagendar
    if (src.startsWith('dia:') && dst === 'bandeja') {
      const entryId = Number(draggableId.replace('entry:', ''));
      await quitar(entryId);
      return;
    }

    // día → día (distinto) : mover de fecha
    if (src.startsWith('dia:') && dst.startsWith('dia:') && src !== dst) {
      const entryId = Number(draggableId.replace('entry:', ''));
      await mover(entryId, dst.replace('dia:', ''));
      return;
    }

    // mismo día : reordenar (optimista + persistir)
    if (src === dst && src.startsWith('dia:')) {
      const fecha = src.replace('dia:', '');
      const lista = [...(entriesPorDia[fecha] || [])];
      const [movido] = lista.splice(source.index, 1);
      lista.splice(destination.index, 0, movido);
      const reordenadas = lista.map((e, i) => ({ ...e, orden: i + 1 }));
      setAgenda(prev => prev.map(e => {
        const m = reordenadas.find(r => r.id === e.id);
        return m ? { ...e, orden: m.orden } : e;
      }));
      await persistirOrden(reordenadas.map(e => ({ id: e.id, orden: e.orden })));
    }
  };

  // ── Fila de ODP agendada (lista vertical dentro del día) ──
  const FilaAgenda = (e: any, index: number) => {
    const odp = e.odp;
    const editandoNota = notaEdit?.id === e.id;
    return (
      <Draggable draggableId={`entry:${e.id}`} index={index} isDragDisabled={readOnly}>
        {(prov, snap) => (
          <div
            ref={prov.innerRef}
            {...prov.draggableProps}
            className={`group rounded-lg border bg-white transition-shadow ${
              snap.isDragging ? 'shadow-lg ring-2 ring-indigo-200' : 'border-slate-200 shadow-sm'
            }`}
          >
            <div className="flex items-center gap-2 px-2 py-1.5">
              {!readOnly && (
                <span {...prov.dragHandleProps} className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing flex-shrink-0">
                  <GripVertical className="w-3.5 h-3.5" />
                </span>
              )}
              <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[10px] flex items-center justify-center font-bold flex-shrink-0">
                {e.orden}
              </span>
              <button
                onClick={() => odp?.id && onVerODP(odp.id)}
                className="text-xs font-bold text-slate-800 hover:text-indigo-600 hover:underline underline-offset-2 flex-shrink-0"
              >
                {odp?.numero_odp}
              </button>
              <span className="text-xs text-slate-600 truncate">{odp?.cliente?.nombre_razon_social}</span>
              {odp?.direccion_instalacion && (
                <span className="text-[11px] text-slate-400 truncate hidden md:flex items-center gap-0.5 flex-shrink min-w-0">
                  <MapPin className="w-2.5 h-2.5 flex-shrink-0" /> {odp.direccion_instalacion}
                </span>
              )}
              {!readOnly && (
                <div className="ml-auto flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setNotaEdit({ id: e.id, valor: e.nota || '' })} className="p-1 rounded hover:bg-amber-50 text-amber-400 hover:text-amber-600" title="Nota">
                    <StickyNote className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => quitar(e.id)} className="p-1 rounded hover:bg-rose-50 text-rose-400 hover:text-rose-600" title="Quitar de la agenda">
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
            {editandoNota ? (
              <div className="px-2 pb-1.5 flex items-center gap-1">
                <input
                  autoFocus
                  value={notaEdit!.valor}
                  onChange={ev => setNotaEdit({ id: e.id, valor: ev.target.value })}
                  onKeyDown={ev => { if (ev.key === 'Enter') guardarNota(); if (ev.key === 'Escape') setNotaEdit(null); }}
                  placeholder="Nota corta..."
                  maxLength={300}
                  className="flex-1 border border-amber-200 rounded px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-300"
                />
                <button onClick={guardarNota} className="p-1 rounded bg-amber-100 text-amber-600 hover:bg-amber-200">
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : e.nota ? (
              <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-0.5 mx-2 mb-1.5 truncate flex items-center gap-1">
                <StickyNote className="w-2.5 h-2.5 flex-shrink-0" /> {e.nota}
              </p>
            ) : null}
          </div>
        )}
      </Draggable>
    );
  };

  // Navegación
  const irHoy = () => setInicio(hoyMedianoche());
  const irAtras = () => { if (!esBloqueHoy) setInicio(prev => { const n = addDias(prev, -7); const h = hoyMedianoche(); return n < h ? h : n; }); };
  const irAdelante = () => setInicio(prev => addDias(prev, 7));

  return (
    <div className="p-4 space-y-4">
      {/* Barra superior: navegación + buscador */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={irAtras} disabled={esBloqueHoy} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed" title="7 días anteriores">
            <ChevronLeft className="w-4 h-4 text-slate-500" />
          </button>
          <button onClick={irHoy} disabled={esBloqueHoy} className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600 disabled:opacity-40" title="Volver a hoy">
            Hoy
          </button>
          <button onClick={irAdelante} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50" title="7 días siguientes">
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <span className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
          <Calendar className="w-4 h-4 text-indigo-500" /> {formatRango(inicio)}
        </span>
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar ODP o cliente..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder-slate-400"
          />
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 items-start">
          {/* Bandeja: ODPs listas sin agendar */}
          <div className="w-60 flex-shrink-0 sticky top-2">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col max-h-[78vh]">
              <div className="px-3 py-2.5 border-b border-slate-100 flex items-center gap-2">
                <Inbox className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Sin agendar</span>
                <span className="ml-auto px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs font-bold">{odpsSinAgendar.length}</span>
              </div>
              <Droppable droppableId="bandeja" isDropDisabled={readOnly}>
                {(prov, snap) => (
                  <div
                    ref={prov.innerRef}
                    {...prov.droppableProps}
                    className={`flex-1 overflow-y-auto p-2 space-y-1.5 min-h-[120px] transition-colors ${snap.isDraggingOver ? 'bg-indigo-50/40' : ''}`}
                  >
                    {odpsSinAgendar.length === 0 ? (
                      <p className="text-[11px] text-slate-400 text-center py-8">{q ? 'Sin resultados' : 'Todo lo listo ya está agendado 🎉'}</p>
                    ) : (
                      odpsSinAgendar.map((o: any, i: number) => (
                        <Draggable key={o.id} draggableId={`odp:${o.id}`} index={i} isDragDisabled={readOnly}>
                          {(p, s) => (
                            <div
                              ref={p.innerRef}
                              {...p.draggableProps}
                              {...p.dragHandleProps}
                              className={`rounded-lg border px-2 py-1.5 bg-white cursor-grab active:cursor-grabbing transition-shadow ${
                                s.isDragging ? 'shadow-lg ring-2 ring-indigo-200' : 'border-slate-200 shadow-sm hover:border-indigo-200'
                              }`}
                            >
                              <button onClick={() => onVerODP(o.id)} className="text-xs font-bold text-slate-800 hover:text-indigo-600 hover:underline underline-offset-2">
                                {o.numero_odp}
                              </button>
                              <p className="text-[10px] text-slate-500 truncate">{o.cliente?.nombre_razon_social}</p>
                            </div>
                          )}
                        </Draggable>
                      ))
                    )}
                    {prov.placeholder}
                  </div>
                )}
              </Droppable>
              {!readOnly && (
                <p className="px-3 py-2 text-[10px] text-slate-400 border-t border-slate-100">Arrastra una ODP a un día, o usa “+ ODP” en cada día.</p>
              )}
            </div>
          </div>

          {/* Calendario: días apilados en vertical */}
          <div className="flex-1 min-w-0 space-y-2">
            {dias.map((fecha) => {
              const items = entriesPorDia[fecha] || [];
              const esHoy = fecha === HOY_STR;
              const fechaObj = new Date(`${fecha}T00:00:00`);
              const candidatasRuta = items.map((e: any) => e.odp).filter(Boolean);
              const nombreDia = fechaObj.toLocaleDateString('es-CO', { weekday: 'long' });
              const fechaCorta = fechaObj.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
              return (
                <div key={fecha} className={`rounded-xl border ${esHoy ? 'border-indigo-300 bg-indigo-50/20' : 'border-slate-200 bg-white'}`}>
                  {/* Header del día */}
                  <div className={`flex items-center gap-2 px-3 py-2 border-b ${esHoy ? 'border-indigo-200' : 'border-slate-100'}`}>
                    {esHoy && <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-indigo-600 text-white uppercase tracking-wide">Hoy</span>}
                    <span className={`text-sm font-bold capitalize ${esHoy ? 'text-indigo-700' : 'text-slate-700'}`}>{nombreDia}</span>
                    <span className="text-xs text-slate-400">{fechaCorta}</span>
                    {items.length > 0 && (
                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[10px] font-bold">{items.length} ODP{items.length !== 1 ? 's' : ''}</span>
                    )}
                    {!readOnly && (
                      <div className="ml-auto flex items-center gap-2">
                        {/* + ODP */}
                        <div className="relative" ref={pickerDia === fecha ? pickerRef : null}>
                          <button
                            onClick={() => setPickerDia(pickerDia === fecha ? null : fecha)}
                            disabled={!odpsSinAgendar.length}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-dashed border-slate-300 text-[11px] font-semibold text-slate-500 hover:bg-slate-50 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-40 transition-all"
                          >
                            <Plus className="w-3 h-3" /> ODP
                          </button>
                          {pickerDia === fecha && odpsSinAgendar.length > 0 && (
                            <div className="absolute top-full mt-1 right-0 z-30 w-60 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto py-1">
                              {odpsSinAgendar.map((o: any) => (
                                <button
                                  key={o.id}
                                  onClick={() => { setPickerDia(null); colocar(o.id, fecha); }}
                                  className="w-full text-left px-2.5 py-1.5 hover:bg-indigo-50 transition-colors"
                                >
                                  <span className="text-xs font-bold text-slate-800">{o.numero_odp}</span>
                                  <span className="block text-[10px] text-slate-500 truncate">{o.cliente?.nombre_razon_social}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {/* Crear ruta del día */}
                        {items.length > 0 && (
                          <button
                            onClick={() => onCrearRutaDia(candidatasRuta, fecha)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-bold hover:bg-indigo-700 transition-all"
                          >
                            <Route className="w-3 h-3" /> Crear ruta
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Lista droppable del día */}
                  <Droppable droppableId={`dia:${fecha}`} isDropDisabled={readOnly}>
                    {(prov, snap) => (
                      <div
                        ref={prov.innerRef}
                        {...prov.droppableProps}
                        className={`p-2 space-y-1.5 min-h-[56px] transition-colors ${snap.isDraggingOver ? 'bg-indigo-50/60' : ''}`}
                      >
                        {items.length === 0 && !snap.isDraggingOver && (
                          <p className="text-[11px] text-slate-300 text-center py-3">Sin ODPs — arrastra aquí o usa “+ ODP”</p>
                        )}
                        {items.map((e: any, idx: number) => FilaAgenda(e, idx))}
                        {prov.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </div>
      </DragDropContext>

      {loading && (
        <div className="flex justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
        </div>
      )}
    </div>
  );
};

export default AgendaTab;
