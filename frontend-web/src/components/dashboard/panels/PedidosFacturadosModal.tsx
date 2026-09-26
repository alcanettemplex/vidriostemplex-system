import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, IconButton,
  Table, TableBody, TableCell, TableHead, TableRow, TableSortLabel,
  Chip, CircularProgress, Box, Typography,
} from '@mui/material';
import { X as CloseIcon } from '../../ui/icons';
import axios from 'axios';

import API from '../../../services/config';
import { PeriodParams } from '../hooks/useDashboardData';

const fmtCOP = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

const fmtFecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const CAJA_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  CANCELADO:         { label: 'Cancelado',         color: '#166534', bg: '#dcfce7' },
  ABONADO:           { label: 'Abonado',            color: '#92400e', bg: '#fef3c7' },
  CREDITO_APROBADO:  { label: 'Crédito Aprobado',   color: '#1e40af', bg: '#dbeafe' },
  PENDIENTE:         { label: 'Pendiente',           color: '#991b1b', bg: '#fee2e2' },
};

const MODO_CONFIG: Record<string, { titulo: string; criterio: string }> = {
  creadas_facturadas: {
    titulo: 'Pedidos Cobrados — Creadas y facturadas',
    criterio: 'ODPs creadas dentro del período seleccionado que ya cuentan con factura electrónica, con su abono real (mismo criterio que el número de la tarjeta)',
  },
  facturadas_rango: {
    titulo: 'Pedidos Cobrados — Facturas emitidas en el rango',
    criterio: 'Cada factura electrónica (principal o adicional) cuya fecha cae en el período. El abono de la ODP se asigna a la fila Principal para no duplicarlo; las adicionales aportan $0. La suma coincide con el KPI.',
  },
};

interface FacturadoItem {
  id: number;
  numero_odp: string;
  fecha_creacion: string;
  fecha_factura: string | null;
  monto_abonado: number;
  estado_caja: string;
  cliente_nombre: string;
  // Solo en modo 'facturadas_rango' (una fila por factura): datos de la FE.
  numero_fe?: string | null;
  tipo_fe?: string; // 'Principal' | 'Adicional'
}

type SortField = 'numero_odp' | 'cliente_nombre' | 'fecha_creacion' | 'fecha_factura' | 'estado_caja' | 'monto_abonado';

const COLUMNS: { field: SortField; label: string; align?: 'right' | 'center' }[] = [
  { field: 'numero_odp',     label: 'ODP' },
  { field: 'cliente_nombre', label: 'Cliente' },
  { field: 'fecha_creacion', label: 'Fecha creación' },
  { field: 'fecha_factura',  label: 'Fecha facturación' },
  { field: 'estado_caja',    label: 'Estado caja', align: 'center' },
  { field: 'monto_abonado',  label: 'Abonado', align: 'right' },
];

interface Props {
  modo:     'creadas_facturadas' | 'facturadas_rango';
  period:   PeriodParams;
  onClose:  () => void;
  onVerODP: (id: number) => void;
}

const PedidosFacturadosModal: React.FC<Props> = ({ modo, period, onClose, onVerODP }) => {
  const [items, setItems]     = useState<FacturadoItem[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>('fecha_creacion');
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortedItems = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => {
      const va = a[sortField];
      const vb = b[sortField];
      if (va === null) return vb === null ? 0 : 1;
      if (vb === null) return -1;
      if (sortField === 'monto_abonado') return (Number(va) - Number(vb)) * dir;
      return String(va).localeCompare(String(vb), 'es', { numeric: true }) * dir;
    });
  }, [items, sortField, sortDir]);

  useEffect(() => {
    const token = sessionStorage.getItem('token');
    axios
      .get(`${API}/api/dashboard/pedidos-facturados`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          mes_inicio:  period.mesInicio,
          anio_inicio: period.anioInicio,
          mes_fin:     period.mesFin,
          anio_fin:    period.anioFin,
          modo,
        },
      })
      .then(r => {
        setItems(r.data.items || []);
        setTotal(r.data.total || 0);
      })
      .catch(e => console.error('Error cargando pedidos facturados:', e))
      .finally(() => setLoading(false));
  }, [modo, period.mesInicio, period.anioInicio, period.mesFin, period.anioFin]);

  const cfg = MODO_CONFIG[modo];

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg" PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Box>
          <Typography variant="h6" fontWeight={700} color="primary.main">{cfg.titulo}</Typography>
          <Typography variant="caption" color="#3f4858">{cfg.criterio}</Typography>
        </Box>
        <IconButton onClick={onClose} size="small"><CloseIcon size={20} /></IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        {loading ? (
          <Box display="flex" justifyContent="center" alignItems="center" py={8}>
            <CircularProgress />
          </Box>
        ) : (
          <Box>
            <Box display="flex" gap={2} px={3} py={2} bgcolor="#fafafa" borderBottom="1px solid #e1e5eb" flexWrap="wrap">
              <Box>
                <Typography variant="caption" color="#111620" fontWeight={600} display="block">Total cobrado</Typography>
                <Typography variant="h6" fontWeight={700} color="primary.main">{fmtCOP(total)}</Typography>
              </Box>
              <Box sx={{ width: '1px', bgcolor: '#e1e5eb' }} />
              <Box>
                <Typography variant="caption" color="#111620" fontWeight={600} display="block">ODPs</Typography>
                <Typography variant="h6" fontWeight={800} color="#111620" sx={{ fontVariantNumeric: 'tabular-nums' }}>{items.length}</Typography>
              </Box>
            </Box>

            {items.length === 0 ? (
              <Box display="flex" justifyContent="center" alignItems="center" py={8}>
                <Typography color="#3f4858">Sin pedidos facturados para este criterio en el período seleccionado.</Typography>
              </Box>
            ) : (
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow sx={{ '& th': { bgcolor: '#f6f7f9', fontWeight: 600, fontSize: 11, color: '#111620', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e1e5eb' } }}>
                      {COLUMNS.map(col => (
                        <TableCell key={col.field} align={col.align}>
                          <TableSortLabel
                            active={sortField === col.field}
                            direction={sortField === col.field ? sortDir : 'asc'}
                            onClick={() => handleSort(col.field)}
                            sx={{ '&.MuiTableSortLabel-root': { color: 'inherit' }, '&.Mui-active': { color: '#4f46e5' }, '& .MuiTableSortLabel-icon': { color: '#4f46e5 !important' } }}
                          >
                            {col.label}
                          </TableSortLabel>
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sortedItems.map(item => {
                      const cc = CAJA_CONFIG[item.estado_caja] || { label: item.estado_caja, color: '#3f4858', bg: '#eef0f4' };
                      return (
                        <TableRow key={item.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                          <TableCell>
                            <span
                              style={{ color: '#4f46e5', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
                              onClick={() => onVerODP(item.id)}
                            >
                              {item.numero_odp}
                            </span>
                            {modo === 'facturadas_rango' && item.numero_fe && (
                              <div style={{ fontSize: 11, color: '#3f4858', fontFamily: 'monospace', marginTop: 2 }}>
                                FE-{item.numero_fe}{item.tipo_fe === 'Adicional' ? ' · adic.' : ''}
                              </div>
                            )}
                          </TableCell>
                          <TableCell sx={{ fontSize: 13, maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.cliente_nombre}
                          </TableCell>
                          <TableCell sx={{ fontSize: 13 }}>{fmtFecha(item.fecha_creacion)}</TableCell>
                          <TableCell sx={{ fontSize: 13 }}>{fmtFecha(item.fecha_factura)}</TableCell>
                          <TableCell align="center">
                            <Chip
                              label={cc.label}
                              size="small"
                              sx={{ bgcolor: cc.bg, color: cc.color, fontWeight: 600, fontSize: 11, height: 22 }}
                            />
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700, fontSize: 13, color: '#4338ca' }}>
                            {fmtCOP(item.monto_abonado)}
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

export default PedidosFacturadosModal;
