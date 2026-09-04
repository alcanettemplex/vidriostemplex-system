import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Plus, Search, RefreshCw, CheckCircle2,
  XCircle, AlertTriangle, FileSpreadsheet, HelpCircle,
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
  /** null = sin decidir (lo descubrió la ingesta y nadie lo ha resuelto) */
  seguir_precios: boolean | null;
  origen_registro: string;
}

/**
 * Estado real de un proveedor frente a la bandeja de mapeo. Es la misma regla del
 * backend (`siguePrecios`): un proveedor inactivo tampoco alimenta la bandeja, aunque
 * su bandera de seguimiento diga que sí. Se calcula aquí para que la pantalla no
 * afirme algo distinto de lo que hace la ingesta.
 */
type EstadoSeguimiento = 'SIGUIENDO' | 'IGNORADO' | 'SIN_DECIDIR';

function estadoDe(p: Proveedor): EstadoSeguimiento {
  if (!p.activo || p.seguir_precios === false) return 'IGNORADO';
  return p.seguir_precios === true ? 'SIGUIENDO' : 'SIN_DECIDIR';
}

const ETIQUETA: Record<EstadoSeguimiento, { texto: string; color: string; ayuda: string }> = {
  SIGUIENDO: {
    texto: 'Siguiendo',
    color: '#22c55e',
    ayuda: 'Sus facturas actualizan precios y sus códigos nuevos entran a Por Mapear.',
  },
  IGNORADO: {
    texto: 'Ignorado',
    color: '#ef4444',
    ayuda: 'Sus facturas quedan registradas en la bitácora, pero no mueven precios ni llenan la bandeja.',
  },
  SIN_DECIDIR: {
    texto: 'Sin decidir',
    color: '#f59e0b',
    ayuda: 'La ingesta lo descubrió en una factura y nadie ha decidido si interesa. Mientras tanto se ignora.',
  },
};

interface ResultadoImport {
  creados: number;
  actualizados: number;
  omitidos: number;
  errores: string[];
}

interface Props {
  /** Avisa a la página para refrescar el maestro compartido con las otras pestañas */
  onCambio?: () => void;
  /** Filtro con el que entra la pestaña cuando se llega desde el buscador del módulo */
  busquedaInicial?: string;
}

// ─── Componente ───────────────────────────────────────────────────────────────

const ProveedoresTab: React.FC<Props> = ({ onCambio, busquedaInicial }) => {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState(busquedaInicial ?? '');
  const [busquedaAplicada, setBusquedaAplicada] = useState(busquedaInicial ?? '');
  const [filtroActivo, setFiltroActivo] = useState<boolean | null>(null);
  const [filtroSeguimiento, setFiltroSeguimiento] = useState<'' | 'sin_decidir' | 'siguiendo' | 'ignorado'>('');
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [aplicandoLote, setAplicandoLote] = useState(false);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalPrecio, setModalPrecio] = useState<{ proveedor: Proveedor } | null>(null);
  const [importando, setImportando] = useState(false);
  const [resultadoImport, setResultadoImport] = useState<ResultadoImport | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * El filtrado ocurre en el servidor, así que se espera a que el usuario deje de
   * teclear: sin esto, escribir "vitelsa" disparaba siete descargas del maestro.
   * Las otras pestañas del módulo ya lo hacían; esta se había quedado fuera.
   */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setBusquedaAplicada(busqueda.trim()), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [busqueda]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (busquedaAplicada) params.q = busquedaAplicada;
      if (filtroActivo !== null) params.activo = filtroActivo;
      if (filtroSeguimiento) params.seguimiento = filtroSeguimiento;
      const { data } = await axios.get<Proveedor[]>(`${API}/api/proveedores`, { params });
      setProveedores(data);
      // La selección se limpia con cada recarga: mantener ids de una lista que ya no
      // está en pantalla llevaba a aplicar decisiones sobre proveedores no visibles.
      setSeleccion(new Set());
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'No se pudo cargar la lista de proveedores');
    } finally {
      setLoading(false);
    }
  }, [busquedaAplicada, filtroActivo, filtroSeguimiento]);

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
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setResultadoImport(data);
      toast.success(`Importación completa: ${data.creados} nuevos, ${data.actualizados} actualizados`);
      cargar();
      if (onCambio) onCambio();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'No se pudo importar el archivo');
    } finally {
      setImportando(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleToggleActivo = async (prov: Proveedor) => {
    try {
      await axios.patch(`${API}/api/proveedores/${prov.id}`, { activo: !prov.activo });
      toast.success(prov.activo ? 'Proveedor desactivado' : 'Proveedor activado');
      cargar();
      if (onCambio) onCambio();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'No se pudo actualizar el estado');
    }
  };

  /**
   * Decide si un proveedor alimenta la bandeja. Ignorarlo descarta de una vez los
   * códigos que tenga pendientes; seguirlo reabre las facturas suyas que se habían
   * registrado sin procesar, para que puedan volver a subirse.
   */
  const handleDecidir = async (prov: Proveedor, seguir: boolean) => {
    if (!seguir && !window.confirm(
      `¿Ignorar a "${prov.nombre_comercial}"?\n\nSus facturas se seguirán registrando en la bitácora, pero no moverán precios ni generarán códigos por mapear. Los que tenga pendientes ahora se descartarán.`
    )) return;

    try {
      const { data } = await axios.patch(`${API}/api/proveedores/${prov.id}/seguimiento`, {
        seguir_precios: seguir,
      });
      toast.success(data?.message ?? 'Decisión aplicada');
      cargar();
      if (onCambio) onCambio();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'No se pudo cambiar el seguimiento');
    }
  };

  /** Misma decisión sobre la selección múltiple: tras un lote grande de facturas,
   *  resolver emisor por emisor era el trabajo que nadie hacía. */
  const handleDecidirLote = async (seguir: boolean) => {
    const ids = Array.from(seleccion);
    if (ids.length === 0) return;
    if (!seguir && !window.confirm(
      `¿Ignorar ${ids.length} proveedor(es)?\n\nSus códigos pendientes se descartarán.`
    )) return;

    setAplicandoLote(true);
    try {
      const { data } = await axios.patch(`${API}/api/proveedores/seguimiento-masivo`, {
        ids,
        seguir_precios: seguir,
      });
      toast.success(data?.message ?? 'Decisión aplicada');
      cargar();
      if (onCambio) onCambio();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'No se pudo aplicar la decisión');
    } finally {
      setAplicandoLote(false);
    }
  };

  const alternarSeleccion = (id: number) => {
    setSeleccion(prev => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id); else siguiente.add(id);
      return siguiente;
    });
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

        {/* Filtro por seguimiento — el que saca a flote los emisores sin decidir */}
        <select
          value={filtroSeguimiento}
          onChange={e => setFiltroSeguimiento(e.target.value as typeof filtroSeguimiento)}
          style={{
            padding: '9px 14px', background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 10, color: 'var(--text)', fontSize: 14, cursor: 'pointer', outline: 'none',
          }}
        >
          <option value="">Todo seguimiento</option>
          <option value="sin_decidir">Sin decidir</option>
          <option value="siguiendo">Siguiendo precios</option>
          <option value="ignorado">Ignorados</option>
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

      {/* ── Acciones en bloque sobre la selección ── */}
      <AnimatePresence>
        {seleccion.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '10px 16px', marginBottom: 16,
            }}
          >
            <strong style={{ fontSize: 13 }}>{seleccion.size} seleccionado(s)</strong>
            <button
              onClick={() => handleDecidirLote(true)}
              disabled={aplicandoLote}
              style={{
                padding: '7px 14px', borderRadius: 9, border: '1px solid #22c55e60',
                background: '#22c55e14', color: '#22c55e', fontSize: 13, fontWeight: 600,
                cursor: aplicandoLote ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <CheckCircle2 size={14} /> Seguir precios
            </button>
            <button
              onClick={() => handleDecidirLote(false)}
              disabled={aplicandoLote}
              style={{
                padding: '7px 14px', borderRadius: 9, border: '1px solid #ef444460',
                background: '#ef444414', color: '#ef4444', fontSize: 13, fontWeight: 600,
                cursor: aplicandoLote ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <XCircle size={14} /> Ignorar
            </button>
            <button
              onClick={() => setSeleccion(new Set())}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12 }}
            >
              Limpiar selección
            </button>
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
            display: 'grid', gridTemplateColumns: '34px 2fr 1fr 1fr 1fr 1.6fr',
            background: 'var(--surface)', padding: '10px 20px',
            borderBottom: '1px solid var(--border)', alignItems: 'center',
          }}>
            <input
              type="checkbox"
              title="Seleccionar todos los visibles"
              checked={seleccion.size > 0 && seleccion.size === proveedores.length}
              onChange={e => setSeleccion(e.target.checked ? new Set(proveedores.map(p => p.id)) : new Set())}
              style={{ cursor: 'pointer' }}
            />
            {['NOMBRE COMERCIAL', 'NIT / ID', 'TELÉFONO', 'EMAIL', 'SEGUIMIENTO'].map(h => (
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
                display: 'grid', gridTemplateColumns: '34px 2fr 1fr 1fr 1fr 1.6fr',
                padding: '12px 20px', borderBottom: '1px solid var(--border)',
                background: seleccion.has(p.id) ? 'var(--surface)' : !p.activo ? '#ffffff08' : 'transparent',
                alignItems: 'center',
                opacity: p.activo ? 1 : .5,
              }}
            >
              <input
                type="checkbox"
                checked={seleccion.has(p.id)}
                onChange={() => alternarSeleccion(p.id)}
                style={{ cursor: 'pointer' }}
              />

              {/* Nombre */}
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 14 }}>{p.nombre_comercial}</div>
                {p.razon_social && p.razon_social !== p.nombre_comercial && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.razon_social}</div>
                )}
                {p.origen_registro === 'INGESTA_FE' && (
                  <span
                    title="Se creó automáticamente al procesar una factura. Verifica sus datos."
                    style={{
                      display: 'inline-block', marginTop: 3, fontSize: 10,
                      fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                      background: '#f59e0b18', color: '#b45309',
                    }}
                  >
                    Creado por factura
                  </span>
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

              {/* Seguimiento — un solo control. El chip dice el estado real (incluye
                  la baja lógica) y el botón ofrece la única acción que falta. */}
              {(() => {
                const estado = estadoDe(p);
                const meta = ETIQUETA[estado];
                return (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span
                      title={meta.ayuda}
                      style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6,
                        background: `${meta.color}18`, color: meta.color,
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      {estado === 'SIN_DECIDIR' && <HelpCircle size={11} />}
                      {meta.texto}
                    </span>

                    {estado !== 'SIGUIENDO' ? (
                      <button
                        title={!p.activo
                          ? 'Este proveedor está dado de baja. Reactívalo para poder seguir sus precios.'
                          : 'Sus facturas pasarán a actualizar precios y sus códigos entrarán a Por Mapear.'}
                        onClick={() => (p.activo ? handleDecidir(p, true) : handleToggleActivo(p))}
                        style={{
                          background: 'none', border: '1px solid var(--border)', borderRadius: 7,
                          padding: '4px 8px', cursor: 'pointer', color: '#22c55e',
                          fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        <CheckCircle2 size={11} /> {p.activo ? 'Seguir' : 'Reactivar'}
                      </button>
                    ) : (
                      <button
                        title="Dejar de seguirlo: sus facturas se registran pero no llenan la bandeja."
                        onClick={() => handleDecidir(p, false)}
                        style={{
                          background: 'none', border: '1px solid var(--border)', borderRadius: 7,
                          padding: '4px 8px', cursor: 'pointer', color: 'var(--text-muted)',
                          fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        <XCircle size={11} /> Ignorar
                      </button>
                    )}

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

                    {p.activo && (
                      <button
                        title="Dar de baja del maestro. También deja de alimentar la bandeja."
                        onClick={() => handleToggleActivo(p)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--text-muted)', padding: 4,
                        }}
                      >
                        <XCircle size={15} />
                      </button>
                    )}
                  </div>
                );
              })()}
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


