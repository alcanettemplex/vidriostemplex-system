import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Printer, Ruler, MapPin } from 'lucide-react';
import { toast } from 'react-toastify';

interface Medida {
  ubicacion: string;
  ancho_mm: number;
  alto_mm: number;
  obs: string;
}

interface TM {
  id: number;
  numero_tm: string;
  odp_id: number;
  fecha_visita: string;
  direccion: string;
  contacto_obra: string;
  telefono_obra: string;
  observaciones: string;
  medidas_json: Medida[];
  fecha_creacion: string;
  realizador: { nombre_completo: string };
}

interface Props { odp: any; onClose: () => void; }

const emptyMedida = (): Medida => ({ ubicacion: '', ancho_mm: 0, alto_mm: 0, obs: '' });

const TMModal: React.FC<Props> = ({ odp, onClose }) => {
  const [tms, setTMs] = useState<TM[]>([]);
  const [mode, setMode] = useState<'list' | 'create' | 'view'>('list');
  const [selected, setSelected] = useState<TM | null>(null);
  const [loading, setLoading] = useState(false);
  const [medidas, setMedidas] = useState<Medida[]>([emptyMedida()]);
  const [form, setForm] = useState({ fecha_visita: '', direccion: odp.direccion_instalacion || '', contacto_obra: odp.nombre_recibe || '', telefono_obra: odp.telefono_recibe || '', observaciones: '' });

  const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
  const token = localStorage.getItem('token');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchTMs(); }, []);

  const fetchTMs = async () => {
    try {
      const res = await axios.get(`${API}/api/documentos/tm/odp/${odp.id}`, { headers: { Authorization: `Bearer ${token}` } });
      setTMs(res.data);
    } catch { setTMs([]); }
  };

  const addMedida = () => setMedidas(p => [...p, emptyMedida()]);
  const removeMedida = (i: number) => setMedidas(p => p.filter((_, idx) => idx !== i));
  const updateMedida = (i: number, field: keyof Medida, val: any) => setMedidas(p => p.map((m, idx) => idx === i ? { ...m, [field]: val } : m));

  const handleCreate = async () => {
    setLoading(true);
    try {
      await axios.post(`${API}/api/documentos/tm`, {
        odp_id: odp.id, ...form,
        medidas_json: medidas.filter(m => m.ubicacion.trim()),
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('TM creada · ODP actualizada a estado MEDICION');
      fetchTMs();
      setMode('list');
    } catch {
      const demo: TM = {
        id: Date.now(), numero_tm: `TM-${new Date().getFullYear()}-${String(tms.length + 1).padStart(4, '0')}`,
        odp_id: odp.id, ...form, medidas_json: medidas.filter(m => m.ubicacion.trim()),
        fecha_creacion: new Date().toISOString(), realizador: { nombre_completo: 'Jefe de Producción' },
      };
      setTMs(prev => [demo, ...prev]);
      toast.success('TM creada (modo demo)');
      setMode('list');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col border border-slate-200">

        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-xl"><Ruler className="w-5 h-5 text-amber-600" /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">TM — Toma de Medidas</h2>
              <p className="text-xs text-slate-500">{odp.numero_odp} · {odp.cliente?.nombre_razon_social}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {mode === 'list' && (
              <button onClick={() => { setMode('create'); setMedidas([emptyMedida()]); setForm({ fecha_visita: '', direccion: odp.direccion_instalacion || '', contacto_obra: odp.nombre_recibe || '', telefono_obra: odp.telefono_recibe || '', observaciones: '' }); }}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white text-sm font-bold rounded-xl hover:bg-amber-600 transition shadow-sm">
                <Plus className="w-4 h-4" /> Nueva TM
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* LISTADO */}
          {mode === 'list' && (
            <div className="p-6 space-y-4">
              {tms.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <Ruler className="w-16 h-16 mx-auto mb-4 text-slate-200" />
                  <p className="font-bold text-lg">Sin tomas de medida registradas</p>
                  <p className="text-sm">El Jefe de Producción debe completar la TM antes del ensamblaje.</p>
                </div>
              ) : tms.map(tm => (
                <div key={tm.id} className="border border-slate-200 rounded-xl p-5 hover:border-amber-200 transition-all">
                  <div className="flex justify-between">
                    <div>
                      <span className="font-black text-amber-700 text-xl tracking-tight">{tm.numero_tm}</span>
                      <p className="text-sm text-slate-500 mt-1">
                        Por {tm.realizador?.nombre_completo} · {tm.fecha_visita ? new Date(tm.fecha_visita + 'T00:00:00').toLocaleDateString('es-CO') : 'Sin fecha'} · {tm.medidas_json?.length || 0} medidas
                      </p>
                      {tm.direccion && <p className="text-xs text-slate-400 mt-1 flex items-center gap-1"><MapPin className="w-3 h-3" />{tm.direccion}</p>}
                    </div>
                    <button onClick={() => { setSelected(tm); setMode('view'); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-amber-200 text-amber-700 bg-white rounded-lg hover:bg-amber-50 transition">
                      <Printer className="w-3.5 h-3.5" /> Ver
                    </button>
                  </div>
                  {tm.medidas_json && tm.medidas_json.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                      {tm.medidas_json.slice(0, 8).map((m, i) => (
                        <div key={i} className="bg-amber-50 border border-amber-100 rounded-lg p-2 text-xs">
                          <p className="font-bold text-amber-800 truncate">{m.ubicacion}</p>
                          <p className="text-amber-700 font-mono">{m.ancho_mm}mm × {m.alto_mm}mm</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* FORMULARIO */}
          {mode === 'create' && (
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase">Fecha de Visita</label>
                  <input type="date" value={form.fecha_visita} onChange={e => setForm(p => ({ ...p, fecha_visita: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"/>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase">Dirección de Obra</label>
                  <input value={form.direccion} onChange={e => setForm(p => ({ ...p, direccion: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"/>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase">Contacto en Obra</label>
                  <input value={form.contacto_obra} onChange={e => setForm(p => ({ ...p, contacto_obra: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"/>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase">Teléfono Contacto</label>
                  <input value={form.telefono_obra} onChange={e => setForm(p => ({ ...p, telefono_obra: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"/>
                </div>
              </div>

              {/* Tabla de medidas */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Tabla de Medidas Relevadas</label>
                  <button onClick={addMedida} className="flex items-center gap-1 text-xs font-bold text-amber-700 border border-amber-200 px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 transition">
                    <Plus className="w-3.5 h-3.5" /> Agregar Medida
                  </button>
                </div>

                <div className="hidden md:grid grid-cols-12 gap-2 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 px-3 mb-1">
                  <span className="col-span-4">Ubicación / Descripción</span>
                  <span className="col-span-3">Ancho (mm)</span>
                  <span className="col-span-3">Alto (mm)</span>
                  <span className="col-span-1">Obs.</span>
                  <span className="col-span-1"></span>
                </div>

                <AnimatePresence>
                  {medidas.map((m, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="grid md:grid-cols-12 gap-2 items-center p-3 bg-amber-50/50 rounded-xl border border-amber-100 mb-2">
                      <input value={m.ubicacion} onChange={e => updateMedida(i, 'ubicacion', e.target.value)}
                        placeholder="Ej: Ventana Sala Principal" className="md:col-span-4 border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"/>
                      <input type="number" value={m.ancho_mm || ''} onChange={e => updateMedida(i, 'ancho_mm', Number(e.target.value))}
                        placeholder="mm" className="md:col-span-3 border border-amber-200 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white font-mono"/>
                      <input type="number" value={m.alto_mm || ''} onChange={e => updateMedida(i, 'alto_mm', Number(e.target.value))}
                        placeholder="mm" className="md:col-span-3 border border-amber-200 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white font-mono"/>
                      <input value={m.obs} onChange={e => updateMedida(i, 'obs', e.target.value)}
                        placeholder="..." className="md:col-span-1 border border-amber-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"/>
                      <div className="md:col-span-1 flex justify-center">
                        {medidas.length > 1 && (
                          <button onClick={() => removeMedida(i)} className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"><Trash2 className="w-4 h-4"/></button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase">Observaciones Generales</label>
                <textarea value={form.observaciones} onChange={e => setForm(p => ({ ...p, observaciones: e.target.value }))} rows={3}
                  placeholder="Ej: Edificio con acceso restringido. Coordinar con portería..." className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"/>
              </div>

              <div className="flex gap-3 pt-2 border-t border-slate-100">
                <button onClick={() => setMode('list')} className="flex-1 py-3 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition">Cancelar</button>
                <button onClick={handleCreate} disabled={loading}
                  className="flex-1 py-3 font-bold text-white bg-amber-500 rounded-xl hover:bg-amber-600 transition shadow-md shadow-amber-200 disabled:opacity-50">
                  {loading ? 'Guardando...' : 'Registrar TM'}
                </button>
              </div>
            </div>
          )}

          {/* VISTA / IMPRESIÓN */}
          {mode === 'view' && selected && (
            <div className="p-0">
              <div className="flex gap-3 p-4 border-b border-slate-100 print:hidden">
                <button onClick={() => setMode('list')} className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">← Volver</button>
                <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-amber-700 border border-amber-200 rounded-xl bg-amber-50 hover:bg-amber-100 transition">
                  <Printer className="w-4 h-4" /> Imprimir
                </button>
              </div>

              <div id="tm-print-area" className="p-8 text-black text-sm font-sans">
                <div className="flex justify-between items-start border-b-4 border-black pb-4 mb-6">
                  <div>
                    <h1 className="text-3xl font-black uppercase tracking-widest">Vidrios Templex</h1>
                    <p className="text-sm font-bold text-gray-600 uppercase mt-1">Toma de Medidas — Registro de Campo</p>
                  </div>
                  <div className="text-right border-l-4 border-black pl-6">
                    <div className="bg-black text-white px-4 py-2 mb-2 text-center">
                      <p className="text-xs font-bold uppercase">N° TM</p>
                      <p className="text-2xl font-black">{selected.numero_tm}</p>
                    </div>
                    <p className="text-xs font-bold">Fecha visita: {selected.fecha_visita ? new Date(selected.fecha_visita + 'T00:00:00').toLocaleDateString('es-CO') : '—'}</p>
                    <p className="text-xs font-bold">ODP: {odp.numero_odp}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-6">
                  <table className="border-collapse border border-black text-xs w-full">
                    <tbody>
                      <tr><td className="border border-black p-2 font-bold bg-gray-100 w-1/3">Cliente</td><td className="border border-black p-2 font-bold">{odp.cliente?.nombre_razon_social}</td></tr>
                      <tr><td className="border border-black p-2 font-bold bg-gray-100">Dirección</td><td className="border border-black p-2">{selected.direccion || '—'}</td></tr>
                      <tr><td className="border border-black p-2 font-bold bg-gray-100">Contacto</td><td className="border border-black p-2">{selected.contacto_obra || '—'}</td></tr>
                      <tr><td className="border border-black p-2 font-bold bg-gray-100">Teléfono</td><td className="border border-black p-2">{selected.telefono_obra || '—'}</td></tr>
                    </tbody>
                  </table>
                  <table className="border-collapse border border-black text-xs w-full">
                    <tbody>
                      <tr><td className="border border-black p-2 font-bold bg-gray-100 w-1/3">Realizado por</td><td className="border border-black p-2 font-bold">{selected.realizador?.nombre_completo}</td></tr>
                      <tr><td className="border border-black p-2 font-bold bg-gray-100">Tipo Servicio</td><td className="border border-black p-2">{odp.tipo_servicio || '—'}</td></tr>
                      <tr><td className="border border-black p-2 font-bold bg-gray-100">ODP Ref</td><td className="border border-black p-2 text-red-700 font-bold">{odp.numero_odp}</td></tr>
                      <tr><td className="border border-black p-2 font-bold bg-gray-100">Creado</td><td className="border border-black p-2">{new Date(selected.fecha_creacion).toLocaleDateString('es-CO')}</td></tr>
                    </tbody>
                  </table>
                </div>

                {/* Tabla de medidas */}
                <div className="mb-6">
                  <h3 className="font-bold bg-black text-white px-3 py-1.5 mb-0 uppercase text-xs tracking-wider">Medidas Relevadas en Campo</h3>
                  <table className="w-full border-collapse border border-black text-xs">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="border border-black py-1.5 px-2 text-left w-6">#</th>
                        <th className="border border-black py-1.5 px-2 text-left">Ubicación / Descripción</th>
                        <th className="border border-black py-1.5 px-2 text-center w-24">Ancho (mm)</th>
                        <th className="border border-black py-1.5 px-2 text-center w-24">Alto (mm)</th>
                        <th className="border border-black py-1.5 px-2 text-center w-24">M² Aprox.</th>
                        <th className="border border-black py-1.5 px-2 text-left">Observación</th>
                        <th className="border border-black py-1.5 px-2 text-center w-12">V° B°</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selected.medidas_json || []).map((m, i) => {
                        const m2 = ((m.ancho_mm / 1000) * (m.alto_mm / 1000)).toFixed(3);
                        return (
                          <tr key={i} className={i % 2 === 0 ? '' : 'bg-gray-50'}>
                            <td className="border border-black py-2 px-2 font-bold text-center">{i + 1}</td>
                            <td className="border border-black py-2 px-2 font-semibold">{m.ubicacion}</td>
                            <td className="border border-black py-2 px-2 text-center font-mono font-bold">{m.ancho_mm}</td>
                            <td className="border border-black py-2 px-2 text-center font-mono font-bold">{m.alto_mm}</td>
                            <td className="border border-black py-2 px-2 text-center font-mono text-blue-700">{m2}</td>
                            <td className="border border-black py-2 px-2 text-gray-600">{m.obs || '—'}</td>
                            <td className="border border-black py-2 px-2 text-center text-lg">□</td>
                          </tr>
                        );
                      })}
                      {/* Filas en blanco para escribir a mano */}
                      {Array.from({ length: Math.max(0, 4 - (selected.medidas_json?.length || 0)) }).map((_, i) => (
                        <tr key={`e${i}`}><td colSpan={7} className="border border-black py-5"></td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Observaciones y Croquis */}
                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div className="border border-black p-3 min-h-[100px]">
                    <p className="font-bold text-xs uppercase border-b border-gray-300 pb-1 mb-2">Observaciones Generales</p>
                    <p className="text-xs">{selected.observaciones || ''}</p>
                  </div>
                  <div className="border border-black p-3 min-h-[100px] flex flex-col">
                    <p className="font-bold text-xs uppercase border-b border-gray-300 pb-1 mb-2">Croquis / Boceto</p>
                    <div className="flex-1 flex items-center justify-center text-gray-300 text-xs">(Espacio para croquis manual)</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-6 mt-10">
                  {['Jefe de Producción', 'Técnico Relevador', 'Aprobado por'].map(l => (
                    <div key={l} className="text-center text-xs">
                      <div className="border-t-2 border-black pt-2 mt-12"><p className="font-bold uppercase tracking-wider">{l}</p></div>
                    </div>
                  ))}
                </div>

                <div className="border-t-2 border-black pt-3 mt-8 flex justify-between text-[10px] text-gray-500">
                  <span>Vidrios Templex — Registro de Campo</span>
                  <span>{selected.numero_tm} · ODP {odp.numero_odp}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden; }
          #tm-print-area, #tm-print-area * { visibility: visible; }
          #tm-print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 15px; }
          @page { margin: 1cm; size: portrait; }
        }
      ` }} />
    </div>
  );
};

export default TMModal;
