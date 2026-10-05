// Helpers compartidos del módulo Contabilidad.
// Extraídos de ContabilidadPage para que los modales (FE, abonos) puedan reutilizarse
// también desde la ficha de la ODP sin duplicar formato ni reglas de cálculo.
import { coincideBusqueda } from '../../../utils/busqueda';
import { fmtFecha as fmtFechaBogota } from '../../../utils/fechas';

export const getToken = () => sessionStorage.getItem('token');
export const headers = () => ({ Authorization: `Bearer ${getToken()}` });

export const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

// Formato de miles para inputs de monto (ej: "4.123.548"). Solo enteros (COP sin centavos).
export const formatMiles = (input: string | number) => {
  const digits = String(input).replace(/\D/g, '');
  return digits ? Number(digits).toLocaleString('es-CO') : '';
};

export const parseMiles = (val: string) => Number(String(val).replace(/\D/g, '')) || 0;

// Recibe días de calendario (fecha_factura, vencimiento) y momentos (fecha_creacion,
// pagos): `fmtFecha` de utils/fechas.ts muestra cada uno en su regla, en hora de Bogotá.
// Antes se cortaban los 10 primeros caracteres a todo, y un momento de después de las
// 7 p.m. salía con la fecha de mañana.
export const fmtFecha = (f: string | null | undefined): string =>
  fmtFechaBogota(f, { day: '2-digit', month: 'short', year: 'numeric' }, '—');

// Usa el pendiente almacenado en BD (ya descuenta diferencia/retención).
// Fallback a valor_total-abono solo si pendiente no está disponible (ODPs antiguas).
export const calcPendiente = (o: any) =>
  o?.pendiente != null
    ? Number(o.pendiente)
    : Math.max(0, Number(o?.valor_total || 0) - Number(o?.abono || 0));

// ─── Pestañas y búsqueda ─────────────────────────────────────────────────────

export type PestanaContabilidad = 'estado_caja' | 'pagos' | 'cartera' | 'completado' | 'oa';

/** Proceso Completado: ODP (no OA) con FE registrada y caja CANCELADO.
 *  Misma regla que SQL_COMPLETADA en contabilidad.controller.ts. */
export const esCompletada = (o: any): boolean =>
  o?.tipo_odp !== 'OA' && !!o?.factura_electronica && o?.estado_caja === 'CANCELADO';

/**
 * Pestaña donde vive una ODP. Una sola fuente para los listados y el buscador maestro.
 * 'ninguna' = NC o garantía: no cobran ni facturan, así que no salen en Estado Caja.
 * Cartera Vencida es adicional (una ODP puede estar en Estado Caja y en Cartera a la vez)
 * y se resuelve contra cartera_detalle del resumen, no aquí.
 */
export const pestanaDeODP = (o: any): 'estado_caja' | 'completado' | 'oa' | 'ninguna' => {
  if (o?.tipo_odp === 'OA') return 'oa';
  if (esCompletada(o)) return 'completado';
  if (o?.es_no_conformidad || o?.es_garantia) return 'ninguna';
  return 'estado_caja';
};

/** Filtro local de ODPs: número, cliente, NIT (con o sin puntos), asesor y FE (principal
 *  y adicionales). Es el mismo criterio que la búsqueda del servidor (`q`). */
export const coincideODP = (o: any, termino: string): boolean =>
  coincideBusqueda(
    termino,
    [
      o?.numero_odp,
      o?.cliente?.nombre_razon_social,
      o?.cliente?.numero_documento,
      o?.asesor?.nombre_completo,
      o?.factura_electronica,
      ...((o?.facturas_adicionales as any[]) || []).map(f => f?.numero_fe),
    ],
    [o?.cliente?.numero_documento],
  );

export const BANCOS_COLOMBIA = [
  'Bancolombia', 'Nequi', 'Davivienda', 'Banco de Bogotá', 'BBVA', 'Scotiabank Colpatria',
  'Banco Popular', 'Banco de Occidente', 'AV Villas', 'Banco Caja Social', 'Banco Agrario',
  'Citibank', 'Banco Falabella', 'Banco Pichincha', 'Banco Serfinanza', 'Itaú', 'Banco GNB Sudameris',
  'Banco Finandina', 'Banco Mundo Mujer', 'Lulo Bank', 'Movii', 'Rappipay', 'Otro',
];

export const METODOS_PAGO = ['Efectivo', 'Tarjeta', 'Transferencia'];

// Roles con acceso al CRUD de facturación electrónica y abonos.
// Coincide con el RBAC del backend (odp.routes.ts y contabilidad.routes.ts).
export const ROLES_CONTABILIDAD = ['admin', 'contabilidad', 'gerencia'];

export const puedeGestionarCobros = (rol?: string) => ROLES_CONTABILIDAD.includes(rol || '');
