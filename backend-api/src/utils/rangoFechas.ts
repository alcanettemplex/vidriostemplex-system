import { Op } from 'sequelize';
import { rangoDiasBogota } from './fechas';

/**
 * Rango [desde, hasta] listo para un `where` de Sequelize, o `null` si falta alguno
 * de los dos extremos (= "sin filtrar por fecha").
 *
 * Vive aquí y no dentro de un controlador porque lo consumen tanto `crm.controller`
 * (métricas de leads, ranking de asesores, buscadores) como `utils/odpFiltros.ts`
 * (explorador de ODP y buscador de supervisión). Tener dos copias significaría que
 * un día el CRM y el módulo ODP cuenten "agosto" con límites distintos.
 *
 * `fecha_desde`/`fecha_hasta` llegan como "YYYY-MM-DD" (días elegidos en Bogotá). El
 * límite depende del tipo de columna que se filtra (ver utils/fechas.ts):
 *
 * - `'momento'` (por defecto: `createdAt`, `fecha_creacion`, `fecha_aprobado`,
 *   `fecha_listo_instalar`…): días completos de BOGOTÁ, de 00:00 a 23:59:59.999 -05.
 *   Antes se cortaba a medianoche UTC y lo creado entre las 7 p.m. y la medianoche de
 *   Bogotá caía en el día siguiente (2026-10-05).
 * - `'dia'` (`odp.fecha_entrega`, TIMESTAMPTZ guardado a las 00:00 UTC): días completos
 *   en UTC, que es como están guardados — así el día digitado es el día filtrado.
 */
export const construirFiltroFecha = (
  fecha_desde: any,
  fecha_hasta: any,
  tipo: 'momento' | 'dia' = 'momento'
) => {
  if (!fecha_desde || !fecha_hasta) return null;
  const desde = String(fecha_desde).slice(0, 10);
  const hasta = String(fecha_hasta).slice(0, 10);
  if (tipo === 'dia') {
    return { [Op.between]: [new Date(`${desde}T00:00:00.000Z`), new Date(`${hasta}T23:59:59.999Z`)] };
  }
  const { inicio, fin } = rangoDiasBogota(desde, hasta);
  return { [Op.between]: [inicio, fin] };
};
