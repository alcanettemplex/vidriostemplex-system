import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Wand2, Loader2, CheckCircle2, AlertTriangle, Info } from '../../../../components/ui/icons';
import { toast } from 'react-toastify';
import API from '../../../../services/config';
import { RADIUS, FONT } from '../../styleTokens';

/**
 * Regla de código de un proveedor (2026-09-30).
 *
 * Algunos proveedores facturan el mismo producto con códigos distintos (GRUPO ROLDAN:
 * GRE175NG / ALU175NG). La regla le enseña al sistema a reconocerlos. Este modal nunca
 * deja activar una regla a ciegas: cada cambio se prueba contra los mapeos que ya hiciste
 * —que son la verdad— y muestra qué haría con la bandeja antes de guardar.
 */

export interface ProveedorConRegla {
  id: number;
  nombre_comercial: string;
  regla_codigo?: string | null;
  regla_codigo_modo?: string | null;
}

interface ReglaDisponible {
  regla: string;
  titulo: string;
  descripcion: string;
  ejemplo: string;
}

interface ProductoRef { codigo: string; nombre: string }

interface Prueba {
  modo: 'AUTO' | 'SUGERENCIA';
  modos_permitidos: Array<'AUTO' | 'SUGERENCIA'>;
  bloqueo?: string;
  evidencia: {
    aciertos: Array<{ codigo_a: string; codigo_b: string; producto: ProductoRef | null }>;
    errores: Array<{ codigo_a: string; codigo_b: string; producto_a: ProductoRef | null; producto_b: ProductoRef | null }>;
  };
  previsualizacion: Array<{
    pendiente_id: number;
    codigo: string;
    descripcion: string;
    accion: 'VINCULAR' | 'SUGERIR';
    producto: ProductoRef | null;
    unidad_compra: string | null;
    via_codigo: string | null;
    variacion_pct: number | null;
    motivo: string | null;
  }>;
}

interface Props {
  proveedor: ProveedorConRegla;
  onClose: () => void;
  onGuardado: () => void;
}

const MODOS: Record<'AUTO' | 'SUGERENCIA', { texto: string; ayuda: string }> = {
  AUTO: {
    texto: 'Automático',
    ayuda: 'Al cargar facturas, vincula sola el código nuevo y aplica su precio. Lo verás en el resumen del lote y podrás quitarlo en Equivalencias.',
  },
  SUGERENCIA: {
    texto: 'Solo sugerir',
    ayuda: 'El código cae en Por Mapear con el producto ya propuesto; lo confirmas tú con un clic.',
  },
};

const ReglaCodigoModal: React.FC<Props> = ({ proveedor, onClose, onGuardado }) => {
  const [reglas, setReglas] = useState<ReglaDisponible[]>([]);
  const [regla, setRegla] = useState<string>(proveedor.regla_codigo ?? '');
  const [modo, setModo] = useState<'AUTO' | 'SUGERENCIA'>((proveedor.regla_codigo_modo as 'AUTO' | 'SUGERENCIA') ?? 'AUTO');
  const [aplicarBandeja, setAplicarBandeja] = useState(true);
  const [prueba, setPrueba] = useState<Prueba | null>(null);
  const [probando, setProbando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    axios.get(`${API}/api/proveedores/reglas-codigo`)
      .then(({ data }) => setReglas(data?.reglas ?? []))
      .catch(() => toast.error('No se pudo cargar la lista de reglas. Cierra y vuelve a intentarlo.'));
  }, []);

  // Cada cambio de regla o de modo se vuelve a probar: la evidencia es lo que decide
  useEffect(() => {
    if (!regla) { setPrueba(null); return; }
    let vigente = true;
    setProbando(true);
    axios.post<Prueba>(`${API}/api/proveedores/${proveedor.id}/regla-codigo`, { regla, modo, dry_run: true, aplicar_bandeja: aplicarBandeja })
      .then(({ data }) => {
        if (!vigente) return;
        setPrueba(data);
        // Si el modo elegido no está permitido pero el otro sí, se ofrece el permitido
        if (!data.modos_permitidos.includes(modo) && data.modos_permitidos.length > 0) setModo(data.modos_permitidos[0]);
      })
      .catch((err) => vigente && toast.error(err?.response?.data?.error ?? 'No se pudo probar la regla'))
      .finally(() => vigente && setProbando(false));
    return () => { vigente = false; };
  }, [regla, modo, aplicarBandeja, proveedor.id]);

  const definicion = reglas.find((r) => r.regla === regla);
  const bloqueada = !!regla && (!prueba || prueba.modos_permitidos.length === 0 || !prueba.modos_permitidos.includes(modo));
  const aVincular = prueba?.previsualizacion.filter((p) => p.accion === 'VINCULAR') ?? [];
  const sinCambios = regla === (proveedor.regla_codigo ?? '') && (!regla || modo === proveedor.regla_codigo_modo) && aVincular.length === 0;

  const guardar = async () => {
    setGuardando(true);
    try {
      const { data } = await axios.post(`${API}/api/proveedores/${proveedor.id}/regla-codigo`, {
        regla: regla || null,
        ...(regla ? { modo } : {}),
        aplicar_bandeja: aplicarBandeja,
        dry_run: false,
      });
      toast.success(data?.message ?? 'Regla guardada');
      onGuardado();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'No se pudo guardar la regla');
    } finally {
      setGuardando(false);
    }
  };

  const seccion: React.CSSProperties = {
    border: '1px solid var(--border)', borderRadius: RADIUS.lg, padding: '12px 14px', background: 'var(--surface-subtle, #f6f7f9)',
  };
  const etiqueta: React.CSSProperties = { fontSize: FONT.sm, fontWeight: 700, color: 'var(--text)', marginBottom: 6, letterSpacing: .3 };
  const chip = (color: string): React.CSSProperties => ({
    fontFamily: 'monospace', fontSize: FONT.xs, fontWeight: 600, color, background: `${color}14`,
    padding: '1px 6px', borderRadius: RADIUS.xs,
  });

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
          zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ scale: .96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: .96, opacity: 0 }}
          style={{
            background: 'var(--surface)', borderRadius: RADIUS['4xl'], width: '100%', maxWidth: 720,
            border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh',
          }}
        >
          {/* Encabezado */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Wand2 size={20} color="var(--primary)" />
              <div>
                <div style={{ fontWeight: 700, fontSize: FONT.xl, color: 'var(--text)' }}>Regla de códigos</div>
                <div style={{ fontSize: FONT.sm, color: 'var(--text-muted)' }}>{proveedor.nombre_comercial}</div>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <X size={20} />
            </button>
          </div>

          <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
            <div style={{ fontSize: FONT.base, color: 'var(--text)', lineHeight: 1.5 }}>
              Si este proveedor factura <strong>el mismo producto con códigos distintos</strong>, una regla evita que tengas que
              mapearlo cada vez. La regla solo mira lo que <strong>este proveedor</strong> ya tiene mapeado.
            </div>

            {/* Regla */}
            <div>
              <div style={etiqueta}>REGLA</div>
              <select
                value={regla}
                onChange={(e) => setRegla(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border-strong, var(--border))',
                  borderRadius: RADIUS.lg, color: 'var(--text)', fontSize: FONT.md, cursor: 'pointer',
                }}
              >
                <option value="">Sin regla — cada código nuevo va a Por Mapear</option>
                {reglas.map((r) => <option key={r.regla} value={r.regla}>{r.titulo}</option>)}
              </select>
              {definicion && (
                <div style={{ fontSize: FONT.sm, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.45 }}>
                  {definicion.descripcion}
                  <div style={{ marginTop: 3 }}>Ejemplo: <span style={{ fontFamily: 'monospace', color: 'var(--text)' }}>{definicion.ejemplo}</span></div>
                </div>
              )}
            </div>

            {regla && (
              <>
                {/* Modo */}
                <div>
                  <div style={etiqueta}>CUANDO RECONOZCA UN CÓDIGO</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {(['AUTO', 'SUGERENCIA'] as const).map((m) => {
                      const permitido = !prueba || prueba.modos_permitidos.includes(m);
                      const activo = modo === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          disabled={!permitido}
                          onClick={() => setModo(m)}
                          title={!permitido ? 'La evidencia de esta regla no alcanza para este modo' : undefined}
                          style={{
                            textAlign: 'left', padding: '10px 12px', borderRadius: RADIUS.lg, cursor: permitido ? 'pointer' : 'not-allowed',
                            border: `1.5px solid ${activo ? 'var(--primary)' : 'var(--border)'}`,
                            background: activo ? 'rgba(99, 102, 241, 0.06)' : 'var(--bg)', opacity: permitido ? 1 : .45,
                          }}
                        >
                          <div style={{ fontSize: FONT.md, fontWeight: 700, color: 'var(--text)' }}>{MODOS[m].texto}</div>
                          <div style={{ fontSize: FONT.xs, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>{MODOS[m].ayuda}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Evidencia */}
                <div style={seccion}>
                  <div style={{ ...etiqueta, display: 'flex', alignItems: 'center', gap: 6 }}>
                    PRUEBA CONTRA TUS MAPEOS {probando && <Loader2 size={12} className="animate-spin" />}
                  </div>
                  {prueba && (
                    <>
                      <div style={{ display: 'flex', gap: 14, fontSize: FONT.base, color: 'var(--text)', flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#047857', fontWeight: 600 }}>
                          <CheckCircle2 size={14} /> {prueba.evidencia.aciertos.length} acierto(s)
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: prueba.evidencia.errores.length ? '#b91c1c' : 'var(--text-muted)', fontWeight: 600 }}>
                          <AlertTriangle size={14} /> {prueba.evidencia.errores.length} error(es)
                        </span>
                      </div>
                      <div style={{ fontSize: FONT.xs, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>
                        Un acierto es un par de códigos que la regla considera iguales y que tú también mapeaste al mismo producto.
                        Un error es un par que la regla uniría pero que tú separaste: con uno solo, la regla no se activa.
                      </div>
                      {prueba.evidencia.aciertos.slice(0, 6).map((a, i) => (
                        <div key={`a${i}`} style={{ fontSize: FONT.sm, marginTop: 5, color: 'var(--text)' }}>
                          <span style={chip('#4338ca')}>{a.codigo_a}</span> = <span style={chip('#4338ca')}>{a.codigo_b}</span>
                          <span style={{ color: 'var(--text-muted)' }}> → {a.producto?.codigo}</span>
                        </div>
                      ))}
                      {prueba.evidencia.errores.slice(0, 6).map((e, i) => (
                        <div key={`e${i}`} style={{ fontSize: FONT.sm, marginTop: 5, color: '#b91c1c' }}>
                          <span style={chip('#b91c1c')}>{e.codigo_a}</span> ({e.producto_a?.codigo}) ≠ <span style={chip('#b91c1c')}>{e.codigo_b}</span> ({e.producto_b?.codigo})
                        </div>
                      ))}
                      {prueba.bloqueo && (
                        <div style={{ marginTop: 8, fontSize: FONT.sm, color: '#b45309', display: 'flex', gap: 6, lineHeight: 1.4 }}>
                          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {prueba.bloqueo}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Bandeja actual */}
                <div style={seccion}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: FONT.base, fontWeight: 600, color: 'var(--text)' }}>
                    <input type="checkbox" checked={aplicarBandeja} onChange={(e) => setAplicarBandeja(e.target.checked)} />
                    Aplicar también a lo que ya está en Por Mapear ({prueba?.previsualizacion.length ?? 0})
                  </label>
                  {prueba && prueba.previsualizacion.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                      {prueba.previsualizacion.map((p) => (
                        <div key={p.pendiente_id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: FONT.sm, color: 'var(--text)' }}>
                          <span style={{
                            fontSize: FONT.tiny, fontWeight: 700, padding: '1px 6px', borderRadius: RADIUS.xs, flexShrink: 0,
                            color: p.accion === 'VINCULAR' ? '#047857' : '#b45309',
                            background: p.accion === 'VINCULAR' ? 'rgba(5,150,105,.1)' : 'rgba(245,158,11,.12)',
                          }}>
                            {p.accion === 'VINCULAR' ? (aplicarBandeja ? 'SE VINCULA' : 'VINCULABLE') : 'SE SUGIERE'}
                          </span>
                          <span style={chip('#4338ca')}>{p.codigo}</span>
                          <span>→ <strong>{p.producto?.codigo}</strong> <span style={{ color: 'var(--text-muted)' }}>(como {p.via_codigo})</span></span>
                          {p.motivo && <span style={{ color: '#b45309' }}>· {p.motivo}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Pie */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
            <button type="button" onClick={onClose} style={{
              padding: '10px 20px', borderRadius: RADIUS.lg, border: '1px solid var(--border)',
              background: 'var(--bg)', color: 'var(--text)', fontSize: FONT.md, cursor: 'pointer', fontWeight: 500,
            }}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={guardando || probando || bloqueada || sinCambios}
              style={{
                padding: '10px 22px', borderRadius: RADIUS.lg, border: 'none',
                background: guardando || probando || bloqueada || sinCambios ? 'var(--border)' : 'var(--primary)',
                color: '#fff', fontSize: FONT.md, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
                cursor: guardando || probando || bloqueada || sinCambios ? 'not-allowed' : 'pointer',
              }}
            >
              {guardando && <Loader2 size={15} className="animate-spin" />}
              {!regla
                ? 'Quitar regla'
                : aplicarBandeja && modo === 'AUTO' && aVincular.length > 0
                  ? `Guardar y vincular ${aVincular.length}`
                  : 'Guardar regla'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ReglaCodigoModal;
