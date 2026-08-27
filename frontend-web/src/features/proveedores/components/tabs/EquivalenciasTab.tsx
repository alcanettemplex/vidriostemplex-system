import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import {
  GitCompare, Search, Filter, RefreshCw, Trash2, Building2,
  Package, TrendingUp, AlertCircle, Edit3, Loader2, ArrowRight
} from 'lucide-react';
import { toast } from 'react-toastify';
import API from '../../../../services/config';

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
  onActualizarContador?: () => void;
}

const EquivalenciasTab: React.FC<Props> = ({ onActualizarContador }) => {
  const [equivalencias, setEquivalencias] = useState<EquivalenciaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filtroProveedor, setFiltroProveedor] = useState('');
  const [filtroUnidad, setFiltroUnidad] = useState('');
  const [proveedores, setProveedores] = useState<Array<{ id: number; nombre_comercial: string }>>([]);
  const [desvinculandoId, setDesvinculandoId] = useState<number | null>(null);

  const token = sessionStorage.getItem('token') || localStorage.getItem('token');

  const cargarEquivalencias = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get<EquivalenciaItem[]>(
        `${API}/api/proveedores/equivalencias`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setEquivalencias(data);
    } catch {
      // Fallback si la ruta responde vacío
      setEquivalencias([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const cargarProveedores = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/proveedores`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProveedores(data);
    } catch {
      // silencioso
    }
  }, [token]);

  useEffect(() => {
    cargarEquivalencias();
    cargarProveedores();
  }, [cargarEquivalencias, cargarProveedores]);

  const handleDesvincular = async (item: EquivalenciaItem) => {
    if (
      !window.confirm(
        `¿Desvincular la equivalencia de "${item.proveedor?.nombre_comercial} (${item.codigo_proveedor})"?\n\nEl código regresará a la bandeja "Por Mapear" para que puedas re-vincularlo.`
      )
    ) {
      return;
    }

    setDesvinculandoId(item.id);
    try {
      await axios.delete(`${API}/api/proveedores/equivalencias/${item.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.info('Equivalencia desvinculada y devuelta a Por Mapear');
      cargarEquivalencias();
      if (onActualizarContador) {
        onActualizarContador();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al eliminar equivalencia');
    } finally {
      setDesvinculandoId(null);
    }
  };

  const equivalenciasFiltradas = equivalencias.filter((eq) => {
    const matchProv = filtroProveedor ? String(eq.proveedor_id) === filtroProveedor : true;
    const matchUnidad = filtroUnidad ? eq.unidad_compra === filtroUnidad : true;
    const term = q.toLowerCase();
    const matchQ =
      !term ||
      eq.codigo_proveedor?.toLowerCase().includes(term) ||
      eq.descripcion_proveedor?.toLowerCase().includes(term) ||
      eq.proveedor?.nombre_comercial?.toLowerCase().includes(term) ||
      eq.catalogo_producto?.codigo?.toLowerCase().includes(term) ||
      eq.catalogo_producto?.nombre?.toLowerCase().includes(term);

    return matchProv && matchUnidad && matchQ;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Header Explicativo ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          background: 'var(--surface-subtle, #f8fafc)',
          padding: '16px 20px',
          borderRadius: 14,
          border: '1px solid var(--border, #e2e8f0)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--text, #0f172a)' }}>
              Equivalencias de Catálogo
            </h2>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#6366f1',
                background: 'rgba(99, 102, 241, 0.12)',
                padding: '2px 8px',
                borderRadius: 999,
              }}
            >
              {equivalencias.length} mapeos activos
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted, #64748b)', margin: '4px 0 0' }}>
            Audita, consulta o corrige las relaciones aprendidas entre los códigos del proveedor y tus productos
          </p>
        </div>

        <button
          onClick={cargarEquivalencias}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--surface, #fff)',
            border: '1px solid var(--border, #cbd5e1)',
            padding: '7px 14px',
            borderRadius: 8,
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--text, #334155)',
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refrescar
        </button>
      </div>

      {/* ── Filtros y Buscador ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: 10, color: 'var(--text-muted, #94a3b8)' }} />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por código interno, código proveedor, nombre..."
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              borderRadius: 8,
              border: '1px solid var(--border, #cbd5e1)',
              fontSize: 13,
              background: 'var(--surface, #fff)',
              color: 'var(--text, #0f172a)',
            }}
          />
        </div>

        <select
          value={filtroProveedor}
          onChange={(e) => setFiltroProveedor(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--border, #cbd5e1)',
            fontSize: 13,
            background: 'var(--surface, #fff)',
            color: 'var(--text, #0f172a)',
          }}
        >
          <option value="">Todos los proveedores</option>
          {proveedores.map((pr) => (
            <option key={pr.id} value={String(pr.id)}>{pr.nombre_comercial}</option>
          ))}
        </select>

        <select
          value={filtroUnidad}
          onChange={(e) => setFiltroUnidad(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--border, #cbd5e1)',
            fontSize: 13,
            background: 'var(--surface, #fff)',
            color: 'var(--text, #0f172a)',
          }}
        >
          <option value="">Todas las modalidades</option>
          <option value="UNIDAD">Por unidad</option>
          <option value="TIRA_6M">Por tira (6 m)</option>
          <option value="METRO">Por metro</option>
        </select>
      </div>

      {/* ── Tabla de Equivalencias ── */}
      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px', color: '#6366f1' }} />
          Cargando equivalencias...
        </div>
      ) : equivalenciasFiltradas.length === 0 ? (
        <div
          style={{
            background: 'var(--surface, #ffffff)',
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: 16,
            padding: '48px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 50,
              height: 50,
              borderRadius: 999,
              background: 'rgba(99, 102, 241, 0.1)',
              color: '#6366f1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <GitCompare size={24} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text, #0f172a)' }}>
            No se encontraron equivalencias
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted, #64748b)', maxWidth: 460, margin: 0 }}>
            Las equivalencias se van construyendo conforme cargas facturas o agregas precios manualmente en los productos.
          </p>
        </div>
      ) : (
        <div
          style={{
            background: 'var(--surface, #ffffff)',
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: 16,
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--surface-subtle, #f8fafc)', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Proveedor</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Código Proveedor</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Producto Catálogo Interno</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Modalidad</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Precio Vigente</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Historial Reciente</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)', textAlign: 'right' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {equivalenciasFiltradas.map((item) => (
                <tr
                  key={item.id}
                  style={{
                    borderBottom: '1px solid var(--border, #f1f5f9)',
                    transition: 'background 0.15s',
                  }}
                >
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text, #1e293b)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Building2 size={14} style={{ color: '#6366f1' }} />
                      {item.proveedor?.nombre_comercial}
                    </div>
                  </td>

                  <td style={{ padding: '12px 16px' }}>
                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        fontSize: 12,
                        color: '#4338ca',
                        background: 'rgba(99, 102, 241, 0.08)',
                        padding: '2px 7px',
                        borderRadius: 5,
                        display: 'inline-block',
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
                      <Package size={14} style={{ color: '#059669' }} />
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>
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
                        fontSize: 11.5,
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: 'var(--surface-subtle, #f1f5f9)',
                        color: 'var(--text, #334155)',
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
                    <button
                      onClick={() => handleDesvincular(item)}
                      disabled={desvinculandoId === item.id}
                      title="Desvincular equivalencia"
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--border, #cbd5e1)',
                        color: '#ef4444',
                        padding: '6px 10px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {desvinculandoId === item.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Trash2 size={13} />
                      )}
                      Desvincular
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
};

export default EquivalenciasTab;
