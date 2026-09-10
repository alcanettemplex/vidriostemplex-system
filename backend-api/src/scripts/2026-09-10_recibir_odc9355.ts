/**
 * ODC-9355 (ordenes_compra.id = 398) — reponer la cabecera en 'recibido'.
 *
 * Contexto (auditoría de auditoria_log, 2026-09-10):
 *   14:58:13  `recibirItems` la recibió correctamente: los 4 ODCItem quedaron en
 *             recibido=true, los 4 SAPItem pasaron a 'en_existencia' y el motor de
 *             checks recalculó las 3 ODP afectadas (499, 552, 554).
 *   15:18:24  Un `PUT /api/compras/odc/398` (ComprasPage → handleGuardarEdicion) la
 *             devolvió a 'pendiente'. `updateODC` no tiene rama de des-recepción, así
 *             que NO revirtió nada del material: la cabecera quedó mintiendo.
 *
 * Por eso el único dato a corregir es `estado`. `fecha_recepcion` se conserva con la
 * hora real de recepción (14:58) — reescribirla falsearía la trazabilidad.
 *
 * El recálculo de herrajes va como red de seguridad: es idempotente y el motor
 * retorna sin escribir si nada cambia (checksAutomaticos.ts:319), así que no debería
 * mover ningún check, historial ni socket.
 *
 * ⚠️ No emite sockets: `emitirCambio`/`emitirODPPatch` importan `../server`, y ejecutar
 * ese módulo desde un script levantaría un segundo http.Server en el puerto 3001.
 * Quien tenga /compras abierta debe refrescar (F5).
 *
 * Uso:
 *   ./backend-api/node_modules/.bin/ts-node backend-api/src/scripts/2026-09-10_recibir_odc9355.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: 'backend-api/.env' });

import { Op } from 'sequelize';
import { OrdenCompra, ODCItem, SAPItem, sequelize } from '../models';
import { requestContext } from '../utils/requestContext';
import { recalcularHerrajesDeSapItems } from '../utils/checksAutomaticos';

const ODC_ID = 398;
const ACTOR_ID = 1; // Administrador — el mismo que ejecutó la recepción de las 14:58

const ejecutar = async () => {
  const t = await sequelize.transaction();
  try {
    const odc = await OrdenCompra.findByPk(ODC_ID, { transaction: t });
    if (!odc) throw new Error(`No existe ordenes_compra.id=${ODC_ID}`);

    const numeroOdc = odc.getDataValue('numero_odc');
    const estadoActual = odc.getDataValue('estado');
    console.log(`ODC ${numeroOdc} (id ${ODC_ID}) — estado actual: ${estadoActual}`);

    // ─── Precondiciones: si algo cambió desde el diagnóstico, no se escribe nada ───
    if (estadoActual === 'recibido') {
      console.log('Ya está en «recibido». Nada que hacer.');
      await t.rollback();
      return;
    }
    if (estadoActual !== 'pendiente') {
      throw new Error(`Estado inesperado «${estadoActual}»; se esperaba «pendiente». Abortado.`);
    }

    const items = await ODCItem.findAll({ where: { odc_id: ODC_ID }, transaction: t });
    if (items.length === 0) throw new Error('La ODC no tiene ítems. Abortado.');

    const noRecibidos = items.filter((i: any) => i.getDataValue('recibido') !== true);
    if (noRecibidos.length > 0) {
      throw new Error(
        `Hay ${noRecibidos.length} ítem(s) sin recibir (ids ${noRecibidos.map((i: any) => i.getDataValue('id')).join(', ')}). ` +
        'Esto ya no es el incidente diagnosticado — recíbela desde /compras. Abortado.',
      );
    }

    const sapItemIds: number[] = items
      .map((i: any) => i.getDataValue('sap_item_id'))
      .filter(Boolean);

    if (sapItemIds.length > 0) {
      const sapItems = await SAPItem.findAll({
        where: { id: { [Op.in]: sapItemIds } },
        transaction: t,
      });
      const fuera = sapItems.filter((s: any) => s.getDataValue('estado_compra') !== 'en_existencia');
      if (fuera.length > 0) {
        throw new Error(
          `SAPItem(s) fuera de «en_existencia»: ${fuera.map((s: any) => `${s.getDataValue('id')}:${s.getDataValue('estado_compra')}`).join(', ')}. ` +
          'El efecto material no está aplicado; este script no lo aplica. Abortado.',
        );
      }
      const modificados = sapItems.filter((s: any) => s.getDataValue('modificado') === true);
      if (modificados.length > 0) {
        throw new Error(
          `SAPItem(s) con modificado=true: ${modificados.map((s: any) => s.getDataValue('id')).join(', ')}. ` +
          'Actualiza la orden antes de recibirla. Abortado.',
        );
      }
    }

    console.log(`✔ Precondiciones OK — ${items.length} ítems recibidos, ${sapItemIds.length} SAPItems en existencia.`);

    // ─── Escritura: solo la cabecera. fecha_recepcion se conserva. ───
    const fechaRecepcionPrevia = odc.getDataValue('fecha_recepcion');
    await odc.update({ estado: 'recibido' }, { transaction: t });
    console.log(`✔ estado: pendiente → recibido (fecha_recepcion intacta: ${fechaRecepcionPrevia})`);

    // ─── Red de seguridad: recálculo idempotente de herrajes ───
    await recalcularHerrajesDeSapItems(sapItemIds, {
      usuarioId: ACTOR_ID,
      origen: 'SAP',
      detalle: `ODC ${numeroOdc} recibida (corrección de estado)`,
      transaction: t,
    });
    console.log('✔ Motor de checks ejecutado (sin cambios esperados).');

    await t.commit();
    console.log('\n✅ COMMIT. Refresca /compras (F5) para ver la ODC en la pestaña «Recibidas».');
  } catch (e: any) {
    try { await t.rollback(); } catch { /* ya hecho */ }
    console.error('\n❌ ROLLBACK —', e.message);
    process.exitCode = 1;
  }
};

(async () => {
  try {
    // Sin este contexto los hooks de auditoría grabarían usuario_id = null.
    await requestContext.run(
      { userId: ACTOR_ID, userName: 'Administrador (script 2026-09-10_recibir_odc9355)', ip: null },
      ejecutar,
    );
  } finally {
    await sequelize.close();
  }
})();
