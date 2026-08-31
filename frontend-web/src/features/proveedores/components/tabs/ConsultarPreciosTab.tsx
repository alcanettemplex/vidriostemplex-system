import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, AlertTriangle, TrendingDown, TrendingUp, Minus,
  Package, RefreshCw, ChevronDown, ChevronUp, Filter
} from 'lucide-react';
import API from '../../../../services/config';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Proveedor { id: number; nombre_comercial: string; nit: string | null; }

interface PrecioProveedor {
  proveedor_producto_id: number;
  proveedor: Proveedor;
  codigo_proveedor: string | null;
  descripcion_proveedor: string | null;
  unidad_compra: string;
  precio_sin_iva: number | null;
  precio_con_iva: number | null;
  precio_metro_derivado: number | null;
  fecha_precio_actual: string | null;
  precio_anterior_1: number | null;
  fecha_anterior_1: string | null;
  precio_anterior_2: number | null;
  fecha_anterior_2: string | null;
  variacion_pct: number | null;
  precio_anomalo: boolean;
}

interface ResultadoConsulta {
  producto: { id: number; codigo: string; nombre: string; unidad_medida: string | null; porcentaje_iva: number };
  umbral_variacion_pct: number;
  precios: PrecioProveedor[];
  total: number;
}

/** Cuando el término coincide con varios productos, el backend devuelve la lista
 *  para que el usuario elija en vez de resolver a uno arbitrario. */
interface Candidato {
  id: number;
  codigo: string;
  nombre: string;
  unidad_medida: string | null;
}

const MODALIDADES = [
  { value: '', label: 'Todas las modalidades' },
  { value: 'UNIDAD', label: 'Por unidad' },
  { value: 'TIRA_6M', label: 'Por tira (6 m)' },
  { value: 'METRO', label: 'Por metro' },
  { value: 'KG', label: 'Por kilogramo' },
  { value: 'M2', label: 'Por m²' },
];

const ETIQUETA_MODALIDAD: Record<string, string> = {
  UNIDAD: 'Unidad',
  TIRA_6M: 'Tira 6 m',
  METRO: 'Metro',
  KG: 'Kilogramo',
  M2: 'm²',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatCOP = (val: number | null): string => {
  if (val === null || val === undefined) return '—';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
};

const formatFecha = (val: string | null): string => {
  if (!val) return '—';
  const [y, m, d] = val.split('-');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d}-${meses[parseInt(m) - 1]}-${y.slice(2)}`;
};

const VariacionBadge: React.FC<{ pct: number | null; anomalo: boolean; umbral: number }> = ({ pct, anomalo, umbral }) => {
  if (pct === null) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>;
  const Icon = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus;
  const color = anomalo ? '#ef4444' : pct > 0 ? '#f59e0b' : '#22c55e';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      color, fontWeight: 600, fontSize: 12,
      background: `${color}18`, borderRadius: 6, padding: '2px 7px',
    }}>
      <Icon size={11} />
      {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
      {anomalo && <AlertTriangle size={10} style={{ marginLeft: 2 }} />}
    </span>
  );
};

// ─── Componente principal ──────────────────────────────────────────────────────

const ConsultarPreciosTab: React.FC = () => {
  const [query, setQuery] = useState('');
  const [modalidad, setModalidad] = useState('');
  const [resultado, setResultado] = useState<ResultadoConsulta | null>(null);
  const [candidatos, setCandidatos] = useState<Candidato[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<number | null>(null);

  /**
   * El servidor decide si el término es código, nombre o alias: la heurística que
   * vivía aquí (letras + dígitos = código) mandaba a buscar como texto libre
   * cualquier código que no encajara en ese patrón.
   */
  const consultar = useCallback(async (params: Record<string, any>) => {
    setLoading(true);
    setError(null);
    setResultado(null);
    setCandidatos(null);
    setExpandido(null);

    try {
      const { data } = await axios.get<ResultadoConsulta & { candidatos?: Candidato[] }>(
        `${API}/api/proveedores/consulta`,
        { params: { ...params, modalidad: modalidad || undefined } }
      );

      if (data?.candidatos) {
        setCandidatos(data.candidatos);
      } else {
        setResultado(data as ResultadoConsulta);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'No se encontró el producto');
    } finally {
      setLoading(false);
    }
  }, [modalidad]);

  const buscar = useCallback(() => {
    if (!query.trim()) return;
    consultar({ q: query.trim() });
  }, [query, consultar]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') buscar();
  };

  return (
    <div style={{ padding: '0 0 32px' }}>

      {/* ── Buscador ── */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '20px 24px',
        marginBottom: 24,
        display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>
            CÓDIGO O NOMBRE DEL PRODUCTO
          </label>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ej: TUB0510 · brazo hidráulico · cierrapuertas"
              style={{
                width: '100%', padding: '10px 12px 10px 38px', boxSizing: 'border-box',
                background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10,
                color: 'var(--text)', fontSize: 14, outline: 'none',
              }}
            />
          </div>
        </div>

        <div style={{ minWidth: 180 }}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>
            MODALIDAD
          </label>
          <div style={{ position: 'relative' }}>
            <Filter size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <select
              value={modalidad}
              onChange={e => setModalidad(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px 10px 30px', appearance: 'none',
                background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10,
                color: 'var(--text)', fontSize: 14, cursor: 'pointer', outline: 'none',
              }}
            >
              {MODALIDADES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>

        <button
          onClick={buscar}
          disabled={loading || !query.trim()}
          style={{
            padding: '10px 24px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: loading || !query.trim() ? 'var(--border)' : 'var(--primary)',
            color: loading || !query.trim() ? 'var(--text-muted)' : '#fff',
            fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, transition: 'all .2s',
          }}
        >
          {loading ? <RefreshCw size={15} className="spin" /> : <Search size={15} />}
          {loading ? 'Buscando…' : 'Consultar'}
        </button>
      </div>

      {/* ── Varios productos coinciden: que elija el usuario ── */}
      {candidatos && candidatos.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          style={{
            border: '1px solid var(--border)', borderRadius: 14,
            overflow: 'hidden', marginBottom: 20,
          }}
        >
          <div style={{ padding: '12px 20px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
              {candidatos.length} productos coinciden con «{query.trim()}»
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
              Elige cuál quieres comparar
            </div>
          </div>
          {candidatos.map((c) => (
            <div
              key={c.id}
              onClick={() => consultar({ producto_id: c.id })}
              style={{
                padding: '11px 20px', borderBottom: '1px solid var(--border)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>
                {c.codigo}
              </span>
              <span style={{ fontSize: 13.5, color: 'var(--text)' }}>{c.nombre}</span>
              {c.unidad_medida && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{c.unidad_medida}</span>
              )}
            </div>
          ))}
        </motion.div>
      )}

      {/* ── Estado inicial ── */}
      {!resultado && !candidatos && !error && !loading && (
        <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--text-muted)' }}>
          <Package size={48} style={{ opacity: .3, marginBottom: 12 }} />
          <p style={{ fontSize: 15 }}>Busca un producto para comparar precios entre proveedores</p>
          <p style={{ fontSize: 13, marginTop: 4 }}>Puedes buscar por código (TUB0510), nombre o alias del proveedor</p>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          style={{
            background: '#ef444410', border: '1px solid #ef4444', borderRadius: 12,
            padding: '16px 20px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: 10,
          }}
        >
          <AlertTriangle size={18} />
          <span>{error}</span>
        </motion.div>
      )}

      {/* ── Resultados ── */}
      <AnimatePresence>
        {resultado && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

            {/* Header del producto */}
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 14, padding: '16px 24px', marginBottom: 16,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
            }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>PRODUCTO</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                  <span style={{ color: 'var(--primary)', marginRight: 10, fontSize: 14, fontFamily: 'monospace' }}>
                    {resultado.producto.codigo}
                  </span>
                  {resultado.producto.nombre}
                </div>
                {resultado.producto.unidad_medida && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                    Unidad: {resultado.producto.unidad_medida} · IVA: {resultado.producto.porcentaje_iva}%
                  </div>
                )}
              </div>
              <div style={{
                background: resultado.precios.length > 0 ? '#22c55e18' : '#f5940018',
                color: resultado.precios.length > 0 ? '#22c55e' : '#f59400',
                borderRadius: 8, padding: '6px 14px', fontWeight: 700, fontSize: 14,
              }}>
                {resultado.total} proveedor{resultado.total !== 1 ? 'es' : ''}
              </div>
            </div>

            {/* Aviso: comparar precios de modalidades distintas induce a error */}
            {resultado.precios.length > 1 &&
              new Set(resultado.precios.map(p => p.unidad_compra)).size > 1 && (
              <div
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  background: '#f59e0b12', border: '1px solid #f59e0b55',
                  borderRadius: 12, padding: '12px 16px', marginBottom: 16,
                }}
              >
                <AlertTriangle size={16} color="#b45309" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.45 }}>
                  <strong>Hay precios en distintas modalidades de compra.</strong>{' '}
                  Un precio por tira no es comparable con uno por metro: el marcado como «más bajo»
                  lo es solo dentro de su modalidad. Filtra por una modalidad para comparar de forma válida.
                </div>
              </div>
            )}

            {/* Sin resultados */}
            {resultado.precios.length === 0 && (
              <div style={{
                textAlign: 'center', padding: '40px 24px',
                color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 14,
              }}>
                <Package size={36} style={{ opacity: .3, marginBottom: 12 }} />
                <p>No hay precios registrados para este producto.</p>
                <p style={{ fontSize: 13 }}>Agrégalos desde la pestaña <strong>Proveedores</strong></p>
              </div>
            )}

            {/* Tabla de precios */}
            {resultado.precios.length > 0 && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                {/* Encabezado de tabla */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr',
                  background: 'var(--surface)',
                  padding: '10px 20px', gap: 8,
                  borderBottom: '1px solid var(--border)',
                }}>
                  {['PROVEEDOR', 'MODALIDAD', 'SIN IVA', `+${resultado.producto.porcentaje_iva}% IVA`, 'VARIACIÓN', 'FECHA'].map(h => (
                    <div key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: .5 }}>{h}</div>
                  ))}
                </div>

                {/* Filas */}
                {resultado.precios.map((p, idx) => (
                  <motion.div
                    key={p.proveedor_producto_id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.04 }}
                  >
                    {/* Fila principal */}
                    <div
                      onClick={() => setExpandido(expandido === p.proveedor_producto_id ? null : p.proveedor_producto_id)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr',
                        padding: '13px 20px', gap: 8,
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                        background: idx === 0
                          ? '#22c55e08'
                          : p.precio_anomalo ? '#ef444408' : 'transparent',
                        transition: 'background .15s',
                      }}
                    >
                      {/* Proveedor */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {idx === 0 && (
                          <span style={{
                            background: '#22c55e', color: '#fff', fontSize: 9, fontWeight: 700,
                            borderRadius: 4, padding: '2px 5px', letterSpacing: .5,
                          }}>
                            MÁS BAJO
                          </span>
                        )}
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 14 }}>
                            {p.proveedor.nombre_comercial}
                          </div>
                          {p.codigo_proveedor && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                              {p.codigo_proveedor}
                            </div>
                          )}
                        </div>
                        {expandido === p.proveedor_producto_id ? <ChevronUp size={14} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />}
                      </div>

                      {/* Modalidad */}
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
                        {ETIQUETA_MODALIDAD[p.unidad_compra] ?? p.unidad_compra}
                      </div>

                      {/* Precio sin IVA */}
                      <div style={{ fontWeight: 700, color: 'var(--text)', alignSelf: 'center', fontSize: 15 }}>
                        {formatCOP(p.precio_sin_iva)}
                      </div>

                      {/* Precio con IVA */}
                      <div style={{ color: 'var(--text-muted)', alignSelf: 'center', fontSize: 14 }}>
                        {formatCOP(p.precio_con_iva)}
                      </div>

                      {/* Variación */}
                      <div style={{ alignSelf: 'center' }}>
                        <VariacionBadge pct={p.variacion_pct} anomalo={p.precio_anomalo} umbral={resultado.umbral_variacion_pct} />
                      </div>

                      {/* Fecha */}
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
                        {formatFecha(p.fecha_precio_actual)}
                      </div>
                    </div>

                    {/* Fila expandida: historial y detalles */}
                    <AnimatePresence>
                      {expandido === p.proveedor_producto_id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          style={{
                            overflow: 'hidden',
                            borderBottom: '1px solid var(--border)',
                            background: 'var(--surface)',
                          }}
                        >
                          <div style={{ padding: '14px 24px', display: 'flex', gap: 40, flexWrap: 'wrap' }}>
                            {/* Descripción del proveedor */}
                            {p.descripcion_proveedor && (
                              <div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 3 }}>DESCRIPCIÓN PROVEEDOR</div>
                                <div style={{ fontSize: 13, color: 'var(--text)' }}>{p.descripcion_proveedor}</div>
                              </div>
                            )}

                            {/* Precio por metro derivado (perfilería) */}
                            {p.precio_metro_derivado && (
                              <div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 3 }}>PRECIO POR METRO (DERIVADO)</div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{formatCOP(p.precio_metro_derivado)} / m</div>
                              </div>
                            )}

                            {/* Historial de precios */}
                            <div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 6 }}>HISTORIAL DE PRECIOS</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {p.precio_anterior_1 ? (
                                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{formatCOP(p.precio_anterior_1)}</span>
                                    {' '}hasta {formatFecha(p.fecha_anterior_1)}
                                  </div>
                                ) : null}
                                {p.precio_anterior_2 ? (
                                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                    <span style={{ fontWeight: 600 }}>{formatCOP(p.precio_anterior_2)}</span>
                                    {' '}hasta {formatFecha(p.fecha_anterior_2)}
                                  </div>
                                ) : null}
                                {!p.precio_anterior_1 && (
                                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin historial anterior</div>
                                )}
                              </div>
                            </div>

                            {/* Alerta de anomalía */}
                            {p.precio_anomalo && (
                              <div style={{
                                background: '#ef444410', border: '1px solid #ef4444',
                                borderRadius: 8, padding: '8px 14px',
                                display: 'flex', alignItems: 'center', gap: 8,
                              }}>
                                <AlertTriangle size={14} color="#ef4444" />
                                <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>
                                  Variación anómala: {p.variacion_pct !== null ? `${p.variacion_pct > 0 ? '+' : ''}${p.variacion_pct.toFixed(1)}%` : ''}
                                  {' '}(umbral: ±{resultado.umbral_variacion_pct}%)
                                </span>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ConsultarPreciosTab;


