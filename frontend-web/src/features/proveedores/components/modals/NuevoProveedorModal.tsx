import React, { useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Building2, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import API from '../../../../services/config';

interface Props {
  onClose: () => void;
  onCreado: () => void;
}

const NuevoProveedorModal: React.FC<Props> = ({ onClose, onCreado }) => {
  const [form, setForm] = useState({
    nombre_comercial: '',
    nit: '',
    razon_social: '',
    tipo_identificacion: 'NIT',
    numero_identificacion: '',
    telefono: '',
    email: '',
    notas: '',
  });
  const [guardando, setGuardando] = useState(false);

  const handleChange = (field: string, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre_comercial.trim()) return;
    setGuardando(true);
    try {
      await axios.post(
        `${API}/api/proveedores`,
        {
          nombre_comercial: form.nombre_comercial.trim(),
          nit: form.nit.trim() || null,
          razon_social: form.razon_social.trim() || null,
          tipo_identificacion: form.tipo_identificacion,
          numero_identificacion: form.numero_identificacion.trim() || null,
          telefono: form.telefono.trim() || null,
          email: form.email.trim() || null,
          notas: form.notas.trim() || null,
        },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      toast.success('Proveedor creado exitosamente');
      onCreado();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Error al crear proveedor';
      toast.error(msg);
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
            background: 'var(--surface)', borderRadius: 18, width: '100%', maxWidth: 520,
            border: '1px solid var(--border)', overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '20px 24px', borderBottom: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Building2 size={20} color="var(--primary)" />
              <span style={{ fontWeight: 700, fontSize: 16 }}>Nuevo Proveedor</span>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>NOMBRE COMERCIAL *</label>
              <input required value={form.nombre_comercial} onChange={e => handleChange('nombre_comercial', e.target.value)}
                placeholder="Ej: TEMPLACOL" style={inputStyle} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>TIPO DE IDENTIFICACIÓN</label>
                <select value={form.tipo_identificacion} onChange={e => handleChange('tipo_identificacion', e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer', appearance: 'none' }}>
                  <option value="NIT">NIT</option>
                  <option value="CC">Cédula (CC)</option>
                  <option value="OTRO">Otro</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>NIT / NÚMERO *</label>
                <input value={form.nit || form.numero_identificacion}
                  onChange={e => {
                    handleChange('nit', e.target.value);
                    handleChange('numero_identificacion', e.target.value);
                  }}
                  placeholder="Ej: 830036921"
                  style={{ ...inputStyle, fontFamily: 'monospace' }} />
                {!form.nit.trim() && (
                  <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>
                    ⚠ Sin NIT no habrá match automático con el XML DIAN
                  </div>
                )}
              </div>
            </div>

            <div>
              <label style={labelStyle}>RAZÓN SOCIAL (opcional)</label>
              <input value={form.razon_social} onChange={e => handleChange('razon_social', e.target.value)}
                placeholder="Nombre legal completo" style={inputStyle} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>TELÉFONO</label>
                <input value={form.telefono} onChange={e => handleChange('telefono', e.target.value)}
                  placeholder="Ej: 3001234567" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>EMAIL</label>
                <input type="email" value={form.email} onChange={e => handleChange('email', e.target.value)}
                  placeholder="proveedor@ejemplo.com" style={inputStyle} />
              </div>
            </div>

            <div>
              <label style={labelStyle}>NOTAS INTERNAS</label>
              <textarea value={form.notas} onChange={e => handleChange('notas', e.target.value)}
                placeholder="Observaciones, condiciones de pago, contacto preferido…"
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
              <button type="button" onClick={onClose} style={{
                padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--bg)', color: 'var(--text)', fontSize: 14, cursor: 'pointer', fontWeight: 500,
              }}>
                Cancelar
              </button>
              <button type="submit" disabled={guardando || !form.nombre_comercial.trim()} style={{
                padding: '10px 24px', borderRadius: 10, border: 'none',
                background: guardando || !form.nombre_comercial.trim() ? 'var(--border)' : 'var(--primary)',
                color: '#fff', fontSize: 14, cursor: 'pointer', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                {guardando ? <Loader2 size={15} className="spin" /> : null}
                {guardando ? 'Guardando…' : 'Crear proveedor'}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default NuevoProveedorModal;

