import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, History, Ruler, CheckCircle2, Package, DollarSign, Truck, CreditCard,
  Archive, Calendar, Camera, AlertCircle, AlertTriangle, Shield, MessageSquare,
  ChevronDown, ChevronUp, User, ArrowRight, RefreshCw, Loader2, ExternalLink,
  X, Plus, TrendingUp, Images, Printer, Tag, Wrench, Film, Box, Sparkles,
  MapPin, Phone, Building2, ClipboardList, PenTool, Star
} from 'lucide-react';
import axios from 'axios';
import { fmt } from './ODPFichaModal.utils';
import API from '../../../services/config';

const TIPO_VISUAL: Record<string, { icon: (cls: string) => React.ReactNode; dot: string; peso: 'alto' | 'medio' | 'bajo' }> = {
  ODP_CREADA:         { icon: (c) => <FileText className={c} />,     dot: 'bg-indigo-600',  peso: 'alto'  },
  ESTADO_CAMBIADO:    { icon: (c) => <History className={c} />,      dot: 'bg-slate-500',   peso: 'medio' },
  TM_SOLICITADA:      { icon: (c) => <Ruler className={c} />,        dot: 'bg-amber-500',   peso: 'bajo'  },
  TM_REALIZADA:       { icon: (c) => <CheckCircle2 className={c} />, dot: 'bg-amber-600',   peso: 'medio' },
  SAP_CREADA:         { icon: (c) => <Package className={c} />,      dot: 'bg-violet-500',  peso: 'bajo'  },
  COT_CREADA:         { icon: (c) => <DollarSign className={c} />,   dot: 'bg-blue-500',    peso: 'medio' },
  ODC_CREADA:         { icon: (c) => <Package className={c} />,      dot: 'bg-purple-500',  peso: 'bajo'  },
  ODC_RECIBIDA:       { icon: (c) => <CheckCircle2 className={c} />, dot: 'bg-green-500',   peso: 'medio' },
  PV_CREADO:          { icon: (c) => <Truck className={c} />,        dot: 'bg-sky-500',     peso: 'bajo'  },
  PV_LLEGADO:         { icon: (c) => <Truck className={c} />,        dot: 'bg-emerald-500', peso: 'medio' },
  PV_VERIFICADO:      { icon: (c) => <CheckCircle2 className={c} />, dot: 'bg-emerald-600', peso: 'bajo'  },
  PV_PROBLEMA:        { icon: (c) => <AlertTriangle className={c} />,dot: 'bg-orange-500',  peso: 'alto'  },
  PAGO_REGISTRADO:    { icon: (c) => <CreditCard className={c} />,   dot: 'bg-teal-500',    peso: 'alto'  },
  SA_GENERADA:        { icon: (c) => <Archive className={c} />,      dot: 'bg-teal-600',    peso: 'medio' },
  RUTA_PROGRAMADA:    { icon: (c) => <Calendar className={c} />,     dot: 'bg-orange-500',  peso: 'medio' },
  INSTALACION_INICIO: { icon: (c) => <Truck className={c} />,        dot: 'bg-emerald-500', peso: 'medio' },
  INSTALACION_FIN:    { icon: (c) => <CheckCircle2 className={c} />, dot: 'bg-green-600',   peso: 'alto'  },
  DANO_REPORTADO:     { icon: (c) => <AlertTriangle className={c} />,dot: 'bg-rose-500',    peso: 'alto'  },
  EVIDENCIA_SUBIDA:   { icon: (c) => <Camera className={c} />,       dot: 'bg-emerald-500', peso: 'bajo'  },
  NC_REPORTADA:       { icon: (c) => <AlertCircle className={c} />,  dot: 'bg-rose-600',    peso: 'alto'  },
  GARANTIA_CREADA:    { icon: (c) => <Shield className={c} />,       dot: 'bg-blue-500',    peso: 'alto'  },
  NOTA_PRODUCCION:    { icon: (c) => <MessageSquare className={c} />,dot: 'bg-slate-400',   peso: 'bajo'  },
};

const HIST_CATS: Record<string, { bg: string; text: string; border: string; dot: string; label: string; icon: React.ReactNode }> = {
  comercial:   { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200',  dot: 'bg-indigo-500',  label: 'Comercial',   icon: <DollarSign className="w-3 h-3" /> },
  produccion:  { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500',   label: 'Producción',  icon: <Wrench className="w-3 h-3" /> },
  instalacion: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500', label: 'Instalación', icon: <Truck className="w-3 h-3" /> },
  financiero:  { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200',    dot: 'bg-teal-500',    label: 'Financiero',  icon: <CreditCard className="w-3 h-3" /> },
  calidad:     { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    dot: 'bg-rose-500',    label: 'Calidad',     icon: <AlertTriangle className="w-3 h-3" /> },
  sistema:     { bg: 'bg-slate-50',   text: 'text-slate-600',   border: 'border-slate-200',   dot: 'bg-slate-400',   label: 'Sistema',     icon: <MessageSquare className="w-3 h-3" /> },
};

const ESTADO_HIST_COLOR: Record<string, string> = {
  EN_ESPERA: 'bg-slate-100 text-slate-600 border-slate-200',
  MEDICION: 'bg-sky-100 text-sky-700 border-sky-200',
  ALUMINIO_CORTADO: 'bg-blue-100 text-blue-700 border-blue-200',
  VIDRIO_RECIBIDO: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  ACCESORIOS_SEPARADOS: 'bg-teal-100 text-teal-700 border-teal-200',
  LISTO_INSTALAR: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  PROGRAMADA: 'bg-amber-100 text-amber-700 border-amber-200',
  INSTALADA: 'bg-green-100 text-green-700 border-green-200',
  ENTREGADA: 'bg-gray-100 text-gray-700 border-gray-200',
  PAUSADA: 'bg-rose-100 text-rose-700 border-rose-200',
};

const fmtHora   = (f: string) => f ? new Date(f).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '—';
const fmtTs     = (f: string) => f ? new Date(f).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDate   = (f: string) => f ? new Date(f.includes('T') ? f : f + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

const getDayKey = (f: string) => {
  const d = new Date(f);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
};

const fmtDayLabel = (iso: string) => {
  const d = new Date(iso);
  const hoy  = new Date(); hoy.setHours(0,0,0,0);
  const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1);
  if (d.getTime() === hoy.getTime())  return 'Hoy';
  if (d.getTime() === ayer.getTime()) return 'Ayer';
  return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

function renderHistDetalle(ev: any, onOpenLightbox?: (src: string) => void): React.ReactNode {
  const { tipo, meta } = ev;

  if (tipo === 'ESTADO_CAMBIADO') return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        {meta.estado_anterior && <>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${ESTADO_HIST_COLOR[meta.estado_anterior] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>{meta.estado_anterior.replace(/_/g, ' ')}</span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        </>}
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${ESTADO_HIST_COLOR[meta.estado_nuevo] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>{meta.estado_nuevo?.replace(/_/g, ' ')}</span>
      </div>
      {meta.observacion && <p className="text-xs text-slate-600 bg-white rounded-lg px-3 py-2 border border-slate-200 italic leading-relaxed">"{meta.observacion}"</p>}
    </div>
  );

  if (tipo === 'NC_REPORTADA') return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-xs">
        {[
          { l: 'Tipo de error',   v: meta.tipo_error?.replace(/_/g, ' ') },
          { l: 'Área',            v: meta.area_error },
          { l: 'Responsable',     v: meta.responsable },
          { l: 'Costo',           v: meta.costo_total > 0 ? <strong className="text-rose-600">{fmt(Number(meta.costo_total))}</strong> : null },
          { l: 'Estado NC',       v: meta.estado },
          { l: 'Reportó',         v: meta.usuario_reporta?.nombre_completo },
        ].filter(r => r.v).map(r => (
          <div key={r.l}>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{r.l}</p>
            <p className="font-semibold text-slate-700 mt-0.5">{r.v}</p>
          </div>
        ))}
      </div>
      {meta.causa       && <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Causa</p><p className="text-xs text-slate-600 bg-white rounded-lg px-3 py-2 border border-slate-200">{meta.causa}</p></div>}
      {meta.efecto      && <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Efecto</p><p className="text-xs text-slate-600 bg-white rounded-lg px-3 py-2 border border-slate-200">{meta.efecto}</p></div>}
      {meta.observaciones && <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Observaciones</p><p className="text-xs text-slate-600 bg-white rounded-lg px-3 py-2 border border-slate-200">{meta.observaciones}</p></div>}
      <div className="flex items-center gap-2 pt-0.5 flex-wrap">
        {[
          { label: 'Vo.Bo. Responsable', ok: meta.vo_bo_responsable },
          { label: 'Vo.Bo. Gerencia',    ok: meta.vo_bo_gerencia },
        ].map(vb => (
          <span key={vb.label} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${vb.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
            <CheckCircle2 className="w-3 h-3" />{vb.label}
          </span>
        ))}
        {meta.nueva_odp && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <ExternalLink className="w-3 h-3" />Reproceso: {meta.nueva_odp.numero_odp}
          </span>
        )}
      </div>
    </div>
  );

  if (tipo === 'NOTA_PRODUCCION') return (
    <p className="text-xs text-slate-700 bg-white rounded-lg px-3 py-2.5 border border-slate-200 leading-relaxed">{meta.texto}</p>
  );

  if (tipo === 'RUTA_PROGRAMADA') return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
      {meta.vehiculo  && <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Vehículo</p><p className="font-semibold text-slate-700 mt-0.5">{meta.vehiculo.tipo.toUpperCase()} · {meta.vehiculo.placa}</p></div>}
      {meta.conductor && <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Conductor</p><p className="font-semibold text-slate-700 mt-0.5">{meta.conductor.nombre_completo}</p></div>}
      {meta.oficial   && <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Oficial</p><p className="font-semibold text-slate-700 mt-0.5">{meta.oficial.nombre_completo}</p></div>}
      {(() => { const ayud = meta.instaladores?.filter((i: any) => i.id !== meta.oficial?.id); return ayud?.length > 0 ? <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Ayudantes</p><p className="font-semibold text-slate-700 mt-0.5">{ayud.map((i: any) => i.nombre_completo).join(', ')}</p></div> : null; })()}
    </div>
  );

  if (tipo === 'DANO_REPORTADO') return (
    <div className="flex gap-4">
      {meta.foto_url && (
        <div className="w-32 h-24 rounded-xl overflow-hidden border border-rose-200 flex-shrink-0 cursor-zoom-in bg-rose-50" onClick={() => onOpenLightbox?.(meta.foto_url)}>
          <img src={meta.foto_url} alt="Foto daño" className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
        </div>
      )}
      {meta.instaladores?.length > 0 && (
        <div className="text-xs">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Equipo</p>
          <div className="space-y-0.5">{meta.instaladores.map((ins: any) => <p key={ins.id} className="font-medium text-slate-700">{ins.nombre_completo}</p>)}</div>
        </div>
      )}
    </div>
  );

  if (tipo === 'PAGO_REGISTRADO') return (
    <div className="space-y-1 text-xs text-slate-600">
      {meta.registrador  && <p>Registró: <strong>{meta.registrador.nombre_completo}</strong></p>}
      {meta.observaciones && <p className="italic text-slate-400">"{meta.observaciones}"</p>}
    </div>
  );

  if (tipo === 'PV_PROBLEMA') return (
    <div className="space-y-1 text-xs text-slate-600">
      {meta.tipo_problema    && <p>Tipo: <strong>{meta.tipo_problema}</strong></p>}
      {meta.estado_reposicion && <p>Reposición: <strong>{meta.estado_reposicion}</strong></p>}
      {meta.observaciones    && <p className="italic text-slate-400">"{meta.observaciones}"</p>}
    </div>
  );

  return null;
}

function renderHistChips(ev: any): React.ReactNode {
  const { tipo, meta } = ev;

  if (tipo === 'INSTALACION_FIN' && meta.datos_receptor)
    return <span className="text-xs text-slate-500">Recibió: <strong>{meta.datos_receptor}</strong></span>;

  if (tipo === 'PV_LLEGADO' && meta.dias_diferencia != null)
    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta.dias_diferencia > 0 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>{meta.dias_diferencia > 0 ? `${meta.dias_diferencia}d retraso` : 'A tiempo'}</span>;

  if (tipo === 'ODC_CREADA' || tipo === 'ODC_RECIBIDA')
    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta.tipo === 'vidrio' ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-violet-50 text-violet-700 border-violet-200'}`}><Tag className="w-2.5 h-2.5" />{meta.tipo === 'vidrio' ? 'Vidrio' : 'Perfilería'}</span>;

  if (tipo === 'SA_GENERADA' && meta.fecha_sa)
    return <span className="text-xs text-slate-500">Fecha SA: {fmtDate(meta.fecha_sa)}</span>;

  if (tipo === 'COT_CREADA' && meta.estado) {
    const c: Record<string, string> = { aprobada: 'bg-emerald-50 text-emerald-700 border-emerald-200', enviada: 'bg-blue-50 text-blue-700 border-blue-200', rechazada: 'bg-rose-50 text-rose-700 border-rose-200' };
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${c[meta.estado] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>{meta.estado}</span>;
  }

  if (tipo === 'GARANTIA_CREADA' && meta.estado_produccion)
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${ESTADO_HIST_COLOR[meta.estado_produccion] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>{meta.estado_produccion.replace(/_/g, ' ')}</span>;

  return null;
}

function renderHistStats(eventos: any[]): React.ReactNode {
  const pagos   = eventos.filter(e => e.tipo === 'PAGO_REGISTRADO');
  const totalPagado = pagos.reduce((s, e) => s + Number(e.meta.monto || 0), 0);
  const alertas = eventos.filter(e => ['NC_REPORTADA', 'DANO_REPORTADO', 'PV_PROBLEMA'].includes(e.tipo)).length;
  const instFin = eventos.filter(e => e.tipo === 'INSTALACION_FIN').length;

  const stats = [
    { label: 'Total eventos',    value: eventos.length, color: 'text-slate-700', sub: '' },
    { label: 'Pagos recibidos',  value: pagos.length > 0 ? fmt(totalPagado) : '—', color: 'text-teal-700', sub: pagos.length > 0 ? `${pagos.length} registro${pagos.length > 1 ? 's' : ''}` : '' },
    { label: 'Instalaciones',    value: instFin > 0 ? `${instFin} completada${instFin > 1 ? 's' : ''}` : '—', color: 'text-emerald-700', sub: '' },
    { label: 'Alertas calidad',  value: alertas > 0 ? alertas : '—', color: alertas > 0 ? 'text-rose-600' : 'text-slate-400', sub: alertas > 0 ? 'NC / daños / PV' : '' },
  ];

  return (
    <div className="grid grid-cols-4 gap-3 mb-5">
      {stats.map(s => (
        <div key={s.label} className="bg-white rounded-xl border border-slate-100 px-4 py-3 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{s.label}</p>
          <p className={`text-lg font-black leading-tight ${s.color}`}>{s.value}</p>
          {s.sub && <p className="text-[10px] text-slate-400 mt-0.5">{s.sub}</p>}
        </div>
      ))}
    </div>
  );
}

const TabHistorial: React.FC<{ odp: any; onOpenLightbox?: (src: string) => void }> = ({ odp, onOpenLightbox }) => {
  const [eventos, setEventos]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [filtros, setFiltros]   = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchHistorial = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const token = sessionStorage.getItem('token');
      const { data } = await axios.get(`${API}/api/odp/${odp.id}/historial`, { headers: { Authorization: `Bearer ${token}` } });
      setEventos(data.eventos || []);
    } catch { setError('No se pudo cargar el historial'); }
    finally { setLoading(false); }
  }, [odp.id]);

  useEffect(() => { fetchHistorial(); }, [fetchHistorial]);

  const toggleFiltro  = (cat: string) => setFiltros(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  const toggleExpanded = (key: string) => setExpanded(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });

  const filtrados = filtros.length === 0 ? eventos : eventos.filter(e => filtros.includes(e.categoria));

  const byDay: [string, any[]][] = Object.entries(
    [...filtrados].reverse().reduce((acc: Record<string, any[]>, ev) => {
      const k = getDayKey(ev.fecha);
      if (!acc[k]) acc[k] = [];
      acc[k].push(ev);
      return acc;
    }, {})
  ).reverse();

  const EXPANDIBLES = new Set(['ESTADO_CAMBIADO', 'NC_REPORTADA', 'NOTA_PRODUCCION', 'DANO_REPORTADO', 'RUTA_PROGRAMADA', 'PAGO_REGISTRADO', 'PV_PROBLEMA']);
  const puedeExpandir = (ev: any, key: string) => {
    if (!EXPANDIBLES.has(ev.tipo)) return false;
    if (ev.tipo === 'ESTADO_CAMBIADO' && !ev.meta.estado_anterior && !ev.meta.observacion) return false;
    if (ev.tipo === 'PAGO_REGISTRADO' && !ev.meta.observaciones && !ev.meta.registrador) return false;
    if (ev.tipo === 'DANO_REPORTADO'  && !ev.meta.foto_url && !ev.meta.instaladores?.length) return false;
    return true;
  };

  if (loading) return (
    <div className="p-6">
      <div className="grid grid-cols-4 gap-3 mb-5">{Array.from({length:4}).map((_,i)=><div key={i} className="h-16 bg-white rounded-xl border border-slate-100 animate-pulse"/>)}</div>
      <div className="h-8 bg-slate-100 rounded-lg animate-pulse mb-4 w-48" />
      <div className="space-y-2">{Array.from({length:7}).map((_,i)=><div key={i} className="flex gap-3 pl-14"><div className="absolute left-[1.25rem] w-7 h-7 rounded-full bg-slate-200 animate-pulse"/><div className={`flex-1 h-${i%3===0?'16':i%3===1?'12':'10'} bg-white rounded-xl border border-slate-100 animate-pulse`}/></div>)}</div>
      <div className="flex justify-center mt-6"><Loader2 className="w-5 h-5 text-slate-300 animate-spin"/></div>
    </div>
  );

  if (error) return (
    <div className="p-12 text-center text-slate-400">
      <AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-200"/>
      <p className="font-bold">{error}</p>
      <button onClick={fetchHistorial} className="mt-3 flex items-center gap-1.5 mx-auto text-xs text-indigo-600 hover:text-indigo-800 font-bold">
        <RefreshCw className="w-3.5 h-3.5"/> Reintentar
      </button>
    </div>
  );

  return (
    <div className="p-6">
      {eventos.length > 0 && renderHistStats(eventos)}

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <button
          onClick={() => setFiltros([])}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${filtros.length === 0 ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
        >
          Todos <span className={`ml-1 text-[10px] ${filtros.length === 0 ? 'text-slate-300' : 'text-slate-400'}`}>{eventos.length}</span>
        </button>
        {Object.entries(HIST_CATS).map(([cat, cfg]) => {
          const count = eventos.filter(e => e.categoria === cat).length;
          if (count === 0) return null;
          const activo = filtros.includes(cat);
          return (
            <button key={cat} onClick={() => toggleFiltro(cat)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${activo ? `${cfg.bg} ${cfg.text} ${cfg.border}` : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'}`}>
              {cfg.icon}{cfg.label}
              <span className={`text-[10px] rounded-full min-w-[16px] text-center ${activo ? 'text-current opacity-70' : 'text-slate-400'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {filtrados.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <History className="w-10 h-10 mx-auto mb-3 text-slate-200"/>
          <p className="font-bold">Sin eventos para esta categoría</p>
        </div>
      ) : (
        <div className="space-y-6">
          {byDay.map(([dayIso, dayEvs]) => (
            <div key={dayIso}>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-shrink-0 bg-slate-800 text-white rounded-lg px-3 py-1 text-xs font-black tracking-wide capitalize">
                  {fmtDayLabel(dayIso)}
                </div>
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-[10px] text-slate-400 font-bold flex-shrink-0">{dayEvs.length} evento{dayEvs.length > 1 ? 's' : ''}</span>
              </div>

              <div className="relative pl-10">
                <div className="absolute left-[13px] top-0 bottom-0 w-px bg-slate-200" />

                <div className="space-y-1.5">
                  {dayEvs.map((ev, i) => {
                    const vis   = TIPO_VISUAL[ev.tipo] || { icon: (c: string) => <History className={c}/>, dot: 'bg-slate-400', peso: 'bajo' as const };
                    const cat   = HIST_CATS[ev.categoria] || HIST_CATS.sistema;
                    const evKey = `${dayIso}-${i}`;
                    const isExp = expanded.has(evKey);
                    const expandible = puedeExpandir(ev, evKey);

                    const esAlerta   = ['DANO_REPORTADO','NC_REPORTADA','PV_PROBLEMA'].includes(ev.tipo);
                    const esHito     = vis.peso === 'alto';
                    const dotSize    = esHito ? 'w-7 h-7' : 'w-5 h-5';
                    const dotOffset  = esHito ? '-left-[27px]' : '-left-[21px]';
                    const iconScale  = esHito ? 'w-3.5 h-3.5' : 'w-3 h-3';

                    return (
                      <motion.div key={evKey}
                        initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(i * 0.025, 0.3) }}
                        className="relative"
                      >
                        <div className={`absolute top-2.5 ${dotOffset} ${dotSize} rounded-full ${vis.dot} flex items-center justify-center text-white shadow-sm z-10 ring-2 ring-white`}>
                          {vis.icon(iconScale)}
                        </div>

                        <div
                          className={`
                            rounded-xl border transition-all overflow-hidden
                            ${esAlerta   ? 'border-rose-200 bg-rose-50/40 border-l-4 border-l-rose-400' : ''}
                            ${!esAlerta && esHito ? 'border-slate-200 bg-white shadow-sm' : ''}
                            ${!esAlerta && !esHito ? 'border-slate-100 bg-white hover:border-slate-200' : ''}
                            ${isExp ? 'shadow-md' : ''}
                            ${expandible ? 'cursor-pointer' : ''}
                          `}
                          onClick={() => expandible && toggleExpanded(evKey)}
                        >
                          <div className={`flex items-start gap-3 ${esHito ? 'px-4 py-3' : 'px-4 py-2.5'}`}>
                            <span className="text-[11px] font-mono text-slate-400 flex-shrink-0 mt-0.5 w-10 text-right">
                              {fmtHora(ev.fecha)}
                            </span>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <p className={`font-bold leading-snug ${esHito ? 'text-sm text-slate-900' : 'text-xs text-slate-700'}`}>
                                  {ev.titulo}
                                </p>
                                {renderHistChips(ev)}
                              </div>
                              {ev.subtitulo && (
                                <p className="text-xs text-slate-500 mt-0.5 leading-snug">{ev.subtitulo}</p>
                              )}
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              {ev.meta?.usuario?.nombre_completo && (
                                <span className="hidden md:inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5 font-medium">
                                  <User className="w-2.5 h-2.5" />
                                  {ev.meta.usuario.nombre_completo.split(' ')[0]}
                                </span>
                              )}
                              {ev.meta?.asesor?.nombre_completo && !ev.meta?.usuario?.nombre_completo && (
                                <span className="hidden md:inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5 font-medium">
                                  <User className="w-2.5 h-2.5" />
                                  {ev.meta.asesor.nombre_completo.split(' ')[0]}
                                </span>
                              )}
                              {expandible && (
                                <div className={`flex-shrink-0 transition-colors ${isExp ? cat.text : 'text-slate-300'}`}>
                                  {isExp ? <ChevronUp className="w-3.5 h-3.5"/> : <ChevronDown className="w-3.5 h-3.5"/>}
                                </div>
                              )}
                            </div>
                          </div>

                          <AnimatePresence>
                            {isExp && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.16 }}
                                className="overflow-hidden"
                              >
                                <div className={`px-4 pb-4 pt-1 border-t ${esAlerta ? 'border-rose-200 bg-rose-50/30' : 'border-slate-100 bg-slate-50/50'}`}>
                                  {renderHistDetalle(ev, onOpenLightbox)}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TabHistorial;
