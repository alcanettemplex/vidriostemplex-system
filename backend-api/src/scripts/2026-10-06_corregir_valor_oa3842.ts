/**
 * Corrección puntual de monto — OA-3842 (CLARA INES PALACIO VALENCIA, crédito, ENTREGADA).
 *
 * Contexto: la OA se registró por $1.529.000 pero el valor real es **$1.300.000**. Error de
 * digitación confirmado por el usuario (2026-10-06).
 *
 * Qué toca:
 *   - `valor_total` → base de cartera, dashboard y el talonario impreso.
 *   - `pendiente`   → derivado: max(0, valor_total - abono). La OA no tiene pagos ni abono,
 *                     así que cae al total nuevo.
 * `estado_caja` se recalcula con el mismo criterio de `updateODP` (odp.controller.ts ~990):
 * crédito sin abono → CREDITO_APROBADO. Aquí no cambia, pero se recalcula por si el script se
 * corriera sobre un estado distinto al diagnosticado.
 * `monto_factura_principal` NO se toca: la OA aún no está facturada (NULL).
 *
 * Verificado antes de escribir (2026-10-06): sin FE principal, sin facturas adicionales, sin
 * pagos; la salida de almacén SFV-3842 y los 3 ítems (Pedido PV 590) no guardan montos — no hay
 * nada aguas abajo que recalcular.
 *
 * Se escribe por el MODELO (no SQL crudo) para que disparen los hooks de auditoría, dentro de un
 * `requestContext` firmado con el nombre del script. No emite socket: las pantallas abiertas ven
 * el valor nuevo al recargar.
 *
 * Idempotente: si el monto ya está corregido, no escribe.
 *
 * Uso:
 *   ./backend-api/node_modules/.bin/ts-node backend-api/src/scripts/2026-10-06_corregir_valor_oa3842.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: 'backend-api/.env' });

import { QueryTypes } from 'sequelize';
import { ODP, FacturaAdicionalODP, sequelize } from '../models';
import { requestContext } from '../utils/requestContext';

const NUMERO_ODP = 'OA-3842';
const VALOR_DIGITADO = 1529000;
const VALOR_CORRECTO = 1300000;

const run = async () => {
  const odp = await ODP.findOne({ where: { numero_odp: NUMERO_ODP } });
  if (!odp) throw new Error(`${NUMERO_ODP} no encontrada`);

  const odpId = Number(odp.getDataValue('id'));
  const antes = {
    valor_total: Number(odp.getDataValue('valor_total')) || 0,
    monto_factura_principal: odp.getDataValue('monto_factura_principal') == null
      ? null : Number(odp.getDataValue('monto_factura_principal')),
    abono: Number(odp.getDataValue('abono')) || 0,
    pendiente: Number(odp.getDataValue('pendiente')) || 0,
    estado_caja: odp.getDataValue('estado_caja'),
    forma_pago: odp.getDataValue('forma_pago'),
    estado_facturacion: odp.getDataValue('estado_facturacion'),
  };
  console.log(`═══ ANTES — ${NUMERO_ODP} (id ${odpId}) ═══`);
  console.table([antes]);

  // ── Guardas: no corregir a ciegas si el registro no es el diagnosticado ──
  if (antes.valor_total !== VALOR_DIGITADO && antes.valor_total !== VALOR_CORRECTO) {
    throw new Error(`Valor inesperado: se esperaba ${VALOR_DIGITADO} y la OA tiene ${antes.valor_total}. Revisar a mano.`);
  }
  const sumAdicionales = Number(await FacturaAdicionalODP.sum('monto', { where: { odp_id: odpId } })) || 0;
  const yaFacturado = (antes.monto_factura_principal || 0) + sumAdicionales;
  if (yaFacturado > VALOR_CORRECTO + 0.01) {
    throw new Error(`Ya hay ${yaFacturado} facturado, por encima del valor corregido (${VALOR_CORRECTO}).`);
  }
  if (antes.abono > VALOR_CORRECTO) {
    throw new Error(`El abono registrado (${antes.abono}) supera el valor corregido (${VALOR_CORRECTO}).`);
  }

  const nuevoPendiente = Math.max(0, VALOR_CORRECTO - antes.abono);
  // Mismo criterio que updateODP (odp.controller.ts)
  let nuevoEstadoCaja: string;
  if (nuevoPendiente <= 0 && antes.abono > 0) nuevoEstadoCaja = 'CANCELADO';
  else if (antes.forma_pago === 'credito' && antes.abono <= 0) nuevoEstadoCaja = 'CREDITO_APROBADO';
  else if (antes.abono > 0) nuevoEstadoCaja = 'ABONADO';
  else nuevoEstadoCaja = 'PENDIENTE';

  const sinCambios =
    antes.valor_total === VALOR_CORRECTO &&
    antes.pendiente === nuevoPendiente &&
    antes.estado_caja === nuevoEstadoCaja;

  if (sinCambios) {
    console.log('\n✓ Sin cambios: el valor ya está corregido.');
    return;
  }

  const transaction = await sequelize.transaction();
  try {
    await odp.update({
      valor_total: VALOR_CORRECTO,
      pendiente: nuevoPendiente,
      estado_caja: nuevoEstadoCaja,
    }, { transaction });
    await transaction.commit();
  } catch (e) {
    await transaction.rollback();
    throw e;
  }

  const fresca = await ODP.findByPk(odpId);
  console.log('\n═══ DESPUÉS ═══');
  console.table([{
    valor_total: fresca!.getDataValue('valor_total'),
    abono: fresca!.getDataValue('abono'),
    pendiente: fresca!.getDataValue('pendiente'),
    estado_caja: fresca!.getDataValue('estado_caja'),
    estado_facturacion: fresca!.getDataValue('estado_facturacion'),
  }]);

  const aud: any[] = await sequelize.query(`
    SELECT id, operacion, usuario_nombre, fecha
      FROM auditoria_log WHERE tabla = 'odp' AND registro_id = :id
     ORDER BY fecha DESC LIMIT 3
  `, { type: QueryTypes.SELECT, replacements: { id: String(odpId) } });
  console.log('\n═══ AUDITORÍA (últimas 3) ═══');
  console.table(aud);
};

(async () => {
  try {
    // Firma del actor para los hooks de auditoría: el script, no una persona.
    await new Promise<void>((resolve, reject) => {
      requestContext.run(
        { userId: null, userName: 'script 2026-10-06_corregir_valor_oa3842 (error de digitación)', ip: null },
        () => { run().then(resolve, reject); },
      );
    });
  } catch (e: any) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  } finally {
    // Margen para que el INSERT de auditoría (fire-and-forget en el hook) alcance a salir.
    await new Promise((r) => setTimeout(r, 1500));
    await sequelize.close();
  }
})();
