import { QueryTypes } from 'sequelize';
import sequelize from '../../config/database';

// ─────────────────────────────────────────────────────────────────────────────
// Validez de la oferta (2026-10-01). Una cotización vale
// `cotizador.empresa.validez_oferta_dias` días HÁBILES (lunes a viernes, sin
// festivos) contados desde el día siguiente a su creación, en fecha de Bogotá
// (la sesión de Supabase está en UTC).
//
// Vivía dentro de `services/dashboardCotizaciones.service.ts`; se extrajo cuando
// la pestaña Cotizaciones empezó a agrupar por "vencen pronto / vencidas", para
// que el tablero y la pestaña no puedan clasificar distinto la misma cotización.
// Es solo una señal: el estado de la cotización no cambia (decisión del usuario).
// ─────────────────────────────────────────────────────────────────────────────

export const HOY_BOGOTA = `(now() AT TIME ZONE 'America/Bogota')::date`;

/** Quedan 0, 1 o 2 días hábiles: "por vencer". Menos de 0: vencida. */
export const HABILES_POR_VENCER = 2;

export type EstadoValidez = 'VIGENTE' | 'POR_VENCER' | 'VENCIDA';

export interface ValidezCotizacion {
  habilesRestantes: number;
  estado: EstadoValidez;
}

/** Días hábiles (lun–vie) transcurridos desde el día siguiente a `columnaFecha`
 * (una expresión SQL de tipo DATE) hasta hoy. */
export function habilesTranscurridosSql(columnaFecha: string): string {
  return `(
  SELECT COUNT(*)::int FROM generate_series(${columnaFecha} + 1, ${HOY_BOGOTA}, interval '1 day') g
  WHERE EXTRACT(ISODOW FROM g) < 6)`;
}

export function clasificarValidez(habilesRestantes: number): EstadoValidez {
  if (habilesRestantes < 0) return 'VENCIDA';
  if (habilesRestantes <= HABILES_POR_VENCER) return 'POR_VENCER';
  return 'VIGENTE';
}

export async function validezOfertaDias(): Promise<number> {
  const filas = await sequelize.query<{ dias: number | null }>(
    'SELECT validez_oferta_dias AS dias FROM cotizador.empresa WHERE id = 1',
    { type: QueryTypes.SELECT }
  );
  const d = Number(filas[0]?.dias);
  return Number.isInteger(d) && d > 0 ? d : 8;
}

/**
 * Validez de un grupo de cotizaciones, por id. Una consulta, solo con los ids
 * pedidos y dos columnas: no lee JSONB ni crece con el resto de la tabla.
 * Se calcula para todas, no solo las PENDIENTE: quien llama decide si le importa.
 */
export async function validezDeCotizaciones(ids: number[]): Promise<Map<number, ValidezCotizacion>> {
  const mapa = new Map<number, ValidezCotizacion>();
  if (ids.length === 0) return mapa;
  const [dias, filas] = await Promise.all([
    validezOfertaDias(),
    sequelize.query<{ id: number; transcurridos: number }>(
      `SELECT id, ${habilesTranscurridosSql(`(creada_en AT TIME ZONE 'America/Bogota')::date`)} AS transcurridos
         FROM cotizador.cotizacion WHERE id IN (:ids)`,
      { replacements: { ids }, type: QueryTypes.SELECT }
    ),
  ]);
  for (const f of filas) {
    const habilesRestantes = dias - Number(f.transcurridos);
    mapa.set(Number(f.id), { habilesRestantes, estado: clasificarValidez(habilesRestantes) });
  }
  return mapa;
}
