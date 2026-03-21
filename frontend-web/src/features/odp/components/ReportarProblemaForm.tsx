import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { X, AlertTriangle, Send, CheckCircle, ChevronDown, Package } from 'lucide-react';

interface ReportarProblemaFormProps {
  odp: any;
  onClose: () => void;
  onSuccess: () => void;
}

const ReportarProblemaForm: React.FC<ReportarProblemaFormProps> = ({ odp, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [step, setStep] = useState(1); // 1: Datos del problema, 2: Seleccionar ítem dañado, 3: Definir solución

  // Datos del reporte
  const [tipoError, setTipoError] = useState('ERROR_INTERNO');
  const [areaError, setAreaError] = useState('');
  const [causa, setCausa] = useState('');
  const [responsable, setResponsable] = useState('');
  const [efecto, setEfecto] = useState('');
  const [observaciones, setObservaciones] = useState('');

  // Ítem dañado seleccionado
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);

  // Ítem de solución (repuesto)
  const [itemSolucion, setItemSolucion] = useState({
    item: '', color: '', espesor: '', cantidad: 1,
    ancho_mm: 0, alto_mm: 0, tipo_vidrio: '',
    pelicula: false, matizado: false, carton: false, huacal: false,
    accesorios: '', pulidos: '', perforaciones: 0, boquetes: 0,
    descuentos: '', otros: '', mts_pt_a: '', mts_pt_h: ''
  });

  const items: any[] = odp?.items || [];

  // Cuando se selecciona un ítem dañado, pre-llenar el formulario de solución
  useEffect(() => {
    if (selectedItemIndex !== null && items[selectedItemIndex]) {
      const src = items[selectedItemIndex];
      setItemSolucion({
        item: src.item || src.tipo_vidrio || '',
        color: src.color || '',
        espesor: src.espesor || '',
        cantidad: src.cantidad || 1,
        ancho_mm: src.ancho_mm || 0,
        alto_mm: src.alto_mm || 0,
        tipo_vidrio: src.tipo_vidrio || '',
        pelicula: src.pelicula || false,
        matizado: src.matizado || false,
        carton: src.carton || false,
        huacal: src.huacal || false,
        accesorios: src.accesorios || '',
        pulidos: src.pulidos || '',
        perforaciones: src.perforaciones || 0,
        boquetes: src.boquetes || 0,
        descuentos: src.descuentos || '',
        otros: src.otros || '',
        mts_pt_a: src.mts_pt_a || '',
        mts_pt_h: src.mts_pt_h || ''
      });
    }
  }, [selectedItemIndex]);

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
      const token = localStorage.getItem('token');
      const selectedItem = selectedItemIndex !== null ? items[selectedItemIndex] : null;

      const payload = {
        odp_id: odp.id,
        tipo_error: tipoError,
        area_error: areaError,
        causa,
        responsable,
        efecto,
        producto_error_descripcion: selectedItem ? `${selectedItem.tipo_vidrio || selectedItem.item} ${selectedItem.ancho_mm}x${selectedItem.alto_mm}mm` : '',
        producto_error_cantidad: selectedItem?.cantidad || 1,
        items_solucion: [itemSolucion],
        observaciones
      };

      const res = await axios.post(`${API}/api/no-conformidad`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setResultado(res.data);
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 4000);
    } catch (error: any) {
      console.error('Error al crear reporte:', error);
      const msg = error.response?.data?.message || 'Error al enviar el reporte. Verifique los campos.';
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
          <CheckCircle className="w-10 h-10" />
        </div>
        <h3 className="text-xl font-black text-slate-800">¡Reporte Enviado!</h3>
        <p className="text-slate-500 mt-2">La no conformidad ha sido registrada exitosamente.</p>
        {resultado && (
          <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-4 text-left w-full max-w-md">
            <p className="text-xs font-bold text-slate-500 mb-1">Consecutivo:</p>
            <p className="text-lg font-black text-indigo-700">{resultado.no_conformidad?.numero_reporte}</p>
            <p className="text-xs font-bold text-slate-500 mt-2 mb-1">Nueva ODP de Reproceso:</p>
            <p className="text-lg font-black text-amber-600">{resultado.nueva_odp?.numero_odp}</p>
            <p className="text-[10px] text-slate-400 mt-2">La ODP original ({odp.numero_odp}) ha sido pausada automáticamente.</p>
          </div>
        )}
      </div>
    );
  }

  const inputClass = "w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition";
  const labelClass = "block text-[10px] font-black uppercase text-slate-400 mb-1 tracking-wider";

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-5">
        <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" /> REPORTAR NO CONFORMIDAD
        </h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>1</span>
            <span className="w-4 h-px bg-slate-300" />
            <span className={`w-6 h-6 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>2</span>
            <span className="w-4 h-px bg-slate-300" />
            <span className={`w-6 h-6 rounded-full flex items-center justify-center ${step >= 3 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>3</span>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Referencia visual de la ODP */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-5 flex justify-between items-center text-sm">
        <div>
          <span className="font-black text-indigo-700">{odp.numero_odp}</span>
          <span className="text-slate-400 mx-2">·</span>
          <span className="text-slate-600">{odp.cliente?.nombre_razon_social}</span>
        </div>
        <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">{odp.estado_produccion?.replace(/_/g, ' ')}</span>
      </div>

      {/* ─── PASO 1: Datos del Problema ─── */}
      {step === 1 && (
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-3">
            <span className="w-5 h-5 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center text-[10px] font-black">1</span>
            Describe el problema
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Tipo de Error</label>
              <select className={inputClass} value={tipoError} onChange={e => setTipoError(e.target.value)}>
                <option value="ERROR_INTERNO">Error Interno</option>
                <option value="DANO_PLANTA">Daño en Planta/Transporte</option>
                <option value="REPROCESO">Reproceso (Medidas incorrectas)</option>
                <option value="QUEJA">Queja de Cliente</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Área del Error</label>
              <input type="text" required placeholder="Ej: Producción, Corte, Transporte..." className={inputClass} value={areaError} onChange={e => setAreaError(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Causa del Problema</label>
            <textarea required rows={2} placeholder="Describa qué originó el problema..." className={inputClass} value={causa} onChange={e => setCausa(e.target.value)} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Responsable de la Causa</label>
              <input type="text" required placeholder="Nombre del responsable" className={inputClass} value={responsable} onChange={e => setResponsable(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Efecto / Impacto</label>
              <input type="text" required placeholder="Ej: Vidrio roto, medida no cuadra..." className={inputClass} value={efecto} onChange={e => setEfecto(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Observaciones</label>
            <textarea rows={2} className={inputClass} value={observaciones} onChange={e => setObservaciones(e.target.value)} />
          </div>
          <div className="flex justify-end pt-2">
            <button type="button" onClick={() => {
              if (!areaError || !causa || !responsable || !efecto) {
                alert('Complete todos los campos obligatorios.');
                return;
              }
              setStep(2);
            }}
              className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition flex items-center gap-2 text-sm">
              Siguiente <ChevronDown className="w-4 h-4 -rotate-90" />
            </button>
          </div>
        </motion.div>
      )}

      {/* ─── PASO 2: Seleccionar Ítem Dañado ─── */}
      {step === 2 && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-3">
            <span className="w-5 h-5 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center text-[10px] font-black">2</span>
            ¿Qué elemento falló? Selecciona el ítem de la ODP
          </h3>
          {items.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Package className="w-10 h-10 mx-auto mb-2 text-slate-200" />
              <p className="font-bold">Esta ODP no tiene ítems registrados.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {items.map((item: any, i: number) => (
                <button key={i} type="button" onClick={() => setSelectedItemIndex(i)}
                  className={`w-full text-left p-3 border rounded-lg transition ${selectedItemIndex === i
                    ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-200'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{item.tipo_vidrio || item.item || 'Ítem sin nombre'}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {item.ancho_mm}mm × {item.alto_mm}mm
                        {item.espesor && ` · ${item.espesor}`}
                        {item.color && ` · ${item.color}`}
                      </p>
                    </div>
                    <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{item.cantidad}x</span>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="flex justify-between pt-2">
            <button type="button" onClick={() => setStep(1)} className="px-6 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition text-sm">
              Atrás
            </button>
            <button type="button" onClick={() => {
              if (selectedItemIndex === null) {
                alert('Selecciona el ítem afectado.');
                return;
              }
              setStep(3);
            }}
              className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition flex items-center gap-2 text-sm">
              Siguiente <ChevronDown className="w-4 h-4 -rotate-90" />
            </button>
          </div>
        </motion.div>
      )}

      {/* ─── PASO 3: Definir Ítem de Solución (Repuesto) ─── */}
      {step === 3 && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-1">
            <span className="w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-[10px] font-black">3</span>
            Define el ítem de solución / repuesto
          </h3>
          <p className="text-[11px] text-slate-400 mb-3">Los datos se pre-llenaron con el ítem dañado. Modifica las medidas o especificaciones según corresponda.</p>

          <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className={labelClass}>Descripción / Ítem</label>
                <input type="text" className={inputClass} value={itemSolucion.item} onChange={e => setItemSolucion({ ...itemSolucion, item: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>Tipo Vidrio</label>
                <input type="text" className={inputClass} value={itemSolucion.tipo_vidrio} onChange={e => setItemSolucion({ ...itemSolucion, tipo_vidrio: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>Color</label>
                <input type="text" className={inputClass} value={itemSolucion.color} onChange={e => setItemSolucion({ ...itemSolucion, color: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>Espesor</label>
                <input type="text" className={inputClass} value={itemSolucion.espesor} onChange={e => setItemSolucion({ ...itemSolucion, espesor: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className={labelClass}>Ancho (mm)</label>
                <input type="number" className={inputClass} value={itemSolucion.ancho_mm || ''} onChange={e => setItemSolucion({ ...itemSolucion, ancho_mm: parseInt(e.target.value) || 0 })} />
              </div>
              <div>
                <label className={labelClass}>Alto (mm)</label>
                <input type="number" className={inputClass} value={itemSolucion.alto_mm || ''} onChange={e => setItemSolucion({ ...itemSolucion, alto_mm: parseInt(e.target.value) || 0 })} />
              </div>
              <div>
                <label className={labelClass}>Cantidad</label>
                <input type="number" min={1} className={inputClass} value={itemSolucion.cantidad} onChange={e => setItemSolucion({ ...itemSolucion, cantidad: parseInt(e.target.value) || 1 })} />
              </div>
              <div>
                <label className={labelClass}>Pulidos</label>
                <input type="text" className={inputClass} value={itemSolucion.pulidos} onChange={e => setItemSolucion({ ...itemSolucion, pulidos: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className={labelClass}>Perforaciones</label>
                <input type="number" className={inputClass} value={itemSolucion.perforaciones || ''} onChange={e => setItemSolucion({ ...itemSolucion, perforaciones: parseInt(e.target.value) || 0 })} />
              </div>
              <div>
                <label className={labelClass}>Boquetes</label>
                <input type="number" className={inputClass} value={itemSolucion.boquetes || ''} onChange={e => setItemSolucion({ ...itemSolucion, boquetes: parseInt(e.target.value) || 0 })} />
              </div>
              <div>
                <label className={labelClass}>Accesorios</label>
                <input type="text" className={inputClass} value={itemSolucion.accesorios} onChange={e => setItemSolucion({ ...itemSolucion, accesorios: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>Otros</label>
                <input type="text" className={inputClass} value={itemSolucion.otros} onChange={e => setItemSolucion({ ...itemSolucion, otros: e.target.value })} />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 pt-1">
              {(['pelicula', 'matizado', 'carton', 'huacal'] as const).map(field => (
                <label key={field} className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={(itemSolucion as any)[field]} onChange={e => setItemSolucion({ ...itemSolucion, [field]: e.target.checked })}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                  {field.charAt(0).toUpperCase() + field.slice(1)}
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-between pt-2">
            <button type="button" onClick={() => setStep(2)} className="px-6 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition text-sm">
              Atrás
            </button>
            <button type="button" onClick={handleSubmit} disabled={loading}
              className="px-8 py-2.5 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 transition shadow-lg shadow-indigo-600/20 flex items-center gap-2 text-sm disabled:opacity-50">
              {loading ? 'PROCESANDO...' : <><Send className="w-4 h-4" /> GENERAR REPORTE Y ODP</>}
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default ReportarProblemaForm;
