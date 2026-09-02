/**
 * Script one-off — 2026-09-02
 *
 * Cierra cuatro instalaciones que ya se entregaron al cliente pero que el sistema seguía
 * mostrando como pendientes:
 *
 *   ODP-24228 (id 456) — ruta 379
 *   ODP-24171 (id 395) — ruta 381
 *   ODP-24106 (id 333) — ruta 380
 *   ODP-24066 (id 286) — ruta 337
 *
 * Motivo: las cuatro siguieron el mismo camino —LISTO_INSTALAR → PROGRAMADA → INSTALADA→
 * y al terminar la jornada el instalador PAUSÓ la instalación. La pausa devuelve la ODP a
 * LISTO_INSTALAR y deja la parada en 'pausada'; nadie la retomó. Quedaron en un limbo:
 * no aparecen en Instalaciones (no están programadas) ni en el panel "Pendientes de cierre"
 * (getODPsAtascadas solo levanta INSTALANDO / PROGRAMADA / INSTALADA, y ESTADOS_RESCATABLES
 * excluye LISTO_INSTALAR), así que no había forma de cerrarlas desde la aplicación.
 *
 * Qué hace, replicando `entregarAtascada` (rutas.controller.ts):
 *   1. La parada de la ruta viva → 'completada' con fin_instalacion.
 *   2. La ruta → 'completada' con fin_ruta. Cada una de las 4 rutas contiene una sola
 *      parada —la de su ODP— así que cerrarla no afecta a ninguna otra orden.
 *   3. La ODP → ENTREGADA, con su registro en historial_estados_odp.
 *
 * Qué NO hace: no toca las 9 paradas residuales que estas ODP arrastran de reprogramaciones
 * anteriores, todas colgando de rutas ya canceladas o completadas. El ENUM de ruta_odp.estado
 * no tiene 'cancelada' —solo pendiente|en_curso|pausada|completada|con_dano— y marcarlas
 * 'completada' afirmaría una instalación que nunca ocurrió. Al pasar la ODP a ENTREGADA
 * ninguna consulta viva las levanta.
 *
 * Ninguna de las cuatro es No Conformidad ni tiene ODP padre, así que no hay padre que
 * reactivar (el caso que sí contempla entregarAtascada).
 *
 * Seguridad:
 *  - Valida precondiciones por ODP y la salta sin escribir si alguna falla (idempotente).
 *  - Una transacción por ODP: un fallo aislado no arrastra a las demás.
 *  - Opera por INSTANCIA para que los hooks de `MODELOS_AUDITADOS` graben en `auditoria_log`.
 *  - Atribuido a ROOT (id 30) vía requestContext, para que el cambio no quede sin autor.
 *
 * Ejecutar:  npx ts-node src/scripts/2026-09-02_cerrar_entregadas_4odp.ts
 */
import { sequelize, ODP, RutaODP, RutaInstalacion, HistorialEstadoODP, AuditoriaLog } from '../models';
import { requestContext } from '../utils/requestContext';

const USUARIO_ROOT = 30;

const CASOS = [
  { odp_id: 456, numero_odp: 'ODP-24228', ruta_id: 379, ruta_odp_id: 426 },
  { odp_id: 395, numero_odp: 'ODP-24171', ruta_id: 381, ruta_odp_id: 428 },
  { odp_id: 333, numero_odp: 'ODP-24106', ruta_id: 380, ruta_odp_id: 427 },
  { odp_id: 286, numero_odp: 'ODP-24066', ruta_id: 337, ruta_odp_id: 375 },
];

const OBSERVACION = (ruta: number) =>
  `Cierre administrativo (script 2026-09-02): instalación entregada al cliente. ` +
  `La pausa de fin de jornada había devuelto la ODP a LISTO_INSTALAR y la dejó fuera del ` +
  `panel de pendientes de cierre (ruta #${ruta}).`;

async function procesar(caso: typeof CASOS[number]) {
  const { odp_id, numero_odp, ruta_id, ruta_odp_id } = caso;

  const odp = await ODP.findByPk(odp_id) as any;
  if (!odp) { console.log(`  ⏭️  ${numero_odp}: no existe la ODP id=${odp_id}.`); return false; }
  if (odp.getDataValue('numero_odp') !== numero_odp) {
    throw new Error(`ABORTADO: la ODP id=${odp_id} es ${odp.getDataValue('numero_odp')}, se esperaba ${numero_odp}.`);
  }

  const estadoAnterior = odp.getDataValue('estado_produccion');
  if (estadoAnterior === 'ENTREGADA') { console.log(`  ⏭️  ${numero_odp}: ya está ENTREGADA.`); return false; }
  if (estadoAnterior !== 'LISTO_INSTALAR') {
    console.log(`  ⏭️  ${numero_odp}: está en ${estadoAnterior}, no en LISTO_INSTALAR. Se omite (revisar a mano).`);
    return false;
  }

  const parada = await RutaODP.findByPk(ruta_odp_id) as any;
  if (!parada || parada.getDataValue('odp_id') !== odp_id || parada.getDataValue('ruta_id') !== ruta_id) {
    throw new Error(`ABORTADO: la parada id=${ruta_odp_id} no corresponde a ${numero_odp} en la ruta ${ruta_id}.`);
  }

  const ruta = await RutaInstalacion.findByPk(ruta_id) as any;
  if (!ruta) throw new Error(`ABORTADO: no existe la ruta id=${ruta_id}.`);

  // Defensivo: cerrar una ruta que hoy tuviera más paradas afectaría a otras ODP.
  const paradasDeLaRuta = await RutaODP.count({ where: { ruta_id } });
  if (paradasDeLaRuta !== 1) {
    throw new Error(
      `ABORTADO: la ruta ${ruta_id} tiene ${paradasDeLaRuta} paradas (se esperaba 1). ` +
      `Cerrarla afectaría a otras ODP.`
    );
  }

  console.log(`  ANTES → ${numero_odp}: odp=${estadoAnterior}, parada=${parada.getDataValue('estado')}, ruta=${ruta.getDataValue('estado')}`);

  const ahora = new Date();
  const t = await sequelize.transaction();
  try {
    await parada.update({ estado: 'completada', fin_instalacion: ahora }, { transaction: t });
    await ruta.update({ estado: 'completada', fin_ruta: ahora }, { transaction: t });
    await odp.update({ estado_produccion: 'ENTREGADA' }, { transaction: t });

    await HistorialEstadoODP.create({
      odp_id,
      estado_anterior: estadoAnterior,
      estado_nuevo: 'ENTREGADA',
      usuario_id: USUARIO_ROOT,
      fecha: ahora,
      observacion: OBSERVACION(ruta_id),
    }, { transaction: t });

    await t.commit();
    console.log(`  ✅ ${numero_odp}: ENTREGADA, parada y ruta #${ruta_id} cerradas.`);
    return true;
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

async function ejecutar() {
  let mutadas = 0;
  for (const caso of CASOS) {
    console.log(`\n── ${caso.numero_odp} ──`);
    if (await procesar(caso)) mutadas++;
  }
  return mutadas;
}

async function verificar() {
  console.log('\n── Verificación POST ──');
  let ok = true;

  for (const c of CASOS) {
    const odp = await ODP.findByPk(c.odp_id) as any;
    const parada = await RutaODP.findByPk(c.ruta_odp_id) as any;
    const ruta = await RutaInstalacion.findByPk(c.ruta_id) as any;

    const estadoOdp = odp?.getDataValue('estado_produccion');
    const estadoParada = parada?.getDataValue('estado');
    const estadoRuta = ruta?.getDataValue('estado');
    const bien = estadoOdp === 'ENTREGADA' && estadoParada === 'completada' && estadoRuta === 'completada';
    if (!bien) ok = false;

    console.log(`  ${bien ? '✅' : '❌'} ${c.numero_odp}: odp=${estadoOdp}, parada=${estadoParada}, ruta=${estadoRuta}`);
  }

  // Las residuales se dejan a propósito: se informan para que quede constancia.
  const residuales: any[] = await sequelize.query(
    `SELECT o.numero_odp, COUNT(*) AS paradas_abiertas
       FROM ruta_odp ro JOIN odp o ON o.id = ro.odp_id
      WHERE ro.odp_id IN (:ids) AND ro.estado IN ('pendiente','en_curso','pausada','con_dano')
      GROUP BY o.numero_odp ORDER BY o.numero_odp`,
    { replacements: { ids: CASOS.map((c) => c.odp_id) }, type: (require('sequelize') as any).QueryTypes.SELECT }
  );
  console.log('\n  Paradas residuales que se dejan abiertas (rutas canceladas/completadas):');
  console.log('  ', JSON.stringify(residuales));

  console.log(ok ? '\n✅ Verificación OK' : '\n❌ Verificación FALLIDA');
  return ok;
}

async function verificarAuditoria() {
  // El hook de auditoría hace AuditoriaLog.create() sin await (fire-and-forget): se espera
  // antes de consultar y de cerrar la conexión para no perder los registros.
  await new Promise((r) => setTimeout(r, 2500));

  const registros = await AuditoriaLog.findAll({
    where: { tabla: ['odp', 'ruta_odp', 'rutas_instalacion'] },
    order: [['id', 'DESC']],
    limit: 12,
    attributes: ['id', 'tabla', 'operacion', 'registro_id', 'usuario_id', 'fecha'],
  });

  console.log('\n── Auditoría registrada (últimos 12) ──');
  console.log(JSON.stringify(registros.map((r) => r.toJSON()), null, 1));
}

async function main() {
  const mutadas = await requestContext.run(
    {
      userId: USUARIO_ROOT,
      userName: 'Script mantenimiento 2026-09-02 — cierre de 4 instalaciones entregadas',
      ip: null,
    },
    () => ejecutar()
  );

  await verificar();
  if (mutadas > 0) await verificarAuditoria();

  await sequelize.close();
}

main().catch(async (e) => {
  console.error('\n❌ ERROR:', e.message);
  await sequelize.close();
  process.exit(1);
});
