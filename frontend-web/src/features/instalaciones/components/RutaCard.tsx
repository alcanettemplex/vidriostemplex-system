import React, { useState } from 'react';
import {
  Calendar, ChevronDown, ChevronUp, MapPin, PackageCheck, PauseCircle, Pencil, Phone,
  Printer, Star, Timer, Trash2, Truck, User, Users,
} from '../../../components/ui/icons';
import { fmtMomento } from '../../../utils/fechas';
import {
  TONO_CLS, estadoFactura, estadoPago, fechaRuta, rangoRuta, relativoDia, tipoServicio,
} from '../utils/estadoInstalacion';
import { imprimirHojaRuta } from '../utils/hojaRuta';

// Tarjeta de una ruta de instalación (pestañas Programados y Completados de JefeView).

const ESTADO_RUTA: Record<string, { label: string; cls: string }> = {
  programada: { label: 'Programada', cls: 'bg-blue-100 text-blue-800' },
  en_curso:   { label: 'En curso',   cls: 'bg-amber-100 text-amber-800' },
  completada: { label: 'Completada', cls: 'bg-emerald-100 text-emerald-800' },
  cancelada:  { label: 'Cancelada',  cls: 'bg-slate-100 text-slate-800' },
};

const ESTADO_PARADA: Record<string, { label: string; cls: string }> = {
  pendiente:  { label: 'Pendiente',  cls: 'bg-slate-100 text-slate-800' },
  en_curso:   { label: 'Instalando', cls: 'bg-amber-100 text-amber-800' },
  pausada:    { label: 'Pausada',    cls: 'bg-violet-100 text-violet-800' },
  completada: { label: 'Entregada',  cls: 'bg-emerald-100 text-emerald-800' },
  con_dano:   { label: 'Con daño',   cls: 'bg-orange-100 text-orange-800' },
};

type Etiqueta = { label: string; cls: string };

const NO_SE_HIZO = 'bg-rose-100 text-rose-800';

/**
 * Resultado REAL de una parada de una ruta ya cerrada (decisión del usuario, 2026-10-06):
 * "Pendiente" en una ruta completada no le decía nada al jefe. Combina el estado de la
 * parada, el de la ODP hoy y el de la ruta. En una ruta abierta se usa ESTADO_PARADA.
 */
const resultadoParada = (ro: any, ruta: any): Etiqueta => {
  const odp = ro.odp ?? {};
  switch (ro.estado) {
    case 'completada':
      return odp.instalacion
        ? { label: 'Instalada', cls: 'bg-emerald-100 text-emerald-800' }
        : { label: 'Entregada', cls: 'bg-emerald-100 text-emerald-800' };
    case 'con_dano':
      return ESTADO_PARADA.con_dano;
    default:
      // Antes que 'pausada': desde el 2026-10-07 cancelar la ruta deja sus paradas
      // pausadas, y "devuelta a bandeja" sería falso si la ODP ya se entregó.
      if (ruta.estado === 'cancelada') return { label: 'No se hizo · ruta cancelada', cls: 'bg-slate-100 text-slate-800' };
      if (ro.estado === 'pausada') return { label: 'No se hizo · devuelta a bandeja', cls: NO_SE_HIZO };
      // pendiente / en_curso en una ruta completada
      if (['PROGRAMADA', 'INSTALANDO', 'INSTALADA'].includes(odp.estado_produccion)) {
        return { label: 'No se hizo · en Pendientes de cierre', cls: NO_SE_HIZO };
      }
      if (odp.estado_produccion === 'ENTREGADA') return { label: 'No se hizo aquí · ODP ya entregada', cls: 'bg-slate-100 text-slate-800' };
      return { label: 'No se hizo · devuelta a bandeja', cls: NO_SE_HIZO };
  }
};

const duracion = (inicio: string | null, fin?: string | null): string | null => {
  if (!inicio) return null;
  const ms = (fin ? new Date(fin).getTime() : Date.now()) - new Date(inicio).getTime();
  if (ms < 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
};

const Chip: React.FC<{ cls: string; children: React.ReactNode }> = ({ cls, children }) => (
  <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${cls}`}>{children}</span>
);

export interface RutaCardProps {
  ruta: any;
  readOnly: boolean;
  historial?: boolean;
  onEditar?: (r: any) => void;
  onCancelar?: (id: number) => void;
  onFinalizar?: (rutaOdpId: number, numero: string) => void;
  onPausar?: (rutaOdpId: number, numero: string) => void;
  onVerODP?: (id: number) => void;
}

const RutaCard: React.FC<RutaCardProps> = ({ ruta, readOnly, historial = false, onEditar, onCancelar, onFinalizar, onPausar, onVerODP }) => {
  const [expandida, setExpandida] = useState(true);

  const paradas: any[] = ruta.ruta_odps ?? [];
  const total = paradas.length;
  const cerradas = paradas.filter((ro) => ro.estado === 'completada' || ro.estado === 'pausada').length;
  const pct = total > 0 ? Math.round((cerradas / total) * 100) : 0;

  const abierta = ruta.estado === 'programada' || ruta.estado === 'en_curso';
  // Ruta cerrada: "2 hechas · 1 sin hacer" en vez de "2 de 3 paradas cerradas", que con
  // la ruta ya completada se leía como una contradicción.
  const hechas = paradas.filter((ro) => ro.estado === 'completada').length;
  const conDano = paradas.filter((ro) => ro.estado === 'con_dano').length;
  const sinHacer = total - hechas - conDano;
  const pctBarra = abierta ? pct : (total > 0 ? Math.round((hechas / total) * 100) : 0);
  const fecha = fechaRuta(ruta);
  const rel = relativoDia(fecha);
  const quedanPendientes = paradas.some((ro) => ro.estado === 'pendiente');
  const vencida = abierta && rel.vencida && quedanPendientes;

  const tiempo = ruta.estado === 'en_curso'
    ? duracion(ruta.inicio_ruta)
    : ruta.estado === 'completada' ? duracion(ruta.inicio_ruta, ruta.fin_ruta) : null;

  const puedeEditar = !readOnly && !historial && abierta;
  const estado = ESTADO_RUTA[ruta.estado] ?? { label: ruta.estado, cls: 'bg-slate-100 text-slate-800' };
  const equipo = (ruta.instaladores ?? []).map((i: any) => i.nombre_completo).filter((n: string) => n !== ruta.oficial?.nombre_completo);

  return (
    <div className={`bg-white rounded-2xl border shadow-card overflow-hidden ${vencida ? 'border-red-300 ring-1 ring-red-200' : 'border-slate-200'}`}>
      <div className="p-4 space-y-2">
        {/* Fila 1: identidad + día + acciones */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-slate-900">Ruta #{ruta.id}</span>
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase ${estado.cls}`}>{estado.label}</span>
          {vencida && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-800">{rel.texto}</span>}
          <span className={`ml-auto flex items-center gap-1.5 text-sm font-semibold ${vencida ? 'text-red-700' : 'text-slate-900'}`}>
            <Calendar className="w-4 h-4" />
            {abierta && !vencida && fecha && <span className="text-indigo-700">{rel.texto} ·</span>}
            <span className="capitalize">{rangoRuta(ruta)}</span>
          </span>
          {!historial && abierta && (
            <button onClick={() => imprimirHojaRuta([ruta], null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600" title="Imprimir hoja de ruta">
              <Printer className="w-4 h-4" />
            </button>
          )}
          {puedeEditar && (
            <button onClick={() => onEditar?.(ruta)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-600" title="Editar ruta">
              <Pencil className="w-4 h-4" />
            </button>
          )}
          {puedeEditar && (
            <button onClick={() => onCancelar?.(ruta.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600" title="Cancelar ruta">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => setExpandida((v) => !v)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600" title={expandida ? 'Contraer' : 'Expandir'}>
            {expandida ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Fila 2: equipo. Sin conductor ni vehículo es normal: el equipo se desplaza por su cuenta. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-800">
          {ruta.oficial && (
            <span className="flex items-center gap-1 font-semibold text-indigo-800">
              <Star className="w-3.5 h-3.5" weight="fill" /> {ruta.oficial.nombre_completo}
            </span>
          )}
          {equipo.length > 0 && (
            <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5 text-slate-600" />{equipo.join(', ')}</span>
          )}
          {ruta.conductor && (
            <span className="flex items-center gap-1"><User className="w-3.5 h-3.5 text-slate-600" />Conductor: {ruta.conductor.nombre_completo}</span>
          )}
          {ruta.vehiculo && (
            <span className="flex items-center gap-1"><Truck className="w-3.5 h-3.5 text-slate-600" />{ruta.vehiculo.tipo} {ruta.vehiculo.placa}</span>
          )}
          {tiempo && (
            <span className="flex items-center gap-1 ml-auto font-semibold text-slate-700">
              <Timer className="w-3.5 h-3.5" />{ruta.estado === 'en_curso' ? `En ruta ${tiempo}` : `Duró ${tiempo}`}
            </span>
          )}
        </div>

        {/* Progreso: solo aporta con más de una parada */}
        {total > 1 && (
          <div>
            <div className="flex justify-between text-[11px] mb-1 text-slate-700">
              {abierta ? (
                <span>{cerradas} de {total} paradas cerradas</span>
              ) : (
                <span>
                  {hechas} hecha{hechas === 1 ? '' : 's'}
                  {sinHacer > 0 && <span className="font-semibold text-rose-700"> · {sinHacer} sin hacer</span>}
                  {conDano > 0 && <span className="font-semibold text-orange-700"> · {conDano} con daño</span>}
                </span>
              )}
              <span className="font-bold text-slate-900">{pctBarra}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${pctBarra === 100 ? 'bg-emerald-500' : 'bg-indigo-400'}`} style={{ width: `${pctBarra}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Paradas */}
      {expandida && (
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {paradas.map((ro) => {
            const odp = ro.odp ?? {};
            const pago = estadoPago(odp);
            const factura = estadoFactura(odp);
            const parada = abierta
              ? ESTADO_PARADA[ro.estado] ?? { label: ro.estado, cls: 'bg-slate-100 text-slate-800' }
              : resultadoParada(ro, ruta);
            const contacto = [odp.nombre_recibe, odp.telefono_recibe].filter(Boolean).join(' · ');
            // En una ruta cancelada la parada pausada no "volvió a su bandeja" por una pausa:
            // la etiqueta "ruta cancelada" ya lo dice todo.
            const devueltaPorPausa = ro.estado === 'pausada' && ruta.estado !== 'cancelada';
            return (
              <div key={ro.id} className={`flex items-start gap-3 px-4 py-3 ${devueltaPorPausa ? 'bg-violet-50/50' : ''}`}>
                <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-900 text-xs flex items-center justify-center font-bold flex-shrink-0 mt-0.5">
                  {ro.orden}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      className="text-sm font-bold text-slate-900 hover:text-indigo-700 hover:underline underline-offset-2"
                      onClick={() => odp.id && onVerODP?.(odp.id)}
                    >
                      {odp.numero_odp}
                    </button>
                    <span className="text-sm font-medium text-slate-900 truncate">{odp.cliente?.nombre_razon_social}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5 text-xs text-slate-700">
                    {odp.direccion_instalacion && (
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3 flex-shrink-0 text-rose-500" />{odp.direccion_instalacion}</span>
                    )}
                    {contacto && (
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3 flex-shrink-0 text-emerald-600" />Contacto: {contacto}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <Chip cls="bg-indigo-50 text-indigo-800">{tipoServicio(odp).label}</Chip>
                    <Chip cls={TONO_CLS[pago.tono]}>{pago.label}</Chip>
                    {factura && factura.tono !== 'ok' && <Chip cls={TONO_CLS[factura.tono]}>{factura.label}</Chip>}
                    <Chip cls={`${abierta ? 'uppercase ' : ''}${parada.cls}`}>{parada.label}</Chip>
                  </div>
                  {devueltaPorPausa && (
                    <p className="text-xs text-violet-800 mt-1 flex items-start gap-1">
                      <PauseCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                      <span>
                        {ro.motivo_pausa ? `«${ro.motivo_pausa}» · ` : ''}
                        Salió de esta ruta y volvió a su bandeja para programarse de nuevo.
                      </span>
                    </p>
                  )}
                  {ro.estado === 'con_dano' && ro.descripcion_dano && (
                    <p className="text-xs text-orange-800 mt-1">Daño: «{ro.descripcion_dano}»</p>
                  )}
                </div>

                {!readOnly && !historial && ro.estado === 'en_curso' && (
                  <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                    <button
                      onClick={() => onPausar?.(ro.id, odp.numero_odp)}
                      className="p-1.5 rounded-lg hover:bg-violet-50 text-violet-600"
                      title="Pausar instalación"
                    >
                      <PauseCircle className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onFinalizar?.(ro.id, odp.numero_odp)}
                      className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600"
                      title="Registrar entrega"
                    >
                      <PackageCheck className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {ruta.observaciones && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-100">
          <p className="text-xs text-amber-800 whitespace-pre-line">{ruta.observaciones}</p>
        </div>
      )}

      <div className="px-4 py-1.5 border-t border-slate-100 text-[11px] text-slate-600">
        Creada {fmtMomento(ruta.creado_en, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
        {ruta.creador?.nombre_completo ? ` por ${ruta.creador.nombre_completo}` : ''}
      </div>
    </div>
  );
};

export default RutaCard;
