import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { AlertCircle, Ruler, X } from '../../../components/ui/icons';

import API from '../../../services/config';

// ─────────────────────────────────────────────────────────────────────────────
// "Solicitar TM" desde la ficha de la ODP (2026-10-28).
//
// Antes era un `window.confirm` que mandaba la dirección y el contacto de la ODP
// sin mostrarlos, y luego un `PUT /api/odp` aparte que forzaba VISITA_TECNICA en
// cualquier estado. Ahora se revisan los datos aquí y el backend (`createTM`) crea
// la TM y, solo si la ODP está En espera, la pasa a Visita técnica, todo en una
// transacción. Mismos campos que el "Solicitar visita" de Prospectos.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  odp: any;
  onClose: () => void;
  onCreada: () => void;
}

const CAMPO = 'w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500';
const ROTULO = 'block text-xs font-semibold text-slate-900 mb-1.5 uppercase tracking-wider';

const SolicitarTMODPModal: React.FC<Props> = ({ odp, onClose, onCreada }) => {
  const [form, setForm] = useState({
    direccion: odp.direccion_instalacion || odp.cliente?.direccion || '',
    nombre_contacto: odp.nombre_recibe || odp.cliente?.nombre_razon_social || '',
    telefono_contacto: odp.telefono_recibe || odp.cliente?.celular || odp.cliente?.telefono || '',
    observaciones: '',
  });
  const [enviando, setEnviando] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const existentes: string[] = (odp.tomas_medidas || []).map((t: any) => t.numero_tm).filter(Boolean);
  const pasaAVisita = odp.estado_produccion === 'EN_ESPERA';
  const valido = form.direccion.trim().length > 0;

  const solicitar = async () => {
    if (!valido || enviando) return;
    setEnviando(true);
    try {
      const { data } = await axios.post(`${API}/api/documentos/tm`, {
        odp_id: odp.id,
        direccion: form.direccion.trim(),
        nombre_contacto: form.nombre_contacto.trim(),
        telefono_contacto: form.telefono_contacto.trim(),
        observaciones: form.observaciones.trim() || null,
        medidas_json: [],
      });
      toast.success(
        data.estado_odp === 'VISITA_TECNICA' && pasaAVisita
          ? `${data.numero_tm} solicitada — ${odp.numero_odp} pasó a Visita técnica.`
          : `${data.numero_tm} solicitada — el jefe de producción la programará.`
      );
      onCreada();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'No se pudo solicitar la toma de medidas. Revisa tu conexión e inténtalo de nuevo.');
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1410] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-xl">
              <Ruler className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {existentes.length > 0 ? 'Solicitar otra toma de medidas' : 'Solicitar toma de medidas'}
              </h2>
              <p className="text-xs text-slate-700">{odp.numero_odp} · {odp.cliente?.nombre_razon_social || '—'}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar"><X className="w-5 h-5 text-slate-700" /></button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-800 bg-amber-50 border border-amber-100 rounded-xl p-3">
            Se creará una toma de medidas <span className="font-bold text-amber-700">Solicitada</span>; el jefe de producción le
            asignará fecha. {pasaAVisita
              ? <>La ODP pasará de En espera a <span className="font-bold">Visita técnica</span>.</>
              : <>La ODP sigue en su estado actual.</>}
          </p>
          {existentes.length > 0 && (
            <p className="text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              Esta ODP ya tiene {existentes.join(', ')}. Se creará otra toma de medidas aparte.
            </p>
          )}

          <div>
            <label className={ROTULO}>Dirección de la visita *</label>
            <input value={form.direccion} onChange={set('direccion')} placeholder="Dirección donde se realizará la visita..." className={CAMPO} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={ROTULO}>Contacto en obra</label>
              <input value={form.nombre_contacto} onChange={set('nombre_contacto')} placeholder="Nombre..." className={CAMPO} />
            </div>
            <div>
              <label className={ROTULO}>Teléfono</label>
              <input value={form.telefono_contacto} onChange={set('telefono_contacto')} placeholder="3001234567" className={CAMPO} />
            </div>
          </div>
          <div>
            <label className={ROTULO}>Observaciones para el técnico</label>
            <textarea
              value={form.observaciones}
              onChange={set('observaciones')}
              rows={3}
              placeholder="Acceso al sitio, qué medir, indicaciones especiales..."
              className={`${CAMPO} resize-none`}
            />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-3 font-bold text-slate-900 border border-slate-300 rounded-xl hover:bg-slate-50 transition text-sm">
            Cancelar
          </button>
          <button
            onClick={solicitar}
            disabled={!valido || enviando}
            className="flex-1 py-3 font-bold text-white bg-amber-600 rounded-xl hover:bg-amber-700 transition disabled:opacity-40 text-sm flex items-center justify-center gap-2"
          >
            <Ruler className="w-4 h-4" />
            {enviando ? 'Solicitando...' : 'Solicitar visita'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SolicitarTMODPModal;
