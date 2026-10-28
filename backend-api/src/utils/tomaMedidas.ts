// Efecto de una toma de medidas sobre su ODP (2026-10-28).
//
// Tres puntos mueven la ODP por una TM: solicitarla desde la ficha (`createTM`),
// relacionar una existente (`vincularTMaODP`) y subir su foto (`uploadFotoTM`).
// Antes cada uno hacía su `odp.update` suelto: sin fila en `historial_estados_odp`
// y sin `emitirODPPatch`, así que el tablero de Producción no se enteraba y el
// historial de la ODP tenía huecos. Este archivo es el único que lo hace.
//
// Vive en `utils/` y no en el controlador por el ciclo `server → app → routes →
// controller` (ver `pedidoPvCapacidad.ts`); `./notificaciones` entra por import
// dinámico.
//
// No es el motor de checks (`checksAutomaticos.ts`): ese motor no maneja
// `chk_medicion` hoy. Ver TECH_DEBT.md 2026-10-28.
import { Transaction } from 'sequelize';
import { HistorialEstadoODP } from '../models';

export interface CambioODPPorTM {
  estado_produccion?: string;
  chk_medicion?: boolean;
}

/**
 * Aplica a la ODP lo que corresponde por su TM. Solo escribe lo que cambia; si
 * cambia el estado deja la fila del historial con quién lo hizo
 * (`usuario_id` es NOT NULL). El patch de socket sale después del commit
 * cuando hay transacción, para que el frontend no lea la fila vieja.
 */
export async function aplicarCambioODPPorTM(
  odp: any,
  cambio: CambioODPPorTM,
  opts: { usuarioId: number; observacion: string; transaction?: Transaction }
): Promise<boolean> {
  const { usuarioId, observacion, transaction } = opts;
  const estadoAnterior = odp.getDataValue('estado_produccion') as string;
  const aEscribir: Record<string, unknown> = {};
  if (cambio.estado_produccion && cambio.estado_produccion !== estadoAnterior) aEscribir.estado_produccion = cambio.estado_produccion;
  if (cambio.chk_medicion !== undefined && cambio.chk_medicion !== !!odp.getDataValue('chk_medicion')) {
    aEscribir.chk_medicion = cambio.chk_medicion;
  }
  if (Object.keys(aEscribir).length === 0) return false;

  // Por instancia (no bulk) para que el hook de auditoría lo registre.
  await odp.update(aEscribir, { transaction });
  if (aEscribir.estado_produccion) {
    await HistorialEstadoODP.create({
      odp_id: Number(odp.getDataValue('id')),
      estado_anterior: estadoAnterior,
      estado_nuevo: aEscribir.estado_produccion,
      usuario_id: usuarioId,
      fecha: new Date(),
      observacion,
    }, { transaction });
  }

  const odpId = Number(odp.getDataValue('id'));
  const emitir = () => {
    import('./notificaciones').then(({ emitirODPPatch }) => emitirODPPatch(odpId, 'update')).catch(() => {});
  };
  if (transaction) transaction.afterCommit(emitir);
  else emitir();
  return true;
}
