import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Plus, Upload, Search, RefreshCw, CheckCircle2,
  XCircle, Edit3, ChevronRight, AlertTriangle, FileSpreadsheet,
} from 'lucide-react';
import { toast } from 'react-toastify';
import API from '../../../../services/config';
import NuevoProveedorModal from '../modals/NuevoProveedorModal';
import AgregarPrecioModal from '../modals/AgregarPrecioModal';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Proveedor {
  id: number;
  nit: string | null;
  nombre_comercial: string;
  razon_social: string | null;
  telefono: string | null;
  email: string | null;
  activo: boolean;
  tipo_identificacion: string;
  numero_identificacion: string | null;
}

interface ResultadoImport {
  creados: number;
  actualizados: number;
  omitidos: number;
  errores: string[];
}

// ─── Componente ───────────────────────────────────────────────────────────────

const ProveedoresTab: React.FC = () => {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroActivo, setFiltroActivo] = useState<boolean | null>(null);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalPrecio, setModalPrecio] = useState<{ proveedor: Proveedor } | null>(null);
  const [importando, setImportando] = useState(false);
  const [resultadoImport, setResultadoImport] = useState<ResultadoImport | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (busqueda.trim()) params.q = busqueda.trim();
      if (filtroActivo !== null) params.activo = filtroActivo;
      const { data } = await axios.get<Proveedor[]>(
        `${API}/api/proveedores`,
        { params, headers: { Authorization: `Bearer ${(sessionStorage.getItem('token') || localStorage.getItem('token'))}` } }
      );
      setProveedores(data);
    } catch {
      toast.error('Error al cargar proveedores');
    } finally {
      setLoading(false);
    }
  }, [busqueda, filtroActivo]);

  useEffect(() => { cargar(); }, [cargar]);

  const handleImportar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setImportando(true);
    setResultadoImport(null);
    const formData = new FormData();
    formData.append('archivo', archivo);
    try {
      const { data } = await axios.post<ResultadoImport>(
        `${API}/api/proveedores/importar-excel`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${(sessionStorage.getItem('token') || localStorage.getItem('token'))}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      setResultadoImport(data);
      toast.success(`Importación completa: ${data.creados} nuevos, ${data.actualizados} actualizados`);
      cargar();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Error al importar');
    } finally {
      setImportando(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleToggleActivo = async (prov: Proveedor) => {
    try {
      await axios.patch(
        `${API}/api/proveedores/${prov.id}`,
        { activo: !prov.activo },
        { headers: { Authorization: `Bearer ${(sessionStorage.getItem('token') || localStorage.getItem('token'))}` } }
      );
      toast.success(prov.activo ? 'Proveedor desactivado' : 'Proveedor activado');
      cargar();
    } catch {
      toast.error('Error al actualizar estado');
    }
  };

  return (
    <div style={{ padding: '0 0 32px' }}>

      {/* ── Barra de acciones ── */}
      <div style={{
        display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center',
      }}>
        {/* Buscador */}
        <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o NIT…"
            style={{
              width: '100%', padding: '9px 12px 9px 34px', boxSizing: 'border-box',
              background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10,
              color: 'var(--text)', fontSize: 14, outline: 'none',
            }}
          />
        </div>

        {/* Filtro activo */}
        <select
          value={filtroActivo === null ? '' : String(filtroActivo)}
          onChange={e => setFiltroActivo(e.target.value === '' ? null : e.target.value === 'true')}
          style={{
            padding: '9px 14px', background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 10, color: 'var(--text)', fontSize: 14, cursor: 'pointer', outline: 'none',
          }}
        >
          <option value="">Todos</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </select>

        {/* Importar Excel */}
        <input type="file" accept=".xlsx,.xls" ref={fileInputRef} onChange={handleImportar} style={{ display: 'none' }} />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importando}
          style={{
            padding: '9px 16px', borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--text)', fontSize: 14,
            cursor: importando ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 7,
            fontWeight: 500, transition: 'all .2s',
          }}
        >
          {importando ? <RefreshCw size={14} className="spin" /> : <FileSpreadsheet size={14} />}
          {importando ? 'Importando…' : 'Importar Excel'}
        </button>

        {/* Nuevo proveedor */}
        <button
          onClick={() => setModalNuevo(true)}
          style={{
            padding: '9px 18px', borderRadius: 10, border: 'none',
            background: 'var(--primary)', color: '#fff', fontSize: 14,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
            fontWeight: 600, transition: 'all .2s',
          }}
        >
          <Plus size={15} />
          Nuevo proveedor
        </button>
      </div>

      {/* ── Resultado de importación ── */}
      <AnimatePresence>
        {resultadoImport && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            style={{
              background: '#22c55e10', border: '1px solid #22c55e40',
              borderRadius: 12, padding: '14px 20px', marginBottom: 20,
              display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center',
            }}
          >
            <CheckCircle2 size={20} color="#22c55e" />
            <div style={{ fontSize: 13 }}>
              <strong>{resultadoImport.creados}</strong> creados ·{' '}
              <strong>{resultadoImport.actualizados}</strong> actualizados ·{' '}
              <strong>{resultadoImport.omitidos}</strong> omitidos
            </div>
            {resultadoImport.errores.length > 0 && (
              <div style={{ fontSize: 12, color: '#f59e0b' }}>
                <AlertTriangle size={12} style={{ display: 'inline', marginRight: 4 }} />
                {resultadoImport.errores.length} errores menores
              </div>
            )}
            <button onClick={() => setResultadoImport(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Tabla ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
          <RefreshCw size={28} className="spin" style={{ opacity: .4 }} />
        </div>
      ) : proveedores.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '56px 24px',
          border: '1px dashed var(--border)', borderRadius: 14, color: 'var(--text-muted)',
        }}>
          <Building2 size={40} style={{ opacity: .3, marginBottom: 12 }} />
          <p>No hay proveedores registrados aún.</p>
          <p style={{ fontSize: 13 }}>Usa <strong>Importar Excel</strong> para cargar los 1.805 proveedores de World Office.</p>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          {/* Encabezado */}
          <div style={{
            display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
            background: 'var(--surface)', padding: '10px 20px',
            borderBottom: '1px solid var(--border)',
          }}>
            {['NOMBRE COMERCIAL', 'NIT / ID', 'TELÉFONO', 'EMAIL', 'ESTADO'].map(h => (
              <div key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: .5 }}>{h}</div>
            ))}
          </div>

          {/* Filas */}
          {proveedores.map((p, idx) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ delay: Math.min(idx * 0.02, .3) }}
              style={{
                display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                padding: '12px 20px', borderBottom: '1px solid var(--border)',
                background: !p.activo ? '#ffffff08' : 'transparent',
                alignItems: 'center',
                opacity: p.activo ? 1 : .5,
              }}
            >
              {/* Nombre */}
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 14 }}>{p.nombre_comercial}</div>
                {p.razon_social && p.razon_social !== p.nombre_comercial && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.razon_social}</div>
                )}
              </div>

              {/* NIT */}
              <div style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                {p.nit ?? `${p.tipo_identificacion} ${p.numero_identificacion ?? '—'}`}
                {p.nit === null && <div style={{ fontSize: 10, color: '#f59e0b' }}>Sin NIT</div>}
              </div>

              {/* Teléfono */}
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{p.telefono ?? '—'}</div>

              {/* Email */}
              <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.email ?? '—'}</div>

              {/* Acciones */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                  background: p.activo ? '#22c55e18' : '#f8383818',
                  color: p.activo ? '#22c55e' : '#ef4444',
                }}>
                  {p.activo ? 'Activo' : 'Inactivo'}
                </span>
                <button
                  title="Agregar precio para este proveedor"
                  onClick={() => setModalPrecio({ proveedor: p })}
                  style={{
                    background: 'none', border: '1px solid var(--border)', borderRadius: 7,
                    padding: '4px 8px', cursor: 'pointer', color: 'var(--text-muted)',
                    fontSize: 11, display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <Plus size={11} /> Precio
                </button>
                <button
                  title={p.activo ? 'Desactivar' : 'Activar'}
                  onClick={() => handleToggleActivo(p)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', padding: 4,
                  }}
                >
                  {p.activo ? <XCircle size={15} /> : <CheckCircle2 size={15} />}
                </button>
              </div>
            </motion.div>
          ))}

          {/* Footer con total */}
          <div style={{ padding: '10px 20px', background: 'var(--surface)', fontSize: 12, color: 'var(--text-muted)' }}>
            {proveedores.length} proveedor{proveedores.length !== 1 ? 'es' : ''}
          </div>
        </div>
      )}

      {/* ── Modales ── */}
      {modalNuevo && (
        <NuevoProveedorModal
          onClose={() => setModalNuevo(false)}
          onCreado={() => { setModalNuevo(false); cargar(); }}
        />
      )}
      {modalPrecio && (
        <AgregarPrecioModal
          proveedor={modalPrecio.proveedor}
          onClose={() => setModalPrecio(null)}
          onGuardado={() => { setModalPrecio(null); toast.success('Precio registrado'); }}
        />
      )}
    </div>
  );
};

export default ProveedoresTab;


