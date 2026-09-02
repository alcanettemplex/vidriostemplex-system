/**
 * Script one-off — 2026-09-02
 *
 * Elimina el Pedido PV 7076 (id=572) de la ODP-24302 (id=546) y desconecta la ODP
 * de la ruta de Pedidos PV limpiando `proveedor_vidrio` y `numero_pedido_proveedor`.
 *
 * Motivo: la ODP no tiene ningún pedido externo de vidrio. El PV se generó
 * automáticamente al crear la ODP con `proveedor_vidrio = 'Otros'`
 * (odp.controller.ts, auto-create en createODP). Los 3 ítems de vidrio de la ODP
 * se producen en casa (`prod = 'CR'`, `pedido_pv_id = null`).
 *
 * Impacto de dejarlo como está: `odp.controller.ts` bloquea el auto-avance a
 * LISTO_INSTALAR mientras exista un PV en PENDIENTE/ENVIADO/CONFIRMADO_PROVEEDOR.
 *
 * Por qué también se limpia `proveedor_vidrio`: si el campo queda con valor, una
 * edición que lo borre y lo vuelva a asignar dispara el auto-create de updateODP
 * y reaparece un PV nuevo. Dejarlo en NULL hace el cambio definitivo.
 *
 * Nota de numeración: 7076 es el `numero_base` más alto de la tabla, así que el
 * próximo PV automático volverá a numerarse 7076. Es correcto: este pedido nunca
 * se envió al proveedor (sin fecha_envio, sin factura_pv, sin confirmación), por
 * lo que no queda hueco ni número quemado en la numeración física.
 *
 * Seguridad:
 *  - Valida precondiciones y aborta sin escribir nada si alguna falla (idempotente).
 *  - Opera por INSTANCIA (no SQL crudo) para que los hooks de `MODELOS_AUDITADOS`
 *    graben el DELETE/UPDATE en `auditoria_log`.
 *  - `pedido_pv` está en TABLAS_AUDITABLES (root.controller.ts) → revertible desde
 *    el panel ROOT → Auditoría.
 *
 * Ejecutar:  npx ts-node src/scripts/2026-09-02_eliminar_pedidopv_7076_odp24302.ts
 */
import { sequelize, ODP, ODPItem, PedidoPV, AuditoriaLog } from '../models';
import { requestContext } from '../utils/requestContext';

const PV_ID = 572;
const PV_NUMERO = '7076';
const ODP_ID = 546;
const ODP_NUMERO = 'ODP-24302';

async function ejecutar() {
  // ── 1. Precondiciones ───────────────────────────────────────────────────────
  const pv = await PedidoPV.findByPk(PV_ID);
  if (!pv) {
    console.log(`⏭️  El PedidoPV id=${PV_ID} ya no existe. Nada que hacer.`);
    return false;
  }

  const pvData = pv.toJSON() as any;
  if (pvData.numero_pedido !== PV_NUMERO || pvData.odp_id !== ODP_ID) {
    throw new Error(
      `ABORTADO: el PV id=${PV_ID} no coincide con lo esperado. ` +
      `Esperado numero_pedido=${PV_NUMERO}/odp_id=${ODP_ID}, ` +
      `encontrado ${pvData.numero_pedido}/${pvData.odp_id}.`
    );
  }

  // Si el pedido ya salió al proveedor, borrarlo destruiría un compromiso real.
  if (pvData.estado !== 'PENDIENTE') {
    throw new Error(
      `ABORTADO: el PV ${PV_NUMERO} está en estado ${pvData.estado}, ya no es PENDIENTE. ` +
      `Puede haberse enviado al proveedor. Revisar manualmente antes de borrar.`
    );
  }

  const itemsAsignados = await ODPItem.count({ where: { pedido_pv_id: PV_ID } });
  if (itemsAsignados > 0) {
    throw new Error(
      `ABORTADO: el PV ${PV_NUMERO} tiene ${itemsAsignados} ítem(s) asignado(s). ` +
      `Desasignarlos desde el módulo Pedidos PV antes de eliminarlo.`
    );
  }

  const odp = await ODP.findByPk(ODP_ID);
  if (!odp) throw new Error(`ABORTADO: no existe la ODP id=${ODP_ID}.`);

  const odpAntes = odp.toJSON() as any;
  if (odpAntes.numero_odp !== ODP_NUMERO) {
    throw new Error(
      `ABORTADO: la ODP id=${ODP_ID} es ${odpAntes.numero_odp}, se esperaba ${ODP_NUMERO}.`
    );
  }

  console.log('── Estado ANTES ──');
  console.log({
    pv: { id: pvData.id, numero_pedido: pvData.numero_pedido, estado: pvData.estado, proveedor: pvData.proveedor },
    odp: {
      numero_odp: odpAntes.numero_odp,
      estado_produccion: odpAntes.estado_produccion,
      proveedor_vidrio: odpAntes.proveedor_vidrio,
      numero_pedido_proveedor: odpAntes.numero_pedido_proveedor,
    },
    items_asignados: itemsAsignados,
  });

  // ── 2. Mutación transaccional ───────────────────────────────────────────────
  const t = await sequelize.transaction();
  try {
    // Defensivo: hoy son 0 filas, pero deja explícita la desvinculación.
    await ODPItem.update(
      { pedido_pv_id: null },
      { where: { pedido_pv_id: PV_ID }, transaction: t }
    );

    await pv.destroy({ transaction: t });

    await odp.update(
      { proveedor_vidrio: null, numero_pedido_proveedor: null },
      { transaction: t }
    );

    await t.commit();
    console.log(`\n✅ PV ${PV_NUMERO} eliminado y ${ODP_NUMERO} desvinculada de la ruta PV.`);
    return true;
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

async function verificar() {
  const pv = await PedidoPV.findByPk(PV_ID);
  const odp = await ODP.findByPk(ODP_ID);
  const pvsDeLaOdp = await PedidoPV.count({ where: { odp_id: ODP_ID } });
  const itemsVidrio = await ODPItem.count({ where: { odp_id: ODP_ID } });
  const odpData = odp?.toJSON() as any;

  console.log('\n── Verificación POST ──');
  console.log({
    pv_7076_existe: !!pv,
    pedidos_pv_de_la_odp: pvsDeLaOdp,
    odp_proveedor_vidrio: odpData?.proveedor_vidrio,
    odp_numero_pedido_proveedor: odpData?.numero_pedido_proveedor,
    odp_estado_produccion: odpData?.estado_produccion,
    items_vidrio_intactos: itemsVidrio,
  });

  const ok =
    !pv &&
    pvsDeLaOdp === 0 &&
    odpData?.proveedor_vidrio === null &&
    odpData?.numero_pedido_proveedor === null &&
    itemsVidrio === 3;
  console.log(ok ? '✅ Verificación OK' : '❌ Verificación FALLIDA');
  return ok;
}

async function verificarAuditoria() {
  // El hook de auditoría hace AuditoriaLog.create() sin await (fire-and-forget),
  // por eso se espera antes de consultar y de cerrar la conexión: un process.exit()
  // inmediato perdería el registro y el borrado quedaría sin rastro.
  await new Promise((r) => setTimeout(r, 2000));

  const registros = await AuditoriaLog.findAll({
    where: { tabla: ['pedido_pv', 'odp'] },
    order: [['id', 'DESC']],
    limit: 5,
    attributes: ['id', 'tabla', 'operacion', 'registro_id', 'usuario_nombre', 'fecha'],
  });

  console.log('\n── Auditoría registrada (últimos 5) ──');
  console.log(JSON.stringify(registros.map((r) => r.toJSON()), null, 2));
}

async function main() {
  const mutado = await requestContext.run(
    {
      userId: null,
      userName: 'Script mantenimiento 2026-09-02 — eliminación PV 7076 de ODP-24302',
      ip: null,
    },
    () => ejecutar()
  );

  await verificar();
  if (mutado) await verificarAuditoria();

  await sequelize.close();
}

main().catch((e) => {
  console.error('\n❌ ERROR:', e.message);
  process.exit(1);
});
