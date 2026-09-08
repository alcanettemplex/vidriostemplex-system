/**
 * Script: 2026-09-08_agregar_estado_anulada.ts
 *
 * Agrega el estado ANULADA al ENUM `estado_produccion` de la tabla `odp`.
 *
 * Motivación: hasta ahora la única forma de "quitar de en medio" una ODP que no va a
 * proceder era `DELETE /api/odp/:id` (deleteODP), que borra físicamente la ODP y en
 * cascada sus SAP/ODC, evidencias, historial, notas, cotización, toma de medidas, pagos,
 * ruta y pedido PV. ANULADA es la alternativa no destructiva: conserva el registro y todo
 * su historial, solo cambia `estado_produccion`. Se establece/revierte exclusivamente
 * desde los endpoints dedicados `PATCH /:id/anular` y `PATCH /:id/reactivar`
 * (odp.controller.ts) — el PUT genérico la rechaza a propósito, para que toda anulación
 * quede con motivo obligatorio y rastro en `historial_estados_odp`.
 *
 * Al igual que con INSTALANDO (ver 2026-09-02_agregar_estado_instalando.ts), la columna
 * `estado_produccion` no tiene CHECK CONSTRAINT en Postgres — el ENUM es la única
 * validación — así que no hace falta recrear ninguna restricción.
 *
 * No hay FASE 2 de migración de datos: es un valor nuevo, ninguna ODP existente puede
 * estar ya en ese estado.
 *
 * Ejecutar: npx ts-node src/scripts/2026-09-08_agregar_estado_anulada.ts
 * Idempotente: puede correrse más de una vez sin efectos adicionales.
 */

import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';

const NUEVO = 'ANULADA';

async function run() {
  console.log('=== Alta del estado ANULADA — 2026-09-08 ===\n');

  const yaExiste = await sequelize.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n
       FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'enum_odp_estado_produccion' AND e.enumlabel = :nuevo`,
    { type: QueryTypes.SELECT, replacements: { nuevo: NUEVO } }
  );

  if (Number(yaExiste[0].n) > 0) {
    console.log(`'${NUEVO}' ya existe en el ENUM — nada que hacer.\n`);
  } else {
    // ADD VALUE no puede ir en una transacción explícita junto con otras sentencias
    // que lo usen, pero como sentencia única suelta no hay problema.
    await sequelize.query(
      `ALTER TYPE enum_odp_estado_produccion ADD VALUE '${NUEVO}'`
    );
    console.log(`'${NUEVO}' añadido al final del ENUM. ✔\n`);
  }

  const orden = await sequelize.query<{ enumlabel: string }>(
    `SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'enum_odp_estado_produccion' ORDER BY e.enumsortorder`,
    { type: QueryTypes.SELECT }
  );
  console.log('Orden del ENUM:', orden.map(o => o.enumlabel).join(' · '));

  await sequelize.close();
  console.log('\n=== Migración terminada ===');
}

run().catch(async (e) => {
  console.error('\n✘ Error en la migración:', e);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
