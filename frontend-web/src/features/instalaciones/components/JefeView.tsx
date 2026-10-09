import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { RootState } from '../../../store/store';
import { toast } from 'react-toastify';
import {
  CheckCircle2, Clock, AlertTriangle, MapPin, Calendar,
  Plus, RefreshCw, PackageCheck, PauseCircle, Search,
  Route, History, HardHat, Upload, X as XIcon, Receipt,
  AlertOctagon, Truck,
} from '../../../components/ui/icons';
import ProgramarRutaModal from './ProgramarRutaModal';
import InstaladorGestionTab from './InstaladorGestionTab';
import CerrarAtascadaModal from './CerrarAtascadaModal';
import AgendaTab from './AgendaTab';
import RutaCard from './RutaCard';
import ProgramadosTab, { SubTabProg } from './ProgramadosTab';
import RecorridosTab from './RecorridosTab';
import FolderTabs, { FOLDER_BODY } from '../../../components/FolderTabs';
import ODPFichaModal from '../../odp/components/ODPFichaModal';
import { useDataChangedSocket } from '../../../store/useSocketNotifications';
import { TONO_CLS, estadoPago } from '../utils/estadoInstalacion';
import { enviarEntrega } from '../utils/enviarEntrega';

import API from '../../../services/config';
import { hoyBogotaISO, sumarDiasISO, isoLocal, fmtDia } from '../../../utils/fechas';

// ─── Helpers de fecha ─────────────────────────────────────────────────────────

// Semana y mes de Bogotá. `toISOString()` convertía a UTC: después de las 7 p.m. el
// "lunes" o el "domingo" podían correrse un día.
const getLunes = (): string => {
  const hoy = hoyBogotaISO();
  const dia = new Date(`${hoy}T00:00:00Z`).getUTCDay();
  return sumarDiasISO(hoy, dia === 0 ? -6 : 1 - dia);
};

const getDomingo = (): string => sumarDiasISO(getLunes(), 6);

const getInicioMes = (): string => `${hoyBogotaISO().slice(0, 8)}01`;

const getFinMes = (): string => {
  const [a, m] = hoyBogotaISO().split('-').map(Number);
  return isoLocal(new Date(a, m, 0));
};

// Por qué una instalación quedó sin cerrar. Los códigos los calcula getODPsAtascadas
// en el backend; aquí solo se traducen a lenguaje del jefe de producción.
// (PAUSADA_SIN_RETOMAR dejó de existir el 2026-10-05: pausar saca la ODP de la ruta.)
const MOTIVO_ATASCADA: Record<string, { label: string; cls: string; detalle: string }> = {
  INICIADA_SIN_FINALIZAR:    { label: 'Instalando sin finalizar', cls: 'bg-orange-100 text-orange-800', detalle: 'El instalador entró a la obra pero nunca finalizó en la app. La orden sigue abierta.' },
  RUTA_CERRADA_SIN_INSTALAR: { label: 'Ruta cerrada sin instalar', cls: 'bg-rose-100 text-rose-800',    detalle: 'El conductor cerró la ruta y esta parada nunca se atendió.' },
  DANO_SIN_RESOLVER:         { label: 'Daño sin resolver',        cls: 'bg-red-100 text-red-800',       detalle: 'Se reportó un daño en la instalación y sigue sin resolverse.' },
  PARADA_VENCIDA:            { label: 'Parada vencida',           cls: 'bg-amber-100 text-amber-800',   detalle: 'La fecha programada ya pasó y la parada sigue pendiente.' },
  SIN_RUTA:                  { label: 'Sin ruta asociada',        cls: 'bg-slate-200 text-slate-800',   detalle: 'No tiene ninguna parada de ruta que pueda cerrarla.' },
};

// ─── Componente principal ─────────────────────────────────────────────────────

/** Roles que el backend admite en /api/rutas/atascadas (rutas.routes.ts, requireRole; root pasa
 *  siempre). Los roles de solo lectura (asesor, compras, asistente, marketing) abren esta vista
 *  pero no ese endpoint: pedírselo devolvía 403 y, dentro del Promise.all, vaciaba toda la carga
 *  ("Error al cargar datos"). Si el backend cambia esa lista, cambiarla aquí también. */
const ROLES_PENDIENTES_CIERRE = ['root', 'admin', 'gerencia', 'jefe_produccion', 'produccion'];

type MainTab = 'agenda' | 'listos' | 'pago' | 'factura' | 'produccion' | 'programados' | 'recorridos' | 'completados' | 'instaladores' | 'atascadas';
type SubTabComp = 'completadas' | 'canceladas';

const JefeView: React.FC<{ readOnly?: boolean }> = ({ readOnly = false }) => {
  const token = sessionStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };
  const rol = useSelector((state: RootState) => ((state as any).auth.user?.rol || '') as string);
  const puedeVerPendientesCierre = ROLES_PENDIENTES_CIERRE.includes(rol);

  // State
  const [mainTab, setMainTab] = useState<MainTab>('agenda');
  const [subTabProg, setSubTabProg] = useState<SubTabProg>('programada');
  const [subTabComp, setSubTabComp] = useState<SubTabComp>('completadas');
  const [odps, setOdps] = useState<{ listos: any[]; espera_pago: any[]; espera_produccion: any[]; espera_factura: any[] }>({ listos: [], espera_pago: [], espera_produccion: [], espera_factura: [] });
  const [rutas, setRutas] = useState<any[]>([]);
  const [atascadas, setAtascadas] = useState<any[]>([]);
  const [rutasHistorial, setRutasHistorial] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [, setHistorialCargado] = useState(false);
  const [fechaDesde, setFechaDesde] = useState<string>(getLunes());
  const [fechaHasta, setFechaHasta] = useState<string>(getDomingo());
  const [showModal, setShowModal] = useState(false);
  const [rutaEditar, setRutaEditar] = useState<any>(null);
  const [odpsParaModal, setOdpsParaModal] = useState<any[]>([]);
  const [preseleccionRuta, setPreseleccionRuta] = useState<{ odps: any[]; fecha: string } | null>(null);
  const [pauseModal, setPauseModal] = useState<{ rutaOdpId: number; numeroOdp: string } | null>(null);
  const [pauseMotivo, setPauseMotivo] = useState('');
  const [cierreModal, setCierreModal] = useState<{ odpId: number; numeroOdp: string; cliente?: string | null } | null>(null);
  const [cerrando, setCerrando] = useState(false);
  const [finalizarModal, setFinalizarModal] = useState<{ rutaOdpId: number; numeroOdp: string } | null>(null);
  const [fotosFinalizar, setFotosFinalizar] = useState<File[]>([]);
  const [datosReceptor, setDatosReceptor] = useState('');
  const [savingFinalizar, setSavingFinalizar] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [selectedOdpId, setSelectedOdpId] = useState<number | null>(null);

  // Carga datos principales
  const cargar = useCallback(async () => {
    setLoading(true);
    // Cada bloque carga por su cuenta: si uno falla, los demás se muestran igual y el aviso dice
    // cuál no cargó. Antes un solo error (Promise.all) dejaba la pantalla vacía.
    const [gestion, rutasRes, atascadasRes] = await Promise.allSettled([
      axios.get(`${API}/api/rutas/odps-para-gestion`, { headers }),
      axios.get(`${API}/api/rutas`, { headers }),
      puedeVerPendientesCierre ? axios.get(`${API}/api/rutas/atascadas`, { headers }) : Promise.resolve({ data: [] }),
    ]);
    const fallidos: string[] = [];
    if (gestion.status === 'fulfilled') setOdps(gestion.value.data); else fallidos.push('ODPs por instalar');
    if (rutasRes.status === 'fulfilled') setRutas(rutasRes.value.data); else fallidos.push('rutas programadas');
    if (atascadasRes.status === 'fulfilled') setAtascadas(atascadasRes.value.data); else fallidos.push('pendientes de cierre');
    if (fallidos.length) {
      toast.error(`No se pudieron cargar: ${fallidos.join(', ')}. Lo demás está actualizado; pulsa el botón Recargar (↻) para reintentar.`);
    }
    setLoading(false);
  }, [puedeVerPendientesCierre]); // eslint-disable-line react-hooks/exhaustive-deps -- headers se recrea en cada render

  // Carga historial (lazy)
  const cargarHistorial = useCallback(async (desde: string, hasta: string) => {
    setLoadingHistorial(true);
    try {
      const res = await axios.get(`${API}/api/rutas/historial`, { headers, params: { desde, hasta } });
      setRutasHistorial(res.data);
      setHistorialCargado(true);
    } catch { toast.error('Error al cargar historial'); }
    finally { setLoadingHistorial(false); }
  }, []); // eslint-disable-line

  useEffect(() => { cargar(); }, [cargar]);

  // Tiempo real: el backend emite 'rutas' en cada cambio de rutas, paradas o agenda
  // (emitirCambioRutas). El hook espera 600 ms y no recarga con la pestaña oculta.
  const refrescarPorSocket = useCallback(() => {
    cargar();
    if (mainTab === 'completados') cargarHistorial(fechaDesde, fechaHasta);
  }, [cargar, cargarHistorial, mainTab, fechaDesde, fechaHasta]);
  useDataChangedSocket('rutas', refrescarPorSocket);

  useEffect(() => {
    if (mainTab === 'completados') {
      setHistorialCargado(false);
      cargarHistorial(fechaDesde, fechaHasta);
    }
  }, [mainTab, fechaDesde, fechaHasta]); // eslint-disable-line

  // Búsqueda — global: filtra todas las pestañas a la vez (no solo la abierta).
  const q = busqueda.toLowerCase().trim();

  // Completados/Canceladas: con 3+ caracteres se busca en TODO el historial (backend, ignora
  // el período). Con menos, solo se filtra el período cargado, para no traer media BD con "a".
  const qHistorial = q.length >= 3 ? q : '';
  const [busquedaHistorial, setBusquedaHistorial] = useState<{ q: string; rutas: any[] } | null>(null);
  useEffect(() => {
    if (!qHistorial) { setBusquedaHistorial(null); return; }
    // `vigente` descarta respuestas de un texto ya reemplazado (escritura rápida, respuestas desordenadas).
    let vigente = true;
    const timer = setTimeout(async () => {
      try {
        const res = await axios.get(`${API}/api/rutas/historial`, { headers, params: { q: qHistorial } });
        if (vigente) setBusquedaHistorial({ q: qHistorial, rutas: res.data });
      } catch {
        if (vigente) {
          setBusquedaHistorial({ q: qHistorial, rutas: [] });
          toast.error('No se pudo buscar en el historial de rutas (Completados). Las demás pestañas sí muestran resultados; intenta de nuevo en un momento.');
        }
      }
    }, 400);
    return () => { vigente = false; clearTimeout(timer); };
  }, [qHistorial]); // eslint-disable-line react-hooks/exhaustive-deps -- headers se recrea en cada render
  const buscandoHistorial = !!qHistorial && busquedaHistorial?.q !== qHistorial;
  const historialFuente = useMemo(
    () => (qHistorial ? (busquedaHistorial?.q === qHistorial ? busquedaHistorial.rutas : []) : rutasHistorial),
    [qHistorial, busquedaHistorial, rutasHistorial]
  );

  // Segmentación de rutas
  const rutasProgramadas  = useMemo(() => rutas.filter((r: any) => r.estado === 'programada'), [rutas]);
  const rutasEnCurso      = useMemo(() => rutas.filter((r: any) => r.estado === 'en_curso'), [rutas]);
  const rutasCompletadas  = useMemo(() => historialFuente.filter((r: any) => r.estado === 'completada'), [historialFuente]);
  const rutasCanceladas   = useMemo(() => historialFuente.filter((r: any) => r.estado === 'cancelada'), [historialFuente]);

  const filtrarOdps = (lista: any[]) =>
    q ? lista.filter((o: any) =>
      o.numero_odp?.toLowerCase().includes(q) ||
      o.cliente?.nombre_razon_social?.toLowerCase().includes(q)
    ) : lista;

  const filtrarRutas = (lista: any[]) =>
    q ? lista.filter((r: any) =>
      r.ruta_odps?.some((ro: any) =>
        ro.odp?.numero_odp?.toLowerCase().includes(q) ||
        ro.odp?.cliente?.nombre_razon_social?.toLowerCase().includes(q)
      )
    ) : lista;

  // Handlers
  const handleEditar = (ruta: any) => { setPreseleccionRuta(null); setOdpsParaModal(odps.listos); setRutaEditar(ruta); setShowModal(true); };
  // Crear ruta desde un día de la agenda: precarga las ODPs de ese día
  const handleCrearRutaDia = (odpsDia: any[], fecha: string) => {
    setOdpsParaModal(odps.listos);
    setRutaEditar(null);
    setPreseleccionRuta({ odps: odpsDia, fecha });
    setShowModal(true);
  };
  const handleCancelar = async (rutaId: number) => {
    if (!window.confirm(`¿Cancelar la ruta #${rutaId}? Sus ODPs pendientes volverán a "Listo para instalar".`)) return;
    try { await axios.delete(`${API}/api/rutas/${rutaId}`, { headers }); toast.success('Ruta cancelada'); cargar(); }
    catch (e: any) { toast.error(e.response?.data?.error || 'Error al cancelar'); }
  };
  // Unir: cada origen se mueve a la destino con su propia llamada (cada una es atómica en el
  // backend). Si una falla, las anteriores ya quedaron unidas y la pantalla se recarga igual.
  const handleUnir = async (destino: any, origenes: any[]) => {
    const lista = origenes.map((o) => `#${o.id}`).join(', ');
    if (!window.confirm(`¿Unir ${origenes.length === 1 ? 'la ruta' : 'las rutas'} ${lista} en la ruta #${destino.id}?\n\nSus paradas pasan al final de la ruta #${destino.id}, se suma su personal y ${origenes.length === 1 ? 'esa ruta queda cancelada' : 'esas rutas quedan canceladas'}. Las ODPs siguen programadas.`)) return;
    let unidas = 0;
    try {
      for (const o of origenes) {
        await axios.post(`${API}/api/rutas/${destino.id}/unir`, { origen_id: o.id }, { headers });
        unidas += 1;
      }
      toast.success(`Rutas unidas en la #${destino.id}`);
    } catch (e: any) {
      toast.error(`${unidas ? `Se unieron ${unidas} de ${origenes.length}. ` : ''}${e.response?.data?.error || 'No se pudieron unir las rutas.'}`);
    } finally {
      cargar();
    }
  };
  // Orden del día de un equipo (vista "Por equipo"). Devuelve si quedó guardado para que la
  // columna salga del modo edición; ante un 409 recarga, porque la lista ya no es la vigente.
  const handleOrdenarDia = async (fecha: string, paradas: number[]): Promise<boolean> => {
    try {
      await axios.post(`${API}/api/rutas/ordenar-dia`, { fecha, paradas }, { headers });
      toast.success('Orden guardado. El instalador y el conductor ya lo ven así.');
      cargar();
      return true;
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'No se pudo guardar el orden de las paradas. Intenta de nuevo.');
      if (e.response?.status === 409) cargar();
      return false;
    }
  };

  const handleFinalizarODP = (rutaOdpId: number, numeroOdp: string) => {
    setFotosFinalizar([]);
    setDatosReceptor('');
    setFinalizarModal({ rutaOdpId, numeroOdp });
  };

  const handleConfirmarFinalizar = async () => {
    if (!finalizarModal) return;
    if (!fotosFinalizar.length) { toast.error('La foto de evidencia es obligatoria'); return; }
    setSavingFinalizar(true);
    try {
      // Mismo camino que el instalador: compresión, límite de espera y "ya registrada".
      const r = await enviarEntrega(
        finalizarModal.rutaOdpId,
        fotosFinalizar,
        datosReceptor.trim() ? { datos_receptor: datosReceptor.trim() } : {},
        () => {}
      );
      if (r.yaRegistrada) toast.info(`${finalizarModal.numeroOdp}: ${r.mensaje ?? 'la entrega ya estaba registrada.'}`);
      else toast.success(`ODP ${finalizarModal.numeroOdp} marcada como entregada`);
      setFinalizarModal(null);
      cargar();
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo registrar la entrega. Intenta de nuevo.');
    } finally {
      setSavingFinalizar(false);
    }
  };
  const handlePausar = (rutaOdpId: number, numeroOdp: string) => { setPauseMotivo(''); setPauseModal({ rutaOdpId, numeroOdp }); };
  const handleConfirmarPausa = async () => {
    if (!pauseModal) return;
    if (!pauseMotivo.trim()) { toast.error('Ingresa el motivo de la pausa'); return; }
    try {
      await axios.post(`${API}/api/rutas/ruta-odp/${pauseModal.rutaOdpId}/pausar`, { motivo_pausa: pauseMotivo.trim() }, { headers });
      toast.success(`Instalación de ${pauseModal.numeroOdp} pausada`);
      setPauseModal(null);
      cargar();
    } catch (e: any) { toast.error(e.response?.data?.error || 'Error al pausar'); }
  };

  // Pendientes de cierre: reprogramar (→ Listo para instalar) o cerrar administrativamente.
  // Ambas acciones van por odp_id, no por ruta_odp_id: hay ODPs colgadas que nunca
  // tuvieron parada de ruta y aun así deben poder gestionarse desde aquí.
  const handleReprogramarAtascada = async (odpId: number, numeroOdp: string) => {
    if (!window.confirm(`¿Reprogramar ${numeroOdp}? Volverá a "Listo para instalar" para asignarla a una ruta nueva.`)) return;
    try {
      await axios.post(`${API}/api/rutas/atascadas/${odpId}/reprogramar`, {}, { headers });
      toast.success(`${numeroOdp} reprogramada`);
      cargar();
    } catch (e: any) { toast.error(e.response?.data?.error || 'Error al reprogramar'); }
  };
  const handleConfirmarCierre = async (motivo: string) => {
    if (!cierreModal) return;
    setCerrando(true);
    try {
      await axios.post(`${API}/api/rutas/atascadas/${cierreModal.odpId}/entregar`, { motivo }, { headers });
      toast.success(`${cierreModal.numeroOdp} marcada como entregada`);
      setCierreModal(null);
      cargar();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al marcar entregada');
    } finally {
      setCerrando(false);
    }
  };

  // Tabs principales
  const MAIN_TABS = [
    { key: 'agenda',        label: 'Agenda',                count: null,                            icon: Calendar,      color: 'text-indigo-600',  soloEscritura: false },
    { key: 'listos',        label: 'Listo para instalar',  count: odps.listos.length,              icon: CheckCircle2,  color: 'text-emerald-600', soloEscritura: false },
    { key: 'pago',          label: 'Espera de pago',        count: odps.espera_pago.length,         icon: Clock,         color: 'text-amber-600',   soloEscritura: false },
    { key: 'factura',       label: 'Espera de factura',     count: odps.espera_factura.length,      icon: Receipt,       color: 'text-orange-600',  soloEscritura: false },
    { key: 'produccion',    label: 'Espera de producción',  count: odps.espera_produccion.length,   icon: AlertTriangle, color: 'text-red-500',     soloEscritura: false },
    { key: 'programados',   label: 'Programados',           count: rutas.length,                    icon: Route,         color: 'text-indigo-600',  soloEscritura: false },
    { key: 'recorridos',    label: 'Recorridos',            count: null,                            icon: Truck,         color: 'text-indigo-600',  soloEscritura: false },
    { key: 'atascadas',     label: 'Pendientes de cierre',  count: atascadas.length,                icon: AlertOctagon,  color: 'text-rose-600',    soloEscritura: false },
    { key: 'completados',   label: 'Completados',           count: null,                            icon: History,       color: 'text-slate-700',   soloEscritura: false },
    { key: 'instaladores',  label: 'Instaladores',          count: null,                            icon: HardHat,       color: 'text-teal-600',    soloEscritura: true  },
  ] as const;

  // ODP list actual según tab
  const odpListaActual = mainTab === 'listos' ? odps.listos : mainTab === 'pago' ? odps.espera_pago : mainTab === 'factura' ? odps.espera_factura : odps.espera_produccion;
  const odpsMostradas  = filtrarOdps(odpListaActual);

  // Atascadas: estructura plana (cliente es string), filtro propio
  const atascadasMostradas = q
    ? atascadas.filter((a: any) =>
        a.numero_odp?.toLowerCase().includes(q) ||
        a.cliente?.toLowerCase().includes(q))
    : atascadas;

  // Rutas por sub-tab, ya filtradas por la búsqueda
  const rutasProgFiltradas = { programada: filtrarRutas(rutasProgramadas), en_curso: filtrarRutas(rutasEnCurso) };
  const rutasCompFiltradas = { completadas: filtrarRutas(rutasCompletadas), canceladas: filtrarRutas(rutasCanceladas) };
  const rutasComp = rutasCompFiltradas[subTabComp];

  // Coincidencias por pestaña (solo con búsqueda activa). Agenda e Instaladores no participan:
  // las ODPs de la Agenda son las mismas de Listo/Pago/Factura.
  const coincidencias: Partial<Record<MainTab, number>> = {
    listos:      filtrarOdps(odps.listos).length,
    pago:        filtrarOdps(odps.espera_pago).length,
    factura:     filtrarOdps(odps.espera_factura).length,
    produccion:  filtrarOdps(odps.espera_produccion).length,
    programados: rutasProgFiltradas.programada.length + rutasProgFiltradas.en_curso.length,
    atascadas:   puedeVerPendientesCierre ? atascadasMostradas.length : 0,
    completados: rutasCompFiltradas.completadas.length + rutasCompFiltradas.canceladas.length,
  };
  const ORDEN_BUSQUEDA: MainTab[] = ['listos', 'pago', 'factura', 'produccion', 'programados', 'atascadas', 'completados'];
  const firmaCoincidencias = ORDEN_BUSQUEDA.map(k => coincidencias[k]).join(',')
    + `|${rutasProgFiltradas.programada.length},${rutasProgFiltradas.en_curso.length}`
    + `|${rutasCompFiltradas.completadas.length},${rutasCompFiltradas.canceladas.length}`;

  // Salto automático: si la pestaña (o sub-pestaña) abierta no tiene coincidencias, ir a la
  // primera que sí tenga. Si la abierta tiene, no se mueve. Solo reacciona a cambios de texto
  // o de resultados, así que si el usuario abre a mano una pestaña vacía no se le devuelve.
  useEffect(() => {
    if (!q || loading) return;
    let destino = mainTab;
    if (!coincidencias[mainTab]) {
      const primera = ORDEN_BUSQUEDA.find(k => (coincidencias[k] ?? 0) > 0);
      if (!primera) return;
      destino = primera;
      setMainTab(primera);
    }
    if (destino === 'programados' && !rutasProgFiltradas[subTabProg].length) {
      setSubTabProg(subTabProg === 'programada' ? 'en_curso' : 'programada');
    }
    if (destino === 'completados' && !rutasCompFiltradas[subTabComp].length) {
      setSubTabComp(subTabComp === 'completadas' ? 'canceladas' : 'completadas');
    }
  }, [q, loading, firmaCoincidencias]); // eslint-disable-line react-hooks/exhaustive-deps -- la firma resume las coincidencias

  const propsRutaCard = { readOnly, onEditar: handleEditar, onCancelar: handleCancelar, onFinalizar: handleFinalizarODP, onPausar: handlePausar, onVerODP: setSelectedOdpId };

  return (
    <div className="p-5 w-full space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gestión de Instalaciones</h1>
          <p className="text-sm text-slate-800 mt-0.5">Programa rutas y monitorea el avance de instalaciones</p>
        </div>
        <div className="flex gap-2">
          <button onClick={cargar} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50" title="Recargar">
            <RefreshCw className="w-4 h-4 text-slate-700" />
          </button>
          {!readOnly && (
            <button
              onClick={() => { setPreseleccionRuta(null); setOdpsParaModal(odps.listos); setRutaEditar(null); setShowModal(true); }}
              disabled={!odps.listos.length}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 shadow-sm"
            >
              <Plus className="w-4 h-4" /> Nueva Ruta
            </button>
          )}
        </div>
      </div>

      {/* Buscador */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar por N° ODP o nombre de cliente..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder-slate-500"
        />
      </div>

      {/* Tabs principales — estilo carpeta (FolderTabs) */}
      <div className="relative">
        <FolderTabs
          tabs={MAIN_TABS
            // "Pendientes de cierre" se muestra siempre, aunque esté vacía: antes se ocultaba
            // al llegar a cero y el jefe no encontraba dónde cerrar una instalación cuando
            // volvía a aparecer una. Se comporta como las demás tabs.
            .filter(t => !t.soloEscritura || !readOnly)
            // Pendientes de cierre solo para los roles que el backend deja consultarla.
            .filter(t => t.key !== 'atascadas' || puedeVerPendientesCierre)
            // Con búsqueda activa el contador muestra las coincidencias, no el total.
            .map(t => ({ key: t.key, label: t.label, icon: React.createElement(t.icon, { className: 'w-4 h-4' }), badge: (q ? coincidencias[t.key] : t.count) ?? undefined }))}
          activeKey={mainTab}
          onChange={(k) => setMainTab(k as MainTab)}
        />

        {/* Cuerpo de la carpeta (panel de contenido) */}
        <div className={FOLDER_BODY}>

        {/* ── Contenido tab Agenda ── */}
        {mainTab === 'agenda' && (
          <AgendaTab
            odpsListos={odps.listos}
            odpsEsperaPago={odps.espera_pago}
            odpsEsperaFactura={odps.espera_factura}
            readOnly={readOnly}
            onVerODP={setSelectedOdpId}
            onCrearRutaDia={handleCrearRutaDia}
            onAgendaChange={cargar}
          />
        )}

        {/* ── Contenido tabs ODP (listos / pago / factura / produccion) ── */}
        {(mainTab === 'listos' || mainTab === 'pago' || mainTab === 'factura' || mainTab === 'produccion') && (
          loading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
          ) : odpsMostradas.length === 0 ? (
            <div className="py-12 text-center text-slate-700 text-sm">{q ? 'Sin resultados para la búsqueda en esta pestaña.' : 'No hay ODPs en esta categoría'}</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {odpsMostradas.map((odp: any) => (
                <div key={odp.id} className="flex items-center gap-4 p-4 hover:bg-slate-50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span
                        className="font-bold text-slate-900 text-sm hover:text-indigo-700 cursor-pointer hover:underline underline-offset-2"
                        onClick={() => setSelectedOdpId(odp.id)}
                      >
                        {odp.numero_odp}
                      </span>
                      {(() => { const pago = estadoPago(odp); return (
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${TONO_CLS[pago.tono]}`}>{pago.label}</span>
                      ); })()}
                      {odp.ultima_pausa && (
                        <span
                          className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-violet-100 text-violet-800 flex items-center gap-1"
                          title={odp.ultima_pausa.motivo_pausa ? `Motivo: ${odp.ultima_pausa.motivo_pausa}` : undefined}
                        >
                          <PauseCircle className="w-3 h-3" />
                          Pausada en Ruta #{odp.ultima_pausa.ruta_id} — retomar
                        </span>
                      )}
                      {odp.agenda && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-100 text-indigo-800 flex items-center gap-1">
                          <Calendar className="w-2.5 h-2.5" />
                          Agendada {fmtDia(odp.agenda.fecha_tentativa, { day: '2-digit', month: 'short' })}
                        </span>
                      )}
                      {mainTab === 'factura' && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-100 text-orange-800">Sin factura</span>}
                    </div>
                    <p className="text-sm text-slate-900 font-semibold">{odp.cliente?.nombre_razon_social}</p>
                    {odp.ultima_pausa?.motivo_pausa && (
                      <p className="text-xs text-violet-800 mt-0.5">Motivo de la pausa: «{odp.ultima_pausa.motivo_pausa}»</p>
                    )}
                    {odp.direccion_instalacion && (
                      <p className="text-xs text-slate-800 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3 text-rose-500" />{odp.direccion_instalacion}</p>
                    )}
                  </div>
                  {odp.fecha_entrega && (
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-slate-700">Entrega</p>
                      <p className="text-sm font-semibold text-slate-900">
                        {fmtDia(odp.fecha_entrega, { day: '2-digit', month: 'short' })}
                      </p>
                    </div>
                  )}
                  {mainTab === 'listos' && !readOnly && (
                    <button
                      // Abre la ruta nueva con esta ODP ya cargada: fecha de su agenda si la tiene;
                      // si no, el modal pone la de hoy.
                      onClick={() => handleCrearRutaDia([odp], odp.agenda?.fecha_tentativa ?? '')}
                      className="flex-shrink-0 px-3 py-1.5 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-lg text-xs font-semibold hover:bg-indigo-100"
                    >
                      + Agregar a ruta
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        )}

        {/* ── Contenido tab Programados ── */}
        {mainTab === 'programados' && (
          <ProgramadosTab
            rutasFiltradas={rutasProgFiltradas}
            subTab={subTabProg}
            onSubTab={setSubTabProg}
            loading={loading}
            hayBusqueda={!!q}
            cardProps={propsRutaCard}
            onUnir={handleUnir}
            onOrdenarDia={handleOrdenarDia}
          />
        )}

        {/* ── Contenido tab Recorridos (camión del día por conductor) ── */}
        {mainTab === 'recorridos' && (
          <RecorridosTab readOnly={readOnly} onVerODP={setSelectedOdpId} />
        )}

        {/* ── Contenido tab Pendientes de cierre ── */}
        {mainTab === 'atascadas' && (
          <div className="p-4 space-y-3">
            {/* El aviso solo tiene sentido si hay algo que cerrar: con la lista vacía
                contradecía al mensaje de "no hay pendientes". */}
            {atascadasMostradas.length > 0 && (
              <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs text-rose-800">
                <AlertOctagon className="w-4 h-4 mt-0.5 shrink-0 text-rose-600" />
                <span>
                  Órdenes que siguen vivas: el instalador entró a la obra y nunca finalizó, la fecha
                  programada ya pasó, o el trabajo terminó pero dejó una parada de ruta abierta.
                  <b> Reprográmalas</b> para asignarlas a una ruta nueva, o <b>márcalas como entregadas</b>
                  {' '}si la instalación sí se realizó y solo falta el registro.
                </span>
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-rose-600" /></div>
            ) : atascadasMostradas.length === 0 ? (
              <div className="py-10 text-center text-slate-700 text-sm">
                {q ? 'Sin resultados para la búsqueda.' : 'No hay instalaciones pendientes de cierre. 🎉'}
              </div>
            ) : (
              <div className="space-y-2.5">
                {atascadasMostradas.map((a: any) => {
                  const m = MOTIVO_ATASCADA[a.motivo] ?? { label: 'Sin cerrar', cls: 'bg-slate-100 text-slate-800' };
                  return (
                  <div key={a.odp_id} className="border border-slate-200 rounded-2xl p-4 bg-white shadow-card hover:shadow-card-hover transition-shadow">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button onClick={() => setSelectedOdpId(a.odp_id)} className="font-bold text-sm text-indigo-700 hover:underline">
                            {a.numero_odp}
                          </button>
                          {a.es_no_conformidad && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800">REPROCESO</span>}
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${m.cls}`}>{m.label}</span>
                          {a.dias_vencida != null && a.dias_vencida > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-900">
                              {a.dias_vencida} {a.dias_vencida === 1 ? 'día' : 'días'}
                            </span>
                          )}
                          {a.ruta_id && (
                            <span className="text-[11px] text-slate-700">Ruta #{a.ruta_id}</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-900 font-semibold mt-1 truncate">{a.cliente || 'Sin cliente'}</p>
                        {a.direccion_instalacion && (
                          <p className="text-xs text-slate-700 mt-0.5 flex items-center gap-1 truncate">
                            <MapPin className="w-3 h-3 shrink-0 text-rose-500" /> {a.direccion_instalacion}
                          </p>
                        )}
                        {m.detalle && (
                          <p className="text-[11px] text-slate-700 mt-1">{m.detalle}</p>
                        )}
                        <div className="flex items-center gap-2 flex-wrap mt-1">
                          <p className="text-[11px] text-slate-700">Asesor: {a.asesor || '—'}</p>
                          {/* Facturada y pagada = señal fuerte de que la instalación sí ocurrió */}
                          {a.estado_facturacion === 'FACTURADA' && (
                            <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-800">Facturada</span>
                          )}
                          {a.estado_caja === 'CANCELADO' && (
                            <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800">Pagada</span>
                          )}
                        </div>
                        {(a.motivo_pausa || a.descripcion_dano) && (
                          <p className="text-[11px] text-slate-700 italic mt-1 truncate">
                            "{a.motivo_pausa || a.descripcion_dano}"
                          </p>
                        )}
                      </div>
                      {!readOnly && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleReprogramarAtascada(a.odp_id, a.numero_odp)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                          >
                            <RefreshCw className="w-3.5 h-3.5" /> Reprogramar
                          </button>
                          <button
                            onClick={() => setCierreModal({ odpId: a.odp_id, numeroOdp: a.numero_odp, cliente: a.cliente })}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                          >
                            <PackageCheck className="w-3.5 h-3.5" /> Marcar entregada
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Contenido tab Completados ── */}
        {mainTab === 'completados' && (
          <div className="p-4 space-y-4">
            {/* Con búsqueda de 3+ caracteres el período no aplica: se busca en todo el historial */}
            {qHistorial && (
              <div className="flex items-start gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5 text-xs text-indigo-800">
                <Search className="w-4 h-4 mt-px shrink-0 text-indigo-600" />
                <span>Buscando en todo el historial, sin importar el período (máx. 50 rutas, las más recientes). Borra la búsqueda para volver al período elegido.</span>
              </div>
            )}

            {/* Filtro por fechas */}
            <div className={`flex items-center gap-3 flex-wrap ${qHistorial ? 'opacity-50 pointer-events-none' : ''}`} aria-disabled={!!qHistorial}>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-900">Período</span>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={fechaDesde}
                  onChange={e => setFechaDesde(e.target.value)}
                  className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <span className="text-slate-500 text-xs">—</span>
                <input
                  type="date"
                  value={fechaHasta}
                  onChange={e => setFechaHasta(e.target.value)}
                  className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              {/* Atajos */}
              <div className="flex gap-1.5">
                {[
                  { label: 'Esta semana', desde: getLunes(), hasta: getDomingo() },
                  { label: 'Este mes',    desde: getInicioMes(), hasta: getFinMes() },
                ].map(atajo => (
                  <button
                    key={atajo.label}
                    onClick={() => { setFechaDesde(atajo.desde); setFechaHasta(atajo.hasta); }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${fechaDesde === atajo.desde && fechaHasta === atajo.hasta ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                  >
                    {atajo.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sub-tabs */}
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
              {([
                { key: 'completadas', label: 'Completadas', count: rutasCompFiltradas.completadas.length, cls: 'text-emerald-700 bg-white' },
                { key: 'canceladas',  label: 'Canceladas',  count: rutasCompFiltradas.canceladas.length,  cls: 'text-slate-800 bg-white' },
              ] as const).map(st => (
                <button
                  key={st.key}
                  onClick={() => setSubTabComp(st.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${subTabComp === st.key ? st.cls + ' shadow-sm' : 'text-slate-700 hover:text-slate-900'}`}
                >
                  {st.label}
                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-semibold ${subTabComp === st.key ? 'bg-slate-100' : 'bg-slate-200 text-slate-700'}`}>
                    {st.count}
                  </span>
                </button>
              ))}
            </div>

            {(qHistorial ? buscandoHistorial : loadingHistorial) ? (
              <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600" /></div>
            ) : rutasComp.length === 0 ? (
              <div className="py-10 text-center text-slate-700 text-sm">
                {q ? 'Sin resultados para la búsqueda.' : `No hay rutas ${subTabComp} en el período seleccionado.`}
              </div>
            ) : (
              <div className="space-y-3">
                {rutasComp.map((r: any) => <RutaCard key={r.id} ruta={r} {...propsRutaCard} historial />)}
              </div>
            )}
          </div>
        )}

        {/* ── Contenido tab Instaladores ── */}
        {mainTab === 'instaladores' && !readOnly && (
          <InstaladorGestionTab />
        )}
        </div>
      </div>

      {/* Modal programar ruta */}
      {showModal && (
        <ProgramarRutaModal
          odpsDisponibles={odpsParaModal}
          rutaExistente={rutaEditar}
          odpsPreseleccionadas={preseleccionRuta?.odps}
          fechaPreseleccion={preseleccionRuta?.fecha}
          onClose={() => { setShowModal(false); setRutaEditar(null); setPreseleccionRuta(null); }}
          onSaved={() => { setShowModal(false); setRutaEditar(null); setPreseleccionRuta(null); cargar(); }}
        />
      )}

      {/* Modal registrar entrega con foto */}
      {finalizarModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <PackageCheck className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="font-bold text-slate-900 text-sm">Registrar entrega</p>
                  <p className="text-xs text-slate-700">{finalizarModal.numeroOdp}</p>
                </div>
              </div>
              <button onClick={() => setFinalizarModal(null)} className="p-2 rounded-lg hover:bg-slate-100">
                <XIcon className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Fotos evidencia */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-900">
                    Fotos de evidencia *
                  </label>
                  <span className="text-[11px] text-slate-700 font-medium">{fotosFinalizar.length}/10</span>
                </div>
                {fotosFinalizar.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {fotosFinalizar.map((f, i) => (
                      <div key={i} className="relative rounded-xl overflow-hidden border border-slate-200 aspect-square">
                        <img src={URL.createObjectURL(f)} alt={`Evidencia ${i + 1}`} className="w-full h-full object-cover" />
                        <button onClick={() => setFotosFinalizar(prev => prev.filter((_, j) => j !== i))}
                          className="absolute top-1 right-1 p-1 rounded-full bg-slate-900/60 text-white hover:bg-red-600">
                          <XIcon className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {fotosFinalizar.length < 10 && (
                  <label className="flex flex-col items-center justify-center gap-1 w-full h-20 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-indigo-300 hover:bg-indigo-50 transition-all">
                    <input type="file" accept="image/*" multiple className="hidden"
                      onChange={e => {
                        const files = Array.from(e.target.files ?? []);
                        const restantes = 10 - fotosFinalizar.length;
                        if (files.length > restantes) return toast.error(`Máximo 10 fotos. Puedes agregar ${restantes} más.`);
                        setFotosFinalizar(prev => [...prev, ...files]);
                      }}
                    />
                    <Upload className="w-5 h-5 text-slate-500" />
                    <span className="text-[11px] text-slate-700 font-medium">Agregar foto{fotosFinalizar.length > 0 ? ' más' : ''}</span>
                  </label>
                )}
              </div>

              {/* Datos receptor */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-900 mb-1">
                  Nombre de quien recibe <span className="normal-case font-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={datosReceptor}
                  onChange={e => setDatosReceptor(e.target.value)}
                  placeholder="Ej. Carlos Mendoza, portero, propietario..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 pt-0 flex gap-3">
              <button
                onClick={() => setFinalizarModal(null)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-900 font-semibold text-sm rounded-xl hover:bg-slate-200 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarFinalizar}
                disabled={savingFinalizar || !fotosFinalizar.length}
                className="flex-[2] py-2.5 bg-emerald-600 text-white font-semibold text-sm rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition shadow-sm"
              >
                {savingFinalizar ? 'Guardando...' : 'Confirmar entrega'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ODPFichaModal */}
      {selectedOdpId && (
        <ODPFichaModal
          odpId={selectedOdpId}
          onClose={() => setSelectedOdpId(null)}
        />
      )}

      {/* Cierre administrativo de una instalación sin registrar (motivo obligatorio) */}
      {cierreModal && (
        <CerrarAtascadaModal
          numeroOdp={cierreModal.numeroOdp}
          cliente={cierreModal.cliente}
          guardando={cerrando}
          onCancelar={() => setCierreModal(null)}
          onConfirmar={handleConfirmarCierre}
        />
      )}

      {/* Modal motivo pausa */}
      {pauseModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center">
                <PauseCircle className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <p className="font-bold text-slate-900 text-sm">Pausar instalación</p>
                <p className="text-xs text-slate-700">{pauseModal.numeroOdp} — Sale de esta ruta y vuelve a la bandeja para programarse de nuevo</p>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-900 mb-1">Motivo *</label>
              <textarea
                rows={3}
                value={pauseMotivo}
                onChange={e => setPauseMotivo(e.target.value)}
                placeholder="Ej. El cliente no estaba en el sitio, faltó material..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPauseModal(null)} className="flex-1 py-2.5 bg-slate-100 text-slate-900 font-semibold text-sm rounded-xl hover:bg-slate-200 transition">
                Cancelar
              </button>
              <button onClick={handleConfirmarPausa} className="flex-1 py-2.5 bg-violet-600 text-white font-semibold text-sm rounded-xl hover:bg-violet-700 transition shadow-sm">
                Confirmar pausa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JefeView;
