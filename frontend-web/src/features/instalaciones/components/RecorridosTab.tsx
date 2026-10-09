import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { motion, useReducedMotion } from 'framer-motion';
import { DragDropContext, Droppable, Draggable, DropResult, DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import {
  Check, ChevronLeft, ChevronRight, Factory, Flag, GripVertical, Lock, MapPin, RotateCcw, Truck,
} from '../../../components/ui/icons';
import API from '../../../services/config';
import { useDataChangedSocket } from '../../../store/useSocketNotifications';
import { fmtHora, hoyBogotaISO, sumarDiasISO } from '../../../utils/fechas';
import { compararRecorrido, fmtDiaCorto, relativoDia, tipoServicio } from '../utils/estadoInstalacion';
import { useAvisoSinGuardar } from '../utils/useAvisoSinGuardar';

// Pestaña "Recorridos" de JefeView: el día del CAMIÓN. Un conductor atiende varias rutas el
// mismo día e intercala sus paradas (instalador A → acarreo → instalador B); aquí el jefe ve
// ese recorrido como una carretera con el camión avanzando según las llegadas que registra
// el conductor, y lo ordena aparte del orden de los instaladores (`orden_conductor`).
// Fuente: GET /api/rutas/recorridos?fecha — solo rutas programadas o en curso, con conductor.
// Guardar: POST /api/rutas/ordenar-conductor. Se refresca solo con el socket `rutas`.

interface Parada { ruta: any; ro: any }

interface Recorrido {
  clave: string;
  conductorId: number;
  conductor: string;
  vehiculos: string[];
  rutas: any[];
  fijas: Parada[];
  movibles: Parada[];
}

const ESTADO_PARADA: Record<string, { label: string; cls: string }> = {
  pendiente: { label: 'Por instalar', cls: 'bg-slate-100 text-slate-800' },
  en_curso: { label: 'Instalando', cls: 'bg-amber-100 text-amber-800' },
  completada: { label: 'Instalada', cls: 'bg-emerald-100 text-emerald-800' },
  pausada: { label: 'Pausada', cls: 'bg-orange-100 text-orange-800' },
  con_dano: { label: 'Con daño', cls: 'bg-red-100 text-red-800' },
};

const hora = (v: string | null | undefined): string => fmtHora(v);

/** Mismo criterio que `movibleEnRecorrido` del backend (el endpoint ya trae solo rutas abiertas). */
const movible = ({ ro }: Parada): boolean =>
  !ro.llegada_conductor && (ro.estado === 'pendiente' || ro.estado === 'en_curso');

const porRecorrido = (a: Parada, b: Parada) => compararRecorrido(a.ro, b.ro);

// Las fijas: primero las visitadas, en el orden en que el camión llegó; luego las que se
// cerraron sin llegada registrada (pausadas), en el orden planeado.
const porVisita = (a: Parada, b: Parada) => {
  const la = a.ro.llegada_conductor;
  const lb = b.ro.llegada_conductor;
  if (la && lb) return String(la).localeCompare(String(lb));
  if (la || lb) return la ? -1 : 1;
  return porRecorrido(a, b);
};

interface Props {
  readOnly: boolean;
  onVerODP?: (id: number) => void;
}

const RecorridosTab: React.FC<Props> = ({ readOnly, onVerODP }) => {
  const [fecha, setFecha] = useState<string>(hoyBogotaISO);
  const [rutas, setRutas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [borradores, setBorradores] = useState<Record<string, number[]>>({});
  const [guardando, setGuardando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/rutas/recorridos`, { params: { fecha } });
      setRutas(Array.isArray(data?.rutas) ? data.rutas : []);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'No se pudieron cargar los recorridos del día.');
    } finally {
      setLoading(false);
    }
  }, [fecha]);

  useEffect(() => { setLoading(true); cargar(); }, [cargar]);
  useDataChangedSocket('rutas', cargar);

  const sucio = Object.keys(borradores).length > 0;
  useAvisoSinGuardar(sucio, 'Hay un recorrido sin aceptar. Si sales, se pierde. ¿Salir de todas formas?');

  const recorridos = useMemo<Recorrido[]>(() => {
    const mapa = new Map<string, Recorrido>();
    for (const r of rutas) {
      if (!r.conductor?.id) continue; // el backend ya las excluye
      const clave = `c${r.conductor.id}`;
      if (!mapa.has(clave)) {
        mapa.set(clave, {
          clave, conductorId: r.conductor.id, conductor: r.conductor.nombre_completo ?? `Conductor #${r.conductor.id}`,
          vehiculos: [], rutas: [], fijas: [], movibles: [],
        });
      }
      const rec = mapa.get(clave)!;
      rec.rutas.push(r);
      const v = r.vehiculo ? `${r.vehiculo.tipo ?? ''} ${r.vehiculo.placa ?? ''}`.trim() : '';
      if (v && !rec.vehiculos.includes(v)) rec.vehiculos.push(v);
      for (const ro of r.ruta_odps ?? []) {
        const p = { ruta: r, ro };
        (movible(p) ? rec.movibles : rec.fijas).push(p);
      }
    }
    const lista = Array.from(mapa.values());
    for (const rec of lista) {
      rec.fijas.sort(porVisita);
      rec.movibles.sort(porRecorrido);
      const borrador = borradores[`${fecha}|${rec.clave}`];
      if (borrador) {
        const pos = new Map(borrador.map((id, i) => [id, i]));
        rec.movibles.sort((a, b) => (pos.get(a.ro.id) ?? Infinity) - (pos.get(b.ro.id) ?? Infinity) || porRecorrido(a, b));
      }
    }
    return lista.sort((a, b) => a.conductor.localeCompare(b.conductor));
  }, [rutas, fecha, borradores]);

  const descartar = (llave: string) => setBorradores((prev) => {
    const resto = { ...prev };
    delete resto[llave];
    return resto;
  });

  const alSoltar = (res: DropResult) => {
    const { source, destination } = res;
    if (!destination || destination.droppableId !== source.droppableId || destination.index === source.index) return;
    const rec = recorridos.find((c) => c.clave === source.droppableId);
    if (!rec) return;
    const ids = rec.movibles.map((p) => p.ro.id as number);
    const [movido] = ids.splice(source.index, 1);
    ids.splice(destination.index, 0, movido);
    const llave = `${fecha}|${rec.clave}`;
    const original = [...rec.movibles].sort(porRecorrido).map((p) => p.ro.id as number);
    if (ids.every((id, i) => id === original[i])) descartar(llave);
    else setBorradores((prev) => ({ ...prev, [llave]: ids }));
  };

  const aceptar = async (rec: Recorrido) => {
    const llave = `${fecha}|${rec.clave}`;
    setGuardando(llave);
    try {
      await axios.post(`${API}/api/rutas/ordenar-conductor`, {
        fecha, conductor_id: rec.conductorId, paradas: [...rec.fijas, ...rec.movibles].map((p) => p.ro.id),
      });
      toast.success(`Recorrido de ${rec.conductor} guardado. Ya lo ve en su app.`);
      descartar(llave);
      cargar();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'No se pudo guardar el recorrido. Intenta de nuevo.');
      if (e.response?.status === 409) cargar();
    } finally {
      setGuardando(null);
    }
  };

  const rel = relativoDia(fecha);
  const cambiarDia = (dias: number) => setFecha((f) => sumarDiasISO(f, dias));

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          <button onClick={() => cambiarDia(-1)} className="p-1.5 rounded-lg hover:bg-white text-slate-800" aria-label="Día anterior"><ChevronLeft className="w-4 h-4" /></button>
          <span className="px-2 text-sm font-semibold text-slate-900 capitalize min-w-[150px] text-center">
            {rel.dias === 0 || rel.dias === 1 || rel.dias === -1 ? `${rel.texto} · ` : ''}{fmtDiaCorto(fecha)}
          </span>
          <button onClick={() => cambiarDia(1)} className="p-1.5 rounded-lg hover:bg-white text-slate-800" aria-label="Día siguiente"><ChevronRight className="w-4 h-4" /></button>
        </div>
        {fecha !== hoyBogotaISO() && (
          <button onClick={() => setFecha(hoyBogotaISO())} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-800 hover:bg-slate-50">Hoy</button>
        )}
        <p className="ml-auto text-xs text-slate-700 max-w-md">
          El camión avanza cuando el conductor marca "Llegué" en su app. Arrastra las paradas para decidir qué hace primero.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600" /></div>
      ) : recorridos.length === 0 ? (
        <div className="py-10 text-center text-slate-700 text-sm">No hay rutas programadas con conductor para este día.</div>
      ) : (
        <DragDropContext onDragEnd={alSoltar}>
          <div className="space-y-4">
            {recorridos.map((rec) => {
              const llave = `${fecha}|${rec.clave}`;
              return (
                <TarjetaRecorrido
                  key={rec.clave}
                  rec={rec}
                  editado={!!borradores[llave]}
                  guardando={guardando === llave}
                  puedeOrdenar={!readOnly && rec.movibles.length > 1}
                  onAceptar={() => aceptar(rec)}
                  onDescartar={() => descartar(llave)}
                  onVerODP={onVerODP}
                />
              );
            })}
          </div>
        </DragDropContext>
      )}
    </div>
  );
};

// ─── Tarjeta de un conductor ──────────────────────────────────────────────────

const TarjetaRecorrido: React.FC<{
  rec: Recorrido;
  editado: boolean;
  guardando: boolean;
  puedeOrdenar: boolean;
  onAceptar: () => void;
  onDescartar: () => void;
  onVerODP?: (id: number) => void;
}> = ({ rec, editado, guardando, puedeOrdenar, onAceptar, onDescartar, onVerODP }) => {
  const paradas = [...rec.fijas, ...rec.movibles];
  const visitadas = paradas.filter((p) => p.ro.llegada_conductor).length;
  const inicios = rec.rutas.map((r) => r.inicio_ruta).filter(Boolean).sort();
  const salio = inicios[0] ?? null;
  const ultimaLlegada = paradas.map((p) => p.ro.llegada_conductor).filter(Boolean).sort().pop() ?? null;
  const enCurso = rec.rutas.some((r) => r.estado === 'en_curso');
  const pct = paradas.length ? Math.round((visitadas / paradas.length) * 100) : 0;
  const estado = enCurso ? (visitadas < paradas.length ? 'En camino' : 'En la última parada') : 'Sin salir';
  const estadoCls = enCurso ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-800';

  return (
    <div className={`bg-white rounded-2xl border shadow-card ${editado ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-200'}`}>
      <div className="p-4 border-b border-slate-100 space-y-3">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
            <Truck weight="duotone" className="w-6 h-6 text-indigo-700" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">{rec.conductor}</p>
            <p className="text-xs text-slate-700">
              {rec.vehiculos.join(', ') || 'Sin vehículo'} · {rec.rutas.length} ruta{rec.rutas.length === 1 ? '' : 's'} ({rec.rutas.map((r) => `#${r.id}`).join(', ')})
            </p>
          </div>
          <span className={`ml-auto px-2 py-1 rounded-lg text-xs font-semibold ${estadoCls}`}>{estado}</span>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-800">
            <span className="font-semibold tabular-nums">{visitadas} de {paradas.length} paradas</span>
            <span className="tabular-nums">
              {salio ? `Salió ${hora(salio)}` : 'Aún no sale'}{ultimaLlegada ? ` · Última llegada ${hora(ultimaLlegada)}` : ''}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <motion.div className="h-full bg-emerald-500 rounded-full" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} />
          </div>
        </div>

        <Carretera paradas={paradas} visitadas={visitadas} enCurso={enCurso} />
        {editado && (
          <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
            <span className="text-xs font-semibold text-indigo-900 mr-auto">Recorrido sin aceptar: la carretera ya muestra el orden nuevo</span>
            <button onClick={onDescartar} disabled={guardando} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold text-slate-800 hover:bg-white disabled:opacity-50">
              <RotateCcw className="w-3.5 h-3.5" /> Descartar
            </button>
            <button onClick={onAceptar} disabled={guardando} className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60">
              <Check className="w-3.5 h-3.5" /> {guardando ? 'Guardando…' : 'Aceptar recorrido'}
            </button>
          </div>
        )}
      </div>

      {rec.fijas.length > 0 && (
        <ol className="divide-y divide-slate-100">
          {rec.fijas.map((p, i) => (
            <li key={p.ro.id}><FilaRecorrido parada={p} numero={i + 1} onVerODP={onVerODP} fija={puedeOrdenar || rec.movibles.length > 0} /></li>
          ))}
        </ol>
      )}
      <Droppable droppableId={rec.clave} isDropDisabled={!puedeOrdenar}>
        {(prov) => (
          <ol ref={prov.innerRef} {...prov.droppableProps} className={`divide-y divide-slate-100 ${rec.fijas.length && rec.movibles.length ? 'border-t border-slate-100' : ''}`}>
            {rec.movibles.map((p, i) => (
              <Draggable key={p.ro.id} draggableId={`recorrido:${p.ro.id}`} index={i} isDragDisabled={!puedeOrdenar}>
                {(dprov, snap) => (
                  <li ref={dprov.innerRef} {...dprov.draggableProps} className={snap.isDragging ? 'bg-white rounded-xl shadow-lg ring-2 ring-indigo-200' : 'bg-white'}>
                    <FilaRecorrido
                      parada={p}
                      numero={rec.fijas.length + i + 1}
                      onVerODP={onVerODP}
                      siguiente={i === 0}
                      asa={puedeOrdenar ? dprov.dragHandleProps : null}
                    />
                  </li>
                )}
              </Draggable>
            ))}
            {prov.placeholder}
          </ol>
        )}
      </Droppable>
    </div>
  );
};

// ─── Carretera con el camión ──────────────────────────────────────────────────
// Nodos: Planta (0), paradas (1..n), Fin (n+1). El camión se ubica en la Planta si no ha
// salido, a mitad de tramo hacia la próxima parada mientras va en camino y sobre la última
// parada si ya llegó a todas. Una ruta completada sale de esta pestaña (solo rutas abiertas).

const PASO = 132; // px entre nodos

const Carretera: React.FC<{ paradas: Parada[]; visitadas: number; enCurso: boolean }> = ({ paradas, visitadas, enCurso }) => {
  const reducir = useReducedMotion();
  const n = paradas.length;
  const posicion = !enCurso && visitadas === 0 ? 0 : visitadas < n ? visitadas + 0.5 : n;
  const enMovimiento = enCurso && visitadas < n;
  const ancho = (n + 1) * PASO;

  return (
    <div className="overflow-x-auto overflow-y-hidden -mx-1 px-1 pb-1">
      <div className="relative h-[134px]" style={{ width: ancho + 48, minWidth: '100%' }}>
        {/* Vía: gris punteada por recorrer, verde recorrida */}
        <div className="absolute top-[58px] h-1.5 rounded-full bg-[repeating-linear-gradient(90deg,#cbd5e1_0_10px,transparent_10px_18px)]" style={{ left: 24, width: ancho }} />
        <motion.div
          className="absolute top-[58px] h-1.5 rounded-full bg-emerald-500"
          style={{ left: 24 }}
          initial={false}
          animate={{ width: posicion * PASO }}
          transition={reducir ? { duration: 0 } : { type: 'spring', stiffness: 60, damping: 18 }}
        />

        <Nodo x={0} icono={<Factory className="w-4 h-4" />} etiqueta="Planta" activo />
        {paradas.map((p, i) => {
          const visitada = i < visitadas;
          const siguiente = i === visitadas;
          const tipo = tipoServicio(p.ro.odp);
          return (
            <Nodo
              key={p.ro.id}
              x={(i + 1) * PASO}
              numero={i + 1}
              visitada={visitada}
              siguiente={siguiente}
              pulso={siguiente && enMovimiento && !reducir}
              etiqueta={p.ro.odp?.numero_odp}
              detalle={`${tipo.corto}${p.ruta.oficial?.nombre_completo ? ` · ${p.ruta.oficial.nombre_completo.split(' ')[0]}` : ''}`}
              hora={visitada ? hora(p.ro.llegada_conductor) : ''}
            />
          );
        })}
        <Nodo x={(n + 1) * PASO} icono={<Flag className="w-4 h-4" />} etiqueta="Fin" />

        {/* Camión */}
        <motion.div
          className="absolute top-[8px] -ml-[18px] z-10"
          style={{ left: 24 }}
          initial={false}
          animate={{ x: posicion * PASO }}
          transition={reducir ? { duration: 0 } : { type: 'spring', stiffness: 60, damping: 18 }}
        >
          <motion.div
            animate={enMovimiento && !reducir ? { y: [0, -2, 0] } : { y: 0 }}
            transition={enMovimiento && !reducir ? { duration: 0.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
            className="w-9 h-9 rounded-xl flex items-center justify-center shadow-md bg-indigo-600"
            title={enMovimiento ? 'En camino a la próxima parada' : enCurso ? 'En la última parada' : 'En la planta, sin salir'}
          >
            <Truck weight="fill" className="w-5 h-5 text-white" />
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

const Nodo: React.FC<{
  x: number;
  numero?: number;
  icono?: React.ReactNode;
  etiqueta?: string;
  detalle?: string;
  hora?: string;
  visitada?: boolean;
  siguiente?: boolean;
  pulso?: boolean;
  activo?: boolean;
}> = ({ x, numero, icono, etiqueta, detalle, hora: h, visitada, siguiente, pulso, activo }) => {
  const cls = icono
    ? activo ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-300'
    : visitada ? 'bg-emerald-600 text-white border-emerald-600'
      : siguiente ? 'bg-white text-indigo-700 border-indigo-600'
        : 'bg-white text-slate-800 border-slate-300';
  return (
    <div className="absolute top-[48px] flex flex-col items-center w-[120px] -ml-[60px]" style={{ left: 24 + x }}>
      <div className="relative">
        {pulso && <span className="absolute inset-0 rounded-full bg-indigo-400 animate-ping opacity-40" />}
        <div className={`relative w-[26px] h-[26px] rounded-full border-2 flex items-center justify-center text-[11px] font-bold ${cls}`}>
          {icono ?? (visitada ? <Check className="w-3.5 h-3.5" /> : numero)}
        </div>
      </div>
      {etiqueta && <span className="mt-1 text-[11px] font-bold text-slate-900 truncate max-w-full">{etiqueta}</span>}
      {detalle && <span className="text-[11px] text-slate-700 truncate max-w-full">{detalle}</span>}
      {h && <span className="text-[11px] text-emerald-700 font-semibold tabular-nums">Llegó {h}</span>}
    </div>
  );
};

// ─── Fila de la lista ordenable ───────────────────────────────────────────────

const FilaRecorrido: React.FC<{
  parada: Parada;
  numero: number;
  onVerODP?: (id: number) => void;
  asa?: DraggableProvidedDragHandleProps | null;
  fija?: boolean;
  siguiente?: boolean;
}> = ({ parada: { ruta, ro }, numero, onVerODP, asa, fija, siguiente }) => {
  const odp = ro.odp ?? {};
  const tipo = tipoServicio(odp);
  const est = ESTADO_PARADA[ro.estado] ?? { label: ro.estado, cls: 'bg-slate-100 text-slate-800' };
  return (
    <div className={`px-4 py-2.5 flex gap-3 items-start ${siguiente ? 'bg-indigo-50/60' : ''}`}>
      {asa && (
        <span {...asa} className="text-slate-500 hover:text-slate-800 cursor-grab active:cursor-grabbing shrink-0 mt-0.5" title="Arrastra para cambiar el orden del recorrido">
          <GripVertical className="w-4 h-4" />
        </span>
      )}
      <span className={`w-6 h-6 rounded-full text-[11px] flex items-center justify-center font-bold shrink-0 ${ro.llegada_conductor ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-900'}`}>
        {numero}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={() => odp.id && onVerODP?.(odp.id)} className="text-sm font-bold text-slate-900 hover:text-indigo-700 hover:underline">{odp.numero_odp}</button>
          <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${odp.acarreo && !odp.instalacion ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'}`}>{tipo.corto}</span>
          <span className="text-[11px] text-slate-700">{ruta.oficial?.nombre_completo ?? 'Sin oficial'} · Ruta #{ruta.id}</span>
          {siguiente && <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-indigo-600 text-white">Siguiente</span>}
          {fija && !asa && <span title="Ya visitada o cerrada: no se mueve"><Lock className="w-3 h-3 text-slate-600" /></span>}
        </div>
        <p className="text-xs text-slate-900 truncate">{odp.cliente?.nombre_razon_social}</p>
        {odp.direccion_instalacion && (
          <p className="text-[11px] text-slate-700 truncate flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0 text-rose-500" />{odp.direccion_instalacion}</p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${est.cls}`}>{est.label}</span>
        {ro.llegada_conductor && <span className="text-[11px] text-emerald-700 font-semibold tabular-nums">Llegó {hora(ro.llegada_conductor)}</span>}
      </div>
    </div>
  );
};

export default RecorridosTab;
