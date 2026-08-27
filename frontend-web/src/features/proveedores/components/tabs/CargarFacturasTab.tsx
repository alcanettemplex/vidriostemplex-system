import React, { useState, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UploadCloud, FileArchive, FileCode, CheckCircle2, AlertTriangle,
  XCircle, ArrowRight, Loader2, RefreshCw, Sparkles, TrendingUp,
  TrendingDown, Minus, Info, Trash2
} from 'lucide-react';
import { toast } from 'react-toastify';
import API from '../../../../services/config';

interface Props {
  onIrAPorMapear?: () => void;
}

interface ArchivoEnCola {
  id: string;
  file: File;
  nombre: string;
  size: number;
  tipo: 'zip' | 'xml' | 'desconocido';
  status: 'listo' | 'procesando' | 'completado' | 'error';
  mensajeError?: string;
}

interface PrecioActualizadoItem {
  codigo_proveedor: string;
  descripcion: string;
  proveedor_nombre: string;
  precio_anterior: number;
  precio_nuevo: number;
  variacion_pct: number;
  anomalo: boolean;
}

interface ResumenLote {
  total_archivos: number;
  facturas_procesadas: number;
  facturas_duplicadas_cufe: number;
  precios_sin_cambio: number;
  precios_actualizados: PrecioActualizadoItem[];
  codigos_nuevos_pendientes: number;
  errores: string[];
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const formatCOP = (val: number | null | undefined): string => {
  if (val === null || val === undefined) return '—';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
};

const CargarFacturasTab: React.FC<Props> = ({ onIrAPorMapear }) => {
  const [cola, setCola] = useState<ArchivoEnCola[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [resumen, setResumen] = useState<ResumenLote | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const agregarArchivos = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const nuevos: ArchivoEnCola[] = [];

    Array.from(files).forEach((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      let tipo: 'zip' | 'xml' | 'desconocido' = 'desconocido';
      if (ext === 'zip') tipo = 'zip';
      else if (ext === 'xml') tipo = 'xml';

      nuevos.push({
        id: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`,
        file: f,
        nombre: f.name,
        size: f.size,
        tipo,
        status: tipo === 'desconocido' ? 'error' : 'listo',
        mensajeError: tipo === 'desconocido' ? 'Formato no soportado (solo .zip o .xml)' : undefined,
      });
    });

    setCola((prev) => [...prev, ...nuevos]);
    setResumen(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    agregarArchivos(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const eliminarDeCola = (id: string) => {
    setCola((prev) => prev.filter((item) => item.id !== id));
  };

  const limpiarCola = () => {
    setCola([]);
    setResumen(null);
    setProgreso(0);
  };

  const procesarLote = async () => {
    const archivosValidos = cola.filter((a) => a.status === 'listo');
    if (archivosValidos.length === 0) {
      toast.warning('No hay archivos .zip o .xml válidos en la cola');
      return;
    }

    setProcesando(true);
    setProgreso(10);
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');

    const formData = new FormData();
    archivosValidos.forEach((item) => {
      formData.append('archivos', item.file);
    });

    try {
      setProgreso(40);
      const { data } = await axios.post<ResumenLote>(
        `${API}/api/proveedores/facturas/cargar`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            Authorization: `Bearer ${token}`,
          },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const percent = Math.round((progressEvent.loaded * 80) / progressEvent.total);
              setProgreso(percent);
            }
          },
        }
      );

      setProgreso(100);
      setResumen(data);
      setCola((prev) =>
        prev.map((item) =>
          item.status === 'listo' ? { ...item, status: 'completado' } : item
        )
      );

      toast.success(`Lote procesado: ${data.facturas_procesadas} facturas analizadas`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al procesar el lote de facturas');
      // Marcar error en cola si hubo fallo global
      setCola((prev) =>
        prev.map((item) =>
          item.status === 'listo' ? { ...item, status: 'error', mensajeError: 'Error en procesamiento' } : item
        )
      );
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Nota Informativa sobre Facturas Electrónicas ── */}
      <div
        style={{
          background: 'rgba(99, 102, 241, 0.05)',
          border: '1px solid rgba(99, 102, 241, 0.2)',
          borderRadius: 14,
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        <Info size={20} style={{ color: '#6366f1', flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 13, color: 'var(--text, #1e293b)', lineHeight: 1.5 }}>
          <strong style={{ color: '#4338ca' }}>Ingesta Directa de Facturación Electrónica (.zip / XML):</strong>{' '}
          Sube los archivos <strong>.zip</strong> de tus facturas electrónicas (~20 diarias). El sistema descomprime en memoria y extrae el <strong>XML DIAN (UBL 2.1)</strong> exacto, ignorando el PDF. Identifica automáticamente al proveedor por su <strong>NIT</strong> y controla duplicados por <strong>CUFE</strong>.
        </div>
      </div>

      {/* ── Zona de Arrastrar y Soltar ── */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragOver ? '#6366f1' : 'var(--border, #cbd5e1)'}`,
          background: isDragOver ? 'rgba(99, 102, 241, 0.06)' : 'var(--surface-subtle, #f8fafc)',
          borderRadius: 18,
          padding: '36px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".zip,.xml"
          onChange={(e) => agregarArchivos(e.target.files)}
          style={{ display: 'none' }}
        />

        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: 'rgba(99, 102, 241, 0.12)',
            color: '#6366f1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <UploadCloud size={28} />
        </div>

        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text, #0f172a)' }}>
            Arrastra tus archivos <span style={{ color: '#6366f1' }}>.zip</span> o <span style={{ color: '#059669' }}>.xml</span> aquí
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted, #64748b)', marginTop: 4 }}>
            o haz clic para seleccionar múltiples facturas desde tu equipo
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'rgba(99, 102, 241, 0.1)', color: '#4338ca' }}>
            📦 Paquetes .ZIP (PDF + XML)
          </span>
          <span style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'rgba(5, 150, 105, 0.1)', color: '#047857' }}>
            📄 XML DIAN Sueltos
          </span>
        </div>
      </div>

      {/* ── Cola de Archivos y Controles ── */}
      {cola.length > 0 && (
        <div
          style={{
            background: 'var(--surface, #ffffff)',
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: 16,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text, #0f172a)' }}>
                Archivos en Cola ({cola.length})
              </h3>
              <span style={{ fontSize: 12, color: 'var(--text-muted, #64748b)' }}>
                • Total: {formatBytes(cola.reduce((acc, c) => acc + c.size, 0))}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={limpiarCola}
                disabled={procesando}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border, #cbd5e1)',
                  padding: '7px 14px',
                  borderRadius: 8,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: 'var(--text-muted, #64748b)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Trash2 size={14} /> Limpiar
              </button>

              <button
                onClick={procesarLote}
                disabled={procesando || cola.every((c) => c.status !== 'listo')}
                style={{
                  background: '#6366f1',
                  border: 'none',
                  padding: '7px 18px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#fff',
                  cursor: procesando ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.28)',
                }}
              >
                {procesando ? (
                  <>
                    <Loader2 size={15} className="animate-spin" /> Procesando Lote ({progreso}%)...
                  </>
                ) : (
                  <>
                    <Sparkles size={15} /> Procesar Facturas ({cola.filter((c) => c.status === 'listo').length})
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Barra de progreso */}
          {procesando && (
            <div style={{ width: '100%', height: 6, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${progreso}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #6366f1, #059669)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          )}

          {/* Listado de archivos en la cola */}
          <div
            style={{
              maxHeight: 240,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              paddingRight: 4,
            }}
          >
            {cola.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: 'var(--surface-subtle, #f8fafc)',
                  border: '1px solid var(--border, #f1f5f9)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
                  {item.tipo === 'zip' ? (
                    <FileArchive size={18} style={{ color: '#6366f1', flexShrink: 0 }} />
                  ) : item.tipo === 'xml' ? (
                    <FileCode size={18} style={{ color: '#059669', flexShrink: 0 }} />
                  ) : (
                    <AlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
                  )}

                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #0f172a)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {item.nombre}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)' }}>
                      {formatBytes(item.size)} • {item.tipo.toUpperCase()}
                      {item.mensajeError && <span style={{ color: '#ef4444', marginLeft: 6 }}>({item.mensajeError})</span>}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {item.status === 'completado' && (
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: '#059669', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle2 size={14} /> Procesado
                    </span>
                  )}
                  {item.status === 'procesando' && (
                    <Loader2 size={14} className="animate-spin" style={{ color: '#6366f1' }} />
                  )}
                  {item.status === 'error' && (
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <XCircle size={14} /> Error
                    </span>
                  )}

                  {!procesando && (
                    <button
                      onClick={() => eliminarDeCola(item.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted, #94a3b8)',
                        cursor: 'pointer',
                        padding: 4,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Resumen del Lote (Al terminar) ── */}
      {resumen && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: 'var(--surface, #ffffff)',
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: 18,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: 'var(--text, #0f172a)' }}>
                Resumen del Lote de Facturas
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted, #64748b)', margin: '2px 0 0' }}>
                Resultados del análisis y reconciliación de precios contra el maestro
              </p>
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#059669',
                background: 'rgba(5, 150, 105, 0.1)',
                padding: '4px 10px',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <CheckCircle2 size={14} /> Lote Completado
            </span>
          </div>

          {/* Tarjetas de Métricas Rápidas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            <div style={{ background: 'var(--surface-subtle, #f8fafc)', padding: 14, borderRadius: 12, border: '1px solid var(--border, #e2e8f0)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)' }}>Facturas Procesadas</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
                {resumen.facturas_procesadas}
              </div>
            </div>

            <div style={{ background: 'var(--surface-subtle, #f8fafc)', padding: 14, borderRadius: 12, border: '1px solid var(--border, #e2e8f0)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)' }}>Rechazadas (CUFE duplicado)</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#64748b', marginTop: 4 }}>
                {resumen.facturas_duplicadas_cufe}
              </div>
            </div>

            <div style={{ background: 'var(--surface-subtle, #f8fafc)', padding: 14, borderRadius: 12, border: '1px solid var(--border, #e2e8f0)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)' }}>Precios sin Cambio</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#059669', marginTop: 4 }}>
                {resumen.precios_sin_cambio}
              </div>
            </div>

            <div style={{ background: 'var(--surface-subtle, #f8fafc)', padding: 14, borderRadius: 12, border: '1px solid var(--border, #e2e8f0)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)' }}>Precios Actualizados</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#6366f1', marginTop: 4 }}>
                {resumen.precios_actualizados.length}
              </div>
            </div>

            <div style={{ background: 'rgba(245, 158, 11, 0.08)', padding: 14, borderRadius: 12, border: '1px solid rgba(245, 158, 11, 0.2)' }}>
              <div style={{ fontSize: 12, color: '#b45309', fontWeight: 600 }}>Códigos Nuevos Detectados</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#d97706', marginTop: 4 }}>
                {resumen.codigos_nuevos_pendientes}
              </div>
            </div>
          </div>

          {/* Banner de llamada a acción si hay códigos por mapear */}
          {resumen.codigos_nuevos_pendientes > 0 && (
            <div
              style={{
                background: 'linear-gradient(90deg, #fffbeb, #fef3c7)',
                border: '1px solid #fde68a',
                borderRadius: 12,
                padding: '12px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertTriangle size={18} style={{ color: '#d97706' }} />
                <div style={{ fontSize: 13, color: '#92400e', fontWeight: 500 }}>
                  Se encontraron <strong>{resumen.codigos_nuevos_pendientes} códigos de proveedor</strong> que aún no están vinculados en el catálogo.
                </div>
              </div>
              {onIrAPorMapear && (
                <button
                  onClick={onIrAPorMapear}
                  style={{
                    background: '#d97706',
                    color: '#fff',
                    border: 'none',
                    padding: '6px 14px',
                    borderRadius: 8,
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  Ir a Por Mapear <ArrowRight size={14} />
                </button>
              )}
            </div>
          )}

          {/* Detalle de precios actualizados */}
          {resumen.precios_actualizados.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text, #0f172a)', marginBottom: 8 }}>
                Detalle de Precios que Cambiaron:
              </div>
              <div
                style={{
                  border: '1px solid var(--border, #e2e8f0)',
                  borderRadius: 10,
                  overflow: 'hidden',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-subtle, #f8fafc)', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                      <th style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Proveedor</th>
                      <th style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Código / Descripción</th>
                      <th style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Precio Anterior</th>
                      <th style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Precio Nuevo</th>
                      <th style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Variación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.precios_actualizados.map((p, idx) => {
                      const Icon = p.variacion_pct > 0 ? TrendingUp : p.variacion_pct < 0 ? TrendingDown : Minus;
                      const colorVar = p.anomalo ? '#ef4444' : p.variacion_pct > 0 ? '#f59e0b' : '#22c55e';
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border, #f1f5f9)' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text, #1e293b)' }}>
                            {p.proveedor_nombre}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 11.5, color: '#6366f1' }}>
                              {p.codigo_proveedor}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)' }}>{p.descripcion}</div>
                          </td>
                          <td style={{ padding: '8px 12px', color: 'var(--text-muted, #64748b)' }}>
                            {formatCOP(p.precio_anterior)}
                          </td>
                          <td style={{ padding: '8px 12px', fontWeight: 700, color: '#059669' }}>
                            {formatCOP(p.precio_nuevo)}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                color: colorVar,
                                fontWeight: 700,
                                fontSize: 11.5,
                                background: `${colorVar}18`,
                                padding: '2px 6px',
                                borderRadius: 6,
                              }}
                            >
                              <Icon size={11} />
                              {p.variacion_pct > 0 ? '+' : ''}{p.variacion_pct.toFixed(1)}%
                              {p.anomalo && <AlertTriangle size={11} style={{ marginLeft: 2 }} />}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </motion.div>
      )}

    </div>
  );
};

export default CargarFacturasTab;
