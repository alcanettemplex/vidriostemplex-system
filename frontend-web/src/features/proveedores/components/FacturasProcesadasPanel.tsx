import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { FileCheck2, Search, RefreshCw, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import API from '../../../services/config';
import { ProveedorCompacto } from '../ProveedoresPage';

/**
 * Historial de documentos ya ingeridos.
 *
 * La tabla `factura_proveedor_procesada` se escribía desde el primer día como
 * garantía de idempotencia, pero nadie podía consultarla: "¿ya cargué las facturas
 * de este proveedor?" solo se respondía volviendo a subir el lote y contando cuántas
 * rebotaban. Esto lo vuelve una pregunta de un vistazo.
 */

interface FacturaProcesada {
  id: number;
  cufe: string;
  numero_factura: string | null;
  fecha_emision: string | null;
  tipo_documento: string;
  moneda: string | null;
  lineas_totales: number;
  lineas_actualizadas: number;
  lineas_pendientes: number;
  lineas_omitidas: number;
  motivo_omision: string | null;
  archivo_origen: string | null;
  fecha_procesado: string | null;
  proveedor?: { id: number; nombre_comercial: string } | null;
}

interface Props {
  proveedores: ProveedorCompacto[];
  /** Al llegar desde el buscador del módulo, el panel se abre ya filtrado por esa factura */
  busquedaInicial?: string;
}

const ETIQUETA_MOTIVO: Record<string, string> = {
  NOTA_CREDITO: 'Nota crédito — sin mover precios',
  NOTA_DEBITO: 'Nota débito — sin mover precios',
  PROVEEDOR_NO_SEGUIDO: 'Proveedor sin seguimiento de precios',
  MONEDA_EXTRANJERA: 'Moneda distinta a COP',
};

const formatFecha = (val: string | null): string => {
  if (!val) return '—';
  const [y, m, d] = val.split('T')[0].split('-');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d}-${meses[parseInt(m) - 1]}-${y.slice(2)}`;
};

const FacturasProcesadasPanel: React.FC<Props> = ({ proveedores, busquedaInicial }) => {
  // Si se llega buscando una factura concreta, el panel nace abierto: obligar a
  // desplegarlo a mano sería devolver al usuario al punto de partida.
  const [abierto, setAbierto] = useState(!!busquedaInicial);
  const [items, setItems] = useState<FacturaProcesada[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState(busquedaInicial ?? '');
  const [qAplicado, setQAplicado] = useState(busquedaInicial ?? '');
  const [filtroProveedor, setFiltroProveedor] = useState('');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQAplicado(q.trim()), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get<{ items: FacturaProcesada[]; total: number }>(
        `${API}/api/proveedores/facturas`,
        { params: { q: qAplicado || undefined, proveedor_id: filtroProveedor || undefined, limit: 50 } }
      );
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'No se pudo cargar el historial de facturas');
    } finally {
      setLoading(false);
    }
  }, [qAplicado, filtroProveedor]);

  // Solo consulta cuando el panel está desplegado: es información de apoyo,
  // no tiene por qué costar una consulta en cada visita a la pestaña.
  useEffect(() => { if (abierto) cargar(); }, [abierto, cargar]);

  const inputStyle: React.CSSProperties = {
    padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border, #cbd5e1)',
    fontSize: 12.5, background: 'var(--surface, #fff)', color: 'var(--text, #0f172a)',
  };

  return (
    <div
      style={{
        background: 'var(--surface, #ffffff)',
        border: '1px solid var(--border, #e2e8f0)',
        borderRadius: 16,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        style={{
          width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
          padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          color: 'var(--text, #0f172a)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FileCheck2 size={17} style={{ color: '#6366f1' }} />
          <span style={{ fontSize: 14, fontWeight: 700 }}>Documentos ya procesados</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', fontWeight: 500 }}>
            — consulta si una factura ya entró antes de volver a subirla
          </span>
        </span>
        {abierto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {abierto && (
        <div style={{ padding: '0 20px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
              <Search size={14} style={{ position: 'absolute', left: 11, top: 9, color: 'var(--text-muted, #94a3b8)' }} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Número de factura, archivo o CUFE completo…"
                style={{ ...inputStyle, width: '100%', paddingLeft: 33 }}
              />
            </div>

            <select value={filtroProveedor} onChange={(e) => setFiltroProveedor(e.target.value)} style={inputStyle}>
              <option value="">Todos los proveedores</option>
              {proveedores.map((p) => (
                <option key={p.id} value={String(p.id)}>{p.nombre_comercial}</option>
              ))}
            </select>

            <button
              type="button"
              onClick={cargar}
              disabled={loading}
              style={{ ...inputStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refrescar
            </button>
          </div>

          {loading ? (
            <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-muted, #64748b)', fontSize: 13 }}>
              <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto 6px', color: '#6366f1', display: 'block' }} />
              Cargando historial…
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: '26px 0', textAlign: 'center', color: 'var(--text-muted, #94a3b8)', fontSize: 13 }}>
              {qAplicado || filtroProveedor
                ? 'Ningún documento coincide con el filtro.'
                : 'Todavía no se ha procesado ninguna factura electrónica.'}
            </div>
          ) : (
            <div style={{ border: '1px solid var(--border, #e2e8f0)', borderRadius: 10, overflow: 'auto', maxHeight: 360 }}>
              <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'left' }}>
                <thead style={{ position: 'sticky', top: 0 }}>
                  <tr style={{ background: 'var(--surface-subtle, #f8fafc)', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                    <th style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Documento</th>
                    <th style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Proveedor</th>
                    <th style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Emisión</th>
                    <th style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text-muted, #64748b)' }}>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((f) => (
                    <tr key={f.id} style={{ borderBottom: '1px solid var(--border, #f1f5f9)' }}>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text, #1e293b)' }}>
                          {f.tipo_documento === 'FACTURA' ? 'FE' : f.tipo_documento === 'NOTA_CREDITO' ? 'NC' : 'ND'}{' '}
                          {f.numero_factura ?? '—'}
                        </div>
                        {f.archivo_origen && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {f.archivo_origen}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--text, #334155)' }}>
                        {f.proveedor?.nombre_comercial ?? '—'}
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-muted, #64748b)' }}>
                        {formatFecha(f.fecha_emision)}
                        {f.moneda && f.moneda !== 'COP' && (
                          <div style={{ fontSize: 11, color: '#b45309', fontWeight: 600 }}>{f.moneda}</div>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        {f.motivo_omision ? (
                          <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>
                            {ETIQUETA_MOTIVO[f.motivo_omision] ?? f.motivo_omision}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11.5, color: 'var(--text-muted, #64748b)' }}>
                            <strong style={{ color: '#059669' }}>{f.lineas_actualizadas}</strong> precio(s) ·{' '}
                            <strong style={{ color: '#d97706' }}>{f.lineas_pendientes}</strong> a mapear ·{' '}
                            {f.lineas_totales} línea(s)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {items.length > 0 && total > items.length && (
            <div style={{ fontSize: 11.5, color: 'var(--text-muted, #64748b)' }}>
              Mostrando los {items.length} más recientes de {total}. Filtra por proveedor o número para acotar.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FacturasProcesadasPanel;
