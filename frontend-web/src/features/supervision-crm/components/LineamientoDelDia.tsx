import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { CheckCircle2, Circle, RefreshCw, Sparkles, ChevronLeft, ChevronRight, NotebookPen } from 'lucide-react';
import {
  apiGenerarLineamiento, apiGetLineamiento, apiMarcarItemLineamiento,
  apiGuardarNotasLineamiento, apiGetAdherenciaLineamiento,
} from '../supervisionService';
import { Lineamiento, LineamientoItem } from '../types';

const PRIORIDAD_BADGE: Record<string, string> = {
  alta: 'bg-apple-red/10 text-apple-red',
  media: 'bg-apple-orange/10 text-apple-orange',
  baja: 'bg-apple-green/10 text-apple-green',
};

const ORIGEN_LABEL: Record<string, string> = {
  PRIMER_CONTACTO: 'Primer Contacto',
  ALTO_VALOR: 'Alto Valor',
  SEGUIMIENTO: 'Seguimiento',
  MANUAL: 'Manual',
};

const PRIORIDAD_RANK: Record<string, number> = { alta: 0, media: 1, baja: 2 };

// Aritmética de fecha "a salvo" de husos horarios: se ancla al mediodía para
// que sumar/restar un día nunca cruce un límite de DST/UTC y cambie el día.
function sumarDias(fechaISO: string, delta: number): string {
  const d = new Date(`${fechaISO}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().split('T')[0];
}

interface Props {
  asesorId?: number;
  asesorNombre?: string;
}

const LineamientoDelDia: React.FC<Props> = ({ asesorId, asesorNombre }) => {
  const [fechaCursor, setFechaCursor] = useState<string | null>(null);
  const [lineamiento, setLineamiento] = useState<Lineamiento | null>(null);
  const [loading, setLoading] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [notas, setNotas] = useState('');
  const [guardandoNotas, setGuardandoNotas] = useState(false);
  const [adherencia, setAdherencia] = useState<{ pct_adherencia: number } | null>(null);

  const cargar = useCallback(async () => {
    if (!asesorId) return;
    setLoading(true);
    try {
      const { data } = await apiGetLineamiento(asesorId, fechaCursor || undefined);
      setLineamiento(data);
      setNotas(data?.notas_sesion || '');
      if (data?.fecha) setFechaCursor(data.fecha);
    } catch {
      toast.error('No se pudo cargar el lineamiento.');
    } finally {
      setLoading(false);
    }
  }, [asesorId, fechaCursor]);

  const cargarAdherencia = useCallback(async () => {
    if (!asesorId) return;
    try {
      const hasta = fechaCursor || new Date().toISOString().split('T')[0];
      const desde = sumarDias(hasta, -7);
      const { data } = await apiGetAdherenciaLineamiento({ fecha_desde: desde, fecha_hasta: hasta, asesor_id: asesorId });
      setAdherencia(data);
    } catch {
      setAdherencia(null);
    }
  }, [asesorId, fechaCursor]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { cargarAdherencia(); }, [cargarAdherencia]);

  if (!asesorId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-apple-text-tertiary">
        <NotebookPen className="w-10 h-10" />
        <p className="text-sm font-semibold text-apple-text-secondary">Selecciona un asesor arriba para ver o generar su lineamiento del día.</p>
      </div>
    );
  }

  const fechaBase = fechaCursor || lineamiento?.fecha || new Date().toISOString().split('T')[0];

  const handleGenerar = async () => {
    setGenerando(true);
    try {
      await apiGenerarLineamiento(asesorId);
      toast.success('Lineamiento actualizado.');
      setFechaCursor(null);
      await cargar();
      await cargarAdherencia();
    } catch {
      toast.error('No se pudo generar el lineamiento.');
    } finally {
      setGenerando(false);
    }
  };

  const handleToggle = async (item: LineamientoItem) => {
    const nuevoValor = !item.cumplido;
    try {
      await apiMarcarItemLineamiento(item.id, nuevoValor);
      setLineamiento(prev => prev ? {
        ...prev,
        items: prev.items.map(i => i.id === item.id ? { ...i, cumplido: nuevoValor } : i),
      } : prev);
      cargarAdherencia();
    } catch {
      toast.error('No se pudo actualizar el ítem.');
    }
  };

  const handleGuardarNotas = async () => {
    if (!lineamiento) return;
    setGuardandoNotas(true);
    try {
      await apiGuardarNotasLineamiento(lineamiento.id, notas);
      toast.success('Notas de la sesión guardadas.');
    } catch {
      toast.error('No se pudieron guardar las notas.');
    } finally {
      setGuardandoNotas(false);
    }
  };

  const items = (lineamiento?.items || []).slice().sort((a, b) => PRIORIDAD_RANK[a.prioridad] - PRIORIDAD_RANK[b.prioridad]);
  const cumplidos = items.filter(i => i.cumplido).length;

  return (
    <div className="space-y-5">
      {/* Header: navegación de día + generar + adherencia */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl px-4 py-3 shadow-apple">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFechaCursor(sumarDias(fechaBase, -1))}
            className="w-8 h-8 rounded-full bg-apple-gray hover:bg-apple-hairline flex items-center justify-center text-apple-text-secondary transition-colors"
            title="Día anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-apple-text min-w-[110px] text-center">{fechaBase}</span>
          <button
            onClick={() => setFechaCursor(sumarDias(fechaBase, 1))}
            className="w-8 h-8 rounded-full bg-apple-gray hover:bg-apple-hairline flex items-center justify-center text-apple-text-secondary transition-colors"
            title="Día siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-3">
          {adherencia && (
            <span className="text-xs font-semibold text-apple-text-secondary">
              Adherencia 7d:{' '}
              <span className={
                adherencia.pct_adherencia >= 70 ? 'text-apple-green'
                  : adherencia.pct_adherencia >= 40 ? 'text-apple-orange' : 'text-apple-red'
              }>
                {adherencia.pct_adherencia}%
              </span>
            </span>
          )}
          <button
            onClick={handleGenerar}
            disabled={generando}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-apple-blue text-white text-xs font-semibold hover:bg-apple-blue/90 transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {generando ? 'Generando...' : 'Generar / Actualizar lineamiento de hoy'}
          </button>
        </div>
      </div>

      {/* Checklist de acciones */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-apple-text-tertiary gap-2 text-sm font-medium">
          <RefreshCw className="w-4 h-4 animate-spin" /> Cargando lineamiento...
        </div>
      ) : !lineamiento || items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-apple-text-tertiary bg-white rounded-3xl shadow-apple">
          <CheckCircle2 className="w-10 h-10" />
          <p className="text-sm font-semibold text-apple-text-secondary">
            {lineamiento
              ? 'Sin acciones urgentes para este día — buena señal.'
              : 'Aún no se ha generado el lineamiento de este día.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl shadow-apple p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold text-apple-text">Lineamiento — {asesorNombre || 'Asesor'}</h3>
            <span className="text-xs font-semibold text-apple-text-tertiary">{cumplidos}/{items.length} cumplidos</span>
          </div>
          <div className="space-y-2">
            {items.map(item => (
              <button
                key={item.id}
                onClick={() => handleToggle(item)}
                className={`w-full flex items-center gap-3 text-left px-4 py-3 rounded-2xl border transition-colors ${
                  item.cumplido ? 'bg-apple-green/5 border-apple-green/20' : 'bg-apple-bg border-transparent hover:bg-apple-gray'
                }`}
              >
                {item.cumplido
                  ? <CheckCircle2 className="w-5 h-5 text-apple-green shrink-0" />
                  : <Circle className="w-5 h-5 text-apple-text-tertiary shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold truncate ${item.cumplido ? 'text-apple-text-tertiary line-through' : 'text-apple-text'}`}>
                    {item.lead?.nombre || 'Lead'} — {item.texto_accion}
                  </p>
                  <p className="text-[11px] text-apple-text-tertiary font-medium">
                    {ORIGEN_LABEL[item.origen]}{item.lead?.telefono ? ` · ${item.lead.telefono}` : ''}
                  </p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 uppercase ${PRIORIDAD_BADGE[item.prioridad]}`}>
                  {item.prioridad}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Notas de la sesión de coaching presencial */}
      {lineamiento && (
        <div className="bg-white rounded-3xl shadow-apple p-6">
          <h3 className="text-base font-bold text-apple-text mb-3">Notas de la sesión de coaching</h3>
          <textarea
            value={notas}
            onChange={e => setNotas(e.target.value)}
            rows={4}
            placeholder="Observaciones del acompañamiento presencial: objeciones frecuentes, compromisos verbales, plan del asesor para hoy..."
            className="w-full text-sm text-apple-text bg-apple-bg rounded-2xl p-4 outline-none resize-none placeholder:text-apple-text-tertiary"
          />
          <div className="flex justify-end mt-3">
            <button
              onClick={handleGuardarNotas}
              disabled={guardandoNotas}
              className="px-4 py-2 rounded-xl bg-apple-blue text-white text-xs font-semibold hover:bg-apple-blue/90 transition-colors disabled:opacity-50"
            >
              {guardandoNotas ? 'Guardando...' : 'Guardar notas'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LineamientoDelDia;
