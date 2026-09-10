import { Op } from 'sequelize';

/**
 * Rango [desde, hasta] listo para un `where` de Sequelize, o `null` si falta alguno
 * de los dos extremos (= "sin filtrar por fecha").
 *
 * Vive aquí y no dentro de un controlador porque lo consumen tanto `crm.controller`
 * (métricas de leads, ranking de asesores, buscadores) como `utils/odpFiltros.ts`
 * (explorador de ODP y buscador de supervisión). Tener dos copias significaría que
 * un día el CRM y el módulo ODP cuenten "agosto" con límites distintos.
 *
 * `setUTCHours` (no `setHours`): `fecha_desde`/`fecha_hasta` llegan como "YYYY-MM-DD"
 * y se parsean en medianoche UTC. Mutar con setters de hora LOCAL en un servidor con
 * TZ distinta de UTC desfasa el límite del período — mismo bug corregido en
 * getCRMStats (ver TECH_DEBT 2026-07-12).
 */
export const construirFiltroFecha = (fecha_desde: any, fecha_hasta: any) => {
  if (!fecha_desde || !fecha_hasta) return null;
  const start = new Date(fecha_desde as string);
  const end = new Date(fecha_hasta as string);
  end.setUTCHours(23, 59, 59, 999);
  return { [Op.between]: [start, end] };
};
