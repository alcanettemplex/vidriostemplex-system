import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import API from '../../../services/config';

// "Corregir medidas" de un Pedido PV (2026-10-26). Espejo de `utils/pedidoPvCorreccion.ts`
// del backend: estados corregibles y aceptación del proveedor fuera de PENDIENTE.
export const ESTADOS_CORREGIBLES = ['PENDIENTE', 'ENVIADO', 'CONFIRMADO_PROVEEDOR'];

export interface VidrioCorregible {
  id: number;
  cantidad: number;
  ancho_mm: number | null;
  alto_mm: number | null;
  espesor?: string | null;
  color?: string | null;
  dt?: string | null;
}

export interface ResultadoCorreccion {
  pedido: any;
  corregidos: number;
  op_volvio_a_imprimir: boolean;
  planos_desactualizados: string[];
}

const m2 = (ancho: number | null, alto: number | null, cant: number) =>
  ((ancho || 0) * (alto || 0) * (cant || 1)) / 1_000_000;
const fmtM2 = (v: number) => v.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Entero positivo en milímetros, o null si el texto no lo es. */
const leerMm = (v: string): number | null => (/^\d{1,5}$/.test(v.trim()) && Number(v) > 0 ? Number(v) : null);

const CorregirMedidasDialog: React.FC<{
  pedido: { id: number; numero_pedido: string; estado: string; proveedor: string; odp?: { numero_odp: string } | null; items_asignados?: VidrioCorregible[] } | null;
  headers: Record<string, string>;
  onClose: () => void;
  onCorregido: (r: ResultadoCorreccion) => void;
}> = ({ pedido, headers, onClose, onCorregido }) => {
  const vidrios = useMemo(() => pedido?.items_asignados ?? [], [pedido]);
  const [medidas, setMedidas] = useState<Record<number, { ancho: string; alto: string }>>({});
  const [nota, setNota] = useState('');
  const [acepto, setAcepto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMedidas(Object.fromEntries(vidrios.map(v => [v.id, { ancho: String(v.ancho_mm ?? ''), alto: String(v.alto_mm ?? '') }])));
    setNota(''); setAcepto(false); setError(null);
  }, [vidrios]);

  if (!pedido) return null;
  const exigeAceptacion = pedido.estado !== 'PENDIENTE';

  const filas = vidrios.map(v => {
    const m = medidas[v.id] ?? { ancho: '', alto: '' };
    const ancho = leerMm(m.ancho);
    const alto = leerMm(m.alto);
    const valida = ancho !== null && alto !== null;
    const cambia = valida && (ancho !== v.ancho_mm || alto !== v.alto_mm);
    return { v, m, ancho, alto, valida, cambia };
  });
  const invalidas = filas.filter(f => !f.valida).length;
  const cambios = filas.filter(f => f.cambia);
  const totalAntes = vidrios.reduce((s, v) => s + m2(v.ancho_mm, v.alto_mm, v.cantidad), 0);
  const totalNuevo = filas.reduce((s, f) => s + (f.valida ? m2(f.ancho, f.alto, f.v.cantidad) : m2(f.v.ancho_mm, f.v.alto_mm, f.v.cantidad)), 0);
  const puedeGuardar = !guardando && invalidas === 0 && cambios.length > 0 && (!exigeAceptacion || acepto);

  const guardar = async () => {
    setGuardando(true); setError(null);
    try {
      const { data } = await axios.patch<ResultadoCorreccion>(`${API}/api/pedidos-pv/${pedido.id}/corregir-medidas`, {
        cambios: cambios.map(f => ({ odp_item_id: f.v.id, ancho_mm: f.ancho, alto_mm: f.alto })),
        nota: nota.trim() || null,
        ...(exigeAceptacion ? { proveedor_acepto: acepto } : {}),
      }, { headers });
      onCorregido(data);
    } catch (e) {
      const detalle = axios.isAxiosError(e) ? e.response?.data?.error : undefined;
      setError(typeof detalle === 'string' ? detalle : 'No se pudieron corregir las medidas. Intenta de nuevo o recarga la página.');
    } finally {
      setGuardando(false);
    }
  };

  const cambiar = (id: number, campo: 'ancho' | 'alto', valor: string) =>
    setMedidas(prev => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }));

  return (
    <Dialog open onClose={guardando ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Corregir medidas — Pedido {pedido.numero_pedido}
        <Typography variant="body2" color="text.secondary">
          {pedido.odp?.numero_odp ?? 'Sin ODP'} · {pedido.proveedor}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Table size="small" sx={{ mt: 1 }}>
          <TableHead>
            <TableRow>
              <TableCell>Letra</TableCell>
              <TableCell>Vidrio</TableCell>
              <TableCell align="center">Cant.</TableCell>
              <TableCell>Ancho (mm)</TableCell>
              <TableCell>Alto (mm)</TableCell>
              <TableCell align="right">m²</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filas.map(({ v, m, valida, cambia, ancho, alto }) => (
              <TableRow key={v.id} sx={cambia ? { bgcolor: 'rgba(31,90,214,0.06)' } : undefined}>
                <TableCell>{v.dt || '—'}</TableCell>
                <TableCell sx={{ fontSize: 12 }}>{[v.espesor && `${v.espesor} mm`, v.color].filter(Boolean).join(' · ') || '—'}</TableCell>
                <TableCell align="center">{v.cantidad}</TableCell>
                {(['ancho', 'alto'] as const).map(campo => {
                  const antes = campo === 'ancho' ? v.ancho_mm : v.alto_mm;
                  const nuevo = campo === 'ancho' ? ancho : alto;
                  return (
                    <TableCell key={campo}>
                      <TextField
                        size="small" value={m[campo]} disabled={guardando}
                        onChange={e => cambiar(v.id, campo, e.target.value)}
                        error={leerMm(m[campo]) === null}
                        inputProps={{ inputMode: 'numeric', 'aria-label': `${campo} del vidrio ${v.dt || v.id}`, style: { width: 72 } }}
                        helperText={nuevo !== null && nuevo !== antes ? `antes ${antes ?? '—'}` : ' '}
                      />
                    </TableCell>
                  );
                })}
                <TableCell align="right" sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                  {fmtM2(m2(v.ancho_mm, v.alto_mm, v.cantidad))}
                  {cambia && valida && <> → <b>{fmtM2(m2(ancho, alto, v.cantidad))}</b></>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Typography variant="body2" sx={{ mt: 1.5 }}>
          Total: {fmtM2(totalAntes)} m²{cambios.length > 0 && <> → <b>{fmtM2(totalNuevo)} m²</b></>}
          {cambios.length > 0 && ` · ${cambios.length} ${cambios.length === 1 ? 'vidrio cambia' : 'vidrios cambian'}`}
        </Typography>

        {exigeAceptacion && (
          <FormControlLabel
            sx={{ mt: 1.5, display: 'flex' }}
            control={<Checkbox checked={acepto} onChange={e => setAcepto(e.target.checked)} disabled={guardando} />}
            label={`El proveedor (${pedido.proveedor}) ya aceptó el cambio`}
          />
        )}
        <TextField
          label="Nota (opcional)" fullWidth multiline minRows={2} sx={{ mt: 1.5 }}
          value={nota} onChange={e => setNota(e.target.value)} disabled={guardando}
          inputProps={{ maxLength: 500 }}
          placeholder="Ej. Se rectificó el vano en obra; el cliente confirmó la medida."
        />
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            El formulario del proveedor (Excel e impreso) sale con las medidas nuevas. Si la OP ya se imprimió,
            vuelve a «Por Imprimir». La asesora de la ODP recibe un aviso.
          </Typography>
        </Box>
        {invalidas > 0 && <Alert severity="warning" sx={{ mt: 1.5 }}>Las medidas deben ser números enteros en milímetros, mayores que cero.</Alert>}
        {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={guardando}>Cancelar</Button>
        <Button variant="contained" onClick={guardar} disabled={!puedeGuardar}>
          {guardando ? 'Guardando…' : 'Guardar corrección'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CorregirMedidasDialog;
