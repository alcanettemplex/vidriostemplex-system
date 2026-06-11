import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import {
  RefreshCw, ChevronDown, ChevronUp, User, TrendingUp,
  TrendingDown, Minus, AlertTriangle, Snowflake, Activity,
  ArrowRight,
} from 'lucide-react';
import { apiGetEmbudoAsesores } from '../crmService';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Tramo {
  desde: string;
  hasta: string;
  leads_desde: number;
  leads_hasta: number;
  pct_conversion: number;
  perdidos_en_etapa: number;
  frios_en_etapa: number;
}

interface AsesorEmbudo {
  asesor_id: number;
  asesor_nombre: string;
  total_leads: number;
  total_aprobados: number;
  tasa_final: number;
  vs_equipo: number;
  tramos: Tramo[];
}

interface EmbудoData {
  asesores: AsesorEmbudo[];
  promedio_equipo: number;
}

interface Props {
  mes?: number;
  anio?: number;
}

// ─── Config visual ────────────────────────────────────────────────────────────
const ETAPA_LABEL: Record<string, string> = {
  ASIGNADO:       'Asignado',
  EN_CONTACTO:    'En Contacto',
  COTIZANDO:      'Cotizando',
  SEGUIMIENTO:    'Seguimiento',
  VISITA_TECNICA: 'V. Técnica',
  APROBADO:       'Aprobado',
};

const getPctColor = (pct: number) => {
  if (pct >= 70) return { bar: 'bg-emerald-500', text: 'text-emerald-700', light: 'bg-emerald-50 border-emerald-100' };
  if (pct >= 40) return { bar: 'bg-amber-500',   text: 'text-amber-700',   light: 'bg-amber-50 border-amber-100' };
  return              { bar: 'bg-red-500',        text: 'text-red-700',     light: 'bg-red-50 border-red-100' };
};

const getTasaFinalColor = (pct: number) => {
  if (pct >= 25) return 'text-emerald-600';
  if (pct >= 12) return 'text-amber-600';
  return 'text-red-600';
};

// ─── Fila de un tramo ─────────────────────────────────────────────────────────
const FilaTramo: React.FC<{ tramo: Tramo }> = ({ tramo }) => {
  const cfg = getPctColor(tramo.pct_conversion);
  const tieneCaidas = tramo.perdidos_en_etapa > 0 || tramo.frios_en_etapa > 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        {/* Etiqueta tramo */}
        <div className="flex items-center gap-1 shrink-0 w-48">
          <span className="text-[10px] font-bold text-slate-500 truncate">
            {ETAPA_LABEL[tramo.desde]}
          </span>
          <ArrowRight className="w-2.5 h-2.5 text-slate-300 shrink-0" />
          <span className="text-[10px] font-bold text-slate-700 truncate">
            {ETAPA_LABEL[tramo.hasta]}
          </span>
        </div>

        {/* Barra + porcentaje */}
        <div className="flex-1 flex items-center gap-2">
          <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${cfg.bar} transition-all duration-700`}
              style={{ width: tramo.leads_desde > 0 ? `${tramo.pct_conversion}%` : '0%' }}
            />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`text-xs font-black ${cfg.text}`}>
              {tramo.pct_conversion}%
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              {tramo.leads_hasta}/{tramo.leads_desde}
            </span>
          </div>
        </div>
      </div>

      {/* Caídas en esta etapa */}
      {tieneCaidas && (
        <div className="ml-48 flex items-center gap-3 pl-2 border-l-2 border-slate-100">
          {tramo.perdidos_en_etapa > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-red-500">
              <AlertTriangle className="w-2.5 h-2.5" />
              {tramo.perdidos_en_etapa} perdido{tramo.perdidos_en_etapa !== 1 ? 's' : ''} aquí
            </span>
          )}
          {tramo.frios_en_etapa > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-sky-500">
              <Snowflake className="w-2.5 h-2.5" />
              {tramo.frios_en_etapa} frio{tramo.frios_en_etapa !== 1 ? 's' : ''} aquí
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Card de un asesor ────────────────────────────────────────────────────────
const CardAsesor: React.FC<{ asesor: AsesorEmbudo; promedioEquipo: number }> = ({ asesor, promedioEquipo }) => {
  const [expandido, setExpandido] = useState(false);
  const tasaColor = getTasaFinalColor(asesor.tasa_final);

  const VsIcon = asesor.vs_equipo > 0
    ? <TrendingUp className="w-3 h-3" />
    : asesor.vs_equipo < 0
      ? <TrendingDown className="w-3 h-3" />
      : <Minus className="w-3 h-3" />;

  const vsColor = asesor.vs_equipo > 0
    ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
    : asesor.vs_equipo < 0
      ? 'text-red-500 bg-red-50 border-red-100'
      : 'text-slate-500 bg-slate-50 border-slate-100';

  // Barra resumen colapsada: ancho = tasa_final relativa al máximo posible
  const barResumen = Math.min(100, asesor.tasa_final * 2.5); // escala visual ~40% = buen resultado

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Header del card */}
      <div
        className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setExpandido(e => !e)}
      >
        <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
          <User className="w-4 h-4 text-indigo-600" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-black text-slate-800 truncate">{asesor.asesor_nombre}</p>
            <span className="text-[10px] font-bold text-slate-400">{asesor.total_leads} leads</span>
          </div>

          {/* Mini barra resumen (visible solo colapsado) */}
          {!expandido && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${getPctColor(asesor.tasa_final * 2.5).bar}`}
                  style={{ width: `${barResumen}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Tasa final + vs equipo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <p className={`text-xl font-black leading-none ${tasaColor}`}>
              {asesor.tasa_final}%
            </p>
            <p className="text-[9px] text-slate-400 font-bold mt-0.5">tasa final</p>
          </div>
          <div className={`flex items-center gap-0.5 px-2 py-1 rounded-lg border text-[10px] font-black ${vsColor}`}>
            {VsIcon}
            {asesor.vs_equipo > 0 ? '+' : ''}{asesor.vs_equipo}%
          </div>
          {expandido
            ? <ChevronUp className="w-4 h-4 text-slate-400" />
            : <ChevronDown className="w-4 h-4 text-slate-400" />
          }
        </div>
      </div>

      {/* Contenido expandido */}
      {expandido && (
        <div className="px-5 pb-5 pt-2 border-t border-slate-50 space-y-4">
          {/* Tramos del embudo */}
          <div className="space-y-3">
            {asesor.tramos.map(t => (
              <FilaTramo key={`${t.desde}-${t.hasta}`} tramo={t} />
            ))}
          </div>

          {/* Resumen de resultados */}
          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-50">
            <div className="text-center bg-emerald-50 border border-emerald-100 rounded-xl p-3">
              <p className="text-lg font-black text-emerald-700">{asesor.total_aprobados}</p>
              <p className="text-[9px] font-black text-emerald-500 uppercase tracking-wider mt-0.5">Aprobados</p>
            </div>
            <div className="text-center bg-slate-50 border border-slate-100 rounded-xl p-3">
              <p className="text-lg font-black text-slate-700">{asesor.total_leads}</p>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mt-0.5">Total leads</p>
            </div>
            <div className={`text-center border rounded-xl p-3 ${getPctColor(asesor.tasa_final * 2.5).light}`}>
              <p className={`text-lg font-black ${tasaColor}`}>{asesor.tasa_final}%</p>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mt-0.5">Conversión</p>
            </div>
          </div>

          {/* Comparativa con equipo */}
          <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-slate-50 rounded-xl px-3 py-2">
            <Activity className="w-3.5 h-3.5 shrink-0" />
            <span>Promedio del equipo: <strong className="text-slate-700">{promedioEquipo}%</strong></span>
            <span className={`ml-auto font-black ${vsColor.split(' ')[0]}`}>
              {asesor.vs_equipo > 0 ? '+' : ''}{asesor.vs_equipo}% vs equipo
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Componente principal ─────────────────────────────────────────────────────
const EmbudoAsesores: React.FC<Props> = ({ mes, anio }) => {
  const [datos, setDatos]   = useState<EmbудoData | null>(null);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiGetEmbudoAsesores(mes, anio);
      setDatos(data);
    } catch {
      toast.error('No se pudo cargar el embudo de conversión');
    } finally {
      setLoading(false);
    }
  }, [mes, anio]);

  useEffect(() => { cargar(); }, [cargar]);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 bg-white rounded-2xl border border-slate-100" />
        ))}
      </div>
    );
  }

  if (!datos || datos.asesores.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
        <Activity className="w-10 h-10 text-slate-200" />
        <p className="text-sm font-bold">Sin datos de conversión en este período</p>
        <button onClick={cargar} className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1">
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>
    );
  }

  const { asesores, promedio_equipo } = datos;

  return (
    <div className="space-y-4">
      {/* Header con leyenda y promedio */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-wider">
          <span className="flex items-center gap-1.5 text-emerald-600">
            <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> ≥70%
          </span>
          <span className="flex items-center gap-1.5 text-amber-600">
            <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" /> 40–69%
          </span>
          <span className="flex items-center gap-1.5 text-red-600">
            <span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> &lt;40%
          </span>
          <span className="text-slate-400 ml-2">
            Promedio equipo: <strong className="text-slate-700">{promedio_equipo}%</strong>
          </span>
        </div>
        <button
          onClick={cargar}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      {/* Cards — ordenados por tasa_final desc (viene así del backend) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {asesores.map(a => (
          <CardAsesor key={a.asesor_id} asesor={a} promedioEquipo={promedio_equipo} />
        ))}
      </div>
    </div>
  );
};

export default EmbudoAsesores;
