import React from 'react';
import { Download, Filter, Loader2, RotateCcw, Search } from '../../../ui/icons';
import type { EstadoCotizacion, FiltrosCotizaciones, ModuloCotizador, Segmento } from './tipos';
import { NOMBRE_ESTADO, NOMBRE_MODULO, NOMBRE_SEGMENTO } from './tipos';
import { hoyISO } from './formato';
import { filtrosIniciales } from './useCotizacionesDashboard';
import { sumarDiasISO } from '../../../../utils/fechas';

interface Props {
  filtros: FiltrosCotizaciones;
  onChange: (f: FiltrosCotizaciones) => void;
  /** Control total: puede filtrar por asesor. Un asesor solo ve lo suyo. */
  asesores: Array<{ id: number; nombre: string }> | null;
  onExcel: () => void;
  descargando: boolean;
}

const CAMPO = 'h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-[13px] text-slate-900 outline-none focus:border-templex-500 focus:ring-2 focus:ring-templex-100';
const ROTULO = 'block text-[11px] font-semibold uppercase tracking-wide text-slate-900 mb-1';

/** Rangos rápidos de fecha (fecha de creación de la cotización). */
function rango(tipo: 'mes' | '90' | 'anio' | 'anio_ant'): { desde: string; hasta: string } {
  const hoy = hoyISO();
  const [a, m] = hoy.split('-').map(Number);
  if (tipo === 'mes') return { desde: `${a}-${String(m).padStart(2, '0')}-01`, hasta: hoy };
  if (tipo === 'anio') return { desde: `${a}-01-01`, hasta: hoy };
  if (tipo === 'anio_ant') return { desde: `${a - 1}-01-01`, hasta: `${a - 1}-12-31` };
  return { desde: sumarDiasISO(hoy, -89), hasta: hoy };
}

const RANGOS: Array<{ id: 'mes' | '90' | 'anio' | 'anio_ant'; label: string }> = [
  { id: 'mes', label: 'Este mes' },
  { id: '90', label: '90 días' },
  { id: 'anio', label: 'Este año' },
  { id: 'anio_ant', label: 'Año anterior' },
];

export const FiltrosBarra: React.FC<Props> = ({ filtros, onChange, asesores, onExcel, descargando }) => {
  const set = <K extends keyof FiltrosCotizaciones>(k: K, v: FiltrosCotizaciones[K]) => onChange({ ...filtros, [k]: v });
  const base = filtrosIniciales();
  const activos = (Object.keys(filtros) as Array<keyof FiltrosCotizaciones>).filter(
    (k) => k !== 'desde' && k !== 'hasta' && filtros[k] !== base[k]
  ).length;
  const rangoActivo = RANGOS.find((r) => {
    const x = rango(r.id);
    return x.desde === filtros.desde && x.hasta === filtros.hasta;
  })?.id;

  return (
    <section
      aria-label="Filtros del tablero de cotizaciones"
      className="bg-white/95 backdrop-blur border border-slate-200 rounded-2xl shadow-card p-4 lg:sticky lg:top-16 z-20"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-templex-600" />
          <h2 className="text-[14px] font-semibold text-slate-900">Filtros</h2>
          {activos > 0 && (
            <span className="text-[11px] font-semibold bg-templex-50 text-templex-700 ring-1 ring-templex-100 rounded-full px-2 py-0.5">
              {activos} activo{activos === 1 ? '' : 's'}
            </span>
          )}
          <span className="hidden md:inline text-[12px] text-slate-700">Todo el tablero y el Excel responden a estos filtros.</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...base, desde: filtros.desde, hasta: filtros.hasta })}
            disabled={activos === 0}
            className="h-9 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-[12px] font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Limpiar
          </button>
          <button
            type="button"
            onClick={onExcel}
            disabled={descargando}
            className="h-9 inline-flex items-center gap-1.5 rounded-lg bg-templex-600 px-3.5 text-[12px] font-semibold text-white shadow-sm hover:bg-templex-700 disabled:opacity-70"
          >
            {descargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {descargando ? 'Generando…' : 'Descargar Excel'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 items-end">
        {/* Asesor primero (2026-09-27): es el filtro que más se usa en gerencia. */}
        {asesores && (
          <label className="col-span-2 md:col-span-2 xl:col-span-2">
            <span className={ROTULO}>Asesor</span>
            <select value={filtros.asesorId} onChange={(e) => set('asesorId', e.target.value)}
              className={`${CAMPO} ${filtros.asesorId ? 'border-templex-500 ring-2 ring-templex-100 font-semibold' : ''}`}>
              <option value="">Todos los asesores</option>
              {asesores.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </label>
        )}

        {/* Rango de fechas */}
        <div className="col-span-2 xl:col-span-3">
          <span className={ROTULO}>Fecha de creación</span>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" aria-label="Desde" value={filtros.desde} max={filtros.hasta}
              onChange={(e) => e.target.value && set('desde', e.target.value)} className={`${CAMPO} !w-[140px]`} />
            <span className="text-[12px] text-slate-700">a</span>
            <input type="date" aria-label="Hasta" value={filtros.hasta} min={filtros.desde}
              onChange={(e) => e.target.value && set('hasta', e.target.value)} className={`${CAMPO} !w-[140px]`} />
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {RANGOS.map((r) => (
              <button key={r.id} type="button" onClick={() => onChange({ ...filtros, ...rango(r.id) })}
                className={`text-[11px] font-semibold rounded-md px-2 py-0.5 ring-1 transition-colors ${rangoActivo === r.id
                  ? 'bg-templex-600 text-white ring-templex-600'
                  : 'bg-slate-50 text-slate-800 ring-slate-200 hover:bg-slate-100'}`}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <label>
          <span className={ROTULO}>Estado</span>
          <select value={filtros.estado} onChange={(e) => set('estado', e.target.value as '' | EstadoCotizacion)} className={CAMPO}>
            <option value="">Todos</option>
            {(Object.keys(NOMBRE_ESTADO) as EstadoCotizacion[]).map((k) => <option key={k} value={k}>{NOMBRE_ESTADO[k]}</option>)}
          </select>
        </label>

        <label>
          <span className={ROTULO}>Segmento</span>
          <select value={filtros.segmento} onChange={(e) => set('segmento', e.target.value as '' | Segmento)} className={CAMPO}>
            <option value="">Todos</option>
            {(Object.keys(NOMBRE_SEGMENTO) as Segmento[]).map((k) => <option key={k} value={k}>{k} · {NOMBRE_SEGMENTO[k]}</option>)}
          </select>
        </label>

        <label>
          <span className={ROTULO}>Producto</span>
          <select value={filtros.producto} onChange={(e) => set('producto', e.target.value as '' | ModuloCotizador)} className={CAMPO}>
            <option value="">Todos</option>
            {(Object.keys(NOMBRE_MODULO) as ModuloCotizador[]).map((k) => <option key={k} value={k}>{NOMBRE_MODULO[k]}</option>)}
          </select>
        </label>

        {/* Cliente */}
        <label className="col-span-2 md:col-span-2 xl:col-span-3">
          <span className={ROTULO}>Cliente u obra</span>
          <span className="relative block">
            <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="search" value={filtros.cliente} maxLength={100} placeholder="Nombre, obra o N.°"
              onChange={(e) => set('cliente', e.target.value)} className={`${CAMPO} pl-8`} />
          </span>
        </label>

        <div className="col-span-2">
          <span className={ROTULO}>Monto total (COP)</span>
          <div className="flex items-center gap-2">
            <input type="number" inputMode="numeric" min={0} step={100000} placeholder="Mínimo" aria-label="Monto mínimo"
              value={filtros.montoMin} onChange={(e) => set('montoMin', e.target.value)} className={CAMPO} />
            <span className="text-[12px] text-slate-700">a</span>
            <input type="number" inputMode="numeric" min={0} step={100000} placeholder="Máximo" aria-label="Monto máximo"
              value={filtros.montoMax} onChange={(e) => set('montoMax', e.target.value)} className={CAMPO} />
          </div>
        </div>
      </div>
    </section>
  );
};

export default FiltrosBarra;
