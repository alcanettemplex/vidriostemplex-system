import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Loader2, X, Package, Building2, Clock, GitCompare, FileCheck2, Sparkles, CornerDownLeft,
} from 'lucide-react';
import {
  useBusquedaModulo, MIN_CARACTERES,
  ProductoSugerido, ProveedorSugerido, PendienteSugerido, EquivalenciaSugerida, FacturaSugerida,
} from '../hooks/useBusquedaModulo';

/**
 * Barra única del módulo: se escribe una vez y el sistema relaciona producto,
 * proveedor, código de factura, equivalencia y documento procesado.
 *
 * Antes había seis buscadores con seis alcances distintos, y para encontrar algo
 * había que saber de antemano en cuál de las cinco pestañas vivía. Aquí se escribe
 * lo que se tenga a mano —el código propio, el del proveedor, el nombre, un
 * sinónimo— y el resultado dice a qué pestaña lleva.
 */

export type SeleccionBusqueda =
  | { tipo: 'producto'; id: number; etiqueta: string }
  | { tipo: 'proveedor'; id: number; etiqueta: string }
  | { tipo: 'pendiente'; codigo: string; etiqueta: string }
  | { tipo: 'equivalencia'; codigo: string; etiqueta: string }
  | { tipo: 'factura'; termino: string; etiqueta: string };

interface Props {
  onSeleccion: (seleccion: SeleccionBusqueda) => void;
}

const formatCOP = (val: number | null): string => {
  if (val === null || val === undefined) return 'sin precio';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
};

const ETIQUETA_UNIDAD: Record<string, string> = {
  UNIDAD: 'unidad',
  TIRA_6M: 'tira 6 m',
  METRO: 'metro',
  KG: 'kg',
  M2: 'm²',
  ML: 'ml',
};

/** Texto que explica por qué apareció un producto: es lo que vuelve confiable la sugerencia */
const textoMotivo = (p: ProductoSugerido): string | null => {
  switch (p.motivo?.tipo) {
    case 'CODIGO_PROVEEDOR': return `código del proveedor · ${p.motivo.detalle}`;
    case 'ALIAS': return `sinónimo aprendido · «${p.motivo.detalle}»`;
    case 'CODIGO': return null;
    default: return null;
  }
};

const BuscadorProveedores: React.FC<Props> = ({ onSeleccion }) => {
  const [termino, setTermino] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);

  const contenedorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { datos, cargando } = useBusquedaModulo(termino);

  // Lista plana de todo lo visible: es lo que recorren las flechas del teclado
  const items = useMemo(() => {
    if (!datos) return [] as Array<{ seleccion: SeleccionBusqueda }>;
    const plano: Array<{ seleccion: SeleccionBusqueda }> = [];

    datos.productos.forEach((p) =>
      plano.push({ seleccion: { tipo: 'producto', id: p.id, etiqueta: `${p.codigo} · ${p.nombre}` } }));
    datos.proveedores.forEach((p) =>
      plano.push({ seleccion: { tipo: 'proveedor', id: p.id, etiqueta: p.nombre_comercial } }));
    datos.pendientes.forEach((b) =>
      plano.push({ seleccion: { tipo: 'pendiente', codigo: b.codigo_proveedor, etiqueta: b.codigo_proveedor } }));
    datos.equivalencias.forEach((e) =>
      plano.push({ seleccion: { tipo: 'equivalencia', codigo: e.codigo_proveedor, etiqueta: e.codigo_proveedor } }));
    datos.facturas.forEach((f) =>
      plano.push({ seleccion: { tipo: 'factura', termino: f.numero_factura ?? '', etiqueta: f.numero_factura ?? '' } }));

    return plano;
  }, [datos]);

  useEffect(() => { setActivo(0); }, [datos]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);

  const elegir = (seleccion: SeleccionBusqueda) => {
    onSeleccion(seleccion);
    setAbierto(false);
    setTermino('');
    inputRef.current?.blur();
  };

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setAbierto(false); inputRef.current?.blur(); return; }
    if (!abierto || items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActivo((i) => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[activo];
      if (item) elegir(item.seleccion);
    }
  };

  const hayResultados = !!datos && datos.total > 0;
  const sinResultados = !!datos && datos.total === 0 && !cargando;
  const cortoParaBuscar = termino.trim().length > 0 && termino.trim().length < MIN_CARACTERES;

  // Índice global de cada grupo, para saber cuál está resaltado por teclado
  let cursor = 0;
  const indiceDe = () => cursor++;

  const estiloFila = (i: number): React.CSSProperties => ({
    padding: '9px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer',
    background: i === activo ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
    borderLeft: i === activo ? '3px solid #6366f1' : '3px solid transparent',
  });

  const Encabezado: React.FC<{ icono: React.ReactNode; texto: string; n: number }> = ({ icono, texto, n }) => (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px 5px',
        fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: 'var(--text-muted, #94a3b8)', background: 'var(--surface-subtle, #f8fafc)',
        borderTop: '1px solid var(--border, #f1f5f9)',
      }}
    >
      {icono} {texto} <span style={{ fontWeight: 600 }}>({n})</span>
    </div>
  );

  return (
    <div ref={contenedorRef} style={{ position: 'relative', marginBottom: 18 }}>
      {/* ── Caja ── */}
      <div style={{ position: 'relative' }}>
        <Search
          size={17}
          style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #94a3b8)' }}
        />
        <input
          ref={inputRef}
          value={termino}
          onChange={(e) => { setTermino(e.target.value); setAbierto(true); }}
          onFocus={() => setAbierto(true)}
          onKeyDown={teclas}
          placeholder="Busca en todo el módulo: código propio, código del proveedor, nombre, sinónimo, NIT, factura…"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '12px 42px 12px 42px',
            borderRadius: 12,
            border: `1px solid ${abierto && hayResultados ? '#6366f1' : 'var(--border, #cbd5e1)'}`,
            background: 'var(--surface, #fff)', color: 'var(--text, #0f172a)',
            fontSize: 14, outline: 'none', transition: 'border-color .15s',
          }}
        />
        {cargando && (
          <Loader2 size={16} className="animate-spin" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: '#6366f1' }} />
        )}
        {!cargando && termino && (
          <button
            type="button"
            onClick={() => { setTermino(''); inputRef.current?.focus(); }}
            style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #94a3b8)',
              display: 'flex', alignItems: 'center', padding: 2,
            }}
            title="Limpiar"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* ── Panel de resultados ── */}
      <AnimatePresence>
        {abierto && (hayResultados || sinResultados || cortoParaBuscar) && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.13 }}
            style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 60,
              background: 'var(--surface, #fff)', border: '1px solid var(--border, #e2e8f0)',
              borderRadius: 14, boxShadow: '0 18px 40px -12px rgba(15, 23, 42, 0.25)',
              maxHeight: 460, overflowY: 'auto',
            }}
          >
            {cortoParaBuscar && (
              <div style={{ padding: '16px', fontSize: 12.5, color: 'var(--text-muted, #94a3b8)' }}>
                Escribe al menos {MIN_CARACTERES} letras.
              </div>
            )}

            {sinResultados && (
              <div style={{ padding: '18px 16px', fontSize: 13, color: 'var(--text-muted, #64748b)' }}>
                Nada coincide con «{datos?.termino}». Prueba con el código del proveedor, con una palabra
                del nombre o con el NIT.
              </div>
            )}

            {hayResultados && datos && (
              <>
                {/* Productos */}
                {datos.productos.length > 0 && (
                  <>
                    <Encabezado icono={<Package size={11} />} texto="Productos" n={datos.productos.length} />
                    {datos.productos.map((p: ProductoSugerido) => {
                      const i = indiceDe();
                      const motivo = textoMotivo(p);
                      return (
                        <div
                          key={`prod-${p.id}`}
                          onClick={() => elegir({ tipo: 'producto', id: p.id, etiqueta: `${p.codigo} · ${p.nombre}` })}
                          onMouseEnter={() => setActivo(i)}
                          style={estiloFila(i)}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 12, color: '#4338ca', background: 'rgba(99, 102, 241, 0.1)', padding: '2px 7px', borderRadius: 5 }}>
                                {p.codigo}
                              </span>
                              <span style={{ fontSize: 13.5, color: 'var(--text, #1e293b)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {p.nombre}
                              </span>
                            </div>
                            {motivo && (
                              <div style={{ fontSize: 10.5, color: '#7c3aed', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Sparkles size={10} /> {motivo}
                              </div>
                            )}
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            {p.total_proveedores > 0 ? (
                              <>
                                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#059669' }}>
                                  desde {formatCOP(p.precio_min)}
                                </div>
                                <div style={{ fontSize: 10.5, color: 'var(--text-muted, #94a3b8)' }}>
                                  {p.total_proveedores} proveedor{p.total_proveedores !== 1 ? 'es' : ''}
                                  {p.unidad_precio_min ? ` · por ${ETIQUETA_UNIDAD[p.unidad_precio_min] ?? p.unidad_precio_min}` : ''}
                                </div>
                              </>
                            ) : (
                              <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)' }}>sin precios aún</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}

                {/* Proveedores */}
                {datos.proveedores.length > 0 && (
                  <>
                    <Encabezado icono={<Building2 size={11} />} texto="Proveedores" n={datos.proveedores.length} />
                    {datos.proveedores.map((p: ProveedorSugerido) => {
                      const i = indiceDe();
                      return (
                        <div
                          key={`prov-${p.id}`}
                          onClick={() => elegir({ tipo: 'proveedor', id: p.id, etiqueta: p.nombre_comercial })}
                          onMouseEnter={() => setActivo(i)}
                          style={estiloFila(i)}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text, #1e293b)' }}>
                              {p.nombre_comercial}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)' }}>
                              {p.nit ? `NIT ${p.nit}` : 'sin NIT'}
                              {!p.seguir_precios && ' · sin seguimiento de precios'}
                            </div>
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-muted, #64748b)', flexShrink: 0 }}>
                            {p.total_equivalencias} producto{p.total_equivalencias !== 1 ? 's' : ''}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}

                {/* Por mapear */}
                {datos.pendientes.length > 0 && (
                  <>
                    <Encabezado icono={<Clock size={11} />} texto="Por mapear" n={datos.pendientes.length} />
                    {datos.pendientes.map((b: PendienteSugerido) => {
                      const i = indiceDe();
                      return (
                        <div
                          key={`pend-${b.id}`}
                          onClick={() => elegir({ tipo: 'pendiente', codigo: b.codigo_proveedor, etiqueta: b.codigo_proveedor })}
                          onMouseEnter={() => setActivo(i)}
                          style={estiloFila(i)}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 11.5, color: '#b45309', background: 'rgba(245, 158, 11, 0.12)', padding: '2px 7px', borderRadius: 5 }}>
                                {b.codigo_proveedor}
                              </span>
                              <span style={{ fontSize: 12.5, color: 'var(--text, #334155)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {b.descripcion_proveedor ?? 'sin descripción'}
                              </span>
                            </div>
                            <div style={{ fontSize: 10.5, color: 'var(--text-muted, #94a3b8)', marginTop: 2 }}>
                              {b.proveedor?.nombre_comercial ?? '—'} · visto {b.veces_visto} vez/veces
                            </div>
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#059669', flexShrink: 0 }}>
                            {formatCOP(b.precio_detectado)}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}

                {/* Equivalencias */}
                {datos.equivalencias.length > 0 && (
                  <>
                    <Encabezado icono={<GitCompare size={11} />} texto="Equivalencias" n={datos.equivalencias.length} />
                    {datos.equivalencias.map((e: EquivalenciaSugerida) => {
                      const i = indiceDe();
                      return (
                        <div
                          key={`equi-${e.id}`}
                          onClick={() => elegir({ tipo: 'equivalencia', codigo: e.codigo_proveedor, etiqueta: e.codigo_proveedor })}
                          onMouseEnter={() => setActivo(i)}
                          style={estiloFila(i)}
                        >
                          <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--text, #334155)' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#4338ca' }}>{e.codigo_proveedor}</span>
                            {' → '}
                            <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{e.producto?.codigo ?? '—'}</span>
                            <div style={{ fontSize: 10.5, color: 'var(--text-muted, #94a3b8)', marginTop: 2 }}>
                              {e.proveedor?.nombre_comercial ?? '—'} · {e.producto?.nombre ?? ''}
                            </div>
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#059669', flexShrink: 0 }}>
                            {formatCOP(e.precio_actual)}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}

                {/* Facturas */}
                {datos.facturas.length > 0 && (
                  <>
                    <Encabezado icono={<FileCheck2 size={11} />} texto="Documentos procesados" n={datos.facturas.length} />
                    {datos.facturas.map((f: FacturaSugerida) => {
                      const i = indiceDe();
                      return (
                        <div
                          key={`fact-${f.id}`}
                          onClick={() => elegir({ tipo: 'factura', termino: f.numero_factura ?? '', etiqueta: f.numero_factura ?? '' })}
                          onMouseEnter={() => setActivo(i)}
                          style={estiloFila(i)}
                        >
                          <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--text, #334155)' }}>
                            <strong>
                              {f.tipo_documento === 'FACTURA' ? 'FE' : f.tipo_documento === 'NOTA_CREDITO' ? 'NC' : 'ND'}{' '}
                              {f.numero_factura ?? '—'}
                            </strong>
                            <div style={{ fontSize: 10.5, color: 'var(--text-muted, #94a3b8)', marginTop: 2 }}>
                              {f.proveedor?.nombre_comercial ?? '—'}
                              {f.motivo_omision ? ' · registrada sin mover precios' : ''}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}

                {/* Ayuda de teclado */}
                <div
                  style={{
                    padding: '7px 16px', borderTop: '1px solid var(--border, #f1f5f9)',
                    background: 'var(--surface-subtle, #f8fafc)', fontSize: 10.5,
                    color: 'var(--text-muted, #94a3b8)', display: 'flex', alignItems: 'center', gap: 12,
                  }}
                >
                  <span>↑ ↓ para moverte</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CornerDownLeft size={10} /> para abrir
                  </span>
                  <span>Esc para cerrar</span>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BuscadorProveedores;
