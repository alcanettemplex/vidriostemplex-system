import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Loader2, Building2, UserPlus, CheckCircle2, ExternalLink } from 'lucide-react';
import { toast } from 'react-toastify';
import { apiCrearODPDesdeLead, apiSearchClientes } from '../crmService';

interface Props {
  lead: any;
  onClose: () => void;
  onSuccess: (leadActualizado: any, numeroOdp: string) => void;
}

type Modo = 'existente' | 'nuevo';

const CrearODPModal: React.FC<Props> = ({ lead, onClose, onSuccess }) => {
  const [modo, setModo] = useState<Modo>('existente');
  const [creando, setCreando] = useState(false);

  // Modo existente
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<any[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<any>(null);
  const busquedaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modo nuevo
  const [nombreNuevo, setNombreNuevo] = useState(lead.nombre || '');
  const [telefonoNuevo, setTelefonoNuevo] = useState(lead.telefono || '');

  useEffect(() => {
    if (busquedaTimer.current) clearTimeout(busquedaTimer.current);
    if (!busqueda || busqueda.length < 2) { setResultados([]); return; }
    busquedaTimer.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const { data } = await apiSearchClientes(busqueda);
        setResultados(data?.rows ?? data ?? []);
      } catch {
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 300);
  }, [busqueda]);

  const handleCrear = async () => {
    if (modo === 'existente' && !clienteSeleccionado) {
      toast.warning('Selecciona un cliente de la lista');
      return;
    }
    if (modo === 'nuevo' && !telefonoNuevo.trim()) {
      toast.warning('El teléfono es requerido para crear el cliente');
      return;
    }

    setCreando(true);
    try {
      const body = modo === 'existente'
        ? { cliente_id: clienteSeleccionado.id }
        : { nombre: nombreNuevo.trim(), telefono: telefonoNuevo.trim() };

      const { data } = await apiCrearODPDesdeLead(lead.id, body);
      toast.success(`ODP ${data.numero_odp} creada y vinculada correctamente`);
      onSuccess(data.lead, data.numero_odp);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al crear la ODP');
    } finally {
      setCreando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-black text-slate-800">Crear ODP desde Lead</h2>
            <p className="text-[10px] text-slate-400 font-medium mt-0.5 truncate">Lead: {lead.nombre || `#${lead.id}`}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Toggle modo */}
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center gap-0 bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => setModo('existente')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                modo === 'existente' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" /> Cliente existente
            </button>
            <button
              onClick={() => setModo('nuevo')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                modo === 'nuevo' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" /> Cliente nuevo
            </button>
          </div>
        </div>

        {/* Contenido */}
        <div className="px-5 pb-4 space-y-3">

          {modo === 'existente' ? (
            <>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1.5">
                  Buscar cliente por nombre, teléfono o documento
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={busqueda}
                    onChange={e => { setBusqueda(e.target.value); setClienteSeleccionado(null); }}
                    placeholder="Ej: Construcciones ABC, 3001234567..."
                    className="w-full pl-8 pr-3 py-2.5 text-xs border border-slate-200 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300 transition-all"
                    autoFocus
                  />
                  {buscando && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 animate-spin" />}
                </div>
              </div>

              {/* Cliente seleccionado */}
              {clienteSeleccionado && (
                <div className="flex items-center gap-3 px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-emerald-800 truncate">{clienteSeleccionado.nombre_razon_social}</p>
                    <p className="text-[10px] text-emerald-600">{clienteSeleccionado.telefono || clienteSeleccionado.celular || '—'}</p>
                  </div>
                  <button onClick={() => { setClienteSeleccionado(null); setBusqueda(''); }} className="text-emerald-400 hover:text-emerald-600 flex-shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Resultados */}
              {!clienteSeleccionado && resultados.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm max-h-48 overflow-y-auto">
                  {resultados.map((c: any) => (
                    <button
                      key={c.id}
                      onClick={() => { setClienteSeleccionado(c); setResultados([]); }}
                      className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 transition-colors border-b border-slate-100 last:border-0 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-800 truncate">{c.nombre_razon_social}</p>
                        <p className="text-[9px] text-slate-400">{c.telefono || c.celular || c.numero_documento || '—'}</p>
                      </div>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full flex-shrink-0">
                        ID {c.id}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {busqueda.length >= 2 && !buscando && resultados.length === 0 && !clienteSeleccionado && (
                <p className="text-[10px] text-slate-400 text-center py-1">Sin resultados para "{busqueda}"</p>
              )}
            </>
          ) : (
            <>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1.5">
                  Nombre / Razón Social
                </label>
                <input
                  type="text"
                  value={nombreNuevo}
                  onChange={e => setNombreNuevo(e.target.value)}
                  placeholder="Ej: Juan García"
                  className="w-full px-3 py-2.5 text-xs border border-slate-200 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300 transition-all"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1.5">
                  Teléfono <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={telefonoNuevo}
                  onChange={e => setTelefonoNuevo(e.target.value)}
                  placeholder="Ej: 3001234567"
                  className="w-full px-3 py-2.5 text-xs border border-slate-200 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300 transition-all"
                />
              </div>
              <p className="text-[10px] text-slate-400">
                Si el teléfono ya existe en clientes, se vinculará al cliente existente automáticamente.
              </p>
            </>
          )}
        </div>

        {/* Info ODP */}
        <div className="mx-5 mb-4 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl">
          <p className="text-[10px] text-slate-500 font-bold">La ODP se creará en estado <span className="text-indigo-600">EN ESPERA</span>. Podrás completar los detalles desde el módulo Órdenes.</p>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleCrear}
            disabled={creando || (modo === 'existente' && !clienteSeleccionado) || (modo === 'nuevo' && !telefonoNuevo.trim())}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-black bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 rounded-xl transition-all active:scale-95 shadow-sm"
          >
            {creando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Crear ODP
          </button>
        </div>
      </div>
    </div>
  );
};

export default CrearODPModal;
