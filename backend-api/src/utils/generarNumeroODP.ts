import { Op, Transaction } from 'sequelize';
import { ODP, sequelize } from '../models';

/**
 * Genera el siguiente `numero_odp` consecutivo para el prefijo dado.
 *
 * - `ODP` → órdenes normales · `OA` → Orden Azul (sin IVA).
 * - Consecutivo global por prefijo, ordenado numéricamente por el sufijo
 *   (`CAST(SPLIT_PART(...))`) para que 'ODP-9' < 'ODP-10' pese a ser strings.
 * - `padStart(4)` solo afecta números < 1000; el consecutivo real ya va en 5
 *   dígitos, así que hoy es cosmético — se mantiene por consistencia histórica.
 *
 * IMPORTANTE: es un read-then-write NO atómico. El llamador DEBE envolver la
 * creación de la ODP en `withUniqueRetry`; el UNIQUE de `numero_odp` es la
 * garantía final ante concurrencia. Acepta una transacción/savepoint opcional
 * para leer el máximo dentro del mismo contexto transaccional del INSERT.
 */
export async function generarNumeroODP(
  prefijo: 'ODP' | 'OA' = 'ODP',
  transaction?: Transaction,
): Promise<string> {
  const last = await ODP.findOne({
    where: { numero_odp: { [Op.like]: `${prefijo}-%` } },
    order: [[sequelize.literal("CAST(SPLIT_PART(numero_odp, '-', 2) AS INTEGER)"), 'DESC']],
    attributes: ['numero_odp'],
    transaction,
  });
  let next = 1;
  if (last) {
    const parts = (last.getDataValue('numero_odp') as string).split('-');
    next = parseInt(parts[parts.length - 1], 10) + 1;
  }
  return `${prefijo}-${String(next).padStart(4, '0')}`;
}
