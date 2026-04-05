import React, { useRef, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Chip, Typography, Box, Stack, Divider,
  Table, TableHead, TableRow, TableCell, TableBody,
  IconButton, Tooltip, CircularProgress, Alert,
  MenuItem, Select, FormControl, InputLabel, TextField,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import EditIcon from '@mui/icons-material/Edit';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useDispatch, useSelector } from 'react-redux';
import { updateCotizacionInList } from '../cotizacionesSlice';
import {
  CotizacionType, CotizacionItemType, EstadoCOT,
  COLOR_ESTADO, LABEL_SECCION,
} from '../cotizacionesTypes';
import CotizacionPrintable from './CotizacionPrintable';
import ConvertirAODPModal from './ConvertirAODPModal';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

const LABEL_ESTADO: Record<EstadoCOT, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  vencida: 'Vencida',
  convertida: 'Convertida',
};

const TRANSICIONES: Partial<Record<EstadoCOT, EstadoCOT[]>> = {
  borrador: ['enviada', 'rechazada'],
  enviada: ['aprobada', 'rechazada', 'vencida', 'borrador'],
  aprobada: ['rechazada'],
};

interface Props {
  open: boolean;
  onClose: () => void;
  cotizacion: CotizacionType;
  onEdit: () => void;
  userRol?: string;
  userId?: number;
}

// ─── Tabla de items por sección ───────────────────────────────────────────────
const SeccionTabla: React.FC<{ titulo: string; items: CotizacionItemType[]; subtotal: number }> = ({
  titulo, items, subtotal,
}) => {
  if (items.length === 0) return null;
  return (
    <Box mb={2}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5, color: 'primary.dark' }}>
        {titulo}
      </Typography>
      <Table size="small" sx={{ border: '1px solid', borderColor: 'grey.200' }}>
        <TableHead sx={{ bgcolor: 'primary.main' }}>
          <TableRow>
            {['#', 'Código', 'Descripción', 'Cantidad', 'Unidad', 'P. Unitario', 'P. Venta'].map(h => (
              <TableCell key={h} sx={{ color: 'white', fontWeight: 700, py: 0.5, px: 1, fontSize: 11 }}>
                {h}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item, i) => {
            const pv = item.precio_venta ?? item.cantidad * item.precio_unitario;
            return (
              <TableRow key={i} sx={{ bgcolor: i % 2 ? 'grey.50' : 'white' }}>
                <TableCell sx={{ py: 0.3, px: 1, fontSize: 11 }}>{i + 1}</TableCell>
                <TableCell sx={{ py: 0.3, px: 1, fontSize: 11 }}>{item.codigo || '—'}</TableCell>
                <TableCell sx={{ py: 0.3, px: 1, fontSize: 11 }}>{item.descripcion}</TableCell>
                <TableCell sx={{ py: 0.3, px: 1, fontSize: 11, textAlign: 'right' }}>{item.cantidad}</TableCell>
                <TableCell sx={{ py: 0.3, px: 1, fontSize: 11 }}>{item.unidad}</TableCell>
                <TableCell sx={{ py: 0.3, px: 1, fontSize: 11, textAlign: 'right' }}>{fmt(item.precio_unitario)}</TableCell>
                <TableCell sx={{ py: 0.3, px: 1, fontSize: 11, textAlign: 'right', fontWeight: 600 }}>{fmt(pv)}</TableCell>
              </TableRow>
            );
          })}
          <TableRow sx={{ bgcolor: 'primary.50' }}>
            <TableCell colSpan={5} />
            <TableCell sx={{ fontWeight: 700, textAlign: 'right', fontSize: 11, borderTop: '2px solid', borderColor: 'primary.main' }}>
              Subtotal:
            </TableCell>
            <TableCell sx={{ fontWeight: 700, textAlign: 'right', fontSize: 11, borderTop: '2px solid', borderColor: 'primary.main' }}>
              {fmt(subtotal)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Box>
  );
};

// ─── Fila de total ────────────────────────────────────────────────────────────
const TotalFila: React.FC<{ label: string; value: number; highlight?: boolean; negative?: boolean }> = ({
  label, value, highlight, negative,
}) => (
  <Stack direction="row" justifyContent="space-between" alignItems="center"
    sx={{ px: 1, py: 0.3, bgcolor: highlight ? 'primary.main' : 'transparent', borderRadius: highlight ? 1 : 0 }}>
    <Typography variant={highlight ? 'subtitle1' : 'body2'} sx={{ fontWeight: highlight ? 700 : 400, color: highlight ? 'white' : 'text.secondary' }}>
      {label}
    </Typography>
    <Typography variant={highlight ? 'subtitle1' : 'body2'} sx={{ fontWeight: highlight ? 700 : 500, color: highlight ? 'white' : negative ? 'error.main' : 'text.primary' }}>
      {negative ? `(${fmt(Math.abs(value))})` : fmt(value)}
    </Typography>
  </Stack>
);

// ─── Componente principal ─────────────────────────────────────────────────────
const CotizacionDetailModal: React.FC<Props> = ({ open, onClose, cotizacion: cot, onEdit, userRol, userId }) => {
  const dispatch = useDispatch();
  const printRef = useRef<HTMLDivElement>(null);
  const [loadingEstado, setLoadingEstado] = useState(false);
  const [showConvertir, setShowConvertir] = useState(false);
  const [showRechazarInput, setShowRechazarInput] = useState(false);
  const [motivoRechazo, setMotivoRechazo] = useState('');

  const items = cot.items ?? [];
  const vidrios = items.filter(i => i.seccion === 'vidrio').sort((a, b) => a.orden - b.orden);
  const acabados = items.filter(i => i.seccion === 'acabado').sort((a, b) => a.orden - b.orden);
  const gastos = items.filter(i => i.seccion === 'gasto_instalacion').sort((a, b) => a.orden - b.orden);

  const rolesAdmin = ['root', 'admin', 'gerencia'];
  const rolesComerciales = [...rolesAdmin, 'jefe_produccion', 'asesor_comercial'];
  const esAdmin = rolesAdmin.includes(userRol || '');
  const esComercial = rolesComerciales.includes(userRol || '');
  const esPropietario = cot.creado_por === userId;

  const puedeEditar = (cot.estado === 'borrador' || cot.estado === 'enviada') && (esAdmin || esPropietario);
  const puedeEnviar = cot.estado === 'borrador' && (esAdmin || esPropietario);
  const puedeAprobar = cot.estado === 'enviada' && (esAdmin || esPropietario);
  const puedeRechazar = ['borrador', 'enviada', 'aprobada'].includes(cot.estado) && (esAdmin || esPropietario);
  const puedeConvertir = cot.estado === 'aprobada' && !cot.odp_id && (esAdmin || esPropietario);

  const cambiarEstado = async (nuevoEstado: EstadoCOT, motivo?: string) => {
    setLoadingEstado(true);
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.patch(
        `${API}/api/cotizaciones/${cot.id}/estado`,
        { estado: nuevoEstado, ...(motivo ? { motivo } : {}) },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      dispatch(updateCotizacionInList(data));
      toast.success(`Cotización marcada como "${LABEL_ESTADO[nuevoEstado]}"`);
      setShowRechazarInput(false);
      setMotivoRechazo('');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al cambiar estado');
    } finally {
      setLoadingEstado(false);
    }
  };

  const handleImprimir = () => {
    window.print();
  };

  return (
    <>
      {/* Área de impresión oculta */}
      <Box sx={{ display: 'none' }}>
        <CotizacionPrintable ref={printRef} cotizacion={cot} />
      </Box>

      <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Typography variant="h6" fontWeight={700}>{cot.numero_cot}</Typography>
            <Chip
              label={LABEL_ESTADO[cot.estado]}
              color={COLOR_ESTADO[cot.estado]}
              size="small"
            />
            {cot.odp && (
              <Chip label={`ODP: ${cot.odp.numero_odp}`} size="small" variant="outlined" color="primary" />
            )}
          </Stack>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            {/* ── Panel izquierdo: datos generales ── */}
            <Box sx={{ minWidth: 240, maxWidth: 280 }}>
              <Stack spacing={1} sx={{ bgcolor: 'grey.50', p: 1.5, borderRadius: 1, border: '1px solid', borderColor: 'grey.200' }}>
                <Typography variant="subtitle2" fontWeight={700} color="primary.dark">Datos Generales</Typography>
                <Divider />
                <InfoFila label="Cliente" value={cot.cliente?.nombre_razon_social || `ID ${cot.cliente_id}`} />
                {cot.nombre_proyecto && <InfoFila label="Proyecto" value={cot.nombre_proyecto} />}
                <InfoFila label="Asesor" value={cot.asesor?.nombre_completo || '—'} />
                <InfoFila label="Forma de pago" value={cot.forma_pago || '—'} />
                <InfoFila label="Validez" value={`${cot.validez_dias} días`} />
                {cot.tipo_cliente && <InfoFila label="Tipo cliente" value={cot.tipo_cliente} />}
                <InfoFila label="Fecha" value={new Date(cot.fecha_creacion).toLocaleDateString('es-CO')} />
                {cot.prospecto && <InfoFila label="Prospecto" value={cot.prospecto.numero_prospecto} />}
                {cot.notas && (
                  <>
                    <Divider />
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>Notas:</Typography>
                    <Typography variant="caption" sx={{ whiteSpace: 'pre-wrap' }}>{cot.notas}</Typography>
                  </>
                )}

                {/* Totales */}
                <Divider sx={{ mt: 1 }} />
                <Typography variant="subtitle2" fontWeight={700} color="primary.dark">Resumen de Totales</Typography>
                <TotalFila label="Total Vidrios" value={cot.total_vidrio} />
                <TotalFila label="Total Acabados" value={cot.total_acabados} />
                <TotalFila label="Total Gastos Inst." value={cot.total_gastos_instalacion} />
                <Divider />
                <TotalFila label="Subtotal" value={cot.subtotal} />
                {cot.descuento > 0 && (
                  <TotalFila label={`Descuento (${cot.descuento}%)`} value={cot.subtotal - cot.base_gravable} negative />
                )}
                <TotalFila label="Base Gravable" value={cot.base_gravable} />
                <TotalFila label="IVA (19%)" value={cot.iva} />
                <Divider />
                <TotalFila label="TOTAL NETO" value={cot.valor_total} highlight />
              </Stack>
            </Box>

            {/* ── Panel derecho: items ── */}
            <Box flex={1} sx={{ minWidth: 0 }}>
              <SeccionTabla
                titulo={LABEL_SECCION.vidrio}
                items={vidrios}
                subtotal={cot.total_vidrio}
              />
              <SeccionTabla
                titulo={LABEL_SECCION.acabado}
                items={acabados}
                subtotal={cot.total_acabados}
              />
              <SeccionTabla
                titulo={LABEL_SECCION.gasto_instalacion}
                items={gastos}
                subtotal={cot.total_gastos_instalacion}
              />

              {items.length === 0 && (
                <Alert severity="info">Esta cotización no tiene ítems registrados.</Alert>
              )}
            </Box>
          </Stack>

          {/* Campo motivo rechazo inline */}
          {showRechazarInput && (
            <Box mt={2}>
              <TextField
                label="Motivo de rechazo (opcional)"
                value={motivoRechazo}
                onChange={e => setMotivoRechazo(e.target.value)}
                fullWidth
                size="small"
                multiline
                rows={2}
                autoFocus
              />
              <Stack direction="row" spacing={1} mt={1} justifyContent="flex-end">
                <Button size="small" onClick={() => { setShowRechazarInput(false); setMotivoRechazo(''); }}>
                  Cancelar
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  color="error"
                  disabled={loadingEstado}
                  onClick={() => cambiarEstado('rechazada', motivoRechazo || undefined)}
                >
                  Confirmar Rechazo
                </Button>
              </Stack>
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, flexWrap: 'wrap', gap: 1 }}>
          {/* Imprimir — siempre disponible */}
          <Button startIcon={<PrintIcon />} onClick={handleImprimir} variant="outlined" size="small">
            Imprimir
          </Button>

          <Box flex={1} />

          {/* Editar */}
          {puedeEditar && (
            <Button startIcon={<EditIcon />} onClick={onEdit} variant="outlined" size="small">
              Editar
            </Button>
          )}

          {/* Marcar como Enviada */}
          {puedeEnviar && (
            <Button
              startIcon={loadingEstado ? <CircularProgress size={14} /> : <SendIcon />}
              onClick={() => cambiarEstado('enviada')}
              variant="outlined"
              color="info"
              size="small"
              disabled={loadingEstado}
            >
              Marcar Enviada
            </Button>
          )}

          {/* Aprobar */}
          {puedeAprobar && (
            <Button
              startIcon={loadingEstado ? <CircularProgress size={14} /> : <CheckCircleIcon />}
              onClick={() => cambiarEstado('aprobada')}
              variant="contained"
              color="success"
              size="small"
              disabled={loadingEstado}
            >
              Aprobar
            </Button>
          )}

          {/* Rechazar */}
          {puedeRechazar && !showRechazarInput && (
            <Button
              startIcon={<CancelIcon />}
              onClick={() => setShowRechazarInput(true)}
              variant="outlined"
              color="error"
              size="small"
              disabled={loadingEstado}
            >
              Rechazar
            </Button>
          )}

          {/* Convertir a ODP */}
          {puedeConvertir && (
            <Button
              startIcon={<SwapHorizIcon />}
              onClick={() => setShowConvertir(true)}
              variant="contained"
              color="primary"
              size="small"
            >
              Convertir a ODP
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Modal Convertir */}
      {showConvertir && (
        <ConvertirAODPModal
          open={showConvertir}
          onClose={() => setShowConvertir(false)}
          cotizacion={cot}
        />
      )}
    </>
  );
};

// Helper fila de info
const InfoFila: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <Stack direction="row" justifyContent="space-between" spacing={1}>
    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>{label}:</Typography>
    <Typography variant="caption" textAlign="right" fontWeight={500}>{value}</Typography>
  </Stack>
);

export default CotizacionDetailModal;
