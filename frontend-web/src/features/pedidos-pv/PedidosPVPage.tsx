import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useDataChangedSocket } from '../../store/useSocketNotifications';
import axios from 'axios';
import ODPFichaModal from '../odp/components/ODPFichaModal';
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
  tipo_problema: string | null;
  estado_reposicion: string | null;
  fecha_reposicion_prometida: string | null;
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
  color_fila: string | null;
  observacion_verificacion: string | null;
  nombre_cliente_excel: string | null;
  asesor_iniciales: string | null;
  origen: string;
  creado_en: string;
  odp?: { id: number; numero_odp: string; estado_produccion: string; fecha_creacion?: string; cliente?: { nombre_razon_social: string }; asesor?: { nombre_completo: string } };
  items_asignados?: { id: number; espesor: string | null; cantidad: number; ancho_mm: number; alto_mm: number }[];
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
  ENVIADO:              { label: 'Solicitado',   color: 'primary',  icon: <LocalShipping sx={{ fontSize: 13 }} />,  barColor: '#1976d2' },
  CONFIRMADO_PROVEEDOR: { label: 'Confirmado',   color: 'info',     icon: <CheckCircleOutline sx={{ fontSize: 13 }} />, barColor: '#0288d1' },
  LLEGADO:              { label: 'Recibido',     color: 'warning',  icon: <LocalShipping sx={{ fontSize: 13 }} />,  barColor: '#f57c00' },
  VERIFICADO:           { label: 'Verificado',   color: 'success',  icon: <CheckCircleOutline sx={{ fontSize: 13 }} />, barColor: '#2e7d32' },
  ENTREGADO:            { label: 'Entregado',    color: 'success',  icon: <CheckCircleOutline sx={{ fontSize: 13 }} />, barColor: '#1b5e20' },
  PROBLEMA:             { label: 'Problema',     color: 'error',    icon: <Cancel sx={{ fontSize: 13 }} />,         barColor: '#c62828' },
};

const getBarColor = (p: PedidoPV): string => {
  if (p.dias_diferencia !== null && p.dias_diferencia < 0) return '#c62828'; // retrasado
  return ESTADO_CONFIG[p.estado]?.barColor ?? '#9e9e9e';
};

// ─── Paleta de colores de fila ────────────────────────────────────────────────

const COLOR_PALETTE = [
  { value: '#ef5350', label: 'Rojo' },
  { value: '#ff9800', label: 'Naranja' },
  { value: '#ffee58', label: 'Amarillo' },
  { value: '#66bb6a', label: 'Verde' },
  { value: '#42a5f5', label: 'Azul' },
  { value: '#ab47bc', label: 'Morado' },
  { value: '#f06292', label: 'Rosa' },
  { value: '#90a4ae', label: 'Gris' },
];

// ─── Calcular días de tránsito (llegada - envío) ──────────────────────────────

const calcDiasTransito = (p: PedidoPV): number | null => {
  if (!p.fecha_llegada_real || !p.fecha_envio) return null;
  try {
    const llegada = new Date(p.fecha_llegada_real + 'T12:00:00');
    const envio = new Date(p.fecha_envio + 'T12:00:00');
    return Math.round((llegada.getTime() - envio.getTime()) / (1000 * 60 * 60 * 24));
  } catch { return null; }
};

// ─── Calcular espesor resumido ────────────────────────────────────────────────

const calcEspesorResumen = (p: PedidoPV): string => {
  const items = p.items_asignados || [];
  if (items.length > 0) {
    const conteo: Record<string, number> = {};
    for (const it of items) {
      if (it.espesor) {
        const key = it.espesor.toLowerCase().replace('mm', '').trim() + 'mm';
        conteo[key] = (conteo[key] || 0) + (it.cantidad || 1);
      }
    }
    const partes = Object.entries(conteo).map(([esp, cnt]) => `${esp}(${cnt})`);
    return partes.join(', ') || '—';
  }
  return p.espesor_vidrio || '—';
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
  onGestionarReposicion: () => void;
  onRegistrarReposicion: () => void;
  onDetalle: () => void;
  onImprimir: () => void;
  onDescargarExcel: () => void;
  printLoading: boolean;
  excelLoading: boolean;
}> = ({ pedido, puedeEnviar, puedeGestionar, onEnviar, onConfirmar, onLlegada, onVerificar, onProblema, onGestionarReposicion, onRegistrarReposicion, onDetalle, onImprimir, onDescargarExcel, printLoading, excelLoading }) => {
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
  if (pedido.estado === 'PROBLEMA' && puedeGestionar) {
    if (!pedido.estado_reposicion)
      items.push({ label: 'Gestionar reposición', action: onGestionarReposicion, color: '#e65100' });
    if (pedido.estado_reposicion === 'EN_GESTION')
      items.push({ label: 'Vidrio repuesto / llegó', action: onRegistrarReposicion, color: '#2e7d32' });
  }
  if (pedido.estado === 'ENTREGADO')
    items.push({ label: '✓ Pedido entregado', action: () => {}, color: '#1b5e20' });
  items.push({ label: 'Ver detalle', action: onDetalle });
  if (pedido.odp_id) {
    items.push({ label: printLoading ? 'Cargando...' : 'Imprimir pedido', action: onImprimir, icon: <Print sx={{ fontSize: 16 }} /> });
    items.push({ label: excelLoading ? 'Generando...' : 'Descargar Excel', action: onDescargarExcel, icon: <TableChart sx={{ fontSize: 16 }} /> });
  }

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
  const headers = React.useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

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
  const [pasoCrear, setPasoCrear] = useState(1);
  const [itemsNuevos, setItemsNuevos] = useState<any[]>([]);
  const [busquedaOdp, setBusquedaOdp] = useState('');

  const [modalEnviar, setModalEnviar] = useState<PedidoPV | null>(null);
  const [formEnviar, setFormEnviar] = useState({ fecha_entrega_prometida: '', confirmado_proveedor: false });

  const [modalLlegada, setModalLlegada] = useState<PedidoPV | null>(null);
  const [fechaLlegada, setFechaLlegada] = useState('');

  const [modalVerificar, setModalVerificar] = useState<{ pedido: PedidoPV; tipo: 'verificar' | 'problema' } | null>(null);
  const [obsVerificacion, setObsVerificacion] = useState('');
  const [tipoProblema, setTipoProblema] = useState('');
  const [modalReposicion, setModalReposicion] = useState<{ pedido: PedidoPV; tipo: 'gestionar' | 'registrar' } | null>(null);
  const [fechaReposicion, setFechaReposicion] = useState('');

  const [modalDetalle, setModalDetalle] = useState<PedidoPV | null>(null);
  const [fichaOdpId, setFichaOdpId] = useState<number | null>(null);

  // ─── Impresión ────────────────────────────────────────────────────────────
  const [printData, setPrintData] = useState<{ pedido: PedidoPV; odp: any } | null>(null);
  const [printLoadingId, setPrintLoadingId] = useState<number | null>(null);
  const [excelLoadingId, setExcelLoadingId] = useState<number | null>(null);
  const shouldPrintRef = useRef(false);

  // ─── Edición inline ──────────────────────────────────────────────────────
  const [editingObs, setEditingObs] = useState<{ id: number; value: string } | null>(null);
  const [savingField, setSavingField] = useState<{ id: number; field: string } | null>(null);

  // ─── Por Gestionar ────────────────────────────────────────────────────────
  const [pedidosPorGestionar, setPedidosPorGestionar] = useState<any[]>([]);
  const [modalGestionar, setModalGestionar] = useState<any | null>(null);
  const [itemsSeleccionados, setItemsSeleccionados] = useState<number[]>([]);
  const [itemsExtras, setItemsExtras] = useState<Record<number, { dt: string, obsType: string, customObs: string }>>({});
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
  }, [headers]);

  const cargarPorGestionar = useCallback(async () => {
    if (!user?.puede_gestionar_pv) return;
    try {
      const { data } = await axios.get(`${API}/api/pedidos-pv/por-gestionar`, { headers });
      setPedidosPorGestionar(data);
    } catch { /* silencioso */ }
  }, [headers, user]);

  useEffect(() => { cargarDatos(); cargarPorGestionar(); }, [cargarDatos, cargarPorGestionar]);
  useDataChangedSocket('pedidos_pv', cargarDatos);

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
    setPasoCrear(1);
    setItemsNuevos([]);
    setModalCrear(true);
  };

  const COLORES_VIDRIO = ['Incoloro', 'Bronce', 'Bronce Oscuro', 'Gris', 'Gris Oscuro', 'Azul', 'Verde', 'Mate', 'Otro'];
  const PROVEEDORES_PV = ['Vitelsa', 'Templacol', 'Vidplex', 'Otros'];
  const PROD_OPCIONES = ['', 'PV', 'CAMARA', 'CR', 'CR-LAM', 'ESP', 'LAM', 'S/T', 'TE', 'TEM-MULTILAMINADO', 'TEM-LAM', 'N.A.'];

  const itemVacio = () => ({ tipo_vidrio: '', color: 'Incoloro', espesor: '6', ancho_mm: '', alto_mm: '', cantidad: 1, pulidos: '', pulidos_h: '', perforaciones: 0, boquetes: 0, descuentos: '', otros: '', prod: 'PV' });

  const cerrarModalCrear = () => {
    setModalCrear(false);
    setPasoCrear(1);
    setItemsNuevos([]);
    setBusquedaOdp('');
    setFormCrear({ odp_id: '', proveedor: '', sufijo: '', fecha_entrega_prometida: '', metraje_venta: '', espesor_vidrio: '', observaciones: '' });
  };

  const crearPedido = async () => {
    try {
      if (itemsNuevos.length > 0) {
        await axios.post(`${API}/api/odp/${formCrear.odp_id}/items`, { items: itemsNuevos }, { headers });
      }
      await axios.post(`${API}/api/pedidos-pv`, {
        odp_id: parseInt(formCrear.odp_id),
        proveedor: formCrear.proveedor,
        sufijo: formCrear.sufijo || null,
        fecha_entrega_prometida: formCrear.fecha_entrega_prometida || null,
        metraje_venta: formCrear.metraje_venta ? parseFloat(formCrear.metraje_venta) : null,
        espesor_vidrio: formCrear.espesor_vidrio || null,
        observaciones: formCrear.observaciones || null,
      }, { headers });
      cerrarModalCrear();
      cargarDatos();
      cargarPorGestionar();
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
      : { observacion: obsVerificacion, tipo_problema: tipoProblema || null };
    try {
      await axios.patch(`${API}/api/pedidos-pv/${modalVerificar.pedido.id}/${endpoint}`, body, { headers });
      setModalVerificar(null);
      setObsVerificacion('');
      setTipoProblema('');
      cargarDatos();
    } catch { setError('Error al procesar acción'); }
  };

  const accionReposicion = async () => {
    if (!modalReposicion) return;
    const endpoint = modalReposicion.tipo === 'gestionar' ? 'gestionar-reposicion' : 'registrar-reposicion';
    const body = modalReposicion.tipo === 'gestionar'
      ? { fecha_reposicion_prometida: fechaReposicion || null }
      : {};
    try {
      await axios.patch(`${API}/api/pedidos-pv/${modalReposicion.pedido.id}/${endpoint}`, body, { headers });
      setModalReposicion(null);
      setFechaReposicion('');
      cargarDatos();
    } catch { setError('Error al procesar reposición'); }
  };

  const asignarItemsPV = async () => {
    if (!modalGestionar || itemsSeleccionados.length === 0) return;
    setSavingGestionar(true);
    try {
      const items_data = itemsSeleccionados.map(id => {
        const extra = itemsExtras[id] || { dt: '', obsType: '', customObs: '' };
        const baseObs = extra.obsType === 'Otros' ? extra.customObs : extra.obsType;
        return {
          id,
          dt: extra.dt,
          observaciones_pv: baseObs,
        };
      });
      await axios.patch(`${API}/api/pedidos-pv/${modalGestionar.id}/asignar-items`,
        { odp_item_ids: itemsSeleccionados, items_data }, { headers });
      setModalGestionar(null);
      setItemsSeleccionados([]);
      setItemsExtras({});
      await cargarDatos();
      await cargarPorGestionar();
      setTab(0); // Redirigir a Gestión PV
    } catch { setError('Error al asignar ítems al pedido PV'); }
    finally { setSavingGestionar(false); }
  };

  const actualizarCampo = async (id: number, field: string, value: unknown) => {
    setSavingField({ id, field });
    try {
      await axios.patch(`${API}/api/pedidos-pv/${id}`, { [field]: value }, { headers });
      setPedidosSistema(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
    } catch { setError(`Error al actualizar ${field}`); }
    finally { setSavingField(null); }
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

  const descargarExcelPedido = async (pedido: PedidoPV) => {
    if (!pedido.odp_id) return;
    setExcelLoadingId(pedido.id);
    try {
      const resp = await axios.get(`${API}/api/pedidos-pv/${pedido.id}/excel`, {
        headers,
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([resp.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `VITELSA-${pedido.numero_pedido}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Error al generar el Excel del pedido');
    } finally {
      setExcelLoadingId(null);
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
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @page { size: A4 portrait; margin: 5mm; }
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
          {/* ═══════════════════════════ TAB 0 — GESTIÓN PV ═══════════════════════════ */}
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
                        <TableCell>Color</TableCell>
                        <TableCell>Pedido</TableCell>
                        <TableCell>ODP</TableCell>
                        <TableCell>Fecha ODP</TableCell>
                        <TableCell>Cliente</TableCell>
                        <TableCell>Asesor</TableCell>
                        <TableCell>Proveedor</TableCell>
                        <TableCell>Estado</TableCell>
                        <TableCell>Envío</TableCell>
                        <TableCell>Entrega Prometida</TableCell>
                        <TableCell>Llegada</TableCell>
                        <TableCell align="center">Días tránsito</TableCell>
                        <TableCell>Espesor</TableCell>
                        <TableCell align="right">m²</TableCell>
                        <TableCell sx={{ minWidth: 140 }}>Observaciones</TableCell>
                        <TableCell align="right">Acciones</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {pedidosPaginados.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={17} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                            No hay pedidos con los filtros seleccionados
                          </TableCell>
                        </TableRow>
                      )}
                      {pedidosPaginados.map((p) => {
                        const cfg = ESTADO_CONFIG[p.estado] ?? ESTADO_CONFIG['PENDIENTE'];
                        const retrasado = p.dias_diferencia !== null && p.dias_diferencia < 0;
                        const barColor = getBarColor(p);
                        const clienteNombre = p.odp?.cliente?.nombre_razon_social || p.nombre_cliente_excel || '—';

                        const diasTransito = calcDiasTransito(p);
                        const espesorResumen = calcEspesorResumen(p);
                        const isEditingObs = editingObs?.id === p.id;

                        return (
                          <TableRow key={p.id} hover sx={{
                            '&:hover': { bgcolor: p.color_fila ? `${p.color_fila}50` : 'action.hover' },
                            bgcolor: p.color_fila ? `${p.color_fila}28` : undefined,
                          }}>
                            {/* Barra de color lateral */}
                            <TableCell sx={{ width: 4, p: 0, bgcolor: barColor }} />
                            {/* Color de fila */}
                            <TableCell sx={{ p: 0.5 }}>
                              <Stack direction="row" gap={0.4} flexWrap="wrap" sx={{ maxWidth: 90 }}>
                                {COLOR_PALETTE.map(c => (
                                  <Tooltip key={c.value} title={c.label} placement="top">
                                    <Box
                                      onClick={() => actualizarCampo(p.id, 'color_fila', p.color_fila === c.value ? null : c.value)}
                                      sx={{
                                        width: 14, height: 14, borderRadius: '50%', bgcolor: c.value, cursor: 'pointer',
                                        border: p.color_fila === c.value ? '2px solid #000' : '2px solid transparent',
                                        opacity: savingField?.id === p.id && savingField.field === 'color_fila' ? 0.5 : 1,
                                        '&:hover': { transform: 'scale(1.3)' }, transition: 'transform 0.1s',
                                      }}
                                    />
                                  </Tooltip>
                                ))}
                              </Stack>
                            </TableCell>
                            {/* Pedido */}
                            <TableCell>
                              <Typography fontWeight={700} fontSize={13}>{p.numero_pedido}</Typography>
                              {p.estado === 'LLEGADO' && p.estado_reposicion === 'REPUESTO' && (
                                <Chip label="Reposición · pendiente verificar" size="small" sx={{ fontSize: 10, height: 16, bgcolor: '#fff8e1', color: '#f57f17', mt: 0.3 }} />
                              )}
                              {p.tuvo_problema && p.estado !== 'PROBLEMA' && p.estado_reposicion !== 'REPUESTO' && (
                                <Typography variant="caption" color="error.main">Con problema previo</Typography>
                              )}
                              {p.estado === 'PROBLEMA' && (
                                <Stack direction="row" gap={0.5} mt={0.3} flexWrap="wrap">
                                  {p.tipo_problema && (
                                    <Chip label={p.tipo_problema} size="small" color="error" sx={{ fontSize: 10, height: 16 }} />
                                  )}
                                  {!p.estado_reposicion && (
                                    <Chip label="Sin gestión" size="small" sx={{ fontSize: 10, height: 16, bgcolor: '#ffebee', color: '#c62828' }} />
                                  )}
                                  {p.estado_reposicion === 'EN_GESTION' && (
                                    <Chip label="En gestión" size="small" sx={{ fontSize: 10, height: 16, bgcolor: '#fff3e0', color: '#e65100' }} />
                                  )}
                                  {p.estado_reposicion === 'REPUESTO' && (
                                    <Chip label="Repuesto âœ“" size="small" sx={{ fontSize: 10, height: 16, bgcolor: '#e8f5e9', color: '#2e7d32' }} />
                                  )}
                                  {p.fecha_reposicion_prometida && p.estado_reposicion === 'EN_GESTION' && (
                                    <Typography variant="caption" color="text.secondary" fontSize={10}>
                                      Reposición: {fmtFecha(p.fecha_reposicion_prometida)}
                                    </Typography>
                                  )}
                                </Stack>
                              )}
                            </TableCell>
                            {/* ODP */}
                            <TableCell sx={{ fontSize: 13, fontWeight: 600, color: 'primary.main', cursor: p.odp_id ? 'pointer' : 'default', textDecoration: p.odp_id ? 'underline' : 'none' }}
                              onClick={() => p.odp_id && setFichaOdpId(p.odp_id)}>
                              {p.odp?.numero_odp || '—'}
                            </TableCell>
                            {/* Fecha ODP */}
                            <TableCell sx={{ fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                              {p.odp?.fecha_creacion ? fmtFecha(p.odp.fecha_creacion) : '—'}
                            </TableCell>
                            {/* Cliente */}
                            <TableCell sx={{ maxWidth: 180 }}>
                              <Tooltip title={clienteNombre} placement="top">
                                <Typography fontSize={13} noWrap>{clienteNombre}</Typography>
                              </Tooltip>
                            </TableCell>
                            {/* Asesor */}
                            <TableCell sx={{ fontSize: 12, color: 'text.secondary' }}>
                              {p.odp?.asesor?.nombre_completo || '—'}
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
                            {/* Días tránsito (llegada - envío) */}
                            <TableCell align="center">
                              {diasTransito !== null ? (
                                <Typography fontWeight={700} fontSize={13} color="text.primary">
                                  {diasTransito}
                                </Typography>
                              ) : '—'}
                            </TableCell>
                            {/* Espesor */}
                            <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                              <Typography fontSize={12} fontWeight={600}>{espesorResumen}</Typography>
                            </TableCell>
                            {/* m² */}
                            <TableCell align="right" sx={{ fontSize: 12 }}>
                              {(() => {
                                const items = p.items_asignados || [];
                                if (items.length > 0) {
                                  const total = items.reduce((acc, it) => {
                                    const ancho = Number(it.ancho_mm) || 0;
                                    const alto = Number(it.alto_mm) || 0;
                                    const cant = Number(it.cantidad) || 1;
                                    return acc + (ancho * alto / 1_000_000) * cant;
                                  }, 0);
                                  return <Typography fontWeight={600} fontSize={12} color="primary.main">{total.toFixed(3)}</Typography>;
                                }
                                return p.metraje_venta ? toFloat(p.metraje_venta).toFixed(2) : '—';
                              })()}
                            </TableCell>
                            {/* Observaciones (inline editable) */}
                            <TableCell sx={{ minWidth: 140 }}>
                              {isEditingObs ? (
                                <input
                                  autoFocus
                                  style={{ fontSize: 12, padding: '2px 4px', borderRadius: 4, border: '1px solid #1976d2', width: '100%', outline: 'none' }}
                                  value={editingObs.value}
                                  onChange={(e) => setEditingObs({ id: p.id, value: e.target.value })}
                                  onBlur={() => {
                                    actualizarCampo(p.id, 'observaciones', editingObs.value || null);
                                    setEditingObs(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') { e.currentTarget.blur(); }
                                    if (e.key === 'Escape') { setEditingObs(null); }
                                  }}
                                />
                              ) : (
                                <Tooltip title={p.observaciones || 'Clic para editar'} placement="top">
                                  <Typography
                                    fontSize={12} noWrap
                                    onClick={() => setEditingObs({ id: p.id, value: p.observaciones || '' })}
                                    sx={{ cursor: 'pointer', color: p.observaciones ? 'text.primary' : 'text.disabled', '&:hover': { textDecoration: 'underline' } }}
                                  >
                                    {p.observaciones || '+ obs.'}
                                  </Typography>
                                </Tooltip>
                              )}
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
                                onProblema={() => { setModalVerificar({ pedido: p, tipo: 'problema' }); setObsVerificacion(''); setTipoProblema(''); }}
                                onGestionarReposicion={() => { setModalReposicion({ pedido: p, tipo: 'gestionar' }); setFechaReposicion(''); }}
                                onRegistrarReposicion={() => setModalReposicion({ pedido: p, tipo: 'registrar' })}
                                onDetalle={() => setModalDetalle(p)}
                                onImprimir={() => imprimirPedido(p)}
                                onDescargarExcel={() => descargarExcelPedido(p)}
                                printLoading={printLoadingId === p.id}
                                excelLoading={excelLoadingId === p.id}
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

          {/* ═══════════════════════════ TAB 2 — POR GESTIONAR ═══════════════════════════ */}
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
                              <Typography fontWeight={700} fontSize={15} sx={{ cursor: pv.odp_id ? 'pointer' : 'default', color: 'primary.main', '&:hover': { textDecoration: pv.odp_id ? 'underline' : 'none' } }}
                                onClick={() => pv.odp_id && setFichaOdpId(pv.odp_id)}>
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

          {/* ═══════════════════════════ TAB 1 — VISTA EXCEL ═══════════════════════════ */}
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
      <Dialog open={modalCrear} onClose={cerrarModalCrear} maxWidth={pasoCrear === 2 ? 'md' : 'xs'} fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography fontWeight={700} fontSize={16}>
              Nuevo Pedido PV — #{siguienteNumero}
            </Typography>
            <Stack direction="row" gap={0.5}>
              {[1, 2].map(n => (
                <Box key={n} sx={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, bgcolor: pasoCrear === n ? 'primary.main' : 'action.disabledBackground', color: pasoCrear === n ? 'white' : 'text.disabled' }}>{n}</Box>
              ))}
            </Stack>
          </Stack>
        </DialogTitle>
        <DialogContent>

          {/* ── Paso 1: ODP + Proveedor ── */}
          {pasoCrear === 1 && (
            <Stack gap={2} mt={1}>
              <TextField
                size="small" fullWidth placeholder="Buscar ODP por número o cliente..."
                value={busquedaOdp}
                onChange={(e) => setBusquedaOdp(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 16, color: 'text.secondary' }} /></InputAdornment> }}
              />
              <FormControl fullWidth size="small">
                <InputLabel>ODP *</InputLabel>
                <Select value={formCrear.odp_id} label="ODP *"
                  onChange={(e) => setFormCrear(f => ({ ...f, odp_id: String(e.target.value) }))}>
                  {odps
                    .filter((o: any) => {
                      const q = busquedaOdp.toLowerCase();
                      return !q || o.numero_odp?.toLowerCase().includes(q) || o.cliente?.nombre_razon_social?.toLowerCase().includes(q);
                    })
                    .map((o: any) => (
                      <MenuItem key={o.id} value={o.id}>
                        <Stack>
                          <Typography fontSize={13} fontWeight={700}>{o.numero_odp}</Typography>
                          <Typography fontSize={11} color="text.secondary">{o.cliente?.nombre_razon_social ?? ''}</Typography>
                        </Stack>
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
              <FormControl fullWidth size="small">
                <InputLabel>Proveedor *</InputLabel>
                <Select value={formCrear.proveedor} label="Proveedor *"
                  onChange={(e) => setFormCrear(f => ({ ...f, proveedor: e.target.value }))}>
                  <MenuItem value=""><em>Seleccionar...</em></MenuItem>
                  {PROVEEDORES_PV.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                </Select>
              </FormControl>
            </Stack>
          )}

          {/* ── Paso 2: Ítems con formato ODPForm ── */}
          {pasoCrear === 2 && (
            <Box mt={1}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2} pb={1} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography fontWeight={700} fontSize={14} color="text.primary">
                  Ítems o Cristales
                </Typography>
                <Button size="small" variant="contained" color="inherit"
                  sx={{ bgcolor: 'grey.900', color: 'white', '&:hover': { bgcolor: 'grey.800' }, fontSize: 12 }}
                  startIcon={<Add sx={{ fontSize: 14 }} />}
                  onClick={() => setItemsNuevos(prev => [...prev, itemVacio()])}>
                  Agregar Cristal
                </Button>
              </Stack>

              {itemsNuevos.length === 0 && (
                <Box sx={{ py: 4, textAlign: 'center', color: 'text.disabled', fontSize: 13 }}>
                  Sin ítems. Haz clic en "+ Agregar Cristal" para comenzar.
                </Box>
              )}

              <Stack gap={2}>
                {itemsNuevos.map((it, idx) => {
                  const upd = (field: string, val: any) => setItemsNuevos(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
                  const mts = (parseFloat(it.ancho_mm) > 0 && parseFloat(it.alto_mm) > 0)
                    ? ((parseFloat(it.ancho_mm) / 1000) * (parseFloat(it.alto_mm) / 1000)).toFixed(3) : '';
                  return (
                    <Paper key={idx} variant="outlined" sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2 }}>
                      <Stack direction="row" flexWrap="wrap" gap={1.5} alignItems="flex-start">
                        {/* COLOR */}
                        <Box sx={{ minWidth: 120 }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'text.secondary', fontSize: 10, letterSpacing: 0.5 }}>Color</Typography>
                          <Select size="small" fullWidth value={it.color} onChange={(e) => upd('color', e.target.value)} sx={{ mt: 0.5, fontSize: 13 }}>
                            {COLORES_VIDRIO.map(c => <MenuItem key={c} value={c} sx={{ fontSize: 13 }}>{c}</MenuItem>)}
                          </Select>
                          {it.color === 'Otro' && (
                            <TextField size="small" fullWidth placeholder="Especificar..." sx={{ mt: 0.5 }} value={it.tipo_vidrio} onChange={(e) => upd('tipo_vidrio', e.target.value)} inputProps={{ style: { fontSize: 12 } }} />
                          )}
                        </Box>
                        {/* ESP */}
                        <Box sx={{ width: 70 }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'text.secondary', fontSize: 10, letterSpacing: 0.5 }}>Esp. (mm)</Typography>
                          <TextField size="small" fullWidth value={it.espesor} onChange={(e) => upd('espesor', e.target.value)} sx={{ mt: 0.5 }} inputProps={{ style: { fontSize: 13 } }} />
                        </Box>
                        {/* MEDIDAS */}
                        <Box sx={{ minWidth: 140, borderLeft: '1px solid', borderColor: 'divider', pl: 1.5 }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'text.secondary', fontSize: 10, letterSpacing: 0.5 }}>Medidas (mm)</Typography>
                          <Stack direction="row" gap={0.5} alignItems="center" mt={0.5}>
                            <TextField size="small" type="number" placeholder="Ancho" value={it.ancho_mm}
                              onChange={(e) => upd('ancho_mm', e.target.value)}
                              sx={{ width: 65 }} inputProps={{ style: { fontSize: 13 }, min: 0 }} />
                            <Typography color="text.secondary" fontSize={13}>×</Typography>
                            <TextField size="small" type="number" placeholder="Alto" value={it.alto_mm}
                              onChange={(e) => upd('alto_mm', e.target.value)}
                              sx={{ width: 65 }} inputProps={{ style: { fontSize: 13 }, min: 0 }} />
                          </Stack>
                        </Box>
                        {/* CANT */}
                        <Box sx={{ width: 60, borderLeft: '1px solid', borderColor: 'divider', pl: 1.5 }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'text.secondary', fontSize: 10, letterSpacing: 0.5 }}>Cant.</Typography>
                          <TextField size="small" type="number" fullWidth value={it.cantidad}
                            onChange={(e) => upd('cantidad', Math.max(1, parseInt(e.target.value) || 1))}
                            sx={{ mt: 0.5 }} inputProps={{ style: { fontSize: 13 }, min: 1 }} />
                        </Box>
                        {/* ACABADOS */}
                        <Box sx={{ flex: 1, minWidth: 260, borderLeft: '1px solid', borderColor: 'divider', pl: 1.5 }}>
                          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
                            {[
                              { label: 'PUL A*', field: 'pulidos', type: 'number' },
                              { label: 'PUL H*', field: 'pulidos_h', type: 'number' },
                              { label: 'Perf.', field: 'perforaciones', type: 'number' },
                              { label: 'Boq.', field: 'boquetes', type: 'number' },
                              { label: 'Des.', field: 'descuentos', type: 'text' },
                              { label: 'Otros**', field: 'otros', type: 'text' },
                            ].map(({ label, field, type }) => (
                              <Box key={field}>
                                <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'text.secondary', fontSize: 10, letterSpacing: 0.5 }}>{label}</Typography>
                                <TextField size="small" fullWidth type={type} value={(it as any)[field]}
                                  onChange={(e) => upd(field, type === 'number' ? (parseInt(e.target.value) || 0) : e.target.value)}
                                  sx={{ mt: 0.5 }} inputProps={{ style: { fontSize: 12, textAlign: type === 'number' ? 'center' : 'left' }, min: 0 }} />
                              </Box>
                            ))}
                            {/* MTS PT */}
                            <Box>
                              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'text.secondary', fontSize: 10, letterSpacing: 0.5 }}>MTS PT</Typography>
                              <TextField size="small" fullWidth value={mts} placeholder="m²" disabled
                                sx={{ mt: 0.5, '& .MuiInputBase-input.Mui-disabled': { WebkitTextFillColor: '#94a3b8', textAlign: 'center', fontSize: 12 } }} />
                            </Box>
                            {/* PROD */}
                            <Box>
                              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'text.secondary', fontSize: 10, letterSpacing: 0.5 }}>PROD</Typography>
                              <Select size="small" fullWidth value={it.prod} onChange={(e) => upd('prod', e.target.value)} sx={{ mt: 0.5, fontSize: 12 }}>
                                {PROD_OPCIONES.map(p => <MenuItem key={p} value={p} sx={{ fontSize: 12 }}>{p || '—'}</MenuItem>)}
                              </Select>
                            </Box>
                          </Box>
                        </Box>
                        {/* DELETE */}
                        <Box sx={{ pt: 2.5 }}>
                          <IconButton size="small" onClick={() => setItemsNuevos(prev => prev.filter((_, i) => i !== idx))}
                            sx={{ color: 'error.light', '&:hover': { color: 'error.main', bgcolor: 'error.50' } }}>
                            <Cancel />
                          </IconButton>
                        </Box>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          {pasoCrear === 1 && (
            <>
              <Button onClick={cerrarModalCrear}>Cancelar</Button>
              <Button variant="outlined" onClick={() => { setPasoCrear(2); setItemsNuevos([itemVacio()]); }}
                disabled={!formCrear.odp_id || !formCrear.proveedor}>
                Agregar ítems nuevos →
              </Button>
              <Button variant="contained" onClick={crearPedido} disabled={!formCrear.odp_id || !formCrear.proveedor}>
                Crear sin ítems nuevos
              </Button>
            </>
          )}
          {pasoCrear === 2 && (
            <>
              <Button onClick={() => setPasoCrear(1)}>← Atrás</Button>
              <Button variant="contained" onClick={crearPedido} disabled={itemsNuevos.length === 0}>
                Crear pedido ({itemsNuevos.length} ítem{itemsNuevos.length !== 1 ? 's' : ''})
              </Button>
            </>
          )}
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
          {modalVerificar?.tipo === 'verificar' ? '✅ Verificar vidrios' : 'âš ï¸ Marcar problema'}
          {' — PV '}{modalVerificar?.pedido.numero_pedido}
        </DialogTitle>
        <DialogContent>
          <Stack gap={2} mt={1}>
            {modalVerificar?.tipo === 'problema' && (
              <>
                <Alert severity="warning">
                  Quedará en estado <strong>Problema</strong> hasta que se gestione la reposición.
                </Alert>
                <FormControl size="small" fullWidth>
                  <InputLabel>Tipo de problema *</InputLabel>
                  <Select value={tipoProblema} label="Tipo de problema *"
                    onChange={(e) => setTipoProblema(e.target.value)}>
                    <MenuItem value="INCOMPLETO">Incompleto (faltan piezas)</MenuItem>
                    <MenuItem value="DAÑADO">Dañado / Rayado</MenuItem>
                    <MenuItem value="OTRO">Otro</MenuItem>
                  </Select>
                </FormControl>
              </>
            )}
            <TextField
              label={modalVerificar?.tipo === 'verificar' ? 'Observación (opcional)' : 'Descripción del problema *'}
              size="small" fullWidth multiline rows={3}
              value={obsVerificacion} onChange={(e) => setObsVerificacion(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setModalVerificar(null); setTipoProblema(''); }}>Cancelar</Button>
          <Button variant="contained"
            color={modalVerificar?.tipo === 'verificar' ? 'success' : 'error'}
            onClick={accionVerificar}
            disabled={modalVerificar?.tipo === 'problema' && (!obsVerificacion || !tipoProblema)}>
            {modalVerificar?.tipo === 'verificar' ? 'Verificado correcto' : 'Confirmar problema'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Modal: Gestionar reposición ──────────────────────────────────────── */}
      <Dialog open={!!modalReposicion} onClose={() => setModalReposicion(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {modalReposicion?.tipo === 'gestionar' ? '🔄 Gestionar reposición' : '✅ Registrar llegada del vidrio repuesto'}
          {' — PV '}{modalReposicion?.pedido.numero_pedido}
        </DialogTitle>
        <DialogContent>
          <Stack gap={2} mt={1}>
            {modalReposicion?.tipo === 'gestionar' && (
              <>
                <Alert severity="info">
                  Marca que se está gestionando la reposición con el proveedor.
                </Alert>
                <TextField
                  label="Fecha prometida de reposición"
                  type="date" size="small" fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={fechaReposicion}
                  onChange={(e) => setFechaReposicion(e.target.value)}
                  helperText="Opcional — cuándo promete el proveedor entregar" />
              </>
            )}
            {modalReposicion?.tipo === 'registrar' && (
              <Alert severity="success">
                El vidrio llegó. El pedido volverá a <strong>LLEGADO</strong> para ser verificado.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setModalReposicion(null); setFechaReposicion(''); }}>Cancelar</Button>
          <Button variant="contained"
            color={modalReposicion?.tipo === 'gestionar' ? 'warning' : 'success'}
            onClick={accionReposicion}>
            {modalReposicion?.tipo === 'gestionar' ? 'Confirmar gestión' : 'Confirmar llegada'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Modal: Asignar ítems al PV ───────────────────────────────────────── */}
      <Dialog open={!!modalGestionar} onClose={() => { setModalGestionar(null); setItemsSeleccionados([]); setItemsExtras({}); }} maxWidth="lg" fullWidth>
        <DialogTitle>
          Asignar ítems — PV {modalGestionar?.numero_pedido} &nbsp;·&nbsp; {modalGestionar?.odp?.numero_odp}
        </DialogTitle>
        <DialogContent>
          {modalGestionar && (() => {
            const odp = modalGestionar.odp;
            const items: any[] = odp?.items || [];
            const itemsLibres = items.filter((it: any) => !it.pedido_pv_id || it.pedido_pv_id === modalGestionar.id);
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
                              checked={itemsLibres.length > 0 && itemsSeleccionados.length === itemsLibres.length}
                              onChange={(e) => setItemsSeleccionados(e.target.checked ? itemsLibres.map((it: any) => it.id) : [])}
                            />
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>#</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Tipo</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Color</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Esp.</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>An x Al</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Cant.</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: 12, minWidth: 60 }}>DT</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: 12, minWidth: 160 }}>Observación PV</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Obs. Orig.</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {items.map((it: any, idx: number) => {
                          const enOtroPV = it.pedido_pv_id !== null && it.pedido_pv_id !== modalGestionar.id;
                          const seleccionado = !enOtroPV && itemsSeleccionados.includes(it.id);
                          const extras = itemsExtras[it.id] || { dt: '', obsType: '', customObs: '' };

                          const toggleRow = () => {
                            if (enOtroPV) return;
                            setItemsSeleccionados(prev => prev.includes(it.id) ? prev.filter(id => id !== it.id) : [...prev, it.id]);
                          };

                          return (
                            <TableRow
                              key={it.id}
                              selected={seleccionado}
                              sx={{
                                opacity: enOtroPV ? 0.5 : 1,
                                bgcolor: enOtroPV ? 'grey.50' : undefined,
                                '&:hover': { bgcolor: enOtroPV ? 'grey.50' : 'action.hover' },
                              }}
                            >
                              <TableCell padding="checkbox" onClick={toggleRow} sx={{ cursor: enOtroPV ? 'default' : 'pointer' }}>
                                <input type="checkbox" checked={seleccionado} disabled={enOtroPV} readOnly={!enOtroPV} />
                              </TableCell>
                              <TableCell sx={{ fontSize: 12 }} onClick={toggleRow}>{idx + 1}</TableCell>
                              <TableCell sx={{ fontSize: 12 }} onClick={toggleRow}>
                                <Stack direction="row" gap={0.5} alignItems="center">
                                  <span>{it.prod || '—'}</span>
                                  {enOtroPV && (
                                    <Chip label="En otro PV" size="small" sx={{ fontSize: 9, height: 16, bgcolor: '#eeeeee', color: '#757575' }} />
                                  )}
                                </Stack>
                              </TableCell>
                              <TableCell sx={{ fontSize: 12 }} onClick={toggleRow}>{it.color || '—'}</TableCell>
                              <TableCell sx={{ fontSize: 12 }} onClick={toggleRow}>{it.espesor || '—'}</TableCell>
                              <TableCell sx={{ fontSize: 12 }} onClick={toggleRow}>{it.ancho_mm} x {it.alto_mm}</TableCell>
                              <TableCell sx={{ fontSize: 12 }} onClick={toggleRow}>{it.cantidad || 1}</TableCell>
                              <TableCell>
                                <input
                                  type="text"
                                  placeholder="DT..."
                                  disabled={!seleccionado}
                                  value={extras.dt}
                                  style={{ fontSize: 12, padding: 4, borderRadius: 4, border: '1px solid #ccc', width: '60px' }}
                                  onChange={(e) => setItemsExtras(prev => ({ ...prev, [it.id]: { ...extras, dt: e.target.value } }))}
                                />
                              </TableCell>
                              <TableCell>
                                <Stack gap={1}>
                                  <select
                                    disabled={!seleccionado}
                                    style={{ fontSize: 12, padding: 4, borderRadius: 4, border: '1px solid #ccc' }}
                                    value={extras.obsType}
                                    onChange={(e) => setItemsExtras(prev => ({ ...prev, [it.id]: { ...extras, obsType: e.target.value } }))}
                                  >
                                    <option value="">(Ninguna)</option>
                                    <option value="Sello en el canto">Sello en el canto</option>
                                    <option value="Otros">Otros...</option>
                                  </select>
                                  {extras.obsType === 'Otros' && (
                                    <input
                                      type="text"
                                      placeholder="Especifique..."
                                      style={{ fontSize: 12, padding: 4, borderRadius: 4, border: '1px solid #ccc' }}
                                      value={extras.customObs}
                                      onChange={(e) => setItemsExtras(prev => ({ ...prev, [it.id]: { ...extras, customObs: e.target.value } }))}
                                    />
                                  )}
                                </Stack>
                              </TableCell>
                              <TableCell sx={{ fontSize: 12, maxWidth: 100 }} onClick={toggleRow}>
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
                  {itemsSeleccionados.length} de {itemsLibres.length} ítems disponibles seleccionados
                  {items.length !== itemsLibres.length && (
                    <span style={{ color: '#9e9e9e' }}> · {items.length - itemsLibres.length} ya asignados a otro pedido</span>
                  )}
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
                  ['Tuvo problema', modalDetalle.tuvo_problema ? 'âš ï¸ Sí' : 'No'],
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

      {fichaOdpId && <ODPFichaModal odpId={fichaOdpId} onClose={() => setFichaOdpId(null)} />}
    </Box>
  );
};

export default PedidosPVPage;
