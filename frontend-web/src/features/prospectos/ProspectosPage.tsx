import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserPlus, Search, RefreshCw, CheckCircle2, XCircle, Clock,
  Phone, MapPin, ChevronDown, ChevronUp, Plus, Ruler, X,
  Calendar, Image
} from 'lucide-react';
import ProspectoModal from './components/ProspectoModal';
import AprobarProspectoModal from './components/AprobarProspectoModal';
import SolicitarTMModal from './components/SolicitarTMModal';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface TM {
  id: number; numero_tm: string; estado: string; fecha_visita: string | null; croquis_url: string | null;
  direccion: string | null; nombre_contacto: string | null; telefono_contacto: string | null; observaciones: string | null;
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

const ESTADO_STYLE: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  en_gestion: { label: 'En Gestión',  className: 'bg-amber-100 text-amber-700 border-amber-200',  icon: <Clock className="w-3 h-3" /> },
  aprobado:   { label: 'Aprobado',    className: 'bg-green-100 text-green-700 border-green-200',   icon: <CheckCircle2 className="w-3 h-3" /> },
  no_aprobado:{ label: 'No aprobado', className: 'bg-red-100 text-red-700 border-red-200',          icon: <XCircle className="w-3 h-3" /> },
};

const TABS = [
  { key: 'en_gestion',  label: 'En Gestión',   color: 'amber' },
  { key: 'aprobado',    label: 'Aprobados',     color: 'green' },
  { key: 'no_aprobado', label: 'No Aprobados',  color: 'red' },
];

const ProspectosPage: React.FC = () => {
  const [prospectos, setProspectos] = useState<Prospecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<string>('en_gestion');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [modalCrear, setModalCrear] = useState(false);
  const [editando, setEditando] = useState<Prospecto | null>(null);
  const [aprobando, setAprobando] = useState<Prospecto | null>(null);
  const [archivandoId, setArchivandoId] = useState<number | null>(null);
  const [motivoArchivo, setMotivoArchivo] = useState('');
  const [solicitandoTM, setSolicitandoTM] = useState<Prospecto | null>(null);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchProspectos = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/api/prospectos`, { headers });
      setProspectos(res.data);
    } catch {
      toast.error('Error al cargar prospectos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProspectos(); }, [fetchProspectos]);

  const handleNoAprobar = async () => {
    if (!archivandoId) return;
    try {
      await axios.patch(`${API}/api/prospectos/${archivandoId}/no-aprobar`,
        { motivo_no_aprobado: motivoArchivo }, { headers });
      toast.success('Prospecto archivado');
      setArchivandoId(null);
      setMotivoArchivo('');
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
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
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
          <button
            onClick={() => setModalCrear(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition shadow-sm"
          >
            <Plus className="w-4 h-4" /> Nuevo Prospecto
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition flex items-center gap-2 ${
              tab === t.key ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-black ${
              tab === t.key ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-500'
            }`}>
              {counts[t.key as keyof typeof counts] || 0}
            </span>
          </button>
        ))}
      </div>

      {/* Búsqueda */}
      <div className="relative mb-4">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
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
        <div className="space-y-2">
          {filtrados.map(p => {
            const est = ESTADO_STYLE[p.estado];
            const isExpanded = expandedId === p.id;
            const contacto = p.cliente?.nombre_razon_social || p.nombre_contacto || '—';
            const tm = p.tomas_medidas?.[0];

            return (
              <div key={p.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                {/* Fila principal */}
                <div
                  className="flex items-center gap-4 p-4 cursor-pointer hover:bg-slate-50/50 transition"
                  onClick={() => setExpandedId(isExpanded ? null : p.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                        {p.numero_prospecto}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${est.className}`}>
                        {est.icon}{est.label}
                      </span>
                      {tm && (
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          tm.croquis_url ? 'bg-green-100 text-green-700 border-green-200' : 'bg-blue-100 text-blue-700 border-blue-200'
                        }`}>
                          <Ruler className="w-3 h-3" />{tm.numero_tm}
                        </span>
                      )}
                      {p.odp && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-violet-100 text-violet-700 border-violet-200">
                          {p.odp.numero_odp}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-slate-800 truncate">{contacto}</p>
                    {p.descripcion && <p className="text-xs text-slate-500 truncate mt-0.5">{p.descripcion}</p>}
                  </div>
                  <div className="hidden md:flex items-center gap-4 text-xs text-slate-500">
                    <span>{p.asesor?.nombre_completo}</span>
                    <span>{new Date(p.fecha_creacion).toLocaleDateString('es-CO')}</span>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                </div>

                {/* Detalle expandido */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden border-t border-slate-100"
                    >
                      <div className="p-5 space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Info contacto */}
                          <div className="space-y-3">
                            <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Datos del Contacto</p>
                            {p.telefono_contacto && (
                              <div className="flex items-center gap-2 text-sm text-slate-600">
                                <Phone className="w-4 h-4 text-slate-400" />{p.telefono_contacto}
                              </div>
                            )}
                            {p.email_contacto && (
                              <div className="flex items-center gap-2 text-sm text-slate-600">
                                <span className="text-slate-400">@</span>{p.email_contacto}
                              </div>
                            )}
                            {p.direccion && (
                              <div className="flex items-center gap-2 text-sm text-slate-600">
                                <MapPin className="w-4 h-4 text-slate-400" />{p.direccion}
                              </div>
                            )}
                            {p.motivo_no_aprobado && (
                              <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                                <p className="text-xs font-bold text-red-600 mb-1">Motivo no aprobado:</p>
                                <p className="text-xs text-red-700">{p.motivo_no_aprobado}</p>
                              </div>
                            )}
                          </div>

                          {/* Acciones */}
                          {p.estado === 'en_gestion' && (
                            <div className="space-y-2">
                              <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Acciones</p>
                              <button
                                onClick={() => setEditando(p)}
                                className="w-full py-2.5 text-sm font-bold border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition"
                              >
                                Editar prospecto
                              </button>
                              {/* Solicitar TM solo si no tiene ninguna TM aún */}
                              {p.tomas_medidas.length === 0 && (
                                <button
                                  onClick={() => setSolicitandoTM(p)}
                                  className="w-full py-2.5 text-sm font-bold bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition flex items-center justify-center gap-2"
                                >
                                  <Ruler className="w-4 h-4" /> Solicitar visita técnica
                                </button>
                              )}
                              <button
                                onClick={() => setAprobando(p)}
                                className="w-full py-2.5 text-sm font-bold bg-green-600 text-white rounded-xl hover:bg-green-700 transition"
                              >
                                ✓ Aprobar — Generar ODP
                              </button>
                              <button
                                onClick={() => { setArchivandoId(p.id); setMotivoArchivo(''); }}
                                className="w-full py-2.5 text-sm font-bold bg-red-50 text-red-600 border border-red-200 rounded-xl hover:bg-red-100 transition"
                              >
                                ✕ No aprobado — Archivar
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Tomas de medidas del prospecto */}
                        {p.tomas_medidas.length > 0 && (
                          <div className="space-y-3 border-t border-slate-100 pt-4">
                            <p className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-2">
                              <Ruler className="w-3.5 h-3.5" /> Tomas de Medidas
                            </p>
                            {p.tomas_medidas.map(tmItem => (
                              <div key={tmItem.id} className={`rounded-xl border p-4 space-y-3 ${
                                tmItem.estado === 'realizada'
                                  ? 'bg-emerald-50 border-emerald-200'
                                  : tmItem.estado === 'programada'
                                  ? 'bg-blue-50 border-blue-200'
                                  : 'bg-amber-50 border-amber-200'
                              }`}>
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2">
                                    <span className="font-black text-sm text-slate-700">{tmItem.numero_tm}</span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                      tmItem.estado === 'realizada'
                                        ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                        : tmItem.estado === 'programada'
                                        ? 'bg-blue-100 text-blue-700 border-blue-200'
                                        : 'bg-amber-100 text-amber-700 border-amber-200'
                                    }`}>
                                      {tmItem.estado === 'realizada' ? '✓ Realizada'
                                        : tmItem.estado === 'programada' ? 'Programada'
                                        : 'Solicitada'}
                                    </span>
                                  </div>
                                  {tmItem.fecha_visita && (
                                    <span className="text-xs text-slate-500 flex items-center gap-1">
                                      <Calendar className="w-3 h-3" />
                                      {new Date(tmItem.fecha_visita + 'T00:00:00').toLocaleDateString('es-CO')}
                                    </span>
                                  )}
                                </div>

                                {(tmItem.direccion || tmItem.observaciones) && (
                                  <div className="text-xs text-slate-600 space-y-1">
                                    {tmItem.direccion && (
                                      <p className="flex items-center gap-1">
                                        <MapPin className="w-3 h-3 text-slate-400" />{tmItem.direccion}
                                      </p>
                                    )}
                                    {tmItem.observaciones && (
                                      <p className="text-slate-500 italic">{tmItem.observaciones}</p>
                                    )}
                                  </div>
                                )}

                                {/* Croquis / foto de medidas */}
                                {tmItem.croquis_url ? (
                                  <div>
                                    <p className="text-xs font-bold text-emerald-700 mb-2 flex items-center gap-1">
                                      <Image className="w-3 h-3" /> Foto de medidas relevadas
                                    </p>
                                    <img
                                      src={tmItem.croquis_url}
                                      alt={`Croquis ${tmItem.numero_tm}`}
                                      className="rounded-lg border border-emerald-200 max-h-52 object-contain w-full bg-white"
                                    />
                                  </div>
                                ) : tmItem.estado === 'solicitada' ? (
                                  <p className="text-xs text-amber-600 italic">Pendiente de programar por jefe de producción</p>
                                ) : (
                                  <p className="text-xs text-blue-600 italic">Visita programada — pendiente de realizar</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal crear/editar */}
      {(modalCrear || editando) && (
        <ProspectoModal
          prospecto={editando}
          onClose={() => { setModalCrear(false); setEditando(null); }}
          onSaved={() => { setModalCrear(false); setEditando(null); fetchProspectos(); }}
        />
      )}

      {/* Modal aprobar → generar ODP */}
      {aprobando && (
        <AprobarProspectoModal
          prospecto={aprobando}
          onClose={() => setAprobando(null)}
          onAprobado={() => { setAprobando(null); fetchProspectos(); }}
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
              <textarea
                value={motivoArchivo}
                onChange={e => setMotivoArchivo(e.target.value)}
                placeholder="Precio muy alto, no interesado, etc..."
                rows={3}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 mb-4"
              />
              <div className="flex gap-2">
                <button onClick={() => setArchivandoId(null)} className="flex-1 py-2.5 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition text-sm">
                  Cancelar
                </button>
                <button onClick={handleNoAprobar} className="flex-1 py-2.5 font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 transition text-sm">
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
