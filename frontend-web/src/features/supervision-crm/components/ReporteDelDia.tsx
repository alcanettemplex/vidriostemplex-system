import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Copy, RefreshCw, MessageSquare, CheckCircle2, Users } from '../../../components/ui/icons';
import { apiGetReporteDiario, apiRegistrarReporteDiario } from '../supervisionService';
import { GrupoReporte, ReporteDiario } from '../types';

const fmtPesos = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

type Modo = 'nuevos' | 'completo';

/**
 * Reporte diario de asesores: arma el mensaje para el grupo de WhatsApp con las reglas
 * de utils/reporteAsesores.ts (backend), deja editarlo, y al copiar registra el envío
 * como lineamiento del día para medir después si cada pendiente se resolvió.
 */
const ReporteDelDia: React.FC = () => {
  const [reporte, setReporte] = useState<ReporteDiario | null>(null);
  const [texto, setTexto] = useState('');
  const [modo, setModo] = useState<Modo>('nuevos');
  const [seleccion, setSeleccion] = useState<number[]>([]);
  // Responsables con pendientes hoy (lista estable para los filtros, de la carga sin filtro).
  const [responsables, setResponsables] = useState<GrupoReporte[]>([]);
  const [loading, setLoading] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiGetReporteDiario(seleccion, modo);
      setReporte(data);
      setTexto(data.mensaje);
      if (seleccion.length === 0) setResponsables(data.grupos);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'No se pudo armar el reporte del día. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [seleccion, modo]);

  useEffect(() => { cargar(); }, [cargar]);

  const toggleResponsable = (id: number | null) => {
    if (id === null) return;
    setSeleccion(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const copiarAlPortapapeles = async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      // Sin permiso de portapapeles: se deja el texto seleccionado para Ctrl+C.
      textareaRef.current?.focus();
      textareaRef.current?.select();
      return false;
    }
  };

  const handleCopiarYRegistrar = async () => {
    if (!reporte) return;
    const claves = reporte.grupos.flatMap(g => g.items.map(i => i.clave));
    setRegistrando(true);
    try {
      let registrados = 0;
      let parte = reporte.parte;
      if (claves.length > 0) {
        const { data } = await apiRegistrarReporteDiario(claves, seleccion);
        registrados = data.registrados;
        parte = data.parte;
      }
      const copiado = await copiarAlPortapapeles();
      const detalle = registrados > 0
        ? `Parte ${parte} registrada (${registrados} pendiente${registrados !== 1 ? 's' : ''}).`
        : 'No había pendientes nuevos para registrar.';
      if (copiado) toast.success(`Mensaje copiado. ${detalle}`);
      else toast.info(`${detalle} Tu navegador no dejó copiar: el texto quedó seleccionado, cópialo con Ctrl+C.`);
      if (registrados > 0) cargar();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'No se pudo registrar el envío, así que el mensaje no se copió. Intenta de nuevo.');
    } finally {
      setRegistrando(false);
    }
  };

  const editado = !!reporte && texto !== reporte.mensaje;
  const sinPendientes = !!reporte && reporte.grupos.length === 0;

  return (
    <div className="space-y-5">
      {/* Controles */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl px-4 py-3 shadow-apple">
        <div className="flex items-center gap-0.5 bg-apple-gray rounded-xl p-1">
          {([
            { key: 'nuevos', label: 'Solo lo nuevo de hoy' },
            { key: 'completo', label: 'Todo lo pendiente' },
          ] as { key: Modo; label: string }[]).map(m => (
            <button
              key={m.key}
              onClick={() => setModo(m.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                modo === m.key ? 'bg-white text-apple-text shadow-sm' : 'text-apple-text-secondary hover:text-apple-text'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={cargar}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-apple-gray hover:bg-apple-hairline text-apple-text text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </button>
          <button
            onClick={handleCopiarYRegistrar}
            disabled={registrando || loading || !reporte}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-apple-blue text-white text-xs font-semibold hover:bg-apple-blue/90 transition-colors disabled:opacity-50"
          >
            <Copy className="w-3.5 h-3.5" />
            {registrando ? 'Registrando...' : 'Copiar y registrar envío'}
          </button>
        </div>
      </div>

      {/* Filtro por responsable */}
      {responsables.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-white rounded-2xl px-4 py-3 shadow-apple">
          <Users className="w-4 h-4 text-apple-text-tertiary" />
          <button
            onClick={() => setSeleccion([])}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
              seleccion.length === 0 ? 'bg-apple-blue text-white border-apple-blue' : 'bg-white text-apple-text border-apple-hairline hover:bg-apple-gray'
            }`}
          >
            Todos
          </button>
          {responsables.filter(g => g.responsable_id !== null).map(g => {
            const activo = seleccion.includes(g.responsable_id as number);
            return (
              <button
                key={`${g.responsable_id}-${g.items[0]?.tipo === 'SIN_ASIGNAR' ? 'a' : 'r'}`}
                onClick={() => toggleResponsable(g.responsable_id)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  activo ? 'bg-apple-blue text-white border-apple-blue' : 'bg-white text-apple-text border-apple-hairline hover:bg-apple-gray'
                }`}
              >
                {g.items[0]?.tipo === 'SIN_ASIGNAR' ? `Sin asignar · ${g.nombre}` : g.nombre}
                <span className={activo ? 'text-white/80' : 'text-apple-text-tertiary'}> ({g.items.length})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Aviso de parte */}
      {reporte && modo === 'nuevos' && reporte.parte > 1 && !sinPendientes && (
        <p className="text-xs font-semibold text-apple-orange px-1">
          Hoy ya se envió {reporte.parte - 1 === 1 ? 'una parte' : `${reporte.parte - 1} partes`}: este mensaje es la parte {reporte.parte} y solo trae lo nuevo desde el envío anterior.
        </p>
      )}

      {/* Mensaje */}
      {loading && !reporte ? (
        <div className="flex items-center justify-center py-24 text-apple-text-tertiary gap-2 text-sm font-medium">
          <RefreshCw className="w-4 h-4 animate-spin" /> Armando el reporte...
        </div>
      ) : sinPendientes ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 bg-white rounded-3xl shadow-apple">
          <CheckCircle2 className="w-10 h-10 text-apple-green" />
          <p className="text-sm font-semibold text-apple-text">
            {modo === 'nuevos' && reporte?.parte && reporte.parte > 1
              ? 'No hay pendientes nuevos desde el último envío de hoy.'
              : 'No hay pendientes: el equipo está al día.'}
          </p>
        </div>
      ) : reporte && (
        <div className="bg-white rounded-3xl shadow-apple p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 className="flex items-center gap-2 text-base font-bold text-apple-text">
              <MessageSquare className="w-4 h-4 text-apple-blue" /> Mensaje para el grupo
            </h3>
            <span className="text-xs font-semibold text-apple-text-secondary">
              {reporte.totales.leads} leads · {reporte.totales.odps} ODP · {fmtPesos(reporte.totales.saldo)} por cobrar
            </span>
          </div>
          <textarea
            ref={textareaRef}
            value={texto}
            onChange={e => setTexto(e.target.value)}
            rows={Math.min(30, Math.max(10, texto.split('\n').length + 1))}
            className="w-full text-sm text-apple-text bg-apple-bg rounded-2xl p-4 outline-none resize-y font-mono leading-relaxed"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
            <p className="text-[11px] text-apple-text-secondary font-medium">
              Puedes editar el texto antes de copiar. Se registran como pendientes los {reporte.grupos.reduce((s, g) => s + g.items.length, 0)} ítems de la vista previa, no lo que edites.
            </p>
            {editado && (
              <button
                onClick={() => setTexto(reporte.mensaje)}
                className="text-[11px] font-semibold text-apple-blue hover:underline"
              >
                Restaurar texto original
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReporteDelDia;
