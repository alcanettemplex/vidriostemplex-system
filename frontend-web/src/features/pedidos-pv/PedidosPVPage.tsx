import React, { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import {
  Box, Typography, Chip, CircularProgress, Alert, Button, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, Select, FormControl,
  InputLabel, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Tooltip, IconButton, Stack, Tabs, Tab, Card, CardContent, Divider,
  Menu, FormControlLabel, Switch, TablePagination, InputAdornment,
} from '@mui/material';
import {
  Add, Refresh, MoreVert, Search, CheckCircleOutline, LocalShipping,
  HourglassEmpty, Cancel, TableChart, Tune, Print,
} from '@mui/icons-material';
import PrintablePedidoVitelsa from './components/PrintablePedidoVitelsa';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PedidoPV {
  id: number;
  numero_pedido: string;
  numero_base: number;
  sufijo: string | null;
  odp_id: number | null;
  odp_numero_excel: string | null;
  proveedor: string;
  estado: string;
  tuvo_problema: boolean;
  fecha_envio: string | null;
  hora_envio: string | null;
  confirmado_proveedor: boolean;
  fecha_entrega_prometida: string | null;
  fecha_llegada_real: string | null;
  dias_diferencia: number | null;
  metraje_venta: number | null;
  espesor_vidrio: string | null;
  factura_pv: string | null;
  observaciones: string | null;
  observacion_verificacion: string | null;
  nombre_cliente_excel: string | null;
  asesor_iniciales: string | null;
  origen: string;
  creado_en: string;
  odp?: { id: number; numero_odp: string; estado_produccion: string; cliente?: { nombre_razon_social: string } };
  creador?: { id: number; nombre_completo: string };
  verificador?: { id: number; nombre_completo: string } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtFecha = (fecha: string | null) => {
  if (!fecha) return '—';
  try { return format(parseISO(fecha), 'dd/MM/yyyy', { locale: es }); } catch { return fecha; }
};

const fmtHora = (hora: string | null) => hora ? hora.substring(0, 5) : '—';

const toFloat = (v: unknown) => parseFloat(String(v ?? 0)) || 0;

const ESTADO_CONFIG: Record<string, {
  label: string;
  color: 'default' | 'primary' | 'info' | 'warning' | 'success' | 'error';
  icon: React.ReactNode;
  barColor: string;
}> = {
  PENDIENTE:            { label: 'Pendiente',   color: 'default',  icon: <HourglassEmpty sx={{ fontSize: 13 }} />, barColor: '#9e9e9e' },
  ENVIADO:              { label: 'En Tránsito',  color: 'primary',  icon: <LocalShipping sx={{ fontSize: 13 }} />,  barColor: '#1976d2' },
  CONFIRMADO_PROVEEDOR: { label: 'Confirmado',   color: 'info',     icon: <CheckCircleOutline sx={{ fontSize: 13 }} />, barColor: '#0288d1' },
  LLEGADO:              { label: 'Recibido',     color: 'warning',  icon: <LocalShipping sx={{ fontSize: 13 }} />,  barColor: '#f57c00' },
  VERIFICADO:           { label: 'Entregado',    color: 'success',  icon: <CheckCircleOutline sx={{ fontSize: 13 }} />, barColor: '#2e7d32' },
  PROBLEMA:             { label: 'Problema',     color: 'error',    icon: <Cancel sx={{ fontSize: 13 }} />,         barColor: '#c62828' },
};

const getBarColor = (p: PedidoPV): string => {
  if (p.dias_diferencia !== null && p.dias_diferencia < 0) return '#c62828'; // retrasado
  return ESTADO_CONFIG[p.estado]?.barColor ?? '#9e9e9e';
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────

const KPICard: React.FC<{
  label: string; value: string | number; sub: string;
  icon: React.ReactNode; color: string; bgColor: string;
}> = ({ label, value, sub, icon, color, bgColor }) => (
  <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, flex: 1, minWidth: 150 }}>
    <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={600}
            textTransform="uppercase" letterSpacing={0.5} display="block">
            {label}
          </Typography>
          <Typography variant="h4" fontWeight={800} sx={{ color, lineHeight: 1.2, mt: 0.5 }}>
            {value}
          </Typography>
          <Typography variant="caption" color="text.secondary">{sub}</Typography>
        </Box>
        <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
          {icon}
        </Box>
      </Stack>
    </CardContent>
  </Card>
);

// ─── Menú de acciones (...) ───────────────────────────────────────────────────

const AccionesMenu: React.FC<{
  pedido: PedidoPV;
  puedeEnviar: boolean;
  puedeGestionar: boolean;
  onEnviar: () => void;
  onConfirmar: () => void;
  onLlegada: () => void;
  onVerificar: () => void;
  onProblema: () => void;
  onDetalle: () => void;
  onImprimir: () => void;
  printLoading: boolean;
}> = ({ pedido, puedeEnviar, puedeGestionar, onEnviar, onConfirmar, onLlegada, onVerificar, onProblema, onDetalle, onImprimir, printLoading }) => {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const open = Boolean(anchor);

  const items: { label: string; action: () => void; color?: string; icon?: React.ReactNode }[] = [];

  if (pedido.estado === 'PENDIENTE' && puedeEnviar)
    items.push({ label: 'Marcar enviado', action: onEnviar });
  if (pedido.estado === 'ENVIADO' && !pedido.confirmado_proveedor && puedeEnviar)
    items.push({ label: 'Confirmar proveedor', action: onConfirmar });
  if (['ENVIADO', 'CONFIRMADO_PROVEEDOR'].includes(pedido.estado) && puedeGestionar)
    items.push({ label: 'Registrar llegada', action: onLlegada });
  if (pedido.estado === 'LLEGADO' && puedeGestionar) {
    items.push({ label: 'Verificado correcto', action: onVerificar });
    items.push({ label: 'Marcar problema', action: onProblema, color: '#c62828' });
  }
  items.push({ label: 'Ver detalle', action: onDetalle });
  if (pedido.odp_id) items.push({ label: printLoading ? 'Cargando...' : 'Imprimir pedido', action: onImprimir, icon: <Print sx={{ fontSize: 16 }} /> });

  return (
    <>
      <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)}>
        <MoreVert fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={open} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ elevation: 3, sx: { borderRadius: 2, minWidth: 180 } }}>
        {items.map((item) => (
          <MenuItem key={item.label} onClick={() => { item.action(); setAnchor(null); }}
            sx={{ fontSize: 14, color: item.color ?? 'inherit', py: 1, gap: 1 }}>
            {item.icon ?? null}{item.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

// ─── Componente principal ─────────────────────────────────────────────────────

const PedidosPVPage: React.FC = () => {
  const token = useSelector((s: any) => s.auth.token);
  const user = useSelector((s: any) => s.auth.user);
  const headers = { Authorization: `Bearer ${token}` };

  const [tab, setTab] = useState(0);

  // Datos separados por origen
  const [pedidosExcel, setPedidosExcel] = useState<PedidoPV[]>([]);
  const [pedidosSistema, setPedidosSistema] = useState<PedidoPV[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros Gestión PV
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroProveedor, setFiltroProveedor] = useState('');
  const [filtroAsesor, setFiltroAsesor] = useState('');
  const [soloRetrasos, setSoloRetrasos] = useState(false);
  const [filtrosAplicados, setFiltrosAplicados] = useState({ estado: '', proveedor: '', asesor: '' });

  // Paginación Gestión PV
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Filtro Vista Excel
  const [busquedaExcel, setBusquedaExcel] = useState('');
  const [pageExcel, setPageExcel] = useState(0);

  // Modales
  const [modalCrear, setModalCrear] = useState(false);
  const [odps, setOdps] = useState<any[]>([]);
  const [siguienteNumero, setSiguienteNumero] = useState<number | null>(null);
  const [formCrear, setFormCrear] = useState({ odp_id: '', proveedor: '', sufijo: '', fecha_entrega_prometida: '', metraje_venta: '', espesor_vidrio: '', observaciones: '' });

  const [modalEnviar, setModalEnviar] = useState<PedidoPV | null>(null);
  const [formEnviar, setFormEnviar] = useState({ fecha_entrega_prometida: '', confirmado_proveedor: false });

  const [modalLlegada, setModalLlegada] = useState<PedidoPV | null>(null);
  const [fechaLlegada, setFechaLlegada] = useState('');

  const [modalVerificar, setModalVerificar] = useState<{ pedido: PedidoPV; tipo: 'verificar' | 'problema' } | null>(null);
  const [obsVerificacion, setObsVerificacion] = useState('');

  const [modalDetalle, setModalDetalle] = useState<PedidoPV | null>(null);

  // ─── Impresión ────────────────────────────────────────────────────────────
  const [printData, setPrintData] = useState<{ pedido: PedidoPV; odp: any } | null>(null);
  const [printLoadingId, setPrintLoadingId] = useState<number | null>(null);
  const shouldPrintRef = useRef(false);

  // ─── Por Gestionar ────────────────────────────────────────────────────────
  const [pedidosPorGestionar, setPedidosPorGestionar] = useState<any[]>([]);
  const [modalGestionar, setModalGestionar] = useState<any | null>(null);
  const [itemsSeleccionados, setItemsSeleccionados] = useState<number[]>([]);
  const [savingGestionar, setSavingGestionar] = useState(false);

  const puedeCrear = user?.puede_gestionar_pv;
  const puedeGestionar = ['produccion', 'auxiliar_produccion', 'compras', 'admin', 'jefe_produccion'].includes(user?.rol);
  const puedeEnviar = ['asesor_comercial', 'admin', 'gerencia'].includes(user?.rol);

  // ─── Carga de datos ───────────────────────────────────────────────────────

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resExcel, resSistema] = await Promise.all([
        axios.get(`${API}/api/pedidos-pv`, { headers, params: { origen: 'EXCEL' } }),
        axios.get(`${API}/api/pedidos-pv`, { headers, params: { origen: 'SISTEMA' } }),
      ]);
      setPedidosExcel(resExcel.data);
      setPedidosSistema(resSistema.data);
    } catch {
      setError('Error al cargar pedidos PV');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const cargarPorGestionar = useCallback(async () => {
    if (!user?.puede_gestionar_pv) return;
    try {
      const { data } = await axios.get(`${API}/api/pedidos-pv/por-gestionar`, { headers });
      setPedidosPorGestionar(data);
    } catch { /* silencioso */ }
  }, [token, user]);

  useEffect(() => { cargarDatos(); cargarPorGestionar(); }, [cargarDatos, cargarPorGestionar]);

  // ─── Proveedores y asesores únicos (para filtros) ─────────────────────────

  const proveedoresUnicos = Array.from(new Set(pedidosSistema.map(p => p.proveedor).filter(Boolean)));
  const asesoresUnicos = Array.from(new Set(pedidosSistema.map(p => p.asesor_iniciales || p.creador?.nombre_completo || '').filter(Boolean)));

  // ─── Filtrado Gestión PV ──────────────────────────────────────────────────

  const pedidosFiltrados = pedidosSistema.filter(p => {
    const q = busqueda.toLowerCase();
    const matchBusqueda = !busqueda || (
      p.numero_pedido.toLowerCase().includes(q) ||
      (p.odp?.cliente?.nombre_razon_social || '').toLowerCase().includes(q) ||
      (p.nombre_cliente_excel || '').toLowerCase().includes(q) ||
      (p.odp?.numero_odp || p.odp_numero_excel || '').toLowerCase().includes(q)
    );
    const matchEstado = !filtrosAplicados.estado || p.estado === filtrosAplicados.estado;
    const matchProveedor = !filtrosAplicados.proveedor || p.proveedor === filtrosAplicados.proveedor;
    const matchAsesor = !filtrosAplicados.asesor ||
      (p.asesor_iniciales || p.creador?.nombre_completo || '') === filtrosAplicados.asesor;
    const matchRetraso = !soloRetrasos || (p.dias_diferencia !== null && p.dias_diferencia < 0);
    return matchBusqueda && matchEstado && matchProveedor && matchAsesor && matchRetraso;
  });

  const pedidosPaginados = pedidosFiltrados.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  // ─── Filtrado Vista Excel ─────────────────────────────────────────────────

  const pedidosExcelFiltrados = pedidosExcel.filter(p => {
    if (!busquedaExcel) return true;
    const q = busquedaExcel.toLowerCase();
    return (
      p.numero_pedido.toLowerCase().includes(q) ||
      (p.proveedor || '').toLowerCase().includes(q) ||
      (p.odp_numero_excel || '').toLowerCase().includes(q) ||
      (p.asesor_iniciales || '').toLowerCase().includes(q) ||
      (p.nombre_cliente_excel || '').toLowerCase().includes(q) ||
      (p.espesor_vidrio || '').toLowerCase().includes(q)
    );
  });

  const pedidosExcelPaginados = pedidosExcelFiltrados.slice(pageExcel * 10, pageExcel * 10 + 10);

  // ─── KPIs ─────────────────────────────────────────────────────────────────

  const total = pedidosSistema.length;
  const kpis = {
    total,
    verificados: pedidosSistema.filter(p => p.estado === 'VERIFICADO').length,
    enTransito: pedidosSistema.filter(p => ['ENVIADO', 'CONFIRMADO_PROVEEDOR'].includes(p.estado)).length,
    conRetraso: pedidosSistema.filter(p => p.dias_diferencia !== null && p.dias_diferencia < 0).length,
    metraje: pedidosSistema.reduce((acc, p) => acc + toFloat(p.metraje_venta), 0).toFixed(2),
  };

  const pct = (n: number) => total > 0 ? `${Math.round(n / total * 100)}% del total` : '0%';

  // ─── Acciones ─────────────────────────────────────────────────────────────

  const abrirModalCrear = async () => {
    const [{ data: odpsData }, { data: numData }] = await Promise.all([
      axios.get(`${API}/api/odp`, { headers }),
      axios.get(`${API}/api/pedidos-pv/siguiente-numero`, { headers }),
    ]);
    setOdps(odpsData);
    setSiguienteNumero(numData.siguiente);
    setModalCrear(true);
  };

  const crearPedido = async () => {
    try {
      await axios.post(`${API}/api/pedidos-pv`, {
        odp_id: parseInt(formCrear.odp_id),
        proveedor: formCrear.proveedor,
        sufijo: formCrear.sufijo || null,
        fecha_entrega_prometida: formCrear.fecha_entrega_prometida || null,
        metraje_venta: formCrear.metraje_venta ? parseFloat(formCrear.metraje_venta) : null,
        espesor_vidrio: formCrear.espesor_vidrio || null,
        observaciones: formCrear.observaciones || null,
      }, { headers });
      setModalCrear(false);
      setFormCrear({ odp_id: '', proveedor: '', sufijo: '', fecha_entrega_prometida: '', metraje_venta: '', espesor_vidrio: '', observaciones: '' });
      cargarDatos();
    } catch { setError('Error al crear pedido PV'); }
  };

  const enviarPedido = async () => {
    if (!modalEnviar) return;
    try {
      await axios.patch(`${API}/api/pedidos-pv/${modalEnviar.id}/enviar`, {
        fecha_entrega_prometida: formEnviar.fecha_entrega_prometida || null,
        confirmado_proveedor: formEnviar.confirmado_proveedor,
      }, { headers });
      setModalEnviar(null);
      cargarDatos();
    } catch { setError('Error al marcar como enviado'); }
  };

  const confirmarProveedor = async (pedido: PedidoPV) => {
    try {
      await axios.patch(`${API}/api/pedidos-pv/${pedido.id}/confirmar-proveedor`, {}, { headers });
      cargarDatos();
    } catch { setError('Error al confirmar proveedor'); }
  };

  const registrarLlegada = async () => {
    if (!modalLlegada) return;
    try {
      await axios.patch(`${API}/api/pedidos-pv/${modalLlegada.id}/registrar-llegada`, {
        fecha_llegada_real: fechaLlegada || undefined,
      }, { headers });
      setModalLlegada(null);
      setFechaLlegada('');
      cargarDatos();
    } catch { setError('Error al registrar llegada'); }
  };

  const accionVerificar = async () => {
    if (!modalVerificar) return;
    const endpoint = modalVerificar.tipo === 'verificar' ? 'verificar' : 'problema';
    const body = modalVerificar.tipo === 'verificar'
      ? { observacion_verificacion: obsVerificacion || null }
      : { observacion: obsVerificacion };
    try {
      await axios.patch(`${API}/api/pedidos-pv/${modalVerificar.pedido.id}/${endpoint}`, body, { headers });
      setModalVerificar(null);
      setObsVerificacion('');
      cargarDatos();
    } catch { setError('Error al procesar acción'); }
  };

  const asignarItemsPV = async () => {
    if (!modalGestionar || itemsSeleccionados.length === 0) return;
    setSavingGestionar(true);
    try {
      await axios.patch(`${API}/api/pedidos-pv/${modalGestionar.id}/asignar-items`,
        { odp_item_ids: itemsSeleccionados }, { headers });
      setModalGestionar(null);
      setItemsSeleccionados([]);
      cargarDatos();
      cargarPorGestionar();
    } catch { setError('Error al asignar ítems al pedido PV'); }
    finally { setSavingGestionar(false); }
  };

  const imprimirPedido = async (pedido: PedidoPV) => {
    if (!pedido.odp_id) return;
    setPrintLoadingId(pedido.id);
    try {
      const { data: odpCompleta } = await axios.get(`${API}/api/odp/${pedido.odp_id}`, { headers });
      setPrintData({ pedido, odp: odpCompleta });
      shouldPrintRef.current = true;
    } catch {
      setError('Error al cargar datos de la ODP para imprimir');
    } finally {
      setPrintLoadingId(null);
    }
  };

  useEffect(() => {
    if (!printData || !shouldPrintRef.current) return;
    shouldPrintRef.current = false;
    setTimeout(() => {
      const area = document.getElementById('printable-pedido-pv');
      if (!area) return;
      const win = window.open('', '_blank', 'width=1100,height=800');
      if (!win) return;
      win.document.write(`<!DOCTYPE html><html><head>
        <meta charset="utf-8"/>
        <title>Pedido PV ${printData.pedido.numero_pedido} — ${printData.pedido.proveedor}</title>
        <script src="https://cdn.tailwindcss.com"><\/script>
        <style>
          @page { size: A4 landscape; margin: 5mm; }
          body { margin: 0; padding: 0; font-family: sans-serif; }
          .pv-t { width: 100%; border-collapse: collapse; }
          .pv-t td, .pv-t th { border: 1px solid #000; padding: 2px 4px; vertical-align: middle; }
          .pv-t th { font-weight: bold; text-align: center; background-color: #efefef; }
          .pv-outer { border: 2px solid #000 !important; }
          .pv-bold { font-weight: bold; }
          .pv-center { text-align: center; }
          .pv-color { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        </style>
      </head><body>${area.innerHTML}</body></html>`);
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); win.close(); }, 800);
    }, 150);
  }, [printData]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Box sx={{ p: 3 }}>

      {/* Encabezado */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2.5}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Pedidos PV</Typography>
          <Typography variant="body2" color="text.secondary">
            Control de pedidos de vidrio templado a proveedores
          </Typography>
        </Box>
        <Stack direction="row" gap={1}>
          <IconButton onClick={cargarDatos} size="small"><Refresh /></IconButton>
          {puedeCrear && (
            <Button variant="contained" startIcon={<Add />} onClick={abrirModalCrear} sx={{ borderRadius: 2 }}>
              Nuevo pedido
            </Button>
          )}
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)}
        sx={{ mb: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Tab icon={<Tune fontSize="small" />} iconPosition="start" label="Gestión PV" />
        <Tab icon={<TableChart fontSize="small" />} iconPosition="start" label="Vista Excel" />
        {puedeCrear && (
          <Tab
            icon={<HourglassEmpty fontSize="small" />}
            iconPosition="start"
            label={pedidosPorGestionar.length > 0 ? `Por Gestionar (${pedidosPorGestionar.length})` : 'Por Gestionar'}
            sx={pedidosPorGestionar.length > 0 ? { color: 'warning.main', fontWeight: 700 } : {}}
          />
        )}
      </Tabs>

      {loading ? (
        <Box display="flex" justifyContent="center" py={8}><CircularProgress /></Box>
      ) : (
        <>
          {/* ═══════════════════════════ TAB 0 — GESTIÓN PV ═══════════════════════════ */}
          {tab === 0 && (
            <Box>

              {/* KPIs */}
              <Stack direction="row" gap={2} mb={3} flexWrap="wrap">
                <KPICard label="Total Pedidos" value={kpis.total} sub="100% del total"
                  icon={<TableChart />} color="#1565c0" bgColor="#e3f2fd" />
                <KPICard label="Verificados" value={kpis.verificados} sub={pct(kpis.verificados)}
                  icon={<CheckCircleOutline />} color="#2e7d32" bgColor="#e8f5e9" />
                <KPICard label="En Tránsito" value={kpis.enTransito} sub={pct(kpis.enTransito)}
                  icon={<LocalShipping />} color="#e65100" bgColor="#fff3e0" />
                <KPICard label="Con Retraso" value={kpis.conRetraso} sub={pct(kpis.conRetraso)}
                  icon={<Cancel />} color="#c62828" bgColor="#ffebee" />
                <KPICard label="m² Vendidos" value={kpis.metraje} sub="Total acumulado"
                  icon={<Typography fontWeight={800} fontSize={14}>m²</Typography>} color="#00695c" bgColor="#e0f2f1" />
              </Stack>

              <Divider sx={{ mb: 2.5 }} />

              {/* Búsqueda + toggle */}
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5} flexWrap="wrap" gap={1.5}>
                <TextField size="small" placeholder="Buscar pedido, cliente o referencia..."
                  value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setPage(0); }}
                  sx={{ minWidth: 340 }}
                  InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment> }} />
                <FormControlLabel control={<Switch checked={soloRetrasos} onChange={(e) => { setSoloRetrasos(e.target.checked); setPage(0); }} size="small" />}
                  label={<Typography variant="body2">Mostrar solo retrasos</Typography>} />
              </Stack>

              {/* Filtros */}
              <Stack direction="row" gap={1.5} mb={2} flexWrap="wrap" alignItems="center">
                <FormControl size="small" sx={{ minWidth: 130 }}>
                  <InputLabel>Estado</InputLabel>
                  <Select value={filtroEstado} label="Estado" onChange={(e) => setFiltroEstado(e.target.value)}>
                    <MenuItem value="">Todos</MenuItem>
                    {Object.entries(ESTADO_CONFIG).map(([k, v]) => (
                      <MenuItem key={k} value={k}>{v.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <InputLabel>Proveedor</InputLabel>
                  <Select value={filtroProveedor} label="Proveedor" onChange={(e) => setFiltroProveedor(e.target.value)}>
                    <MenuItem value="">Todos</MenuItem>
                    {proveedoresUnicos.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 130 }}>
                  <InputLabel>Asesor</InputLabel>
                  <Select value={filtroAsesor} label="Asesor" onChange={(e) => setFiltroAsesor(e.target.value)}>
                    <MenuItem value="">Todos</MenuItem>
                    {asesoresUnicos.map(a => <MenuItem key={a} value={a}>{a}</MenuItem>)}
                  </Select>
                </FormControl>
                <Button variant="outlined" size="small"
                  onClick={() => { setFiltrosAplicados({ estado: '', proveedor: '', asesor: '' }); setFiltroEstado(''); setFiltroProveedor(''); setFiltroAsesor(''); setPage(0); }}>
                  Limpiar
                </Button>
                <Button variant="contained" size="small"
                  onClick={() => { setFiltrosAplicados({ estado: filtroEstado, proveedor: filtroProveedor, asesor: filtroAsesor }); setPage(0); }}>
                  Aplicar
                </Button>
              </Stack>

              {/* Tabla */}
              <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ '& th': { bgcolor: 'grey.50', fontWeight: 700, fontSize: 13, borderBottom: '2px solid', borderColor: 'divider' } }}>
                        <TableCell sx={{ width: 4, p: 0 }} />
                        <TableCell>Pedido</TableCell>
                        <TableCell>ODP</TableCell>
                        <TableCell>Cliente</TableCell>
                        <TableCell>Proveedor</TableCell>
                        <TableCell>Estado</TableCell>
                        <TableCell>Envío</TableCell>
                        <TableCell>Entrega Prometida</TableCell>
                        <TableCell>Llegada</TableCell>
                        <TableCell align="center">Días</TableCell>
                        <TableCell>Espesor</TableCell>
                        <TableCell align="right">m²</TableCell>
                        <TableCell align="right">Acciones</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {pedidosPaginados.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={13} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                            No hay pedidos con los filtros seleccionados
                          </TableCell>
                        </TableRow>
                      )}
                      {pedidosPaginados.map((p) => {
                        const cfg = ESTADO_CONFIG[p.estado] ?? ESTADO_CONFIG['PENDIENTE'];
                        const retrasado = p.dias_diferencia !== null && p.dias_diferencia < 0;
                        const barColor = getBarColor(p);
                        const clienteNombre = p.odp?.cliente?.nombre_razon_social || p.nombre_cliente_excel || '—';

                        return (
                          <TableRow key={p.id} hover sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                            {/* Barra de color lateral */}
                            <TableCell sx={{ width: 4, p: 0, bgcolor: barColor }} />
                            {/* Pedido */}
                            <TableCell>
                              <Typography fontWeight={700} fontSize={13}>{p.numero_pedido}</Typography>
                              {p.tuvo_problema && (
                                <Typography variant="caption" color="error.main">Con problema previo</Typography>
                              )}
                            </TableCell>
                            {/* ODP */}
                            <TableCell sx={{ fontSize: 13, fontWeight: 600, color: 'primary.main' }}>
                              {p.odp?.numero_odp || '—'}
                            </TableCell>
                            {/* Cliente */}
                            <TableCell sx={{ maxWidth: 180 }}>
                              <Tooltip title={clienteNombre} placement="top">
                                <Typography fontSize={13} noWrap>{clienteNombre}</Typography>
                              </Tooltip>
                            </TableCell>
                            {/* Proveedor */}
                            <TableCell sx={{ fontSize: 13 }}>{p.proveedor}</TableCell>
                            {/* Estado */}
                            <TableCell>
                              <Chip
                                label={retrasado ? 'Retrasado' : cfg.label}
                                color={retrasado ? 'error' : cfg.color}
                                icon={retrasado ? <Cancel sx={{ fontSize: 13 }} /> : cfg.icon as any}
                                size="small"
                                sx={{ fontWeight: 600, fontSize: 11 }}
                              />
                            </TableCell>
                            {/* Envío */}
                            <TableCell sx={{ fontSize: 12 }}>{fmtFecha(p.fecha_envio)}</TableCell>
                            {/* Entrega prometida */}
                            <TableCell sx={{ fontSize: 12 }}>{fmtFecha(p.fecha_entrega_prometida)}</TableCell>
                            {/* Llegada */}
                            <TableCell sx={{ fontSize: 12 }}>{fmtFecha(p.fecha_llegada_real)}</TableCell>
                            {/* Días */}
                            <TableCell align="center">
                              {p.dias_diferencia !== null ? (
                                <Typography fontWeight={700} fontSize={13}
                                  color={retrasado ? 'error.main' : 'success.main'}>
                                  {p.dias_diferencia >= 0 ? `+${p.dias_diferencia}` : p.dias_diferencia}
                                </Typography>
                              ) : '—'}
                            </TableCell>
                            {/* Espesor */}
                            <TableCell sx={{ fontSize: 12 }}>{p.espesor_vidrio || '—'}</TableCell>
                            {/* m² */}
                            <TableCell align="right" sx={{ fontSize: 12 }}>
                              {p.metraje_venta ? toFloat(p.metraje_venta).toFixed(2) : '—'}
                            </TableCell>
                            {/* Acciones */}
                            <TableCell align="right">
                              <AccionesMenu
                                pedido={p}
                                puedeEnviar={puedeEnviar}
                                puedeGestionar={puedeGestionar}
                                onEnviar={() => { setModalEnviar(p); setFormEnviar({ fecha_entrega_prometida: '', confirmado_proveedor: false }); }}
                                onConfirmar={() => confirmarProveedor(p)}
                                onLlegada={() => { setModalLlegada(p); setFechaLlegada(''); }}
                                onVerificar={() => { setModalVerificar({ pedido: p, tipo: 'verificar' }); setObsVerificacion(''); }}
                                onProblema={() => { setModalVerificar({ pedido: p, tipo: 'problema' }); setObsVerificacion(''); }}
                                onDetalle={() => setModalDetalle(p)}
                                onImprimir={() => imprimirPedido(p)}
                                printLoading={printLoadingId === p.id}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
                <Divider />
                <Box sx={{ px: 2 }}>
                  <TablePagination
                    component="div"
                    count={pedidosFiltrados.length}
                    page={page}
                    onPageChange={(_, p) => setPage(p)}
                    rowsPerPage={rowsPerPage}
                    onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
                    rowsPerPageOptions={[10, 25, 50]}
                    labelRowsPerPage="por página"
                    labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count} pedidos`}
                  />
                </Box>
              </Paper>
            </Box>
          )}

          {/* ═══════════════════════════ TAB 2 — POR GESTIONAR ═══════════════════════════ */}
          {tab === 2 && puedeCrear && (
            <Box>
              {pedidosPorGestionar.length === 0 ? (
                <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 6, textAlign: 'center' }}>
                  <CheckCircleOutline sx={{ fontSize: 48, color: 'success.light', mb: 1 }} />
                  <Typography variant="h6" color="text.secondary">Todo gestionado</Typography>
                  <Typography variant="body2" color="text.disabled">No hay pedidos PV pendientes de asignación de ítems.</Typography>
                </Paper>
              ) : (
                <Stack gap={2}>
                  {pedidosPorGestionar.map((pv: any) => {
                    const odp = pv.odp;
                    const items: any[] = odp?.items || [];
                    const asignados = items.filter((it: any) => it.pedido_pv_id !== null).length;
                    return (
                      <Paper key={pv.id} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2.5 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Box>
                            <Stack direction="row" gap={1} alignItems="center" mb={0.5}>
                              <Typography fontWeight={700} fontSize={15}>
                                {odp?.numero_odp || '—'}
                              </Typography>
                              <Chip label={`PV ${pv.numero_pedido}`} size="small" color="primary" variant="outlined" sx={{ fontWeight: 700 }} />
                              <Chip label={pv.proveedor} size="small" variant="outlined" />
                            </Stack>
                            <Typography variant="body2" color="text.secondary">
                              {odp?.cliente?.nombre_razon_social || '—'} &nbsp;·&nbsp; {items.length} ítem{items.length !== 1 ? 's' : ''} en la ODP
                              {asignados > 0 && <>&nbsp;·&nbsp; <strong>{asignados} ya asignado{asignados !== 1 ? 's' : ''}</strong></>}
                            </Typography>
                          </Box>
                          <Button
                            variant="contained"
                            size="small"
                            onClick={() => {
                              setModalGestionar(pv);
                              setItemsSeleccionados(
                                items.filter((it: any) => it.pedido_pv_id === pv.id).map((it: any) => it.id)
                              );
                            }}
                            sx={{ borderRadius: 2, whiteSpace: 'nowrap' }}
                          >
                            Asignar ítems
                          </Button>
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              )}
            </Box>
          )}

          {/* ═══════════════════════════ TAB 1 — VISTA EXCEL ═══════════════════════════ */}
          {tab === 1 && (
            <Box>
              <Stack direction="row" gap={2} mb={2} alignItems="center">
                <TextField size="small"
                  placeholder="Buscar por pedido, proveedor, ODP, asesor, cliente..."
                  value={busquedaExcel}
                  onChange={(e) => { setBusquedaExcel(e.target.value); setPageExcel(0); }}
                  sx={{ minWidth: 380 }}
                  InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment> }} />
                <Typography variant="caption" color="text.secondary">
                  {pedidosExcelFiltrados.length} de {pedidosExcel.length} registros — datos históricos del Excel
                </Typography>
              </Stack>

              <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
                <TableContainer sx={{ maxHeight: 'calc(100vh - 320px)' }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        {['PROVEEDOR', 'PEDIDO #', 'O.D.P TEMPLEX', 'ASESOR', 'FECHA ENVIO', 'HORA ENVIO',
                          'RECIBIDO x PROVEEDOR', 'ENTREGA', '# DIAS', 'LLEGADA',
                          'METRAJE VENTA', 'NOMBRE CLIENTE', 'FACTURA PV', 'ESPESOR/VIDRIO', 'OBSERVACION'
                        ].map(col => (
                          <TableCell key={col} sx={{ fontWeight: 700, whiteSpace: 'nowrap', bgcolor: '#1a5276', color: 'white', fontSize: 11 }}>
                            {col}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {pedidosExcelPaginados.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={15} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                            No hay resultados
                          </TableCell>
                        </TableRow>
                      )}
                      {pedidosExcelPaginados.map((p, idx) => {
                        const retrasado = p.dias_diferencia !== null && p.dias_diferencia < 0;
                        return (
                          <TableRow key={p.id}
                            sx={{ bgcolor: p.tuvo_problema ? 'rgba(211,47,47,0.07)' : idx % 2 === 0 ? 'white' : 'rgba(0,0,0,0.02)' }}>
                            <TableCell sx={{ fontSize: 12 }}>{p.proveedor}</TableCell>
                            <TableCell sx={{ fontSize: 12, fontWeight: 700, color: p.tuvo_problema ? 'error.main' : 'inherit' }}>{p.numero_pedido}</TableCell>
                            <TableCell sx={{ fontSize: 12 }}>{p.odp_numero_excel || ''}</TableCell>
                            <TableCell sx={{ fontSize: 12, fontWeight: 600 }}>{p.asesor_iniciales || ''}</TableCell>
                            <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtFecha(p.fecha_envio)}</TableCell>
                            <TableCell sx={{ fontSize: 12 }}>{fmtHora(p.hora_envio)}</TableCell>
                            <TableCell sx={{ fontSize: 12, fontWeight: 700, color: p.confirmado_proveedor ? 'success.main' : 'text.disabled' }}>
                              {p.confirmado_proveedor ? 'OK' : ''}
                            </TableCell>
                            <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtFecha(p.fecha_entrega_prometida)}</TableCell>
                            <TableCell sx={{ fontSize: 12, fontWeight: 700, textAlign: 'center', color: retrasado ? 'error.main' : p.dias_diferencia !== null ? 'success.main' : 'inherit' }}>
                              {p.dias_diferencia !== null ? p.dias_diferencia : ''}
                            </TableCell>
                            <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtFecha(p.fecha_llegada_real)}</TableCell>
                            <TableCell sx={{ fontSize: 12, textAlign: 'right' }}>{p.metraje_venta ? toFloat(p.metraje_venta).toFixed(2) : ''}</TableCell>
                            <TableCell sx={{ fontSize: 12, maxWidth: 200 }}>
                              <Tooltip title={p.nombre_cliente_excel || ''} placement="top">
                                <Typography fontSize={12} noWrap>{p.nombre_cliente_excel || ''}</Typography>
                              </Tooltip>
                            </TableCell>
                            <TableCell sx={{ fontSize: 12 }}>{p.factura_pv || ''}</TableCell>
                            <TableCell sx={{ fontSize: 12 }}>{p.espesor_vidrio || ''}</TableCell>
                            <TableCell sx={{ fontSize: 12, maxWidth: 160 }}>
                              <Tooltip title={p.observaciones || ''} placement="top">
                                <Typography fontSize={12} noWrap>{p.observaciones || ''}</Typography>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
                <Divider />
                <Box sx={{ px: 2 }}>
                  <TablePagination
                    component="div"
                    count={pedidosExcelFiltrados.length}
                    page={pageExcel}
                    onPageChange={(_, p) => setPageExcel(p)}
                    rowsPerPage={10}
                    rowsPerPageOptions={[10]}
                    labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count} registros`}
                  />
                </Box>
              </Paper>
            </Box>
          )}
        </>
      )}

      {/* ─── Modal: Crear ──────────────────────────────────────────────────────── */}
      <Dialog open={modalCrear} onClose={() => setModalCrear(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nuevo Pedido PV — #{siguienteNumero}{formCrear.sufijo ? '-' + formCrear.sufijo.toUpperCase() : ''}</DialogTitle>
        <DialogContent>
          <Stack gap={2} mt={1}>
            <FormControl fullWidth size="small">
              <InputLabel>ODP *</InputLabel>
              <Select value={formCrear.odp_id} label="ODP *"
                onChange={(e) => setFormCrear(f => ({ ...f, odp_id: String(e.target.value) }))}>
                {odps.map((o: any) => (
                  <MenuItem key={o.id} value={o.id}>
                    {o.numero_odp} — {o.cliente?.nombre_razon_social ?? ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField label="Proveedor *" size="small" fullWidth value={formCrear.proveedor}
              onChange={(e) => setFormCrear(f => ({ ...f, proveedor: e.target.value }))}
              placeholder="VITELSA S.A, VIDPLEX S.A, TEMPLACOL..." />
            <TextField label="Sufijo (A, B, C...)" size="small" fullWidth value={formCrear.sufijo}
              onChange={(e) => setFormCrear(f => ({ ...f, sufijo: e.target.value.toUpperCase() }))}
              helperText="Dejar vacío si es único. Usar A, B, C cuando hay varios del mismo número base." />
            <TextField label="Espesor / Tipo de vidrio" size="small" fullWidth value={formCrear.espesor_vidrio}
              onChange={(e) => setFormCrear(f => ({ ...f, espesor_vidrio: e.target.value }))}
              placeholder="6MM, 8MM, 10MM, 6+6, GRIS HUMO..." />
            <TextField label="Fecha entrega prometida" type="date" size="small" fullWidth
              InputLabelProps={{ shrink: true }} value={formCrear.fecha_entrega_prometida}
              onChange={(e) => setFormCrear(f => ({ ...f, fecha_entrega_prometida: e.target.value }))} />
            <TextField label="Metraje venta (m²)" type="number" size="small" fullWidth
              value={formCrear.metraje_venta}
              onChange={(e) => setFormCrear(f => ({ ...f, metraje_venta: e.target.value }))} />
            <TextField label="Observaciones" size="small" fullWidth multiline rows={2}
              value={formCrear.observaciones}
              onChange={(e) => setFormCrear(f => ({ ...f, observaciones: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalCrear(false)}>Cancelar</Button>
          <Button variant="contained" onClick={crearPedido} disabled={!formCrear.odp_id || !formCrear.proveedor}>
            Crear pedido
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Modal: Enviar ─────────────────────────────────────────────────────── */}
      <Dialog open={!!modalEnviar} onClose={() => setModalEnviar(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Marcar enviado — PV {modalEnviar?.numero_pedido}</DialogTitle>
        <DialogContent>
          <Stack gap={2} mt={1}>
            <TextField label="Fecha entrega prometida" type="date" size="small" fullWidth
              InputLabelProps={{ shrink: true }} value={formEnviar.fecha_entrega_prometida}
              onChange={(e) => setFormEnviar(f => ({ ...f, fecha_entrega_prometida: e.target.value }))} />
            <FormControl size="small" fullWidth>
              <InputLabel>¿Proveedor confirmó?</InputLabel>
              <Select value={formEnviar.confirmado_proveedor ? 'si' : 'no'} label="¿Proveedor confirmó?"
                onChange={(e) => setFormEnviar(f => ({ ...f, confirmado_proveedor: e.target.value === 'si' }))}>
                <MenuItem value="no">No todavía</MenuItem>
                <MenuItem value="si">Sí, confirmó</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalEnviar(null)}>Cancelar</Button>
          <Button variant="contained" onClick={enviarPedido}>Confirmar envío</Button>
        </DialogActions>
      </Dialog>

      {/* ─── Modal: Llegada ────────────────────────────────────────────────────── */}
      <Dialog open={!!modalLlegada} onClose={() => setModalLlegada(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Registrar llegada — PV {modalLlegada?.numero_pedido}</DialogTitle>
        <DialogContent>
          <Stack gap={2} mt={1}>
            <Typography variant="body2" color="text.secondary">
              ODP: <strong>{modalLlegada?.odp?.numero_odp || modalLlegada?.odp_numero_excel || '—'}</strong><br />
              Proveedor: <strong>{modalLlegada?.proveedor}</strong><br />
              Entrega prometida: <strong>{fmtFecha(modalLlegada?.fecha_entrega_prometida ?? null)}</strong>
            </Typography>
            <TextField label="Fecha llegada real" type="date" size="small" fullWidth
              InputLabelProps={{ shrink: true }} value={fechaLlegada}
              onChange={(e) => setFechaLlegada(e.target.value)}
              helperText="Dejar vacío para usar la fecha de hoy" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalLlegada(null)}>Cancelar</Button>
          <Button variant="contained" color="warning" onClick={registrarLlegada}>Registrar llegada</Button>
        </DialogActions>
      </Dialog>

      {/* ─── Modal: Verificar / Problema ──────────────────────────────────────── */}
      <Dialog open={!!modalVerificar} onClose={() => setModalVerificar(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {modalVerificar?.tipo === 'verificar' ? '✅ Verificar vidrios' : '⚠️ Marcar problema'}
          {' — PV '}{modalVerificar?.pedido.numero_pedido}
        </DialogTitle>
        <DialogContent>
          <Stack gap={2} mt={1}>
            {modalVerificar?.tipo === 'problema' && (
              <Alert severity="warning">
                Regresará a <strong>En Tránsito</strong> y quedará marcado con historial de problema.
              </Alert>
            )}
            <TextField
              label={modalVerificar?.tipo === 'verificar' ? 'Observación (opcional)' : 'Descripción del problema *'}
              size="small" fullWidth multiline rows={3}
              value={obsVerificacion} onChange={(e) => setObsVerificacion(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalVerificar(null)}>Cancelar</Button>
          <Button variant="contained"
            color={modalVerificar?.tipo === 'verificar' ? 'success' : 'error'}
            onClick={accionVerificar}
            disabled={modalVerificar?.tipo === 'problema' && !obsVerificacion}>
            {modalVerificar?.tipo === 'verificar' ? 'Verificado correcto' : 'Confirmar problema'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Modal: Asignar ítems al PV ───────────────────────────────────────── */}
      <Dialog open={!!modalGestionar} onClose={() => { setModalGestionar(null); setItemsSeleccionados([]); }} maxWidth="md" fullWidth>
        <DialogTitle>
          Asignar ítems — PV {modalGestionar?.numero_pedido} &nbsp;·&nbsp; {modalGestionar?.odp?.numero_odp}
        </DialogTitle>
        <DialogContent>
          {modalGestionar && (() => {
            const odp = modalGestionar.odp;
            const items: any[] = odp?.items || [];
            const bloques = Math.ceil(itemsSeleccionados.length / 12);
            return (
              <Stack gap={2} mt={1}>
                <Box display="flex" gap={2} flexWrap="wrap">
                  <Typography variant="body2"><strong>Cliente:</strong> {odp?.cliente?.nombre_razon_social || '—'}</Typography>
                  <Typography variant="body2"><strong>Proveedor:</strong> {modalGestionar.proveedor}</Typography>
                  <Typography variant="body2"><strong>Ítems totales ODP:</strong> {items.length}</Typography>
                </Box>

                {itemsSeleccionados.length > 12 && (
                  <Alert severity="info">
                    {itemsSeleccionados.length} ítems seleccionados — se generarán <strong>{bloques} formularios</strong>: {modalGestionar.numero_pedido}{Array.from({ length: bloques - 1 }, (_, i) => `, ${modalGestionar.numero_pedido}-${i + 1}`).join('')}
                  </Alert>
                )}

                {items.length === 0 ? (
                  <Alert severity="warning">Esta ODP no tiene ítems de vidrio registrados.</Alert>
                ) : (
                  <Paper variant="outlined" sx={{ overflow: 'hidden', borderRadius: 2 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: 'grey.100' }}>
                          <TableCell padding="checkbox">
                            <input
                              type="checkbox"
                              checked={itemsSeleccionados.length === items.length && items.length > 0}
                              onChange={(e) => setItemsSeleccionados(e.target.checked ? items.map((it: any) => it.id) : [])}
                            />
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>#</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Tipo</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Color</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Esp.</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Ancho</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Alto</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Cant.</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Observaciones</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {items.map((it: any, idx: number) => {
                          const seleccionado = itemsSeleccionados.includes(it.id);
                          return (
                            <TableRow
                              key={it.id}
                              selected={seleccionado}
                              onClick={() => setItemsSeleccionados(prev =>
                                prev.includes(it.id) ? prev.filter(id => id !== it.id) : [...prev, it.id]
                              )}
                              sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                            >
                              <TableCell padding="checkbox">
                                <input type="checkbox" checked={seleccionado} readOnly />
                              </TableCell>
                              <TableCell sx={{ fontSize: 12 }}>{idx + 1}</TableCell>
                              <TableCell sx={{ fontSize: 12 }}>{it.tipo_vidrio || '—'}</TableCell>
                              <TableCell sx={{ fontSize: 12 }}>{it.color || '—'}</TableCell>
                              <TableCell sx={{ fontSize: 12 }}>{it.espesor || '—'}</TableCell>
                              <TableCell sx={{ fontSize: 12 }}>{it.ancho_mm || '—'}</TableCell>
                              <TableCell sx={{ fontSize: 12 }}>{it.alto_mm || '—'}</TableCell>
                              <TableCell sx={{ fontSize: 12 }}>{it.cantidad || 1}</TableCell>
                              <TableCell sx={{ fontSize: 12, maxWidth: 180 }}>
                                <Tooltip title={it.otros || it.accesorios || ''}>
                                  <Typography fontSize={12} noWrap>{it.otros || it.accesorios || '—'}</Typography>
                                </Tooltip>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </Paper>
                )}

                <Typography variant="caption" color="text.secondary">
                  {itemsSeleccionados.length} de {items.length} ítems seleccionados
                </Typography>
              </Stack>
            );
          })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setModalGestionar(null); setItemsSeleccionados([]); }}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={asignarItemsPV}
            disabled={itemsSeleccionados.length === 0 || savingGestionar}
          >
            {savingGestionar ? 'Guardando...' : `Registrar asignación (${itemsSeleccionados.length} ítems)`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Área de impresión (oculta) ───────────────────────────────────────── */}
      <div id="printable-pedido-pv" style={{ display: 'none' }}>
        {printData && (
          <PrintablePedidoVitelsa pedido={printData.pedido} odp={printData.odp} />
        )}
      </div>

      {/* ─── Modal: Detalle ────────────────────────────────────────────────────── */}
      <Dialog open={!!modalDetalle} onClose={() => setModalDetalle(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Pedido PV {modalDetalle?.numero_pedido}</DialogTitle>
        <DialogContent>
          {modalDetalle && (
            <Stack gap={1.5} mt={1}>
              <Box display="grid" gridTemplateColumns="1fr 1fr" gap={1.5}>
                {([
                  ['Proveedor', modalDetalle.proveedor],
                  ['ODP', modalDetalle.odp?.numero_odp || modalDetalle.odp_numero_excel || '—'],
                  ['Cliente', modalDetalle.odp?.cliente?.nombre_razon_social || modalDetalle.nombre_cliente_excel || '—'],
                  ['Asesor', modalDetalle.asesor_iniciales || modalDetalle.creador?.nombre_completo || '—'],
                  ['Estado', <Chip key="e" label={ESTADO_CONFIG[modalDetalle.estado]?.label ?? modalDetalle.estado} color={ESTADO_CONFIG[modalDetalle.estado]?.color ?? 'default'} size="small" />],
                  ['Espesor/Tipo', modalDetalle.espesor_vidrio || '—'],
                  ['Metraje venta', modalDetalle.metraje_venta ? `${toFloat(modalDetalle.metraje_venta).toFixed(2)} m²` : '—'],
                  ['Fecha envío', fmtFecha(modalDetalle.fecha_envio)],
                  ['Hora envío', fmtHora(modalDetalle.hora_envio)],
                  ['Proveedor confirmó', modalDetalle.confirmado_proveedor ? 'Sí' : 'No'],
                  ['Entrega prometida', fmtFecha(modalDetalle.fecha_entrega_prometida)],
                  ['Llegada real', fmtFecha(modalDetalle.fecha_llegada_real)],
                  ['Días diferencia', modalDetalle.dias_diferencia !== null ? (modalDetalle.dias_diferencia >= 0 ? `+${modalDetalle.dias_diferencia}d (a tiempo)` : `${modalDetalle.dias_diferencia}d (tarde)`) : '—'],
                  ['Factura PV', modalDetalle.factura_pv || '—'],
                  ['Tuvo problema', modalDetalle.tuvo_problema ? '⚠️ Sí' : 'No'],
                  ['Verificado por', modalDetalle.verificador?.nombre_completo || '—'],
                ] as [string, React.ReactNode][]).map(([lbl, val]) => (
                  <Box key={lbl}>
                    <Typography variant="caption" color="text.secondary">{lbl}</Typography>
                    <Typography variant="body2" fontWeight={500}>{val}</Typography>
                  </Box>
                ))}
              </Box>
              {modalDetalle.observaciones && (
                <Box><Typography variant="caption" color="text.secondary">Observaciones</Typography>
                  <Typography variant="body2">{modalDetalle.observaciones}</Typography></Box>
              )}
              {modalDetalle.observacion_verificacion && (
                <Box><Typography variant="caption" color="text.secondary">Obs. verificación / problema</Typography>
                  <Typography variant="body2" color={modalDetalle.tuvo_problema ? 'error' : 'inherit'}>
                    {modalDetalle.observacion_verificacion}
                  </Typography></Box>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalDetalle(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PedidosPVPage;
