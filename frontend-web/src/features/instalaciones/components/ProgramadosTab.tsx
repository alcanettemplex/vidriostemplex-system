import React, { useMemo, useState } from 'react';
import {
  AlertTriangle, Calendar, LayoutGrid, LayoutList, Link2, MapPin, MessageCircle, Printer, Star, Users,
} from '../../../components/ui/icons';
import { hoyBogotaISO } from '../../../utils/fechas';
import RutaCard, { RutaCardProps } from './RutaCard';
import InformeRutasModal from './InformeRutasModal';
import { TONO_CLS, estadoPago, fechaRuta, fmtDiaCorto, relativoDia } from '../utils/estadoInstalacion';
import { imprimirHojaRuta } from '../utils/hojaRuta';

// Pestaña "Programados" de JefeView: rutas programadas y en curso.
// - Lista: tarjetas agrupadas por día (Vencidas, Hoy, Mañana, …).
// - Por equipo: para un día, una columna por oficial con todas sus paradas, la hoja de
//   ruta del equipo y el aviso de rutas repetidas con la acción de unirlas.
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
}

const Spinner = () => (
  <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600" /></div>
);

const ProgramadosTab: React.FC<Props> = ({ rutasFiltradas, subTab, onSubTab, loading, hayBusqueda, cardProps, onUnir }) => {
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
        <VistaEquipo rutas={[...rutasFiltradas.programada, ...rutasFiltradas.en_curso]} hayBusqueda={hayBusqueda} readOnly={cardProps.readOnly} onVerODP={cardProps.onVerODP} onUnir={onUnir} />
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

interface Columna {
  clave: string;
  oficial: string;
  rutas: any[];
  paradas: { ruta: any; ro: any }[];
  equipo: string[];
}

const VistaEquipo: React.FC<{ rutas: any[]; hayBusqueda: boolean; readOnly: boolean; onVerODP?: (id: number) => void; onUnir: (destino: any, origenes: any[]) => void }> = ({ rutas, hayBusqueda, readOnly, onVerODP, onUnir }) => {
  const hoy = hoyBogotaISO();
  const fechas = useMemo(
    () => Array.from(new Set(rutas.map((r) => fechaRuta(r)).filter((f): f is string => !!f))).sort(),
    [rutas]
  );
  const porDefecto = fechas.includes(hoy) ? hoy : (fechas.find((f) => f > hoy) ?? fechas[fechas.length - 1] ?? hoy);
  const [elegida, setElegida] = useState<string | null>(null);
  const fecha = elegida && fechas.includes(elegida) ? elegida : porDefecto;

  const columnas = useMemo<Columna[]>(() => {
    const mapa = new Map<string, Columna>();
    for (const r of rutas) {
      const paradasDia = (r.ruta_odps ?? []).filter((ro: any) => String(ro.fecha_programada).slice(0, 10) === fecha);
      if (!paradasDia.length) continue;
      const clave = r.oficial?.id ? `o${r.oficial.id}` : 'sin-oficial';
      if (!mapa.has(clave)) mapa.set(clave, { clave, oficial: nombreOficial(r), rutas: [], paradas: [], equipo: [] });
      const col = mapa.get(clave)!;
      col.rutas.push(r);
      paradasDia.sort((a: any, b: any) => a.orden - b.orden).forEach((ro: any) => col.paradas.push({ ruta: r, ro }));
      for (const i of r.instaladores ?? []) {
        if (i.nombre_completo && i.nombre_completo !== col.oficial && !col.equipo.includes(i.nombre_completo)) col.equipo.push(i.nombre_completo);
      }
    }
    return Array.from(mapa.values()).sort((a, b) => b.paradas.length - a.paradas.length || a.oficial.localeCompare(b.oficial));
  }, [rutas, fecha]);

  if (!rutas.length) {
    return <div className="py-10 text-center text-slate-700 text-sm">{hayBusqueda ? 'Sin resultados para la búsqueda.' : 'No hay rutas programadas.'}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 flex-wrap">
        {fechas.map((f) => {
          const rel = relativoDia(f);
          const activo = f === fecha;
          return (
            <button
              key={f}
              onClick={() => setElegida(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all capitalize ${activo
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : rel.vencida ? 'border-red-200 text-red-700 hover:bg-red-50' : 'border-slate-200 text-slate-800 hover:bg-slate-50'}`}
            >
              {rel.dias === 0 || rel.dias === 1 ? `${rel.texto} · ` : ''}{fmtDiaCorto(f)}
            </button>
          );
        })}
      </div>

      {columnas.length === 0 ? (
        <div className="py-10 text-center text-slate-700 text-sm">No hay paradas para este día.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {columnas.map((col) => {
            // Rutas repetidas del mismo equipo en el día: la destino es la que ya salió (en
            // curso) o, si ninguna salió, la más antigua; las demás se le pueden unir.
            const destino = col.rutas.find((r: any) => r.estado === 'en_curso') ?? [...col.rutas].sort((a, b) => a.id - b.id)[0];
            const origenes = col.rutas.filter((r) => r.id !== destino.id && rutaUnible(r));
            return (
              <div key={col.clave} className="bg-white rounded-2xl border border-slate-200 shadow-card flex flex-col">
                <div className="p-3 border-b border-slate-100 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-indigo-700" weight="fill" />
                    <span className="text-sm font-bold text-slate-900 truncate">{col.oficial}</span>
                    <span className="ml-auto text-[11px] font-semibold text-slate-700">
                      {col.paradas.length} parada{col.paradas.length === 1 ? '' : 's'} · {col.rutas.length} ruta{col.rutas.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  {col.equipo.length > 0 && (
                    <p className="text-xs text-slate-800 flex items-center gap-1"><Users className="w-3.5 h-3.5 text-slate-600" />{col.equipo.join(', ')}</p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => imprimirHojaRuta(col.rutas, fecha)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-slate-200 text-slate-800 hover:bg-slate-50"
                    >
                      <Printer className="w-3.5 h-3.5" /> Hoja de ruta
                    </button>
                    {!readOnly && origenes.length > 0 && (
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
                </div>
                <ol className="divide-y divide-slate-100">
                  {col.paradas.map(({ ruta, ro }, i) => {
                    const odp = ro.odp ?? {};
                    const pago = estadoPago(odp);
                    return (
                      <li key={ro.id} className="px-3 py-2.5 flex gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-900 text-[11px] flex items-center justify-center font-bold shrink-0 mt-0.5">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button onClick={() => odp.id && onVerODP?.(odp.id)} className="text-sm font-bold text-slate-900 hover:text-indigo-700 hover:underline">
                              {odp.numero_odp}
                            </button>
                            {col.rutas.length > 1 && <span className="text-[11px] text-slate-600">Ruta #{ruta.id}</span>}
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
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProgramadosTab;
