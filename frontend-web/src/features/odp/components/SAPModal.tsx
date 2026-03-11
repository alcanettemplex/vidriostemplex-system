import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Printer, CheckCircle2, FileText, Package } from 'lucide-react';
import { toast } from 'react-toastify';

interface SAPItem {
  id?: number;
  descripcion: string;
  referencia: string;
  color: string;
  cantidad: number;
  unidad: string;
  observacion: string;
}

interface SAP {
  id: number;
  numero_sap: string;
  odp_id: number;
  notas: string;
  estado: string;
  fecha_creacion: string;
  asesor: { nombre_completo: string };
  items: SAPItem[];
}

interface Props {
  odp: any;
  onClose: () => void;
}

const emptyItem = (): SAPItem => ({ descripcion: '', referencia: '', color: '', cantidad: 1, unidad: 'und', observacion: '' });

const SAPModal: React.FC<Props> = ({ odp, onClose }) => {
  const [saps, setSaps] = useState<SAP[]>([]);
  const [mode, setMode] = useState<'list' | 'create' | 'view'>('list');
  const [selectedSAP, setSelectedSAP] = useState<SAP | null>(null);
  const [notas, setNotas] = useState('');
  const [items, setItems] = useState<SAPItem[]>([emptyItem()]);
  const [loading, setLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
  const token = localStorage.getItem('token');

  useEffect(() => { fetchSAPs(); }, []);

  const fetchSAPs = async () => {
    try {
      const res = await axios.get(`${API}/api/documentos/sap/odp/${odp.id}`, { headers: { Authorization: `Bearer ${token}` } });
      setSaps(res.data);
    } catch {
      // Demo fallback
      setSaps([]);
    }
  };

  const addItem = () => setItems(prev => [...prev, emptyItem()]);
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof SAPItem, val: any) => {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it));
  };

  const handleCreate = async () => {
    if (items.every(i => !i.descripcion.trim())) { toast.error('Agrega al menos un ítem'); return; }
    setLoading(true);
    try {
      const res = await axios.post(`${API}/api/documentos/sap`, {
        odp_id: odp.id, notas, items: items.filter(i => i.descripcion.trim()),
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(`SAP ${res.data.numero_sap} creada exitosamente`);
      fetchSAPs();
      setMode('list');
    } catch {
      // Demo mode
      const newSAP: SAP = {
        id: Date.now(), numero_sap: `SAP-${new Date().getFullYear()}-${String(saps.length + 1).padStart(4, '0')}`,
        odp_id: odp.id, notas, estado: 'borrador', fecha_creacion: new Date().toISOString(),
        asesor: { nombre_completo: 'Usuario Actual' },
        items: items.filter(i => i.descripcion.trim()),
      };
      setSaps(prev => [newSAP, ...prev]);
      toast.success('SAP creada (modo demo)');
      setMode('list');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => window.print();

  const estadoColor: Record<string, string> = {
    borrador: 'bg-slate-100 text-slate-700',
    enviada: 'bg-blue-100 text-blue-700',
    aprobada: 'bg-emerald-100 text-emerald-700',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col border border-slate-200">

        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-xl"><Package className="w-5 h-5 text-indigo-600" /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">SAP — Solicitud de Accesorios y Perfilería</h2>
              <p className="text-xs text-slate-500 font-medium">{odp.numero_odp} · {odp.cliente?.nombre_razon_social}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {mode === 'list' && (
              <button onClick={() => { setMode('create'); setItems([emptyItem()]); setNotas(''); }}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition shadow-sm shadow-indigo-200">
                <Plus className="w-4 h-4" /> Nueva SAP
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* LISTADO */}
          {mode === 'list' && (
            <div className="p-6 space-y-4">
              {saps.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <Package className="w-16 h-16 mx-auto mb-4 text-slate-200" />
                  <p className="font-bold text-lg">Sin solicitudes SAP</p>
                  <p className="text-sm mt-1">Crea la primera solicitud de accesorios y perfilería para esta ODP.</p>
                </div>
              ) : saps.map(sap => (
                <div key={sap.id} className="border border-slate-200 rounded-xl p-5 hover:border-indigo-200 hover:bg-indigo-50/50 transition-all group">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-black text-indigo-700 text-xl tracking-tight">{sap.numero_sap}</span>
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${estadoColor[sap.estado] || 'bg-slate-100'}`}>
                          {sap.estado.charAt(0).toUpperCase() + sap.estado.slice(1)}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 font-medium">
                        {sap.items.length} ítem(s) · Creado por {sap.asesor?.nombre_completo} · {new Date(sap.fecha_creacion).toLocaleDateString('es-CO')}
                      </p>
                      {sap.notas && <p className="text-sm text-slate-600 mt-2 italic">"{sap.notas}"</p>}
                    </div>
                    <button onClick={() => { setSelectedSAP(sap); setMode('view'); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-indigo-200 text-indigo-700 bg-white rounded-lg hover:bg-indigo-50 transition">
                      <FileText className="w-3.5 h-3.5" /> Ver / Imprimir
                    </button>
                  </div>
                  {/* Preview de items */}
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {sap.items.slice(0, 6).map((item, i) => (
                      <div key={i} className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs">
                        <p className="font-bold text-slate-700 truncate">{item.descripcion}</p>
                        <p className="text-slate-500">{item.cantidad} {item.unidad} {item.color && `· ${item.color}`}</p>
                      </div>
                    ))}
                    {sap.items.length > 6 && <div className="bg-slate-50 border border-dashed border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-400 flex items-center justify-center">+{sap.items.length - 6} más</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* CREACIÓN */}
          {mode === 'create' && (
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Observaciones / Notas de la SAP</label>
                <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Ej: Material para ventana principal sala..."
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
              </div>

              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Ítems de Accesorios / Perfilería</label>
                  <button onClick={addItem} className="flex items-center gap-1 text-xs font-bold text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition">
                    <Plus className="w-3.5 h-3.5" /> Agregar Ítem
                  </button>
                </div>

                <div className="space-y-3">
                  {/* Header de tabla */}
                  <div className="hidden md:grid grid-cols-12 gap-2 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 px-3">
                    <span className="col-span-4">Descripción *</span>
                    <span className="col-span-2">Referencia</span>
                    <span className="col-span-2">Color</span>
                    <span className="col-span-1">Cant.</span>
                    <span className="col-span-1">Und.</span>
                    <span className="col-span-1">Obs.</span>
                    <span className="col-span-1"></span>
                  </div>

                  <AnimatePresence>
                    {items.map((item, i) => (
                      <motion.div key={i} initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="grid md:grid-cols-12 gap-2 items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <input value={item.descripcion} onChange={e => updateItem(i, 'descripcion', e.target.value)}
                          placeholder="Ej: Perfil aluminio T-50 negro mate" className="md:col-span-4 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"/>
                        <input value={item.referencia} onChange={e => updateItem(i, 'referencia', e.target.value)}
                          placeholder="REF-001" className="md:col-span-2 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"/>
                        <input value={item.color} onChange={e => updateItem(i, 'color', e.target.value)}
                          placeholder="Color" className="md:col-span-2 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"/>
                        <input type="number" min={0.01} step={0.01} value={item.cantidad} onChange={e => updateItem(i, 'cantidad', Number(e.target.value))}
                          className="md:col-span-1 border border-slate-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"/>
                        <select value={item.unidad} onChange={e => updateItem(i, 'unidad', e.target.value)}
                          className="md:col-span-1 border border-slate-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                          {['und', 'ml', 'm', 'm²', 'kg', 'caja', 'par', 'juego'].map(u => <option key={u}>{u}</option>)}
                        </select>
                        <input value={item.observacion} onChange={e => updateItem(i, 'observacion', e.target.value)}
                          placeholder="Obs." className="md:col-span-1 border border-slate-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"/>
                        <div className="md:col-span-1 flex justify-center">
                          {items.length > 1 && (
                            <button onClick={() => removeItem(i)} className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              <div className="flex gap-3 border-t border-slate-100 pt-4">
                <button onClick={() => setMode('list')} className="flex-1 py-3 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition">Cancelar</button>
                <button onClick={handleCreate} disabled={loading}
                  className="flex-1 py-3 font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition shadow-md shadow-indigo-200 disabled:opacity-50">
                  {loading ? 'Guardando...' : 'Crear SAP'}
                </button>
              </div>
            </div>
          )}

          {/* VISTA / IMPRESIÓN */}
          {mode === 'view' && selectedSAP && (
            <div className="p-0">
              <div className="flex gap-3 p-4 border-b border-slate-100 print:hidden">
                <button onClick={() => setMode('list')} className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition">
                  ← Volver
                </button>
                <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-indigo-700 border border-indigo-200 rounded-xl bg-indigo-50 hover:bg-indigo-100 transition">
                  <Printer className="w-4 h-4" /> Imprimir
                </button>
              </div>

              {/* FORMATO IMPRIMIBLE SAP */}
              <div ref={printRef} id="sap-print-area" className="p-8 font-sans text-black text-sm">
                {/* Encabezado */}
                <div className="flex justify-between items-start border-b-4 border-black pb-4 mb-6">
                  <div>
                    <h1 className="text-3xl font-black uppercase tracking-widest text-black">Vidrios Templex</h1>
                    <p className="text-sm font-bold text-gray-600 uppercase tracking-wider mt-1">Solicitud de Accesorios y Perfilería</p>
                    <p className="text-xs text-gray-500 mt-1">Sistema Integral de Producción</p>
                  </div>
                  <div className="text-right border-l-4 border-black pl-6">
                    <div className="bg-black text-white px-4 py-2 text-center mb-2">
                      <p className="text-xs font-bold uppercase tracking-wider">Número SAP</p>
                      <p className="text-2xl font-black">{selectedSAP.numero_sap}</p>
                    </div>
                    <p className="text-xs font-bold">Fecha: {new Date(selectedSAP.fecha_creacion).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                    <p className="text-xs font-bold mt-1">Estado: <span className="uppercase">{selectedSAP.estado}</span></p>
                  </div>
                </div>

                {/* Info de la ODP */}
                <div className="grid grid-cols-2 gap-6 mb-6">
                  <table className="border-collapse border border-black text-xs w-full">
                    <tbody>
                      <tr><td className="border border-black p-2 font-bold bg-gray-100 w-1/3">ODP N°</td><td className="border border-black p-2 font-bold text-red-700 text-base">{odp.numero_odp}</td></tr>
                      <tr><td className="border border-black p-2 font-bold bg-gray-100">Cliente</td><td className="border border-black p-2">{odp.cliente?.nombre_razon_social}</td></tr>
                      <tr><td className="border border-black p-2 font-bold bg-gray-100">Asesor</td><td className="border border-black p-2">{selectedSAP.asesor?.nombre_completo}</td></tr>
                    </tbody>
                  </table>
                  <table className="border-collapse border border-black text-xs w-full">
                    <tbody>
                      <tr><td className="border border-black p-2 font-bold bg-gray-100">Dirección</td><td className="border border-black p-2">{odp.direccion_instalacion || '—'}</td></tr>
                      <tr><td className="border border-black p-2 font-bold bg-gray-100">Tipo Servicio</td><td className="border border-black p-2">{odp.tipo_servicio || '—'}</td></tr>
                      <tr><td className="border border-black p-2 font-bold bg-gray-100">Entrega</td><td className="border border-black p-2">{odp.fecha_entrega ? new Date(odp.fecha_entrega).toLocaleDateString('es-CO') : '—'}</td></tr>
                    </tbody>
                  </table>
                </div>

                {/* Tabla de ítems */}
                <div className="mb-6">
                  <h3 className="font-bold bg-black text-white px-3 py-1.5 mb-0 uppercase text-xs tracking-wider">Detalle de Materiales Requeridos</h3>
                  <table className="w-full border-collapse border border-black text-xs">
                    <thead className="bg-gray-200">
                      <tr>
                        <th className="border border-black py-1.5 px-2 text-left w-6">#</th>
                        <th className="border border-black py-1.5 px-2 text-left">Descripción del Material</th>
                        <th className="border border-black py-1.5 px-2 text-left">Referencia</th>
                        <th className="border border-black py-1.5 px-2 text-left">Color / Acabado</th>
                        <th className="border border-black py-1.5 px-2 text-center w-14">Cant.</th>
                        <th className="border border-black py-1.5 px-2 text-center w-12">Und.</th>
                        <th className="border border-black py-1.5 px-2 text-left">Observación</th>
                        <th className="border border-black py-1.5 px-2 text-center w-12">✓ Rec.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSAP.items.map((item, i) => (
                        <tr key={i} className={i % 2 === 0 ? '' : 'bg-gray-50'}>
                          <td className="border border-black py-1.5 px-2 font-bold text-center">{i + 1}</td>
                          <td className="border border-black py-1.5 px-2 font-semibold">{item.descripcion}</td>
                          <td className="border border-black py-1.5 px-2 font-mono text-xs">{item.referencia || '—'}</td>
                          <td className="border border-black py-1.5 px-2">{item.color || '—'}</td>
                          <td className="border border-black py-1.5 px-2 text-center font-bold">{item.cantidad}</td>
                          <td className="border border-black py-1.5 px-2 text-center">{item.unidad}</td>
                          <td className="border border-black py-1.5 px-2 text-gray-600">{item.observacion || '—'}</td>
                          <td className="border border-black py-1.5 px-2 text-center">□</td>
                        </tr>
                      ))}
                      {/* Filas vacías para escribir a mano */}
                      {Array.from({ length: Math.max(0, 3 - selectedSAP.items.length) }).map((_, i) => (
                        <tr key={`empty-${i}`}><td colSpan={8} className="border border-black py-4 px-2"></td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Notas y firmas */}
                <div className="grid grid-cols-2 gap-6 mb-8">
                  <div className="border border-black p-3 min-h-[80px]">
                    <p className="font-bold text-xs uppercase border-b border-gray-300 pb-1 mb-2">Observaciones Generales</p>
                    <p className="text-xs">{selectedSAP.notas || ''}</p>
                  </div>
                  <div className="border border-black p-3">
                    <p className="font-bold text-xs uppercase border-b border-gray-300 pb-1 mb-2">Uso Interno — Confirmación Recepción</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <span>Recibido por:</span><span className="border-b border-black pb-1 flex-1"></span>
                      <span>Fecha:</span><span className="border-b border-black pb-1"></span>
                      <span>Firma:</span><span className="border-b border-black pb-1 mt-4 h-8"></span>
                    </div>
                  </div>
                </div>

                {/* Pie de página */}
                <div className="border-t-2 border-black pt-3 flex justify-between text-[10px] text-gray-500">
                  <span>Vidrios Templex — Sistema de Producción</span>
                  <span>{selectedSAP.numero_sap} · Generado: {new Date().toLocaleDateString('es-CO')}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden; }
          #sap-print-area, #sap-print-area * { visibility: visible; }
          #sap-print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 15px; }
          @page { margin: 1cm; size: portrait; }
        }
      ` }} />
    </div>
  );
};

export default SAPModal;
