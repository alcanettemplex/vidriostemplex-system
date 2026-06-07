import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, IconButton,
  Table, TableBody, TableCell, TableHead, TableRow,
  Chip, CircularProgress, Box, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const fmtCOP = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

const RIESGO_CONFIG = {
  normal:  { label: 'Normal',  color: '#b45309', bg: '#fef3c7' },
  alerta:  { label: 'Alerta',  color: '#c2410c', bg: '#ffedd5' },
  critico: { label: 'Crítico', color: '#991b1b', bg: '#fee2e2' },
};

interface CarteraItem {
  id: number;
  numero_odp: string;
  factura_electronica: string;
  fecha_factura: string;
  pendiente: number;
  valor_total: number;
  cliente_nombre: string;
  dias_vencido: number;
  riesgo: 'normal' | 'alerta' | 'critico';
}

interface Props {
  onClose:  () => void;
  onVerODP: (id: number) => void;
}

const CarteraVencidaModal: React.FC<Props> = ({ onClose, onVerODP }) => {
  const [items, setItems]       = useState<CarteraItem[]>([]);
  const [total, setTotal]       = useState(0);
  const [clientes, setClientes] = useState(0);
  const [umbral, setUmbral]     = useState(60);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const token = sessionStorage.getItem('token');
    axios
      .get(`${API}/api/dashboard/cartera-vencida`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        setItems(r.data.items || []);
        setTotal(r.data.total || 0);
        setClientes(r.data.clientes_unicos || 0);
        setUmbral(r.data.umbral_dias || 60);
      })
      .catch(e => console.error('Error cargando cartera vencida:', e))
      .finally(() => setLoading(false));
  }, []);

  const criticos = items.filter(i => i.riesgo === 'critico').length;
  const alertas  = items.filter(i => i.riesgo === 'alerta').length;

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg" PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Box>
          <Typography variant="h6" fontWeight={700} color="error.main">Cartera Vencida</Typography>
          <Typography variant="caption" color="text.secondary">
            Créditos con FE emitida hace más de {umbral} días sin cancelar
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small"><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        {loading ? (
          <Box display="flex" justifyContent="center" alignItems="center" py={8}>
            <CircularProgress color="error" />
          </Box>
        ) : (
          <Box>
            <Box display="flex" gap={2} px={3} py={2} bgcolor="#fafafa" borderBottom="1px solid #e2e8f0" flexWrap="wrap">
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">Total vencido</Typography>
                <Typography variant="h6" fontWeight={700} color="error.main">{fmtCOP(total)}</Typography>
              </Box>
              <Box sx={{ width: '1px', bgcolor: '#e2e8f0' }} />
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">ODPs</Typography>
                <Typography variant="h6" fontWeight={700}>{items.length}</Typography>
              </Box>
              <Box sx={{ width: '1px', bgcolor: '#e2e8f0' }} />
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">Clientes</Typography>
                <Typography variant="h6" fontWeight={700}>{clientes}</Typography>
              </Box>
              {criticos > 0 && (
                <Box display="flex" alignItems="center" gap={2}>
                  <Box sx={{ width: '1px', bgcolor: '#e2e8f0', alignSelf: 'stretch' }} />
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">Críticos ({'>'}{umbral * 2} días)</Typography>
                    <Typography variant="h6" fontWeight={700} color="#991b1b">{criticos}</Typography>
                  </Box>
                </Box>
              )}
              {alertas > 0 && (
                <Box display="flex" alignItems="center" gap={2}>
                  <Box sx={{ width: '1px', bgcolor: '#e2e8f0', alignSelf: 'stretch' }} />
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">En alerta ({'>'}{Math.round(umbral * 1.5)} días)</Typography>
                    <Typography variant="h6" fontWeight={700} color="#c2410c">{alertas}</Typography>
                  </Box>
                </Box>
              )}
            </Box>

            {items.length === 0 ? (
              <Box display="flex" justifyContent="center" alignItems="center" py={8}>
                <Typography color="text.secondary">Sin créditos vencidos en este momento.</Typography>
              </Box>
            ) : (
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow sx={{ '& th': { bgcolor: '#f8fafc', fontWeight: 700, fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' } }}>
                      <TableCell>ODP</TableCell>
                      <TableCell>Cliente</TableCell>
                      <TableCell>FE No.</TableCell>
                      <TableCell>Fecha FE</TableCell>
                      <TableCell align="center">Días vencido</TableCell>
                      <TableCell align="center">Riesgo</TableCell>
                      <TableCell align="right">Pendiente</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {items.map(item => {
                      const rc = RIESGO_CONFIG[item.riesgo];
                      return (
                        <TableRow key={item.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                          <TableCell>
                            <span
                              style={{ color: '#4f46e5', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
                              onClick={() => onVerODP(item.id)}
                            >
                              {item.numero_odp}
                            </span>
                          </TableCell>
                          <TableCell sx={{ fontSize: 13, maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.cliente_nombre}
                          </TableCell>
                          <TableCell sx={{ fontSize: 13, fontFamily: 'monospace' }}>{item.factura_electronica}</TableCell>
                          <TableCell sx={{ fontSize: 13 }}>{fmtFecha(item.fecha_factura)}</TableCell>
                          <TableCell align="center">
                            <Typography fontWeight={700} fontSize={13} color={rc.color}>
                              {item.dias_vencido}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              label={rc.label}
                              size="small"
                              sx={{ bgcolor: rc.bg, color: rc.color, fontWeight: 700, fontSize: 11, height: 22 }}
                            />
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700, fontSize: 13, color: '#dc2626' }}>
                            {fmtCOP(item.pendiente)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CarteraVencidaModal;
