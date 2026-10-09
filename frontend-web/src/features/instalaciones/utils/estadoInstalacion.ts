// Etiquetas de servicio, pago y factura de una ODP en Instalaciones, y fechas de una ruta.
//
// ESPEJO del backend (rutas.controller.ts): `estadoPago` replica PAGO_OK y `estadoFactura`
// replica FACTURA_OK, las condiciones con las que el servidor deja programar una ODP. Si
// cambian allá, cambiar aquí. Antes la tarjeta de ruta ignoraba `forma_pago = 'credito'`
// y mostraba "Pago pendiente" en ODPs a crédito ya programadas (ODP-24345, 2026-10-05).

import { diaISO, diferenciaDias, fmtDia, hoyBogotaISO } from '../../../utils/fechas';

/** Campos de la ODP que usan estas etiquetas (los trae INCLUDE_RUTA_LISTA y getODPsParaGestion). */
export interface ODPInstalacion {
  instalacion?: boolean | null;
  acarreo?: boolean | null;
  es_garantia?: boolean | null;
  es_no_conformidad?: boolean | null;
  estado_caja?: string | null;
  forma_pago?: string | null;
  autorizacion_especial_despacho?: boolean | null;
  estado_facturacion?: string | null;
}

export type Tono = 'ok' | 'info' | 'aviso' | 'neutro';

export interface Etiqueta {
  label: string;
  tono: Tono;
}

/** Clases de Tailwind por tono (colores con significado de estado: no son neutros). */
export const TONO_CLS: Record<Tono, string> = {
  ok: 'bg-emerald-100 text-emerald-800',
  info: 'bg-blue-100 text-blue-800',
  aviso: 'bg-amber-100 text-amber-800',
  neutro: 'bg-slate-100 text-slate-800',
};

export const tipoServicio = (odp?: ODPInstalacion | null): Etiqueta & { corto: string } => {
  if (odp?.instalacion && odp?.acarreo) return { label: 'Instalación + Acarreo', corto: 'Inst. + acarreo', tono: 'neutro' };
  if (odp?.instalacion) return { label: 'Instalación', corto: 'Instalación', tono: 'neutro' };
  if (odp?.acarreo) return { label: 'Acarreo', corto: 'Acarreo', tono: 'neutro' };
  return { label: 'Entrega en taller', corto: 'Entrega taller', tono: 'neutro' };
};

/** Pago para instalar. Mismo orden de prioridad que PAGO_OK en el backend. */
export const estadoPago = (odp?: ODPInstalacion | null): Etiqueta & { aprobado: boolean } => {
  if (odp?.es_garantia) return { label: 'Garantía', tono: 'info', aprobado: true };
  if (odp?.estado_caja === 'CANCELADO') return { label: 'Pagado', tono: 'ok', aprobado: true };
  if (odp?.estado_caja === 'CREDITO_APROBADO' || odp?.forma_pago === 'credito') return { label: 'Crédito', tono: 'info', aprobado: true };
  if (odp?.autorizacion_especial_despacho) return { label: 'Autorización especial', tono: 'info', aprobado: true };
  if (odp?.estado_caja === 'ABONADO') return { label: 'Abonado', tono: 'aviso', aprobado: false };
  return { label: 'Pago pendiente', tono: 'aviso', aprobado: false };
};

/**
 * Factura electrónica para instalar. Mismo criterio que FACTURA_OK. `null` cuando la
 * etiqueta no aporta: garantía, reproceso o crédito no requieren factura para salir.
 */
export const estadoFactura = (odp?: ODPInstalacion | null): Etiqueta | null => {
  if (odp?.estado_facturacion === 'FACTURADA') return { label: 'Facturada', tono: 'ok' };
  if (odp?.es_garantia || odp?.es_no_conformidad || odp?.forma_pago === 'credito') return null;
  return { label: 'Sin factura', tono: 'aviso' };
};

// ─── Fechas de una ruta ───────────────────────────────────────────────────────

interface ParadaConFecha { estado?: string | null; fecha_programada?: string | null }
interface RutaConParadas { ruta_odps?: ParadaConFecha[] | null }

/**
 * Día de la ruta: la fecha de la primera parada que todavía no termina (si todas
 * terminaron, la primera de todas). `rutas_instalacion` no tiene fecha propia: vive en
 * cada parada. Al 2026-10-05 ninguna ruta mezclaba días, pero el modal lo permite.
 */
export const fechaRuta = (ruta: RutaConParadas): string | null => {
  const paradas = ruta.ruta_odps ?? [];
  const vivas = paradas.filter((p) => p.estado === 'pendiente' || p.estado === 'en_curso' || p.estado === 'con_dano');
  const fuente = vivas.length ? vivas : paradas;
  const fechas = fuente.map((p) => diaISO(p.fecha_programada)).filter((f): f is string => !!f).sort();
  return fechas[0] ?? null;
};

/**
 * Orden de las paradas: día y luego `orden`. Desde el 2026-10-08 `orden` es la posición en el
 * día del EQUIPO (lo fija "Aceptar orden" en Programados → Por equipo), no dentro de la ruta,
 * así que dos paradas de días distintos pueden compartir número. Mismo criterio que el backend.
 */
export const compararParadas = (
  a: { fecha_programada?: string | null; orden?: number | null; id?: number },
  b: { fecha_programada?: string | null; orden?: number | null; id?: number },
): number =>
  (diaISO(a.fecha_programada) ?? '9999').localeCompare(diaISO(b.fecha_programada) ?? '9999')
  || (a.orden ?? 0) - (b.orden ?? 0)
  || (a.id ?? 0) - (b.id ?? 0);

/**
 * Orden del recorrido del CAMIÓN (pestaña Recorridos): día, luego `orden_conductor`. Una
 * parada sin organizar (NULL) va después de las organizadas, en el orden de los instaladores.
 * Mismo criterio en la pestaña del jefe y en la app del conductor.
 */
export const compararRecorrido = (
  a: { fecha_programada?: string | null; orden?: number | null; orden_conductor?: number | null; ruta_id?: number; id?: number },
  b: { fecha_programada?: string | null; orden?: number | null; orden_conductor?: number | null; ruta_id?: number; id?: number },
): number => {
  const clave = (p: typeof a) => p.orden_conductor ?? 100000 + (p.orden ?? 0);
  return (diaISO(a.fecha_programada) ?? '9999').localeCompare(diaISO(b.fecha_programada) ?? '9999')
    || clave(a) - clave(b)
    || (a.ruta_id ?? 0) - (b.ruta_id ?? 0)
    || (a.id ?? 0) - (b.id ?? 0);
};

/** Último día de la ruta, para mostrar un rango cuando las paradas son de días distintos. */
export const fechaFinRuta = (ruta: RutaConParadas): string | null => {
  const fechas = (ruta.ruta_odps ?? []).map((p) => diaISO(p.fecha_programada)).filter((f): f is string => !!f).sort();
  return fechas[fechas.length - 1] ?? null;
};

/** "Hoy", "Mañana", "Ayer", "Vencida hace N días", "En N días". */
export const relativoDia = (iso: string | null): { texto: string; vencida: boolean; dias: number | null } => {
  if (!iso) return { texto: 'Sin fecha', vencida: false, dias: null };
  const dias = diferenciaDias(hoyBogotaISO(), iso);
  if (dias === 0) return { texto: 'Hoy', vencida: false, dias };
  if (dias === 1) return { texto: 'Mañana', vencida: false, dias };
  if (dias === -1) return { texto: 'Vencida desde ayer', vencida: true, dias };
  if (dias < 0) return { texto: `Vencida hace ${-dias} días`, vencida: true, dias };
  return { texto: `En ${dias} días`, vencida: false, dias };
};

/** "mar 06 oct" */
export const fmtDiaCorto = (iso: string | null): string =>
  fmtDia(iso, { weekday: 'short', day: '2-digit', month: 'short' }, '—');

/** Rango legible de la ruta: "mar 06 oct" o "mar 06 – mié 07 oct". */
export const rangoRuta = (ruta: RutaConParadas): string => {
  const ini = fechaRuta(ruta);
  const fin = fechaFinRuta(ruta);
  if (!ini) return '—';
  if (!fin || fin === ini) return fmtDiaCorto(ini);
  return `${fmtDia(ini, { weekday: 'short', day: '2-digit' })} – ${fmtDiaCorto(fin)}`;
};
