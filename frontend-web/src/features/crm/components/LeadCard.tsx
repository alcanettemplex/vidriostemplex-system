import React, { useState } from 'react';
import { Phone, Tag, MapPin, Flag, Clock, Zap, UserCheck } from 'lucide-react';
import ConvertirClienteModal from './ConvertirClienteModal';

interface LeadCardProps {
  lead: any;
  stageId: string;
  rol: string;
  onTakeFromPool?: () => void;
}

const SEGMENTO_COLOR: Record<string, string> = {
  'Arquitecto':    'bg-violet-100 text-violet-700',
  'Cliente final': 'bg-blue-100 text-blue-700',
  'Industrial':    'bg-amber-100 text-amber-700',
  'Institucional': 'bg-emerald-100 text-emerald-700',
  'Intervid':      'bg-fuchsia-100 text-fuchsia-700',
};

const LeadCard: React.FC<LeadCardProps> = ({ lead, stageId, rol, onTakeFromPool }) => {
  const [showConvertir, setShowConvertir] = useState(false);
  const enAlerta = lead.intentos_seguimiento >= 2 &&
    !['PERDIDO', 'APROBADO', 'FRIO'].includes(lead.estado_crm);
  const esNuevo = stageId === 'NUEVO';
  const esAsesor = rol === 'asesor_comercial';
  const esAprobado = stageId === 'APROBADO';
  const yaConvertido = !!lead.cliente_id;
  const puedeConvertir = esAprobado && !yaConvertido && ['asesor_comercial', 'admin', 'gerencia'].includes(rol);

  // Fecha legible
  const fechaCreado = lead.createdAt
    ? new Date(lead.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
    : lead.creado || 'Nuevo';

  return (
    <div
      className={`relative p-3 bg-white rounded-lg shadow-sm border hover:shadow-md transition-all cursor-grab active:cursor-grabbing overflow-hidden group
        ${enAlerta ? 'border-orange-300' : stageId === 'APROBADO' ? 'border-emerald-300' : 'border-slate-200'}
      `}
    >
      {/* Barra lateral de estado */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${
        enAlerta ? 'bg-orange-400' :
        stageId === 'NUEVO' ? 'bg-indigo-400' :
        stageId === 'APROBADO' ? 'bg-emerald-500' :
        stageId === 'PERDIDO' ? 'bg-rose-400' :
        stageId === 'FRIO' ? 'bg-slate-300' :
        'bg-transparent'
      }`} />

      {/* Header */}
      <div className="flex justify-between items-start mb-2 pl-1">
        <h4 className="font-bold text-slate-800 text-sm leading-tight line-clamp-1 flex-1">
          {lead.nombre}
        </h4>
        {lead.asesor ? (
          <div
            className="w-6 h-6 rounded-full bg-indigo-100 border-2 border-white shadow-sm flex items-center justify-center text-[10px] font-black text-indigo-700 shrink-0 ml-2"
            title={`Asesor: ${lead.asesor.nombre_completo}`}
          >
            {lead.asesor.nombre_completo[0].toUpperCase()}
          </div>
        ) : (
          <span className="shrink-0 ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wider">
            Libre
          </span>
        )}
      </div>

      {/* Detalles */}
      <div className="space-y-1 text-xs text-slate-500 pl-1 mb-2">
        <div className="flex items-center gap-1.5 truncate">
          <Tag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="truncate font-medium text-slate-600">{lead.producto_interes || 'Sin definir'}</span>
        </div>
        <div className="flex items-center gap-1.5 truncate">
          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="font-mono text-slate-500">{lead.telefono}</span>
        </div>
        {lead.segmento && (
          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold mt-0.5 ${SEGMENTO_COLOR[lead.segmento] || 'bg-slate-100 text-slate-600'}`}>
            {lead.segmento}
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-dashed border-slate-100 pl-1">
        <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
          <Clock className="w-3 h-3" />
          {fechaCreado}
        </div>
        {/* Contador anti-fantasma */}
        {['EN_CONTACTO', 'COTIZANDO', 'VISITA_TECNICA'].includes(stageId) && (
          <div className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${
            enAlerta
              ? 'bg-orange-50 text-orange-600 border-orange-200 animate-pulse'
              : 'bg-slate-50 text-slate-500 border-slate-100'
          }`} title={`Intentos: ${lead.intentos_seguimiento}/3`}>
            <Flag className="w-2.5 h-2.5" />
            {lead.intentos_seguimiento}/3
          </div>
        )}
      </div>

      {/* Overlay hover con acciones */}
      <div className="absolute inset-0 bg-white/95 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-2 transition-all duration-150 rounded-lg">
        {esNuevo && esAsesor && onTakeFromPool ? (
          <button
            onClick={e => { e.stopPropagation(); onTakeFromPool(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow hover:bg-indigo-700 transition-colors"
          >
            <Zap className="w-3.5 h-3.5" />
            Tomar Lead
          </button>
        ) : null}
        {puedeConvertir && (
          <button
            onClick={e => { e.stopPropagation(); setShowConvertir(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg shadow hover:bg-emerald-700 transition-colors"
          >
            <UserCheck className="w-3.5 h-3.5" />
            Convertir a Cliente
          </button>
        )}
        {yaConvertido && esAprobado && (
          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-200">
            ✓ Ya es cliente
          </span>
        )}
        <span className="text-[10px] text-slate-400 font-medium">Arrastra para mover</span>
      </div>

      {showConvertir && (
        <ConvertirClienteModal
          lead={lead}
          onClose={() => setShowConvertir(false)}
        />
      )}
    </div>
  );
};

export default LeadCard;
