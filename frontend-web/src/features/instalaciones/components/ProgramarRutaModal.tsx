import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { X, Plus, Trash2, ArrowUp, ArrowDown, Truck, Users, Calendar, AlertTriangle, Link2 } from '../../../components/ui/icons';

import API from '../../../services/config';
import { hoyBogotaISO } from '../../../utils/fechas';
import { fmtDiaCorto } from '../utils/estadoInstalacion';

interface ODPItem { id: number; numero_odp: string; cliente: { nombre_razon_social: string }; direccion_instalacion?: string; }
interface Vehiculo { id: number; placa: string; tipo: string; }
interface Personal { id: number; nombre_completo: string; rol: string; }
interface RutaODPEntry { odp: ODPItem; orden: number; fecha_programada: string; }

// Choque de equipo: otra ruta activa con parada el mismo día que comparte personas o vehículo.
interface Choque { ruta: any; fechas: string[]; motivos: string[] }

const PARADA_ACTIVA = (ro: any) => ro.estado === 'pendiente' || ro.estado === 'en_curso';

interface Props {
  odpsDisponibles: ODPItem[];
  rutaExistente?: any; // para edición
  instaladorPreseleccionado?: number; // preselecciona un instalador al crear
  odpsPreseleccionadas?: ODPItem[]; // ODPs precargadas (día de la agenda, una ODP puntual)
  fechaPreseleccion?: string; // fecha para las precargadas; vacía = hoy
  onClose: () => void;
  onSaved: () => void;
}

const ProgramarRutaModal: React.FC<Props> = ({ odpsDisponibles, rutaExistente, instaladorPreseleccionado, odpsPreseleccionadas, fechaPreseleccion, onClose, onSaved }) => {

  // Ruta que se está editando. Empieza en `rutaExistente` y cambia si, al crear, el jefe
  // elige "Agregar a la ruta #X" desde el aviso de choque: el modal pasa a editar esa ruta.
  const [rutaBase, setRutaBase] = useState<any>(rutaExistente ?? null);
  const [rutasActivas, setRutasActivas] = useState<any[]>([]);

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
  const rutaOdpsNoEditables = rutaBase?.ruta_odps?.filter((ro: any) => ro.estado && ro.estado !== 'pendiente') ?? [];
  const [entries, setEntries] = useState<RutaODPEntry[]>(
    rutaExistente
      ? rutaOdpsEditables.map((ro: any) => ({
          odp: ro.odp,
          orden: ro.orden,
          fecha_programada: ro.fecha_programada,
        }))
      // Creación precargada (día de la agenda, "+ Agregar a ruta", Zona de Despacho de Producción)
      : (odpsPreseleccionadas ?? []).map((odp, i) => ({
          odp,
          orden: i + 1,
          fecha_programada: fechaPreseleccion || hoyBogotaISO(),
        }))
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/api/rutas/vehiculos`),
      axios.get(`${API}/api/rutas/personal`),
    ]).then(([v, p]) => { setVehiculos(v.data); setPersonal(p.data); })
      .catch(() => toast.error('No se pudieron cargar los vehículos y el personal. Cierra el modal y vuelve a abrirlo.'));
    // Rutas activas para el aviso de choque. Se piden aquí (y no por props) para que los
    // cuatro lugares que abren este modal tengan el aviso. Si falla, el modal sigue sin él.
    axios.get(`${API}/api/rutas`).then((r) => setRutasActivas(r.data)).catch(() => {});
  }, []);

  // Choques: otra ruta activa con parada viva en alguno de los días de esta ruta que
  // comparte oficial, instalador, conductor o vehículo. Solo avisa, nunca bloquea.
  const choques = useMemo<Choque[]>(() => {
    const fechas = new Set(entries.map((e) => e.fecha_programada).filter(Boolean));
    if (!fechas.size) return [];
    const personas = new Set<number>([
      ...(oficialId ? [oficialId] : []),
      ...instaladoresSeleccionados,
    ]);
    const lista: Choque[] = [];
    for (const r of rutasActivas) {
      if (r.id === rutaBase?.id) continue;
      const fechasR = Array.from(new Set<string>(
        (r.ruta_odps ?? []).filter(PARADA_ACTIVA).map((ro: any) => String(ro.fecha_programada).slice(0, 10))
      )).filter((f) => fechas.has(f));
      if (!fechasR.length) continue;
      const motivos: string[] = [];
      const equipoR: any[] = [...(r.oficial ? [r.oficial] : []), ...(r.instaladores ?? [])];
      const compartidos = equipoR.filter((p, i) => personas.has(p.id) && equipoR.findIndex((q) => q.id === p.id) === i);
      if (compartidos.length) motivos.push(compartidos.map((p) => p.nombre_completo).join(', '));
      if (conductorId && r.conductor?.id === conductorId) motivos.push(`conductor ${r.conductor.nombre_completo}`);
      if (vehiculoId && r.vehiculo?.id === vehiculoId) motivos.push(`vehículo ${r.vehiculo.placa}`);
      if (motivos.length) lista.push({ ruta: r, fechas: fechasR, motivos });
    }
    return lista;
  }, [entries, oficialId, instaladoresSeleccionados, conductorId, vehiculoId, rutasActivas, rutaBase]);

  // "Agregar a la ruta #X": el modal pasa a editar esa ruta con sus paradas pendientes
  // más las ODPs que se estaban programando. Se completa el personal que le falte.
  const agregarARutaExistente = (destino: any) => {
    const propias = (destino.ruta_odps ?? []).filter((ro: any) => ro.estado === 'pendiente')
      .sort((a: any, b: any) => a.orden - b.orden)
      .map((ro: any) => ({ odp: ro.odp, orden: 0, fecha_programada: String(ro.fecha_programada).slice(0, 10) }));
    const nuevas = entries.filter((e) => !propias.some((p: RutaODPEntry) => p.odp.id === e.odp.id));
    setEntries([...propias, ...nuevas].map((e, i) => ({ ...e, orden: i + 1 })));
    setVehiculoId(destino.vehiculo?.id || vehiculoId);
    setConductorId(destino.conductor?.id || conductorId);
    setOficialId(destino.oficial?.id || oficialId);
    setInstaladoresSeleccionados((prev) => Array.from(new Set([...(destino.instaladores ?? []).map((i: any) => i.id), ...prev]))
      .filter((id) => id !== (destino.oficial?.id || oficialId)));
    setObservaciones((prev: string) => [destino.observaciones, prev].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join('\n'));
    setRutaBase(destino);
    toast.info(`Ahora editas la ruta #${destino.id}. Revisa el orden y guarda.`);
  };

  const conductores = personal.filter(p => p.rol === 'conductor');
  const instaladores = personal.filter(p => p.rol === 'instalador');

  const agregarODP = (odp: ODPItem) => {
    if (entries.find(e => e.odp.id === odp.id)) return;
    // La ODP nueva toma el día de las que ya están (casi siempre todas van el mismo día).
    setEntries(prev => [...prev, { odp, orden: prev.length + 1, fecha_programada: prev[prev.length - 1]?.fecha_programada || fechaPreseleccion || hoyBogotaISO() }]);
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
      if (rutaBase) {
        await axios.put(`${API}/api/rutas/${rutaBase.id}`, payload);
        toast.success(`Ruta #${rutaBase.id} actualizada`);
      } else {
        await axios.post(`${API}/api/rutas`, payload);
        toast.success('Ruta creada');
      }
      onSaved();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'No se pudo guardar la ruta. Revisa tu conexión e intenta de nuevo.');
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
            <h2 className="text-lg font-bold text-slate-900">{rutaBase ? `Editar Ruta #${rutaBase.id}` : 'Programar Ruta de Instalación'}</h2>
            <p className="text-xs text-slate-700 mt-0.5">Asigna vehículo, personal y ODPs en orden</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Vehículo, conductor y oficial */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-900 mb-1.5 uppercase tracking-wide flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5" /> Vehículo
              </label>
              <select value={vehiculoId} onChange={e => setVehiculoId(Number(e.target.value) || '')}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                <option value="">Sin vehículo asignado</option>
                {vehiculos.map(v => <option key={v.id} value={v.id}>{v.tipo.toUpperCase()} — {v.placa}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-900 mb-1.5 uppercase tracking-wide">Conductor</label>
              <select value={conductorId} onChange={e => setConductorId(Number(e.target.value) || '')}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                <option value="">Sin conductor asignado</option>
                {conductores.map(c => <option key={c.id} value={c.id}>{c.nombre_completo}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-900 mb-1.5 uppercase tracking-wide" title="Quien puede marcar la ruta como completada">
                Oficial de ruta
              </label>
              <select value={oficialId} onChange={e => setOficialId(Number(e.target.value) || '')}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                <option value="">Sin oficial</option>
                {personal.map(p => <option key={p.id} value={p.id}>{p.nombre_completo}</option>)}
              </select>
              {/* En la app del instalador solo el oficial inicia y finaliza el trabajo */}
              {!oficialId && (
                <p className="text-[11px] text-amber-800 mt-1">Sin oficial, nadie podrá iniciar ni finalizar el trabajo desde la app.</p>
              )}
            </div>
          </div>

          {/* Instaladores */}
          <div>
            <label className="block text-xs font-semibold text-slate-900 mb-2 uppercase tracking-wide flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Instaladores asignados
            </label>
            <div className="flex flex-wrap gap-2">
              {instaladores.map(ins => {
                const sel = instaladoresSeleccionados.includes(ins.id);
                return (
                  <button key={ins.id} onClick={() => toggleInstalador(ins.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${sel ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-800 border-slate-200 hover:border-indigo-300'}`}>
                    {ins.nombre_completo}
                  </button>
                );
              })}
              {instaladores.length === 0 && <p className="text-xs text-slate-700">No hay instaladores registrados</p>}
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
              <label className="block text-xs font-semibold text-slate-900 mb-2 uppercase tracking-wide flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> ODPs disponibles (clic para agregar)
              </label>
              <div className="max-h-36 overflow-y-auto space-y-1 rounded-lg border border-slate-200 p-2">
                {odpsNoAgregadas.map(odp => (
                  <button key={odp.id} onClick={() => agregarODP(odp)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition-all flex justify-between items-center group">
                    <div>
                      <span className="text-sm font-semibold text-slate-900">{odp.numero_odp}</span>
                      <span className="text-xs text-slate-700 ml-2">{odp.cliente?.nombre_razon_social}</span>
                    </div>
                    <Plus className="w-4 h-4 text-indigo-400 opacity-0 group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Aviso de choque de equipo: solo avisa, nunca bloquea */}
          {choques.length > 0 && (
            <div className="px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-2">
              <p className="flex items-start gap-1.5 font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                Este equipo ya tiene {choques.length === 1 ? 'otra ruta' : `${choques.length} rutas`} ese día.
                {!rutaBase && ' Puedes agregar estas ODPs a la ruta existente en vez de crear otra.'}
              </p>
              {choques.map((c) => (
                <div key={c.ruta.id} className="flex items-center gap-2 flex-wrap pl-5">
                  <span>
                    <b>Ruta #{c.ruta.id}</b> · <span className="capitalize">{c.fechas.map(fmtDiaCorto).join(', ')}</span> · {c.motivos.join(' · ')}
                    {c.ruta.estado === 'en_curso' ? ' · en curso' : ''}
                  </span>
                  {!rutaBase && (
                    <button
                      onClick={() => agregarARutaExistente(c.ruta)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-amber-300 font-semibold text-amber-900 hover:bg-amber-100"
                    >
                      <Link2 className="w-3.5 h-3.5" /> Agregar a la ruta #{c.ruta.id}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ODPs en la ruta (con orden) */}
          <div>
            <label className="block text-xs font-semibold text-slate-900 mb-2 uppercase tracking-wide flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Orden de instalación ({entries.length} ODP{entries.length !== 1 ? 's' : ''})
            </label>
            {entries.length === 0 ? (
              <div className="border-2 border-dashed border-slate-200 rounded-lg py-8 text-center text-sm text-slate-700">
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
                      <p className="text-sm font-semibold text-slate-900 truncate">{entry.odp.numero_odp}</p>
                      <p className="text-xs text-slate-700 truncate">{entry.odp.cliente?.nombre_razon_social}</p>
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
            <label className="block text-xs font-semibold text-slate-900 mb-1.5 uppercase tracking-wide">Observaciones</label>
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
            {saving ? 'Guardando...' : rutaBase ? 'Guardar cambios' : 'Crear Ruta'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProgramarRutaModal;
