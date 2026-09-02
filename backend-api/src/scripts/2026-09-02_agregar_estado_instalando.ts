/**
 * Script: 2026-09-02_agregar_estado_instalando.ts
 *
 * Separa el estado "en proceso" del estado "terminada" en el ciclo de instalación.
 *
 * Antes:  PROGRAMADA → INSTALADA (al pulsar Iniciar) → ENTREGADA (al Finalizar)
 *         INSTALADA servía a la vez de "se está instalando" y de "ya se instaló",
 *         según se hubiera llegado por ruta o por marcado manual.
 *
 * Después: PROGRAMADA → INSTALANDO (Iniciar) → ENTREGADA (Finalizar)
 *          LISTO_INSTALAR → INSTALADA  (marcado manual = terminada)
 *          PAUSADA → INSTALADA         (padre reactivado tras reproceso = terminada)
 *
 * Hace dos cosas:
 *   FASE 1 — añade 'INSTALANDO' al ENUM de Postgres, justo antes de 'INSTALADA' para que
 *            el orden del tipo siga el flujo real (el listado ODP ordena por esa columna).
 *            No hay CHECK CONSTRAINT sobre estado_produccion: el ENUM es la única
 *            validación, así que no hay que recrear ninguna restricción.
 *   FASE 2 — migra a INSTALANDO solo las ODP que quedaron a medias en el flujo de ruta,
 *            es decir aquellas cuya última entrada a INSTALADA vino de PROGRAMADA y no
 *            es una reactivación por reproceso.
 *
 * El historial (`historial_estados_odp`) NO se reescribe: sus registros son hechos
 * ocurridos bajo la semántica anterior y falsearlos borraría la trazabilidad.
 *
 * Ejecutar: npx ts-node src/scripts/2026-09-02_agregar_estado_instalando.ts
 * Idempotente: puede correrse más de una vez sin efectos adicionales.
 */

import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';

const NUEVO = 'INSTALANDO';

// Una ODP quedó "a medias" si su última llegada a INSTALADA vino del flujo de ruta
// (desde PROGRAMADA, o sea alguien pulsó Iniciar) y nunca se finalizó.
const SQL_CANDIDATAS = `
  SELECT o.id, o.numero_odp, h.estado_anterior, h.fecha,
         (SELECT COUNT(*)::int FROM ruta_odp r WHERE r.odp_id = o.id) AS paradas
    FROM odp o
    JOIN LATERAL (
      SELECT estado_anterior, observacion, fecha
        FROM historial_estados_odp
       WHERE odp_id = o.id AND estado_nuevo = 'INSTALADA'
       ORDER BY fecha DESC LIMIT 1
    ) h ON TRUE
   WHERE o.estado_produccion::text = 'INSTALADA'
     AND h.estado_anterior = 'PROGRAMADA'
     AND COALESCE(h.observacion, '') NOT ILIKE 'Reactivada: reproceso%'
   ORDER BY o.numero_odp`;

async function run() {
  console.log('=== Alta del estado INSTALANDO — 2026-09-02 ===\n');

  // ─── FASE 1: el tipo ───────────────────────────────────────────────────────
  const yaExiste = await sequelize.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n
       FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'enum_odp_estado_produccion' AND e.enumlabel = :nuevo`,
    { type: QueryTypes.SELECT, replacements: { nuevo: NUEVO } }
  );

  if (Number(yaExiste[0].n) > 0) {
    console.log(`FASE 1 · '${NUEVO}' ya existe en el ENUM — nada que hacer.\n`);
  } else {
    // ADD VALUE debe ir en su propia transacción: el valor no puede USARSE en la misma
    // transacción en que se crea, y la FASE 2 lo usa.
    await sequelize.query(
      `ALTER TYPE enum_odp_estado_produccion ADD VALUE '${NUEVO}' BEFORE 'INSTALADA'`
    );
    console.log(`FASE 1 · '${NUEVO}' añadido al ENUM (antes de INSTALADA). ✔\n`);
  }

  const orden = await sequelize.query<{ enumlabel: string }>(
    `SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'enum_odp_estado_produccion' ORDER BY e.enumsortorder`,
    { type: QueryTypes.SELECT }
  );
  console.log('  Orden del ENUM:', orden.map(o => o.enumlabel).join(' · '), '\n');

  // ─── FASE 2: los datos ─────────────────────────────────────────────────────
  const candidatas = await sequelize.query<{
    id: number; numero_odp: string; estado_anterior: string; fecha: Date; paradas: number;
  }>(SQL_CANDIDATAS, { type: QueryTypes.SELECT });

  console.log(`FASE 2 · ODPs a migrar INSTALADA → ${NUEVO}: ${candidatas.length}`);
  if (candidatas.length === 0) {
    console.log('  (ninguna — ya migradas o no hay casos)\n');
  } else {
    for (const c of candidatas) {
      console.log(`     ${c.numero_odp.padEnd(11)} desde ${c.estado_anterior}  ` +
        `${new Date(c.fecha).toLocaleDateString('es-CO')}  paradas:${c.paradas}`);
    }

    const t = await sequelize.transaction();
    try {
      const ids = candidatas.map(c => c.id);
      await sequelize.query(
        `UPDATE odp SET estado_produccion = :nuevo WHERE id IN (:ids)`,
        { replacements: { nuevo: NUEVO, ids }, transaction: t }
      );
      // Deja rastro del cambio de criterio en el historial de cada ODP.
      // usuario_id es NOT NULL, así que se atribuye al usuario ROOT del sistema:
      // el cambio lo hace la migración, no una persona.
      const root = await sequelize.query<{ id: number }>(
        `SELECT id FROM usuarios WHERE rol = 'root' ORDER BY id LIMIT 1`,
        { type: QueryTypes.SELECT, transaction: t }
      );
      if (!root.length) throw new Error('No existe un usuario con rol root para atribuir el cambio.');

      await sequelize.query(
        `INSERT INTO historial_estados_odp (odp_id, estado_anterior, estado_nuevo, usuario_id, fecha, observacion)
         SELECT id, 'INSTALADA', :nuevo, :uid, NOW(),
                'Reclasificada por la separación de estados: la instalación se inició pero nunca se finalizó en la app.'
           FROM odp WHERE id IN (:ids)`,
        { replacements: { nuevo: NUEVO, uid: root[0].id, ids }, transaction: t }
      );
      await t.commit();
      console.log(`\n  ${candidatas.length} ODP(s) migradas y registradas en el historial. ✔\n`);
    } catch (e) {
      await t.rollback();
      throw e;
    }
  }

  // ─── Resumen ───────────────────────────────────────────────────────────────
  const resumen = await sequelize.query<{ estado_produccion: string; n: string }>(
    `SELECT estado_produccion::text, COUNT(*)::text AS n
       FROM odp WHERE estado_produccion::text IN ('PROGRAMADA','INSTALANDO','INSTALADA','ENTREGADA')
      GROUP BY 1 ORDER BY 1`,
    { type: QueryTypes.SELECT }
  );
  console.log('Distribución final:');
  resumen.forEach(r => console.log(`  ${r.estado_produccion.padEnd(12)} ${r.n.padStart(4)}`));

  await sequelize.close();
  console.log('\n=== Migración terminada ===');
}

run().catch(async (e) => {
  console.error('\n✘ Error en la migración:', e);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
