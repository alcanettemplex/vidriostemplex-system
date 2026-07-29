/**
 * Script one-off — 2026-07-28
 *
 * Elimina el Pedido PV 6889 (id=388), huérfano: `odp_id IS NULL`.
 *
 * Contexto / causa raíz:
 *  - El PV nació el 2026-06-02 13:38:28 UTC ligado a la ODP id=255 (ODP-24037),
 *    generado por el auto-create de `createODP` (auditoria_log 11585).
 *  - Esa ODP fue borrada FUERA de la aplicación (no hay registro DELETE en
 *    `auditoria_log` y `deleteODP` sí elimina los PedidoPV asociados). La FK
 *    `pedido_pv_odp_id_fkey` es ON DELETE SET NULL, así que el PV sobrevivió
 *    sin vínculo en vez de borrarse con su ODP.
 *  - ODP-24037 se recreó luego como id=256, con su propio PV 6890 (VERIFICADO).
 *    El 6889 quedó sin función: PENDIENTE, sin ítems, sin ODP.
 *  - Efecto visible: aparecía en la tab "Por Gestionar" sin ODP, porque
 *    `getPorGestionar` filtra por estado/origen y hace LEFT JOIN con ODP.
 *
 * No hay campos de ODP que limpiar (a diferencia del script del PV 6958):
 * la ODP de origen ya no existe.
 *
 * Seguridad:
 *  - Valida precondiciones y aborta sin escribir si alguna falla (idempotente).
 *  - Opera por INSTANCIA para que el hook de auditoría grabe el DELETE.
 *  - `pedido_pv` está en TABLAS_AUDITABLES → revertible desde panel ROOT.
 *
 * Ejecutar:  npx ts-node src/scripts/2026-07-28_eliminar_pedidopv_6889_huerfano.ts
 */
import { sequelize, ODPItem, PedidoPV, AuditoriaLog } from '../models';
import { requestContext } from '../utils/requestContext';

const PV_ID = 388;
const PV_NUMERO = '6889';

async function ejecutar() {
  // ── 1. Precondiciones ───────────────────────────────────────────────────────
  const pv = await PedidoPV.findByPk(PV_ID);
  if (!pv) {
    console.log(`⏭️  El PedidoPV id=${PV_ID} ya no existe. Nada que hacer.`);
    return false;
  }

  const d = pv.toJSON() as any;
  if (d.numero_pedido !== PV_NUMERO) {
    throw new Error(
      `ABORTADO: el PV id=${PV_ID} tiene numero_pedido=${d.numero_pedido}, se esperaba ${PV_NUMERO}.`
    );
  }

  // Clave: solo se borra si sigue huérfano. Si alguien lo reasignó a una ODP,
  // ya no es basura y hay que revisarlo a mano.
  if (d.odp_id !== null) {
    throw new Error(
      `ABORTADO: el PV ${PV_NUMERO} ya NO está huérfano — ahora apunta a odp_id=${d.odp_id}. ` +
      `Revisar manualmente antes de borrar.`
    );
  }

  if (d.estado !== 'PENDIENTE') {
    throw new Error(
      `ABORTADO: el PV ${PV_NUMERO} está en estado ${d.estado}, ya no es PENDIENTE. ` +
      `Puede haberse enviado al proveedor.`
    );
  }

  const itemsAsignados = await ODPItem.count({ where: { pedido_pv_id: PV_ID } });
  if (itemsAsignados > 0) {
    throw new Error(
      `ABORTADO: el PV ${PV_NUMERO} tiene ${itemsAsignados} ítem(s) asignado(s).`
    );
  }

  console.log('── Estado ANTES ──');
  console.log({
    id: d.id,
    numero_pedido: d.numero_pedido,
    numero_base: d.numero_base,
    odp_id: d.odp_id,
    proveedor: d.proveedor,
    estado: d.estado,
    origen: d.origen,
    creado_en: d.creado_en,
    items_asignados: itemsAsignados,
  });

  // ── 2. Borrado ──────────────────────────────────────────────────────────────
  const t = await sequelize.transaction();
  try {
    await ODPItem.update(
      { pedido_pv_id: null },
      { where: { pedido_pv_id: PV_ID }, transaction: t }
    );
    await pv.destroy({ transaction: t });
    await t.commit();
    console.log(`\n✅ PV ${PV_NUMERO} (huérfano) eliminado.`);
    return true;
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

async function verificar() {
  const pv = await PedidoPV.findByPk(PV_ID);
  const huerfanos = await PedidoPV.count({ where: { odp_id: null } });
  const total = await PedidoPV.count();

  console.log('\n── Verificación POST ──');
  console.log({
    pv_6889_existe: !!pv,
    pedidos_pv_huerfanos_restantes: huerfanos,
    total_pedidos_pv: total,
  });

  const ok = !pv && huerfanos === 0;
  console.log(ok ? '✅ Verificación OK — no quedan PVs sin ODP' : '❌ Verificación FALLIDA');
  return ok;
}

async function verificarAuditoria() {
  // El hook de auditoría hace AuditoriaLog.create() sin await (fire-and-forget):
  // cerrar la conexión de inmediato perdería el registro.
  await new Promise((r) => setTimeout(r, 2000));

  const registros = await AuditoriaLog.findAll({
    where: { tabla: 'pedido_pv', registro_id: String(PV_ID) },
    order: [['id', 'DESC']],
    attributes: ['id', 'tabla', 'operacion', 'registro_id', 'usuario_nombre', 'fecha'],
  });

  console.log('\n── Auditoría del PV 388 ──');
  console.log(JSON.stringify(registros.map((r) => r.toJSON()), null, 2));
}

async function main() {
  const mutado = await requestContext.run(
    {
      userId: null,
      userName: 'Script mantenimiento 2026-07-28 — eliminación PV huérfano 6889',
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
