import React, { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserPlus, Search, RefreshCw, CheckCircle2, XCircle, Clock,
  Phone, MapPin, Plus, Ruler, X, Calendar, Image,
  Mail, ChevronRight, User
} from 'lucide-react';
import ProspectoModal from './components/ProspectoModal';
import AprobarProspectoModal from './components/AprobarProspectoModal';
import FolderTabs from '../../components/FolderTabs';
import AsignarAsesorODPModal from '../odp/components/AsignarAsesorODPModal';
import SeleccionarTipoODPModal from '../odp/components/SeleccionarTipoODPModal';
import SolicitarTMModal from './components/SolicitarTMModal';
import CotizacionCapturas from '../odp/components/CotizacionCapturas';
import { getTmEstadoConfig, tmVisitaRealizada } from '../../utils/tmEstado';

import API from '../../services/config';

interface TM {
  id: number; numero_tm: string; estado: string; fecha_visita: string | null;
  croquis_url: string | null; medidas_json: string[] | null;
  direccion: string | null; nombre_contacto: string | null;
  telefono_contacto: string | null; observaciones: string | null;
}

interface Prospecto {
  id: number;
  numero_prospecto: string;
  estado: 'en_gestion' | 'aprobado' | 'no_aprobado';
  nombre_contacto: string;
  telefono_contacto: string;
  email_contacto: string;
  direccion: string;
  descripcion: string;
  motivo_no_aprobado: string;
  fecha_creacion: string;
  fecha_gestion: string;
  asesor: { id: number; nombre_completo: string };
  cliente: { id: number; nombre_razon_social: string } | null;
  tomas_medidas: TM[];
  odp: { id: number; numero_odp: string; estado_produccion: string } | null;
}

const ESTADO_STYLE: Record<string, { label: string; className: string; dot: string; icon: React.ReactNode }> = {
  en_gestion: { label: 'En Gestión',  className: 'bg-amber-100 text-amber-700 border-amber-200',  dot: 'bg-amber-400', icon: <Clock className="w-3 h-3" /> },
  aprobado:   { label: 'Aprobado',    className: 'bg-green-100 text-green-700 border-green-200',   dot: 'bg-green-500', icon: <CheckCircle2 className="w-3 h-3" /> },
  no_aprobado:{ label: 'No aprobado', className: 'bg-red-100 text-red-700 border-red-200',          dot: 'bg-red-400',   icon: <XCircle className="w-3 h-3" /> },
};

const TABS = [
  { key: 'en_gestion',  label: 'En Gestión' },
  { key: 'aprobado',    label: 'Aprobados' },
  { key: 'no_aprobado', label: 'No Aprobados' },
];

// ─── Modal de detalle del prospecto ──────────────────────────────────────────

const DetalleModal: React.FC<{
  prospecto: Prospecto;
  onClose: () => void;
  onEditar: () => void;
  onAprobar: () => void;
  onNoAprobar: () => void;
  onSolicitarTM: () => void;
  isReadOnly?: boolean;
}> = ({ prospecto: p, onClose, onEditar, onAprobar, onNoAprobar, onSolicitarTM, isReadOnly }) => {
  const est = ESTADO_STYLE[p.estado];
  const contacto = p.cliente?.nombre_razon_social || p.nombre_contacto || '—';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-200"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-start gap-3">
            <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${est.dot}`} />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                  {p.numero_prospecto}
                </span>
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${est.className}`}>
                  {est.icon}{est.label}
                </span>
                {p.odp && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-violet-100 text-violet-700 border-violet-200">
                    ODP: {p.odp.numero_odp}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-black text-slate-800 mt-1">{contacto}</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                <User className="w-3 h-3 inline mr-1" />{p.asesor?.nombre_completo} · {new Date(p.fecha_creacion).toLocaleDateString('es-CO')}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo scrollable */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">

            {/* Descripción */}
            {p.descripcion && (
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Proyecto</p>
                <p className="text-sm text-slate-700">{p.descripcion}</p>
              </div>
            )}

            {/* Datos de contacto */}
            <div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">Datos de Contacto</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {p.telefono_contacto && (
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Teléfono</p>
                      <p className="text-sm font-bold text-slate-700">{p.telefono_contacto}</p>
                    </div>
                  </div>
                )}
                {p.email_contacto && (
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Email</p>
                      <p className="text-sm font-bold text-slate-700 truncate">{p.email_contacto}</p>
                    </div>
                  </div>
                )}
                {p.direccion && (
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 sm:col-span-2">
                    <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Dirección</p>
                      <p className="text-sm font-bold text-slate-700">{p.direccion}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Motivo no aprobado */}
            {p.motivo_no_aprobado && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-xs font-black text-red-600 uppercase tracking-wider mb-1">Motivo no aprobado</p>
                <p className="text-sm text-red-700">{p.motivo_no_aprobado}</p>
              </div>
            )}

            {/* Tomas de medidas */}
            {p.tomas_medidas.length > 0 && (
              <div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Ruler className="w-3.5 h-3.5" /> Tomas de Medidas
                </p>
                <div className="space-y-3">
                  {p.tomas_medidas.map(tm => (
                    <div key={tm.id} className={`rounded-xl border p-4 space-y-3 ${getTmEstadoConfig(tm.estado).cardCls}`}>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-slate-700">{tm.numero_tm}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getTmEstadoConfig(tm.estado).badgeCls}`}>
                            {getTmEstadoConfig(tm.estado).label}
                          </span>
                        </div>
                        {tm.fecha_visita && (
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(tm.fecha_visita + 'T00:00:00').toLocaleDateString('es-CO')}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                        {tm.direccion && (
                          <p className="flex items-center gap-1 col-span-2">
                            <MapPin className="w-3 h-3 text-slate-400" />{tm.direccion}
                          </p>
                        )}
                        {tm.nombre_contacto && (
                          <p className="flex items-center gap-1">
                            <User className="w-3 h-3 text-slate-400" />{tm.nombre_contacto}
                          </p>
                        )}
                        {tm.telefono_contacto && (
                          <p className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-400" />{tm.telefono_contacto}
                          </p>
                        )}
                        {tm.observaciones && (
                          <p className="text-slate-500 italic col-span-2">{tm.observaciones}</p>
                        )}
                      </div>

                      {/* Galería fotos */}
                      {tm.medidas_json && tm.medidas_json.length > 0 ? (
                        <div>
                          <p className="text-xs font-bold text-emerald-700 mb-2 flex items-center gap-1">
                            <Image className="w-3 h-3" /> Fotos relevadas ({tm.medidas_json.length})
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            {tm.medidas_json.map((url, idx) => (
                              <a key={idx} href={url} target="_blank" rel="noreferrer">
                                <img src={url} alt={`Foto ${idx + 1}`}
                                  className="rounded-lg border border-emerald-200 w-full object-cover aspect-square bg-white hover:opacity-85 transition" />
                              </a>
                            ))}
                          </div>
                        </div>
                      ) : getTmEstadoConfig(tm.estado).mensajeSinFotos ? (
                        <p className={`text-xs italic ${tmVisitaRealizada(tm.estado) ? 'text-emerald-600' : tm.estado === 'programada' ? 'text-blue-600' : 'text-amber-600'}`}>
                          {getTmEstadoConfig(tm.estado).mensajeSinFotos}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Capturas de cotización */}
          <div>
            <CotizacionCapturas prospecto_id={p.id} />
          </div>
        </div>

        {/* Footer con acciones */}
        {p.estado === 'en_gestion' && !isReadOnly && (
          <div className="border-t border-slate-100 px-6 py-4 flex-shrink-0 space-y-2">
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">Acciones</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={onEditar}
                className="py-2.5 text-sm font-bold border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition">
                Editar
              </button>
              {p.tomas_medidas.some(tm => ['solicitada', 'programada'].includes(tm.estado)) ? (
                <button disabled title="Ya hay una toma de medidas pendiente"
                  className="py-2.5 text-sm font-bold bg-slate-100 text-slate-400 rounded-xl border border-slate-200 cursor-not-allowed flex items-center justify-center gap-1.5">
                  <Ruler className="w-3.5 h-3.5" /> TM en curso
                </button>
              ) : (
                <button onClick={onSolicitarTM}
                  className="py-2.5 text-sm font-bold bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition flex items-center justify-center gap-1.5">
                  <Ruler className="w-3.5 h-3.5" />
                  {p.tomas_medidas.length === 0 ? 'Solicitar TM' : 'Nueva TM'}
                </button>
              )}
            </div>
            <button onClick={onAprobar}
              className="w-full py-2.5 text-sm font-bold bg-green-600 text-white rounded-xl hover:bg-green-700 transition flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Aprobar — Generar ODP
            </button>
            <button onClick={onNoAprobar}
              className="w-full py-2.5 text-sm font-bold bg-red-50 text-red-600 border border-red-200 rounded-xl hover:bg-red-100 transition flex items-center justify-center gap-2">
              <XCircle className="w-4 h-4" /> No aprobado — Archivar
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const ProspectosPage: React.FC = () => {
  const authUser = useSelector((state: any) => state.auth?.user);
  const isReadOnly = authUser?.rol === 'asistente_administrativo';

  const [prospectos, setProspectos] = useState<Prospecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<string>('en_gestion');
  const [search, setSearch] = useState('');
  const [detalle, setDetalle] = useState<Prospecto | null>(null);
  const [modalCrear, setModalCrear] = useState(false);
  const [editando, setEditando] = useState<Prospecto | null>(null);
  const [aprobando, setAprobando] = useState<Prospecto | null>(null);
  const [showAsignarAsesorProspecto, setShowAsignarAsesorProspecto] = useState(false);
  const [showSeleccionarTipoProspecto, setShowSeleccionarTipoProspecto] = useState(false);
  const [prospectoParaAprobar, setProspectoParaAprobar] = useState<Prospecto | null>(null);
  const [asesorParaProspecto, setAsesorParaProspecto] = useState<number | null>(null);
  const [tipoOdpProspecto, setTipoOdpProspecto] = useState<'ODP' | 'OA'>('ODP');
  const [archivandoId, setArchivandoId] = useState<number | null>(null);
  const [motivoArchivo, setMotivoArchivo] = useState('');
  const [solicitandoTM, setSolicitandoTM] = useState<Prospecto | null>(null);

  // Paginación server-side
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);

  const token = sessionStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchProspectos = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/api/prospectos`, { headers, params: { page: pagina, limit: 100 } });
      setProspectos(res.data.rows ?? []);
      setTotalPaginas(res.data.totalPages ?? 1);
    } catch {
      toast.error('Error al cargar prospectos');
    } finally {
      setLoading(false);
    }
  }, [pagina]); // eslint-disable-line

  useEffect(() => { fetchProspectos(); }, [fetchProspectos]);

  // Actualizar detalle abierto tras refrescar
  useEffect(() => {
    if (detalle) {
      const actualizado = prospectos.find(p => p.id === detalle.id);
      if (actualizado) setDetalle(actualizado);
    }
  }, [prospectos]); // eslint-disable-line

  const handleNoAprobar = async () => {
    if (!archivandoId) return;
    try {
      await axios.patch(`${API}/api/prospectos/${archivandoId}/no-aprobar`,
        { motivo_no_aprobado: motivoArchivo }, { headers });
      toast.success('Prospecto archivado');
      setArchivandoId(null);
      setMotivoArchivo('');
      setDetalle(null);
      fetchProspectos();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al archivar');
    }
  };

  const filtrados = prospectos
    .filter(p => p.estado === tab)
    .filter(p => {
      const q = search.toLowerCase();
      return (
        p.numero_prospecto.toLowerCase().includes(q) ||
        (p.nombre_contacto || '').toLowerCase().includes(q) ||
        (p.cliente?.nombre_razon_social || '').toLowerCase().includes(q) ||
        (p.descripcion || '').toLowerCase().includes(q)
      );
    });

  const counts = { en_gestion: 0, aprobado: 0, no_aprobado: 0 };
  prospectos.forEach(p => { counts[p.estado] = (counts[p.estado] || 0) + 1; });

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 rounded-xl">
            <UserPlus className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">Prospectos</h1>
            <p className="text-xs text-slate-500">Gestión de contactos y oportunidades de venta</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchProspectos} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition">
            <RefreshCw className="w-4 h-4" />
          </button>
          {!isReadOnly && (
          <button
            onClick={() => setModalCrear(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition shadow-sm"
          >
            <Plus className="w-4 h-4" /> Nuevo Prospecto
          </button>
          )}
        </div>
      </div>

      {/* Tabs — estilo carpeta */}
      <div className="mb-4">
        <FolderTabs
          tabs={TABS.map(t => ({ key: t.key, label: t.label, badge: counts[t.key as keyof typeof counts] || 0 }))}
          activeKey={tab}
          onChange={(k) => setTab(k)}
          className="border-b border-slate-200"
        />
      </div>

      {/* Búsqueda */}
      <div className="relative mb-4">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, número, descripción..."
          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-16 text-slate-400">Cargando...</div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <UserPlus className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-bold">No hay prospectos en este estado</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtrados.map(p => {
            const est = ESTADO_STYLE[p.estado];
            const contacto = p.cliente?.nombre_razon_social || p.nombre_contacto || '—';
            const tm = p.tomas_medidas?.[0];
            const tieneFotos = p.tomas_medidas.some(t => t.medidas_json && t.medidas_json.length > 0);

            return (
              <motion.button
                key={p.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setDetalle(p)}
                className="w-full text-left bg-white rounded-xl border border-slate-200 px-4 py-3.5 hover:border-indigo-300 hover:shadow-sm transition-all flex items-center gap-4 group"
              >
                {/* Dot estado */}
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${est.dot}`} />

                {/* Info principal */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-xs font-black text-indigo-600">{p.numero_prospecto}</span>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${est.className}`}>
                      {est.icon}{est.label}
                    </span>
                    {tm && (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        tieneFotos || tmVisitaRealizada(tm.estado)
                          ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                          : getTmEstadoConfig(tm.estado).badgeCls
                      }`}>
                        <Ruler className="w-3 h-3" />
                        {tieneFotos || tmVisitaRealizada(tm.estado)
                          ? 'TM realizada'
                          : `TM ${getTmEstadoConfig(tm.estado).label.toLowerCase()}`}
                      </span>
                    )}
                    {p.odp && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-violet-100 text-violet-700 border-violet-200">
                        {p.odp.numero_odp}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-slate-800 truncate">{contacto}</p>
                  {p.descripcion && (
                    <p className="text-xs text-slate-400 truncate mt-0.5">{p.descripcion}</p>
                  )}
                </div>

                {/* Meta derecha */}
                <div className="hidden md:flex flex-col items-end gap-1 flex-shrink-0 text-xs text-slate-400">
                  <span className="font-medium">{p.asesor?.nombre_completo}</span>
                  <span>{new Date(p.fecha_creacion).toLocaleDateString('es-CO')}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition flex-shrink-0" />
              </motion.button>
            );
          })}
        </div>
      )}

      {/* Paginación */}
      {!loading && totalPaginas > 0 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina <= 1}
            className="px-3 py-1.5 text-sm font-bold border border-slate-200 rounded-xl disabled:opacity-40 hover:bg-slate-50 transition">
            ←
          </button>
          <span className="text-sm font-semibold text-slate-600">
            Página {pagina} de {totalPaginas}
          </span>
          <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina >= totalPaginas}
            className="px-3 py-1.5 text-sm font-bold border border-slate-200 rounded-xl disabled:opacity-40 hover:bg-slate-50 transition">
            →
          </button>
        </div>
      )}

      {/* Modal detalle */}
      <AnimatePresence>
        {detalle && (
          <DetalleModal
            prospecto={detalle}
            onClose={() => setDetalle(null)}
            onEditar={() => { setEditando(detalle); setDetalle(null); }}
            onAprobar={() => { setProspectoParaAprobar(detalle); setShowAsignarAsesorProspecto(true); setDetalle(null); }}
            onNoAprobar={() => { setArchivandoId(detalle.id); setMotivoArchivo(''); setDetalle(null); }}
            onSolicitarTM={() => { setSolicitandoTM(detalle); setDetalle(null); }}
            isReadOnly={isReadOnly}
          />
        )}
      </AnimatePresence>

      {/* Modal crear/editar */}
      {(modalCrear || editando) && (
        <ProspectoModal
          prospecto={editando}
          onClose={() => { setModalCrear(false); setEditando(null); }}
          onSaved={() => { setModalCrear(false); setEditando(null); fetchProspectos(); }}
        />
      )}

      {/* Paso 1: asignar asesor al aprobar prospecto */}
      {showAsignarAsesorProspecto && prospectoParaAprobar && (
        <AsignarAsesorODPModal
          onConfirm={(asesorId) => {
            setAsesorParaProspecto(asesorId);
            setShowAsignarAsesorProspecto(false);
            setShowSeleccionarTipoProspecto(true);
          }}
          onCancel={() => { setShowAsignarAsesorProspecto(false); setProspectoParaAprobar(null); }}
        />
      )}

      {/* Paso 2: elegir ODP o OA */}
      {showSeleccionarTipoProspecto && prospectoParaAprobar && (
        <SeleccionarTipoODPModal
          onConfirm={(tipo) => {
            setTipoOdpProspecto(tipo);
            setShowSeleccionarTipoProspecto(false);
            setAprobando(prospectoParaAprobar);
          }}
          onCancel={() => { setShowSeleccionarTipoProspecto(false); setAsesorParaProspecto(null); setProspectoParaAprobar(null); }}
        />
      )}

      {/* Modal aprobar → generar ODP */}
      {aprobando && (
        <AprobarProspectoModal
          prospecto={aprobando}
          asesorId={asesorParaProspecto}
          tipoOdp={tipoOdpProspecto}
          onClose={() => { setAprobando(null); setAsesorParaProspecto(null); setProspectoParaAprobar(null); setTipoOdpProspecto('ODP'); }}
          onAprobado={() => { setAprobando(null); setAsesorParaProspecto(null); setProspectoParaAprobar(null); setTipoOdpProspecto('ODP'); fetchProspectos(); }}
        />
      )}

      {/* Modal solicitar visita técnica */}
      {solicitandoTM && (
        <SolicitarTMModal
          prospecto={solicitandoTM}
          onClose={() => setSolicitandoTM(null)}
          onCreada={() => { setSolicitandoTM(null); fetchProspectos(); }}
        />
      )}

      {/* Confirmar no aprobar */}
      <AnimatePresence>
        {archivandoId !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-slate-800">Archivar prospecto</h3>
                <button onClick={() => setArchivandoId(null)}><X className="w-5 h-5 text-slate-400" /></button>
              </div>
              <p className="text-sm text-slate-500 mb-3">Ingresa el motivo por el que no se aprobó (opcional):</p>
              <textarea value={motivoArchivo} onChange={e => setMotivoArchivo(e.target.value)}
                placeholder="Precio muy alto, no interesado, etc..." rows={3}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 mb-4"
              />
              <div className="flex gap-2">
                <button onClick={() => setArchivandoId(null)}
                  className="flex-1 py-2.5 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition text-sm">
                  Cancelar
                </button>
                <button onClick={handleNoAprobar}
                  className="flex-1 py-2.5 font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 transition text-sm">
                  Archivar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProspectosPage;
