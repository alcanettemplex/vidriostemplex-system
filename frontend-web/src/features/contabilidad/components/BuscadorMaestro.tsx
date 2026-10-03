import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Search, X, Receipt } from '../../../components/ui/icons';
import API from '../../../services/config';
import { normalizarTexto, useValorDiferido } from '../../../utils/busqueda';
import { headers, fmt, fmtFecha, calcPendiente, pestanaDeODP, PestanaContabilidad } from './contabilidad.utils';

interface Props {
  /** Ve Estado Caja, Pagos, Cartera y Proceso Completado (todos menos asistente administrativo). */
  verFinanzas: boolean;
  /** Ve la pestaña Órdenes Azules. */
  verOA: boolean;
  /** cartera_detalle del resumen (completa desde 2026-10-03): dice qué ODPs están vencidas. */
  cartera: any[];
  /** Lleva a la pestaña con su buscador ya filtrado por `termino`. */
  onIrA: (pestana: PestanaContabilidad, termino: string) => void;
  onAbrirFicha: (odpId: number) => void;
}

const LIMITE_ODPS = 30;
const LIMITE_PAGOS = 8;

const ETIQUETA: Record<'estado_caja' | 'completado' | 'oa', { texto: string; clase: string }> = {
  estado_caja: { texto: 'Estado Caja', clase: 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100' },
  completado: { texto: 'Proceso Completado', clase: 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100' },
  oa: { texto: 'Órdenes Azules', clase: 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100' },
};

/**
 * Buscador maestro de Contabilidad: busca en toda la BD (no solo en lo cargado) y dice en
 * qué pestaña está cada resultado. Usa los mismos endpoints que las pestañas
 * (`/contabilidad/odps?q=` y `/contabilidad/pagos?q=`), así que encuentra exactamente
 * lo mismo que sus buscadores.
 */
const BuscadorMaestro: React.FC<Props> = ({ verFinanzas, verOA, cartera, onIrA, onAbrirFicha }) => {
  const [termino, setTermino] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [odps, setOdps] = useState<any[]>([]);
  const [totalOdps, setTotalOdps] = useState(0);
  const [pagos, setPagos] = useState<any[]>([]);
  const [totalPagos, setTotalPagos] = useState(0);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const consultaRef = useRef(0);

  const diferido = useValorDiferido(termino.trim(), 300);
  const terminoValido = normalizarTexto(diferido).length >= 2;

  useEffect(() => {
    if (!terminoValido) {
      setOdps([]); setPagos([]); setTotalOdps(0); setTotalPagos(0); setError(null); setCargando(false);
      return;
    }
    // Si el usuario sigue escribiendo, la respuesta de la consulta anterior se descarta.
    const id = ++consultaRef.current;
    setCargando(true);
    setError(null);
    const q = encodeURIComponent(diferido);
    Promise.all([
      axios.get(`${API}/api/contabilidad/odps?q=${q}&limit=${LIMITE_ODPS}`, { headers: headers() }),
      verFinanzas
        ? axios.get(`${API}/api/contabilidad/pagos?q=${q}&limit=${LIMITE_PAGOS}`, { headers: headers() })
        : Promise.resolve(null),
    ])
      .then(([resOdps, resPagos]) => {
        if (id !== consultaRef.current) return;
        setOdps(resOdps.data?.rows || []);
        setTotalOdps(resOdps.data?.count || 0);
        setPagos(resPagos?.data?.pagos || []);
        setTotalPagos(resPagos?.data?.total || 0);
      })
      .catch((err) => {
        if (id !== consultaRef.current) return;
        setError(err?.response?.data?.error || 'No se pudo completar la búsqueda. Revisa tu conexión e inténtalo de nuevo.');
      })
      .finally(() => { if (id === consultaRef.current) setCargando(false); });
  }, [diferido, terminoValido, verFinanzas]);

  // Cerrar al hacer clic fuera.
  useEffect(() => {
    if (!abierto) return;
    const alClicFuera = (e: MouseEvent) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', alClicFuera);
    return () => document.removeEventListener('mousedown', alClicFuera);
  }, [abierto]);

  const diasCartera = useMemo(() => {
    const m = new Map<number, number>();
    cartera.forEach((c: any) => { if (c?.id != null) m.set(c.id, c.dias_vencido); });
    return m;
  }, [cartera]);

  // Solo lo que el rol puede ver: el endpoint de ODPs no filtra por pestaña.
  const visibles = useMemo(() => odps.filter((o) => {
    const p = pestanaDeODP(o);
    return p === 'oa' ? verOA : verFinanzas;
  }), [odps, verOA, verFinanzas]);
  const ocultasPorRol = odps.length - visibles.length;

  const ir = (pestana: PestanaContabilidad, valor: string) => { setAbierto(false); onIrA(pestana, valor); };
  const ficha = (id: number) => { setAbierto(false); onAbrirFicha(id); };

  const mostrarPanel = abierto && terminoValido;
  const sinResultados = !cargando && !error && visibles.length === 0 && pagos.length === 0;

  return (
    <div ref={contenedorRef} className="relative w-full md:w-[440px]">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
      <input
        type="text"
        value={termino}
        onChange={e => { setTermino(e.target.value); setAbierto(true); }}
        onFocus={() => setAbierto(true)}
        onKeyDown={e => {
          if (e.key !== 'Escape') return;
          if (abierto) setAbierto(false); else setTermino('');
        }}
        placeholder="Buscar en todo Contabilidad: ODP, cliente, NIT, asesor, FE, recibo…"
        aria-label="Buscar en todo Contabilidad"
        className="w-full pl-10 pr-9 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 border border-slate-300 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />
      {cargando ? (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
      ) : termino ? (
        <button type="button" onClick={() => { setTermino(''); setAbierto(false); }} title="Limpiar búsqueda"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100">
          <X className="w-4 h-4" />
        </button>
      ) : null}

      {abierto && termino.trim() && !terminoValido && (
        <div className="absolute right-0 left-0 mt-2 z-40 bg-white border border-slate-200 rounded-xl shadow-xl px-4 py-3 text-xs text-slate-700">
          Escribe al menos 2 caracteres para buscar.
        </div>
      )}

      {mostrarPanel && (
        <div className="absolute right-0 mt-2 z-40 w-full md:w-[640px] max-h-[70vh] overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-2xl">
          {error ? (
            <p className="px-4 py-6 text-sm text-rose-700 text-center">{error}</p>
          ) : cargando && visibles.length === 0 && pagos.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-700 text-center">Buscando…</p>
          ) : sinResultados ? (
            <p className="px-4 py-6 text-sm text-slate-700 text-center">
              No hay ODPs ni pagos que coincidan con “{diferido}”.
            </p>
          ) : (
            <>
              {visibles.length > 0 && (
                <div>
                  <p className="sticky top-0 bg-slate-50 border-b border-slate-100 px-4 py-2 text-[11px] font-semibold text-slate-800 uppercase tracking-wider">
                    ODPs {totalOdps > odps.length ? `· mostrando ${odps.length} de ${totalOdps}, afina la búsqueda` : `· ${visibles.length}`}
                  </p>
                  <ul className="divide-y divide-slate-100">
                    {visibles.map((o) => {
                      const pestana = pestanaDeODP(o);
                      const dias = diasCartera.get(o.id);
                      const pend = calcPendiente(o);
                      return (
                        <li key={o.id} className="px-4 py-2.5 hover:bg-slate-50">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <button type="button" onClick={() => ficha(o.id)} title="Abrir ficha de la ODP"
                                className="font-bold text-sm text-indigo-700 hover:underline">
                                {o.numero_odp}
                              </button>
                              <span className="ml-2 text-sm text-slate-900 font-semibold">{o.cliente?.nombre_razon_social || '—'}</span>
                              <p className="text-[11px] text-slate-700 mt-0.5">
                                {o.cliente?.numero_documento && <>NIT {o.cliente.numero_documento} · </>}
                                {o.asesor?.nombre_completo || 'Sin asesor'}
                                {o.factura_electronica && <> · FE-{o.factura_electronica}</>}
                                {(o.facturas_adicionales?.length || 0) > 0 && <> +{o.facturas_adicionales.length}</>}
                              </p>
                            </div>
                            <span className={`text-xs font-bold whitespace-nowrap ${pend > 0 ? 'text-rose-700' : 'text-slate-500'}`}>
                              {pend > 0 ? `Pendiente ${fmt(pend)}` : 'Sin saldo'}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {pestana === 'ninguna' ? (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold border bg-slate-100 text-slate-700 border-slate-200">
                                No figura en Contabilidad ({o.es_garantia ? 'Garantía' : 'No Conformidad'})
                              </span>
                            ) : (
                              <button type="button" onClick={() => ir(pestana, o.numero_odp)}
                                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border transition ${ETIQUETA[pestana].clase}`}>
                                {ETIQUETA[pestana].texto} ›
                              </button>
                            )}
                            {verFinanzas && dias !== undefined && (
                              <button type="button" onClick={() => ir('cartera', o.numero_odp)}
                                className="px-2 py-0.5 rounded-md text-[11px] font-semibold border transition bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100">
                                Cartera Vencida · {dias} días ›
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {ocultasPorRol > 0 && (
                <p className="px-4 py-2 text-[11px] text-slate-600 italic border-t border-slate-100">
                  {ocultasPorRol} resultado(s) más pertenecen a pestañas a las que tu rol no tiene acceso.
                </p>
              )}

              {pagos.length > 0 && (
                <div>
                  <p className="sticky top-0 bg-slate-50 border-y border-slate-100 px-4 py-2 text-[11px] font-semibold text-slate-800 uppercase tracking-wider flex items-center justify-between">
                    <span>Pagos · {totalPagos > pagos.length ? `${pagos.length} de ${totalPagos}` : totalPagos}</span>
                    <button type="button" onClick={() => ir('pagos', diferido)}
                      className="normal-case tracking-normal text-indigo-700 hover:underline">
                      Ver {totalPagos > 1 ? `los ${totalPagos}` : 'el pago'} en Pagos Recientes ›
                    </button>
                  </p>
                  <ul className="divide-y divide-slate-100">
                    {pagos.map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => ir('pagos', p.odp?.numero_odp || diferido)}
                          className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between gap-3">
                          <span className="min-w-0 text-xs text-slate-800 truncate">
                            <Receipt className="w-3.5 h-3.5 inline mr-1.5 text-slate-500" />
                            {fmtFecha(p.fecha)} · <span className="font-semibold text-indigo-700">{p.odp?.numero_odp || `ODP-${p.odp_id}`}</span>
                            {' · '}{p.odp?.cliente?.nombre_razon_social || '—'}
                            {p.referencia_pago && <> · Recibo {p.referencia_pago}</>}
                          </span>
                          <span className="text-xs font-bold text-emerald-700 whitespace-nowrap">{fmt(Number(p.monto) || 0)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default BuscadorMaestro;
