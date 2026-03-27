import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Ruler, Clock, CalendarCheck, CheckCircle2, MapPin, User, RefreshCw, AlertTriangle, Phone, Package, FileText } from 'lucide-react';
import { toast } from 'react-toastify';
import TMModal from '../odp/components/TMModal';

interface ODPResumen {
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
  solicitadas: ODPResumen[];
  programadas: ODPResumen[];
  realizadas: ODPResumen[];
}

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
  if (dias === null) return <span className="text-xs text-slate-400">Sin fecha</span>;
  if (dias < 0) return <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">{Math.abs(dias)}d vencida</span>;
  if (dias <= 2) return <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">{dias}d restantes</span>;
  if (dias <= 5) return <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{dias}d restantes</span>;
  return <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{dias}d restantes</span>;
};

const CardODP: React.FC<{ odp: ODPResumen; onOpenTM: (odp: ODPResumen) => void }> = ({ odp, onOpenTM }) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-white border border-slate-200 rounded-xl p-4 hover:border-amber-300 hover:shadow-sm transition-all"
  >
    <div className="flex justify-between items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-black text-amber-700 text-base tracking-tight">{odp.numero_odp}</p>
          <BadgeDias fecha={odp.fecha_entrega} />
        </div>
        <p className="font-bold text-slate-800 text-sm truncate mt-0.5">{odp.cliente?.nombre_razon_social || '—'}</p>

        {/* Fecha de solicitud */}
        {odp.fecha_creacion && (
          <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
            <Clock className="w-3 h-3 flex-shrink-0" />
            Solicitada: {new Date(odp.fecha_creacion).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
          </p>
        )}

        {/* Asesor */}
        <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
          <User className="w-3 h-3 flex-shrink-0" />Asesor: <span className="font-semibold">{odp.asesor?.nombre_completo || '—'}</span>
        </p>

        {/* Dirección */}
        {odp.direccion_instalacion && (
          <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
            <MapPin className="w-3 h-3 flex-shrink-0 text-rose-400" />
            <span className="truncate">{odp.direccion_instalacion}</span>
          </p>
        )}

        {/* Contacto en terreno */}
        {(odp.nombre_recibe || odp.telefono_recibe) && (
          <div className="mt-2 p-2 bg-blue-50 rounded-lg border border-blue-100 flex flex-wrap gap-x-4 gap-y-1">
            {odp.nombre_recibe && (
              <p className="text-xs text-blue-700 flex items-center gap-1">
                <User className="w-3 h-3 flex-shrink-0" />
                <span className="font-semibold">{odp.nombre_recibe}</span>
              </p>
            )}
            {odp.telefono_recibe && (
              <p className="text-xs text-blue-700 flex items-center gap-1">
                <Phone className="w-3 h-3 flex-shrink-0" />
                <span className="font-semibold">{odp.telefono_recibe}</span>
              </p>
            )}
          </div>
        )}

        {/* Producto / descripción */}
        {odp.descripcion_pedido && (
          <p className="text-xs text-slate-500 flex items-start gap-1 mt-2">
            <Package className="w-3 h-3 flex-shrink-0 mt-0.5 text-slate-400" />
            <span className="line-clamp-2">{odp.descripcion_pedido}</span>
          </p>
        )}

        {/* Observaciones para la TM */}
        {odp.observaciones && (
          <p className="text-xs text-amber-700 flex items-start gap-1 mt-1 bg-amber-50 p-1.5 rounded">
            <FileText className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span className="line-clamp-2">{odp.observaciones}</span>
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
    {odp.tomas_medidas && odp.tomas_medidas.length > 0 && (
      <div className="mt-3 pt-3 border-t border-slate-100">
        {odp.tomas_medidas.map((tm: any) => (
          <p key={tm.id} className="text-xs text-slate-500">
            <span className="font-bold text-amber-700">{tm.numero_tm}</span>
            {tm.fecha_visita && ` · Visita: ${new Date(tm.fecha_visita + 'T00:00:00').toLocaleDateString('es-CO')}`}
            {tm.realizador && ` · Por ${tm.realizador.nombre_completo}`}
          </p>
        ))}
      </div>
    )}
  </motion.div>
);

const Panel: React.FC<{
  titulo: string;
  icono: React.ReactNode;
  color: string;
  items: ODPResumen[];
  emptyMsg: string;
  onOpenTM: (odp: ODPResumen) => void;
}> = ({ titulo, icono, color, items, emptyMsg, onOpenTM }) => (
  <div className="flex flex-col gap-3">
    <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${color}`}>
      {icono}
      <span className="font-extrabold text-sm uppercase tracking-wider">{titulo}</span>
      <span className="ml-auto font-black text-lg">{items.length}</span>
    </div>
    <div className="space-y-2 max-h-[calc(100vh-260px)] overflow-y-auto pr-1">
      {items.length === 0 ? (
        <div className="text-center py-10 text-slate-400">
          <p className="text-sm font-medium">{emptyMsg}</p>
        </div>
      ) : (
        items.map(odp => <CardODP key={odp.id} odp={odp} onOpenTM={onOpenTM} />)
      )}
    </div>
  </div>
);

const TomaMedidasPage: React.FC = () => {
  const [data, setData] = useState<PanelData>({ solicitadas: [], programadas: [], realizadas: [] });
  const [loading, setLoading] = useState(true);
  const [tmOdp, setTmOdp] = useState<any | null>(null);

  const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
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
  }, [API, token]);

  useEffect(() => { fetchPanel(); }, [fetchPanel]);

  const handleCloseTM = () => {
    setTmOdp(null);
    fetchPanel(); // Recargar panel al cerrar el modal
  };

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

      {/* Alerta si hay ODPs urgentes */}
      {data.solicitadas.some(o => {
        const d = diasRestantes(o.fecha_entrega);
        return d !== null && d <= 2;
      }) && (
        <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-bold">
            Hay visitas técnicas solicitadas con fecha de entrega en 2 días o menos. Priorizar.
          </p>
        </div>
      )}

      {/* 3 Paneles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Panel
          titulo="Solicitadas"
          icono={<Clock className="w-4 h-4 text-orange-600" />}
          color="bg-orange-50 border-orange-200 text-orange-700"
          items={data.solicitadas}
          emptyMsg="No hay visitas técnicas pendientes"
          onOpenTM={setTmOdp}
        />
        <Panel
          titulo="Programadas"
          icono={<CalendarCheck className="w-4 h-4 text-blue-600" />}
          color="bg-blue-50 border-blue-200 text-blue-700"
          items={data.programadas}
          emptyMsg="No hay visitas programadas"
          onOpenTM={setTmOdp}
        />
        <Panel
          titulo="Realizadas"
          icono={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
          color="bg-emerald-50 border-emerald-200 text-emerald-700"
          items={data.realizadas}
          emptyMsg="No hay tomas de medidas completadas"
          onOpenTM={setTmOdp}
        />
      </div>

      {/* Modal TM reutilizado */}
      {tmOdp && <TMModal odp={tmOdp} onClose={handleCloseTM} />}
    </div>
  );
};

export default TomaMedidasPage;
