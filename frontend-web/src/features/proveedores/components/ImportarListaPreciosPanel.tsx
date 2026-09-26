import React, { useRef, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import {
  FileSpreadsheet, Eye, CheckCircle2, AlertTriangle, Loader2,
  TrendingUp, TrendingDown, Minus, X, Info, History, ListChecks,
} from '../../../components/ui/icons';
import { toast } from 'react-toastify';
import API from '../../../services/config';
import { ProveedorCompacto } from '../ProveedoresPage';
import { RADIUS, FONT } from '../styleTokens';

/**
 * Fase 3 del módulo: actualización masiva de precios por lista del proveedor.
 *
 * El flujo es deliberadamente en dos tiempos — previsualizar y luego aplicar.
 * Cada proveedor arma su Excel a su manera; mostrar qué columnas se reconocieron y
 * qué haría con cada fila antes de escribir es lo que evita descubrir el error
 * cuando el precio equivocado ya está en el comparador.
 */

interface CambioPrecio {
  fila: number;
  codigo: string;
  descripcion: string;
  unidad_compra: string;
  precio_anterior: number | null;
  precio_nuevo: number;
  variacion_pct: number | null;
  anomalo: boolean;
  retroactivo: boolean;
}

interface ResultadoLista {
  dry_run: boolean;
  proveedor: { id: number; nombre_comercial: string };
  archivo: string;
  fila_encabezado: number;
  columnas_detectadas: Record<string, string | null>;
  total_filas_leidas: number;
  filas_ignoradas: number;
  precios_sin_cambio: number;
  precios_actualizados: CambioPrecio[];
  codigos_nuevos_pendientes: Array<{ fila: number; codigo: string; descripcion: string; precio: number }>;
  filas_no_aplicadas: Array<{ fila: number; codigo: string; motivo: string }>;
  umbral_variacion_pct: number;
  errores: string[];
  pendientes_registrados?: number;
  message?: string;
}

interface Props {
  proveedores: ProveedorCompacto[];
  /** Se dispara tras aplicar, para refrescar el contador de la bandeja */
  onAplicado?: () => void;
}

const MODALIDADES = [
  { value: 'UNIDAD', label: 'Por unidad' },
  { value: 'TIRA_6M', label: 'Por tira de 6 m (perfilería)' },
  { value: 'METRO', label: 'Por metro' },
  { value: 'KG', label: 'Por kilogramo' },
  { value: 'M2', label: 'Por m²' },
];

const formatCOP = (val: number | null | undefined): string => {
  if (val === null || val === undefined) return '—';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
};

const ImportarListaPreciosPanel: React.FC<Props> = ({ proveedores, onAplicado }) => {
  const [proveedorId, setProveedorId] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [fechaLista, setFechaLista] = useState(new Date().toISOString().split('T')[0]);
  const [unidadDefecto, setUnidadDefecto] = useState('UNIDAD');
  const [preciosConIva, setPreciosConIva] = useState(false);
  const [crearPendientes, setCrearPendientes] = useState(true);

  const [resultado, setResultado] = useState<ResultadoLista | null>(null);
  const [cargando, setCargando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const enviar = async (dryRun: boolean) => {
    if (!proveedorId) {
      toast.warning('Elige de qué proveedor es la lista de precios');
      return;
    }
    if (!archivo) {
      toast.warning('Selecciona el archivo Excel con la lista');
      return;
    }

    const formData = new FormData();
    formData.append('archivo', archivo);
    formData.append('dry_run', String(dryRun));
    formData.append('fecha_lista', fechaLista);
    formData.append('unidad_defecto', unidadDefecto);
    formData.append('precios_incluyen_iva', String(preciosConIva));
    formData.append('crear_pendientes', String(crearPendientes));

    dryRun ? setCargando(true) : setAplicando(true);
    try {
      const { data } = await axios.post<ResultadoLista>(
        `${API}/api/proveedores/${proveedorId}/importar-precios`,
        formData
      );
      setResultado(data);
      if (dryRun) {
        toast.info(data.message ?? 'Previsualización lista. Revisa antes de aplicar.');
      } else {
        toast.success(data.message ?? 'Lista de precios aplicada');
        if (onAplicado) onAplicado();
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'No se pudo procesar la lista de precios');
    } finally {
      setCargando(false);
      setAplicando(false);
    }
  };

  const limpiar = () => {
    setArchivo(null);
    setResultado(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', borderRadius: RADIUS.md, border: '1px solid var(--border-strong, #c7cdd7)',
    fontSize: FONT.base, background: 'var(--surface, #fff)', color: 'var(--text, #111620)', width: '100%',
  };

  const etiqueta: React.CSSProperties = {
    fontSize: FONT.sm, fontWeight: 600, color: 'var(--text, #111620)', display: 'block', marginBottom: 4,
  };

  const yaAplicado = resultado !== null && resultado.dry_run === false;

  return (
    <div
      style={{
        background: 'var(--surface, #ffffff)',
        border: '1px solid var(--border, #e1e5eb)',
        borderRadius: RADIUS['3xl'],
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* ── Encabezado ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div
          style={{
            width: 40, height: 40, borderRadius: RADIUS.xl, flexShrink: 0,
            background: 'rgba(5, 150, 105, 0.12)', color: '#047857',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <FileSpreadsheet size={20} />
        </div>
        <div>
          <h3 style={{ fontSize: FONT.lg, fontWeight: 700, margin: 0, color: 'var(--text, #111620)' }}>
            Importar lista de precios (Excel)
          </h3>
          <p style={{ fontSize: FONT.sm, color: 'var(--text-muted, #2f3746)', margin: '3px 0 0', lineHeight: 1.45, maxWidth: 720 }}>
            La factura dice qué pagaste ese día; la lista dice qué cobra el proveedor. Sube su Excel y el
            sistema reconoce las columnas solo: primero te muestra qué haría, y solo aplica cuando lo confirmas.
          </p>
        </div>
      </div>

      {/* ── Formulario ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        <div>
          <label style={etiqueta}>Proveedor *</label>
          <select
            value={proveedorId}
            onChange={(e) => { setProveedorId(e.target.value); setResultado(null); }}
            style={inputStyle}
          >
            <option value="">Selecciona el proveedor…</option>
            {proveedores.map((p) => (
              <option key={p.id} value={String(p.id)}>{p.nombre_comercial}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={etiqueta}>Archivo (.xlsx / .xls) *</label>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => { setArchivo(e.target.files?.[0] ?? null); setResultado(null); }}
            style={{ ...inputStyle, padding: '6px 8px' }}
          />
        </div>

        <div>
          <label style={etiqueta}>Fecha de vigencia de la lista</label>
          <input
            type="date"
            value={fechaLista}
            onChange={(e) => setFechaLista(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={etiqueta}>Modalidad si la lista no la dice</label>
          <select value={unidadDefecto} onChange={(e) => setUnidadDefecto(e.target.value)} style={inputStyle}>
            {MODALIDADES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: FONT.sm, cursor: 'pointer', color: 'var(--text, #111620)' }}>
          <input type="checkbox" checked={preciosConIva} onChange={(e) => { setPreciosConIva(e.target.checked); setResultado(null); }} />
          Los precios del archivo incluyen IVA (se descuenta para guardar la base comparable)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: FONT.sm, cursor: 'pointer', color: 'var(--text, #111620)' }}>
          <input type="checkbox" checked={crearPendientes} onChange={(e) => setCrearPendientes(e.target.checked)} />
          Enviar a «Por Mapear» los códigos que aún no tienen equivalencia
        </label>
      </div>

      {/* ── Acciones ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => enviar(true)}
          disabled={cargando || aplicando || !archivo || !proveedorId}
          style={{
            background: !archivo || !proveedorId ? '#6f7a8c' : 'var(--primary)', color: '#fff', border: 'none',
            padding: '8px 18px', borderRadius: RADIUS.md, fontSize: FONT.base, fontWeight: 600,
            cursor: !archivo || !proveedorId ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 7,
          }}
        >
          {cargando ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}
          Previsualizar
        </button>

        {resultado && resultado.dry_run && (
          <button
            type="button"
            onClick={() => enviar(false)}
            disabled={aplicando || resultado.precios_actualizados.length + resultado.codigos_nuevos_pendientes.length === 0}
            style={{
              background: '#047857', color: '#fff', border: 'none',
              padding: '8px 18px', borderRadius: RADIUS.md, fontSize: FONT.base, fontWeight: 600,
              cursor: aplicando ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 7,
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.28)',
            }}
          >
            {aplicando ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
            Aplicar {resultado.precios_actualizados.length} cambio(s)
          </button>
        )}

        {(archivo || resultado) && (
          <button
            type="button"
            onClick={limpiar}
            style={{
              background: 'transparent', border: '1px solid var(--border-strong, #c7cdd7)',
              padding: '8px 14px', borderRadius: RADIUS.md, fontSize: FONT.sm, fontWeight: 600,
              color: 'var(--text-muted, #2f3746)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <X size={14} /> Limpiar
          </button>
        )}
      </div>

      {/* ── Resultado ── */}
      {resultado && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}
        >
          {/* Banda de estado */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: RADIUS.lg,
              background: yaAplicado ? 'rgba(5, 150, 105, 0.08)' : 'rgba(99, 102, 241, 0.07)',
              border: `1px solid ${yaAplicado ? 'rgba(5, 150, 105, 0.25)' : 'rgba(99, 102, 241, 0.25)'}`,
            }}
          >
            {yaAplicado ? <CheckCircle2 size={16} color="#047857" /> : <Info size={16} color="#4338ca" />}
            <span style={{ fontSize: FONT.sm, fontWeight: 600, color: yaAplicado ? '#047857' : '#4338ca' }}>
              {resultado.message}
            </span>
          </div>

          {/* Columnas detectadas — el punto de control del mapeo */}
          <div
            style={{
              background: 'var(--surface-subtle, #f6f7f9)', border: '1px solid var(--border, #e1e5eb)',
              borderRadius: RADIUS.xl, padding: '12px 16px',
            }}
          >
            <div style={{ fontSize: FONT.sm, fontWeight: 600, color: 'var(--text, #111620)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ListChecks size={13} /> Columnas reconocidas (encabezados en la fila {resultado.fila_encabezado})
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(resultado.columnas_detectadas).map(([campo, col]) => (
                <span
                  key={campo}
                  style={{
                    fontSize: FONT.xs, padding: '3px 9px', borderRadius: RADIUS.sm, fontWeight: 600,
                    background: col ? 'rgba(5, 150, 105, 0.1)' : 'rgba(100, 116, 139, 0.1)',
                    color: col ? '#047857' : '#2f3746',
                  }}
                >
                  {campo}: {col ?? 'no encontrada'}
                </span>
              ))}
            </div>
            <div style={{ fontSize: FONT.xs, color: 'var(--text-muted, #2f3746)', marginTop: 8 }}>
              {resultado.total_filas_leidas} fila(s) leída(s) · {resultado.filas_ignoradas} sin precio o vacías ·{' '}
              {resultado.precios_sin_cambio} ya estaban en ese precio
            </div>
          </div>

          {/* Cambios de precio */}
          {resultado.precios_actualizados.length > 0 && (
            <div>
              <div style={{ fontSize: FONT.base, fontWeight: 700, color: 'var(--text, #111620)', marginBottom: 8 }}>
                {yaAplicado ? 'Precios actualizados' : 'Precios que cambiarían'} ({resultado.precios_actualizados.length})
              </div>
              <div style={{ border: '1px solid var(--border, #e1e5eb)', borderRadius: RADIUS.lg, overflow: 'hidden', maxHeight: 320, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: FONT.sm, textAlign: 'left' }}>
                  <thead style={{ position: 'sticky', top: 0 }}>
                    <tr style={{ background: 'var(--surface-subtle, #f6f7f9)', borderBottom: '1px solid var(--border, #e1e5eb)' }}>
                      <th style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text, #111620)' }}>Código / Descripción</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text, #111620)' }}>Modalidad</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text, #111620)' }}>Antes</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text, #111620)' }}>Ahora</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text, #111620)' }}>Variación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.precios_actualizados.map((c, idx) => {
                      const pct = c.variacion_pct ?? 0;
                      const Icon = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus;
                      const color = c.anomalo ? '#b91c1c' : pct > 0 ? '#b45309' : '#15803d';
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle, #eef0f4)', background: c.anomalo ? 'rgba(239, 68, 68, 0.04)' : 'transparent' }}>
                          <td style={{ padding: '8px 12px' }}>
                            <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: FONT.xs, color: 'var(--primary-strong, #4338ca)' }}>{c.codigo}</div>
                            <div style={{ fontSize: FONT.sm, color: 'var(--text-muted, #2f3746)' }}>{c.descripcion}</div>
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: FONT.xs, color: 'var(--text-muted, #2f3746)' }}>{c.unidad_compra}</td>
                          <td style={{ padding: '8px 12px', color: 'var(--text-muted, #2f3746)' }}>{formatCOP(c.precio_anterior)}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 700, color: '#047857' }}>{formatCOP(c.precio_nuevo)}</td>
                          <td style={{ padding: '8px 12px' }}>
                            {c.variacion_pct !== null ? (
                              <span
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 3, color, fontWeight: 600,
                                  fontSize: FONT.xs, background: `${color}18`, padding: '2px 6px', borderRadius: RADIUS.sm,
                                }}
                              >
                                <Icon size={11} />
                                {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                                {c.anomalo && <AlertTriangle size={11} style={{ marginLeft: 2 }} />}
                              </span>
                            ) : (
                              <span style={{ fontSize: FONT.xs, color: 'var(--text-muted, #2f3746)' }}>primer precio</span>
                            )}
                            {c.retroactivo && (
                              <div
                                title="La lista es anterior al precio vigente: se archiva en el histórico sin reemplazarlo"
                                style={{ fontSize: FONT.tiny, color: '#2f3746', marginTop: 3, display: 'flex', alignItems: 'center', gap: 3 }}
                              >
                                <History size={10} /> archivado
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {resultado.precios_actualizados.some((c) => c.anomalo) && (
                <div style={{ fontSize: FONT.xs, color: '#b45309', marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <AlertTriangle size={12} />
                  Hay saltos mayores al {resultado.umbral_variacion_pct}% configurado. Verifícalos antes de aplicar.
                </div>
              )}
            </div>
          )}

          {/* Códigos nuevos */}
          {resultado.codigos_nuevos_pendientes.length > 0 && (
            <div
              style={{
                background: 'rgba(245, 158, 11, 0.07)', border: '1px solid rgba(245, 158, 11, 0.25)',
                borderRadius: RADIUS.lg, padding: '10px 14px',
              }}
            >
              <div style={{ fontSize: FONT.sm, fontWeight: 700, color: '#b45309', marginBottom: 4 }}>
                {resultado.codigos_nuevos_pendientes.length} código(s) sin equivalencia
                {yaAplicado ? ' enviados a Por Mapear' : crearPendientes ? ' irían a Por Mapear' : ' se ignorarían'}
              </div>
              <div style={{ fontSize: FONT.xs, color: 'var(--text-muted, #2f3746)', maxHeight: 90, overflowY: 'auto' }}>
                {resultado.codigos_nuevos_pendientes.slice(0, 25).map((n, i) => (
                  <div key={i}>{n.codigo} — {n.descripcion} ({formatCOP(n.precio)})</div>
                ))}
                {resultado.codigos_nuevos_pendientes.length > 25 && <div>…y {resultado.codigos_nuevos_pendientes.length - 25} más</div>}
              </div>
            </div>
          )}

          {/* Filas no aplicadas */}
          {resultado.filas_no_aplicadas.length > 0 && (
            <div>
              <div style={{ fontSize: FONT.sm, fontWeight: 700, color: 'var(--text, #111620)', marginBottom: 6 }}>
                Filas que no se aplican ({resultado.filas_no_aplicadas.length})
              </div>
              <div style={{ fontSize: FONT.xs, color: 'var(--text-muted, #2f3746)', maxHeight: 110, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {resultado.filas_no_aplicadas.slice(0, 25).map((f, i) => (
                  <div key={i}>Fila {f.fila} · {f.codigo}: {f.motivo}</div>
                ))}
              </div>
            </div>
          )}

          {/* Errores de lectura */}
          {resultado.errores.length > 0 && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: RADIUS.lg, padding: '10px 14px', maxHeight: 120, overflowY: 'auto',
              }}
            >
              {resultado.errores.map((e, i) => (
                <div key={i} style={{ fontSize: FONT.xs, color: '#991b1b' }}>{e}</div>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};

export default ImportarListaPreciosPanel;
