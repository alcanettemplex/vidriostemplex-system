/**
 * Script: 2026-10-08_ruta_odp_orden_conductor.ts
 *
 * Propósito: orden propio del recorrido del camión (decisión del usuario, 2026-10-08).
 * Un mismo conductor atiende varias rutas el mismo día e intercala sus paradas
 * (instalador A → acarreo → instalador B); `ruta_odp.orden` ya es el orden del día de
 * los INSTALADORES, así que el del camión necesita su propia columna. Lo fija la
 * pestaña "Recorridos" de Instalaciones (POST /api/rutas/ordenar-conductor).
 *
 *   ruta_odp.orden_conductor  INTEGER NULL — NULL = sin organizar: el recorrido usa `orden`
 *
 * No modifica filas existentes: todas quedan en NULL.
 *
 * ⚠️ ORDEN: correr ANTES de desplegar el backend. `ruta_odp.model.ts` declara la columna:
 * sin ella, toda consulta de rutas falla. El backend anterior la ignora (columna nullable).
 *
 * Simular:  npx ts-node --files src/scripts/2026-10-08_ruta_odp_orden_conductor.ts
 * Aplicar:  npx ts-node --files src/scripts/2026-10-08_ruta_odp_orden_conductor.ts --aplicar
 * Revertir: npx ts-node --files src/scripts/2026-10-08_ruta_odp_orden_conductor.ts --revertir --aplicar
 *           (solo con el backend anterior desplegado; se pierde el orden de los recorridos.)
 */

import { QueryTypes } from 'sequelize';
import sequelize from '../config/database';

const APLICAR = process.argv.includes('--aplicar');
const REVERTIR = process.argv.includes('--revertir');

async function existe(): Promise<boolean> {
  const filas = (await sequelize.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ruta_odp' AND column_name = 'orden_conductor'`,
    { type: QueryTypes.SELECT }
  )) as unknown[];
  return filas.length > 0;
}

async function aplicar() {
  console.log(`=== ruta_odp.orden_conductor — 2026-10-08${APLICAR ? '' : ' (SIMULACIÓN)'} ===\n`);
  const ya = await existe();
  console.log(`  ${ya ? '= ya existe' : '+ agregar  '} ruta_odp.orden_conductor`);
  if (!APLICAR) {
    console.log('\nSimulación: nada escrito. Usa --aplicar.');
    return;
  }
  await sequelize.query(`ALTER TABLE ruta_odp ADD COLUMN IF NOT EXISTS orden_conductor INTEGER NULL`);
  console.log('\n  ✔ Columna creada. Ya se puede desplegar el backend.');
}

async function revertir() {
  console.log('=== Revertir ruta_odp.orden_conductor — 2026-10-08 ===\n');
  const [{ n }] = (await sequelize.query(
    `SELECT count(*)::int AS n FROM ruta_odp WHERE orden_conductor IS NOT NULL`,
    { type: QueryTypes.SELECT }
  )) as Array<{ n: number }>;
  console.log(`  Paradas con orden de conductor que se perderían: ${n}`);
  if (!APLICAR) {
    console.log('\nSimulación: nada escrito. Usa --revertir --aplicar.');
    return;
  }
  await sequelize.query(`ALTER TABLE ruta_odp DROP COLUMN IF EXISTS orden_conductor`);
  console.log('\n  ✔ Columna eliminada.');
}

(REVERTIR ? revertir() : aplicar())
  .catch((e) => { console.error('Error:', e.message); process.exitCode = 1; })
  .finally(() => sequelize.close());
