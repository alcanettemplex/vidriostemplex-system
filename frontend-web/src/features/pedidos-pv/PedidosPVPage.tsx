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
import * as XLSX from 'xlsx';
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
      const { data: odp } = await axios.get(`${API}/api/odp/${pedido.odp_id}`, { headers });
      generarExcelVitelsa(pedido, odp);
    } catch {
      setError('Error al generar el Excel del pedido');
    } finally {
      setExcelLoadingId(null);
    }
  };

  // Generación completa del Excel con formato idéntico al imprimible VITELSA
  // Columnas A-Q (17 cols, índices 0-16), 0-based rows
  const generarExcelVitelsa = (pedido: PedidoPV, odp: any) => {
    const rawItems: any[] = (pedido as any).items_asignados?.length
      ? (pedido as any).items_asignados
      : odp?.items || odp?.odp_items || [];
    const items12 = Array.from({ length: 12 }, (_: unknown, i: number) => rawItems[i] || null);

    const fmtD = (ts: string | null) => {
      if (!ts) return '';
      try { return new Date(ts).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
      catch { return ''; }
    };
    const obra = [odp?.cliente?.nombre_razon_social, odp?.numero_odp, odp?.asesor?.nombre_completo].filter(Boolean).join(' — ');

    // ── Paleta de estilos ─────────────────────────────────────────────────
    const thin   = { style: 'thin',   color: { rgb: 'FF000000' } };
    const medium = { style: 'medium', color: { rgb: 'FF000000' } };
    const bThin  = { top: thin, bottom: thin, left: thin, right: thin };
    const bMed   = { top: medium, bottom: medium, left: medium, right: medium };
    const bMedL  = { top: medium, bottom: medium, left: medium, right: thin };
    const bMedR  = { top: medium, bottom: medium, left: thin, right: medium };

    const BASE = 'Arial';
    const f = (sz: number, bold = false, color = 'FF000000') =>
      ({ name: BASE, sz, bold, color: { rgb: color } });

    const sTitle: any = {
      font: f(15, true), fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFFFF' } },
      alignment: { horizontal: 'center', vertical: 'center' }, border: bMed,
    };
    const sOrderNum: any = {
      font: f(10, true), fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFFFF' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: bMed,
    };
    const sLogo: any = {
      font: f(11, true), fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFFFF' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: bMed,
    };
    const sSmall: any = {
      font: f(7), fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFFFF' } },
      alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: bThin,
    };
    const sVR03: any = {
      font: f(8, true), fill: { patternType: 'solid', fgColor: { rgb: 'FFE8E8E8' } },
      alignment: { horizontal: 'center', vertical: 'center' }, border: bThin,
    };
    const sLabel: any = {
      font: f(8, true), fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFFFF' } },
      alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: bThin,
    };
    const sValue: any = {
      font: f(8), fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFFFF' } },
      alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: bThin,
    };
    const sCenter: any = {
      font: f(8), fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFFFF' } },
      alignment: { horizontal: 'center', vertical: 'center' }, border: bThin,
    };
    const sNumBig: any = {
      font: f(13, true), fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFFFF' } },
      alignment: { horizontal: 'center', vertical: 'center' }, border: bThin,
    };
    const sColHeader: any = {
      font: f(7, true), fill: { patternType: 'solid', fgColor: { rgb: 'FFE8E8E8' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: bThin,
    };
    const sData: any = {
      font: f(8), fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFFFF' } },
      alignment: { horizontal: 'center', vertical: 'center' }, border: bThin,
    };
    const sDataL: any = {
      font: f(8), fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFFFF' } },
      alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: bThin,
    };
    const sObs: any = {
      font: f(6.5), fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFFFF' } },
      alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: bThin,
    };
    const sFooter: any = {
      font: f(7), fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFFFF' } },
      alignment: { horizontal: 'center', vertical: 'center' }, border: { top: thin },
    };

    // ── Helpers ───────────────────────────────────────────────────────────
    const ws: any = {};
    const merges: any[] = [];

    // Convierte índice de columna a letra (0→A, 1→B, ..., 16→Q)
    const colLetter = (c: number) => {
      let s = '';
      let n = c + 1;
      while (n > 0) { s = String.fromCharCode(64 + (n % 26 || 26)) + s; n = Math.floor((n - 1) / 26); }
      return s;
    };
    const ref = (col: number, row: number) => `${colLetter(col)}${row + 1}`;

    const sc = (col: number, row: number, val: any, style: any) => {
      const t = typeof val === 'number' ? 'n' : 's';
      ws[ref(col, row)] = { v: val, t, s: style };
    };
    // Celda vacía con borde (para celdas interiores de rangos fusionados)
    const se = (col: number, row: number, style: any) => {
      ws[ref(col, row)] = { v: '', t: 's', s: style };
    };
    const merge = (c1: number, r1: number, c2: number, r2: number) => {
      merges.push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
    };

    // ── LAYOUT: 17 columnas (A=0 … Q=16) ─────────────────────────────────
    // Secciones superiores: Logo A:C(0-2) | Título D:L(3-11) | No. M:Q(12-16)

    // ── FILA 0-2: ENCABEZADO ─────────────────────────────────────────────
    // Logo / emisor (A1:C3)
    sc(0, 0, 'VIDRIOS\nTEMPLEX S.A.S', sLogo); merge(0, 0, 2, 2);
    [1,2].forEach(c => [0,1,2].forEach(r => { if (c !== 0 || r !== 0) se(c, r, sLogo); }));

    // Título central
    sc(3, 0, 'ORDEN DE PEDIDO', sTitle); merge(3, 0, 11, 0);
    for (let c = 4; c <= 11; c++) se(c, 0, sTitle);

    // VR03 (D2:E2)
    sc(3, 1, 'VR03', sVR03); merge(3, 1, 4, 1);
    se(4, 1, sVR03);
    // Fecha vigencia (F2:L2)
    sc(5, 1, 'FECHA DE VIGENCIA: 8 De Mayo Del 2023   VERSION: 03', sSmall);
    merge(5, 1, 11, 1);
    for (let c = 6; c <= 11; c++) se(c, 1, sSmall);

    // Formulario (D3:L3)
    sc(3, 2, 'Formulario de pedido de vidrio templado — VITELSA S.A.', sSmall);
    merge(3, 2, 11, 2);
    for (let c = 4; c <= 11; c++) se(c, 2, sSmall);

    // No. pedido (M1:Q3)
    sc(12, 0, `ORDEN DE PEDIDO No.`, sOrderNum); merge(12, 0, 16, 0);
    for (let c = 13; c <= 16; c++) se(c, 0, sOrderNum);
    sc(12, 1, pedido.numero_pedido || '', { ...sOrderNum, font: f(20, true) }); merge(12, 1, 16, 2);
    for (let c = 13; c <= 16; c++) { se(c, 1, sOrderNum); se(c, 2, sOrderNum); }
    se(12, 2, sOrderNum);

    // ── FILA 3: FECHA / NÚMERO ───────────────────────────────────────────
    sc(0, 3, 'FECHA:', sLabel); merge(0, 3, 1, 3); se(1, 3, sLabel);
    sc(2, 3, fmtD(pedido.creado_en), sValue); merge(2, 3, 5, 3);
    for (let c = 3; c <= 5; c++) se(c, 3, sValue);
    sc(6, 3, 'ORDEN DE PEDIDO No.', sLabel); merge(6, 3, 9, 3);
    for (let c = 7; c <= 9; c++) se(c, 3, sLabel);
    sc(10, 3, pedido.numero_pedido || '', sNumBig); merge(10, 3, 16, 3);
    for (let c = 11; c <= 16; c++) se(c, 3, sNumBig);

    // ── FILA 4: PEDIDO ───────────────────────────────────────────────────
    sc(0, 4, 'PEDIDO', sLabel);
    sc(1, 4, '☑', sCenter);
    sc(2, 4, 'SERVICIO DE TEMPLE', sValue); merge(2, 4, 7, 4);
    for (let c = 3; c <= 7; c++) se(c, 4, sValue);
    sc(8, 4, 'SERVIFLASH (+20%)', sValue); merge(8, 4, 16, 4);
    for (let c = 9; c <= 16; c++) se(c, 4, sValue);

    // ── FILAS 5-6: SERVICIOS ADICIONALES ────────────────────────────────
    sc(0, 5, '', sValue); merge(0, 5, 1, 5); se(1, 5, sValue);
    sc(2, 5, 'Servicios Adicionales', sValue); merge(2, 5, 16, 5);
    for (let c = 3; c <= 16; c++) se(c, 5, sValue);
    sc(0, 6, '', sValue); merge(0, 6, 1, 6); se(1, 6, sValue);
    sc(2, 6, 'CUALES:', sLabel); merge(2, 6, 16, 6);
    for (let c = 3; c <= 16; c++) se(c, 6, sLabel);

    // ── FILAS 7-9: DATOS SOLICITANTE ─────────────────────────────────────
    const solRows: [string, string | null, string, string][] = [
      ['NOMBRE O RAZÓN SOCIAL:', 'VIDRIOS TEMPLEX S.A.S', 'CC / NIT:', '900.192.869-0'],
      ['DIRECCIÓN:', 'CR 44 No. 41 43', 'CIUDAD:', 'MEDELLÍN'],
      ['RÉGIMEN: ☑ COMÚN  ☐ GRANDES CONTRIB.  ☐ SIMPLIFICADO', null, 'TELÉFONO:', '448 86 56'],
    ];
    solRows.forEach(([l1, v1, l2, v2], i) => {
      const r = 7 + i;
      if (i === 2) {
        sc(0, r, l1, sLabel); merge(0, r, 7, r);
        for (let c = 1; c <= 7; c++) se(c, r, sLabel);
      } else {
        sc(0, r, l1, sLabel); merge(0, r, 2, r);
        for (let c = 1; c <= 2; c++) se(c, r, sLabel);
        sc(3, r, v1 || '', sValue); merge(3, r, 7, r);
        for (let c = 4; c <= 7; c++) se(c, r, sValue);
      }
      sc(8, r, l2, sLabel); merge(8, r, 9, r); se(9, r, sLabel);
      sc(10, r, v2, sValue); merge(10, r, 16, r);
      for (let c = 11; c <= 16; c++) se(c, r, sValue);
    });

    // ── FILA 10: DIRECCIÓN ENVÍO / OBRA ──────────────────────────────────
    sc(0, 10, 'DIRECCIÓN DE ENVÍO', sLabel); merge(0, 10, 2, 10);
    for (let c = 1; c <= 2; c++) se(c, 10, sLabel);
    sc(3, 10, 'CR 44 No. 41 43', sValue); merge(3, 10, 7, 10);
    for (let c = 4; c <= 7; c++) se(c, 10, sValue);
    sc(8, 10, 'OBRA', sLabel); merge(8, 10, 9, 10); se(9, 10, sLabel);
    sc(10, 10, obra, sValue); merge(10, 10, 16, 10);
    for (let c = 11; c <= 16; c++) se(c, 10, sValue);

    // ── FILA 11: blank ───────────────────────────────────────────────────
    for (let c = 0; c <= 16; c++) se(c, 11, { fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFFFF' } } });

    // ── FILAS 12-13: CABECERA ÍTEMS ──────────────────────────────────────
    const H1 = 12; const H2 = 13;
    // Columnas que hacen rowspan=2
    [[0,'ÍTEM'],[1,'COLOR'],[2,'ESP\n(mm)'],[3,'CANT.'],[6,'DT'],[7,'PER'],[8,'BOQ'],[9,'DES'],[16,'ESPECIFICACIONES\nESPECIALES']]
      .forEach(([col, label]) => {
        sc(col as number, H1, label, sColHeader);
        merge(col as number, H1, col as number, H2);
        se(col as number, H2, sColHeader);
      });
    // MEDIDAS (colspan=2)
    sc(4, H1, 'MEDIDAS', sColHeader); merge(4, H1, 5, H1); se(5, H1, sColHeader);
    sc(4, H2, 'ANCHO (A)', sColHeader); sc(5, H2, 'ALTO (H)', sColHeader);
    // BPB (colspan=2)
    sc(10, H1, 'BPB', sColHeader); merge(10, H1, 11, H1); se(11, H1, sColHeader);
    sc(10, H2, 'ANCHO', sColHeader); sc(11, H2, 'ALTO', sColHeader);
    // BP MATE (colspan=2)
    sc(12, H1, 'BP MATE', sColHeader); merge(12, H1, 13, H1); se(13, H1, sColHeader);
    sc(12, H2, 'ANCHO', sColHeader); sc(13, H2, 'ALTO', sColHeader);
    // CHAFLÁN (colspan=2)
    sc(14, H1, 'CHAFLÁN', sColHeader); merge(14, H1, 15, H1); se(15, H1, sColHeader);
    sc(14, H2, 'ANCHO', sColHeader); sc(15, H2, 'ALTO', sColHeader);

    // ── FILAS 14-25: DATOS ÍTEMS ─────────────────────────────────────────
    items12.forEach((item: any, i: number) => {
      const r = 14 + i;
      const v = (x: any) => (x !== undefined && x !== null && x !== '') ? x : '';
      sc(0,  r, i + 1,                                                     sData);
      sc(1,  r, v(item?.color),                                             sDataL);
      sc(2,  r, v(item?.espesor),                                           sData);
      sc(3,  r, item?.cantidad !== undefined ? Number(item.cantidad) : '',   sData);
      sc(4,  r, item?.ancho_mm !== undefined ? Number(item.ancho_mm) : '',   sData);
      sc(5,  r, item?.alto_mm  !== undefined ? Number(item.alto_mm)  : '',   sData);
      sc(6,  r, v(item?.dt),                                                sData);
      sc(7,  r, v(item?.perforaciones),                                     sData);
      sc(8,  r, v(item?.boquetes),                                          sData);
      sc(9,  r, v(item?.descuentos),                                        sData);
      sc(10, r, v(item?.pulidos),                                           sData);
      sc(11, r, v(item?.pulidos_h),                                         sData);
      sc(12, r, '',                                                          sData);
      sc(13, r, '',                                                          sData);
      sc(14, r, '',                                                          sData);
      sc(15, r, '',                                                          sData);
      sc(16, r, v(item?.observaciones_pv || item?.otros || item?.accesorios), sDataL);
    });

    // ── OBSERVACIONES (texto legal) ───────────────────────────────────────
    const R_OBS = 27;
    sc(0, R_OBS, 'OBSERVACIONES:', { ...sLabel, font: f(8, true) });
    merge(0, R_OBS, 16, R_OBS);
    for (let c = 1; c <= 16; c++) se(c, R_OBS, sLabel);

    const legalLines = [
      '* EXPRESAMENTE AUTORIZO A VITELSA S.A., PARA QUE OBTENGA LAS INFORMACIONES Y REFERENCIAS RELATIVAS A MI PERSONA, MIS NOMBRES, APELLIDOS Y DOCUMENTO DE IDENTIFICACIÓN, A MI COMPORTAMIENTO Y CRÉDITO COMERCIAL, HÁBITOS DE PAGO, MANEJO DE MI(S) CUENTA(S) CORRIENTE(S) BANCARIA Y EN GENERAL, CUMPLIMIENTO DE OBLIGACIONES. ADEMÁS AUTORIZAMOS IRREVOCABLEMENTE PARA QUE EN EL EVENTO QUE INCUMPLAMOS UNA O CUALQUIERA DE LAS OBLIGACIONES CONTRAIDAS O QUE SE LLEGAREN A CONTRAER, NUESTROS NOMBRES, APELLIDOS Y DOCUMENTO DE IDENTIFICACIÓN, SE INCORPOREN A LOS ARCHIVOS DE DEUDORES MOROSOS DE LA ASOCIACIÓN BANCARIA O CUALQUIER OTRA ENTIDAD SIMILAR.',
      '* PARA LOS PEDIDOS ENVIADOS A PRODUCCIÓN DESPUÉS DE LAS 11:00 M, SE CONSIDERA COMO DÍA INICIAL EL SIGUIENTE DÍA HÁBIL.',
      '* EL PLAZO DE ENTREGA PARA EL SERVIFLASH ES DE 24 HORAS HÁBILES DE LUNES A VIERNES.',
      '* LA FORMA DE PAGO DEL SERVIFLASH ES 100% ANTICIPADO, CONSIGNAR EN LAS SIGUIENTES CUENTAS A NOMBRE DE VITELSA S.A.: BOGOTÁ CC CONVENIO 8830 N° 349-283-465 · BANCOLOMBIA AHORROS N° 102-025445-95 CONVENIO 18853 · BANCOLOMBIA CC N° 625-118-251-07 CONVENIO 18771.',
    ];
    legalLines.forEach((line, i) => {
      const r = R_OBS + 1 + i;
      sc(0, r, line, sObs);
      merge(0, r, 16, r);
      for (let c = 1; c <= 16; c++) se(c, r, sObs);
    });
    let nextRow = R_OBS + 1 + legalLines.length;
    if (pedido.observaciones) {
      sc(0, nextRow, `OBSERVACIONES DEL PEDIDO: ${pedido.observaciones}`, { ...sLabel, font: f(8, true) });
      merge(0, nextRow, 16, nextRow);
      for (let c = 1; c <= 16; c++) se(c, nextRow, sLabel);
      nextRow++;
    }

    // ── FOOTER ────────────────────────────────────────────────────────────
    sc(0, nextRow, 'VITELSA S.A — GIRARDOTA PARQUE INDUSTRIAL DEL NORTE: 444-92-69 — WEB www.vitelsa.com.co', sFooter);
    merge(0, nextRow, 16, nextRow);
    for (let c = 1; c <= 16; c++) se(c, nextRow, sFooter);

    // ── DIMENSIONES ───────────────────────────────────────────────────────
    ws['!ref'] = `A1:Q${nextRow + 1}`;
    ws['!merges'] = merges;
    ws['!cols'] = [
      { wch: 5  }, // A ÍTEM
      { wch: 11 }, // B COLOR
      { wch: 8  }, // C ESP
      { wch: 6  }, // D CANT
      { wch: 9  }, // E ANCHO(A)
      { wch: 9  }, // F ALTO(H)
      { wch: 5  }, // G DT
      { wch: 5  }, // H PER
      { wch: 5  }, // I BOQ
      { wch: 5  }, // J DES
      { wch: 9  }, // K BPB ANCHO
      { wch: 9  }, // L BPB ALTO
      { wch: 11 }, // M BP MATE ANCHO
      { wch: 11 }, // N BP MATE ALTO
      { wch: 9  }, // O CHAFLÁN ANCHO
      { wch: 9  }, // P CHAFLÁN ALTO
      { wch: 30 }, // Q ESPECIFICACIONES
    ];
    ws['!rows'] = [
      { hpx: 45 }, // 0 header logo/título
      { hpx: 18 }, // 1 VR03 / fecha vigencia
      { hpx: 14 }, // 2 formulario
      { hpx: 20 }, // 3 FECHA
      { hpx: 18 }, // 4 PEDIDO
      { hpx: 14 }, // 5 servicios adicionales
      { hpx: 14 }, // 6 cuales
      { hpx: 18 }, // 7 nombre
      { hpx: 18 }, // 8 dirección
      { hpx: 18 }, // 9 régimen
      { hpx: 20 }, // 10 dirección envío
      { hpx: 6  }, // 11 blank
      { hpx: 24 }, // 12 header ítems row 1
      { hpx: 18 }, // 13 header ítems row 2
      ...Array(12).fill({ hpx: 18 }), // 14-25 ítems
      { hpx: 6  }, // 26 blank
      { hpx: 16 }, // 27 "OBSERVACIONES:"
      { hpx: 36 }, // 28 legal 1
      { hpx: 16 }, // 29 legal 2
      { hpx: 16 }, // 30 legal 3
      { hpx: 16 }, // 31 legal 4
      { hpx: 16 }, // 32 obs pedido (si existe)
      { hpx: 14 }, // 33 footer
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pedido VITELSA');
    XLSX.writeFile(wb, `VITELSA-${pedido.numero_pedido}.xlsx`);
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
                              {p.tuvo_problema && p.estado !== 'PROBLEMA' && (
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
                                    <Chip label="Repuesto ✓" size="small" sx={{ fontSize: 10, height: 16, bgcolor: '#e8f5e9', color: '#2e7d32' }} />
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
                          <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>An x Al</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Cant.</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: 12, minWidth: 60 }}>DT</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: 12, minWidth: 160 }}>Observación PV</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Obs. Orig.</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {items.map((it: any, idx: number) => {
                          const seleccionado = itemsSeleccionados.includes(it.id);
                          const extras = itemsExtras[it.id] || { dt: '', obsType: '', customObs: '' };
                          
                          const toggleRow = () => setItemsSeleccionados(prev => prev.includes(it.id) ? prev.filter(id => id !== it.id) : [...prev, it.id]);
                          
                          return (
                            <TableRow key={it.id} selected={seleccionado} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                              <TableCell padding="checkbox" onClick={toggleRow} sx={{ cursor: 'pointer' }}>
                                <input type="checkbox" checked={seleccionado} readOnly />
                              </TableCell>
                              <TableCell sx={{ fontSize: 12 }} onClick={toggleRow}>{idx + 1}</TableCell>
                              <TableCell sx={{ fontSize: 12 }} onClick={toggleRow}>{it.prod || '—'}</TableCell>
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

      {fichaOdpId && <ODPFichaModal odpId={fichaOdpId} onClose={() => setFichaOdpId(null)} />}
    </Box>
  );
};

export default PedidosPVPage;
