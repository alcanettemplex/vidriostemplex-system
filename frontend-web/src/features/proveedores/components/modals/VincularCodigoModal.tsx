import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Link2, Search, Loader2, CheckCircle2,
  Package, PlusCircle, Building2, TrendingUp, Sparkles, Ruler, AlertTriangle,
} from 'lucide-react';
import { toast } from 'react-toastify';
import API from '../../../../services/config';

export interface CodigoPendienteItem {
  id: number;
  proveedor_id: number;
  proveedor_nombre?: string;
  proveedor?: { id: number; nombre_comercial: string; nit: string | null; seguir_precios?: boolean };
  codigo_proveedor: string;
  descripcion_proveedor: string;
  precio_detectado: number | null;
  documento_ref?: string | null;
  veces_visto: number;
  fecha_deteccion?: string;
  estado: string;
  unidad_detectada?: string | null;
  porcentaje_iva_detectado?: number | null;
  codigo_derivado?: boolean;
}

interface ProductoCatalogo {
  id: number;
  codigo: string;
  nombre: string;
  unidad_medida?: string | null;
  porcentaje_iva: number;
  es_aluminio: boolean;
  /** Alias aprendido de un mapeo anterior que hizo coincidir a este producto */
  coincide_por_alias?: string | null;
}

interface Props {
  pendiente: CodigoPendienteItem;
  onClose: () => void;
  onVinculado: () => void;
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

const formatFecha = (val: string | null | undefined): string => {
  if (!val) return '';
  const [y, m, d] = val.split('T')[0].split('-');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d}-${meses[parseInt(m) - 1]}-${y.slice(2)}`;
};

const VincularCodigoModal: React.FC<Props> = ({ pendiente, onClose, onVinculado }) => {
  const [busqueda, setBusqueda] = useState(pendiente.descripcion_proveedor || pendiente.codigo_proveedor || '');
  const [productos, setProductos] = useState<ProductoCatalogo[]>([]);
  const [loadingBusqueda, setLoadingBusqueda] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState<ProductoCatalogo | null>(null);
  const [preciosComparativos, setPreciosComparativos] = useState<any[]>([]);
  const [loadingPreciosComp, setLoadingPreciosComp] = useState(false);

  // La unidad que venía en el XML manda como sugerencia: es el dato del proveedor,
  // no una suposición. Solo se guarda cuando el unitCode era informativo.
  const [unidadCompra, setUnidadCompra] = useState(pendiente.unidad_detectada || 'UNIDAD');
  const [precio, setPrecio] = useState(pendiente.precio_detectado ? String(pendiente.precio_detectado) : '');
  const [guardarAlias, setGuardarAlias] = useState(true);
  const [guardando, setGuardando] = useState(false);

  // Alta rápida en catálogo cuando el código no corresponde a ningún producto interno
  const [creandoProducto, setCreandoProducto] = useState(false);
  const [nuevoProducto, setNuevoProducto] = useState({
    codigo: '',
    nombre: pendiente.descripcion_proveedor || '',
    categoria: 'GENERAL',
    es_aluminio: false,
    porcentaje_iva: pendiente.porcentaje_iva_detectado ?? 19,
  });
  const [guardandoProducto, setGuardandoProducto] = useState(false);

  const nombreProveedor = pendiente.proveedor?.nombre_comercial || pendiente.proveedor_nombre || `Proveedor #${pendiente.proveedor_id}`;

  // Búsqueda en catálogo (por código, nombre y descripción)
  useEffect(() => {
    if (!busqueda.trim() || busqueda.length < 2) {
      setProductos([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoadingBusqueda(true);
      try {
        const { data } = await axios.get<ProductoCatalogo[]>(`${API}/api/catalogo`, {
          params: { q: busqueda.trim(), limit: 30 },
        });
        setProductos(Array.isArray(data) ? data : []);
      } catch {
        setProductos([]);
      } finally {
        setLoadingBusqueda(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [busqueda]);

  const handleSelectProducto = async (p: ProductoCatalogo) => {
    setProductoSeleccionado(p);
    setLoadingPreciosComp(true);
    setPreciosComparativos([]);

    // Si el producto es de aluminio y el XML no precisó unidad, la tira es lo habitual
    if (p.es_aluminio && !pendiente.unidad_detectada && unidadCompra === 'UNIDAD') {
      setUnidadCompra('TIRA_6M');
    }

    try {
      const { data } = await axios.get(`${API}/api/proveedores/precios`, { params: { producto_id: p.id } });
      if (data?.precios) setPreciosComparativos(data.precios);
    } catch {
      // no crítico si falla la consulta secundaria
    } finally {
      setLoadingPreciosComp(false);
    }
  };

  const handleCrearProducto = async () => {
    if (!nuevoProducto.nombre.trim()) {
      toast.warning('Escribe el nombre del producto');
      return;
    }
    setGuardandoProducto(true);
    try {
      const { data } = await axios.post<ProductoCatalogo>(`${API}/api/catalogo`, {
        codigo: nuevoProducto.codigo.trim() || undefined,
        nombre: nuevoProducto.nombre.trim(),
        categoria: nuevoProducto.categoria.trim() || 'GENERAL',
        es_aluminio: nuevoProducto.es_aluminio,
        porcentaje_iva: Number(nuevoProducto.porcentaje_iva) || 19,
        activo: true,
      });
      toast.success(`Producto ${data.codigo} creado en el catálogo`);
      setCreandoProducto(false);
      setProductos([data]);
      handleSelectProducto(data);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'No se pudo crear el producto');
    } finally {
      setGuardandoProducto(false);
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
      const fechaFactura = pendiente.fecha_deteccion ? pendiente.fecha_deteccion.split('T')[0] : '';
      await axios.post(`${API}/api/proveedores/codigos-pendientes/${pendiente.id}/vincular`, {
        catalogo_producto_id: productoSeleccionado.id,
        unidad_compra: unidadCompra,
        precio: precioNum,
        fecha_precio: fechaFactura || undefined,
        guardar_alias: guardarAlias,
        descripcion_alias: pendiente.descripcion_proveedor || undefined,
      });

      toast.success(`Código ${pendiente.codigo_proveedor} vinculado a ${productoSeleccionado.codigo}`);
      onVinculado();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'No se pudo vincular el código');
    } finally {
      setGuardando(false);
    }
  };

  const inputChico: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1px solid var(--border, #cbd5e1)', fontSize: 12.5,
    background: 'var(--surface, #fff)', color: 'var(--text, #0f172a)',
  };

  const etiquetaChica: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #64748b)',
    display: 'block', marginBottom: 4,
  };

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          style={{
            background: 'var(--surface, #ffffff)', color: 'var(--text, #1e293b)',
            borderRadius: 20, width: '100%', maxWidth: 820, maxHeight: '90vh',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid var(--border, #e2e8f0)', overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '20px 24px', borderBottom: '1px solid var(--border, #e2e8f0)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'var(--surface-subtle, #f8fafc)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: 'rgba(99, 102, 241, 0.12)', color: '#6366f1',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
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
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: 20 }}>

              {/* Columna Izquierda: lo que dice el proveedor */}
              <div
                style={{
                  background: 'var(--surface-subtle, #f8fafc)',
                  border: '1px solid var(--border, #e2e8f0)',
                  borderRadius: 14, padding: 18,
                  display: 'flex', flexDirection: 'column', gap: 14,
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
                    {pendiente.codigo_derivado && (
                      <div style={{ fontSize: 10.5, color: '#b45309', marginTop: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
                        <AlertTriangle size={10} /> Deducido de la descripción
                      </div>
                    )}
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
                    {formatCOP(pendiente.precio_detectado)}{' '}
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted, #64748b)' }}>(sin IVA)</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted, #64748b)', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {pendiente.unidad_detectada && (
                      <span style={{ color: '#4338ca', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Ruler size={11} /> Facturado por {MODALIDADES.find(m => m.value === pendiente.unidad_detectada)?.label ?? pendiente.unidad_detectada}
                      </span>
                    )}
                    {pendiente.porcentaje_iva_detectado !== null && pendiente.porcentaje_iva_detectado !== undefined && (
                      <span>IVA en la factura: {pendiente.porcentaje_iva_detectado}%</span>
                    )}
                    {pendiente.fecha_deteccion && (
                      <span style={{ color: '#4338ca', fontWeight: 600 }}>
                        📅 Fecha Factura / XML: {formatFecha(pendiente.fecha_deteccion)}
                      </span>
                    )}
                    {pendiente.documento_ref && (
                      <span style={{ color: 'var(--text-muted, #94a3b8)' }}>Doc ref: {pendiente.documento_ref}</span>
                    )}
                  </div>
                </div>

                <label
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 'auto',
                    padding: 10, background: 'rgba(99, 102, 241, 0.06)', borderRadius: 8,
                    cursor: 'pointer', border: '1px solid rgba(99, 102, 241, 0.15)',
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

              {/* Columna Derecha: producto interno */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#059669', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <Package size={14} />
                    ¿A cuál de mis productos?
                  </div>
                  <button
                    type="button"
                    onClick={() => setCreandoProducto(v => !v)}
                    style={{
                      background: 'none', border: 'none', color: '#6366f1',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    <PlusCircle size={13} /> {creandoProducto ? 'Cancelar' : 'Crear en catálogo'}
                  </button>
                </div>

                {/* Alta rápida en catálogo */}
                {creandoProducto ? (
                  <div
                    style={{
                      border: '1px solid rgba(5, 150, 105, 0.3)', background: 'rgba(5, 150, 105, 0.05)',
                      borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
                    }}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#047857' }}>
                      Nuevo producto del catálogo interno
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>
                      <div>
                        <label style={etiquetaChica}>Código</label>
                        <input
                          value={nuevoProducto.codigo}
                          onChange={(e) => setNuevoProducto(p => ({ ...p, codigo: e.target.value.toUpperCase() }))}
                          placeholder="Automático"
                          style={{ ...inputChico, fontFamily: 'monospace' }}
                        />
                      </div>
                      <div>
                        <label style={etiquetaChica}>Nombre *</label>
                        <input
                          value={nuevoProducto.nombre}
                          onChange={(e) => setNuevoProducto(p => ({ ...p, nombre: e.target.value }))}
                          placeholder="Ej: Brazo hidráulico 100 kg"
                          style={inputChico}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
                      <div>
                        <label style={etiquetaChica}>Categoría</label>
                        <input
                          value={nuevoProducto.categoria}
                          onChange={(e) => setNuevoProducto(p => ({ ...p, categoria: e.target.value }))}
                          style={inputChico}
                        />
                      </div>
                      <div>
                        <label style={etiquetaChica}>IVA %</label>
                        <input
                          type="number"
                          value={nuevoProducto.porcentaje_iva}
                          onChange={(e) => setNuevoProducto(p => ({ ...p, porcentaje_iva: Number(e.target.value) }))}
                          style={inputChico}
                        />
                      </div>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={nuevoProducto.es_aluminio}
                        onChange={(e) => setNuevoProducto(p => ({ ...p, es_aluminio: e.target.checked }))}
                      />
                      Es perfilería de aluminio
                    </label>

                    <button
                      type="button"
                      onClick={handleCrearProducto}
                      disabled={guardandoProducto}
                      style={{
                        alignSelf: 'flex-start', background: '#059669', color: '#fff', border: 'none',
                        padding: '7px 16px', borderRadius: 8, fontSize: 12.5, fontWeight: 700,
                        cursor: guardandoProducto ? 'wait' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      {guardandoProducto ? <Loader2 size={13} className="animate-spin" /> : <PlusCircle size={13} />}
                      Crear y seleccionar
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Buscador */}
                    <div style={{ position: 'relative' }}>
                      <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted, #94a3b8)' }} />
                      <input
                        type="text"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Buscar por código (ej. TUB0103), nombre o sinónimo…"
                        style={{
                          width: '100%', padding: '10px 36px 10px 38px',
                          borderRadius: 10, border: '1px solid var(--border, #cbd5e1)',
                          fontSize: 13, outline: 'none', background: 'var(--surface, #fff)',
                          color: 'var(--text, #0f172a)',
                        }}
                      />
                      {busqueda && !loadingBusqueda && (
                        <button
                          type="button"
                          onClick={() => setBusqueda('')}
                          style={{
                            position: 'absolute', right: 10, top: 10,
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-muted, #94a3b8)', padding: 2,
                          }}
                          title="Limpiar búsqueda"
                        >
                          <X size={15} />
                        </button>
                      )}
                      {loadingBusqueda && (
                        <Loader2 size={16} className="animate-spin" style={{ position: 'absolute', right: 12, top: 12, color: '#6366f1' }} />
                      )}
                    </div>

                    {/* Sugerencias */}
                    <div
                      style={{
                        maxHeight: 230, overflowY: 'auto', border: '1px solid var(--border, #e2e8f0)',
                        borderRadius: 10, background: 'var(--surface-subtle, #f8fafc)', padding: 6,
                      }}
                    >
                      {productos.length === 0 ? (
                        <div style={{ padding: '18px 12px', textAlign: 'center', fontSize: 12.5, color: 'var(--text-muted, #94a3b8)' }}>
                          {loadingBusqueda
                            ? 'Buscando coincidencias en tu catálogo…'
                            : busqueda.trim().length >= 2
                              ? 'Sin coincidencias. Prueba otro término o crea el producto en el catálogo.'
                              : 'Escribe el código o nombre para buscar en tu catálogo'}
                        </div>
                      ) : (
                        productos.map((p) => {
                          const isSelected = productoSeleccionado?.id === p.id;
                          return (
                            <div
                              key={p.id}
                              onClick={() => handleSelectProducto(p)}
                              style={{
                                padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                background: isSelected ? '#6366f1' : 'var(--surface, #fff)',
                                color: isSelected ? '#fff' : 'var(--text, #1e293b)',
                                border: isSelected ? '1px solid #6366f1' : '1px solid var(--border, #f1f5f9)',
                                marginBottom: 5, transition: 'all 0.15s',
                                boxShadow: isSelected ? '0 2px 8px rgba(99, 102, 241, 0.2)' : 'none',
                              }}
                            >
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  {p.codigo ? (
                                    <span
                                      style={{
                                        fontFamily: 'monospace', fontWeight: 800, fontSize: 12,
                                        padding: '2px 7px', borderRadius: 5,
                                        background: isSelected ? 'rgba(255,255,255,0.25)' : 'rgba(99, 102, 241, 0.1)',
                                        color: isSelected ? '#fff' : '#4338ca',
                                      }}
                                    >
                                      {p.codigo}
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: 11, color: isSelected ? '#e0e7ff' : '#94a3b8' }}>(Sin código)</span>
                                  )}
                                  {p.es_aluminio && (
                                    <span
                                      style={{
                                        fontSize: 10, padding: '1px 5px', borderRadius: 4,
                                        background: isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)',
                                        color: isSelected ? '#fff' : '#475569', fontWeight: 600,
                                      }}
                                    >
                                      Aluminio
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: 12.5, fontWeight: 500, marginTop: 3 }}>{p.nombre}</div>
                                {p.coincide_por_alias && (
                                  <div
                                    title="Este producto no coincide por código ni por nombre: lo reconoce un sinónimo aprendido en un mapeo anterior"
                                    style={{
                                      fontSize: 10.5, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4,
                                      color: isSelected ? '#e0e7ff' : '#7c3aed', fontWeight: 600,
                                    }}
                                  >
                                    <Sparkles size={10} /> alias «{p.coincide_por_alias}»
                                  </div>
                                )}
                              </div>
                              {isSelected && <CheckCircle2 size={17} />}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                )}

                {/* Comparador con otros proveedores */}
                {productoSeleccionado && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      background: 'rgba(99, 102, 241, 0.04)',
                      border: '1px solid rgba(99, 102, 241, 0.2)',
                      borderRadius: 12, padding: 12,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#4338ca', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <TrendingUp size={13} />
                      Comparador instantáneo para {productoSeleccionado.codigo}
                    </div>

                    {loadingPreciosComp ? (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Loader2 size={12} className="animate-spin" /> Verificando otros proveedores…
                      </div>
                    ) : preciosComparativos.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Ya lo compras a:</div>
                        {preciosComparativos.slice(0, 3).map((pc: any, i: number) => (
                          <div
                            key={i}
                            style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              fontSize: 12, background: 'var(--surface, #fff)', padding: '4px 8px',
                              borderRadius: 6, border: '1px solid var(--border, #e2e8f0)',
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

                {/* Modalidad y precio */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12, marginTop: 4 }}>
                  <div>
                    <label style={etiquetaChica}>Modalidad de compra</label>
                    <select value={unidadCompra} onChange={(e) => setUnidadCompra(e.target.value)} style={inputChico}>
                      {MODALIDADES.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                    {pendiente.unidad_detectada && pendiente.unidad_detectada !== unidadCompra && (
                      <div style={{ fontSize: 10.5, color: '#b45309', marginTop: 4 }}>
                        La factura decía «{MODALIDADES.find(m => m.value === pendiente.unidad_detectada)?.label}»
                      </div>
                    )}
                  </div>

                  <div>
                    <label style={etiquetaChica}>Precio vigente (sin IVA)</label>
                    <input
                      type="number"
                      value={precio}
                      onChange={(e) => setPrecio(e.target.value)}
                      placeholder="45000"
                      style={{ ...inputChico, fontWeight: 700, fontSize: 13 }}
                    />
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '16px 24px', borderTop: '1px solid var(--border, #e2e8f0)',
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
              gap: 12, background: 'var(--surface-subtle, #f8fafc)',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={guardando}
              style={{
                padding: '9px 18px', borderRadius: 10, border: '1px solid var(--border, #cbd5e1)',
                background: 'transparent', color: 'var(--text, #475569)', fontSize: 13,
                fontWeight: 600, cursor: 'pointer',
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
                boxShadow: productoSeleccionado ? '0 4px 12px rgba(99, 102, 241, 0.35)' : 'none',
              }}
            >
              {guardando ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Vinculando…
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
