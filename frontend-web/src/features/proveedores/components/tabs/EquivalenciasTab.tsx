import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import {
  GitCompare, Search, RefreshCw, Trash2, Building2,
  Package, Edit3, Loader2, History, X, Save, AlertTriangle,
} from 'lucide-react';
import { toast } from 'react-toastify';
import API from '../../../../services/config';
import { ProveedorCompacto } from '../../ProveedoresPage';

interface EquivalenciaItem {
  id: number;
  proveedor_id: number;
  proveedor: { id: number; nombre_comercial: string; nit: string | null };
  catalogo_producto_id: number;
  catalogo_producto: { id: number; codigo: string; nombre: string; es_aluminio: boolean };
  codigo_proveedor: string;
  descripcion_proveedor: string;
  unidad_compra: string;
  metros_por_unidad: number;
  precio_actual: number | null;
  fecha_precio_actual: string | null;
  precio_anterior_1: number | null;
  fecha_anterior_1: string | null;
  precio_anterior_2: number | null;
  fecha_anterior_2: string | null;
  activo: boolean;
}

interface HistoricoItem {
  id: number;
  precio: number;
  fecha_vigencia: string;
  origen: string;
  documento_ref: string | null;
  precio_anomalo: boolean;
  variacion_pct: number | null;
  porcentaje_iva: number | null;
  lineas_en_factura: number;
  retroactivo: boolean;
}

const MODALIDADES = [
  { value: '', label: 'Todas las modalidades' },
  { value: 'UNIDAD', label: 'Por unidad' },
  { value: 'TIRA_6M', label: 'Por tira (6 m)' },
  { value: 'METRO', label: 'Por metro' },
  { value: 'KG', label: 'Por kilogramo' },
  { value: 'M2', label: 'Por m²' },
];

const formatCOP = (val: number | null | undefined): string => {
  if (val === null || val === undefined) return '—';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
};

const formatFecha = (val: string | null | undefined): string => {
  if (!val) return '—';
  const [y, m, d] = val.split('T')[0].split('-');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d}-${meses[parseInt(m) - 1]}-${y.slice(2)}`;
};

interface Props {
  proveedores: ProveedorCompacto[];
  onActualizarContador?: () => void;
}

const EquivalenciasTab: React.FC<Props> = ({ proveedores, onActualizarContador }) => {
  const [equivalencias, setEquivalencias] = useState<EquivalenciaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [qAplicado, setQAplicado] = useState('');
  const [filtroProveedor, setFiltroProveedor] = useState('');
  const [filtroUnidad, setFiltroUnidad] = useState('');
  const [desvinculandoId, setDesvinculandoId] = useState<number | null>(null);

  // Edición de precio en línea
  const [editando, setEditando] = useState<EquivalenciaItem | null>(null);
  const [formEdicion, setFormEdicion] = useState({ precio: '', fecha_precio: '', unidad_compra: 'UNIDAD' });
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  // Histórico de precios
  const [historicoDe, setHistoricoDe] = useState<EquivalenciaItem | null>(null);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQAplicado(q.trim()), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q]);

  const cargarEquivalencias = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get<{ items: EquivalenciaItem[]; total: number }>(
        `${API}/api/proveedores/equivalencias`,
        {
          params: {
            q: qAplicado || undefined,
            proveedor_id: filtroProveedor || undefined,
            unidad_compra: filtroUnidad || undefined,
            limit: 200,
          },
        }
      );
      setEquivalencias(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'No se pudieron cargar las equivalencias');
      setEquivalencias([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [qAplicado, filtroProveedor, filtroUnidad]);

  useEffect(() => { cargarEquivalencias(); }, [cargarEquivalencias]);

  const handleDesvincular = async (item: EquivalenciaItem) => {
    if (
      !window.confirm(
        `¿Desvincular la equivalencia de "${item.proveedor?.nombre_comercial} (${item.codigo_proveedor})"?\n\nEl código regresará a la bandeja "Por Mapear" y su histórico de precios se conserva.`
      )
    ) return;

    setDesvinculandoId(item.id);
    try {
      const { data } = await axios.delete(`${API}/api/proveedores/equivalencias/${item.id}`);
      toast.info(data?.message ?? 'Equivalencia desvinculada');
      cargarEquivalencias();
      if (onActualizarContador) onActualizarContador();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'No se pudo desvincular la equivalencia');
    } finally {
      setDesvinculandoId(null);
    }
  };

  const abrirEdicion = (item: EquivalenciaItem) => {
    setEditando(item);
    setFormEdicion({
      precio: item.precio_actual !== null ? String(item.precio_actual) : '',
      fecha_precio: new Date().toISOString().split('T')[0],
      unidad_compra: item.unidad_compra,
    });
  };

  const guardarEdicion = async () => {
    if (!editando) return;
    const precioNum = parseFloat(formEdicion.precio);
    if (isNaN(precioNum) || precioNum <= 0) {
      toast.warning('Ingresa un precio válido');
      return;
    }

    setGuardandoEdicion(true);
    try {
      const { data } = await axios.patch(`${API}/api/proveedores/productos/${editando.id}`, {
        precio: precioNum,
        fecha_precio: formEdicion.fecha_precio,
        unidad_compra: formEdicion.unidad_compra,
      });

      if (data?.retroactivo) {
        toast.info('La fecha es anterior al precio vigente: el valor se archivó en el histórico sin reemplazarlo.');
      } else if (data?.anomalo) {
        toast.warning(`Precio guardado, pero varía ${Number(data.variacion_pct).toFixed(1)}% respecto al anterior. Verifica que sea correcto.`);
      } else {
        toast.success('Precio actualizado');
      }

      setEditando(null);
      cargarEquivalencias();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'No se pudo actualizar el precio');
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const abrirHistorico = async (item: EquivalenciaItem) => {
    setHistoricoDe(item);
    setHistorico([]);
    setLoadingHistorico(true);
    try {
      const { data } = await axios.get<HistoricoItem[]>(`${API}/api/proveedores/equivalencias/${item.id}/historico`);
      setHistorico(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'No se pudo cargar el histórico');
    } finally {
      setLoadingHistorico(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border, #cbd5e1)',
    fontSize: 13, background: 'var(--surface, #fff)', color: 'var(--text, #0f172a)',
  };

  const botonIcono: React.CSSProperties = {
    background: 'transparent', border: '1px solid var(--border, #cbd5e1)',
    padding: '6px 9px', borderRadius: 8, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Header ── */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 16, background: 'var(--surface-subtle, #f8fafc)',
          padding: '16px 20px', borderRadius: 14, border: '1px solid var(--border, #e2e8f0)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--text, #0f172a)' }}>
              Equivalencias de Catálogo
            </h2>
            <span
              style={{
                fontSize: 12, fontWeight: 700, color: '#6366f1',
                background: 'rgba(99, 102, 241, 0.12)', padding: '2px 8px', borderRadius: 999,
              }}
            >
              {total} mapeos activos
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted, #64748b)', margin: '4px 0 0' }}>
            Audita, corrige el precio o desvincula las relaciones aprendidas entre los códigos del proveedor y tus productos
          </p>
        </div>

        <button
          onClick={cargarEquivalencias}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--surface, #fff)', border: '1px solid var(--border, #cbd5e1)',
            padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
            color: 'var(--text, #334155)', cursor: 'pointer',
          }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refrescar
        </button>
      </div>

      {/* ── Filtros ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: 10, color: 'var(--text-muted, #94a3b8)' }} />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por código interno, código proveedor o nombre…"
            style={{ ...inputStyle, width: '100%', paddingLeft: 36 }}
          />
        </div>

        <select value={filtroProveedor} onChange={(e) => setFiltroProveedor(e.target.value)} style={inputStyle}>
          <option value="">Todos los proveedores</option>
          {proveedores.map((pr) => (
            <option key={pr.id} value={String(pr.id)}>{pr.nombre_comercial}</option>
          ))}
        </select>

        <select value={filtroUnidad} onChange={(e) => setFiltroUnidad(e.target.value)} style={inputStyle}>
          {MODALIDADES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* ── Tabla ── */}
      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px', color: '#6366f1' }} />
          Cargando equivalencias…
        </div>
      ) : equivalencias.length === 0 ? (
        <div
          style={{
            background: 'var(--surface, #ffffff)', border: '1px solid var(--border, #e2e8f0)',
            borderRadius: 16, padding: '48px 24px', textAlign: 'center',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          }}
        >
          <div
            style={{
              width: 50, height: 50, borderRadius: 999, background: 'rgba(99, 102, 241, 0.1)',
              color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <GitCompare size={24} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text, #0f172a)' }}>
            No se encontraron equivalencias
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted, #64748b)', maxWidth: 460, margin: 0 }}>
            Las equivalencias se construyen conforme cargas facturas o agregas precios manualmente.
          </p>
        </div>
      ) : (
        <div
          style={{
            background: 'var(--surface, #ffffff)', border: '1px solid var(--border, #e2e8f0)',
            borderRadius: 16, overflowX: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <table style={{ width: '100%', minWidth: 980, borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--surface-subtle, #f8fafc)', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Proveedor</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Código Proveedor</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Producto Catálogo Interno</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Modalidad</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Precio Vigente</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Historial Reciente</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)', textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {equivalencias.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--border, #f1f5f9)' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text, #1e293b)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Building2 size={14} style={{ color: '#6366f1', flexShrink: 0 }} />
                      {item.proveedor?.nombre_comercial}
                    </div>
                  </td>

                  <td style={{ padding: '12px 16px' }}>
                    <div
                      style={{
                        fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: '#4338ca',
                        background: 'rgba(99, 102, 241, 0.08)', padding: '2px 7px',
                        borderRadius: 5, display: 'inline-block',
                      }}
                    >
                      {item.codigo_proveedor || 'S/C'}
                    </div>
                    {item.descripcion_proveedor && (
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted, #64748b)', marginTop: 2 }}>
                        {item.descripcion_proveedor}
                      </div>
                    )}
                  </td>

                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Package size={14} style={{ color: '#059669', flexShrink: 0 }} />
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text, #0f172a)' }}>
                        {item.catalogo_producto?.codigo}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)' }}>
                      {item.catalogo_producto?.nombre}
                    </div>
                  </td>

                  <td style={{ padding: '12px 16px' }}>
                    <span
                      style={{
                        fontSize: 11.5, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                        background: 'var(--surface-subtle, #f1f5f9)', color: 'var(--text, #334155)',
                      }}
                    >
                      {item.unidad_compra}
                    </span>
                  </td>

                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 800, color: '#059669', fontSize: 13.5 }}>
                      {formatCOP(item.precio_actual)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)' }}>
                      Desde: {formatFecha(item.fecha_precio_actual)}
                    </div>
                  </td>

                  <td style={{ padding: '12px 16px' }}>
                    {item.precio_anterior_1 ? (
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted, #64748b)' }}>
                        <div>1° ant: {formatCOP(item.precio_anterior_1)} ({formatFecha(item.fecha_anterior_1)})</div>
                        {item.precio_anterior_2 && (
                          <div style={{ color: '#94a3b8' }}>
                            2° ant: {formatCOP(item.precio_anterior_2)} ({formatFecha(item.fecha_anterior_2)})
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--text-muted, #cbd5e1)' }}>—</span>
                    )}
                  </td>

                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => abrirEdicion(item)}
                        title="Corregir precio o modalidad"
                        style={{ ...botonIcono, color: '#4338ca' }}
                      >
                        <Edit3 size={13} /> Precio
                      </button>
                      <button
                        onClick={() => abrirHistorico(item)}
                        title="Ver histórico completo de precios"
                        style={{ ...botonIcono, color: 'var(--text-muted, #64748b)' }}
                      >
                        <History size={13} />
                      </button>
                      <button
                        onClick={() => handleDesvincular(item)}
                        disabled={desvinculandoId === item.id}
                        title="Desvincular equivalencia (conserva el histórico)"
                        style={{ ...botonIcono, color: '#ef4444' }}
                      >
                        {desvinculandoId === item.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {total > equivalencias.length && (
            <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-muted, #64748b)', borderTop: '1px solid var(--border, #f1f5f9)' }}>
              Mostrando {equivalencias.length} de {total}. Acota con el buscador o los filtros.
            </div>
          )}
        </div>
      )}

      {/* ── Modal: corregir precio ── */}
      {editando && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onClick={(e) => e.target === e.currentTarget && setEditando(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              background: 'var(--surface, #fff)', borderRadius: 16, width: '100%', maxWidth: 460,
              border: '1px solid var(--border, #e2e8f0)', overflow: 'hidden',
            }}
          >
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border, #e2e8f0)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text, #0f172a)' }}>Corregir precio</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-muted, #64748b)', marginTop: 2 }}>
                  {editando.proveedor?.nombre_comercial} · {editando.catalogo_producto?.codigo}
                </div>
              </div>
              <button onClick={() => setEditando(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={19} />
              </button>
            </div>

            <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)', display: 'block', marginBottom: 5 }}>
                    Precio sin IVA
                  </label>
                  <input
                    type="number"
                    value={formEdicion.precio}
                    onChange={(e) => setFormEdicion(f => ({ ...f, precio: e.target.value }))}
                    style={{ ...inputStyle, width: '100%', fontWeight: 700 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)', display: 'block', marginBottom: 5 }}>
                    Vigente desde
                  </label>
                  <input
                    type="date"
                    value={formEdicion.fecha_precio}
                    onChange={(e) => setFormEdicion(f => ({ ...f, fecha_precio: e.target.value }))}
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)', display: 'block', marginBottom: 5 }}>
                  Modalidad de compra
                </label>
                <select
                  value={formEdicion.unidad_compra}
                  onChange={(e) => setFormEdicion(f => ({ ...f, unidad_compra: e.target.value }))}
                  style={{ ...inputStyle, width: '100%' }}
                >
                  {MODALIDADES.filter(m => m.value).map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ fontSize: 11.5, color: 'var(--text-muted, #64748b)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <AlertTriangle size={13} style={{ color: '#b45309', flexShrink: 0, marginTop: 1 }} />
                Si la fecha es anterior al precio vigente, el valor se archiva en el histórico sin reemplazar el actual.
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <button
                  onClick={() => setEditando(null)}
                  style={{
                    padding: '9px 16px', borderRadius: 9, border: '1px solid var(--border, #cbd5e1)',
                    background: 'transparent', color: 'var(--text, #475569)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={guardarEdicion}
                  disabled={guardandoEdicion}
                  style={{
                    padding: '9px 18px', borderRadius: 9, border: 'none', background: '#6366f1',
                    color: '#fff', fontSize: 13, fontWeight: 700, cursor: guardandoEdicion ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 7,
                  }}
                >
                  {guardandoEdicion ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Guardar precio
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── Modal: histórico ── */}
      {historicoDe && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onClick={(e) => e.target === e.currentTarget && setHistoricoDe(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              background: 'var(--surface, #fff)', borderRadius: 16, width: '100%', maxWidth: 680,
              maxHeight: '85vh', border: '1px solid var(--border, #e2e8f0)',
              overflow: 'hidden', display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border, #e2e8f0)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text, #0f172a)' }}>Histórico de precios</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-muted, #64748b)', marginTop: 2 }}>
                  {historicoDe.proveedor?.nombre_comercial} · {historicoDe.catalogo_producto?.codigo} · {historicoDe.unidad_compra}
                </div>
              </div>
              <button onClick={() => setHistoricoDe(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={19} />
              </button>
            </div>

            <div style={{ overflowY: 'auto', padding: historico.length ? 0 : 22 }}>
              {loadingHistorico ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto 8px', color: '#6366f1' }} />
                  Cargando histórico…
                </div>
              ) : historico.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted, #64748b)', fontSize: 13, padding: '24px 0' }}>
                  Sin registros de precio para esta equivalencia.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-subtle, #f8fafc)', position: 'sticky', top: 0 }}>
                      <th style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Vigencia</th>
                      <th style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Precio</th>
                      <th style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Variación</th>
                      <th style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Origen</th>
                      <th style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Documento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historico.map((h) => (
                      <tr key={h.id} style={{ borderTop: '1px solid var(--border, #f1f5f9)' }}>
                        <td style={{ padding: '9px 16px' }}>
                          {formatFecha(h.fecha_vigencia)}
                          {h.retroactivo && (
                            <div style={{ fontSize: 10.5, color: '#b45309', fontWeight: 600 }}>retroactivo</div>
                          )}
                        </td>
                        <td style={{ padding: '9px 16px', fontWeight: 700, color: '#059669' }}>
                          {formatCOP(h.precio)}
                          {h.lineas_en_factura > 1 && (
                            <div style={{ fontSize: 10.5, color: 'var(--text-muted, #94a3b8)', fontWeight: 500 }}>
                              {h.lineas_en_factura} líneas · se tomó la mayor
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '9px 16px' }}>
                          {h.variacion_pct !== null ? (
                            <span style={{ color: h.precio_anomalo ? '#ef4444' : Number(h.variacion_pct) > 0 ? '#f59e0b' : '#22c55e', fontWeight: 700 }}>
                              {Number(h.variacion_pct) > 0 ? '+' : ''}{Number(h.variacion_pct).toFixed(1)}%
                              {h.precio_anomalo && ' ⚠'}
                            </span>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '9px 16px', color: 'var(--text-muted, #64748b)' }}>
                          {h.origen}
                          {h.porcentaje_iva !== null && (
                            <div style={{ fontSize: 10.5 }}>IVA {Number(h.porcentaje_iva)}%</div>
                          )}
                        </td>
                        <td style={{ padding: '9px 16px', color: 'var(--text-muted, #94a3b8)', fontSize: 11.5 }}>
                          {h.documento_ref || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
};

export default EquivalenciasTab;
