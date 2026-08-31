import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  Link2, Search, RefreshCw, Trash2, CheckCircle2,
  Building2, Loader2, BellOff, AlertTriangle, Ruler,
} from 'lucide-react';
import { toast } from 'react-toastify';
import API from '../../../../services/config';
import VincularCodigoModal, { CodigoPendienteItem } from '../modals/VincularCodigoModal';
import { ProveedorCompacto } from '../../ProveedoresPage';

interface Props {
  proveedores: ProveedorCompacto[];
  onActualizarContador?: () => void;
  onProveedoresCambiados?: () => void;
}

const formatCOP = (val: number | null | undefined): string => {
  if (val === null || val === undefined) return '—';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
};

const ETIQUETA_UNIDAD: Record<string, string> = {
  UNIDAD: 'Unidad',
  TIRA_6M: 'Tira 6 m',
  METRO: 'Metro',
  KG: 'Kilogramo',
  M2: 'm²',
};

const PorMapearTab: React.FC<Props> = ({ proveedores, onActualizarContador, onProveedoresCambiados }) => {
  const [pendientes, setPendientes] = useState<CodigoPendienteItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filtroProveedor, setFiltroProveedor] = useState('');
  const [orden, setOrden] = useState<'frecuencia' | 'reciente' | 'precio'>('frecuencia');

  const [itemParaVincular, setItemParaVincular] = useState<CodigoPendienteItem | null>(null);
  const [descartandoId, setDescartandoId] = useState<number | null>(null);
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [accionLote, setAccionLote] = useState(false);

  // El filtrado ocurre en el servidor: se espera a que el usuario deje de teclear
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [qAplicado, setQAplicado] = useState('');

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQAplicado(q.trim()), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q]);

  const cargarPendientes = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get<{ items: CodigoPendienteItem[]; total: number }>(
        `${API}/api/proveedores/codigos-pendientes`,
        { params: { q: qAplicado || undefined, proveedor_id: filtroProveedor || undefined, orden, limit: 200 } }
      );
      setPendientes(data.items ?? []);
      setTotal(data.total ?? 0);
      setSeleccion(new Set());
      if (onActualizarContador) onActualizarContador();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'No se pudo cargar la bandeja de códigos');
      setPendientes([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [qAplicado, filtroProveedor, orden, onActualizarContador]);

  useEffect(() => { cargarPendientes(); }, [cargarPendientes]);

  const handleDescartar = async (item: CodigoPendienteItem) => {
    if (!window.confirm(`¿Descartar el código "${item.codigo_proveedor}" (${item.descripcion_proveedor})?\n\nNo volverá a pedirse en futuras facturas.`)) {
      return;
    }
    setDescartandoId(item.id);
    try {
      await axios.patch(`${API}/api/proveedores/codigos-pendientes/${item.id}/descartar`, {});
      toast.info(`Código ${item.codigo_proveedor} descartado`);
      cargarPendientes();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'No se pudo descartar el código');
    } finally {
      setDescartandoId(null);
    }
  };

  const handleDescartarSeleccion = async () => {
    const ids = Array.from(seleccion);
    if (ids.length === 0) return;
    if (!window.confirm(`¿Descartar ${ids.length} código(s) seleccionado(s)?\n\nNo volverán a pedirse en futuras facturas.`)) return;

    setAccionLote(true);
    try {
      const { data } = await axios.post(`${API}/api/proveedores/codigos-pendientes/descartar-lote`, { ids });
      toast.success(data?.message ?? 'Códigos descartados');
      cargarPendientes();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'No se pudieron descartar los códigos');
    } finally {
      setAccionLote(false);
    }
  };

  /** Apaga el seguimiento del proveedor y limpia de un golpe todos sus pendientes */
  const handleDejarDeSeguir = async (proveedorId: number, nombre: string) => {
    if (!window.confirm(
      `¿Dejar de seguir precios de "${nombre}"?\n\nSus futuras facturas se registrarán pero no generarán códigos por mapear, y los que tenga ahora se descartarán.\n\nÚsalo para emisores que no son insumos: combustible, parqueaderos, papelería, servicios.`
    )) return;

    setAccionLote(true);
    try {
      const { data } = await axios.patch(`${API}/api/proveedores/${proveedorId}/seguimiento`, { seguir_precios: false });
      toast.success(data?.message ?? 'Proveedor excluido del seguimiento');
      cargarPendientes();
      if (onProveedoresCambiados) onProveedoresCambiados();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'No se pudo cambiar el seguimiento del proveedor');
    } finally {
      setAccionLote(false);
    }
  };

  const alternarSeleccion = (id: number) => {
    setSeleccion(prev => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id); else siguiente.add(id);
      return siguiente;
    });
  };

  const alternarTodos = () => {
    setSeleccion(prev => (prev.size === pendientes.length ? new Set() : new Set(pendientes.map(p => p.id))));
  };

  const botonSecundario: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'var(--surface, #fff)', border: '1px solid var(--border, #cbd5e1)',
    padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
    color: 'var(--text, #334155)', cursor: 'pointer',
  };

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border, #cbd5e1)',
    fontSize: 13, background: 'var(--surface, #fff)', color: 'var(--text, #0f172a)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Encabezado ── */}
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
              Bandeja de Códigos por Mapear
            </h2>
            <span
              style={{
                fontSize: 12, fontWeight: 700,
                color: total > 0 ? '#d97706' : '#059669',
                background: total > 0 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(5, 150, 105, 0.1)',
                padding: '2px 8px', borderRadius: 999,
              }}
            >
              {total} pendientes
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted, #64748b)', margin: '4px 0 0' }}>
            Códigos detectados en facturas electrónicas que aún no tienen equivalencia con tu catálogo interno
          </p>
        </div>

        <button onClick={cargarPendientes} disabled={loading} style={botonSecundario}>
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
            placeholder="Buscar por código de proveedor o descripción…"
            style={{ ...inputStyle, width: '100%', paddingLeft: 36 }}
          />
        </div>

        <select value={filtroProveedor} onChange={(e) => setFiltroProveedor(e.target.value)} style={inputStyle}>
          <option value="">Todos los proveedores</option>
          {proveedores.map((pr) => (
            <option key={pr.id} value={String(pr.id)}>{pr.nombre_comercial}</option>
          ))}
        </select>

        <select value={orden} onChange={(e) => setOrden(e.target.value as any)} style={inputStyle}>
          <option value="frecuencia">Ordenar: Más frecuentes primero (Impacto)</option>
          <option value="reciente">Ordenar: Más recientes primero</option>
          <option value="precio">Ordenar: Mayor precio detectado</option>
        </select>
      </div>

      {/* ── Barra de acciones sobre la selección ── */}
      {seleccion.size > 0 && (
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, flexWrap: 'wrap', background: 'rgba(99, 102, 241, 0.07)',
            border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: 12, padding: '10px 16px',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: '#4338ca' }}>
            {seleccion.size} código(s) seleccionado(s)
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setSeleccion(new Set())} style={botonSecundario}>
              Quitar selección
            </button>
            <button
              onClick={handleDescartarSeleccion}
              disabled={accionLote}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, background: '#ef4444',
                border: 'none', padding: '7px 14px', borderRadius: 8, fontSize: 12.5,
                fontWeight: 700, color: '#fff', cursor: accionLote ? 'wait' : 'pointer',
              }}
            >
              {accionLote ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              Descartar seleccionados
            </button>
          </div>
        </div>
      )}

      {/* ── Tabla ── */}
      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px', color: '#6366f1' }} />
          Cargando códigos pendientes…
        </div>
      ) : pendientes.length === 0 ? (
        <div
          style={{
            background: 'var(--surface, #ffffff)', border: '1px solid var(--border, #e2e8f0)',
            borderRadius: 16, padding: '48px 24px', textAlign: 'center',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          }}
        >
          <div
            style={{
              width: 50, height: 50, borderRadius: 999, background: 'rgba(5, 150, 105, 0.1)',
              color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <CheckCircle2 size={26} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text, #0f172a)' }}>
            {qAplicado || filtroProveedor ? 'Ningún código coincide con el filtro' : '¡No hay códigos pendientes por mapear!'}
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted, #64748b)', maxWidth: 460, margin: 0 }}>
            {qAplicado || filtroProveedor
              ? 'Prueba con otro término o quita el filtro de proveedor.'
              : 'Todos los códigos de tus facturas electrónicas están vinculados a productos internos o fueron descartados.'}
          </p>
        </div>
      ) : (
        <div
          style={{
            background: 'var(--surface, #ffffff)', border: '1px solid var(--border, #e2e8f0)',
            borderRadius: 16, overflowX: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--surface-subtle, #f8fafc)', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                <th style={{ padding: '12px 10px 12px 16px', width: 36 }}>
                  <input
                    type="checkbox"
                    checked={seleccion.size === pendientes.length && pendientes.length > 0}
                    onChange={alternarTodos}
                    title="Seleccionar todo lo visible"
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Proveedor</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Código Proveedor</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Descripción en Factura</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Precio Detectado</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)', textAlign: 'center' }}>Frecuencia</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-muted, #64748b)', textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pendientes.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--border, #f1f5f9)' }}>
                  <td style={{ padding: '12px 10px 12px 16px' }}>
                    <input
                      type="checkbox"
                      checked={seleccion.has(item.id)}
                      onChange={() => alternarSeleccion(item.id)}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>

                  <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text, #1e293b)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Building2 size={14} style={{ color: '#6366f1', flexShrink: 0 }} />
                      {item.proveedor?.nombre_comercial || `Proveedor #${item.proveedor_id}`}
                    </div>
                    <button
                      onClick={() => handleDejarDeSeguir(item.proveedor_id, item.proveedor?.nombre_comercial || 'este proveedor')}
                      disabled={accionLote}
                      title="Dejar de seguir precios de este proveedor y limpiar sus códigos"
                      style={{
                        marginTop: 4, background: 'none', border: 'none', padding: 0,
                        color: 'var(--text-muted, #94a3b8)', fontSize: 11, fontWeight: 600,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <BellOff size={11} /> No seguir precios
                    </button>
                  </td>

                  <td style={{ padding: '12px 16px' }}>
                    <span
                      style={{
                        fontFamily: 'monospace', fontWeight: 700, fontSize: 12,
                        background: 'rgba(99, 102, 241, 0.08)', color: '#4338ca',
                        padding: '3px 8px', borderRadius: 6,
                      }}
                    >
                      {item.codigo_proveedor}
                    </span>
                    {item.codigo_derivado && (
                      <div
                        title="El XML no traía código de producto: se generó a partir de la descripción"
                        style={{ fontSize: 10.5, color: '#b45309', marginTop: 4, display: 'flex', alignItems: 'center', gap: 3 }}
                      >
                        <AlertTriangle size={10} /> Código deducido
                      </div>
                    )}
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
                    {item.unidad_detectada && (
                      <div
                        style={{ fontSize: 11, color: '#4338ca', fontWeight: 600, marginTop: 3, display: 'flex', alignItems: 'center', gap: 3 }}
                        title="Unidad declarada en el XML de la factura"
                      >
                        <Ruler size={10} /> por {ETIQUETA_UNIDAD[item.unidad_detectada] ?? item.unidad_detectada}
                      </div>
                    )}
                  </td>

                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span
                      style={{
                        fontSize: 11.5, fontWeight: 700,
                        color: item.veces_visto > 1 ? '#d97706' : '#64748b',
                        background: item.veces_visto > 1 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(100, 116, 139, 0.08)',
                        padding: '2px 8px', borderRadius: 999,
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
                          background: '#6366f1', color: '#fff', border: 'none',
                          padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                          boxShadow: '0 2px 6px rgba(99, 102, 241, 0.25)',
                        }}
                      >
                        <Link2 size={13} /> Vincular
                      </button>

                      <button
                        onClick={() => handleDescartar(item)}
                        disabled={descartandoId === item.id}
                        title="Descartar código (fletes, papelería, gastos que no son producto)"
                        style={{
                          background: 'transparent', color: 'var(--text-muted, #94a3b8)',
                          border: '1px solid var(--border, #cbd5e1)', padding: '6px 10px',
                          borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        {descartandoId === item.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        Descartar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {total > pendientes.length && (
            <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-muted, #64748b)', borderTop: '1px solid var(--border, #f1f5f9)' }}>
              Mostrando {pendientes.length} de {total}. Usa el buscador o el filtro de proveedor para acotar la lista.
            </div>
          )}
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
