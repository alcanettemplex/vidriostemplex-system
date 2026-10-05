import { Op, Transaction } from 'sequelize';
import { CatalogoProducto } from '../models';

/**
 * Regla única de "lleva aluminio": un código de la SAP que en el catálogo tiene
 * `es_aluminio = true`. La usan `recalcularAluminioODP` (sap.controller, que
 * mantiene `odp.tiene_aluminio`), `getODPById` (marca cada SAP) y el pase a corte
 * (2026-10-05). Vive en utils/ y no en el controlador por el ciclo
 * `server → app → routes → controller` (ver pedidoPvCapacidad.ts).
 *
 * Devuelve el subconjunto de `codigos` que son aluminio. Una consulta, sin
 * importar cuántas SAP se evalúen: se le pasan los códigos de todas juntas.
 */
export const codigosDeAluminio = async (
  codigos: Array<string | null | undefined>,
  transaction?: Transaction,
): Promise<Set<string>> => {
  const unicos = [...new Set(codigos.filter((c): c is string => !!c))];
  if (unicos.length === 0) return new Set();
  const filas = await CatalogoProducto.findAll({
    where: { codigo: { [Op.in]: unicos }, es_aluminio: true },
    attributes: ['codigo'],
    transaction,
  });
  return new Set(filas.map((f) => String(f.getDataValue('codigo'))));
};

/** true si algún código de la lista es aluminio. */
export const sapTieneAluminio = async (
  codigos: Array<string | null | undefined>,
  transaction?: Transaction,
): Promise<boolean> => (await codigosDeAluminio(codigos, transaction)).size > 0;
