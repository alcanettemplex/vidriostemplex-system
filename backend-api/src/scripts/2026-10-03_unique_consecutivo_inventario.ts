/**
 * Script: 2026-10-03_unique_consecutivo_inventario.ts
 *
 * Propósito: crear el índice ÚNICO sobre `inventario_perfileria.consecutivo`.
 *
 * El modelo declara `consecutivo` con `unique: true`, pero la tabla real nunca tuvo la
 * restricción (solo la PK en `id`): `sync({ alter: false })` no la agrega a una tabla que
 * ya existía. Consecuencias que tenía:
 *   - Compras, al revertir una asignación por existencia, recrea las piezas con su
 *     consecutivo y espera `SequelizeUniqueConstraintError` para responder 409; sin el
 *     índice el duplicado entraba en silencio.
 *   - El ingreso automático toma MAX + 1: dos ingresos simultáneos podían repetir números.
 *   - El ingreso con consecutivo manual (2026-10-03) necesita que la BD sea la última
 *     barrera contra un número repetido.
 *
 * Verificado antes de crearlo (2026-10-03): 707 piezas, 707 consecutivos distintos.
 *
 * Ejecutar: npx ts-node --files src/scripts/2026-10-03_unique_consecutivo_inventario.ts
 * Idempotente: CREATE UNIQUE INDEX IF NOT EXISTS. NO corre con `npm run dev`.
 * Reversible: DROP INDEX inventario_perfileria_consecutivo_key;
 *
 * Sin CONCURRENTLY: la tabla tiene ~700 filas y el bloqueo dura milisegundos.
 */

import sequelize from '../config/database';

const run = async () => {
  try {
    const [dups] = await sequelize.query(`
      SELECT consecutivo, COUNT(*)::int AS n
        FROM inventario_perfileria
       GROUP BY consecutivo
      HAVING COUNT(*) > 1
    `);
    if ((dups as unknown[]).length > 0) {
      console.error('Hay consecutivos repetidos; corrígelos antes de crear el índice:', dups);
      process.exitCode = 1;
      return;
    }

    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS inventario_perfileria_consecutivo_key
        ON inventario_perfileria (consecutivo)
    `);

    const [idx] = await sequelize.query(`
      SELECT indexname FROM pg_indexes
       WHERE tablename = 'inventario_perfileria' AND indexname = 'inventario_perfileria_consecutivo_key'
    `);
    console.log((idx as unknown[]).length === 1 ? 'Índice único creado/confirmado.' : 'ERROR: el índice no quedó creado.');
  } catch (e) {
    console.error('Error creando el índice:', e);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
};

run();
