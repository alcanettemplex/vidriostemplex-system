import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Link2, Search, Loader2, AlertCircle, CheckCircle2,
  Package, Tag, PlusCircle, Building2, TrendingUp, Sparkles
} from 'lucide-react';
import { toast } from 'react-toastify';
import API from '../../../../services/config';

export interface CodigoPendienteItem {
  id: number;
  proveedor_id: number;
  proveedor_nombre?: string;
  proveedor?: { id: number; nombre_comercial: string; nit: string | null };
  codigo_proveedor: string;
  descripcion_proveedor: string;
  precio_detectado: number | null;
  documento_ref?: string | null;
  veces_visto: number;
  fecha_deteccion?: string;
  estado: string;
}

interface ProductoCatalogo {
  id: number;
  codigo: string;
  nombre: string;
  unidad_medida?: string | null;
  porcentaje_iva: number;
  es_aluminio: boolean;
  precios_existentes?: Array<{
    proveedor_nombre: string;
    unidad_compra: string;
    precio_actual: number;
  }>;
}

interface Props {
  pendiente: CodigoPendienteItem;
  onClose: () => void;
  onVinculado: () => void;
  onCrearProducto?: (codigoSugerido: string, descripcionSugerida: string) => void;
}

const MODALIDADES = [
  { value: 'UNIDAD', label: 'Por unidad' },
  { value: 'TIRA_6M', label: 'Por tira de 6 m (perfilería)' },
  { value: 'METRO', label: 'Por metro (fraccionado)' },
  { value: 'KG', label: 'Por kilogramo' },
  { value: 'M2', label: 'Por m²' },
];

const formatCOP = (val: number | null | undefined): string => {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
};

const VincularCodigoModal: React.FC<Props> = ({
  pendiente,
  onClose,
  onVinculado,
  onCrearProducto,
}) => {
  const [busqueda, setBusqueda] = useState(pendiente.descripcion_proveedor || pendiente.codigo_proveedor || '');
  const [productos, setProductos] = useState<ProductoCatalogo[]>([]);
  const [loadingBusqueda, setLoadingBusqueda] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState<ProductoCatalogo | null>(null);
  const [preciosComparativos, setPreciosComparativos] = useState<any[]>([]);
  const [loadingPreciosComp, setLoadingPreciosComp] = useState(false);

  const [unidadCompra, setUnidadCompra] = useState('UNIDAD');
  const [precio, setPrecio] = useState(pendiente.precio_detectado ? String(pendiente.precio_detectado) : '');
  const [guardarAlias, setGuardarAlias] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const token = sessionStorage.getItem('token') || localStorage.getItem('token');
  const nombreProveedor = pendiente.proveedor?.nombre_comercial || pendiente.proveedor_nombre || `Proveedor #${pendiente.proveedor_id}`;

  // Búsqueda en catálogo (por código, nombre y alias)
  useEffect(() => {
    if (!busqueda.trim() || busqueda.length < 2) {
      setProductos([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoadingBusqueda(true);
      try {
        const { data } = await axios.get<ProductoCatalogo[]>(`${API}/api/catalogo`, {
          params: { q: busqueda },
          headers: { Authorization: `Bearer ${token}` },
        });
        setProductos(data.slice(0, 8));
      } catch {
        setProductos([]);
      } finally {
        setLoadingBusqueda(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [busqueda, token]);

  // Al seleccionar producto, cargar precios existentes de otros proveedores para comparar
  const handleSelectProducto = async (p: ProductoCatalogo) => {
    setProductoSeleccionado(p);
    setLoadingPreciosComp(true);
    setPreciosComparativos([]);

    try {
      const { data } = await axios.get(`${API}/api/proveedores/precios`, {
        params: { producto_id: p.id },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (data?.precios) {
        setPreciosComparativos(data.precios);
      }
    } catch {
      // no crítico si falla la consulta secundaria
    } finally {
      setLoadingPreciosComp(false);
    }
  };

  const handleVincular = async () => {
    if (!productoSeleccionado) {
      toast.warning('Selecciona un producto del catálogo interno');
      return;
    }
    const precioNum = parseFloat(precio);
    if (isNaN(precioNum) || precioNum <= 0) {
      toast.warning('Ingresa un precio válido');
      return;
    }

    setGuardando(true);
    try {
      await axios.post(
        `${API}/api/proveedores/codigos-pendientes/${pendiente.id}/vincular`,
        {
          catalogo_producto_id: productoSeleccionado.id,
          unidad_compra: unidadCompra,
          precio: precioNum,
          guardar_alias: guardarAlias,
          descripcion_alias: pendiente.descripcion_proveedor,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      toast.success(
        `Código ${pendiente.codigo_proveedor} vinculado con éxito a ${productoSeleccionado.codigo}`
      );
      onVinculado();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al vincular el código');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          style={{
            background: 'var(--surface, #ffffff)',
            color: 'var(--text, #1e293b)',
            borderRadius: 20,
            width: '100%',
            maxWidth: 820,
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid var(--border, #e2e8f0)',
            overflow: 'hidden'
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border, #e2e8f0)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--surface-subtle, #f8fafc)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: 'rgba(99, 102, 241, 0.12)', color: '#6366f1',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <Link2 size={20} />
              </div>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text, #0f172a)' }}>
                  Vincular Código de Proveedor
                </h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted, #64748b)', margin: '2px 0 0' }}>
                  Asocia este código del proveedor a un producto interno para aprender su equivalencia
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted, #94a3b8)', padding: 6, borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Body dividida en 2 columnas */}
          <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: 20 }}>
              
              {/* Columna Izquierda: Lo que dice el proveedor */}
              <div
                style={{
                  background: 'var(--surface-subtle, #f8fafc)',
                  border: '1px solid var(--border, #e2e8f0)',
                  borderRadius: 14,
                  padding: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6366f1', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <Building2 size={14} />
                  El Proveedor Dice
                </div>

                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', marginBottom: 2 }}>Proveedor</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text, #0f172a)' }}>{nombreProveedor}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', marginBottom: 2 }}>Código Proveedor</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#0f172a', background: 'rgba(99, 102, 241, 0.08)', padding: '3px 8px', borderRadius: 6, display: 'inline-block' }}>
                      {pendiente.codigo_proveedor}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', marginBottom: 2 }}>Frecuencia</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', padding: '3px 8px', borderRadius: 6, display: 'inline-block' }}>
                      Visto {pendiente.veces_visto} vez/veces
                    </div>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', marginBottom: 2 }}>Descripción en Factura</div>
                  <div style={{ fontSize: 13, color: 'var(--text, #1e293b)', lineHeight: 1.4, background: 'var(--surface, #fff)', padding: 10, borderRadius: 8, border: '1px solid var(--border, #e2e8f0)' }}>
                    {pendiente.descripcion_proveedor || 'Sin descripción'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', marginBottom: 2 }}>Precio Detectado en XML</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#059669' }}>
                    {formatCOP(pendiente.precio_detectado)} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted, #64748b)' }}>(sin IVA)</span>
                  </div>
                  {pendiente.documento_ref && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)', marginTop: 2 }}>
                      Doc ref: {pendiente.documento_ref}
                    </div>
                  )}
                </div>

                {/* Switch de aprendizaje de alias */}
                <label
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 'auto',
                    padding: 10, background: 'rgba(99, 102, 241, 0.06)', borderRadius: 8,
                    cursor: 'pointer', border: '1px solid rgba(99, 102, 241, 0.15)'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={guardarAlias}
                    onChange={(e) => setGuardarAlias(e.target.checked)}
                    style={{ marginTop: 2 }}
                  />
                  <div style={{ fontSize: 11.5, color: '#4338ca', lineHeight: 1.35 }}>
                    <span style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Sparkles size={12} /> Recordar como sinónimo/alias
                    </span>
                    Guardar esta descripción para auto-sugerir en futuras facturas.
                  </div>
                </label>
              </div>

              {/* Columna Derecha: ¿A cuál de mis productos? */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#059669', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <Package size={14} />
                    ¿A cuál de mis productos?
                  </div>
                  {onCrearProducto && (
                    <button
                      type="button"
                      onClick={() => onCrearProducto(pendiente.codigo_proveedor, pendiente.descripcion_proveedor)}
                      style={{
                        background: 'none', border: 'none', color: '#6366f1',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4
                      }}
                    >
                      <PlusCircle size={13} /> Crear en catálogo
                    </button>
                  )}
                </div>

                {/* Input Buscador */}
                <div style={{ position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted, #94a3b8)' }} />
                  <input
                    type="text"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar por código, nombre o sinónimo..."
                    style={{
                      width: '100%', padding: '10px 36px 10px 38px',
                      borderRadius: 10, border: '1px solid var(--border, #cbd5e1)',
                      fontSize: 13, outline: 'none', background: 'var(--surface, #fff)',
                      color: 'var(--text, #0f172a)'
                    }}
                  />
                  {loadingBusqueda && (
                    <Loader2 size={16} className="animate-spin" style={{ position: 'absolute', right: 12, top: 12, color: '#6366f1' }} />
                  )}
                </div>

                {/* Lista de sugerencias de catálogo */}
                <div
                  style={{
                    maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border, #e2e8f0)',
                    borderRadius: 10, background: 'var(--surface-subtle, #f8fafc)', padding: 6
                  }}
                >
                  {productos.length === 0 ? (
                    <div style={{ padding: '16px 12px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #94a3b8)' }}>
                      {loadingBusqueda ? 'Buscando coincidencias...' : 'Escribe para buscar en tu catálogo de productos'}
                    </div>
                  ) : (
                    productos.map((p) => {
                      const isSelected = productoSeleccionado?.id === p.id;
                      return (
                        <div
                          key={p.id}
                          onClick={() => handleSelectProducto(p)}
                          style={{
                            padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            background: isSelected ? '#6366f1' : 'transparent',
                            color: isSelected ? '#fff' : 'var(--text, #1e293b)',
                            marginBottom: 4, transition: 'all 0.15s'
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, opacity: isSelected ? 1 : 0.85 }}>
                                {p.codigo}
                              </span>
                              {p.es_aluminio && (
                                <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)' }}>
                                  Aluminio
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 12.5, fontWeight: 500, marginTop: 2 }}>{p.nombre}</div>
                          </div>
                          {isSelected && <CheckCircle2 size={16} />}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Si hay un producto seleccionado: comparador con otros proveedores */}
                {productoSeleccionado && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      background: 'rgba(99, 102, 241, 0.04)',
                      border: '1px solid rgba(99, 102, 241, 0.2)',
                      borderRadius: 12, padding: 12
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#4338ca', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <TrendingUp size={13} />
                      Comparador instantáneo para {productoSeleccionado.codigo}
                    </div>

                    {loadingPreciosComp ? (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Loader2 size={12} className="animate-spin" /> Verificando otros proveedores...
                      </div>
                    ) : preciosComparativos.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                          Ya lo compras a los siguientes proveedores:
                        </div>
                        {preciosComparativos.slice(0, 3).map((pc: any, i) => (
                          <div
                            key={i}
                            style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              fontSize: 12, background: 'var(--surface, #fff)', padding: '4px 8px', borderRadius: 6,
                              border: '1px solid var(--border, #e2e8f0)'
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>{pc.proveedor?.nombre_comercial}</span>
                            <span style={{ fontWeight: 700, color: '#059669' }}>
                              {formatCOP(pc.precio_sin_iva)} ({pc.unidad_compra})
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                        Este producto aún no tiene precios registrados de ningún proveedor. ¡Será el primero!
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Inputs de Vinculación (Modalidad y Precio) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12, marginTop: 4 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)', display: 'block', marginBottom: 4 }}>
                      Modalidad de compra
                    </label>
                    <select
                      value={unidadCompra}
                      onChange={(e) => setUnidadCompra(e.target.value)}
                      style={{
                        width: '100%', padding: '8px 10px', borderRadius: 8,
                        border: '1px solid var(--border, #cbd5e1)', fontSize: 12.5,
                        background: 'var(--surface, #fff)', color: 'var(--text, #0f172a)'
                      }}
                    >
                      {MODALIDADES.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)', display: 'block', marginBottom: 4 }}>
                      Precio vigente (sin IVA)
                    </label>
                    <input
                      type="number"
                      value={precio}
                      onChange={(e) => setPrecio(e.target.value)}
                      placeholder="45000"
                      style={{
                        width: '100%', padding: '8px 10px', borderRadius: 8,
                        border: '1px solid var(--border, #cbd5e1)', fontSize: 13,
                        fontWeight: 700, background: 'var(--surface, #fff)', color: 'var(--text, #0f172a)'
                      }}
                    />
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--border, #e2e8f0)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 12,
              background: 'var(--surface-subtle, #f8fafc)'
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={guardando}
              style={{
                padding: '9px 18px', borderRadius: 10, border: '1px solid var(--border, #cbd5e1)',
                background: 'transparent', color: 'var(--text, #475569)', fontSize: 13,
                fontWeight: 600, cursor: 'pointer'
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleVincular}
              disabled={guardando || !productoSeleccionado}
              style={{
                padding: '9px 20px', borderRadius: 10, border: 'none',
                background: productoSeleccionado ? '#6366f1' : '#94a3b8',
                color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: productoSeleccionado ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', gap: 8,
                boxShadow: productoSeleccionado ? '0 4px 12px rgba(99, 102, 241, 0.35)' : 'none'
              }}
            >
              {guardando ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Vinculando...
                </>
              ) : (
                <>
                  <Link2 size={16} /> Confirmar Vinculación
                </>
              )}
            </button>
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default VincularCodigoModal;
