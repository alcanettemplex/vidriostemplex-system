import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import API from '../../../services/config';
import { PackageCheck, AlertTriangle, Camera, X } from '../../../components/ui/icons';

const MAX_FOTOS = 10;

export interface CierreAtascada {
  motivo: string;
  fotos: File[];
  /** Solo con fotos: a nombre de quién quedan las evidencias. */
  instaladorId: number | null;
}

/**
 * Cierre administrativo de una instalación que quedó sin cerrar.
 *
 * Las fotos son opcionales (2026-10-26). Con fotos, se registran como evidencia a nombre
 * del instalador elegido (por defecto, el de la ruta) y el motivo es opcional. Sin fotos,
 * el motivo es la única trazabilidad: queda en `historial_estados_odp` junto al usuario
 * que cerró, y el backend rechaza uno de menos de 5 caracteres; aquí se valida igual.
 */
const CerrarAtascadaModal: React.FC<{
  numeroOdp: string;
  cliente?: string | null;
  instaladorSugeridoId?: number | null;
  guardando?: boolean;
  onCancelar: () => void;
  onConfirmar: (cierre: CierreAtascada) => void;
}> = ({ numeroOdp, cliente, instaladorSugeridoId, guardando = false, onCancelar, onConfirmar }) => {
  const [motivo, setMotivo] = useState('');
  const [fotos, setFotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [instaladores, setInstaladores] = useState<{ id: number; nombre_completo: string }[]>([]);
  const [instaladorId, setInstaladorId] = useState<number | null>(instaladorSugeridoId ?? null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    axios.get(`${API}/api/rutas/personal`, { headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` } })
      .then(({ data }) => setInstaladores((data as any[]).filter(u => u.rol === 'instalador')))
      .catch(() => setInstaladores([]));
  }, []);

  // Liberar las miniaturas al cerrar la ventana
  const previewsRef = useRef(previews);
  previewsRef.current = previews;
  useEffect(() => () => previewsRef.current.forEach(u => URL.revokeObjectURL(u)), []);

  const agregarFotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nuevas = Array.from(e.target.files ?? []).slice(0, MAX_FOTOS - fotos.length);
    e.target.value = '';
    setFotos(prev => [...prev, ...nuevas]);
    setPreviews(prev => [...prev, ...nuevas.map(f => URL.createObjectURL(f))]);
  };
  const quitarFoto = (i: number) => {
    URL.revokeObjectURL(previews[i]);
    setFotos(prev => prev.filter((_, j) => j !== i));
    setPreviews(prev => prev.filter((_, j) => j !== i));
  };

  const conFotos = fotos.length > 0;
  const valido = conFotos ? instaladorId != null : motivo.trim().length >= 5;
  const textoBoton = guardando
    ? (conFotos ? 'Subiendo fotos…' : 'Cerrando…')
    : (conFotos ? `Confirmar entrega con ${fotos.length} ${fotos.length === 1 ? 'foto' : 'fotos'}` : 'Cerrar sin fotos');

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
            <PackageCheck className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-slate-900 text-sm">Marcar como entregada</p>
            <p className="text-xs text-slate-700 truncate">{numeroOdp}{cliente ? ` — ${cliente}` : ''}</p>
          </div>
        </div>

        {/* Fotos de la entrega */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-900">Fotos de la entrega</p>
            <span className="text-[11px] text-slate-700 font-medium">{fotos.length}/{MAX_FOTOS}</span>
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={agregarFotos} />
          {previews.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mb-2">
              {previews.map((src, i) => (
                <div key={src} className="relative rounded-xl overflow-hidden border border-slate-200 aspect-square">
                  <img src={src} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                  <button onClick={() => quitarFoto(i)} disabled={guardando} aria-label={`Quitar foto ${i + 1}`}
                    className="absolute top-1 right-1 p-1 rounded-full bg-slate-900/60 text-white hover:bg-red-600 disabled:opacity-50">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {fotos.length < MAX_FOTOS && (
            <button onClick={() => fileRef.current?.click()} disabled={guardando}
              className="w-full h-16 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center gap-2 text-slate-700 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all disabled:opacity-50">
              <Camera className="w-5 h-5" />
              <span className="text-xs font-medium">{conFotos ? 'Agregar más fotos' : 'Agregar fotos (opcional)'}</span>
            </button>
          )}
        </div>

        {conFotos ? (
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-900 mb-1">
              Instalador que hizo la instalación *
            </label>
            <select
              value={instaladorId ?? ''}
              onChange={e => setInstaladorId(e.target.value ? Number(e.target.value) : null)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
            >
              <option value="">Elige el instalador…</option>
              {instaladores.map(u => (
                <option key={u.id} value={u.id}>
                  {u.nombre_completo}{u.id === instaladorSugeridoId ? ' (de la ruta)' : ''}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-700 mt-1">Las fotos quedan como evidencia a su nombre.</p>
          </div>
        ) : (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-[11px] text-amber-800">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
            <span>
              Cierre <b>sin evidencia fotográfica</b>. Úsalo solo si la instalación realmente se
              realizó y no hay fotos disponibles.
            </span>
          </div>
        )}

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-900 mb-1">
            Motivo del cierre {conFotos ? '(opcional)' : '*'}
          </label>
          <textarea
            rows={3}
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder="Ej. Instalada el 12/06, el instalador no cerró en la app. Confirmado con el cliente."
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-none"
          />
          <p className="text-[11px] text-slate-700 mt-1">
            Queda registrado en el historial de la ODP con tu usuario.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancelar}
            disabled={guardando}
            className="flex-1 py-2.5 bg-slate-100 text-slate-900 font-semibold text-sm rounded-xl hover:bg-slate-200 transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => valido && onConfirmar({ motivo: motivo.trim(), fotos, instaladorId: conFotos ? instaladorId : null })}
            disabled={!valido || guardando}
            className="flex-1 py-2.5 bg-emerald-600 text-white font-semibold text-sm rounded-xl hover:bg-emerald-700 transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {textoBoton}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CerrarAtascadaModal;
