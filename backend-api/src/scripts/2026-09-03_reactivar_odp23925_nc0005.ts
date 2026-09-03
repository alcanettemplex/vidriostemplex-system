/**
 * Script one-off — 2026-09-03
 *
 * Reactiva ODP-23925 (id 136), que quedó huérfana en PAUSADA desde el 21-may-2026 pese a
 * que su reproceso de No Conformidad, ODP-24002 (NC-0005, id 219), está ENTREGADA desde el
 * 01-jun-2026.
 *
 * Causa raíz: la regla automática de odp.controller.ts (`updateODP`) solo reactiva al padre
 * cuando la actualización que llega fija el valor exacto `estado_produccion: 'INSTALADA'`
 * en la hija. El historial de ODP-24002 no tiene ningún registro con estado_nuevo=INSTALADA:
 * saltó directo de PROGRAMADA a ENTREGADA en una sola actualización manual (observación null,
 * o sea no vino de rutas.controller.ts ni de evidencia.controller.ts, que sí contemplan este
 * caso). Al no calzar el valor exacto, la regla nunca corrió.
 *
 * Este script deja a ODP-23925 en el mismo estado (`INSTALADA`) al que habría llegado si la
 * regla automática hubiera funcionado — igual que sus 7 hermanas de otras NC que sí se
 * reactivaron correctamente (OA-3833, ODP-24164, ODP-23978, ODP-23957 x2, ODP-23963,
 * ODP-23877, ODP-23882). No la pasa a ENTREGADA: por diseño del sistema (ver
 * 2026-09-02_agregar_estado_instalando.ts), "padre reactivado tras reproceso" aterriza en
 * INSTALADA y ese es su estado terminal — ENTREGADA no es un paso posterior esperado aquí.
 *
 * El fix de código que evita que esto se repita va en el mismo commit
 * (odp.controller.ts y rutas.controller.ts).
 *
 * Seguridad:
 *  - Valida la precondición (debe seguir en PAUSADA) antes de escribir; si ya no lo está,
 *    se salta sin tocar nada (idempotente).
 *  - Transaccional.
 *  - Opera por INSTANCIA para que el hook de MODELOS_AUDITADOS grabe en auditoria_log.
 *  - Atribuido a ROOT (id 30) vía requestContext, para que el cambio no quede sin autor.
 *
 * Ejecutar:  npx ts-node src/scripts/2026-09-03_reactivar_odp23925_nc0005.ts
 */
import { sequelize, ODP, HistorialEstadoODP, AuditoriaLog } from '../models';
import { requestContext } from '../utils/requestContext';

const USUARIO_ROOT = 30;
const ODP_ID = 136;
const NUMERO_ODP = 'ODP-23925';

const OBSERVACION =
  'Corrección retroactiva (script 2026-09-03): la reactivación automática nunca se disparó ' +
  'porque el reproceso ODP-24002 (NC-0005) saltó de PROGRAMADA a ENTREGADA sin pasar por ' +
  'INSTALADA como paso explícito, y la regla vigente solo comparaba ese valor exacto. El ' +
  'reproceso está entregado desde el 01-jun-2026; esta ODP quedó huérfana en PAUSADA desde ' +
  'el 21-may-2026. Fix de la regla en el mismo commit (odp.controller.ts / rutas.controller.ts).';

async function ejecutar() {
  const odp = await ODP.findByPk(ODP_ID) as any;
  if (!odp) { console.log(`⏭️  No existe la ODP id=${ODP_ID}.`); return false; }
  if (odp.getDataValue('numero_odp') !== NUMERO_ODP) {
    throw new Error(`ABORTADO: la ODP id=${ODP_ID} es ${odp.getDataValue('numero_odp')}, se esperaba ${NUMERO_ODP}.`);
  }

  const estadoAnterior = odp.getDataValue('estado_produccion');
  if (estadoAnterior === 'INSTALADA' || estadoAnterior === 'ENTREGADA') {
    console.log(`⏭️  ${NUMERO_ODP}: ya está en ${estadoAnterior} — nada que hacer.`);
    return false;
  }
  if (estadoAnterior !== 'PAUSADA') {
    throw new Error(`ABORTADO: ${NUMERO_ODP} está en ${estadoAnterior}, no en PAUSADA. Revisar a mano.`);
  }

  console.log(`ANTES → ${NUMERO_ODP}: estado_produccion=${estadoAnterior}`);

  const t = await sequelize.transaction();
  try {
    await odp.update({ estado_produccion: 'INSTALADA' }, { transaction: t });
    await HistorialEstadoODP.create({
      odp_id: ODP_ID,
      estado_anterior: estadoAnterior,
      estado_nuevo: 'INSTALADA',
      usuario_id: USUARIO_ROOT,
      fecha: new Date(),
      observacion: OBSERVACION,
    }, { transaction: t });

    await t.commit();
    console.log(`✅ ${NUMERO_ODP}: PAUSADA → INSTALADA.`);
    return true;
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

async function verificar() {
  console.log('\n── Verificación POST ──');
  const odp = await ODP.findByPk(ODP_ID) as any;
  const estado = odp?.getDataValue('estado_produccion');
  const bien = estado === 'INSTALADA';
  console.log(`  ${bien ? '✅' : '❌'} ${NUMERO_ODP}: estado_produccion=${estado}`);
  return bien;
}

async function verificarAuditoria() {
  // El hook de auditoría hace AuditoriaLog.create() sin await (fire-and-forget): se espera
  // antes de consultar y de cerrar la conexión para no perder el registro.
  await new Promise((r) => setTimeout(r, 2500));

  const registros = await AuditoriaLog.findAll({
    where: { tabla: 'odp', registro_id: String(ODP_ID) }, // registro_id es STRING(100) en el modelo
    order: [['id', 'DESC']],
    limit: 3,
    attributes: ['id', 'tabla', 'operacion', 'registro_id', 'usuario_id', 'fecha'],
  });

  console.log('\n── Auditoría registrada (últimos 3 de esta ODP) ──');
  console.log(JSON.stringify(registros.map((r) => r.toJSON()), null, 1));
}

async function main() {
  const mutada = await requestContext.run(
    { userId: USUARIO_ROOT, userName: 'Script mantenimiento 2026-09-03 — reactivar ODP-23925 (NC-0005)', ip: null },
    () => ejecutar()
  );

  await verificar();
  if (mutada) await verificarAuditoria();

  await sequelize.close();
}

main().catch(async (e) => {
  console.error('\n❌ ERROR:', e.message);
  await sequelize.close();
  process.exit(1);
});
