// Corrección puntual solicitada por el usuario para ODP-24202 (id 428):
//   - valor_total quedó cargado en 67.877.368 (casi el doble del real) y debía quedar en
//     33.938.683 (con IVA).
//   - La FE 7469 estaba facturada por el valor_total completo (67.877.368); debía quedar
//     por 25.000.000, que es justo el abono ya registrado (Pago #471, anticipo Bancolombia
//     del 16/jul/2026) — no se registra un pago nuevo, solo se corrige el monto facturado.
//
// Orden obligatorio: primero se baja monto_factura_principal, después valor_total. El
// guard de `updateODP` (odp.controller.ts ~L954) rechaza bajar valor_total por debajo de
// lo ya facturado (monto_factura_principal + adicionales) leyendo el valor ANTERIOR de la
// BD, así que hacerlo en el orden inverso en una sola transacción igual fallaría la
// validación si se replicara tal cual. Se replican aquí las mismas fórmulas que
// facturarODP/updateODP (pendiente = max(0, valor_total - abono), estado_caja derivado)
// para no generar un estado inconsistente con lo que el backend calcularía por su cuenta.
//
// Mismo patrón que 2026-09-15_odp24202_cambiar_cliente.ts: odp.update() dentro de una
// transacción (dispara el hook de auditoría) envuelto en contexto ROOT (id 30).
import { sequelize, ODP, FacturaAdicionalODP } from '../models';
import { requestContext } from '../utils/requestContext';

const NUMERO_ODP = 'ODP-24202';
const VALOR_TOTAL_ESPERADO_ANTES = 67877368;
const MONTO_FE_ESPERADO_ANTES = 67877368;
const FE_ESPERADA = '7469';
const ABONO_ESPERADO = 25000000;

const NUEVO_VALOR_TOTAL = 33938683;
const NUEVO_MONTO_FE = 25000000;

async function main() {
  await requestContext.run({ userId: 30, userName: 'ROOT System', ip: null }, async () => {
    const t = await sequelize.transaction();
    try {
      const odp = await ODP.findOne({ where: { numero_odp: NUMERO_ODP }, transaction: t });
      if (!odp) throw new Error(`${NUMERO_ODP} no encontrada`);

      // Salvaguarda: si el estado real difiere de lo verificado a mano antes de este
      // script, se aborta en vez de aplicar un cambio sobre supuestos desactualizados.
      const valorTotalActual = Number(odp.getDataValue('valor_total'));
      const montoFeActual = Number(odp.getDataValue('monto_factura_principal'));
      const feActual = odp.getDataValue('factura_electronica');
      const abonoActual = Number(odp.getDataValue('abono'));
      if (
        valorTotalActual !== VALOR_TOTAL_ESPERADO_ANTES ||
        montoFeActual !== MONTO_FE_ESPERADO_ANTES ||
        feActual !== FE_ESPERADA ||
        abonoActual !== ABONO_ESPERADO
      ) {
        throw new Error(
          `Estado actual no coincide con lo esperado (valor_total=${valorTotalActual}, monto_factura_principal=${montoFeActual}, ` +
          `factura_electronica=${feActual}, abono=${abonoActual}). Abortando sin tocar nada — revisar a mano.`
        );
      }

      const sumAdicionales = Number(await FacturaAdicionalODP.sum('monto', { where: { odp_id: odp.getDataValue('id') } })) || 0;
      if (sumAdicionales !== 0) {
        throw new Error(`Hay facturas adicionales (suma=${sumAdicionales}) que este script no contempla. Abortando.`);
      }

      // Paso 1: bajar el monto de la FE principal (25.000.000 <= valor_total actual, pasa
      // la misma validación que aplicaría facturarODP).
      await odp.update({ monto_factura_principal: NUEVO_MONTO_FE }, { transaction: t });

      // Paso 2: bajar valor_total (ya no choca con el guard: monto_factura_principal ya
      // quedó en 25.000.000, por debajo del nuevo valor_total de 33.938.683) y recalcular
      // pendiente/estado_caja con la misma fórmula de updateODP.
      const nuevoPendiente = Math.max(0, NUEVO_VALOR_TOTAL - ABONO_ESPERADO);
      const nuevoEstadoCaja = nuevoPendiente <= 0 ? 'CANCELADO' : (ABONO_ESPERADO > 0 ? 'ABONADO' : 'PENDIENTE');
      await odp.update(
        { valor_total: NUEVO_VALOR_TOTAL, pendiente: nuevoPendiente, estado_caja: nuevoEstadoCaja },
        { transaction: t }
      );

      await t.commit();

      console.log(`${NUMERO_ODP} corregida:`);
      console.log(`  valor_total: ${VALOR_TOTAL_ESPERADO_ANTES} -> ${NUEVO_VALOR_TOTAL}`);
      console.log(`  monto_factura_principal (FE ${FE_ESPERADA}): ${MONTO_FE_ESPERADO_ANTES} -> ${NUEVO_MONTO_FE}`);
      console.log(`  abono: ${ABONO_ESPERADO} (sin cambios)`);
      console.log(`  pendiente: ${nuevoPendiente}`);
      console.log(`  estado_caja: ${nuevoEstadoCaja}`);
    } catch (err) {
      await t.rollback();
      throw err;
    }
  });

  // Dar tiempo a que el hook afterUpdate (fire-and-forget) termine de escribir la auditoría.
  await new Promise((r) => setTimeout(r, 1000));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
