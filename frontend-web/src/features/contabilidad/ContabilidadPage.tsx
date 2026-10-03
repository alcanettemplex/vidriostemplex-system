import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import ODPFichaModal from '../odp/components/ODPFichaModal';
import FolderTabs from '../../components/FolderTabs';
import { TarjetaKPI } from '../../components/charts';
import {
  Calculator, DollarSign, FileCheck, AlertCircle,
  CreditCard, Plus, X, Receipt, Clock, Banknote, TrendingDown,
  Pencil, Trash2, Calendar, ChevronUp, ChevronDown, ChevronsUpDown,
  CheckCircle2,
} from '../../components/ui/icons';
import { useDataChangedSocket, useODPSocketPatch } from '../../store/useSocketNotifications';

import API from '../../services/config';
// Helpers y modales compartidos: los mismos que consume la ficha de la ODP.
import {
  headers, fmt, fmtFecha, formatMiles, parseMiles, calcPendiente,
  esCompletada, pestanaDeODP, coincideODP, PestanaContabilidad,
} from './components/contabilidad.utils';
import { coincideBusqueda, normalizarTexto, useValorDiferido } from '../../utils/busqueda';
import { getEstadoODP } from '../../utils/estadosODP';
import FacturaElectronicaModal from './components/FacturaElectronicaModal';
import AbonoFormModal from './components/AbonoFormModal';
import ConfirmarEliminarAbonoModal from './components/ConfirmarEliminarAbonoModal';
import BuscadorMaestro from './components/BuscadorMaestro';
import { CampoBusqueda, Paginador } from './components/ControlesListado';

type Tab = PestanaContabilidad;

const LIMITE_OPERATIVAS = 500;
const POR_PAGINA_COMPLETADO = 100;
const POR_PAGINA_PAGOS = 100;

/** El término se manda al servidor solo desde 2 caracteres (el backend rechaza menos). */
const terminoServidor = (t: string) => (normalizarTexto(t).length >= 2 ? t.trim() : '');

const ContabilidadPage: React.FC = () => {
  const authUser = useSelector((state: any) => state.auth?.user);
  const isReadOnly = authUser?.rol === 'asistente_administrativo';
  const canSeeOA = ['admin', 'gerencia', 'jefe_produccion', 'asistente_administrativo'].includes(authUser?.rol);
  const isAsistenteAdmin = authUser?.rol === 'asistente_administrativo';
  const canPayOA = ['admin', 'gerencia', 'asistente_administrativo'].includes(authUser?.rol);
  // El asistente administrativo solo ve Órdenes Azules; /resumen y /pagos le responden 403.
  const verFinanzas = !isAsistenteAdmin;

  const [tab, setTab] = useState<Tab>(isAsistenteAdmin ? 'oa' : 'estado_caja');

  // ─── ODPs operativas (Estado Caja + OA) ──────────────────────────────────
  // Se cargan completas (vista=operativa excluye el histórico de Proceso Completado) y se
  // filtran en el navegador: 155 filas el 2026-10-03, lejos del tope.
  const [odps, setOdps] = useState<any[]>([]);
  const [odpsOA, setOdpsOA] = useState<any[]>([]);
  const [totalOperativas, setTotalOperativas] = useState(0);
  const [loadingOdps, setLoadingOdps] = useState(true);
  const [filterEstadoCaja, setFilterEstadoCaja] = useState('todos');
  const [filterBusqueda, setFilterBusqueda] = useState('');
  const [busquedaOA, setBusquedaOA] = useState('');

  // ─── Resumen / cartera ───────────────────────────────────────────────────
  const [resumen, setResumen] = useState<any>(null);
  const [loadingResumen, setLoadingResumen] = useState(true);
  const [busquedaCartera, setBusquedaCartera] = useState('');

  // ─── Pagos (paginados y buscados en el servidor) ─────────────────────────
  const [pagos, setPagos] = useState<any[]>([]);
  const [totalPagos, setTotalPagos] = useState(0);
  // El contador de la pestaña es el total sin búsqueda; totalPagos es el del listado actual.
  const [totalPagosGlobal, setTotalPagosGlobal] = useState(0);
  const [paginaPagos, setPaginaPagos] = useState(1);
  const [totalPaginasPagos, setTotalPaginasPagos] = useState(1);
  const [loadingPagos, setLoadingPagos] = useState(true);
  const [busquedaPagos, setBusquedaPagos] = useState('');
  const qPagos = terminoServidor(useValorDiferido(busquedaPagos));
  const consultaPagosRef = useRef(0);

  // ─── Proceso Completado (paginado, ordenado y buscado en el servidor) ────
  const [completadas, setCompletadas] = useState<any[]>([]);
  const [totalCompletadas, setTotalCompletadas] = useState(0);
  const [totalCompletadasGlobal, setTotalCompletadasGlobal] = useState(0);
  const [paginaComp, setPaginaComp] = useState(1);
  const [totalPaginasComp, setTotalPaginasComp] = useState(1);
  const [loadingComp, setLoadingComp] = useState(true);
  const [filterBusquedaCompletado, setFilterBusquedaCompletado] = useState('');
  const qComp = terminoServidor(useValorDiferido(filterBusquedaCompletado));
  const [sortColComp, setSortColComp] = useState<string | null>(null);
  const [sortDirComp, setSortDirComp] = useState<'asc' | 'desc'>('asc');
  const consultaCompRef = useRef(0);

  // ─── Modales compartidos: FE y abonos ────────────────────────────────────
  // Cada estado guarda el objetivo (ODP o pago); el formulario vive dentro del componente.
  const [fichaOdpId, setFichaOdpId] = useState<number | null>(null);
  const [feTarget, setFeTarget] = useState<any | null>(null);
  const [showAbonoModal, setShowAbonoModal] = useState(false);
  const [abonoOdpFija, setAbonoOdpFija] = useState<any | null>(null);
  const [pagoEnEdicion, setPagoEnEdicion] = useState<any | null>(null);
  const [pagoAEliminar, setPagoAEliminar] = useState<any | null>(null);

  // ─── Modal editar total ODP ─────────────────────────────────────────────
  const [showEditTotalModal, setShowEditTotalModal] = useState(false);
  const [editTotalTarget, setEditTotalTarget] = useState<any>(null);
  const [newTotal, setNewTotal] = useState('');
  const [submittingTotal, setSubmittingTotal] = useState(false);

  // ─── Ordenamiento tabla Estado Caja ─────────────────────────────────────
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // El orden de Proceso Completado lo aplica el servidor (está paginado): cambiarlo vuelve a la página 1.
  const handleSortComp = (key: string | null) => {
    if (!key) return;
    if (sortColComp === key) setSortDirComp(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortColComp(key); setSortDirComp('asc'); }
    setPaginaComp(1);
  };

  const handleSort = (key: string | null) => {
    if (!key) return;
    if (sortCol === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(key);
      setSortDir('asc');
    }
  };

  // Cambiar el texto de una búsqueda paginada vuelve a la página 1 en el mismo evento,
  // así la consulta sale una sola vez cuando termina la espera de escritura.
  const cambiarBusquedaPagos = (v: string) => { setBusquedaPagos(v); setPaginaPagos(1); };
  const cambiarBusquedaCompletado = (v: string) => { setFilterBusquedaCompletado(v); setPaginaComp(1); };

  // ─── Fetchers ────────────────────────────────────────────────────────────
  const fetchOdps = useCallback(async () => {
    try {
      setLoadingOdps(true);
      const res = await axios.get(`${API}/api/contabilidad/odps?vista=operativa&limit=${LIMITE_OPERATIVAS}`, { headers: headers() });
      const data = res.data;
      if (data && Array.isArray(data.rows)) {
        setOdps(data.rows.filter((o: any) => o.tipo_odp !== 'OA'));
        if (canSeeOA) setOdpsOA(data.rows.filter((o: any) => o.tipo_odp === 'OA'));
        setTotalOperativas(data.count || 0);
      } else {
        console.error('Respuesta de ODPs no tiene rows:', data);
        setOdps([]);
      }
    } catch (err) {
      console.error('Error fetching ODPs:', err);
      toast.error('No se pudo cargar el listado de ODPs de Contabilidad. Recarga la página para reintentar.');
      setOdps([]);
    } finally { setLoadingOdps(false); }
    // canSeeOA sale del rol, que no cambia en la sesión: declararla no altera cuándo se recarga
  }, [canSeeOA]);

  const fetchResumen = useCallback(async () => {
    if (!verFinanzas) { setLoadingResumen(false); return; }
    try {
      setLoadingResumen(true);
      const res = await axios.get(`${API}/api/contabilidad/resumen`, { headers: headers() });
      setResumen(res.data);
    } catch (err) {
      console.error('Error resumen dashboard:', err);
    } finally { setLoadingResumen(false); }
  }, [verFinanzas]);

  const fetchPagos = useCallback(async () => {
    if (!verFinanzas) { setLoadingPagos(false); return; }
    // Si cambian la página o la búsqueda antes de que responda, la respuesta vieja se descarta.
    const id = ++consultaPagosRef.current;
    setLoadingPagos(true);
    try {
      const q = qPagos ? `&q=${encodeURIComponent(qPagos)}` : '';
      const res = await axios.get(`${API}/api/contabilidad/pagos?page=${paginaPagos}&limit=${POR_PAGINA_PAGOS}${q}`, { headers: headers() });
      if (id !== consultaPagosRef.current) return;
      setPagos(res.data?.pagos || []);
      setTotalPagos(res.data?.total || 0);
      if (!qPagos) setTotalPagosGlobal(res.data?.total || 0);
      setTotalPaginasPagos(res.data?.totalPaginas || 1);
    } catch (err: any) {
      if (id !== consultaPagosRef.current) return;
      console.error('Error listado pagos:', err);
      toast.error(err?.response?.data?.error || 'No se pudo cargar el listado de pagos.');
    } finally { if (id === consultaPagosRef.current) setLoadingPagos(false); }
  }, [verFinanzas, paginaPagos, qPagos]);

  const fetchCompletadas = useCallback(async () => {
    if (!verFinanzas) { setLoadingComp(false); return; }
    const id = ++consultaCompRef.current;
    setLoadingComp(true);
    try {
      const params = new URLSearchParams({ vista: 'completado', page: String(paginaComp), limit: String(POR_PAGINA_COMPLETADO) });
      if (qComp) params.set('q', qComp);
      if (sortColComp) { params.set('orden', sortColComp); params.set('dir', sortDirComp); }
      const res = await axios.get(`${API}/api/contabilidad/odps?${params.toString()}`, { headers: headers() });
      if (id !== consultaCompRef.current) return;
      setCompletadas(res.data?.rows || []);
      setTotalCompletadas(res.data?.count || 0);
      if (!qComp) setTotalCompletadasGlobal(res.data?.count || 0);
      setTotalPaginasComp(res.data?.totalPages || 1);
    } catch (err: any) {
      if (id !== consultaCompRef.current) return;
      console.error('Error listado Proceso Completado:', err);
      toast.error(err?.response?.data?.error || 'No se pudo cargar Proceso Completado.');
    } finally { if (id === consultaCompRef.current) setLoadingComp(false); }
  }, [verFinanzas, paginaComp, qComp, sortColComp, sortDirComp]);

  useEffect(() => { fetchOdps(); }, [fetchOdps]);
  useEffect(() => { fetchResumen(); }, [fetchResumen]);
  useEffect(() => { fetchPagos(); }, [fetchPagos]);
  useEffect(() => { fetchCompletadas(); }, [fetchCompletadas]);
  useDataChangedSocket('contabilidad', useCallback(() => {
    fetchOdps(); fetchResumen(); fetchPagos(); fetchCompletadas();
  }, [fetchOdps, fetchResumen, fetchPagos, fetchCompletadas]));
  useODPSocketPatch({ setOdps, setOdpsOA, setSoloActualizar: setCompletadas });

  /** Aplica un cambio de una ODP en todas las listas donde pueda estar. Si con el cambio
   *  pasa a (o deja de ser) Proceso Completado, esa pestaña se recarga. */
  const aplicarPatchODP = (id: number, patch: Record<string, any>) => {
    const parchar = (arr: any[]) => arr.map(o => o.id === id ? { ...o, ...patch } : o);
    const antes = [...odps, ...completadas].find(o => o.id === id);
    setOdps(parchar);
    setOdpsOA(parchar);
    setCompletadas(parchar);
    if (antes && esCompletada(antes) !== esCompletada({ ...antes, ...patch })) fetchCompletadas();
  };

  // ─── Handlers estado caja / facturación ──────────────────────────────────
  const updateCaja = async (id: number, campo: string, valor: string) => {
    try {
      const endpoint = campo === 'estado_caja'
        ? `${API}/api/odp/${id}/caja`
        : `${API}/api/odp/${id}/facturar`;
      await axios.patch(endpoint, { [campo]: valor }, { headers: headers() });
      aplicarPatchODP(id, { [campo]: valor });
      toast.success('Estado actualizado');
    } catch { toast.error('Error al actualizar estado'); }
  };

  // Abrir el modal de FE: el formulario y el CRUD de adicionales viven en el componente.
  const abrirFeModal = (odp: any) => setFeTarget(odp);

  const handleFacturacionChange = (odp: any, nuevoEstado: string) => {
    if (nuevoEstado === 'FACTURADA') {
      abrirFeModal(odp);
    } else {
      updateCaja(odp.id, 'estado_facturacion', nuevoEstado);
    }
  };

  // Abrir el modal de abono con la ODP ya fijada (botón "Registrar Abono" de las tablas).
  const abrirAbonoDeODP = (odp: any) => { setAbonoOdpFija(odp); setShowAbonoModal(true); };

  // ─── Handler editar total ODP ───────────────────────────────────────────
  const abrirEditTotal = (odp: any) => {
    setEditTotalTarget(odp);
    setNewTotal(formatMiles(Math.round(Number(odp.valor_total) || 0)));
    setShowEditTotalModal(true);
  };

  const handleEditTotalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTotalTarget || !newTotal || parseMiles(newTotal) < 0) {
      toast.error('Ingresa un monto válido'); return;
    }
    setSubmittingTotal(true);
    try {
      await axios.put(`${API}/api/odp/${editTotalTarget.id}`, {
        valor_total: parseMiles(newTotal),
      }, { headers: headers() });
      toast.success('Monto total actualizado');
      setShowEditTotalModal(false);
      fetchOdps();
      fetchCompletadas();
    } catch {
      toast.error('Error al actualizar el monto');
    } finally { setSubmittingTotal(false); }
  };

  // Refresco tras cualquier alta/edición/borrado de abono.
  const refrescarTrasAbono = () => { fetchOdps(); fetchResumen(); fetchPagos(); fetchCompletadas(); };

  // ─── Buscador maestro → pestaña ──────────────────────────────────────────
  // Lleva a la pestaña con su propio buscador ya filtrado por el término.
  const irAPestana = (destino: Tab, termino: string) => {
    setTab(destino);
    switch (destino) {
      case 'estado_caja': setFilterEstadoCaja('todos'); setFilterBusqueda(termino); break;
      case 'completado': cambiarBusquedaCompletado(termino); break;
      case 'oa': setBusquedaOA(termino); break;
      case 'cartera': setBusquedaCartera(termino); break;
      case 'pagos': cambiarBusquedaPagos(termino); break;
    }
  };

  // ─── Datos derivados ─────────────────────────────────────────────────────
  const diasParaVencer = (o: any): number | null => {
    if (o.estado_caja !== 'CREDITO_APROBADO' || !o.fecha_vencimiento_credito) return null;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const vence = new Date(o.fecha_vencimiento_credito); vence.setHours(0, 0, 0, 0);
    return Math.ceil((vence.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
  };

  const rowColorCredito = (o: any): string => {
    const dias = diasParaVencer(o);
    if (dias === null) return '';
    if (dias <= 2) return 'bg-rose-50';
    if (dias <= 7) return 'bg-orange-50';
    return '';
  };

  // Estado Caja: ni completadas (van a su pestaña) ni NC/garantías (no cobran ni llevan FE).
  const baseEstadoCaja = useMemo(() => odps.filter(o => pestanaDeODP(o) === 'estado_caja'), [odps]);

  const filtradas = useMemo(() => baseEstadoCaja.filter(o =>
    (filterEstadoCaja === 'todos' || o.estado_caja === filterEstadoCaja) && coincideODP(o, filterBusqueda),
  ), [baseEstadoCaja, filterEstadoCaja, filterBusqueda]);

  const sortedFiltradas = useMemo(() => {
    if (!sortCol) return filtradas;
    return [...filtradas].sort((a, b) => {
      let va: any, vb: any;
      switch (sortCol) {
        case 'numero_odp':           va = a.numero_odp || ''; vb = b.numero_odp || ''; break;
        case 'fecha_creacion':       va = a.fecha_creacion || ''; vb = b.fecha_creacion || ''; break;
        case 'cliente':              va = a.cliente?.nombre_razon_social || ''; vb = b.cliente?.nombre_razon_social || ''; break;
        case 'asesor':               va = a.asesor?.nombre_completo || ''; vb = b.asesor?.nombre_completo || ''; break;
        case 'estado_produccion':    va = a.estado_produccion || ''; vb = b.estado_produccion || ''; break;
        case 'factura_electronica':  va = a.factura_electronica || ''; vb = b.factura_electronica || ''; break;
        case 'monto_total':          va = Number(a.valor_total) || 0; vb = Number(b.valor_total) || 0; break;
        case 'abono':                va = Number(a.abono) || 0; vb = Number(b.abono) || 0; break;
        case 'pendiente':            va = calcPendiente(a); vb = calcPendiente(b); break;
        case 'estado_caja':          va = a.estado_caja || ''; vb = b.estado_caja || ''; break;
        case 'estado_facturacion':   va = a.estado_facturacion || ''; vb = b.estado_facturacion || ''; break;
        default: return 0;
      }
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtradas, sortCol, sortDir]);

  const oaFiltradas = useMemo(() => odpsOA.filter(o => coincideODP(o, busquedaOA)), [odpsOA, busquedaOA]);

  const odpsPendientes = odps.filter(o => calcPendiente(o) > 0 && o.estado_caja !== 'CANCELADO');
  const odpsOAPendientes = odpsOA.filter(o => calcPendiente(o) > 0 && o.estado_caja !== 'CANCELADO');
  const carteraDetalle: any[] = useMemo(() => resumen?.cartera_detalle || [], [resumen]);
  const carteraFiltrada = useMemo(() => carteraDetalle.filter((c: any) =>
    coincideBusqueda(busquedaCartera, [c.odp, c.cliente, c.nit, c.asesor, c.factura_electronica], [c.nit]),
  ), [carteraDetalle, busquedaCartera]);

  const totalAbonado = resumen?.total_abonado || fmt(odps.reduce((s, o) => s + (Number(o.abono) || 0), 0));
  const totalPorCobrar = resumen?.total_pendiente || fmt(
    odps.filter(o => o.estado_caja !== 'CANCELADO').reduce((s, o) => s + calcPendiente(o), 0),
  );
  const totalFacturadas = resumen?.total_facturadas ?? odps.filter(o => o.estado_facturacion === 'FACTURADA' || o.factura_electronica).length;
  const pendFactura = resumen?.pendientes_factura ?? odps.filter(o => o.estado_facturacion === 'PENDIENTE' && !o.factura_electronica && !o.es_no_conformidad && !o.es_garantia).length;
  const carteraVencida = resumen?.cartera_vencida || '$0';

  // Red de seguridad: si algún día las operativas superan el tope, avisar en vez de ocultar.
  const operativasIncompletas = !loadingOdps && totalOperativas > LIMITE_OPERATIVAS;

  const TABS = [
    ...(!isAsistenteAdmin ? [
      { key: 'estado_caja' as Tab, label: 'Estado Caja', icon: <Banknote className="w-4 h-4" />, badge: baseEstadoCaja.length },
      { key: 'pagos' as Tab, label: 'Pagos Recientes', icon: <Receipt className="w-4 h-4" />, badge: totalPagosGlobal },
      { key: 'cartera' as Tab, label: 'Cartera Vencida', icon: <TrendingDown className="w-4 h-4" />, badge: carteraDetalle.length, badgeColor: carteraDetalle.length > 0 ? 'bg-rose-100 text-rose-700' : undefined },
      { key: 'completado' as Tab, label: 'Proceso Completado', icon: <CheckCircle2 className="w-4 h-4" />, badge: totalCompletadasGlobal, badgeColor: 'bg-emerald-100 text-emerald-700' },
    ] : []),
    ...(canSeeOA ? [
      { key: 'oa' as Tab, label: 'Órdenes Azules', icon: <FileCheck className="w-4 h-4" />, badge: odpsOA.length, badgeColor: 'bg-blue-100 text-blue-700' },
    ] : []),
  ];

  return (
    <div className="p-6 w-full space-y-6">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <Calculator className="w-8 h-8 text-indigo-600" />
            Contabilidad y Finanzas
          </h1>
          <p className="text-slate-700 mt-1">Control de facturación, caja, pagos y cuentas por cobrar</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          <BuscadorMaestro
            verFinanzas={verFinanzas}
            verOA={canSeeOA}
            cartera={carteraDetalle}
            onIrA={irAPestana}
            onAbrirFicha={setFichaOdpId}
          />
          {(!isReadOnly || canPayOA) && (
          <button
            onClick={() => { setAbonoOdpFija(null); setShowAbonoModal(true); }}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 text-white font-bold rounded-xl shadow-md shadow-emerald-200 hover:bg-emerald-700 transition-all hover:-translate-y-0.5 whitespace-nowrap"
          >
            <Plus className="w-5 h-5" /> Registrar Pago
          </button>
          )}
        </div>
      </div>

      {operativasIncompletas && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-amber-300 bg-amber-50 text-sm text-amber-900">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          Hay {totalOperativas} ODPs abiertas y solo se cargaron {LIMITE_OPERATIVAS}. Los listados de Estado Caja y Órdenes Azules
          no las muestran todas: usa el buscador de arriba, que busca en toda la base de datos, y avisa a soporte para ampliar el límite.
        </div>
      )}

      {/* KPIs — solo para roles con acceso al resumen financiero */}
      {!isAsistenteAdmin && <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Anatomía común de KPI (TarjetaKPI). La cifra conserva su tamaño fluido: "$ 41.535.000"
            no cabía en 5 columnas a 1440px con un tamaño fijo y perdía dígitos. */}
        {([
          { label: 'Recaudado',       value: totalAbonado,    icono: DollarSign,   tono: 'emerald', cifra: 'text-emerald-700', desc: 'Abonos recibidos' },
          { label: 'Por Cobrar',      value: totalPorCobrar,  icono: CreditCard,   tono: 'rose',    cifra: 'text-rose-700',    desc: 'Saldo pendiente de las ODPs' },
          { label: 'Cartera Vencida', value: carteraVencida,  icono: TrendingDown, tono: 'amber',   cifra: 'text-amber-700',   desc: 'Créditos que superaron el plazo' },
          { label: 'Facturadas',      value: totalFacturadas, icono: FileCheck,    tono: 'blue',    cifra: 'text-slate-900',   desc: 'ODPs con factura electrónica' },
          { label: 'Sin Factura',     value: pendFactura,     icono: AlertCircle,  tono: 'amber',   cifra: 'text-slate-900',   desc: 'Pendientes de facturar' },
        ] as const).map((kpi, i) => (
          <TarjetaKPI key={kpi.label} densa indice={i} rotulo={kpi.label} icono={kpi.icono} tono={kpi.tono}
            cifra={<span title={String(kpi.value)}>{kpi.value}</span>}
            cifraClassName={`${kpi.cifra} !text-[clamp(1.125rem,1.55vw,1.5rem)]`}
            descripcion={kpi.desc} />
        ))}
      </div>}

      {/* TABS */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
        <FolderTabs
          tabs={TABS.map(t => ({ key: t.key, label: t.label, icon: t.icon, badge: t.badge, badgeClassName: (t as any).badgeColor }))}
          activeKey={tab}
          onChange={(k) => setTab(k as typeof tab)}
          className="border-b border-slate-100"
        />

        {/* ── TAB 1: Estado Caja ─────────────────────────────────────────────── */}
        {tab === 'estado_caja' && (
          <div>
            <div className="flex gap-2 flex-wrap items-center px-5 py-3 border-b border-slate-100 bg-slate-50/50">
              <span className="text-xs font-semibold text-slate-900 uppercase tracking-wider mr-1">Filtrar:</span>
              {['todos', 'PENDIENTE', 'ABONADO', 'CANCELADO', 'CREDITO_APROBADO'].map(f => (
                <button key={f} onClick={() => setFilterEstadoCaja(f)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                    filterEstadoCaja === f
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-800 border-slate-300 hover:border-indigo-300'
                  }`}>
                  {f === 'todos' ? 'Todos' : f.replace('_', ' ')}
                </button>
              ))}
              <CampoBusqueda className="ml-auto w-72" valor={filterBusqueda} onChange={setFilterBusqueda} />
            </div>
            <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 390px)', minHeight: '300px' }}>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    {([
                      { label: 'ODP',              key: 'numero_odp' },
                      { label: 'Fecha Creación',   key: 'fecha_creacion' },
                      { label: 'Cliente',          key: 'cliente' },
                      { label: 'Asesor',           key: 'asesor' },
                      { label: 'Est. Taller',      key: 'estado_produccion' },
                      { label: 'FE No. / Fecha',   key: 'factura_electronica' },
                      { label: 'Monto Total',      key: 'monto_total' },
                      { label: 'Abonado',          key: 'abono' },
                      { label: 'Pendiente',        key: 'pendiente' },
                      { label: 'Estado Caja',      key: 'estado_caja' },
                      { label: 'Facturación',      key: 'estado_facturacion' },
                      { label: '',                 key: null },
                    ] as { label: string; key: string | null }[]).map(col => (
                      <th
                        key={col.label || 'action'}
                        onClick={() => handleSort(col.key)}
                        className={`text-left px-4 py-3 text-xs font-semibold text-slate-900 uppercase tracking-wider whitespace-nowrap select-none ${col.key ? 'cursor-pointer hover:bg-slate-100 transition-colors' : ''}`}
                      >
                        <div className="flex items-center gap-1">
                          {col.label}
                          {col.key && (
                            sortCol === col.key
                              ? sortDir === 'asc'
                                ? <ChevronUp className="w-3 h-3 text-indigo-500" />
                                : <ChevronDown className="w-3 h-3 text-indigo-500" />
                              : <ChevronsUpDown className="w-3 h-3 text-slate-500" />
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingOdps ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}><td colSpan={12} className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td></tr>
                    ))
                  ) : sortedFiltradas.length === 0 ? (
                    <tr><td colSpan={12} className="text-center py-12 text-slate-700">
                      {filterBusqueda.trim()
                        ? <>Ninguna ODP de Estado Caja coincide con “{filterBusqueda.trim()}”{filterEstadoCaja !== 'todos' && ' con el filtro de estado elegido'}. Si ya está saldada y facturada, búscala en Proceso Completado o en el buscador de arriba.</>
                        : 'No hay registros que mostrar.'}
                    </td></tr>
                  ) : sortedFiltradas.map(odp => (
                    <tr key={odp.id} className={`hover:bg-slate-50 transition-colors ${rowColorCredito(odp)}`}>
                      <td className="px-4 py-4 font-bold text-indigo-700 whitespace-nowrap cursor-pointer hover:underline" onClick={() => setFichaOdpId(odp.id)}>{odp.numero_odp}</td>
                      <td className="px-4 py-4 text-slate-800 text-xs whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-500" />
                          {fmtFecha(odp.fecha_creacion)}
                        </div>
                      </td>
                      <td className="px-4 py-4 font-semibold text-slate-900 max-w-[320px] truncate" title={odp.cliente?.nombre_razon_social}>
                        {odp.cliente?.nombre_razon_social || '—'}
                      </td>
                      {/* Asesor */}
                      <td className="px-4 py-4 text-slate-800 text-xs whitespace-nowrap">{odp.asesor?.nombre_completo || '—'}</td>
                      {/* Estado Taller */}
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${getEstadoODP(odp.estado_produccion).badge}`}
                          title={getEstadoODP(odp.estado_produccion).descripcion}
                        >
                          {getEstadoODP(odp.estado_produccion).label}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1.5">
                          {odp.factura_electronica ? (
                            <div>
                              <div className="flex items-center gap-1">
                                <span className="font-mono text-emerald-800 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-xs whitespace-nowrap">
                                  FE-{odp.factura_electronica}
                                </span>
                                {odp.facturas_adicionales?.length > 0 && (
                                  <span title={`${odp.facturas_adicionales.length} factura(s) adicional(es)`}
                                    className="font-semibold text-[11px] text-indigo-800 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 whitespace-nowrap">
                                    +{odp.facturas_adicionales.length}
                                  </span>
                                )}
                              </div>
                              {odp.fecha_factura && (
                                <p className="text-xs text-slate-700 mt-0.5 whitespace-nowrap">{fmtFecha(odp.fecha_factura)}</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-500 text-xs italic whitespace-nowrap">Sin factura</span>
                          )}
                          <button
                            onClick={() => abrirFeModal(odp)}
                            title="Editar factura"
                            className="ml-1 p-1 rounded text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 transition"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-4 font-bold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {Number(odp.valor_total) > 0 ? fmt(Number(odp.valor_total)) : <span className="text-slate-500 text-xs italic">—</span>}
                          <button onClick={() => abrirEditTotal(odp)} title="Editar monto total"
                            className="p-1 rounded text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 transition">
                            <Pencil className="w-3" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-4 font-bold text-emerald-700 whitespace-nowrap">{fmt(Number(odp.abono) || 0)}</td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {(() => {
                          const pend = calcPendiente(odp);
                          return <span className={`font-bold text-sm ${pend > 0 ? 'text-rose-700' : 'text-slate-500'}`}>{fmt(pend)}</span>;
                        })()}
                      </td>
                      <td className="px-4 py-4">
                        {(() => {
                          const dias = diasParaVencer(odp);
                          const badgeCredito = dias !== null
                            ? dias <= 2 ? 'bg-rose-100 text-rose-800 border-rose-300'
                            : dias <= 7 ? 'bg-orange-100 text-orange-800 border-orange-300'
                            : 'bg-indigo-100 text-indigo-800 border-indigo-300'
                            : 'bg-indigo-100 text-indigo-800 border-indigo-300';
                          return (
                            <div className="flex flex-col gap-1">
                              <select
                                value={odp.estado_caja}
                                onChange={e => updateCaja(odp.id, 'estado_caja', e.target.value)}
                                className={`text-xs font-semibold px-2 py-1 rounded-lg border cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                                  odp.estado_caja === 'CANCELADO'        ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                                  odp.estado_caja === 'ABONADO'          ? 'bg-blue-100 text-blue-800 border-blue-300' :
                                  odp.estado_caja === 'CREDITO_APROBADO' ? badgeCredito :
                                  'bg-amber-100 text-amber-800 border-amber-300'
                                }`}
                              >
                                <option value="PENDIENTE">Pendiente</option>
                                <option value="ABONADO">Abonado</option>
                                <option value="CANCELADO">Cancelado</option>
                                <option value="CREDITO_APROBADO">Crédito Aprobado</option>
                              </select>
                              {odp.estado_caja === 'CREDITO_APROBADO' && odp.fecha_vencimiento_credito && (
                                <span className={`text-xs font-semibold ${
                                  dias !== null && dias <= 2 ? 'text-rose-700' :
                                  dias !== null && dias <= 7 ? 'text-orange-700' : 'text-slate-700'
                                }`}>
                                  Vence: {fmtFecha(odp.fecha_vencimiento_credito)}
                                  {dias !== null && dias >= 0 && ` (${dias}d)`}
                                  {dias !== null && dias < 0 && ' ⚠ Vencido'}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-4">
                        <select value={odp.estado_facturacion} onChange={e => handleFacturacionChange(odp, e.target.value)}
                          className={`text-xs font-semibold px-2 py-1 rounded-lg border cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                            odp.estado_facturacion === 'FACTURADA' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-slate-100 text-slate-700 border-slate-300'
                          }`}>
                          <option value="PENDIENTE">Pendiente</option>
                          <option value="FACTURADA">Facturada</option>
                        </select>
                      </td>
                      <td className="px-4 py-4">
                        {!isReadOnly && odp.estado_caja !== 'CANCELADO' && (
                          <button
                            onClick={() => abrirAbonoDeODP(odp)}
                            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 transition-all flex items-center gap-1 whitespace-nowrap"
                          >
                            <Banknote className="w-3.5 h-3.5" /> Registrar Abono
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 2: Pagos Recientes ─────────────────────────────────────────── */}
        {tab === 'pagos' && (
          <div>
            <div className="flex gap-2 flex-wrap items-center px-5 py-3 border-b border-slate-100 bg-slate-50/50">
              <span className="text-xs font-semibold text-slate-900 uppercase tracking-wider">
                <Receipt className="w-3.5 h-3.5 inline mr-1 text-slate-600" />
                {qPagos ? `${totalPagos} pago${totalPagos !== 1 ? 's' : ''} encontrado${totalPagos !== 1 ? 's' : ''}` : 'Todos los pagos, del más reciente al más antiguo'}
              </span>
              <CampoBusqueda className="ml-auto w-80" valor={busquedaPagos} onChange={cambiarBusquedaPagos}
                placeholder="Buscar ODP, cliente, NIT, asesor, FE o recibo…" buscando={loadingPagos && !!busquedaPagos.trim()} />
            </div>
            {loadingPagos && pagos.length === 0 ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
              </div>
            ) : pagos.length === 0 ? (
              <div className="py-16 text-center text-slate-700">
                <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-semibold text-slate-900">
                  {qPagos ? `Ningún pago coincide con “${qPagos}”` : 'No hay pagos registrados'}
                </p>
                {qPagos && <p className="text-sm mt-1">Prueba con el número de ODP, el nombre del cliente, el NIT o el número de recibo.</p>}
              </div>
            ) : (
              <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 390px)', minHeight: '300px' }}>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                       {['Fecha', 'ODP', 'Fecha Creación ODP', 'Cliente', 'Asesor', 'Monto', 'Banco / Método', 'Recibo No.', 'Observaciones', 'Registrado por', ''].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-900 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagos.map((pago: any) => (
                      <tr key={pago.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-800 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                            {fmtFecha(pago.fecha)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded text-xs border border-indigo-200 whitespace-nowrap">
                            {pago.odp?.numero_odp || `ODP-${pago.odp_id}`}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-800 text-xs whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            {fmtFecha(pago.odp?.fecha_creacion)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-900 font-semibold text-xs max-w-[220px] truncate" title={pago.odp?.cliente?.nombre_razon_social}>{pago.odp?.cliente?.nombre_razon_social || '—'}</td>
                        {/* Asesor */}
                        <td className="px-4 py-3 text-slate-800 text-xs whitespace-nowrap">{pago.odp?.asesor?.nombre_completo || '—'}</td>
                        <td className="px-4 py-3 font-bold text-emerald-700 whitespace-nowrap">{fmt(Number(pago.monto))}</td>
                        <td className="px-4 py-3 text-slate-800 capitalize text-xs whitespace-nowrap">{pago.metodo_pago}</td>
                        <td className="px-4 py-3 text-slate-800 font-mono text-xs whitespace-nowrap">{pago.referencia_pago || '—'}</td>
                        <td className="px-4 py-3 text-slate-700 text-xs max-w-[180px] truncate">{pago.observaciones || '—'}</td>
                        <td className="px-4 py-3 text-slate-800 text-xs whitespace-nowrap">{pago.registrador?.nombre_completo || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {!isReadOnly && (<>
                            <button
                              onClick={() => setPagoEnEdicion(pago)}
                              title="Editar pago"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 transition"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setPagoAEliminar(pago)}
                              title="Eliminar pago"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-700 hover:bg-rose-50 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            </>)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {pagos.length > 0 && (
              <Paginador pagina={paginaPagos} totalPaginas={totalPaginasPagos} total={totalPagos}
                unidad={qPagos ? 'pagos encontrados' : 'pagos'} onCambiar={setPaginaPagos} />
            )}
          </div>
        )}

        {/* ── TAB 4: Proceso Completado ──────────────────────────────────────── */}
        {tab === 'completado' && (
          <div>
            <div className="flex gap-2 flex-wrap items-center px-5 py-3 border-b border-slate-100 bg-slate-50/50">
              <span className="text-xs font-semibold text-slate-900 uppercase tracking-wider mr-1">
                <CheckCircle2 className="w-3.5 h-3.5 inline mr-1 text-emerald-600" />
                ODPs con factura electrónica y caja cancelada
              </span>
              <CampoBusqueda className="ml-auto w-72" valor={filterBusquedaCompletado} onChange={cambiarBusquedaCompletado}
                buscando={loadingComp && !!filterBusquedaCompletado.trim()} />
            </div>
            <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 390px)', minHeight: '300px' }}>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    {([
                      { label: 'ODP',              key: 'numero_odp' },
                      { label: 'Fecha Creación',   key: 'fecha_creacion' },
                      { label: 'Cliente',          key: 'cliente' },
                      { label: 'Asesor',           key: 'asesor' },
                      { label: 'Est. Taller',      key: 'estado_produccion' },
                      { label: 'FE No. / Fecha',   key: 'factura_electronica' },
                      { label: 'Monto Total',      key: 'monto_total' },
                      { label: 'Abonado',          key: 'abono' },
                      { label: 'Pendiente',        key: 'pendiente' },
                      { label: 'Estado Caja',      key: null },
                      { label: 'Facturación',      key: null },
                      { label: '',                 key: null },
                    ] as { label: string; key: string | null }[]).map(col => (
                      <th
                        key={col.label || 'action'}
                        onClick={() => handleSortComp(col.key)}
                        className={`text-left px-4 py-3 text-xs font-semibold text-slate-900 uppercase tracking-wider whitespace-nowrap select-none ${col.key ? 'cursor-pointer hover:bg-slate-100 transition-colors' : ''}`}
                      >
                        <div className="flex items-center gap-1">
                          {col.label}
                          {col.key && (
                            sortColComp === col.key
                              ? sortDirComp === 'asc'
                                ? <ChevronUp className="w-3 h-3 text-emerald-500" />
                                : <ChevronDown className="w-3 h-3 text-emerald-500" />
                              : <ChevronsUpDown className="w-3 h-3 text-slate-500" />
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingComp && completadas.length === 0 ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}><td colSpan={12} className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td></tr>
                    ))
                  ) : completadas.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="text-center py-12 text-slate-700">
                        <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                        {qComp
                          ? `Ninguna ODP completada coincide con “${qComp}”. Si aún tiene saldo o le falta la FE, está en Estado Caja.`
                          : 'No hay procesos completados aún.'}
                      </td>
                    </tr>
                  ) : completadas.map(odp => (
                    <tr key={odp.id} className="hover:bg-emerald-50/40 transition-colors">
                      <td className="px-4 py-4 font-bold text-indigo-700 whitespace-nowrap cursor-pointer hover:underline" onClick={() => setFichaOdpId(odp.id)}>{odp.numero_odp}</td>
                      <td className="px-4 py-4 text-slate-800 text-xs whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-500" />
                          {fmtFecha(odp.fecha_creacion)}
                        </div>
                      </td>
                      <td className="px-4 py-4 font-semibold text-slate-900 max-w-[320px] truncate" title={odp.cliente?.nombre_razon_social}>
                        {odp.cliente?.nombre_razon_social || '—'}
                      </td>
                      <td className="px-4 py-4 text-slate-800 text-xs whitespace-nowrap">{odp.asesor?.nombre_completo || '—'}</td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${getEstadoODP(odp.estado_produccion).badge}`}
                          title={getEstadoODP(odp.estado_produccion).descripcion}
                        >
                          {getEstadoODP(odp.estado_produccion).label}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1.5">
                          <div>
                            <span className="font-mono text-emerald-800 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-xs whitespace-nowrap">
                              FE-{odp.factura_electronica}
                            </span>
                            {odp.fecha_factura && (
                              <p className="text-xs text-slate-700 mt-0.5 whitespace-nowrap">{fmtFecha(odp.fecha_factura)}</p>
                            )}
                          </div>
                          <button onClick={() => abrirFeModal(odp)} title="Editar factura"
                            className="ml-1 p-1 rounded text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 transition">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-4 font-bold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {Number(odp.valor_total) > 0 ? fmt(Number(odp.valor_total)) : <span className="text-slate-500 text-xs italic">—</span>}
                          <button onClick={() => abrirEditTotal(odp)} title="Editar monto total"
                            className="p-1 rounded text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 transition">
                            <Pencil className="w-3" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-4 font-bold text-emerald-700 whitespace-nowrap">{fmt(Number(odp.abono) || 0)}</td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {(() => {
                          const pend = calcPendiente(odp);
                          return <span className={`font-bold text-sm ${pend > 0 ? 'text-rose-700' : 'text-slate-500'}`}>{fmt(pend)}</span>;
                        })()}
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold whitespace-nowrap bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <CheckCircle2 className="w-3 h-3" /> Cancelado
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold whitespace-nowrap bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <FileCheck className="w-3 h-3" /> Facturada
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <button onClick={() => setFichaOdpId(odp.id)} title="Ver ficha"
                          className="p-1.5 rounded text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 transition">
                          <FileCheck className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {completadas.length > 0 && (
              <Paginador pagina={paginaComp} totalPaginas={totalPaginasComp} total={totalCompletadas}
                unidad={qComp ? 'ODPs encontradas' : 'ODPs completadas'} onCambiar={setPaginaComp} />
            )}
          </div>
        )}

        {/* ── TAB 3: Cartera Vencida ─────────────────────────────────────────── */}
        {tab === 'cartera' && (
          <div className="p-5">
            {loadingResumen ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
              </div>
            ) : carteraDetalle.length === 0 ? (
              <div className="py-16 text-center text-slate-700">
                <TrendingDown className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-semibold text-emerald-700">Sin cartera vencida</p>
                <p className="text-sm mt-1">Todas las cuentas están al día</p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <p className="text-sm text-slate-700">
                    {carteraDetalle.length} ODP{carteraDetalle.length !== 1 ? 's' : ''} con saldo vencido
                    {busquedaCartera.trim() && <> · {carteraFiltrada.length} coinciden con la búsqueda</>}
                  </p>
                  <span className="text-base font-extrabold text-rose-700" title="Total de toda la cartera vencida">{carteraVencida}</span>
                  <CampoBusqueda className="ml-auto w-72" valor={busquedaCartera} onChange={setBusquedaCartera} />
                </div>
                {carteraFiltrada.length === 0 && (
                  <p className="py-12 text-center text-sm text-slate-700">
                    Ninguna ODP de la cartera vencida coincide con “{busquedaCartera.trim()}”.
                  </p>
                )}
                <div className="space-y-3">
                  {carteraFiltrada.map((item: any) => (
                    <div key={item.id ?? item.odp} className="flex items-center justify-between p-4 bg-rose-50 rounded-xl border border-rose-100">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-10 bg-rose-400 rounded-full flex-shrink-0" />
                        <div>
                          {item.id ? (
                            <button type="button" onClick={() => setFichaOdpId(item.id)} title="Abrir ficha de la ODP"
                              className="text-sm font-bold text-indigo-700 hover:underline">{item.odp}</button>
                          ) : (
                            <p className="text-sm font-bold text-slate-900">{item.odp}</p>
                          )}
                          <p className="text-xs text-slate-800">
                            {item.cliente}{item.nit && <span className="text-slate-600"> · NIT {item.nit}</span>}
                          </p>
                          {item.asesor && (
                            <p className="text-xs text-indigo-700">
                              Asesor: {item.asesor}
                            </p>
                          )}
                          {item.fecha_creacion && (
                            <p className="text-xs text-slate-700 flex items-center gap-1 mt-0.5">
                              <Calendar className="w-3 h-3" /> Creada: {fmtFecha(item.fecha_creacion)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-extrabold text-rose-700">{item.pendiente}</p>
                        <p className="text-xs text-rose-700">Vencido hace {item.dias_vencido} días</p>
                        <p className="text-xs text-slate-700 capitalize">{item.tipo_vencimiento === 'credito' ? 'Por crédito vencido' : 'Por fecha entrega'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── TAB OA: Órdenes Azules ─────────────────────────────────────────── */}
        {tab === 'oa' && canSeeOA && (
          <div>
            <div className="flex gap-3 flex-wrap items-center px-5 py-3 border-b border-slate-100 bg-slate-50/50">
              <span className="text-xs font-semibold text-blue-800 uppercase tracking-wider flex items-center gap-1.5">
                <FileCheck className="w-3.5 h-3.5" /> Órdenes Azules (OA) — sin facturación
              </span>
              <CampoBusqueda className="ml-auto w-72" valor={busquedaOA} onChange={setBusquedaOA}
                placeholder="Buscar OA, cliente, NIT o asesor…" />
            </div>
            <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 390px)', minHeight: '300px' }}>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    {['ODP', 'Fecha Creación', 'Cliente', 'Asesor', 'Est. Taller', 'Facturación', 'Monto Total', 'Abonado', 'Pendiente', 'Estado Caja', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-900 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingOdps ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i}><td colSpan={11} className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td></tr>
                    ))
                  ) : (() => {
                    if (oaFiltradas.length === 0) return (
                      <tr><td colSpan={11} className="text-center py-12 text-slate-700">
                        {busquedaOA.trim() ? `Ninguna Orden Azul coincide con “${busquedaOA.trim()}”.` : 'No hay Órdenes Azules registradas.'}
                      </td></tr>
                    );
                    return oaFiltradas.map((odp: any) => (
                    <tr key={odp.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-4 py-4 font-bold text-indigo-700 whitespace-nowrap cursor-pointer hover:underline" onClick={() => setFichaOdpId(odp.id)}>
                        {odp.numero_odp}
                      </td>
                      <td className="px-4 py-4 text-slate-800 text-xs whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-500" />
                          {fmtFecha(odp.fecha_creacion)}
                        </div>
                      </td>
                      <td className="px-4 py-4 font-semibold text-slate-900 max-w-[280px] truncate" title={odp.cliente?.nombre_razon_social}>
                        {odp.cliente?.nombre_razon_social || '—'}
                      </td>
                      <td className="px-4 py-4 text-slate-800 text-xs whitespace-nowrap">{odp.asesor?.nombre_completo || '—'}</td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${getEstadoODP(odp.estado_produccion).badge}`}
                          title={getEstadoODP(odp.estado_produccion).descripcion}
                        >
                          {getEstadoODP(odp.estado_produccion).label}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold whitespace-nowrap bg-blue-100 text-blue-800 border border-blue-200">
                          <FileCheck className="w-3 h-3" /> NO APLICA
                        </span>
                      </td>
                      <td className="px-4 py-4 font-bold text-slate-900 whitespace-nowrap">
                        {Number(odp.valor_total) > 0 ? fmt(Number(odp.valor_total)) : <span className="text-slate-500 text-xs italic">—</span>}
                      </td>
                      <td className="px-4 py-4 font-bold text-emerald-700 whitespace-nowrap">{fmt(Number(odp.abono) || 0)}</td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {(() => {
                          const pend = calcPendiente(odp);
                          return <span className={`font-bold text-sm ${pend > 0 ? 'text-rose-700' : 'text-slate-500'}`}>{fmt(pend)}</span>;
                        })()}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold border whitespace-nowrap ${
                          odp.estado_caja === 'CANCELADO'        ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                          odp.estado_caja === 'ABONADO'          ? 'bg-blue-100 text-blue-800 border-blue-300' :
                          odp.estado_caja === 'CREDITO_APROBADO' ? 'bg-indigo-100 text-indigo-800 border-indigo-300' :
                          'bg-amber-100 text-amber-800 border-amber-300'
                        }`}>
                          {odp.estado_caja === 'CANCELADO' ? 'Cancelado' :
                           odp.estado_caja === 'ABONADO' ? 'Abonado' :
                           odp.estado_caja === 'CREDITO_APROBADO' ? 'Crédito Aprobado' : 'Pendiente'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        {canPayOA && odp.estado_caja !== 'CANCELADO' && (
                          <button
                            onClick={() => abrirAbonoDeODP(odp)}
                            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 transition-all flex items-center gap-1 whitespace-nowrap"
                          >
                            <Banknote className="w-3.5 h-3.5" /> Registrar Abono
                          </button>
                        )}
                      </td>
                    </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ═══ MODALES COMPARTIDOS: FE Y ABONOS ══════════════════════ */}
      {/* Los mismos componentes que consume la ficha de la ODP. */}
      {feTarget && (
        <FacturaElectronicaModal
          odp={feTarget}
          onClose={() => setFeTarget(null)}
          onSaved={(patch) => aplicarPatchODP(patch.id, patch)}
          onAdicionalesChange={(odpId, facturas) => aplicarPatchODP(odpId, { facturas_adicionales: facturas })}
        />
      )}

      {showAbonoModal && (
        <AbonoFormModal
          odpFija={abonoOdpFija}
          odpsDisponibles={isAsistenteAdmin ? odpsOAPendientes : odpsPendientes}
          onClose={() => { setShowAbonoModal(false); setAbonoOdpFija(null); }}
          onSaved={refrescarTrasAbono}
        />
      )}

      {pagoEnEdicion && (
        <AbonoFormModal
          pago={pagoEnEdicion}
          onClose={() => setPagoEnEdicion(null)}
          onSaved={refrescarTrasAbono}
        />
      )}

      {/* ═══ MODAL EDITAR TOTAL ODP ════════════════════════════════════════ */}
      {showEditTotalModal && editTotalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200">
            <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-3">
                <div className="p-2 bg-indigo-50 rounded-lg">
                  <Calculator className="w-5 h-5 text-indigo-600" />
                </div>
                Modificar Monto ODP
              </h2>
              <button onClick={() => setShowEditTotalModal(false)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEditTotalSubmit} className="p-6 space-y-5">
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                <p className="text-xs font-semibold text-slate-900 uppercase tracking-widest mb-1">ODP Seleccionada</p>
                <p className="text-sm text-slate-800">{editTotalTarget.numero_odp} — {editTotalTarget.cliente?.nombre_razon_social}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-900 mb-1.5 uppercase tracking-wider">Nuevo Valor Total (COP) *</label>
                <input type="text" inputMode="numeric" value={newTotal} onChange={e => setNewTotal(formatMiles(e.target.value))} required
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" />
                <p className="text-[11px] text-slate-600 mt-2 italic px-1">Este cambio afectará el cálculo del saldo pendiente de la orden.</p>
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowEditTotalModal(false)}
                  className="flex-1 py-3.5 font-semibold text-slate-800 bg-white border border-slate-300 rounded-2xl hover:bg-slate-50 transition shadow-sm">Cancelar</button>
                <button type="submit" disabled={submittingTotal}
                  className="flex-1 py-3.5 font-bold text-white bg-indigo-600 rounded-2xl hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 disabled:opacity-50">
                  {submittingTotal ? 'Guardando...' : 'Actualizar Monto'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {pagoAEliminar && (
        <ConfirmarEliminarAbonoModal
          pago={pagoAEliminar}
          onClose={() => setPagoAEliminar(null)}
          onDeleted={refrescarTrasAbono}
        />
      )}

      {fichaOdpId && <ODPFichaModal odpId={fichaOdpId} onClose={() => setFichaOdpId(null)} />}
    </div>
  );
};

export default ContabilidadPage;
