import React, { useEffect, useState } from 'react';
import { AlertCircle, Info, Loader2, RefreshCw } from '../../ui/icons';
import FiltrosBarra from './cotizaciones/FiltrosBarra';
import BloqueKpis from './cotizaciones/BloqueKpis';
import BloqueEmbudo from './cotizaciones/BloqueEmbudo';
import BloqueAsesores from './cotizaciones/BloqueAsesores';
import BloqueProductos from './cotizaciones/BloqueProductos';
import BloqueSeguimiento from './cotizaciones/BloqueSeguimiento';
import { TituloSeccion } from './cotizaciones/Piezas';
import { filtrosIniciales, useCotizacionesDashboard } from './cotizaciones/useCotizacionesDashboard';
import type { FiltrosCotizaciones } from './cotizaciones/tipos';

/**
 * Pestaña "Cotizaciones" del Dashboard gerencial (rediseño 2026-09-27).
 *
 * Lee el Cotizador nuevo (`GET /api/dashboard/cotizaciones`) con sus propios filtros:
 * el selector de periodo del encabezado del dashboard no aplica aquí. El alcance lo
 * impone el backend: control total ve todo; un asesor comercial, solo lo suyo.
 */
export const PanelCotizaciones: React.FC = () => {
  const [filtros, setFiltros] = useState<FiltrosCotizaciones>(filtrosIniciales);
  const { datos, cargando, error, recargar, descargarExcel, descargando } = useCotizacionesDashboard(filtros);

  // Opciones de asesor: se conservan entre recargas para que el selector no parpadee.
  const [asesores, setAsesores] = useState<Array<{ id: number; nombre: string }> | null>(null);
  useEffect(() => {
    if (datos?.alcance.nivel === 'total') setAsesores(datos.asesores);
    else if (datos) setAsesores(null);
  }, [datos]);

  const propio = datos?.alcance.nivel === 'propias';

  return (
    <div className="space-y-5">
      <FiltrosBarra filtros={filtros} onChange={setFiltros} asesores={asesores} onExcel={descargarExcel} descargando={descargando} />

      {propio && (
        <p className="flex items-start gap-2 text-[13px] text-templex-900 bg-templex-50 ring-1 ring-templex-100 rounded-xl px-3 py-2">
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-templex-600" />
          Estás viendo solo tus cotizaciones (las que tienes asignadas como asesor).
        </p>
      )}

      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-[13px] text-rose-800 bg-rose-50 ring-1 ring-rose-200 rounded-xl px-3 py-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span className="flex-1 min-w-[200px]">{error}</span>
          <button type="button" onClick={recargar} className="inline-flex items-center gap-1 font-semibold text-rose-800 hover:underline">
            <RefreshCw className="w-3.5 h-3.5" /> Reintentar
          </button>
        </div>
      )}

      {!datos ? (
        cargando ? (
          <div className="space-y-4" aria-busy="true" aria-label="Cargando tablero de cotizaciones">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[140px] rounded-2xl bg-white border border-slate-200 animate-pulse" />)}
            </div>
            <div className="h-[320px] rounded-2xl bg-white border border-slate-200 animate-pulse" />
          </div>
        ) : null
      ) : (
        <div className={`space-y-5 transition-opacity ${cargando ? 'opacity-60' : ''}`}>
          {cargando && (
            <p className="flex items-center gap-2 text-[12px] text-slate-700"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Actualizando…</p>
          )}

          <TituloSeccion numero={1} titulo="Indicadores" detalle="Valores con IVA de la opción elegida de cada cotización." />
          <BloqueKpis datos={datos} />

          {datos.kpis.sin_valor > 0 && (
            <p className="flex items-start gap-2 text-[12px] text-amber-900 bg-amber-50 ring-1 ring-amber-200 rounded-xl px-3 py-2">
              <Info className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
              {datos.kpis.sin_valor} cotización{datos.kpis.sin_valor === 1 ? '' : 'es'} sin opción elegida (o en $0): cuentan en cantidad pero suman $0 al valor.
            </p>
          )}

          <TituloSeccion numero={2} titulo="Embudo y conversión" detalle="Cuántas se convierten y cuánto vale lo que se vende." />
          <BloqueEmbudo datos={datos} />

          <TituloSeccion numero={3} titulo={propio ? 'Tu desempeño' : 'Por asesor'} />
          <BloqueAsesores datos={datos} />

          <TituloSeccion numero={4} titulo="Por producto y segmento" detalle="Qué se cotiza y qué se vende más." />
          <BloqueProductos datos={datos} />

          <TituloSeccion numero={5} titulo="Seguimiento" detalle="Lo que hay que mover hoy." />
          <BloqueSeguimiento datos={datos} />

          <p className="text-[11px] text-slate-700 text-right">
            Datos al {new Date(datos.generado_en).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })} · se actualizan cada 5 minutos como máximo.
          </p>
        </div>
      )}
    </div>
  );
};

export default PanelCotizaciones;
