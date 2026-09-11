/**
 * Corrección puntual de montos — ODP-24317 (BUEN TIPO COLOMBIA S.A.S, FE 7460 del 08-sep-2026).
 *
 * Contexto: la ODP se facturó por $1.052.481 pero el monto real —tanto de la ODP como de la
 * factura electrónica— es **$594.766**. Error de digitación del usuario (2026-09-11).
 *
 * Qué toca, y por qué esos tres campos y no más:
 *   - `monto_factura_principal` → alimenta el KPI de facturado (`sqlFacturadoEnRango`).
 *   - `valor_total`             → base de cartera, dashboard y el talonario impreso.
 *   - `pendiente`               → derivado: max(0, valor_total - abono). La ODP no tiene pagos,
 *                                 así que cae al total nuevo.
 * `estado_caja` se recalcula con el mismo criterio de `recalcularFinanciero`
 * (contabilidad.controller) para no divergir: con abono 0 y pendiente > 0 se queda en PENDIENTE,
 * y un CREDITO_APROBADO nunca se degrada. Aquí no cambia, pero se recalcula igual por si el
 * script se corriera sobre un estado distinto al diagnosticado.
 *
 * Verificado antes de escribir (script `2026-09-11_consultar_odp24317.ts`): la ODP no tiene
 * ítems, ni pagos, ni facturas adicionales, ni salida de almacén, ni cotización ligada — no hay
 * nada aguas abajo que recalcular.
 *
 * ORDEN: se hace en un solo UPDATE transaccional a propósito. Por la vía HTTP habría que bajar
 * primero la FE y después el total, porque `updateODP` rechaza un `valor_total` por debajo de lo
 * ya facturado (odp.controller.ts ~954). Escribiendo ambos a la vez el invariante nunca se viola;
 * se valida explícitamente abajo de todos modos.
 *
 * Se escribe por el MODELO (no SQL crudo) para que disparen los hooks de auditoría. Como el
 * script corre fuera de un request, se abre un `requestContext` firmado con el nombre del script:
 * la fila de `auditoria_log` queda trazable sin atribuirse a ninguna persona.
 *
 * Idempotente: si los montos ya están corregidos, no escribe.
 *
 * Uso:
 *   ./backend-api/node_modules/.bin/ts-node backend-api/src/scripts/2026-09-11_corregir_monto_odp24317.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: 'backend-api/.env' });

import { QueryTypes } from 'sequelize';
import { ODP, FacturaAdicionalODP, sequelize } from '../models';
import { requestContext } from '../utils/requestContext';

const NUMERO_ODP = 'ODP-24317';
const FE_ESPERADA = '7460';
const MONTO_CORRECTO = 594766;

const kpiSeptiembre = async () => {
  const r: any[] = await sequelize.query(`
    SELECT COUNT(*) AS num_fe, COALESCE(SUM(t.monto), 0) AS facturado FROM (
      SELECT COALESCE(o.monto_factura_principal, o.valor_total) AS monto FROM odp o
       WHERE o.estado_facturacion = 'FACTURADA' AND o.factura_electronica IS NOT NULL
         AND o.fecha_factura::date BETWEEN '2026-09-01' AND '2026-09-30'
      UNION ALL
      SELECT fa.monto FROM facturas_adicionales_odp fa JOIN odp o ON o.id = fa.odp_id
       WHERE o.estado_facturacion = 'FACTURADA'
         AND fa.fecha_factura::date BETWEEN '2026-09-01' AND '2026-09-30'
    ) t
  `, { type: QueryTypes.SELECT });
  return r[0];
};

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
    estado_facturacion: odp.getDataValue('estado_facturacion'),
    factura_electronica: odp.getDataValue('factura_electronica'),
  };
  console.log(`═══ ANTES — ${NUMERO_ODP} (id ${odpId}) ═══`);
  console.table([antes]);
  console.log('KPI facturado septiembre 2026 (antes):', await kpiSeptiembre());

  // ── Guardas: no corregir a ciegas si el registro no es el diagnosticado ──
  if (antes.factura_electronica !== FE_ESPERADA) {
    throw new Error(`FE inesperada: se esperaba ${FE_ESPERADA} y la ODP tiene ${antes.factura_electronica}`);
  }
  const sumAdicionales = Number(await FacturaAdicionalODP.sum('monto', { where: { odp_id: odpId } })) || 0;
  if (sumAdicionales > 0) {
    throw new Error(`La ODP tiene facturas adicionales por ${sumAdicionales}; revisar a mano antes de bajar el total.`);
  }
  if (antes.abono > MONTO_CORRECTO) {
    throw new Error(`El abono registrado (${antes.abono}) supera el monto corregido (${MONTO_CORRECTO}).`);
  }
  // Invariante de facturación: principal + adicionales <= valor_total
  if (MONTO_CORRECTO + sumAdicionales > MONTO_CORRECTO + 0.01) {
    throw new Error('Invariante de facturación violado.');
  }

  const nuevoPendiente = Math.max(0, MONTO_CORRECTO - antes.abono);
  // Mismo criterio que recalcularFinanciero (contabilidad.controller.ts)
  let nuevoEstadoCaja: string = antes.estado_caja;
  if (antes.estado_caja !== 'CREDITO_APROBADO') {
    if (nuevoPendiente <= 0) nuevoEstadoCaja = 'CANCELADO';
    else if (antes.abono > 0) nuevoEstadoCaja = 'ABONADO';
    else nuevoEstadoCaja = 'PENDIENTE';
  } else if (nuevoPendiente <= 0) {
    nuevoEstadoCaja = 'CANCELADO';
  }

  const sinCambios =
    antes.valor_total === MONTO_CORRECTO &&
    antes.monto_factura_principal === MONTO_CORRECTO &&
    antes.pendiente === nuevoPendiente &&
    antes.estado_caja === nuevoEstadoCaja;

  if (sinCambios) {
    console.log('\n✓ Sin cambios: los montos ya están corregidos.');
    return;
  }

  const transaction = await sequelize.transaction();
  try {
    await odp.update({
      valor_total: MONTO_CORRECTO,
      monto_factura_principal: MONTO_CORRECTO,
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
    monto_factura_principal: fresca!.getDataValue('monto_factura_principal'),
    abono: fresca!.getDataValue('abono'),
    pendiente: fresca!.getDataValue('pendiente'),
    estado_caja: fresca!.getDataValue('estado_caja'),
    estado_facturacion: fresca!.getDataValue('estado_facturacion'),
    factura_electronica: fresca!.getDataValue('factura_electronica'),
  }]);
  console.log('KPI facturado septiembre 2026 (después):', await kpiSeptiembre());

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
        { userId: null, userName: 'script 2026-09-11_corregir_monto_odp24317', ip: null },
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
