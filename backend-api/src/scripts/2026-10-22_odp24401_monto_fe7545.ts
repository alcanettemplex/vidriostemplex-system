// Corrección puntual solicitada por el usuario para ODP-24401 (id 655):
//   La FE 7545 (08/10/2026) se emitió por 244.000 según el reporte "Ventas por Documento" de
//   contabilidad, pero en el ERP quedó por 242.073 — igual que el valor_total y el único pago
//   registrado (#834, Bancolombia ref. 57917). Era la única diferencia de monto entre el
//   reporte del contador y la tarjeta "Facturados" del Dashboard en octubre.
//
// Decisión del usuario: "organizar todo al valor de 244.000" — valor_total, monto de la FE,
// el pago #834 y el abono quedan en 244.000; pendiente 0 y estado_caja sigue CANCELADO.
//
// Orden: primero valor_total y después monto_factura_principal, para no dejar en ningún
// momento una FE mayor que el valor de la ODP (el guard de updateODP/facturarODP). Todo en
// una transacción con el modelo, para que el hook de auditoría registre cada cambio.
//
// EJECUCIÓN (one-off, ya ejecutado el 2026-10-22):
//   backend-api/node_modules/.bin/ts-node --project backend-api/tsconfig.json \
//     backend-api/src/scripts/2026-10-22_odp24401_monto_fe7545.ts
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { sequelize, ODP, Pago, FacturaAdicionalODP } from '../models';
import { requestContext } from '../utils/requestContext';

const NUMERO_ODP = 'ODP-24401';
const FE_ESPERADA = '7545';
const PAGO_ID = 834;
const VALOR_ANTES = 242073;
const VALOR_NUEVO = 244000;

async function main() {
  await requestContext.run({ userId: null, userName: 'SCRIPT 2026-10-22_odp24401_monto_fe7545', ip: null }, async () => {
    const t = await sequelize.transaction();
    try {
      const odp = await ODP.findOne({ where: { numero_odp: NUMERO_ODP }, transaction: t });
      if (!odp) throw new Error(`${NUMERO_ODP} no encontrada`);
      const odpId = odp.getDataValue('id');

      // Salvaguarda: si algo cambió desde la revisión a mano, abortar sin tocar nada.
      const actual = {
        valor_total: Number(odp.getDataValue('valor_total')),
        monto_factura_principal: Number(odp.getDataValue('monto_factura_principal')),
        abono: Number(odp.getDataValue('abono')),
        factura_electronica: odp.getDataValue('factura_electronica'),
        estado_caja: odp.getDataValue('estado_caja'),
      };
      console.log('Antes:', actual);
      if (actual.valor_total !== VALOR_ANTES || actual.monto_factura_principal !== VALOR_ANTES ||
          actual.abono !== VALOR_ANTES || actual.factura_electronica !== FE_ESPERADA) {
        throw new Error('El estado actual no coincide con lo revisado. Abortando sin tocar nada.');
      }

      const pagos = await Pago.findAll({ where: { odp_id: odpId }, transaction: t });
      if (pagos.length !== 1 || pagos[0].getDataValue('id') !== PAGO_ID ||
          Number(pagos[0].getDataValue('monto')) !== VALOR_ANTES) {
        throw new Error(`Se esperaba un único pago #${PAGO_ID} por ${VALOR_ANTES}. Abortando.`);
      }

      const adicionales = await FacturaAdicionalODP.count({ where: { odp_id: odpId }, transaction: t });
      if (adicionales !== 0) throw new Error('La ODP tiene facturas adicionales que este script no contempla. Abortando.');

      await odp.update({ valor_total: VALOR_NUEVO }, { transaction: t });
      await odp.update({ monto_factura_principal: VALOR_NUEVO }, { transaction: t });
      await pagos[0].update({ monto: VALOR_NUEVO }, { transaction: t });
      await odp.update({ abono: VALOR_NUEVO, pendiente: 0, estado_caja: 'CANCELADO' }, { transaction: t });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  });

  const verif = await ODP.findOne({ where: { numero_odp: NUMERO_ODP } });
  const pago = await Pago.findByPk(PAGO_ID);
  console.log('Después:', {
    valor_total: verif!.getDataValue('valor_total'),
    monto_factura_principal: verif!.getDataValue('monto_factura_principal'),
    abono: verif!.getDataValue('abono'),
    pendiente: verif!.getDataValue('pendiente'),
    estado_caja: verif!.getDataValue('estado_caja'),
    pago_834: pago!.getDataValue('monto'),
  });

  // Dar tiempo a que el hook afterUpdate (fire-and-forget) termine de escribir la auditoría.
  await new Promise((r) => setTimeout(r, 1000));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
