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
//
// También genera el número TM-XXXX y crea la TM de una ODP que entra a Visita
// técnica sin ninguna (2026-10-28 (4)): regla "toda ODP en Visita técnica tiene
// su TM real", para que el panel de Tomas de Medida la muestre con Programar /
// Editar / Eliminar en vez de la tarjeta de "ODP sin TM".
import { Op, Transaction } from 'sequelize';
import { HistorialEstadoODP, TomaMedidas } from '../models';

/** Siguiente TM-XXXX. La colisión la resuelve el UNIQUE de `numero_tm` + `withUniqueRetry`. */
export async function generarNumeroTM(transaction?: Transaction): Promise<string> {
  const last = await TomaMedidas.findOne({
    where: { numero_tm: { [Op.like]: 'TM-%' } },
    order: [['numero_tm', 'DESC']],
    attributes: ['numero_tm'],
    transaction,
  });
  let next = 1;
  if (last) {
    const parts = (last.getDataValue('numero_tm') as string).split('-');
    next = parseInt(parts[parts.length - 1]) + 1;
  }
  return `TM-${String(next).padStart(4, '0')}`;
}

/**
 * Si la ODP no tiene ninguna TM, le crea una "solicitada" con su dirección y
 * quien recibe. No toca el estado de la ODP (quien llama ya la dejó en Visita
 * técnica). Devuelve el número creado o null si ya tenía TM. `emitir: false`
 * para scripts: el aviso por socket importa `server`, que arranca el servidor.
 */
export async function asegurarTMDeODP(
  odp: any,
  opts: { usuarioId: number; transaction?: Transaction; emitir?: boolean }
): Promise<string | null> {
  const { usuarioId, transaction, emitir = true } = opts;
  const odpId = Number(odp.getDataValue('id'));
  const existentes = await TomaMedidas.count({ where: { odp_id: odpId }, transaction });
  if (existentes > 0) return null;

  const numero_tm = await generarNumeroTM(transaction);
  await TomaMedidas.create({
    numero_tm,
    odp_id: odpId,
    prospecto_id: null,
    realizado_por: usuarioId,
    estado: 'solicitada',
    fecha_visita: null,
    direccion: odp.getDataValue('direccion_instalacion') || null,
    nombre_contacto: odp.getDataValue('nombre_recibe') || null,
    telefono_contacto: odp.getDataValue('telefono_recibe') || null,
    contacto_obra: odp.getDataValue('nombre_recibe') || null,
    telefono_obra: odp.getDataValue('telefono_recibe') || null,
    observaciones: null,
    medidas_json: [],
  }, { transaction });

  if (emitir) {
    if (transaction) transaction.afterCommit(emitirCambioTM);
    else emitirCambioTM();
  }
  return numero_tm;
}

function emitirCambioTM() {
  import('../server').then(({ emitirCambio }) => emitirCambio('toma_medidas')).catch(() => {});
}

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
