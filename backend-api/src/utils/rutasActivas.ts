import { QueryTypes } from 'sequelize';
import sequelize from '../config/database';

/**
 * Ids de las ODP (de entre `odpIds`) que hoy están tomadas por una ruta: tienen una
 * parada viva (`pendiente`, `en_curso`, `con_dano`) en una ruta abierta (`programada`,
 * `en_curso`). Mismo criterio que `PARADAS_VIVAS` / `RUTA_ABIERTA` de rutas.controller.
 *
 * No cuentan como programadas (2026-10-07): las paradas `pausada` (pausar saca la ODP de
 * la ruta desde el 2026-10-05), las de rutas canceladas, ni las `pendiente` que quedaron
 * en rutas ya completadas. Antes el KPI "Listas sin programar" daba por programada
 * cualquier ODP con una parada no completada.
 */
export const odpsEnRutaActiva = async (odpIds: number[]): Promise<Set<number>> => {
  if (!odpIds.length) return new Set();
  const filas = await sequelize.query<{ odp_id: number }>(
    `SELECT DISTINCT ro.odp_id
       FROM ruta_odp ro
       JOIN rutas_instalacion ri ON ri.id = ro.ruta_id
      WHERE ro.odp_id IN (:ids)
        AND ro.estado IN ('pendiente', 'en_curso', 'con_dano')
        AND ri.estado IN ('programada', 'en_curso')`,
    { replacements: { ids: odpIds }, type: QueryTypes.SELECT }
  );
  return new Set(filas.map((f) => Number(f.odp_id)));
};
