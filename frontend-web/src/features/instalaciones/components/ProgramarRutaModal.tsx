import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { X, Plus, Trash2, ArrowUp, ArrowDown, Truck, Users, Calendar } from 'lucide-react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface ODPItem { id: number; numero_odp: string; cliente: { nombre_razon_social: string }; direccion_instalacion?: string; }
interface Vehiculo { id: number; placa: string; tipo: string; }
interface Personal { id: number; nombre_completo: string; rol: string; }
interface RutaODPEntry { odp: ODPItem; orden: number; fecha_programada: string; }

interface Props {
  odpsDisponibles: ODPItem[];
  rutaExistente?: any; // para edición
  instaladorPreseleccionado?: number; // preselecciona un instalador al crear
  odpsPreseleccionadas?: ODPItem[]; // ODPs precargadas (desde un día de la agenda)
  fechaPreseleccion?: string; // fecha tentativa del día de la agenda
  onClose: () => void;
  onSaved: () => void;
}

const ProgramarRutaModal: React.FC<Props> = ({ odpsDisponibles, rutaExistente, instaladorPreseleccionado, odpsPreseleccionadas, fechaPreseleccion, onClose, onSaved }) => {
  const token = sessionStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [vehiculoId, setVehiculoId] = useState<number | ''>(rutaExistente?.vehiculo?.id || '');
  const [conductorId, setConductorId] = useState<number | ''>(rutaExistente?.conductor?.id || '');
  const [oficialId, setOficialId] = useState<number | ''>(rutaExistente?.oficial?.id || '');
  const [instaladoresSeleccionados, setInstaladoresSeleccionados] = useState<number[]>(
    rutaExistente?.instaladores?.map((i: any) => i.id) ??
    (instaladorPreseleccionado ? [instaladorPreseleccionado] : [])
  );
  const [observaciones, setObservaciones] = useState(rutaExistente?.observaciones || '');
  // Solo ODPs pendientes son editables; en_curso/pausada/con_dano no se tocan en el PUT
  const rutaOdpsEditables = rutaExistente?.ruta_odps?.filter((ro: any) => !ro.estado || ro.estado === 'pendiente') ?? [];
  const rutaOdpsNoEditables = rutaExistente?.ruta_odps?.filter((ro: any) => ro.estado && ro.estado !== 'pendiente') ?? [];
  const [entries, setEntries] = useState<RutaODPEntry[]>(
    rutaExistente
      ? rutaOdpsEditables.map((ro: any) => ({
          odp: ro.odp,
          orden: ro.orden,
          fecha_programada: ro.fecha_programada,
        }))
      // Creación desde la agenda: precarga las ODPs del día (con su fecha tentativa)
      : (odpsPreseleccionadas ?? []).map((odp, i) => ({
          odp,
          orden: i + 1,
          fecha_programada: fechaPreseleccion || new Date().toISOString().split('T')[0],
        }))
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/api/rutas/vehiculos`, { headers }),
      axios.get(`${API}/api/rutas/personal`, { headers }),
    ]).then(([v, p]) => { setVehiculos(v.data); setPersonal(p.data); })
      .catch(() => toast.error('Error al cargar datos'));
  }, []);

  const conductores = personal.filter(p => p.rol === 'conductor');
  const instaladores = personal.filter(p => p.rol === 'instalador');

  const agregarODP = (odp: ODPItem) => {
    if (entries.find(e => e.odp.id === odp.id)) return;
    const hoy = new Date().toISOString().split('T')[0];
    setEntries(prev => [...prev, { odp, orden: prev.length + 1, fecha_programada: hoy }]);
  };

  const quitarODP = (odpId: number) => {
    setEntries(prev => {
      const filtrado = prev.filter(e => e.odp.id !== odpId);
      return filtrado.map((e, i) => ({ ...e, orden: i + 1 }));
    });
  };

  const moverODP = (idx: number, dir: -1 | 1) => {
    setEntries(prev => {
      const arr = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return arr;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return arr.map((e, i) => ({ ...e, orden: i + 1 }));
    });
  };

  const toggleInstalador = (id: number) => {
    setInstaladoresSeleccionados(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    if (!entries.length && !rutaOdpsNoEditables.length) return toast.error('Agrega al menos una ODP');
    if (entries.some(e => !e.fecha_programada)) return toast.error('Todas las ODPs deben tener fecha');
    setSaving(true);
    try {
      const payload = {
        vehiculo_id: vehiculoId || null,
        conductor_id: conductorId || null,
        oficial_id: oficialId || null,
        instaladores: instaladoresSeleccionados,
        observaciones,
        odps: entries.map(e => ({ odp_id: e.odp.id, orden: e.orden, fecha_programada: e.fecha_programada })),
      };
      if (rutaExistente) {
        await axios.put(`${API}/api/rutas/${rutaExistente.id}`, payload, { headers });
        toast.success('Ruta actualizada');
      } else {
        await axios.post(`${API}/api/rutas`, payload, { headers });
        toast.success('Ruta creada');
      }
      onSaved();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al guardar ruta');
    } finally {
      setSaving(false);
    }
  };

  const odpsNoAgregadas = odpsDisponibles.filter(o => !entries.find(e => e.odp.id === o.id));

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{rutaExistente ? 'Editar Ruta' : 'Programar Ruta de Instalación'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Asigna vehículo, personal y ODPs en orden</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Vehículo, conductor y oficial */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5" /> Vehículo
              </label>
              <select value={vehiculoId} onChange={e => setVehiculoId(Number(e.target.value) || '')}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                <option value="">Sin vehículo asignado</option>
                {vehiculos.map(v => <option key={v.id} value={v.id}>{v.tipo.toUpperCase()} — {v.placa}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Conductor</label>
              <select value={conductorId} onChange={e => setConductorId(Number(e.target.value) || '')}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                <option value="">Sin conductor asignado</option>
                {conductores.map(c => <option key={c.id} value={c.id}>{c.nombre_completo}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide" title="Quien puede marcar la ruta como completada">
                Oficial de ruta
              </label>
              <select value={oficialId} onChange={e => setOficialId(Number(e.target.value) || '')}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                <option value="">Sin oficial (usa conductor)</option>
                {personal.map(p => <option key={p.id} value={p.id}>{p.nombre_completo}</option>)}
              </select>
            </div>
          </div>

          {/* Instaladores */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Instaladores asignados
            </label>
            <div className="flex flex-wrap gap-2">
              {instaladores.map(ins => {
                const sel = instaladoresSeleccionados.includes(ins.id);
                return (
                  <button key={ins.id} onClick={() => toggleInstalador(ins.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${sel ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                    {ins.nombre_completo}
                  </button>
                );
              })}
              {instaladores.length === 0 && <p className="text-xs text-slate-400">No hay instaladores registrados</p>}
            </div>
          </div>

          {/* Aviso ODPs no editables (en_curso, pausada, con_dano, completada) */}
          {rutaOdpsNoEditables.length > 0 && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              <span className="font-bold mt-0.5">⚠</span>
              <span>
                {rutaOdpsNoEditables.length} ODP{rutaOdpsNoEditables.length > 1 ? 's' : ''} en curso / pausada{rutaOdpsNoEditables.length > 1 ? 's' : ''} no aparece{rutaOdpsNoEditables.length > 1 ? 'n' : ''} aquí — solo las pendientes son editables.
              </span>
            </div>
          )}

          {/* ODPs disponibles para agregar */}
          {odpsNoAgregadas.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> ODPs disponibles (clic para agregar)
              </label>
              <div className="max-h-36 overflow-y-auto space-y-1 rounded-lg border border-slate-200 p-2">
                {odpsNoAgregadas.map(odp => (
                  <button key={odp.id} onClick={() => agregarODP(odp)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition-all flex justify-between items-center group">
                    <div>
                      <span className="text-sm font-semibold text-slate-800">{odp.numero_odp}</span>
                      <span className="text-xs text-slate-500 ml-2">{odp.cliente?.nombre_razon_social}</span>
                    </div>
                    <Plus className="w-4 h-4 text-indigo-400 opacity-0 group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ODPs en la ruta (con orden) */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Orden de instalación ({entries.length} ODP{entries.length !== 1 ? 's' : ''})
            </label>
            {entries.length === 0 ? (
              <div className="border-2 border-dashed border-slate-200 rounded-lg py-8 text-center text-sm text-slate-400">
                Agrega ODPs desde la lista de arriba
              </div>
            ) : (
              <div className="space-y-2">
                {entries.map((entry, idx) => (
                  <div key={entry.odp.id} className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">
                      {entry.orden}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{entry.odp.numero_odp}</p>
                      <p className="text-xs text-slate-500 truncate">{entry.odp.cliente?.nombre_razon_social}</p>
                    </div>
                    <input type="date" value={entry.fecha_programada}
                      onChange={e => setEntries(prev => prev.map((en, i) => i === idx ? { ...en, fecha_programada: e.target.value } : en))}
                      className="border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => moverODP(idx, -1)} disabled={idx === 0} className="p-0.5 rounded hover:bg-slate-200 disabled:opacity-30">
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button onClick={() => moverODP(idx, 1)} disabled={idx === entries.length - 1} className="p-0.5 rounded hover:bg-slate-200 disabled:opacity-30">
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                    <button onClick={() => quitarODP(entry.odp.id)} className="p-1 rounded hover:bg-red-100 text-red-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Observaciones */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Observaciones</label>
            <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={2}
              placeholder="Indicaciones para el equipo..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 text-sm">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving || !entries.length}
            className="flex-[2] px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 text-sm shadow-lg shadow-indigo-200">
            {saving ? 'Guardando...' : rutaExistente ? 'Guardar cambios' : 'Crear Ruta'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProgramarRutaModal;
