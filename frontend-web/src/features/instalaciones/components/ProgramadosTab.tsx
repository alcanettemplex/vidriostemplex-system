import React, { useMemo, useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult, DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import {
  AlertTriangle, Calendar, Check, GripVertical, LayoutGrid, LayoutList, Link2, Lock, MapPin, MessageCircle, Printer, RotateCcw, Star, Users,
} from '../../../components/ui/icons';
import { hoyBogotaISO } from '../../../utils/fechas';
import RutaCard, { RutaCardProps } from './RutaCard';
import InformeRutasModal from './InformeRutasModal';
import { TONO_CLS, estadoPago, fechaRuta, fmtDiaCorto, relativoDia } from '../utils/estadoInstalacion';
import { imprimirHojaRuta } from '../utils/hojaRuta';
import { useAvisoSinGuardar } from '../utils/useAvisoSinGuardar';

// Pestaña "Programados" de JefeView: rutas programadas y en curso.
// - Lista: tarjetas agrupadas por día (Vencidas, Hoy, Mañana, …).
// - Por equipo: para un día, una columna por oficial con todas sus paradas, la hoja de
//   ruta del equipo, el aviso de rutas repetidas con la acción de unirlas y el orden de
//   las paradas (arrastrar + "Aceptar orden").
// - Informe del día: texto para los grupos de WhatsApp (InformeRutasModal).

export type SubTabProg = 'programada' | 'en_curso';
type Vista = 'lista' | 'equipo';

const VISTA_KEY = 'instalaciones.programados.vista';
const leerVista = (): Vista => {
  try { return localStorage.getItem(VISTA_KEY) === 'equipo' ? 'equipo' : 'lista'; } catch { return 'lista'; }
};
const guardarVista = (v: Vista) => { try { localStorage.setItem(VISTA_KEY, v); } catch { /* sin almacenamiento */ } };

const nombreOficial = (r: any): string => r.oficial?.nombre_completo ?? 'Sin oficial';

/** Una ruta se puede unir a otra solo si aún no salió: programada y todas sus paradas pendientes. */
export const rutaUnible = (r: any): boolean =>
  r.estado === 'programada' && (r.ruta_odps ?? []).length > 0 && (r.ruta_odps ?? []).every((ro: any) => ro.estado === 'pendiente');

interface Props {
  rutasFiltradas: { programada: any[]; en_curso: any[] };
  subTab: SubTabProg;
  onSubTab: (s: SubTabProg) => void;
  loading: boolean;
  hayBusqueda: boolean;
  cardProps: Omit<RutaCardProps, 'ruta'>;
  onUnir: (destino: any, origenes: any[]) => void;
  /** Guarda el orden del día de un equipo; resuelve `true` si quedó guardado. */
  onOrdenarDia: (fecha: string, paradas: number[]) => Promise<boolean>;
}

const Spinner = () => (
  <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600" /></div>
);

const ProgramadosTab: React.FC<Props> = ({ rutasFiltradas, subTab, onSubTab, loading, hayBusqueda, cardProps, onUnir, onOrdenarDia }) => {
  const [vista, setVista] = useState<Vista>(leerVista);
  const cambiarVista = (v: Vista) => { setVista(v); guardarVista(v); };
  const [verInforme, setVerInforme] = useState(false);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        {vista === 'lista' && (
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
            {([
              { key: 'programada', label: 'Programada', count: rutasFiltradas.programada.length, cls: 'text-blue-700 bg-white' },
              { key: 'en_curso',   label: 'En curso',   count: rutasFiltradas.en_curso.length,   cls: 'text-amber-700 bg-white' },
            ] as const).map((st) => (
              <button
                key={st.key}
                onClick={() => onSubTab(st.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${subTab === st.key ? `${st.cls} shadow-sm` : 'text-slate-700 hover:text-slate-900'}`}
              >
                {st.label}
                <span className={`px-1.5 py-0.5 rounded-full text-xs font-semibold ${subTab === st.key ? 'bg-slate-100' : 'bg-slate-200 text-slate-700'}`}>{st.count}</span>
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setVerInforme(true)}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/20 transition-all"
        >
          <MessageCircle className="w-4 h-4" /> Informe del día
        </button>
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1" role="group" aria-label="Vista">
          {([
            { key: 'lista', label: 'Lista', icon: LayoutList },
            { key: 'equipo', label: 'Por equipo', icon: LayoutGrid },
          ] as const).map((v) => (
            <button
              key={v.key}
              onClick={() => cambiarVista(v.key)}
              aria-pressed={vista === v.key}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${vista === v.key ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-700 hover:text-slate-900'}`}
            >
              <v.icon className="w-4 h-4" /> {v.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? <Spinner /> : vista === 'lista' ? (
        <VistaLista rutas={rutasFiltradas[subTab]} subTab={subTab} hayBusqueda={hayBusqueda} cardProps={cardProps} />
      ) : (
        <VistaEquipo
          rutas={[...rutasFiltradas.programada, ...rutasFiltradas.en_curso]}
          hayBusqueda={hayBusqueda}
          readOnly={cardProps.readOnly}
          onVerODP={cardProps.onVerODP}
          onUnir={onUnir}
          onOrdenarDia={onOrdenarDia}
        />
      )}

      {verInforme && <InformeRutasModal onClose={() => setVerInforme(false)} />}
    </div>
  );
};

// ─── Lista agrupada por día ───────────────────────────────────────────────────

const VistaLista: React.FC<{ rutas: any[]; subTab: SubTabProg; hayBusqueda: boolean; cardProps: Omit<RutaCardProps, 'ruta'> }> = ({ rutas, subTab, hayBusqueda, cardProps }) => {
  const grupos = useMemo(() => {
    const hoy = hoyBogotaISO();
    const orden = [...rutas].sort((a, b) =>
      (fechaRuta(a) ?? '9999').localeCompare(fechaRuta(b) ?? '9999')
      || nombreOficial(a).localeCompare(nombreOficial(b))
      || a.id - b.id);
    const mapa = new Map<string, { titulo: string; vencido: boolean; rutas: any[] }>();
    for (const r of orden) {
      const f = fechaRuta(r);
      const vencido = !!f && f < hoy;
      const clave = vencido ? 'vencidas' : (f ?? 'sin-fecha');
      if (!mapa.has(clave)) {
        const rel = relativoDia(f);
        const titulo = vencido ? 'Vencidas' : !f ? 'Sin fecha' : rel.dias === 0 || rel.dias === 1 ? `${rel.texto} · ${fmtDiaCorto(f)}` : fmtDiaCorto(f);
        mapa.set(clave, { titulo, vencido, rutas: [] });
      }
      mapa.get(clave)!.rutas.push(r);
    }
    return Array.from(mapa.values());
  }, [rutas]);

  if (!rutas.length) {
    return (
      <div className="py-10 text-center text-slate-700 text-sm">
        {hayBusqueda ? 'Sin resultados para la búsqueda.' : `No hay rutas ${subTab === 'programada' ? 'programadas' : 'en curso'}.`}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {grupos.map((g) => (
        <section key={g.titulo} className="space-y-2.5">
          <h3 className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${g.vencido ? 'text-red-700' : 'text-slate-800'}`}>
            {g.vencido ? <AlertTriangle className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
            <span className="capitalize">{g.titulo}</span>
            <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 normal-case">{g.rutas.length}</span>
          </h3>
          {g.vencido && (
            <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              La fecha de estas rutas ya pasó y siguen con paradas sin atender. Edítalas para cambiar la fecha o cancélalas;
              sus ODPs también aparecen en "Pendientes de cierre".
            </p>
          )}
          {g.rutas.map((r) => <RutaCard key={r.id} ruta={r} {...cardProps} />)}
        </section>
      ))}
    </div>
  );
};

// ─── Por equipo ───────────────────────────────────────────────────────────────
// El orden de la columna es el que ven el instalador y el conductor: `ruta_odp.orden` es la
// posición de la parada en el día del equipo, aunque las paradas sean de rutas distintas
// (POST /api/rutas/ordenar-dia). Las paradas que ya no están pendientes quedan fijas arriba;
// las pendientes se arrastran y el orden se guarda solo al pulsar "Aceptar orden".

interface Parada { ruta: any; ro: any }

interface Columna {
  clave: string;
  oficial: string;
  rutas: any[];
  fijas: Parada[];
  pendientes: Parada[];
  equipo: string[];
}

const porOrden = (a: Parada, b: Parada) =>
  (a.ro.orden ?? 0) - (b.ro.orden ?? 0) || a.ruta.id - b.ruta.id || a.ro.id - b.ro.id;

interface VistaEquipoProps {
  rutas: any[];
  hayBusqueda: boolean;
  readOnly: boolean;
  onVerODP?: (id: number) => void;
  onUnir: (destino: any, origenes: any[]) => void;
  onOrdenarDia: (fecha: string, paradas: number[]) => Promise<boolean>;
}

const VistaEquipo: React.FC<VistaEquipoProps> = ({ rutas, hayBusqueda, readOnly, onVerODP, onUnir, onOrdenarDia }) => {
  const hoy = hoyBogotaISO();
  const fechas = useMemo(
    () => Array.from(new Set(rutas.map((r) => fechaRuta(r)).filter((f): f is string => !!f))).sort(),
    [rutas]
  );
  const porDefecto = fechas.includes(hoy) ? hoy : (fechas.find((f) => f > hoy) ?? fechas[fechas.length - 1] ?? hoy);
  const [elegida, setElegida] = useState<string | null>(null);
  const fecha = elegida && fechas.includes(elegida) ? elegida : porDefecto;

  // Orden sin aceptar, por `${fecha}|${columna}`: ids de ruta_odp pendientes en el orden nuevo.
  const [borradores, setBorradores] = useState<Record<string, number[]>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const sucio = Object.keys(borradores).length > 0;
  // Con búsqueda activa la columna puede traer solo parte de las rutas del equipo, y el
  // backend exige el día completo de cada ruta: se ordena sin filtro.
  const puedeOrdenar = !readOnly && !hayBusqueda;

  const columnas = useMemo<Columna[]>(() => {
    const mapa = new Map<string, Columna>();
    for (const r of rutas) {
      const paradasDia = (r.ruta_odps ?? []).filter((ro: any) => String(ro.fecha_programada).slice(0, 10) === fecha);
      if (!paradasDia.length) continue;
      const clave = r.oficial?.id ? `o${r.oficial.id}` : 'sin-oficial';
      if (!mapa.has(clave)) mapa.set(clave, { clave, oficial: nombreOficial(r), rutas: [], fijas: [], pendientes: [], equipo: [] });
      const col = mapa.get(clave)!;
      col.rutas.push(r);
      for (const ro of paradasDia) (ro.estado === 'pendiente' ? col.pendientes : col.fijas).push({ ruta: r, ro });
      for (const i of r.instaladores ?? []) {
        if (i.nombre_completo && i.nombre_completo !== col.oficial && !col.equipo.includes(i.nombre_completo)) col.equipo.push(i.nombre_completo);
      }
    }
    const lista = Array.from(mapa.values());
    for (const col of lista) {
      col.fijas.sort(porOrden);
      col.pendientes.sort(porOrden);
      const borrador = borradores[`${fecha}|${col.clave}`];
      if (borrador) {
        // Si una recarga trajo paradas nuevas mientras se ordenaba, van al final; las que
        // desaparecieron se descartan. El backend vuelve a validar todo al aceptar.
        const pos = new Map(borrador.map((id, i) => [id, i]));
        col.pendientes.sort((a, b) => (pos.get(a.ro.id) ?? Infinity) - (pos.get(b.ro.id) ?? Infinity) || porOrden(a, b));
      }
    }
    return lista.sort((a, b) =>
      (b.fijas.length + b.pendientes.length) - (a.fijas.length + a.pendientes.length) || a.oficial.localeCompare(b.oficial));
  }, [rutas, fecha, borradores]);

  useAvisoSinGuardar(sucio, 'Hay un orden de paradas sin aceptar. Si sales, se pierde. ¿Salir de todas formas?');

  const descartar = (llave: string) => setBorradores((prev) => {
    const resto = { ...prev };
    delete resto[llave];
    return resto;
  });

  const alSoltar = (res: DropResult) => {
    const { source, destination } = res;
    if (!destination || destination.droppableId !== source.droppableId || destination.index === source.index) return;
    const col = columnas.find((c) => c.clave === source.droppableId);
    if (!col) return;
    const ids = col.pendientes.map((p) => p.ro.id as number);
    const [movido] = ids.splice(source.index, 1);
    ids.splice(destination.index, 0, movido);
    const llave = `${fecha}|${col.clave}`;
    const original = [...col.pendientes].sort(porOrden).map((p) => p.ro.id as number);
    // Volver al orden guardado no deja nada pendiente de aceptar.
    if (ids.every((id, i) => id === original[i])) descartar(llave);
    else setBorradores((prev) => ({ ...prev, [llave]: ids }));
  };

  const aceptar = async (col: Columna) => {
    const llave = `${fecha}|${col.clave}`;
    setGuardando(llave);
    const ok = await onOrdenarDia(fecha, [...col.fijas, ...col.pendientes].map((p) => p.ro.id as number));
    setGuardando(null);
    if (ok) descartar(llave);
  };

  if (!rutas.length) {
    return <div className="py-10 text-center text-slate-700 text-sm">{hayBusqueda ? 'Sin resultados para la búsqueda.' : 'No hay rutas programadas.'}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 flex-wrap">
        {fechas.map((f) => {
          const rel = relativoDia(f);
          const activo = f === fecha;
          const conBorrador = Object.keys(borradores).some((k) => k.startsWith(`${f}|`));
          return (
            <button
              key={f}
              onClick={() => setElegida(f)}
              title={conBorrador ? 'Este día tiene un orden sin aceptar' : undefined}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all capitalize ${activo
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : rel.vencida ? 'border-red-200 text-red-700 hover:bg-red-50' : 'border-slate-200 text-slate-800 hover:bg-slate-50'}`}
            >
              {rel.dias === 0 || rel.dias === 1 ? `${rel.texto} · ` : ''}{fmtDiaCorto(f)}{conBorrador ? ' •' : ''}
            </button>
          );
        })}
        {!readOnly && hayBusqueda && (
          <span className="ml-2 text-xs text-slate-700">Borra la búsqueda para ordenar las paradas.</span>
        )}
      </div>

      {columnas.length === 0 ? (
        <div className="py-10 text-center text-slate-700 text-sm">No hay paradas para este día.</div>
      ) : (
        <DragDropContext onDragEnd={alSoltar}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 items-start">
            {columnas.map((col) => {
              // Rutas repetidas del mismo equipo en el día: la destino es la que ya salió (en
              // curso) o, si ninguna salió, la más antigua; las demás se le pueden unir.
              const destino = col.rutas.find((r: any) => r.estado === 'en_curso') ?? [...col.rutas].sort((a, b) => a.id - b.id)[0];
              const origenes = col.rutas.filter((r) => r.id !== destino.id && rutaUnible(r));
              const llave = `${fecha}|${col.clave}`;
              const editado = !!borradores[llave];
              const total = col.fijas.length + col.pendientes.length;
              const arrastrable = puedeOrdenar && col.pendientes.length > 1;
              return (
                <div key={col.clave} className={`bg-white rounded-2xl border shadow-card flex flex-col ${editado ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-200'}`}>
                  <div className="p-3 border-b border-slate-100 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-indigo-700" weight="fill" />
                      <span className="text-sm font-bold text-slate-900 truncate">{col.oficial}</span>
                      <span className="ml-auto text-[11px] font-semibold text-slate-700">
                        {total} parada{total === 1 ? '' : 's'} · {col.rutas.length} ruta{col.rutas.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    {col.equipo.length > 0 && (
                      <p className="text-xs text-slate-800 flex items-center gap-1"><Users className="w-3.5 h-3.5 text-slate-600" />{col.equipo.join(', ')}</p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => imprimirHojaRuta(col.rutas, fecha)}
                        disabled={editado}
                        title={editado ? 'Acepta o descarta el orden antes de imprimir' : undefined}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-slate-200 text-slate-800 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Printer className="w-3.5 h-3.5" /> Hoja de ruta
                      </button>
                      {!readOnly && !editado && origenes.length > 0 && (
                        <button
                          onClick={() => onUnir(destino, origenes)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100"
                          title={`Mover las paradas de ${origenes.map((o) => `#${o.id}`).join(', ')} a la ruta #${destino.id}`}
                        >
                          <Link2 className="w-3.5 h-3.5" /> Unir en una ruta
                        </button>
                      )}
                    </div>
                    {col.rutas.length > 1 && (
                      <p className="text-[11px] text-amber-800 flex items-start gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Este equipo tiene {col.rutas.length} rutas este día ({col.rutas.map((r) => `#${r.id}`).join(', ')}).
                        {origenes.length === 0 && ' Ya salieron: no se pueden unir.'}
                      </p>
                    )}
                    {editado && (
                      <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1.5">
                        <span className="text-xs font-semibold text-indigo-900 mr-auto">Orden sin aceptar</span>
                        <button
                          onClick={() => descartar(llave)}
                          disabled={guardando === llave}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold text-slate-800 hover:bg-white disabled:opacity-50"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Descartar
                        </button>
                        <button
                          onClick={() => aceptar(col)}
                          disabled={guardando === llave}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60"
                        >
                          <Check className="w-3.5 h-3.5" /> {guardando === llave ? 'Guardando…' : 'Aceptar orden'}
                        </button>
                      </div>
                    )}
                  </div>
                  {col.fijas.length > 0 && (
                    <ol className="divide-y divide-slate-100">
                      {col.fijas.map((p, i) => (
                        <li key={p.ro.id}>
                          <FilaParada parada={p} numero={i + 1} variasRutas={col.rutas.length > 1} onVerODP={onVerODP} fija={puedeOrdenar} />
                        </li>
                      ))}
                    </ol>
                  )}
                  <Droppable droppableId={col.clave} isDropDisabled={!arrastrable}>
                    {(prov) => (
                      <ol
                        ref={prov.innerRef}
                        {...prov.droppableProps}
                        className={`divide-y divide-slate-100 ${col.fijas.length && col.pendientes.length ? 'border-t border-slate-100' : ''}`}
                      >
                        {col.pendientes.map((p, i) => (
                          <Draggable key={p.ro.id} draggableId={`parada:${p.ro.id}`} index={i} isDragDisabled={!arrastrable}>
                            {(dprov, snap) => (
                              <li
                                ref={dprov.innerRef}
                                {...dprov.draggableProps}
                                className={snap.isDragging ? 'bg-white rounded-xl shadow-lg ring-2 ring-indigo-200' : 'bg-white'}
                              >
                                <FilaParada
                                  parada={p}
                                  numero={col.fijas.length + i + 1}
                                  variasRutas={col.rutas.length > 1}
                                  onVerODP={onVerODP}
                                  asa={arrastrable ? dprov.dragHandleProps : null}
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
            })}
          </div>
        </DragDropContext>
      )}
    </div>
  );
};

// Una parada de la columna. `asa` = props del asa de arrastre (solo pendientes ordenables);
// `fija` = parada que ya arrancó, marcada con candado cuando la columna se puede ordenar.
const FilaParada: React.FC<{
  parada: Parada;
  numero: number;
  variasRutas: boolean;
  onVerODP?: (id: number) => void;
  asa?: DraggableProvidedDragHandleProps | null;
  fija?: boolean;
}> = ({ parada: { ruta, ro }, numero, variasRutas, onVerODP, asa, fija }) => {
  const odp = ro.odp ?? {};
  const pago = estadoPago(odp);
  return (
    <div className="px-3 py-2.5 flex gap-2.5">
      {asa && (
        <span {...asa} className="text-slate-500 hover:text-slate-800 cursor-grab active:cursor-grabbing shrink-0 mt-0.5" title="Arrastra para cambiar el orden">
          <GripVertical className="w-4 h-4" />
        </span>
      )}
      <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-900 text-[11px] flex items-center justify-center font-bold shrink-0 mt-0.5">{numero}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={() => odp.id && onVerODP?.(odp.id)} className="text-sm font-bold text-slate-900 hover:text-indigo-700 hover:underline">
            {odp.numero_odp}
          </button>
          {variasRutas && <span className="text-[11px] text-slate-600">Ruta #{ruta.id}</span>}
          {fija && <span title="Ya arrancó: no se puede mover"><Lock className="w-3 h-3 text-slate-600" /></span>}
        </div>
        <p className="text-xs text-slate-900 truncate">{odp.cliente?.nombre_razon_social}</p>
        {odp.direccion_instalacion && (
          <p className="text-[11px] text-slate-700 truncate flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0 text-rose-500" />{odp.direccion_instalacion}</p>
        )}
        <div className="flex gap-1 mt-1 flex-wrap">
          <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${TONO_CLS[pago.tono]}`}>{pago.label}</span>
          {ro.estado !== 'pendiente' && (
            <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 capitalize">{String(ro.estado).replace('_', ' ')}</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProgramadosTab;
