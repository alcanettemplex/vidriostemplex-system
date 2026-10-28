import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { AlertCircle, MapPin, Plus, Ruler, Search, X } from '../../../components/ui/icons';

import API from '../../../services/config';
import { coincideBusqueda } from '../../../utils/busqueda';
import { getTmEstado } from './ODPFichaModal.utils';

// ─────────────────────────────────────────────────────────────────────────────
// "Relacionar TM existente" de la ficha ODP (2026-10-28).
//
// Hay del orden de 125 TM sin ODP (casi todas de prospectos en gestión), así que:
//   - buscador instantáneo, sin tildes, por número de TM, prospecto, cliente o
//     contacto, dirección y asesor (se filtra aquí: la lista es corta y liviana);
//   - arriba las TM del cliente de esta ODP, abajo el resto;
//   - confirmación dentro del modal que avisa si el prospecto sigue en gestión
//     (al aprobarlo después, su ODP nacería sin esta TM).
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  odp: any;
  onClose: () => void;
  onVinculada: () => void;
}

type TM = any;

const nombreProspecto = (tm: TM) => tm.prospecto?.cliente?.nombre_razon_social || tm.prospecto?.nombre_contacto || '';

const RelacionarTMModal: React.FC<Props> = ({ odp, onClose, onVinculada }) => {
  const [tms, setTms] = useState<TM[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [elegida, setElegida] = useState<TM | null>(null);
  const [vinculando, setVinculando] = useState(false);
  const buscadorRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    axios.get(`${API}/api/documentos/tm/sin-odp`)
      .then(r => setTms(r.data))
      .catch(e => setError(e?.response?.data?.error || 'No se pudieron cargar las tomas de medidas. Revisa tu conexión.'))
      .finally(() => { setCargando(false); setTimeout(() => buscadorRef.current?.focus(), 0); });
  }, []);

  const { delCliente, otras } = useMemo(() => {
    const filtradas = tms.filter(tm => coincideBusqueda(texto, [
      tm.numero_tm,
      tm.prospecto?.numero_prospecto,
      nombreProspecto(tm),
      tm.prospecto?.nombre_contacto,
      tm.direccion,
      tm.realizador?.nombre_completo,
      tm.prospecto?.descripcion,
    ]));
    const clienteOdp = Number(odp.cliente_id);
    const esDelCliente = (tm: TM) => clienteOdp > 0 && Number(tm.prospecto?.cliente_id ?? tm.prospecto?.cliente?.id) === clienteOdp;
    return { delCliente: filtradas.filter(esDelCliente), otras: filtradas.filter(tm => !esDelCliente(tm)) };
  }, [tms, texto, odp.cliente_id]);

  const vincular = async () => {
    if (!elegida || vinculando) return;
    setVinculando(true);
    try {
      await axios.patch(`${API}/api/documentos/tm/${elegida.id}/vincular-odp`, { odp_id: odp.id });
      toast.success(`${elegida.numero_tm} vinculada a ${odp.numero_odp}.`);
      onVinculada();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'No se pudo vincular la toma de medidas. Inténtalo de nuevo.');
      setVinculando(false);
    }
  };

  const tarjeta = (tm: TM) => (
    <div key={tm.id} className="border border-slate-200 rounded-xl p-4 mb-3 hover:border-sky-300 transition">
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <span className="font-bold text-amber-700">{tm.numero_tm}</span>
          <span className={`ml-2 text-xs font-semibold px-2 py-0.5 rounded-full ${getTmEstado(tm.estado).cls}`}>
            {getTmEstado(tm.estado).label}
          </span>
          {tm.prospecto && (
            <p className="text-xs text-sky-700 font-semibold mt-0.5">
              Prospecto: {tm.prospecto.numero_prospecto} — {nombreProspecto(tm)}
              {tm.prospecto.estado === 'no_aprobado' && <span className="ml-1 text-slate-700 font-normal">(no aprobado)</span>}
            </p>
          )}
          {tm.direccion && (
            <p className="text-xs text-slate-700 flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3 shrink-0" />{tm.direccion}
            </p>
          )}
          {tm.realizador && <p className="text-xs text-slate-700 mt-0.5">{tm.realizador.nombre_completo}</p>}
        </div>
        <button
          onClick={() => setElegida(tm)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> Vincular
        </button>
      </div>
    </div>
  );

  const titulo = (t: string, n: number) => (
    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-2 mt-1">{t} ({n})</p>
  );

  return (
    <div className="fixed inset-0 z-[1410] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <Ruler className="w-4 h-4 text-sky-600" /> Relacionar TM a {odp.numero_odp}
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        {elegida ? (
          <div className="p-5 space-y-4">
            <p className="text-sm text-slate-900">
              ¿Vincular <span className="font-bold text-amber-700">{elegida.numero_tm}</span> a <span className="font-bold">{odp.numero_odp}</span>
              {odp.cliente?.nombre_razon_social ? ` (${odp.cliente.nombre_razon_social})` : ''}?
            </p>
            {elegida.prospecto?.estado === 'en_gestion' && (
              <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Es del prospecto <span className="font-bold">{elegida.prospecto.numero_prospecto}</span> ({nombreProspecto(elegida)}), que sigue
                  en gestión. El prospecto no cambia: si se aprueba después, su ODP nacerá sin esta toma de medidas.
                </span>
              </p>
            )}
            {Number(odp.cliente_id) > 0 && elegida.prospecto?.cliente_id && Number(elegida.prospecto.cliente_id) !== Number(odp.cliente_id) && (
              <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                Esta toma de medidas es de otro cliente ({nombreProspecto(elegida)}). Verifica que sea la correcta.
              </p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setElegida(null)} disabled={vinculando}
                className="flex-1 py-2.5 font-bold text-slate-900 border border-slate-300 rounded-xl hover:bg-slate-50 transition text-sm">
                Volver a la lista
              </button>
              <button onClick={vincular} disabled={vinculando}
                className="flex-1 py-2.5 font-bold text-white bg-sky-600 rounded-xl hover:bg-sky-700 transition disabled:opacity-50 text-sm">
                {vinculando ? 'Vinculando...' : 'Vincular'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-4 pt-4">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={buscadorRef}
                  type="search"
                  value={texto}
                  onChange={e => setTexto(e.target.value)}
                  placeholder="Buscar por TM, prospecto, cliente, dirección o asesor"
                  className="h-10 w-full rounded-lg border border-slate-400 bg-white pl-9 pr-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {cargando ? (
                <p className="text-center text-slate-700 py-8">Cargando tomas de medidas…</p>
              ) : error ? (
                <p className="text-center text-rose-700 font-semibold py-8">{error}</p>
              ) : tms.length === 0 ? (
                <div className="text-center text-slate-700 py-8">
                  <Ruler className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <p className="font-medium">No hay tomas de medidas sin ODP asignada</p>
                </div>
              ) : delCliente.length + otras.length === 0 ? (
                <p className="text-center text-slate-700 py-8">Ninguna toma de medidas coincide con “{texto}”.</p>
              ) : (
                <>
                  {delCliente.length > 0 && (
                    <>
                      {titulo('Del cliente de esta ODP', delCliente.length)}
                      {delCliente.map(tarjeta)}
                    </>
                  )}
                  {otras.length > 0 && (
                    <>
                      {titulo(delCliente.length > 0 ? 'Otras tomas de medidas' : 'Tomas de medidas sin ODP', otras.length)}
                      {otras.map(tarjeta)}
                    </>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default RelacionarTMModal;
