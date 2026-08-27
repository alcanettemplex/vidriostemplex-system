import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Link2, Search, Filter, RefreshCw, Trash2, CheckCircle2,
  AlertTriangle, Package, Building2, TrendingUp, Sparkles,
  Loader2, ArrowUpDown, PlusCircle, HelpCircle
} from 'lucide-react';
import { toast } from 'react-toastify';
import API from '../../../../services/config';
import VincularCodigoModal, { CodigoPendienteItem } from '../modals/VincularCodigoModal';

interface Props {
  onActualizarContador?: () => void;
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

const PorMapearTab: React.FC<Props> = ({ onActualizarContador }) => {
  const [pendientes, setPendientes] = useState<CodigoPendienteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filtroProveedor, setFiltroProveedor] = useState('');
  const [proveedores, setProveedores] = useState<Array<{ id: number; nombre_comercial: string }>>([]);
  const [orden, setOrden] = useState<'frecuencia' | 'reciente' | 'precio'>('frecuencia');

  const [itemParaVincular, setItemParaVincular] = useState<CodigoPendienteItem | null>(null);
  const [descartandoId, setDescartandoId] = useState<number | null>(null);

  const token = sessionStorage.getItem('token') || localStorage.getItem('token');

  const cargarPendientes = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get<CodigoPendienteItem[]>(
        `${API}/api/proveedores/codigos-pendientes`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setPendientes(data);
      if (onActualizarContador) onActualizarContador();
    } catch {
      // Fallback si la ruta no tiene registros
      setPendientes([]);
    } finally {
      setLoading(false);
    }
  }, [token, onActualizarContador]);

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
    cargarPendientes();
    cargarProveedores();
  }, [cargarPendientes, cargarProveedores]);

  const handleDescartar = async (item: CodigoPendienteItem) => {
    if (!window.confirm(`¿Descartar el código "${item.codigo_proveedor}" (${item.descripcion_proveedor})? No volverá a solicitarse en futuras facturas.`)) {
      return;
    }

    setDescartandoId(item.id);
    try {
      await axios.patch(
        `${API}/api/proveedores/codigos-pendientes/${item.id}/descartar`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.info(`Código ${item.codigo_proveedor} descartado`);
      cargarPendientes();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al descartar código');
    } finally {
      setDescartandoId(null);
    }
  };

  // Filtrado y ordenamiento en memoria
  const pendientesFiltrados = pendientes
    .filter((p) => {
      const matchProv = filtroProveedor ? String(p.proveedor_id) === filtroProveedor : true;
      const term = q.toLowerCase();
      const matchQ = !term
        || p.codigo_proveedor?.toLowerCase().includes(term)
        || p.descripcion_proveedor?.toLowerCase().includes(term)
        || p.proveedor?.nombre_comercial?.toLowerCase().includes(term);
      return matchProv && matchQ;
    })
    .sort((a, b) => {
      if (orden === 'frecuencia') return (b.veces_visto || 1) - (a.veces_visto || 1);
      if (orden === 'precio') return (b.precio_detectado || 0) - (a.precio_detectado || 0);
      return new Date(b.fecha_deteccion || '').getTime() - new Date(a.fecha_deteccion || '').getTime();
    });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Encabezado y Explicación ── */}
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
              Bandeja de Códigos por Mapear
            </h2>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: pendientes.length > 0 ? '#d97706' : '#059669',
                background: pendientes.length > 0 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(5, 150, 105, 0.1)',
                padding: '2px 8px',
                borderRadius: 999,
              }}
            >
              {pendientes.length} pendientes
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted, #64748b)', margin: '4px 0 0' }}>
            Códigos detectados en facturas electrónicas que aún no tienen equivalencia con tu catálogo interno
          </p>
        </div>

        <button
          onClick={cargarPendientes}
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

      {/* ── Filtros y Búsqueda ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: 10, color: 'var(--text-muted, #94a3b8)' }} />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por código de proveedor, descripción..."
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
          value={orden}
          onChange={(e) => setOrden(e.target.value as any)}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--border, #cbd5e1)',
            fontSize: 13,
            background: 'var(--surface, #fff)',
            color: 'var(--text, #0f172a)',
          }}
        >
          <option value="frecuencia">Ordenar: Más frecuentes primero (Impacto)</option>
          <option value="reciente">Ordenar: Más recientes primero</option>
          <option value="precio">Ordenar: Mayor precio detectado</option>
        </select>
      </div>

      {/* ── Tabla de Códigos Pendientes ── */}
      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px', color: '#6366f1' }} />
          Cargando códigos pendientes...
        </div>
      ) : pendientesFiltrados.length === 0 ? (
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
              background: 'rgba(5, 150, 105, 0.1)',
              color: '#059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CheckCircle2 size={26} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text, #0f172a)' }}>
            ¡No hay códigos pendientes por mapear!
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted, #64748b)', maxWidth: 460, margin: 0 }}>
            Todos los códigos de tus facturas electrónicas están vinculados a productos internos o fueron descartados debidamente.
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
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Descripción en Factura</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Precio Detectado</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)', textAlign: 'center' }}>Frecuencia</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)', textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pendientesFiltrados.map((item) => (
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
                      {item.proveedor?.nombre_comercial || `Proveedor #${item.proveedor_id}`}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        fontSize: 12,
                        background: 'rgba(99, 102, 241, 0.08)',
                        color: '#4338ca',
                        padding: '3px 8px',
                        borderRadius: 6,
                      }}
                    >
                      {item.codigo_proveedor}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text, #334155)', maxWidth: 280 }}>
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.descripcion_proveedor || 'Sin descripción'}
                    </div>
                    {item.documento_ref && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)', marginTop: 2 }}>
                        Ref: {item.documento_ref}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: '#059669' }}>
                    {formatCOP(item.precio_detectado)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: item.veces_visto > 1 ? '#d97706' : '#64748b',
                        background: item.veces_visto > 1 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(100, 116, 139, 0.08)',
                        padding: '2px 8px',
                        borderRadius: 999,
                      }}
                    >
                      {item.veces_visto} ×
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => setItemParaVincular(item)}
                        style={{
                          background: '#6366f1',
                          color: '#fff',
                          border: 'none',
                          padding: '6px 12px',
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          boxShadow: '0 2px 6px rgba(99, 102, 241, 0.25)',
                        }}
                      >
                        <Link2 size={13} /> Vincular
                      </button>

                      <button
                        onClick={() => handleDescartar(item)}
                        disabled={descartandoId === item.id}
                        title="Descartar código (fletes, papelería, gastos no producto)"
                        style={{
                          background: 'transparent',
                          color: 'var(--text-muted, #94a3b8)',
                          border: '1px solid var(--border, #cbd5e1)',
                          padding: '6px 10px',
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        {descartandoId === item.id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Trash2 size={13} />
                        )}
                        Descartar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal de Vinculación ── */}
      {itemParaVincular && (
        <VincularCodigoModal
          pendiente={itemParaVincular}
          onClose={() => setItemParaVincular(null)}
          onVinculado={() => {
            setItemParaVincular(null);
            cargarPendientes();
          }}
        />
      )}

    </div>
  );
};

export default PorMapearTab;
