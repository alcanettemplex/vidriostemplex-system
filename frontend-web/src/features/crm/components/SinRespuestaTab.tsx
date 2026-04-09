import React, { useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import { PhoneMissed, RefreshCw, RotateCcw, MessageSquare, User, Phone, Tag, Calendar } from 'lucide-react';
import {
  fetchLeadsSinRespuestaStart,
  fetchLeadsSinRespuestaSuccess,
  moverLeadAlPipeline,
} from '../crmSlice';
import { apiGetLeads, apiMoverAlPipeline } from '../crmService';

const FUENTE_COLOR: Record<string, string> = {
  WhatsApp:   'bg-emerald-100 text-emerald-700',
  Facebook:   'bg-blue-100 text-blue-700',
  Instagram:  'bg-fuchsia-100 text-fuchsia-700',
  Web:        'bg-indigo-100 text-indigo-700',
  Llamada:    'bg-amber-100 text-amber-700',
  Presencial: 'bg-slate-100 text-slate-600',
  Otro:       'bg-gray-100 text-gray-600',
};

interface SinRespuestaTabProps {
  mes: number;
  anio: number;
}

const SinRespuestaTab: React.FC<SinRespuestaTabProps> = ({ mes, anio }) => {
  const dispatch = useDispatch();
  const { leadsSinRespuesta, loadingSinRespuesta } = useSelector((state: any) => state.crm);

  const cargar = useCallback(async () => {
    dispatch(fetchLeadsSinRespuestaStart());
    try {
      const { data } = await apiGetLeads(mes, anio, 'sin_respuesta');
      dispatch(fetchLeadsSinRespuestaSuccess(data));
    } catch {
      toast.error('No se pudieron cargar los leads sin respuesta.');
      dispatch(fetchLeadsSinRespuestaSuccess([]));
    }
  }, [dispatch, mes, anio]);

  useEffect(() => { cargar(); }, [cargar]);

  const handleRecuperar = async (lead: any) => {
    try {
      const { data } = await apiMoverAlPipeline(lead.id);
      dispatch(moverLeadAlPipeline(data));
      toast.success(`"${lead.nombre}" movido al pipeline.`);
    } catch {
      toast.error('No se pudo recuperar el lead.');
    }
  };

  // Resumen por fuente
  const porFuente: Record<string, number> = {};
  leadsSinRespuesta.forEach((l: any) => {
    const f = l.fuente_lead || 'Otro';
    porFuente[f] = (porFuente[f] || 0) + 1;
  });

  if (loadingSinRespuesta) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 text-sm gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Cargando leads sin respuesta...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Encabezado del tab */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
            <PhoneMissed className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="font-black text-slate-800 text-sm">Leads sin respuesta — {mes}/{anio}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {leadsSinRespuesta.length} lead{leadsSinRespuesta.length !== 1 ? 's' : ''} registrados que no mantuvieron comunicación.
              Usa <strong>"Recuperar"</strong> si eventualmente responden.
            </p>
          </div>
        </div>
        {/* Chips por fuente */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(porFuente).map(([fuente, count]) => (
            <span
              key={fuente}
              className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${FUENTE_COLOR[fuente] || 'bg-gray-100 text-gray-600'}`}
            >
              {fuente}: {count}
            </span>
          ))}
        </div>
        <button
          onClick={cargar}
          className="p-2 rounded-lg hover:bg-amber-100 text-amber-600 transition-colors self-start md:self-auto"
          title="Recargar"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {leadsSinRespuesta.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
          <PhoneMissed className="w-10 h-10 opacity-30" />
          <p className="text-sm font-medium">No hay leads sin respuesta en este periodo.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-widest">Contacto</th>
                <th className="text-left px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-widest">Fuente</th>
                <th className="text-left px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-widest">Producto</th>
                <th className="text-left px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-widest">Mensaje de entrada</th>
                <th className="text-left px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-widest">Fecha</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {leadsSinRespuesta.map((lead: any) => {
                const fecha = lead.createdAt
                  ? new Date(lead.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: '2-digit' })
                  : '—';

                return (
                  <tr key={lead.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    {/* Contacto */}
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 leading-tight">{lead.nombre}</p>
                          <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Phone className="w-2.5 h-2.5" /> {lead.telefono}
                          </p>
                        </div>
                      </div>
                    </td>
                    {/* Fuente */}
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${FUENTE_COLOR[lead.fuente_lead] || 'bg-gray-100 text-gray-600'}`}>
                        {lead.fuente_lead || '—'}
                      </span>
                    </td>
                    {/* Producto */}
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-600 flex items-center gap-1">
                        <Tag className="w-3 h-3 text-slate-400" />
                        {lead.producto_interes || '—'}
                      </span>
                    </td>
                    {/* Mensaje */}
                    <td className="px-4 py-3 max-w-xs">
                      {lead.mensaje_entrada ? (
                        <div className="flex items-start gap-1.5">
                          <MessageSquare className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                          <p className="text-xs text-slate-600 italic line-clamp-2">{lead.mensaje_entrada}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300 italic">Sin mensaje</span>
                      )}
                    </td>
                    {/* Fecha */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {fecha}
                      </span>
                    </td>
                    {/* Acción */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleRecuperar(lead)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-black rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100 transition-colors whitespace-nowrap"
                        title="Mover al pipeline"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Recuperar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default SinRespuestaTab;
