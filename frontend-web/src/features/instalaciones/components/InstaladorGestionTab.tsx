import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  MapPin, Calendar, Truck, Users, PauseCircle, AlertTriangle,
  Plus, Pencil, Trash2, RefreshCw, UserCheck,
} from 'lucide-react';
import ProgramarRutaModal from './ProgramarRutaModal';
import ODPFichaModal from '../../odp/components/ODPFichaModal';

import API from '../../../services/config';

interface Personal { id: number; nombre_completo: string; rol: string; }

const ESTADO_ODP_LABEL: Record<string, string> = {
  pendiente:  'Pendiente',
  en_curso:   'En curso',
  pausada:    'Pausada',
  con_dano:   'Con daño',
};

const ESTADO_ODP_CLS: Record<string, string> = {
  pendiente:  'bg-slate-100 text-slate-600',
  en_curso:   'bg-amber-100 text-amber-700',
  pausada:    'bg-violet-100 text-violet-700',
  con_dano:   'bg-orange-100 text-orange-700',
};

const formatFecha = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ─── Tarjeta de ODP ──────────────────────────────────────────────────────────

const ODPCard: React.FC<{
  ro: any;
  onEditar: (ruta: any) => void;
  onCancelar: (rutaId: number) => void;
  onPausar: (rutaOdpId: number, numeroOdp: string) => void;
  onVerODP?: (id: number) => void;
}> = ({ ro, onEditar, onCancelar, onPausar, onVerODP }) => {
  const odp = ro.odp;
  const ruta = ro.ruta;
  const puedePausar = ro.estado === 'en_curso';
  const puedeEditar = ruta?.estado !== 'cancelada';
  const puedeCancelar = ruta?.estado === 'programada' || ruta?.estado === 'en_curso';
  const puedeAcciones = puedePausar || puedeEditar;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
      {/* Fila superior: ODP + estado + ruta */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="font-bold text-slate-800 text-sm hover:text-indigo-600 cursor-pointer hover:underline underline-offset-2"
          onClick={() => odp?.id && onVerODP?.(odp.id)}
        >
          {odp?.numero_odp}
        </span>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${ESTADO_ODP_CLS[ro.estado] ?? 'bg-slate-100 text-slate-500'}`}>
          {ESTADO_ODP_LABEL[ro.estado] ?? ro.estado}
        </span>
        <span className="text-[10px] text-slate-400 ml-auto">
          Ruta #{ruta?.id} · {ruta?.estado === 'programada' ? 'Programada' : ruta?.estado === 'en_curso' ? 'En curso' : ruta?.estado}
        </span>
      </div>

      {/* Cliente y dirección */}
      <div>
        <p className="text-sm text-slate-700 font-medium">{odp?.cliente?.nombre_razon_social}</p>
        {odp?.direccion_instalacion && (
          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            {odp.direccion_instalacion}
          </p>
        )}
      </div>

      {/* Metadata: fecha + vehículo */}
      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        {ro.fecha_programada && (
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {formatFecha(ro.fecha_programada)}
          </span>
        )}
        {ruta?.vehiculo && (
          <span className="flex items-center gap-1">
            <Truck className="w-3 h-3" />
            {ruta.vehiculo.tipo} — {ruta.vehiculo.placa}
          </span>
        )}
        {ruta?.instaladores?.length > 0 && (
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {ruta.instaladores.map((i: any) => i.nombre_completo).join(', ')}
          </span>
        )}
      </div>

      {/* Motivo pausa */}
      {ro.estado === 'pausada' && ro.motivo_pausa && (
        <p className="text-xs text-violet-600 flex items-start gap-1">
          <PauseCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
          {ro.motivo_pausa}
        </p>
      )}

      {/* Descripción daño */}
      {ro.estado === 'con_dano' && ro.descripcion_dano && (
        <p className="text-xs text-orange-600 flex items-start gap-1">
          <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
          {ro.descripcion_dano}
        </p>
      )}

      {/* Paradas totales en la ruta */}
      {ruta?.ruta_odps && (
        <p className="text-[10px] text-slate-400">
          Ruta #{ruta.id} tiene {ruta.ruta_odps?.length ?? 1} parada(s) — editar afecta a todas
        </p>
      )}

      {/* Acciones */}
      {puedeAcciones && (
        <div className="flex gap-2 pt-1 border-t border-slate-100 flex-wrap">
          {puedePausar && (
            <button
              onClick={() => onPausar(ro.id, odp?.numero_odp)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-violet-600 hover:bg-violet-50 border border-violet-200 transition-all"
            >
              <PauseCircle className="w-3.5 h-3.5" /> Pausar
            </button>
          )}
          {puedeEditar && (
            <button
              onClick={() => onEditar(ruta)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 border border-indigo-200 transition-all"
            >
              <Pencil className="w-3.5 h-3.5" /> Editar ruta
            </button>
          )}
          {puedeCancelar && (
            <button
              onClick={() => onCancelar(ruta?.id)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-50 border border-red-200 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" /> Cancelar ruta
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Sección agrupada ────────────────────────────────────────────────────────

const Seccion: React.FC<{
  titulo: string;
  color: string;
  items: any[];
  emptyMsg: string;
  children: (ro: any) => React.ReactNode;
}> = ({ titulo, color, items, emptyMsg, children }) => (
  <div className="space-y-3">
    <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest ${color}`}>
      <span>{titulo}</span>
      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-bold">{items.length}</span>
    </div>
    {items.length === 0
      ? <p className="text-xs text-slate-400 py-3 text-center">{emptyMsg}</p>
      : <div className="space-y-3">{items.map(ro => children(ro))}</div>
    }
  </div>
);

// ─── Componente principal ─────────────────────────────────────────────────────

const InstaladorGestionTab: React.FC = () => {
  const token = sessionStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const [instaladores, setInstaladores] = useState<Personal[]>([]);
  const [instaladorId, setInstaladorId] = useState<number | null>(null);
  const [asignacion, setAsignacion] = useState<any[]>([]);
  const [odpsListos, setOdpsListos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [rutaEditar, setRutaEditar] = useState<any>(null);
  const [instaladorParaRuta, setInstaladorParaRuta] = useState<number | null>(null);
  const [pauseModal, setPauseModal] = useState<{ rutaOdpId: number; numeroOdp: string } | null>(null);
  const [pauseMotivo, setPauseMotivo] = useState('');
  const [selectedOdpId, setSelectedOdpId] = useState<number | null>(null);

  // Carga lista de instaladores una sola vez
  useEffect(() => {
    axios.get(`${API}/api/rutas/personal`, { headers })
      .then(res => {
        const ins = res.data.filter((p: Personal) => p.rol === 'instalador');
        setInstaladores(ins);
        if (ins.length > 0) setInstaladorId(ins[0].id);
      })
      .catch(() => toast.error('Error al cargar instaladores'));
  }, []); // eslint-disable-line

  // Carga datos del instalador seleccionado
  const cargar = useCallback(async (id: number) => {
    setLoading(true);
    try {
      const [asigRes, gestionRes] = await Promise.all([
        axios.get(`${API}/api/rutas/instalador/${id}`, { headers }),
        axios.get(`${API}/api/rutas/odps-para-gestion`, { headers }),
      ]);
      setAsignacion(asigRes.data);
      setOdpsListos(gestionRes.data.listos ?? []);
    } catch {
      toast.error('Error al cargar datos del instalador');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    if (instaladorId) cargar(instaladorId);
  }, [instaladorId, cargar]);

  // Agrupar por estado
  const pendientes = asignacion.filter(ro => ro.estado === 'pendiente');
  const enCurso    = asignacion.filter(ro => ro.estado === 'en_curso');
  const pausadas   = asignacion.filter(ro => ro.estado === 'pausada');
  const conDano    = asignacion.filter(ro => ro.estado === 'con_dano');

  const handleEditar = async (ruta: any) => {
    try {
      const { data } = await axios.get(`${API}/api/rutas/${ruta.id}`, { headers });
      setRutaEditar(data);
      setInstaladorParaRuta(null);
      setShowModal(true);
    } catch {
      toast.error('No se pudo cargar el detalle de la ruta');
    }
  };

  const handleNuevaRuta = () => {
    setRutaEditar(null);
    setInstaladorParaRuta(instaladorId);
    setShowModal(true);
  };

  const handleCancelar = async (rutaId: number) => {
    if (!window.confirm('¿Cancelar esta ruta? Las ODPs pendientes volverán a "Listo para instalar".')) return;
    try {
      await axios.delete(`${API}/api/rutas/${rutaId}`, { headers });
      toast.success('Ruta cancelada');
      if (instaladorId) cargar(instaladorId);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al cancelar ruta');
    }
  };

  const handlePausar = (rutaOdpId: number, numeroOdp: string) => {
    setPauseMotivo('');
    setPauseModal({ rutaOdpId, numeroOdp });
  };

  const handleConfirmarPausa = async () => {
    if (!pauseModal) return;
    if (!pauseMotivo.trim()) { toast.error('Ingresa el motivo de la pausa'); return; }
    try {
      await axios.post(
        `${API}/api/rutas/ruta-odp/${pauseModal.rutaOdpId}/pausar`,
        { motivo_pausa: pauseMotivo.trim() },
        { headers }
      );
      toast.success(`Instalación de ${pauseModal.numeroOdp} pausada`);
      setPauseModal(null);
      if (instaladorId) cargar(instaladorId);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al pausar');
    }
  };

  const cardProps = {
    onEditar: handleEditar,
    onCancelar: handleCancelar,
    onPausar: handlePausar,
    onVerODP: setSelectedOdpId,
  };

  if (instaladores.length === 0) {
    return (
      <div className="py-16 text-center text-slate-400 text-sm">
        No hay instaladores registrados en el sistema.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      {/* Sub-tabs: uno por instalador */}
      <div className="flex flex-wrap gap-2">
        {instaladores.map(ins => {
          const activo = instaladorId === ins.id;
          return (
            <button
              key={ins.id}
              onClick={() => setInstaladorId(ins.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-all ${
                activo
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              {ins.nombre_completo}
              {activo && asignacion.length > 0 && (
                <span className="px-1.5 py-0.5 bg-white/20 rounded-full text-xs font-bold">
                  {asignacion.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Acciones del instalador seleccionado */}
      {instaladorId && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">
            {instaladores.find(i => i.id === instaladorId)?.nombre_completo} — vista de carga actual
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => instaladorId && cargar(instaladorId)}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50"
              title="Recargar"
            >
              <RefreshCw className="w-4 h-4 text-slate-500" />
            </button>
            <button
              onClick={handleNuevaRuta}
              disabled={!odpsListos.length}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 shadow-sm"
            >
              <Plus className="w-4 h-4" /> Programar ruta
            </button>
          </div>
        </div>
      )}

      {/* Contenido */}
      {loading ? (
        <div className="flex justify-center py-14">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : (
        <div className="space-y-6">
          <Seccion titulo="En curso" color="text-amber-600" items={enCurso} emptyMsg="Ninguna instalación en curso">
            {ro => <ODPCard key={ro.id} ro={ro} {...cardProps} />}
          </Seccion>

          <Seccion titulo="Pendientes" color="text-slate-500" items={pendientes} emptyMsg="Sin ODPs pendientes">
            {ro => <ODPCard key={ro.id} ro={ro} {...cardProps} />}
          </Seccion>

          <Seccion titulo="Pausadas" color="text-violet-600" items={pausadas} emptyMsg="Sin instalaciones pausadas">
            {ro => <ODPCard key={ro.id} ro={ro} {...cardProps} />}
          </Seccion>

          <Seccion titulo="Con daño reportado" color="text-orange-600" items={conDano} emptyMsg="Sin daños reportados">
            {ro => <ODPCard key={ro.id} ro={ro} {...cardProps} />}
          </Seccion>

          {asignacion.length === 0 && (
            <div className="py-10 text-center text-slate-400 text-sm">
              Este instalador no tiene ODPs activas asignadas.
            </div>
          )}
        </div>
      )}

      {/* ODPFichaModal */}
      {selectedOdpId && (
        <ODPFichaModal
          odpId={selectedOdpId}
          onClose={() => setSelectedOdpId(null)}
        />
      )}

      {/* Modal programar / editar ruta */}
      {showModal && (
        <ProgramarRutaModal
          odpsDisponibles={odpsListos}
          rutaExistente={rutaEditar}
          instaladorPreseleccionado={instaladorParaRuta ?? undefined}
          onClose={() => { setShowModal(false); setRutaEditar(null); setInstaladorParaRuta(null); }}
          onSaved={() => {
            setShowModal(false);
            setRutaEditar(null);
            setInstaladorParaRuta(null);
            if (instaladorId) cargar(instaladorId);
          }}
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
                <p className="font-bold text-slate-800 text-sm">Pausar instalación</p>
                <p className="text-xs text-slate-400">{pauseModal.numeroOdp} — La ODP volverá a "Listo para instalar"</p>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Motivo *</label>
              <textarea
                rows={3}
                value={pauseMotivo}
                onChange={e => setPauseMotivo(e.target.value)}
                placeholder="Ej. El cliente no estaba en el sitio, faltó material..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPauseModal(null)} className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-semibold text-sm rounded-xl hover:bg-slate-200 transition">
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

export default InstaladorGestionTab;
