/**
 * Script: 2026-10-05_sap_pase_corte.ts
 *
 * Propósito: marca "pasada a corte de aluminio" por SAP (decisión del usuario,
 * 2026-10-05). Desde el panel del Control de Taller, el operario anota que la
 * perfilería de una SAP ya se pasó al corte; queda nota en la bitácora y la celda
 * Aluminio del tablero se pinta "en corte". No toca `chk_corte` ni el estado.
 *
 *   sap.fecha_pase_corte   TIMESTAMPTZ NULL  — NULL = no se ha pasado a corte
 *   sap.pase_corte_por_id  INTEGER NULL → usuarios(id)
 *
 * No modifica filas existentes: todas quedan en NULL.
 *
 * ⚠️ ORDEN: correr ANTES de desplegar el backend. `sap.model.ts` declara las dos
 * columnas: sin ellas, toda consulta de SAP (tablero, ficha ODP, Compras) falla.
 *
 * Simular:  npx ts-node --files src/scripts/2026-10-05_sap_pase_corte.ts
 * Aplicar:  npx ts-node --files src/scripts/2026-10-05_sap_pase_corte.ts --aplicar
 * Revertir: npx ts-node --files src/scripts/2026-10-05_sap_pase_corte.ts --revertir --aplicar
 *           (solo con el backend anterior desplegado; las notas de bitácora quedan.)
 */

import { QueryTypes } from 'sequelize';
import sequelize from '../config/database';

const APLICAR = process.argv.includes('--aplicar');
const REVERTIR = process.argv.includes('--revertir');
const COLUMNAS = ['fecha_pase_corte', 'pase_corte_por_id'];

async function existentes(): Promise<Set<string>> {
  const filas = (await sequelize.query(
    `SELECT column_name AS c FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sap' AND column_name IN (:cols)`,
    { type: QueryTypes.SELECT, replacements: { cols: COLUMNAS } }
  )) as Array<{ c: string }>;
  return new Set(filas.map((f) => f.c));
}

async function aplicar() {
  console.log(`=== SAP: pase a corte de aluminio — 2026-10-05${APLICAR ? '' : ' (SIMULACIÓN)'} ===\n`);
  const ya = await existentes();
  for (const c of COLUMNAS) console.log(`  ${ya.has(c) ? '= ya existe' : '+ agregar  '} sap.${c}`);
  if (!APLICAR) {
    console.log('\nSimulación: nada escrito. Usa --aplicar.');
    return;
  }
  await sequelize.transaction(async (t) => {
    await sequelize.query(`ALTER TABLE sap ADD COLUMN IF NOT EXISTS fecha_pase_corte TIMESTAMPTZ NULL`, { transaction: t });
    await sequelize.query(
      `ALTER TABLE sap ADD COLUMN IF NOT EXISTS pase_corte_por_id INTEGER NULL
         REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE SET NULL`,
      { transaction: t }
    );
  });
  console.log('\n  ✔ Columnas creadas. Ya se puede desplegar el backend.');
}

async function revertir() {
  console.log('=== Revertir pase a corte de aluminio — 2026-10-05 ===\n');
  const [{ n }] = (await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM sap WHERE fecha_pase_corte IS NOT NULL`,
    { type: QueryTypes.SELECT }
  )) as Array<{ n: number }>;
  console.log(`  ${n} SAP marcada(s) como pasada(s) a corte perderían la marca (sus notas de bitácora quedan).`);
  if (!APLICAR) {
    console.log('\nSimulación: nada escrito. Usa --revertir --aplicar.');
    return;
  }
  await sequelize.transaction(async (t) => {
    for (const c of COLUMNAS) await sequelize.query(`ALTER TABLE sap DROP COLUMN IF EXISTS ${c}`, { transaction: t });
  });
  console.log('  ✔ Revertido.');
}

(REVERTIR ? revertir() : aplicar())
  .then(() => sequelize.close())
  .catch(async (e) => {
    console.error('\n✖', e instanceof Error ? e.message : e);
    await sequelize.close();
    process.exit(1);
  });
