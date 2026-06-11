import React, { useMemo, useState } from 'react';
import { X, PhoneMissed, Clock, AlertTriangle } from 'lucide-react';

const ETAPA_LABELS: Record<string, string> = {
  NUEVO: 'Nuevo', ASIGNADO: 'Asignado', EN_CONTACTO: 'En Contacto',
  COTIZANDO: 'Cotizando', SEGUIMIENTO: 'Seguimiento', VISITA_TECNICA: 'V. Técnica',
  FRIO: 'Frío', APROBADO: 'Aprobado', PERDIDO: 'Perdido',
};

const ETAPA_COLORS: Record<string, string> = {
  NUEVO:          'bg-slate-100 text-slate-600',
  ASIGNADO:       'bg-blue-100 text-blue-700',
  EN_CONTACTO:    'bg-violet-100 text-violet-700',
  COTIZANDO:      'bg-amber-100 text-amber-700',
  SEGUIMIENTO:    'bg-teal-100 text-teal-700',
  VISITA_TECNICA: 'bg-indigo-100 text-indigo-700',
  FRIO:           'bg-sky-100 text-sky-700',
};

function diasSin(lead: any): number {
  const fuente = lead.ultima_actividad || lead.updatedAt || lead.createdAt;
  if (!fuente) return 0;
  return Math.floor((Date.now() - new Date(fuente).getTime()) / (1000 * 60 * 60 * 24));
}

function fmtFecha(f: string): string {
  if (!f) return '—';
  return new Date(f).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface Props { leads: any[]; onClose: () => void; }

const SinRespuestaModal: React.FC<Props> = ({ leads, onClose }) => {
  const grupos = useMemo(() => {
    const map: Record<string, { nombre: string; leads: any[] }> = {};
    leads.forEach(l => {
      const key = l.asesor_id ? String(l.asesor_id) : 'sin_asesor';
      const nombre = l.asesor?.nombre_completo || 'Sin Asesor';
      if (!map[key]) map[key] = { nombre, leads: [] };
      map[key].leads.push(l);
    });
    return Object.entries(map).sort(([ka, a], [kb, b]) => {
      if (ka === 'sin_asesor') return -1;
      if (kb === 'sin_asesor') return 1;
      return b.leads.length - a.leads.length;
    });
  }, [leads]);

  const [tabActivo, setTabActivo] = useState<string>(grupos[0]?.[0] || '');

  const leadsTab = grupos.find(([k]) => k === tabActivo)?.[1].leads || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center flex-shrink-0">
            <PhoneMissed className="w-4 h-4 text-rose-500" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-black text-slate-800">Leads sin Respuesta</h2>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
              {leads.length} lead{leads.length !== 1 ? 's' : ''} requieren seguimiento
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Tabs de asesores */}
        {grupos.length > 0 && (
          <div className="px-6 pt-3 border-b border-slate-100 overflow-x-auto flex-shrink-0">
            <div className="flex items-end gap-1 min-w-max">
              {grupos.map(([key, { nombre, leads: ls }]) => (
                <button
                  key={key}
                  onClick={() => setTabActivo(key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-xs font-bold transition-all border-b-2 whitespace-nowrap ${
                    tabActivo === key
                      ? 'text-rose-600 border-rose-500 bg-rose-50/50'
                      : 'text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {nombre}
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                    tabActivo === key ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {ls.length}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Lista de leads */}
        <div className="flex-1 overflow-auto">
          {leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <PhoneMissed className="w-10 h-10 text-slate-200" />
              <p className="text-slate-400 text-sm font-semibold">Sin leads sin respuesta en este periodo</p>
            </div>
          ) : leadsTab.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-slate-300 text-sm font-semibold">
              Sin leads en esta sección
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-100 z-10">
                <tr>
                  <th className="text-left px-5 py-3 text-[11px] font-black text-slate-400 uppercase tracking-wider">Nombre</th>
                  <th className="text-left px-4 py-3 text-[11px] font-black text-slate-400 uppercase tracking-wider">Teléfono</th>
                  <th className="text-left px-4 py-3 text-[11px] font-black text-slate-400 uppercase tracking-wider">Fecha Ingreso</th>
                  <th className="text-left px-4 py-3 text-[11px] font-black text-slate-400 uppercase tracking-wider">Etapa</th>
                  <th className="text-left px-4 py-3 text-[11px] font-black text-slate-400 uppercase tracking-wider">Sin actividad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {leadsTab.map((l: any) => {
                  const dias = diasSin(l);
                  return (
                    <tr key={l.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-slate-800">{l.nombre || '—'}</td>
                      <td className="px-4 py-3.5 text-slate-500 font-mono text-xs">{l.telefono || '—'}</td>
                      <td className="px-4 py-3.5 text-slate-500 text-xs whitespace-nowrap">{fmtFecha(l.createdAt)}</td>
                      <td className="px-4 py-3.5">
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${ETAPA_COLORS[l.estado_crm] || 'bg-slate-100 text-slate-600'}`}>
                          {ETAPA_LABELS[l.estado_crm] || l.estado_crm || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          {dias >= 7
                            ? <AlertTriangle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                            : dias >= 3
                            ? <Clock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                            : null}
                          <span className={`text-xs font-black ${
                            dias >= 7 ? 'text-rose-600' : dias >= 3 ? 'text-amber-600' : 'text-slate-500'
                          }`}>
                            {dias === 0 ? 'Hoy' : `${dias}d`}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-5 text-[11px] font-bold text-slate-400">
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-rose-500" /> ≥7 días — crítico
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-amber-500" /> 3-6 días — atención
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default SinRespuestaModal;
