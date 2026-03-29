import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Ruler, Clock, CalendarCheck, CheckCircle2, MapPin, User,
  RefreshCw, AlertTriangle, Phone, Package, FileText,
  UserPlus, X, Calendar
} from 'lucide-react';
import { toast } from 'react-toastify';
import TMModal from '../odp/components/TMModal';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface TMItem {
  id: number;
  numero_tm: string;
  estado: string;
  fecha_visita: string | null;
  fecha_creacion: string;
  direccion: string | null;
  nombre_contacto: string | null;
  telefono_contacto: string | null;
  contacto_obra: string | null;
  telefono_obra: string | null;
  observaciones: string | null;
  croquis_url: string | null;
  realizador: { id: number; nombre_completo: string } | null;
  odp: ODPInfo | null;
  prospecto: ProspectoInfo | null;
}

interface ODPInfo {
  id: number;
  numero_odp: string;
  fecha_entrega: string | null;
  fecha_creacion: string | null;
  direccion_instalacion: string | null;
  tipo_servicio: string | null;
  descripcion_pedido: string | null;
  observaciones: string | null;
  nombre_recibe: string | null;
  telefono_recibe: string | null;
  cliente: { nombre_razon_social: string } | null;
  asesor: { nombre_completo: string } | null;
}

interface ProspectoInfo {
  id: number;
  numero_prospecto: string;
  nombre_contacto: string | null;
  telefono_contacto: string | null;
  email_contacto: string | null;
  direccion: string | null;
  descripcion: string | null;
  estado: string;
  asesor: { nombre_completo: string } | null;
  cliente: { nombre_razon_social: string } | null;
}

// ODP en VISITA_TECNICA sin TM (estructura diferente — viene como ODP directa)
interface ODPSinTM {
  id: number;
  numero_odp: string;
  fecha_entrega: string | null;
  fecha_creacion: string | null;
  direccion_instalacion: string | null;
  tipo_servicio: string | null;
  descripcion_pedido: string | null;
  observaciones: string | null;
  nombre_recibe: string | null;
  telefono_recibe: string | null;
  cliente: { nombre_razon_social: string } | null;
  asesor: { nombre_completo: string } | null;
  tomas_medidas?: any[];
}

interface PanelData {
  solicitadas: TMItem[];
  odpsSinTM: ODPSinTM[];
  programadas: TMItem[];
  realizadas: TMItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const diasRestantes = (fecha: string | null): number | null => {
  if (!fecha) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const entrega = new Date(fecha);
  entrega.setHours(0, 0, 0, 0);
  return Math.ceil((entrega.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
};

const BadgeDias: React.FC<{ fecha: string | null }> = ({ fecha }) => {
  const dias = diasRestantes(fecha);
  if (dias === null) return null;
  if (dias < 0) return <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">{Math.abs(dias)}d vencida</span>;
  if (dias <= 2) return <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">{dias}d restantes</span>;
  if (dias <= 5) return <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{dias}d restantes</span>;
  return <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{dias}d restantes</span>;
};

// ─── Modal para programar fecha de visita ─────────────────────────────────────

const ProgramarModal: React.FC<{
  tm: TMItem;
  onClose: () => void;
  onProgramado: () => void;
}> = ({ tm, onClose, onProgramado }) => {
  const [fecha, setFecha] = useState('');
  const [loading, setLoading] = useState(false);
  const token = localStorage.getItem('token');

  const handleProgramar = async () => {
    if (!fecha) { toast.error('Selecciona una fecha'); return; }
    setLoading(true);
    try {
      await axios.patch(`${API}/api/documentos/tm/${tm.id}/programar`,
        { fecha_visita: fecha },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Visita programada');
      onProgramado();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al programar');
    } finally { setLoading(false); }
  };

  const contacto = tm.prospecto
    ? tm.prospecto.cliente?.nombre_razon_social || tm.prospecto.nombre_contacto || '—'
    : tm.odp?.cliente?.nombre_razon_social || '—';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 p-6"
      >
        <div className="flex justify-between items-center mb-5">
          <div>
            <h3 className="font-bold text-slate-800">Programar Visita</h3>
            <p className="text-xs text-slate-500 mt-0.5">{tm.numero_tm} · {contacto}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
          Fecha de visita <span className="text-red-400">*</span>
        </label>
        <input
          type="date"
          value={fecha}
          onChange={e => setFecha(e.target.value)}
          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 mb-5"
        />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition text-sm">
            Cancelar
          </button>
          <button onClick={handleProgramar} disabled={loading}
            className="flex-1 py-2.5 font-bold text-white bg-amber-500 rounded-xl hover:bg-amber-600 transition disabled:opacity-40 text-sm">
            {loading ? 'Guardando...' : 'Programar'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ─── Card TM (para solicitadas y programadas) ─────────────────────────────────

const CardTM: React.FC<{
  tm: TMItem;
  onProgramar?: (tm: TMItem) => void;
  onOpenTM?: (tm: TMItem) => void;
}> = ({ tm, onProgramar, onOpenTM }) => {
  const esProspecto = !!tm.prospecto;
  const contacto = esProspecto
    ? tm.prospecto!.cliente?.nombre_razon_social || tm.prospecto!.nombre_contacto || '—'
    : tm.odp?.cliente?.nombre_razon_social || '—';
  const asesor = esProspecto
    ? tm.prospecto!.asesor?.nombre_completo
    : tm.odp?.asesor?.nombre_completo;
  const direccion = tm.direccion || (esProspecto ? tm.prospecto!.direccion : tm.odp?.direccion_instalacion);
  const descripcion = esProspecto ? tm.prospecto!.descripcion : tm.odp?.descripcion_pedido;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white border border-slate-200 rounded-xl p-4 hover:border-amber-300 hover:shadow-sm transition-all"
    >
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-black text-amber-700 text-sm tracking-tight">{tm.numero_tm}</span>
            {esProspecto ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-violet-100 text-violet-700 border-violet-200">
                <UserPlus className="w-3 h-3" />{tm.prospecto!.numero_prospecto}
              </span>
            ) : tm.odp ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-100">
                {tm.odp.numero_odp}
              </span>
            ) : null}
            {tm.odp?.fecha_entrega && <BadgeDias fecha={tm.odp.fecha_entrega} />}
          </div>

          <p className="font-bold text-slate-800 text-sm truncate">{contacto}</p>

          {(tm.telefono_contacto || (esProspecto && tm.prospecto!.telefono_contacto) || tm.odp?.telefono_recibe) && (
            <p className="text-xs text-slate-600 flex items-center gap-1 mt-0.5">
              <Phone className="w-3 h-3 flex-shrink-0 text-slate-400" />
              <span className="font-semibold">
                {tm.telefono_contacto || (esProspecto ? tm.prospecto!.telefono_contacto : tm.odp?.telefono_recibe)}
              </span>
            </p>
          )}

          {asesor && (
            <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
              <User className="w-3 h-3 flex-shrink-0" />Asesor: <span className="font-semibold">{asesor}</span>
            </p>
          )}

          {tm.fecha_visita && (
            <p className="text-xs text-blue-700 flex items-center gap-1 mt-1 font-semibold">
              <Calendar className="w-3 h-3 flex-shrink-0" />
              Visita: {new Date(tm.fecha_visita + 'T00:00:00').toLocaleDateString('es-CO')}
            </p>
          )}

          {!tm.fecha_visita && (
            <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
              <Clock className="w-3 h-3 flex-shrink-0" />
              Solicitada: {new Date(tm.fecha_creacion).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
            </p>
          )}

          {direccion && (
            <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
              <MapPin className="w-3 h-3 flex-shrink-0 text-rose-400" />
              <span className="truncate">{direccion}</span>
            </p>
          )}

          {(tm.nombre_contacto || tm.telefono_contacto) && (
            <div className="mt-2 p-2 bg-blue-50 rounded-lg border border-blue-100 flex flex-wrap gap-x-4 gap-y-1">
              {tm.nombre_contacto && (
                <p className="text-xs text-blue-700 flex items-center gap-1">
                  <User className="w-3 h-3" /><span className="font-semibold">{tm.nombre_contacto}</span>
                </p>
              )}
              {tm.telefono_contacto && (
                <p className="text-xs text-blue-700 flex items-center gap-1">
                  <Phone className="w-3 h-3" /><span className="font-semibold">{tm.telefono_contacto}</span>
                </p>
              )}
            </div>
          )}

          {descripcion && (
            <p className="text-xs text-slate-500 flex items-start gap-1 mt-2">
              <Package className="w-3 h-3 flex-shrink-0 mt-0.5 text-slate-400" />
              <span className="line-clamp-2">{descripcion}</span>
            </p>
          )}

          {tm.observaciones && (
            <p className="text-xs text-amber-700 flex items-start gap-1 mt-1 bg-amber-50 p-1.5 rounded">
              <FileText className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <span className="line-clamp-2">{tm.observaciones}</span>
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5 flex-shrink-0 mt-1">
          {onProgramar && !tm.fecha_visita && (
            <button
              onClick={() => onProgramar(tm)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white text-xs font-bold rounded-lg hover:bg-blue-600 transition shadow-sm whitespace-nowrap"
            >
              <Calendar className="w-3.5 h-3.5" /> Programar
            </button>
          )}
          {onOpenTM && (
            <button
              onClick={() => onOpenTM(tm)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600 transition shadow-sm whitespace-nowrap"
            >
              <Ruler className="w-3.5 h-3.5" /> Abrir TM
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// ─── Card ODP sin TM ──────────────────────────────────────────────────────────

const CardODPSinTM: React.FC<{
  odp: ODPSinTM;
  onOpenTM: (odp: ODPSinTM) => void;
}> = ({ odp, onOpenTM }) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-white border border-slate-200 rounded-xl p-4 hover:border-orange-300 hover:shadow-sm transition-all"
  >
    <div className="flex justify-between items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-black text-amber-700 text-sm tracking-tight">{odp.numero_odp}</p>
          <BadgeDias fecha={odp.fecha_entrega} />
        </div>
        <p className="font-bold text-slate-800 text-sm truncate mt-0.5">{odp.cliente?.nombre_razon_social || '—'}</p>
        <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
          <User className="w-3 h-3 flex-shrink-0" />Asesor: <span className="font-semibold">{odp.asesor?.nombre_completo || '—'}</span>
        </p>
        {odp.fecha_creacion && (
          <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
            <Clock className="w-3 h-3 flex-shrink-0" />
            Solicitada: {new Date(odp.fecha_creacion).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
          </p>
        )}
        {odp.direccion_instalacion && (
          <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
            <MapPin className="w-3 h-3 flex-shrink-0 text-rose-400" />
            <span className="truncate">{odp.direccion_instalacion}</span>
          </p>
        )}
        {(odp.nombre_recibe || odp.telefono_recibe) && (
          <div className="mt-2 p-2 bg-blue-50 rounded-lg border border-blue-100 flex flex-wrap gap-x-4 gap-y-1">
            {odp.nombre_recibe && (
              <p className="text-xs text-blue-700 flex items-center gap-1">
                <User className="w-3 h-3" /><span className="font-semibold">{odp.nombre_recibe}</span>
              </p>
            )}
            {odp.telefono_recibe && (
              <p className="text-xs text-blue-700 flex items-center gap-1">
                <Phone className="w-3 h-3" /><span className="font-semibold">{odp.telefono_recibe}</span>
              </p>
            )}
          </div>
        )}
        {odp.descripcion_pedido && (
          <p className="text-xs text-slate-500 flex items-start gap-1 mt-2">
            <Package className="w-3 h-3 flex-shrink-0 mt-0.5 text-slate-400" />
            <span className="line-clamp-2">{odp.descripcion_pedido}</span>
          </p>
        )}
      </div>
      <div className="flex-shrink-0 mt-1">
        <button
          onClick={() => onOpenTM(odp)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600 transition shadow-sm whitespace-nowrap"
        >
          <Ruler className="w-3.5 h-3.5" /> Abrir TM
        </button>
      </div>
    </div>
  </motion.div>
);

// ─── Panel genérico ────────────────────────────────────────────────────────────

const Panel: React.FC<{
  titulo: string;
  icono: React.ReactNode;
  color: string;
  count: number;
  children: React.ReactNode;
  emptyMsg: string;
}> = ({ titulo, icono, color, count, children, emptyMsg }) => (
  <div className="flex flex-col gap-3">
    <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${color}`}>
      {icono}
      <span className="font-extrabold text-sm uppercase tracking-wider">{titulo}</span>
      <span className="ml-auto font-black text-lg">{count}</span>
    </div>
    <div className="space-y-2 max-h-[calc(100vh-260px)] overflow-y-auto pr-1">
      {count === 0 ? (
        <div className="text-center py-10 text-slate-400">
          <p className="text-sm font-medium">{emptyMsg}</p>
        </div>
      ) : children}
    </div>
  </div>
);

// ─── Page ─────────────────────────────────────────────────────────────────────

const TomaMedidasPage: React.FC = () => {
  const [data, setData] = useState<PanelData>({
    solicitadas: [], odpsSinTM: [], programadas: [], realizadas: [],
  });
  const [loading, setLoading] = useState(true);
  const [tmModal, setTmModal] = useState<any | null>(null); // ODP-shape para TMModal legacy
  const [programandoTM, setProgramandoTM] = useState<TMItem | null>(null);

  const token = localStorage.getItem('token');

  const fetchPanel = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/api/documentos/tm/panel`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(res.data);
    } catch {
      toast.error('Error al cargar el panel de tomas de medidas');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchPanel(); }, [fetchPanel]);

  const handleCloseTM = () => {
    setTmModal(null);
    fetchPanel();
  };

  // Adaptar TMItem a formato ODP para el TMModal (solo para TMs con ODP vinculada)
  const abrirTMModal = (source: TMItem | ODPSinTM) => {
    // Si es TMItem con ODP, adaptar
    if ('odp' in source && source.odp) {
      const odpShape = {
        ...source.odp,
        tomas_medidas: [source],
      };
      setTmModal(odpShape);
    } else if ('odp' in source && source.prospecto) {
      // TM de prospecto — usar datos del prospecto como ODP-shape mínimo
      const prosp = source.prospecto;
      setTmModal({
        id: null,
        numero_odp: prosp.numero_prospecto,
        cliente: prosp.cliente,
        asesor: prosp.asesor,
        direccion_instalacion: prosp.direccion,
        descripcion_pedido: prosp.descripcion,
        observaciones: null,
        nombre_recibe: prosp.nombre_contacto,
        telefono_recibe: prosp.telefono_contacto,
        fecha_entrega: null,
        tomas_medidas: [source],
        _prospecto_id: prosp.id,
      });
    } else {
      // Es ODPSinTM directa
      setTmModal(source);
    }
  };

  const totalSolicitadas = data.solicitadas.length + data.odpsSinTM.length;

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="space-y-3">
              <div className="h-12 bg-slate-100 rounded-xl animate-pulse" />
              {[1, 2, 3].map(j => <div key={j} className="h-28 bg-slate-100 rounded-xl animate-pulse" />)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
            <Ruler className="w-8 h-8 text-amber-500" />
            Toma de Medidas
          </h1>
          <p className="text-slate-500 font-medium mt-1">
            Gestión de visitas técnicas y relevamiento de medidas en campo
          </p>
        </div>
        <button
          onClick={fetchPanel}
          className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
        >
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      {/* Alerta urgente */}
      {data.odpsSinTM.some(o => {
        const d = diasRestantes(o.fecha_entrega);
        return d !== null && d <= 2;
      }) && (
        <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-bold">
            Hay visitas técnicas de ODPs con fecha de entrega en 2 días o menos. Priorizar.
          </p>
        </div>
      )}

      {/* 3 Paneles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* SOLICITADAS */}
        <Panel
          titulo="Solicitadas"
          icono={<Clock className="w-4 h-4 text-orange-600" />}
          color="bg-orange-50 border-orange-200 text-orange-700"
          count={totalSolicitadas}
          emptyMsg="No hay visitas técnicas pendientes"
        >
          {/* TMs de prospectos con estado 'solicitada' */}
          {data.solicitadas.map(tm => (
            <CardTM
              key={`tm-${tm.id}`}
              tm={tm}
              onProgramar={setProgramandoTM}
              onOpenTM={abrirTMModal}
            />
          ))}
          {/* ODPs en VISITA_TECNICA sin TM registrada */}
          {data.odpsSinTM.map(odp => (
            <CardODPSinTM
              key={`odp-${odp.id}`}
              odp={odp}
              onOpenTM={abrirTMModal}
            />
          ))}
        </Panel>

        {/* PROGRAMADAS */}
        <Panel
          titulo="Programadas"
          icono={<CalendarCheck className="w-4 h-4 text-blue-600" />}
          color="bg-blue-50 border-blue-200 text-blue-700"
          count={data.programadas.length}
          emptyMsg="No hay visitas programadas"
        >
          {data.programadas.map(tm => (
            <CardTM
              key={tm.id}
              tm={tm}
              onOpenTM={abrirTMModal}
            />
          ))}
        </Panel>

        {/* REALIZADAS */}
        <Panel
          titulo="Realizadas"
          icono={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
          color="bg-emerald-50 border-emerald-200 text-emerald-700"
          count={data.realizadas.length}
          emptyMsg="No hay tomas de medidas completadas"
        >
          {data.realizadas.map(tm => (
            <CardTM
              key={tm.id}
              tm={tm}
              onOpenTM={abrirTMModal}
            />
          ))}
        </Panel>
      </div>

      {/* Modal TMModal reutilizado (para ODPs) */}
      {tmModal && <TMModal odp={tmModal} onClose={handleCloseTM} />}

      {/* Modal programar fecha */}
      <AnimatePresence>
        {programandoTM && (
          <ProgramarModal
            tm={programandoTM}
            onClose={() => setProgramandoTM(null)}
            onProgramado={() => { setProgramandoTM(null); fetchPanel(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default TomaMedidasPage;
