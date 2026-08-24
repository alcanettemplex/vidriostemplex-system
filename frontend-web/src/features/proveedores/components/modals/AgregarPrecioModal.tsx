import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { X, DollarSign, Search, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'react-toastify';
import API from '../../../../services/config';

interface Proveedor { id: number; nombre_comercial: string; nit: string | null; }
interface ProductoCatalogo { id: number; codigo: string; nombre: string; porcentaje_iva: number; es_aluminio: boolean; }

interface Props {
  proveedor: Proveedor;
  onClose: () => void;
  onGuardado: () => void;
}

const UNIDADES = [
  { value: 'UNIDAD', label: 'Por unidad' },
  { value: 'TIRA_6M', label: 'Por tira de 6 m (perfilería)' },
  { value: 'METRO', label: 'Por metro (fraccionado)' },
  { value: 'KG', label: 'Por kilogramo' },
  { value: 'M2', label: 'Por m²' },
];

const AgregarPrecioModal: React.FC<Props> = ({ proveedor, onClose, onGuardado }) => {
  const [buscando, setBuscando] = useState('');
  const [productos, setProductos] = useState<ProductoCatalogo[]>([]);
  const [loadingBusqueda, setLoadingBusqueda] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState<ProductoCatalogo | null>(null);
  const [form, setForm] = useState({
    codigo_proveedor: '',
    descripcion_proveedor: '',
    unidad_compra: 'UNIDAD',
    precio: '',
    fecha_precio: new Date().toISOString().split('T')[0],
  });
  const [guardando, setGuardando] = useState(false);

  // Buscar productos en el catálogo
  useEffect(() => {
    if (!buscando.trim() || buscando.length < 2) { setProductos([]); return; }
    const timer = setTimeout(async () => {
      setLoadingBusqueda(true);
      try {
        const { data } = await axios.get<ProductoCatalogo[]>(
          `${API}/api/catalogo`,
          {
            params: { q: buscando },
            headers: { Authorization: `Bearer ${(sessionStorage.getItem('token') || localStorage.getItem('token'))}` },
          }
        );
        setProductos(data.slice(0, 10));
      } catch { setProductos([]); }
      finally { setLoadingBusqueda(false); }
    }, 350);
    return () => clearTimeout(timer);
  }, [buscando]);

  const seleccionarProducto = (p: ProductoCatalogo) => {
    setProductoSeleccionado(p);
    setBuscando('');
    setProductos([]);
    // Si es aluminio, sugerir TIRA_6M por defecto
    if (p.es_aluminio) setForm(f => ({ ...f, unidad_compra: 'TIRA_6M' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productoSeleccionado || !form.precio) return;
    setGuardando(true);
    try {
      await axios.post(
        `${API}/api/proveedores/${proveedor.id}/productos`,
        {
          catalogo_producto_id: productoSeleccionado.id,
          codigo_proveedor: form.codigo_proveedor.trim() || null,
          descripcion_proveedor: form.descripcion_proveedor.trim() || null,
          unidad_compra: form.unidad_compra,
          precio: parseFloat(form.precio),
          fecha_precio: form.fecha_precio,
          guardar_alias: true,
        },
        { headers: { Authorization: `Bearer ${(sessionStorage.getItem('token') || localStorage.getItem('token'))}` } }
      );
      onGuardado();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Error al guardar precio');
    } finally {
      setGuardando(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', boxSizing: 'border-box',
    background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, color: 'var(--text-muted)',
    fontWeight: 700, marginBottom: 5, letterSpacing: .4,
  };

  const precioNum = parseFloat(form.precio) || 0;
  const pctIva = productoSeleccionado?.porcentaje_iva ?? 19;
  const precioConIva = precioNum * (1 + pctIva / 100);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
          zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ scale: .94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: .94, opacity: 0 }}
          style={{
            background: 'var(--surface)', borderRadius: 18, width: '100%', maxWidth: 540,
            border: '1px solid var(--border)', overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '20px 24px', borderBottom: '1px solid var(--border)',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <DollarSign size={18} color="var(--primary)" />
                <span style={{ fontWeight: 700, fontSize: 16 }}>Agregar precio</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                Proveedor: <strong>{proveedor.nombre_comercial}</strong>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Selector de producto */}
            <div>
              <label style={labelStyle}>PRODUCTO DEL CATÁLOGO *</label>
              {productoSeleccionado ? (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'var(--primary)18', border: '1px solid var(--primary)40',
                  borderRadius: 10, padding: '10px 14px',
                }}>
                  <div>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--primary)' }}>{productoSeleccionado.codigo}</span>
                    <span style={{ marginLeft: 8, fontSize: 14, fontWeight: 600 }}>{productoSeleccionado.nombre}</span>
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>IVA {productoSeleccionado.porcentaje_iva}%</span>
                  </div>
                  <button type="button" onClick={() => setProductoSeleccionado(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    value={buscando}
                    onChange={e => setBuscando(e.target.value)}
                    placeholder="Buscar código o nombre del producto…"
                    style={{ ...inputStyle, paddingLeft: 32 }}
                  />
                  {loadingBusqueda && (
                    <Loader2 size={14} className="spin" style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  )}
                  {/* Dropdown de sugerencias */}
                  {productos.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0,
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 10, zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,.2)',
                      overflow: 'hidden',
                    }}>
                      {productos.map(p => (
                        <div
                          key={p.id}
                          onClick={() => seleccionarProducto(p)}
                          style={{
                            padding: '10px 14px', cursor: 'pointer',
                            borderBottom: '1px solid var(--border)',
                            display: 'flex', gap: 10, alignItems: 'center',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--primary)' }}>{p.codigo}</span>
                          <span style={{ fontSize: 13 }}>{p.nombre}</span>
                          {p.es_aluminio && <span style={{ fontSize: 10, background: '#3b82f618', color: '#3b82f6', borderRadius: 4, padding: '1px 5px' }}>ALUMINIO</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Código y descripción del proveedor */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>CÓDIGO DEL PROVEEDOR</label>
                <input value={form.codigo_proveedor} onChange={e => setForm(f => ({ ...f, codigo_proveedor: e.target.value }))}
                  placeholder="Ej: AL-2245" style={{ ...inputStyle, fontFamily: 'monospace' }} />
              </div>
              <div>
                <label style={labelStyle}>DESCRIPCIÓN DEL PROVEEDOR</label>
                <input value={form.descripcion_proveedor} onChange={e => setForm(f => ({ ...f, descripcion_proveedor: e.target.value }))}
                  placeholder="Ej: CIERRAPUERTAS HIDRAULICO" style={inputStyle} />
              </div>
            </div>

            {/* Unidad de compra */}
            <div>
              <label style={labelStyle}>UNIDAD DE COMPRA</label>
              <select value={form.unidad_compra} onChange={e => setForm(f => ({ ...f, unidad_compra: e.target.value }))}
                style={{ ...inputStyle, cursor: 'pointer', appearance: 'none' }}>
                {UNIDADES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
              {form.unidad_compra === 'TIRA_6M' && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  El precio por metro se calculará automáticamente: precio_tira / 6
                </div>
              )}
            </div>

            {/* Precio y fecha */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>PRECIO SIN IVA *</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 13 }}>$</span>
                  <input
                    type="number" min="0" step="1" required
                    value={form.precio} onChange={e => setForm(f => ({ ...f, precio: e.target.value }))}
                    placeholder="45000" style={{ ...inputStyle, paddingLeft: 22, fontFamily: 'monospace' }}
                  />
                </div>
                {precioNum > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    Con IVA ({pctIva}%): <strong>${precioConIva.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</strong>
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>FECHA DEL PRECIO</label>
                <input type="date" value={form.fecha_precio}
                  onChange={e => setForm(f => ({ ...f, fecha_precio: e.target.value }))}
                  style={inputStyle} />
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
              <button type="button" onClick={onClose} style={{
                padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--bg)', color: 'var(--text)', fontSize: 14, cursor: 'pointer', fontWeight: 500,
              }}>
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardando || !productoSeleccionado || !form.precio}
                style={{
                  padding: '10px 24px', borderRadius: 10, border: 'none',
                  background: guardando || !productoSeleccionado || !form.precio ? 'var(--border)' : 'var(--primary)',
                  color: '#fff', fontSize: 14, cursor: 'pointer', fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                {guardando ? <Loader2 size={14} className="spin" /> : null}
                {guardando ? 'Guardando…' : 'Guardar precio'}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AgregarPrecioModal;


