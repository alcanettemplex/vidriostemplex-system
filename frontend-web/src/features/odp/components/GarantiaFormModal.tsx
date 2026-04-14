import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { X, Shield, AlertTriangle, CheckCircle, Send } from 'lucide-react';
import { differenceInMonths, isValid } from 'date-fns';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface Props {
  odp: any; // ODP padre
  onClose: () => void;
  onCreada: (garantia: any) => void;
}

const GarantiaFormModal: React.FC<Props> = ({ odp, onClose, onCreada }) => {
  const token = localStorage.getItem('token');

  // Campos del formulario — pre-cargados de la ODP padre, todos editables
  const [descripcionProblema, setDescripcionProblema] = useState('');
  const [nombreRecibe, setNombreRecibe] = useState(odp?.nombre_recibe || odp?.cliente?.nombre_razon_social || '');
  const [telefonoRecibe, setTelefonoRecibe] = useState(odp?.telefono_recibe || odp?.cliente?.celular || odp?.cliente?.telefono || '');
  const [cargoRecibe, setCargoRecibe] = useState(odp?.cargo_recibe || '');
  const [tipoServicio, setTipoServicio] = useState(odp?.tipo_servicio || '');
  const [direccionInstalacion, setDireccionInstalacion] = useState(odp?.direccion_instalacion || odp?.cliente?.direccion || '');
  const [observaciones, setObservaciones] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [exito, setExito] = useState(false);
  const [garantiaCreada, setGarantiaCreada] = useState<any>(null);

  // Calcular si la garantía está vigente (6 meses desde fecha_entrega de la ODP padre)
  const garantiaVigente = (() => {
    if (!odp?.fecha_entrega) return null; // sin fecha no sabemos
    const fechaEntrega = new Date(odp.fecha_entrega);
    if (!isValid(fechaEntrega)) return null;
    const mesesTranscurridos = differenceInMonths(new Date(), fechaEntrega);
    return mesesTranscurridos <= 6;
  })();

  const handleSubmit = async () => {
    if (!descripcionProblema.trim()) {
      toast.error('La descripción del problema es obligatoria');
      return;
    }

    setEnviando(true);
    try {
      const res = await axios.post(
        `${API}/api/odp/${odp.id}/garantia`,
        {
          descripcion_problema: descripcionProblema.trim(),
          nombre_recibe: nombreRecibe.trim(),
          telefono_recibe: telefonoRecibe.trim(),
          cargo_recibe: cargoRecibe.trim(),
          tipo_servicio: tipoServicio.trim(),
          direccion_instalacion: direccionInstalacion.trim(),
          observaciones: observaciones.trim(),
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setGarantiaCreada(res.data.garantia);
      setExito(true);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al crear la garantía');
    } finally {
      setEnviando(false);
    }
  };

  const inputClass = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-400 outline-none transition';
  const labelClass = 'block text-[10px] font-black uppercase text-slate-400 mb-1 tracking-wider';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={!exito ? onClose : undefined} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="bg-blue-50 border-b border-blue-100 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-black text-slate-800 text-sm">NUEVA SOLICITUD DE GARANTÍA</p>
              <p className="text-[11px] text-blue-600 font-bold">{odp?.numero_odp} · {odp?.cliente?.nombre_razon_social}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-blue-100 rounded-xl text-slate-400 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {exito ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-9 h-9 text-blue-500" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800">Garantía Creada</h3>
              <p className="text-sm text-slate-500 mt-1">
                Se creó <span className="font-bold text-blue-700">{garantiaCreada?.numero_garantia}</span> vinculada a {odp?.numero_odp}.
              </p>
            </div>
            <button
              onClick={() => { onCreada(garantiaCreada); onClose(); }}
              className="mt-2 px-6 py-2.5 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700 transition text-sm"
            >
              Abrir Ficha de Garantía
            </button>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 p-6 space-y-4">

            {/* Aviso vigencia */}
            {garantiaVigente === false && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex gap-3 text-sm">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-800">Garantía posiblemente vencida</p>
                  <p className="text-amber-700 text-xs mt-0.5">
                    Han pasado más de 6 meses desde la instalación ({new Date(odp.fecha_entrega).toLocaleDateString('es-CO')}).
                    Puedes continuar si aplica garantía extendida o por criterio comercial.
                  </p>
                </div>
              </div>
            )}

            {garantiaVigente === true && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex gap-3 text-sm">
                <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <p className="text-emerald-700 font-medium">Garantía vigente — dentro de los 6 meses de instalación.</p>
              </div>
            )}

            {/* Descripción del problema */}
            <div>
              <label className={labelClass}>Descripción del problema reportado por el cliente *</label>
              <textarea
                rows={4}
                placeholder="Describe con detalle qué problema está reportando el cliente, en qué parte de la instalación, cuándo ocurrió..."
                className={inputClass}
                value={descripcionProblema}
                onChange={e => setDescripcionProblema(e.target.value)}
              />
            </div>

            <div className="border-t border-slate-100 pt-4">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-3">Datos de contacto (pre-cargados, editables)</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Persona que atiende</label>
                    <input type="text" className={inputClass} value={nombreRecibe} onChange={e => setNombreRecibe(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Teléfono</label>
                    <input type="text" className={inputClass} value={telefonoRecibe} onChange={e => setTelefonoRecibe(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Cargo</label>
                  <input type="text" className={inputClass} value={cargoRecibe} onChange={e => setCargoRecibe(e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Dirección de instalación</label>
                  <input type="text" className={inputClass} value={direccionInstalacion} onChange={e => setDireccionInstalacion(e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Tipo de producto / servicio</label>
                  <input type="text" className={inputClass} value={tipoServicio} onChange={e => setTipoServicio(e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Observaciones adicionales</label>
                  <textarea rows={2} className={inputClass} value={observaciones} onChange={e => setObservaciones(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Botones */}
            <div className="flex gap-3 pt-2 border-t border-slate-100">
              <button onClick={onClose} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition text-sm">
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={enviando}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl shadow-lg shadow-blue-100 transition flex items-center justify-center gap-2 text-sm disabled:opacity-50"
              >
                {enviando ? 'Creando...' : <><Send className="w-4 h-4" /> Crear Garantía</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GarantiaFormModal;
