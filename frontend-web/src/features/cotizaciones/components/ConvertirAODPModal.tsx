import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Stack, Typography, Divider, CircularProgress, Alert,
} from '@mui/material';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import axios from 'axios';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { updateCotizacionInList } from '../cotizacionesSlice';
import { CotizacionType } from '../cotizacionesTypes';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

interface Props {
  open: boolean;
  onClose: () => void;
  cotizacion: CotizacionType;
}

const ConvertirAODPModal: React.FC<Props> = ({ open, onClose, cotizacion: cot }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [direccion, setDireccion] = useState(cot.cliente?.direccion || '');
  const [observaciones, setObservaciones] = useState('');

  const handleConfirmar = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.post(
        `${API}/api/cotizaciones/${cot.id}/convertir`,
        {
          fecha_entrega: fechaEntrega || undefined,
          direccion_instalacion: direccion || undefined,
          observaciones_adicionales: observaciones || undefined,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      dispatch(updateCotizacionInList(data.cotizacion));
      onClose();
      navigate('/odp');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al convertir la cotización');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <SwapHorizIcon color="primary" />
        Convertir a ODP
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}

          {/* Resumen readonly */}
          <Stack spacing={0.5} sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 1, border: '1px solid', borderColor: 'grey.200' }}>
            <Typography variant="subtitle2" color="text.secondary">Resumen de la cotización</Typography>
            <Divider sx={{ my: 0.5 }} />
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">Cotización:</Typography>
              <Typography variant="body2" fontWeight={600}>{cot.numero_cot}</Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">Cliente:</Typography>
              <Typography variant="body2">{cot.cliente?.nombre_razon_social || `ID ${cot.cliente_id}`}</Typography>
            </Stack>
            {cot.nombre_proyecto && (
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">Proyecto:</Typography>
                <Typography variant="body2">{cot.nombre_proyecto}</Typography>
              </Stack>
            )}
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">Subtotal:</Typography>
              <Typography variant="body2">{fmt(cot.subtotal)}</Typography>
            </Stack>
            {cot.descuento > 0 && (
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">Descuento ({cot.descuento}%):</Typography>
                <Typography variant="body2" color="error.main">-{fmt(cot.subtotal - cot.base_gravable)}</Typography>
              </Stack>
            )}
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">IVA (19%):</Typography>
              <Typography variant="body2">{fmt(cot.iva)}</Typography>
            </Stack>
            <Divider sx={{ my: 0.5 }} />
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" fontWeight={700}>TOTAL NETO:</Typography>
              <Typography variant="body1" fontWeight={700} color="primary.main">{fmt(cot.valor_total)}</Typography>
            </Stack>
          </Stack>

          <Typography variant="body2" color="text.secondary">
            Se creará automáticamente una ODP a partir de esta cotización. Los campos siguientes son opcionales.
          </Typography>

          {/* Campos adicionales para la ODP */}
          <TextField
            label="Fecha de entrega estimada"
            type="date"
            value={fechaEntrega}
            onChange={e => setFechaEntrega(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
            size="small"
          />
          <TextField
            label="Dirección de instalación"
            value={direccion}
            onChange={e => setDireccion(e.target.value)}
            fullWidth
            size="small"
            placeholder="Dejar vacío para usar la dirección del cliente"
          />
          <TextField
            label="Observaciones adicionales para la ODP"
            value={observaciones}
            onChange={e => setObservaciones(e.target.value)}
            multiline
            rows={3}
            fullWidth
            size="small"
          />
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancelar</Button>
        <Button
          variant="contained"
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <SwapHorizIcon />}
          onClick={handleConfirmar}
          disabled={loading}
        >
          Confirmar — Crear ODP
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConvertirAODPModal;
