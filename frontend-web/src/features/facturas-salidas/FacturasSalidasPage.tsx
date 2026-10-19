import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import ODPFichaModal from '../odp/components/ODPFichaModal';
import { getEstadoODP } from '../../utils/estadosODP';
import FolderTabs from '../../components/FolderTabs';
import {
  FileCheck, Warehouse, Plus, Pencil, Trash2, X, RefreshCw, Search, Package, AlertTriangle, Zap,
} from '../../components/ui/icons';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

import API from '../../services/config';
import { hoyBogotaISO } from '../../utils/fechas';
import { coincideBusqueda, normalizarTexto } from '../../utils/busqueda';

const fmtFecha = (f: string | null | undefined) => {
  if (!f) return '—';
  try { return format(parseISO(f), 'dd/MM/yyyy', { locale: es }); } catch { return f; }
};

const fmtMoneda = (v: number | null | undefined) =>
  v ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v) : '—';

// Nombres y colores de estado: `utils/estadosODP` es la fuente única.
const BadgeEstado = ({ estado }: { estado: string }) => {
  const e = getEstadoODP(estado);
  return <span title={e.descripcion} className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${e.badge}`}>{e.label}</span>;
};

/**
 * Estados anteriores a LISTO_INSTALAR en la secuencia de producción.
 * Una ODP facturada que aún está en alguno de ellos es una "factura anticipada":
 * se emitió la FE antes de que el producto estuviera listo para instalar.
 *
 * PAUSADA queda fuera a propósito: está fuera de la secuencia y una ODP puede
 * pausarse por No Conformidad DESPUÉS de haber estado lista o instalada, así que
 * marcarla generaría falsos positivos.
 */
const ESTADOS_PRE_LISTO = new Set([
  'EN_ESPERA',
  'VISITA_TECNICA',
  'MEDICION',
  'ALUMINIO_CORTADO',
  'VIDRIO_RECIBIDO',
  'ACCESORIOS_SEPARADOS',
]);

const esFacturaAnticipada = (estadoProduccion?: string | null) =>
  !!estadoProduccion && ESTADOS_PRE_LISTO.has(estadoProduccion);

const BadgeAnticipada = () => (
  <span
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap bg-amber-100 text-amber-800 border border-amber-300"
    title="Facturada antes de estar lista para instalar"
  >
    <Zap className="w-3 h-3" /> Factura anticipada
  </span>
);

type Tab = 'facturadas' | 'oa' | 'nc' | 'con_salida';
type SubTabConSalida = 'odps' | 'oa';

const numerosFE = (o?: { factura_electronica?: string | null; facturas_adicionales?: { numero_fe: string }[] }) =>
  [o?.factura_electronica, ...(o?.facturas_adicionales?.map(f => f.numero_fe) ?? [])];

/** Mínimo de caracteres para el buscador general (igual que el endpoint /ubicar). */
const MIN_BUSQUEDA = 2;

const TIPO_ERROR_NC: Record<string, { label: string; cls: string }> = {
  ERROR_INTERNO: { label: 'Error interno',  cls: 'bg-red-50 text-red-800 border border-red-200' },
  DANO_PLANTA:   { label: 'Daño en planta', cls: 'bg-orange-50 text-orange-800 border border-orange-200' },
  REPROCESO:     { label: 'Reproceso',      cls: 'bg-amber-50 text-amber-800 border border-amber-200' },
  QUEJA:         { label: 'Queja',          cls: 'bg-purple-50 text-purple-800 border border-purple-200' },
};

interface ODPFacturada {
  id: number;
  numero_odp: string;
  fecha_factura: string | null;
  factura_electronica: string | null;
  facturas_adicionales?: { id: number; numero_fe: string; fecha_factura: string | null }[];
  valor_total: number | null;
  estado_caja: string | null;
  estado_produccion: string;
  cliente: { id: number; nombre_razon_social: string };
}

interface OAPendiente {
  id: number;
  numero_odp: string;
  estado_produccion: string;
  fecha_creacion: string | null;
  cliente: { id: number; nombre_razon_social: string };
}

interface ODPNoConformidad {
  id: number;
  numero_odp: string;
  estado_produccion: string;
  fecha_creacion: string | null;
  cliente: { id: number; nombre_razon_social: string };
  odp_padre: { id: number; numero_odp: string } | null;
  no_conformidad_origen: { tipo_error: string } | null;
}

interface SalidaAlmacen {
  id: number;
  numero_sa: string;
  fecha_sa: string;
  creado_en: string;
  creador?: { id: number; nombre_completo: string };
  odp: {
    id: number;
    numero_odp: string;
    fecha_factura?: string | null;
    factura_electronica?: string | null;
    facturas_adicionales?: { id: number; numero_fe: string; fecha_factura: string | null }[];
    valor_total?: number | null;
    estado_produccion?: string;
    fecha_creacion?: string | null;
    cliente: { id: number; nombre_razon_social: string };
  };
}

/** Dónde aparece una ODP dentro del módulo (una ODP puede estar en dos listas: OA facturada). */
interface Ubicacion {
  tab: Tab;
  sub?: SubTabConSalida;
  etiqueta: string;
  /** Fecha con la que esa pestaña filtra por mes (null = aparece en cualquier mes). */
  fechaMes: string | null | undefined;
}

interface ResultadoGlobal {
  id: number;
  numero_odp: string;
  cliente: string;
  estado_produccion?: string;
  fe: (string | null | undefined)[];
  fecha_factura?: string | null;
  ubicaciones: Ubicacion[];
  /** Texto en el que busca el buscador general. */
  campos: (string | null | undefined)[];
  facturada?: ODPFacturada;
  oa?: OAPendiente;
  nc?: ODPNoConformidad;
  salida?: { s: SalidaAlmacen; esOA: boolean };
}

/** ODP que no está en ninguna lista del módulo (respuesta de /ubicar). */
interface ODPUbicada {
  id: number;
  numero_odp: string;
  tipo_odp: string | null;
  estado_produccion: string;
  estado_facturacion: string | null;
  factura_electronica: string | null;
  es_no_conformidad: boolean | null;
  tiene_salida: boolean;
  cliente: { id: number; nombre_razon_social: string } | null;
}

/** Por qué una ODP no aparece en Facturas vs Salidas. */
const motivoAusencia = (o: ODPUbicada) => {
  const estado = getEstadoODP(o.estado_produccion).label;
  if (o.tiene_salida) return 'Ya tiene salida registrada, pero no aparece en la página: actualízala con el botón de recargar.';
  if (o.es_no_conformidad && !['INSTALADA', 'ENTREGADA'].includes(o.estado_produccion) && o.estado_facturacion !== 'FACTURADA') {
    return `Es una No Conformidad en «${estado}»: aparece en «No Conformidades» cuando quede instalada o entregada.`;
  }
  if (o.tipo_odp !== 'OA' && o.estado_facturacion !== 'FACTURADA') {
    return `No está facturada (producción: ${estado}). Aparece en «Facturadas» cuando Contabilidad registre su factura.`;
  }
  return 'No aparece en la página: actualízala con el botón de recargar.';
};

interface ModalSAState {
  odp?: ODPFacturada | OAPendiente | ODPNoConformidad;
  salida?: SalidaAlmacen;
  esOA: boolean;
}

const FacturasSalidasPage: React.FC = () => {
  const user = useSelector((s: any) => s.auth.user);
  const token = sessionStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const puedeEditar = ['admin', 'compras', 'produccion'].includes(user?.rol || '');

  const [tab, setTab] = useState<Tab>('facturadas');
  const [subTabConSalida, setSubTabConSalida] = useState<SubTabConSalida>('odps');

  const [facturadas, setFacturadas]     = useState<ODPFacturada[]>([]);
  const [oaPendientes, setOAPendientes] = useState<OAPendiente[]>([]);
  const [conSalida, setConSalida]       = useState<SalidaAlmacen[]>([]);
  const [conSalidaOA, setConSalidaOA]   = useState<SalidaAlmacen[]>([]);
  const [odpsNc, setOdpsNc]             = useState<ODPNoConformidad[]>([]);

  const hoy = new Date();
  const [filtroMes, setFiltroMes]   = useState(hoy.getMonth() + 1);
  const [filtroAnio, setFiltroAnio] = useState(hoy.getFullYear());
  const [loading, setLoading]       = useState(true);

  const [busquedaFacturadas,   setBusquedaFacturadas]   = useState('');
  const [busquedaOA,           setBusquedaOA]           = useState('');
  const [busquedaNc,           setBusquedaNc]           = useState('');
  const [busquedaConSalida,    setBusquedaConSalida]    = useState('');
  const [busquedaConSalidaOA,  setBusquedaConSalidaOA]  = useState('');
  const [filtroCajaFacturadas, setFiltroCajaFacturadas] = useState('');
  const [soloAnticipadas,      setSoloAnticipadas]      = useState(false);
  const [busquedaGlobal,       setBusquedaGlobal]       = useState('');
  const [ubicadas,             setUbicadas]             = useState<ODPUbicada[] | null>(null);
  const [buscandoRemoto,       setBuscandoRemoto]       = useState(false);
  const [errorRemoto,          setErrorRemoto]          = useState<string | null>(null);

  const [modalSA,    setModalSA]    = useState<ModalSAState | null>(null);
  const [fichaOdpId, setFichaOdpId] = useState<number | null>(null);
  const [formSA,     setFormSA]     = useState({ numero: '', fecha: '' });
  const [savingSA,   setSavingSA]   = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [resF, resS, resOA, resSalidaOA, resNc] = await Promise.all([
        axios.get(`${API}/api/facturas-salidas/facturadas`,  { headers }),
        axios.get(`${API}/api/facturas-salidas/con-salida`,  { headers }),
        axios.get(`${API}/api/facturas-salidas/oa-pendientes`, { headers }),
        axios.get(`${API}/api/facturas-salidas/con-salida-oa`, { headers }),
        axios.get(`${API}/api/facturas-salidas/nc`, { headers }),
      ]);
      setFacturadas(resF.data);
      setConSalida(resS.data);
      setOAPendientes(resOA.data);
      setConSalidaOA(resSalidaOA.data);
      setOdpsNc(resNc.data);
    } catch { toast.error('Error al cargar datos'); }
    finally { setLoading(false); }
  }, []); // eslint-disable-line

  useEffect(() => { cargar(); }, [cargar]);

  const abrirCrearODP = (odp: ODPFacturada) => {
    setModalSA({ odp, esOA: false });
    setFormSA({ numero: '', fecha: hoyBogotaISO() });
  };

  const abrirCrearOA = (oa: OAPendiente) => {
    setModalSA({ odp: oa as any, esOA: true });
    setFormSA({ numero: '', fecha: hoyBogotaISO() });
  };

  const abrirCrearNc = (nc: ODPNoConformidad) => {
    setModalSA({ odp: nc, esOA: false });
    setFormSA({ numero: '', fecha: hoyBogotaISO() });
  };

  const abrirEditar = (salida: SalidaAlmacen, esOA: boolean) => {
    setModalSA({ salida, esOA });
    const prefijo = esOA ? 'SFV-' : 'SA-';
    const numero  = salida.numero_sa.startsWith(prefijo)
      ? salida.numero_sa.slice(prefijo.length)
      : salida.numero_sa;
    setFormSA({ numero, fecha: salida.fecha_sa });
  };

  const guardarSA = async () => {
    if (!formSA.numero.trim()) { toast.error('Ingresa el número'); return; }
    if (!formSA.fecha)         { toast.error('Ingresa la fecha'); return; }
    setSavingSA(true);
    const prefijo  = modalSA?.esOA ? 'SFV-' : 'SA-';
    const numero_sa = `${prefijo}${formSA.numero}`;
    try {
      if (modalSA?.salida) {
        await axios.put(`${API}/api/facturas-salidas/salida/${modalSA.salida.id}`,
          { numero_sa, fecha_sa: formSA.fecha }, { headers });
        toast.success('Salida actualizada');
      } else {
        await axios.post(`${API}/api/facturas-salidas/${modalSA?.odp?.id}/salida`,
          { numero_sa, fecha_sa: formSA.fecha }, { headers });
        toast.success(modalSA?.esOA ? 'Salida SFV registrada' : 'Salida de almacén registrada');
      }
      setModalSA(null);
      cargar();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al guardar');
    } finally { setSavingSA(false); }
  };

  const eliminarSA = async (id: number, esOA: boolean) => {
    const msg = esOA
      ? '¿Eliminar esta salida SFV? La OA volverá al tab OA.'
      : '¿Eliminar esta salida de almacén? La ODP volverá al tab Facturadas.';
    if (!window.confirm(msg)) return;
    try {
      await axios.delete(`${API}/api/facturas-salidas/salida/${id}`, { headers });
      toast.success('Salida eliminada');
      cargar();
    } catch { toast.error('Error al eliminar'); }
  };

  const mesCorrecto = (fecha: string | null | undefined) => {
    if (!fecha) return true;
    try {
      const d = parseISO(fecha);
      return d.getMonth() + 1 === filtroMes && d.getFullYear() === filtroAnio;
    } catch { return true; }
  };

  // Buscadores de cada pestaña: sin tildes y con las FE adicionales (2026-10-19).
  const facturadasFiltradas = facturadas.filter(o => {
    if (!mesCorrecto(o.fecha_factura)) return false;
    if (filtroCajaFacturadas && o.estado_caja !== filtroCajaFacturadas) return false;
    if (soloAnticipadas && !esFacturaAnticipada(o.estado_produccion)) return false;
    return coincideBusqueda(busquedaFacturadas, [o.numero_odp, o.cliente?.nombre_razon_social, ...numerosFE(o)]);
  });

  const oaFiltradas = oaPendientes.filter(oa =>
    mesCorrecto(oa.fecha_creacion) && coincideBusqueda(busquedaOA, [oa.numero_odp, oa.cliente?.nombre_razon_social]));

  const conSalidaFiltradas = conSalida.filter(s =>
    mesCorrecto(s.fecha_sa) && coincideBusqueda(busquedaConSalida,
      [s.odp?.numero_odp, s.odp?.cliente?.nombre_razon_social, ...numerosFE(s.odp), s.numero_sa, s.creador?.nombre_completo]));

  const ncFiltradas = odpsNc.filter(nc =>
    mesCorrecto(nc.fecha_creacion) && coincideBusqueda(busquedaNc, [
      nc.numero_odp, nc.cliente?.nombre_razon_social, nc.odp_padre?.numero_odp,
      nc.no_conformidad_origen?.tipo_error, TIPO_ERROR_NC[nc.no_conformidad_origen?.tipo_error || '']?.label]));

  const conSalidaOAFiltradas = conSalidaOA.filter(s =>
    mesCorrecto(s.fecha_sa) && coincideBusqueda(busquedaConSalidaOA,
      [s.odp?.numero_odp, s.odp?.cliente?.nombre_razon_social, s.numero_sa, s.creador?.nombre_completo]));

  // ── Buscador general: todas las listas, sin mes ni pestaña ni filtros ──────
  // Índice por ODP: una OA facturada sin salida está a la vez en Facturadas y en OA.
  const indiceGlobal = useMemo(() => {
    const m = new Map<number, ResultadoGlobal>();
    const entrada = (base: Omit<ResultadoGlobal, 'ubicaciones' | 'campos' | 'fe'>, fe: (string | null | undefined)[]) => {
      let r = m.get(base.id);
      if (!r) {
        r = { ...base, fe, ubicaciones: [], campos: [] };
        m.set(base.id, r);
      }
      if (!r.estado_produccion && base.estado_produccion) r.estado_produccion = base.estado_produccion;
      if (!r.fe.some(Boolean) && fe.some(Boolean)) r.fe = fe;
      if (!r.fecha_factura && base.fecha_factura) r.fecha_factura = base.fecha_factura;
      return r;
    };
    for (const o of facturadas) {
      const r = entrada({ id: o.id, numero_odp: o.numero_odp, cliente: o.cliente?.nombre_razon_social || '', estado_produccion: o.estado_produccion, fecha_factura: o.fecha_factura }, numerosFE(o));
      r.facturada = o;
      r.ubicaciones.push({ tab: 'facturadas', etiqueta: 'Facturada · pendiente SA', fechaMes: o.fecha_factura });
      r.campos.push(o.numero_odp, o.cliente?.nombre_razon_social, ...numerosFE(o));
    }
    for (const oa of oaPendientes) {
      const r = entrada({ id: oa.id, numero_odp: oa.numero_odp, cliente: oa.cliente?.nombre_razon_social || '', estado_produccion: oa.estado_produccion }, []);
      r.oa = oa;
      r.ubicaciones.push({ tab: 'oa', etiqueta: 'OA · pendiente SFV', fechaMes: oa.fecha_creacion });
      r.campos.push(oa.numero_odp, oa.cliente?.nombre_razon_social);
    }
    for (const nc of odpsNc) {
      const r = entrada({ id: nc.id, numero_odp: nc.numero_odp, cliente: nc.cliente?.nombre_razon_social || '', estado_produccion: nc.estado_produccion }, []);
      r.nc = nc;
      r.ubicaciones.push({ tab: 'nc', etiqueta: 'No Conformidad · pendiente SA', fechaMes: nc.fecha_creacion });
      r.campos.push(nc.numero_odp, nc.cliente?.nombre_razon_social, nc.odp_padre?.numero_odp);
    }
    const conSalidaDe = (lista: SalidaAlmacen[], esOA: boolean) => {
      for (const s of lista) {
        if (!s.odp) continue;
        const r = entrada({ id: s.odp.id, numero_odp: s.odp.numero_odp, cliente: s.odp.cliente?.nombre_razon_social || '', estado_produccion: s.odp.estado_produccion, fecha_factura: s.odp.fecha_factura }, numerosFE(s.odp));
        r.salida = { s, esOA };
        r.ubicaciones.push({ tab: 'con_salida', sub: esOA ? 'oa' : 'odps', etiqueta: `${esOA ? 'OA con salida' : 'Con salida'} ${s.numero_sa} · ${fmtFecha(s.fecha_sa)}`, fechaMes: s.fecha_sa });
        r.campos.push(s.odp.numero_odp, s.odp.cliente?.nombre_razon_social, ...numerosFE(s.odp), s.numero_sa);
      }
    };
    conSalidaDe(conSalida, false);
    conSalidaDe(conSalidaOA, true);
    return m;
  }, [facturadas, oaPendientes, odpsNc, conSalida, conSalidaOA]);

  const buscandoGlobal = normalizarTexto(busquedaGlobal).length >= MIN_BUSQUEDA;
  const resultadosGlobales = useMemo(
    () => (buscandoGlobal ? Array.from(indiceGlobal.values()).filter(r => coincideBusqueda(busquedaGlobal, r.campos)) : []),
    [buscandoGlobal, indiceGlobal, busquedaGlobal],
  );

  // Sin coincidencias en las listas se pregunta al servidor (que además busca por NIT y asesor)
  // para mostrar la ODP si sí está en el módulo, o decir por qué no está.
  const consultaRemota = useRef(0);
  const sinLocales = buscandoGlobal && resultadosGlobales.length === 0;
  useEffect(() => {
    setUbicadas(null);
    setErrorRemoto(null);
    const n = ++consultaRemota.current;
    if (!sinLocales) { setBuscandoRemoto(false); return; }
    setBuscandoRemoto(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await axios.get<ODPUbicada[]>(`${API}/api/facturas-salidas/ubicar`, { headers, params: { q: busquedaGlobal.trim() } });
        if (n === consultaRemota.current) setUbicadas(data);
      } catch (e: any) {
        if (n === consultaRemota.current) setErrorRemoto(e.response?.data?.error || 'No se pudo buscar la ODP en el sistema. Revisa la conexión e intenta de nuevo.');
      } finally {
        if (n === consultaRemota.current) setBuscandoRemoto(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [sinLocales, busquedaGlobal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Las que devolvió el servidor y sí están en el módulo (coincidieron por NIT o asesor) se
  // muestran como resultado normal, con su acción; las demás, con el motivo de su ausencia.
  const resultadosVisibles = resultadosGlobales.length
    ? resultadosGlobales
    : (ubicadas ?? []).flatMap(u => indiceGlobal.get(u.id) ?? []);
  const ausentes = (ubicadas ?? []).filter(u => !indiceGlobal.has(u.id));

  /** Lleva a la pestaña (y al mes) donde está la ODP y cierra el buscador general. */
  const irA = (u: Ubicacion) => {
    setTab(u.tab);
    if (u.sub) setSubTabConSalida(u.sub);
    if (u.fechaMes) {
      try {
        const d = parseISO(u.fechaMes);
        setFiltroMes(d.getMonth() + 1);
        setFiltroAnio(d.getFullYear());
      } catch { /* fecha ilegible: se queda el mes elegido */ }
    }
    setBusquedaGlobal('');
  };

  /** Acción de la fila del buscador general: la misma que tendría en su pestaña. */
  const accionResultado = (r: ResultadoGlobal) => {
    if (!puedeEditar) return null;
    if (r.salida) {
      const { s, esOA } = r.salida;
      return (
        <div className="flex gap-2">
          <button onClick={() => abrirEditar(s, esOA)} title="Editar salida"
            className="p-1.5 text-slate-500 hover:text-violet-700 hover:bg-violet-50 rounded-lg transition">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={() => eliminarSA(s.id, esOA)} title="Eliminar salida"
            className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      );
    }
    // OA facturada sin salida: está en Facturadas y en OA; se registra como SFV (es una OA).
    const registrar = r.oa
      ? { fn: () => abrirCrearOA(r.oa!), texto: 'Registrar SFV', cls: 'bg-indigo-600 hover:bg-indigo-700' }
      : r.facturada
        ? { fn: () => abrirCrearODP(r.facturada!), texto: 'Registrar SA', cls: 'bg-violet-600 hover:bg-violet-700' }
        : r.nc
          ? { fn: () => abrirCrearNc(r.nc!), texto: 'Registrar SA', cls: 'bg-rose-600 hover:bg-rose-700' }
          : null;
    if (!registrar) return null;
    return (
      <button onClick={registrar.fn}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-white text-xs font-semibold whitespace-nowrap rounded-lg transition shadow-sm ${registrar.cls}`}>
        <Plus className="w-3.5 h-3.5" /> {registrar.texto}
      </button>
    );
  };

  // Universo de anticipadas del período (independiente del chip, para no autoanularse el contador)
  const anticipadasDelPeriodo = facturadas.filter(
    o => mesCorrecto(o.fecha_factura) && esFacturaAnticipada(o.estado_produccion)
  );

  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  // «Ir a la pestaña» puede llevar a un año más viejo que los 4 del selector: se agrega.
  const anios = Array.from(new Set([...Array.from({ length: 4 }, (_, i) => hoy.getFullYear() - i), filtroAnio])).sort((a, b) => b - a);

  const TABS: { key: Tab; label: string; icon: React.ElementType; count: number }[] = [
    { key: 'facturadas', label: 'Facturadas',             icon: FileCheck,      count: facturadasFiltradas.length },
    { key: 'oa',         label: 'OA',                     icon: Package,        count: oaFiltradas.length },
    { key: 'nc',         label: 'No Conformidades',       icon: AlertTriangle,  count: ncFiltradas.length },
    { key: 'con_salida', label: 'Con Salidas de Almacén', icon: Warehouse,      count: conSalidaFiltradas.length + conSalidaOAFiltradas.length },
  ];

  const prefijo = modalSA?.esOA ? 'SFV-' : 'SA-';

  return (
    <div className="p-6 w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-center">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-3">
            <Warehouse className="w-7 h-7 text-violet-600" />
            Facturas vs Salidas
          </h1>
          <p className="text-slate-700 text-sm mt-1">Control de ODPs facturadas, OA y salidas de almacén</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={filtroMes} onChange={e => setFiltroMes(Number(e.target.value))}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500">
            {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select value={filtroAnio} onChange={e => setFiltroAnio(Number(e.target.value))}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500">
            {anios.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button onClick={cargar} className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 transition">
            <RefreshCw className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-card">
          <div className="flex items-center gap-2.5 min-h-9">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
              <FileCheck className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-xs font-semibold text-slate-900 uppercase tracking-wider leading-tight">Pendientes SA</p>
          </div>
          <p className="text-2xl font-extrabold leading-none text-blue-700">{facturadas.length}</p>
        </div>
        <button
          type="button"
          onClick={() => { setTab('facturadas'); setSoloAnticipadas(v => !v); }}
          title="Facturadas que aún no llegan a Listo Instalar — clic para filtrar"
          className={`text-left rounded-2xl p-4 flex flex-col gap-3 shadow-card border transition ${
            soloAnticipadas
              ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-300'
              : 'bg-white border-slate-200 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center gap-2.5 min-h-9">
            <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-amber-600" />
            </div>
            <p className="text-xs font-semibold text-slate-900 uppercase tracking-wider leading-tight">Anticipadas</p>
          </div>
          <p className="text-2xl font-extrabold leading-none text-amber-700">{anticipadasDelPeriodo.length}</p>
        </button>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-card">
          <div className="flex items-center gap-2.5 min-h-9">
            <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 text-indigo-600" />
            </div>
            <p className="text-xs font-semibold text-slate-900 uppercase tracking-wider leading-tight">OA sin SFV</p>
          </div>
          <p className="text-2xl font-extrabold leading-none text-indigo-700">{oaPendientes.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-card">
          <div className="flex items-center gap-2.5 min-h-9">
            <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
              <Warehouse className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-xs font-semibold text-slate-900 uppercase tracking-wider leading-tight">Con Salida</p>
          </div>
          <p className="text-2xl font-extrabold leading-none text-emerald-700">{conSalida.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-card">
          <div className="flex items-center gap-2.5 min-h-9">
            <div className="w-9 h-9 bg-violet-50 rounded-xl flex items-center justify-center shrink-0">
              <Warehouse className="w-5 h-5 text-violet-600" />
            </div>
            <p className="text-xs font-semibold text-slate-900 uppercase tracking-wider leading-tight">SA de OA</p>
          </div>
          <p className="text-2xl font-extrabold leading-none text-violet-700">{conSalidaOA.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-card">
          <div className="flex items-center gap-2.5 min-h-9">
            <div className="w-9 h-9 bg-rose-50 rounded-xl flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
            </div>
            <p className="text-xs font-semibold text-slate-900 uppercase tracking-wider leading-tight">NC sin SA</p>
          </div>
          <p className="text-2xl font-extrabold leading-none text-rose-700">{odpsNc.length}</p>
        </div>
      </div>

      {/* Buscador general — ignora pestaña, mes y filtros */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-card p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={busquedaGlobal} onChange={e => setBusquedaGlobal(e.target.value)}
            placeholder="Buscar en todo el módulo: ODP, OA, cliente, factura, SA o SFV (sin importar pestaña ni mes)"
            aria-label="Buscar ODP en todo el módulo"
            className="w-full pl-9 pr-10 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white" />
          {busquedaGlobal && (
            <button onClick={() => setBusquedaGlobal('')} title="Limpiar búsqueda" aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-500 hover:bg-slate-100">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {busquedaGlobal.trim() && !buscandoGlobal && (
          <p className="text-xs text-slate-600 mt-2">Escribe al menos {MIN_BUSQUEDA} caracteres.</p>
        )}
      </div>

      {buscandoGlobal ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 text-sm text-slate-800">
            {loading
              ? 'Cargando el módulo…'
              : resultadosVisibles.length
                ? <>Resultados en todo el módulo: <b>{resultadosVisibles.length}</b>. Clic en la ubicación para ir a su pestaña y mes.</>
                : buscandoRemoto
                  ? 'No está en las listas del módulo. Buscando en el sistema…'
                  : 'No está en las listas del módulo.'}
          </div>
          {resultadosVisibles.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['ODP', 'Cliente', 'Dónde está', 'Estado Producción', 'N° Factura Electrónica', 'Fecha Factura', puedeEditar ? 'Acción' : ''].filter(Boolean).map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-900 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resultadosVisibles.map(r => {
                    const fes = r.fe.filter(Boolean) as string[];
                    return (
                      <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-4 font-mono font-bold text-indigo-700 whitespace-nowrap cursor-pointer hover:underline" onClick={() => setFichaOdpId(r.id)}>{r.numero_odp}</td>
                        <td className="px-5 py-4 font-semibold text-slate-900">{r.cliente || '—'}</td>
                        <td className="px-5 py-4">
                          <div className="flex flex-col items-start gap-1">
                            {r.ubicaciones.map(u => (
                              <button key={u.etiqueta} onClick={() => irA(u)} title="Ir a esta pestaña y su mes"
                                className="px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap border border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100 transition">
                                {u.etiqueta} →
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-col items-start gap-1">
                            {r.estado_produccion ? <BadgeEstado estado={r.estado_produccion} /> : <span className="text-slate-500">—</span>}
                            {r.facturada && esFacturaAnticipada(r.estado_produccion) && <BadgeAnticipada />}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {fes.length
                            ? (
                              <div className="flex flex-wrap items-center gap-1">
                                {fes.map((fe, i) => (
                                  <span key={fe + i} className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap border ${i === 0 ? 'bg-blue-50 text-blue-800 border-blue-200' : 'bg-indigo-50 text-indigo-800 border-indigo-200'}`}>{fe}</span>
                                ))}
                              </div>
                            )
                            : <span className="text-slate-500">—</span>}
                        </td>
                        <td className="px-5 py-4 text-slate-800 whitespace-nowrap">{fmtFecha(r.fecha_factura)}</td>
                        {puedeEditar && <td className="px-5 py-4">{accionResultado(r)}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!resultadosVisibles.length && !buscandoRemoto && (
            <div className="px-5 py-6 space-y-3">
              {errorRemoto && <p className="text-sm text-rose-700">{errorRemoto}</p>}
              {ubicadas && ausentes.length === 0 && !errorRemoto && (
                <p className="text-sm text-slate-700">No existe ninguna ODP que coincida con «{busquedaGlobal.trim()}». Revisa el número, el cliente o la factura.</p>
              )}
              {ausentes.map(u => (
                <div key={u.id} className="flex flex-wrap items-start gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50/60">
                  <span className="font-mono font-bold text-indigo-700 cursor-pointer hover:underline whitespace-nowrap" onClick={() => setFichaOdpId(u.id)}>{u.numero_odp}</span>
                  <span className="font-semibold text-slate-900">{u.cliente?.nombre_razon_social || '—'}</span>
                  <BadgeEstado estado={u.estado_produccion} />
                  <p className="basis-full text-sm text-amber-900">{motivoAusencia(u)}</p>
                </div>
              ))}
              {ausentes.length === 10 && (
                <p className="text-xs text-slate-600">Se muestran las 10 más recientes: escribe más para afinar la búsqueda.</p>
              )}
            </div>
          )}
        </div>
      ) : (<>
      {/* Tabs principales — estilo carpeta */}
      <FolderTabs
        tabs={TABS.map(t => { const Icon = t.icon; return { key: t.key, label: t.label, icon: <Icon className="w-4 h-4" />, badge: t.count }; })}
        activeKey={tab}
        onChange={(k) => setTab(k as Tab)}
        className="border-b border-slate-200"
      />

      {/* Contenido */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* ── TAB FACTURADAS ── */}
          {tab === 'facturadas' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center bg-slate-50/50">
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input value={busquedaFacturadas} onChange={e => setBusquedaFacturadas(e.target.value)}
                    placeholder="Buscar ODP, cliente, factura..."
                    className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white" />
                </div>
                <select value={filtroCajaFacturadas} onChange={e => setFiltroCajaFacturadas(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white">
                  <option value="">Estado caja: Todos</option>
                  <option value="PENDIENTE">Pendiente</option>
                  <option value="ABONADO">Abonado</option>
                  <option value="CANCELADO">Cancelado</option>
                  <option value="CREDITO_APROBADO">Crédito aprobado</option>
                </select>
                <button
                  onClick={() => setSoloAnticipadas(v => !v)}
                  title="Mostrar solo ODPs facturadas que aún no llegan a Listo Instalar"
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition whitespace-nowrap ${
                    soloAnticipadas
                      ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                      : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  Solo anticipadas
                  <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold ${
                    soloAnticipadas ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {anticipadasDelPeriodo.length}
                  </span>
                </button>
                {(busquedaFacturadas || filtroCajaFacturadas || soloAnticipadas) && (
                  <button onClick={() => { setBusquedaFacturadas(''); setFiltroCajaFacturadas(''); setSoloAnticipadas(false); }}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-100 transition bg-white">
                    <X className="w-3.5 h-3.5" /> Limpiar
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {['ODP', 'Cliente', 'Estado Producción', 'Fecha Factura', 'N° Factura Electrónica', 'Valor Total', puedeEditar ? 'Acción' : ''].filter(Boolean).map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-900 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {facturadasFiltradas.length === 0 ? (
                      <tr><td colSpan={puedeEditar ? 7 : 6} className="px-5 py-12 text-center text-slate-700">
                        <FileCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p>{soloAnticipadas
                          ? 'No hay facturas anticipadas en el período seleccionado'
                          : 'No hay ODPs facturadas para el período seleccionado'}</p>
                      </td></tr>
                    ) : facturadasFiltradas.map(odp => {
                      const anticipada = esFacturaAnticipada(odp.estado_produccion);
                      return (
                      <motion.tr key={odp.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className={`transition-colors ${anticipada
                          ? 'bg-amber-50/40 hover:bg-amber-50 border-l-4 border-l-amber-400'
                          : 'hover:bg-slate-50'}`}>
                        <td className="px-5 py-4 font-mono font-bold text-indigo-700 whitespace-nowrap cursor-pointer hover:underline" onClick={() => setFichaOdpId(odp.id)}>{odp.numero_odp}</td>
                        <td className="px-5 py-4 font-semibold text-slate-900">{odp.cliente?.nombre_razon_social || '—'}</td>
                        <td className="px-5 py-4">
                          <div className="flex flex-col items-start gap-1">
                            <BadgeEstado estado={odp.estado_produccion} />
                            {anticipada && <BadgeAnticipada />}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-slate-800 whitespace-nowrap">{fmtFecha(odp.fecha_factura)}</td>
                        <td className="px-5 py-4">
                          {odp.factura_electronica
                            ? (
                              <div className="flex flex-wrap items-center gap-1">
                                <span className="px-2.5 py-1 bg-blue-50 text-blue-800 rounded-full text-xs font-semibold whitespace-nowrap border border-blue-200">{odp.factura_electronica}</span>
                                {odp.facturas_adicionales?.map((f: any) => (
                                  <span key={f.id} className="px-2.5 py-1 bg-indigo-50 text-indigo-800 rounded-full text-xs font-semibold whitespace-nowrap border border-indigo-200">{f.numero_fe}</span>
                                ))}
                              </div>
                            )
                            : <span className="text-slate-500">—</span>}
                        </td>
                        <td className="px-5 py-4 font-semibold text-slate-900 whitespace-nowrap">{fmtMoneda(odp.valor_total)}</td>
                        {puedeEditar && (
                          <td className="px-5 py-4">
                            <button onClick={() => abrirCrearODP(odp)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-xs font-semibold whitespace-nowrap rounded-lg hover:bg-violet-700 transition shadow-sm">
                              <Plus className="w-3.5 h-3.5" /> Registrar SA
                            </button>
                          </td>
                        )}
                      </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── TAB OA ── */}
          {tab === 'oa' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center bg-slate-50/50">
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input value={busquedaOA} onChange={e => setBusquedaOA(e.target.value)}
                    placeholder="Buscar OA, cliente..."
                    className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white" />
                </div>
                {busquedaOA && (
                  <button onClick={() => setBusquedaOA('')}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-100 transition bg-white">
                    <X className="w-3.5 h-3.5" /> Limpiar
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {['OA', 'Cliente', 'Estado Producción', 'Fecha Creación', puedeEditar ? 'Acción' : ''].filter(Boolean).map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-900 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {oaFiltradas.length === 0 ? (
                      <tr><td colSpan={puedeEditar ? 5 : 4} className="px-5 py-12 text-center text-slate-700">
                        <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p>No hay OA pendientes de salida para el período seleccionado</p>
                      </td></tr>
                    ) : oaFiltradas.map(oa => (
                      <motion.tr key={oa.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-4 font-mono font-bold text-indigo-700 whitespace-nowrap cursor-pointer hover:underline" onClick={() => setFichaOdpId(oa.id)}>{oa.numero_odp}</td>
                        <td className="px-5 py-4 font-semibold text-slate-900">{oa.cliente?.nombre_razon_social || '—'}</td>
                        <td className="px-5 py-4"><BadgeEstado estado={oa.estado_produccion} /></td>
                        <td className="px-5 py-4 text-slate-800 whitespace-nowrap">{fmtFecha(oa.fecha_creacion)}</td>
                        {puedeEditar && (
                          <td className="px-5 py-4">
                            <button onClick={() => abrirCrearOA(oa)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold whitespace-nowrap rounded-lg hover:bg-indigo-700 transition shadow-sm">
                              <Plus className="w-3.5 h-3.5" /> Registrar SFV
                            </button>
                          </td>
                        )}
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── TAB NC ── */}
          {tab === 'nc' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center bg-slate-50/50">
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input value={busquedaNc} onChange={e => setBusquedaNc(e.target.value)}
                    placeholder="Buscar ODP, ODP padre, cliente, tipo error..."
                    className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white" />
                </div>
                {busquedaNc && (
                  <button onClick={() => setBusquedaNc('')}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-100 transition bg-white">
                    <X className="w-3.5 h-3.5" /> Limpiar
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {['ODP Reproceso', 'ODP Padre', 'Cliente', 'Estado', 'Tipo Error', puedeEditar ? 'Acción' : ''].filter(Boolean).map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-900 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ncFiltradas.length === 0 ? (
                      <tr><td colSpan={puedeEditar ? 6 : 5} className="px-5 py-12 text-center text-slate-700">
                        <AlertTriangle className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p>No hay No Conformidades pendientes de salida para el período seleccionado</p>
                      </td></tr>
                    ) : ncFiltradas.map(nc => {
                      const tipoErr = nc.no_conformidad_origen?.tipo_error;
                      const chip = tipoErr ? (TIPO_ERROR_NC[tipoErr] ?? { label: tipoErr, cls: 'bg-slate-100 text-slate-800 border border-slate-200' }) : null;
                      return (
                        <motion.tr key={nc.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          className="hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-4 font-mono font-bold text-rose-700 whitespace-nowrap cursor-pointer hover:underline" onClick={() => setFichaOdpId(nc.id)}>{nc.numero_odp}</td>
                          <td className="px-5 py-4">
                            {nc.odp_padre
                              ? <span className="font-mono font-semibold text-indigo-700 whitespace-nowrap cursor-pointer hover:underline" onClick={() => setFichaOdpId(nc.odp_padre!.id)}>{nc.odp_padre.numero_odp}</span>
                              : <span className="text-slate-500">—</span>}
                          </td>
                          <td className="px-5 py-4 font-semibold text-slate-900">{nc.cliente?.nombre_razon_social || '—'}</td>
                          <td className="px-5 py-4"><BadgeEstado estado={nc.estado_produccion} /></td>
                          <td className="px-5 py-4">
                            {chip
                              ? <span className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${chip.cls}`}>{chip.label}</span>
                              : <span className="text-slate-500">—</span>}
                          </td>
                          {puedeEditar && (
                            <td className="px-5 py-4">
                              <button onClick={() => abrirCrearNc(nc)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 text-white text-xs font-semibold whitespace-nowrap rounded-lg hover:bg-rose-700 transition shadow-sm">
                                <Plus className="w-3.5 h-3.5" /> Registrar SA
                              </button>
                            </td>
                          )}
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── TAB CON SALIDAS ── */}
          {tab === 'con_salida' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
              {/* Subtabs */}
              <div className="flex gap-1 px-4 pt-3 border-b border-slate-100 bg-slate-50/50">
                {([
                  { key: 'odps', label: 'ODPs', count: conSalidaFiltradas.length },
                  { key: 'oa',   label: 'SA de OA', count: conSalidaOAFiltradas.length },
                ] as { key: SubTabConSalida; label: string; count: number }[]).map(st => (
                  <button key={st.key} onClick={() => setSubTabConSalida(st.key)}
                    className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-all ${
                      subTabConSalida === st.key
                        ? 'border-violet-600 text-violet-700 bg-white'
                        : 'border-transparent text-slate-700 hover:text-slate-900'
                    }`}>
                    {st.label}
                    <span className={`px-1.5 py-0.5 rounded-full font-bold text-[11px] ${
                      subTabConSalida === st.key ? 'bg-violet-100 text-violet-800' : 'bg-slate-200 text-slate-800'
                    }`}>{st.count}</span>
                  </button>
                ))}
              </div>

              {/* Subtab: ODPs */}
              {subTabConSalida === 'odps' && (
                <>
                  <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center">
                    <div className="relative flex-1 min-w-48">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input value={busquedaConSalida} onChange={e => setBusquedaConSalida(e.target.value)}
                        placeholder="Buscar ODP, cliente, factura, SA, registrado por..."
                        className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white" />
                    </div>
                    {busquedaConSalida && (
                      <button onClick={() => setBusquedaConSalida('')}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-100 transition bg-white">
                        <X className="w-3.5 h-3.5" /> Limpiar
                      </button>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          {['ODP', 'Cliente', 'N° Factura Electrónica', 'Fecha Factura', 'Valor Total', 'N° Salida', 'Fecha SA', 'Registrado por', puedeEditar ? 'Acciones' : ''].filter(Boolean).map(h => (
                            <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-900 uppercase tracking-wider whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {conSalidaFiltradas.length === 0 ? (
                          <tr><td colSpan={puedeEditar ? 9 : 8} className="px-5 py-12 text-center text-slate-700">
                            <Warehouse className="w-10 h-10 mx-auto mb-2 opacity-30" />
                            <p>No hay salidas de almacén para el período seleccionado</p>
                          </td></tr>
                        ) : conSalidaFiltradas.map(s => (
                          <motion.tr key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="hover:bg-slate-50 transition-colors">
                            <td className="px-5 py-4 font-mono font-bold text-indigo-700 whitespace-nowrap cursor-pointer hover:underline" onClick={() => s.odp?.id && setFichaOdpId(s.odp.id)}>{s.odp?.numero_odp}</td>
                            <td className="px-5 py-4 font-semibold text-slate-900">{s.odp?.cliente?.nombre_razon_social || '—'}</td>
                            <td className="px-5 py-4">
                              {s.odp?.factura_electronica
                                ? (
                                  <div className="flex flex-wrap items-center gap-1">
                                    <span className="px-2.5 py-1 bg-blue-50 text-blue-800 rounded-full text-xs font-semibold whitespace-nowrap border border-blue-200">{s.odp.factura_electronica}</span>
                                    {s.odp.facturas_adicionales?.map((f: any) => (
                                      <span key={f.id} className="px-2.5 py-1 bg-indigo-50 text-indigo-800 rounded-full text-xs font-semibold whitespace-nowrap border border-indigo-200">{f.numero_fe}</span>
                                    ))}
                                  </div>
                                )
                                : <span className="text-slate-500">—</span>}
                            </td>
                            <td className="px-5 py-4 text-slate-800 whitespace-nowrap">{fmtFecha(s.odp?.fecha_factura)}</td>
                            <td className="px-5 py-4 font-semibold text-slate-900 whitespace-nowrap">{fmtMoneda(s.odp?.valor_total)}</td>
                            <td className="px-5 py-4">
                              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 rounded-full text-xs font-semibold whitespace-nowrap border border-emerald-200">{s.numero_sa}</span>
                            </td>
                            <td className="px-5 py-4 text-slate-800 whitespace-nowrap">{fmtFecha(s.fecha_sa)}</td>
                            <td className="px-5 py-4 text-slate-800 text-xs whitespace-nowrap">{s.creador?.nombre_completo || '—'}</td>
                            {puedeEditar && (
                              <td className="px-5 py-4">
                                <div className="flex gap-2">
                                  <button onClick={() => abrirEditar(s, false)}
                                    className="p-1.5 text-slate-500 hover:text-violet-700 hover:bg-violet-50 rounded-lg transition">
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => eliminarSA(s.id, false)}
                                    className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            )}
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* Subtab: SA de OA */}
              {subTabConSalida === 'oa' && (
                <>
                  <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center">
                    <div className="relative flex-1 min-w-48">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input value={busquedaConSalidaOA} onChange={e => setBusquedaConSalidaOA(e.target.value)}
                        placeholder="Buscar OA, cliente, SFV, registrado por..."
                        className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white" />
                    </div>
                    {busquedaConSalidaOA && (
                      <button onClick={() => setBusquedaConSalidaOA('')}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-100 transition bg-white">
                        <X className="w-3.5 h-3.5" /> Limpiar
                      </button>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          {['OA', 'Cliente', 'Estado Producción', 'N° SFV', 'Fecha SA', 'Registrado por', puedeEditar ? 'Acciones' : ''].filter(Boolean).map(h => (
                            <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-900 uppercase tracking-wider whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {conSalidaOAFiltradas.length === 0 ? (
                          <tr><td colSpan={puedeEditar ? 7 : 6} className="px-5 py-12 text-center text-slate-700">
                            <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                            <p>No hay salidas SFV de OA para el período seleccionado</p>
                          </td></tr>
                        ) : conSalidaOAFiltradas.map(s => (
                          <motion.tr key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="hover:bg-slate-50 transition-colors">
                            <td className="px-5 py-4 font-mono font-bold text-indigo-700 whitespace-nowrap cursor-pointer hover:underline" onClick={() => s.odp?.id && setFichaOdpId(s.odp.id)}>{s.odp?.numero_odp}</td>
                            <td className="px-5 py-4 font-semibold text-slate-900">{s.odp?.cliente?.nombre_razon_social || '—'}</td>
                            <td className="px-5 py-4">{s.odp?.estado_produccion ? <BadgeEstado estado={s.odp.estado_produccion} /> : '—'}</td>
                            <td className="px-5 py-4">
                              <span className="px-2.5 py-1 bg-indigo-50 text-indigo-800 rounded-full text-xs font-semibold whitespace-nowrap border border-indigo-200">{s.numero_sa}</span>
                            </td>
                            <td className="px-5 py-4 text-slate-800 whitespace-nowrap">{fmtFecha(s.fecha_sa)}</td>
                            <td className="px-5 py-4 text-slate-800 text-xs whitespace-nowrap">{s.creador?.nombre_completo || '—'}</td>
                            {puedeEditar && (
                              <td className="px-5 py-4">
                                <div className="flex gap-2">
                                  <button onClick={() => abrirEditar(s, true)}
                                    className="p-1.5 text-slate-500 hover:text-violet-700 hover:bg-violet-50 rounded-lg transition">
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => eliminarSA(s.id, true)}
                                    className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            )}
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
      </>)}

      {/* ── MODAL SA / SFV ── */}
      {modalSA && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200">
            <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {modalSA.salida
                    ? (modalSA.esOA ? 'Editar Salida SFV' : 'Editar Salida de Almacén')
                    : (modalSA.esOA ? 'Registrar Salida SFV' : 'Registrar Salida de Almacén')}
                </h2>
                <p className="text-xs text-slate-700 mt-0.5">
                  {modalSA.odp?.numero_odp || modalSA.salida?.odp?.numero_odp} ·{' '}
                  {(modalSA.odp as any)?.cliente?.nombre_razon_social || modalSA.salida?.odp?.cliente?.nombre_razon_social}
                </p>
              </div>
              <button onClick={() => setModalSA(null)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-900 mb-1 uppercase">
                  Número de Salida *
                </label>
                <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-violet-500">
                  <span className="px-3 py-2.5 bg-slate-100 text-slate-800 text-sm font-semibold border-r border-slate-300 select-none">
                    {prefijo}
                  </span>
                  <input
                    value={formSA.numero}
                    onChange={e => setFormSA(p => ({ ...p, numero: e.target.value }))}
                    placeholder="0001"
                    className="flex-1 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Se guardará como: {prefijo}{formSA.numero || 'XXXX'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-900 mb-1 uppercase">Fecha de Salida *</label>
                <input type="date" value={formSA.fecha} onChange={e => setFormSA(p => ({ ...p, fecha: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setModalSA(null)}
                className="flex-1 py-2.5 font-semibold text-slate-800 border border-slate-300 rounded-xl hover:bg-slate-50 transition text-sm">
                Cancelar
              </button>
              <button onClick={guardarSA} disabled={savingSA}
                className="flex-1 py-2.5 font-bold text-white bg-violet-600 rounded-xl hover:bg-violet-700 transition disabled:opacity-40 text-sm">
                {savingSA ? 'Guardando...' : modalSA.salida ? 'Guardar Cambios' : (modalSA.esOA ? 'Registrar SFV' : 'Registrar SA')}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {fichaOdpId && <ODPFichaModal odpId={fichaOdpId} onClose={() => setFichaOdpId(null)} />}
    </div>
  );
};

export default FacturasSalidasPage;
