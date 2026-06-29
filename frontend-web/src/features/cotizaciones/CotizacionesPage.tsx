import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Button, Chip, CircularProgress, IconButton,
  Paper, Stack, Tab, Tabs, Tooltip, Typography,
  Alert, TextField, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchCotizacionesStart,
  fetchCotizacionesSuccess,
  fetchCotizacionesFailure,
  removeCotizacion,
  addCotizacion,
  updateCotizacionInList,
} from './cotizacionesSlice';
import { RootState } from '../../store/store';
import {
  CotizacionType, EstadoCOT, COLOR_ESTADO,
} from './cotizacionesTypes';
import CotizacionFormModal from './components/CotizacionFormModal';
import CotizacionDetailModal from './components/CotizacionDetailModal';

import API from '../../services/config';

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

type TabValue = 'todas' | EstadoCOT;

const TABS: { value: TabValue; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'borrador', label: 'Borrador' },
  { value: 'enviada', label: 'Enviadas' },
  { value: 'aprobada', label: 'Aprobadas' },
  { value: 'rechazada', label: 'Rechazadas/Vencidas' },
  { value: 'convertida', label: 'Convertidas' },
];

const CotizacionesPage: React.FC = () => {
  const dispatch = useDispatch();
  const { list, loading, error } = useSelector((s: RootState) => s.cotizaciones);
  const auth = useSelector((s: RootState) => s.auth);
  const userRol: string = (auth as any).user?.rol || '';
  const userId: number = (auth as any).user?.id;

  const [tab, setTab] = useState<TabValue>('todas');
  const [busqueda, setBusqueda] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [selectedCot, setSelectedCot] = useState<CotizacionType | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const cargarCotizaciones = useCallback(async () => {
    dispatch(fetchCotizacionesStart());
    try {
      const token = sessionStorage.getItem('token');
      const { data } = await axios.get(`${API}/api/cotizaciones`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      dispatch(fetchCotizacionesSuccess(data));
    } catch (err: any) {
      dispatch(fetchCotizacionesFailure(err.response?.data?.error || 'Error al cargar cotizaciones'));
    }
  }, [dispatch]);

  useEffect(() => {
    cargarCotizaciones();
  }, [cargarCotizaciones]);

  const cotizacionesFiltradas = list.filter(c => {
    const matchTab =
      tab === 'todas' ? true :
      tab === 'rechazada' ? (c.estado === 'rechazada' || c.estado === 'vencida') :
      c.estado === tab;

    const texto = busqueda.toLowerCase();
    const matchBusqueda = !texto ||
      c.numero_cot.toLowerCase().includes(texto) ||
      (c.cliente?.nombre_razon_social || '').toLowerCase().includes(texto) ||
      (c.nombre_proyecto || '').toLowerCase().includes(texto);

    return matchTab && matchBusqueda;
  });

  const paginated = cotizacionesFiltradas.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const handleVerDetalle = (cot: CotizacionType) => {
    setSelectedCot(cot);
    setShowDetail(true);
  };

  const handleEditar = (cot: CotizacionType) => {
    setSelectedCot(cot);
    setEditMode(true);
    setShowForm(true);
    setShowDetail(false);
  };

  const handleNueva = () => {
    setSelectedCot(null);
    setEditMode(false);
    setShowForm(true);
  };

  const handleSaved = (cot: CotizacionType) => {
    if (editMode) {
      dispatch(updateCotizacionInList(cot));
    } else {
      dispatch(addCotizacion(cot));
    }
    setShowForm(false);
    setSelectedCot(null);
  };

  const handleEliminar = async (id: number) => {
    if (!window.confirm('¿Eliminar esta cotización? Esta acción no se puede deshacer.')) return;
    setDeletingId(id);
    try {
      const token = sessionStorage.getItem('token');
      await axios.delete(`${API}/api/cotizaciones/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      dispatch(removeCotizacion(id));
      toast.success('Cotización eliminada');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al eliminar');
    } finally {
      setDeletingId(null);
    }
  };

  const rolesAdmin = ['root', 'admin', 'gerencia'];
  const esAdmin = rolesAdmin.includes(userRol);

  return (
    <Box p={3}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5" fontWeight={700}>Cotizaciones</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleNueva}>
          Nueva COT
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Tabs + búsqueda */}
      <Paper sx={{ mb: 2 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => { setTab(v); setPage(0); }}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          {TABS.map(t => (
            <Tab key={t.value} value={t.value} label={t.label} sx={{ textTransform: 'none', fontSize: 13 }} />
          ))}
        </Tabs>
        <Box px={2} py={1.5}>
          <TextField
            size="small"
            placeholder="Buscar por N° COT, cliente o proyecto..."
            value={busqueda}
            onChange={e => { setBusqueda(e.target.value); setPage(0); }}
            sx={{ width: 340 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        </Box>
      </Paper>

      {/* Tabla */}
      <Paper>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell sx={{ fontWeight: 700 }}>N° COT</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Cliente</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Proyecto</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Tipo</TableCell>
                <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Subtotal</TableCell>
                <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Total Neto</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Estado</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Fecha</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No hay cotizaciones
                  </TableCell>
                </TableRow>
              ) : paginated.map(cot => {
                const esPropietario = cot.creado_por === userId;
                const puedeEliminar = esAdmin && (cot.estado === 'borrador' || cot.estado === 'rechazada');
                const puedeEditar = (cot.estado === 'borrador' || cot.estado === 'enviada') && (esAdmin || esPropietario);
                return (
                  <TableRow key={cot.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600} color="primary.main">{cot.numero_cot}</Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 180 }}>
                      <Typography variant="body2" noWrap>
                        {cot.cliente?.nombre_razon_social || `ID ${cot.cliente_id}`}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 160 }}>
                      <Typography variant="body2" noWrap color="text.secondary">
                        {cot.nombre_proyecto || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {cot.tipo_cliente
                        ? <Chip label={cot.tipo_cliente} size="small" variant="outlined" />
                        : <Typography variant="body2" color="text.disabled">—</Typography>
                      }
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">{fmt(cot.subtotal)}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={700}>{fmt(cot.valor_total)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={LABEL_ESTADO[cot.estado]}
                        color={COLOR_ESTADO[cot.estado]}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {new Date(cot.fecha_creacion).toLocaleDateString('es-CO')}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.3}>
                        <Tooltip title="Ver detalle">
                          <IconButton size="small" onClick={() => handleVerDetalle(cot)}>
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {puedeEditar && (
                          <Tooltip title="Editar">
                            <IconButton size="small" onClick={() => handleEditar(cot)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {puedeEliminar && (
                          <Tooltip title="Eliminar">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleEliminar(cot.id)}
                              disabled={deletingId === cot.id}
                            >
                              {deletingId === cot.id
                                ? <CircularProgress size={14} />
                                : <DeleteIcon fontSize="small" />
                              }
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={cotizacionesFiltradas.length}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
          rowsPerPageOptions={[10, 20, 50]}
          labelRowsPerPage="Por página:"
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count}`}
        />
      </Paper>

      {/* Modales */}
      {showForm && (
        <CotizacionFormModal
          open={showForm}
          onClose={() => { setShowForm(false); setSelectedCot(null); }}
          cotizacion={editMode ? selectedCot : undefined}
          onSaved={handleSaved}
        />
      )}

      {showDetail && selectedCot && (
        <CotizacionDetailModal
          open={showDetail}
          onClose={() => { setShowDetail(false); setSelectedCot(null); }}
          cotizacion={selectedCot}
          onEdit={() => handleEditar(selectedCot)}
          userRol={userRol}
          userId={userId}
        />
      )}
    </Box>
  );
};

export default CotizacionesPage;
