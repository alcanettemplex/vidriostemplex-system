/**
 * Script: 2026-10-12_reporte_diario_asesores.ts
 *
 * Propósito: el reporte diario de asesores (Supervisión CRM → "Reporte del día")
 * guarda cada envío como ítems del lineamiento del día. Los ítems hasta hoy solo
 * podían ser de leads; el reporte también lleva ODP (facturar / cobrar).
 *
 *   supervision_lineamiento_items.odp_id               INTEGER NULL → odp(id) ON DELETE SET NULL
 *   supervision_lineamiento_items.envio                SMALLINT NULL (parte del día: 1, 2…)
 *   supervision_lineamiento_items.detalle              JSONB NULL (copia de lo enviado)
 *   supervision_lineamiento_items.cumplido_automatico  BOOLEAN NOT NULL DEFAULT false
 *   supervision_lineamiento_items.marcado_manual       BOOLEAN NOT NULL DEFAULT false
 *   enum_supervision_lineamiento_items_origen          + SIN_ASIGNAR, FACTURAR, FACTURAR_INSTALADA, COBRAR
 *
 * La columna `origen` no tiene CHECK CONSTRAINT (verificado 2026-10-12): basta el ENUM.
 * No modifica filas existentes (208 ítems al 2026-10-12): quedan con envio NULL.
 *
 * ⚠️ ORDEN: correr ANTES de desplegar el backend. El modelo declara las columnas:
 * sin ellas, cargar un lineamiento falla. El backend anterior las ignora.
 *
 * Simular:  npx ts-node --files src/scripts/2026-10-12_reporte_diario_asesores.ts
 * Aplicar:  npx ts-node --files src/scripts/2026-10-12_reporte_diario_asesores.ts --aplicar
 * Revertir: npx ts-node --files src/scripts/2026-10-12_reporte_diario_asesores.ts --revertir --aplicar
 *           (solo con el backend anterior desplegado; borra los ítems del reporte y las
 *           columnas. Los valores del ENUM se quedan: PG no permite quitarlos y no estorban.)
 */

import { QueryTypes } from 'sequelize';
import sequelize from '../config/database';

const APLICAR = process.argv.includes('--aplicar');
const REVERTIR = process.argv.includes('--revertir');

const TABLA = 'supervision_lineamiento_items';
const ENUM_ORIGEN = 'enum_supervision_lineamiento_items_origen';
const VALORES_NUEVOS = ['SIN_ASIGNAR', 'FACTURAR', 'FACTURAR_INSTALADA', 'COBRAR'];

const COLUMNAS = [
  { nombre: 'odp_id', tipo: 'INTEGER NULL REFERENCES odp(id) ON UPDATE CASCADE ON DELETE SET NULL' },
  { nombre: 'envio', tipo: 'SMALLINT NULL' },
  { nombre: 'detalle', tipo: 'JSONB NULL' },
  { nombre: 'cumplido_automatico', tipo: 'BOOLEAN NOT NULL DEFAULT false' },
  { nombre: 'marcado_manual', tipo: 'BOOLEAN NOT NULL DEFAULT false' },
];

async function existeColumna(columna: string): Promise<boolean> {
  const filas = (await sequelize.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = :tabla AND column_name = :columna`,
    { replacements: { tabla: TABLA, columna }, type: QueryTypes.SELECT }
  )) as unknown[];
  return filas.length > 0;
}

async function valoresEnum(): Promise<string[]> {
  const filas = (await sequelize.query(
    `SELECT e.enumlabel AS v FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = :tipo`,
    { replacements: { tipo: ENUM_ORIGEN }, type: QueryTypes.SELECT }
  )) as Array<{ v: string }>;
  return filas.map((f) => f.v);
}

async function aplicar() {
  console.log(`=== Reporte diario de asesores — 2026-10-12${APLICAR ? '' : ' (SIMULACIÓN)'} ===\n`);
  for (const c of COLUMNAS) {
    console.log(`  ${(await existeColumna(c.nombre)) ? '= ya existe' : '+ agregar  '} ${TABLA}.${c.nombre}`);
  }
  const actuales = await valoresEnum();
  for (const v of VALORES_NUEVOS) {
    console.log(`  ${actuales.includes(v) ? '= ya existe' : '+ agregar  '} ${ENUM_ORIGEN} '${v}'`);
  }
  if (!APLICAR) {
    console.log('\nSimulación: nada escrito. Usa --aplicar.');
    return;
  }
  // ALTER TYPE ... ADD VALUE no puede ir dentro de una transacción en PG < 12; se ejecuta suelto.
  for (const v of VALORES_NUEVOS) {
    await sequelize.query(`ALTER TYPE ${ENUM_ORIGEN} ADD VALUE IF NOT EXISTS '${v}'`);
  }
  await sequelize.transaction(async (t) => {
    for (const c of COLUMNAS) {
      await sequelize.query(`ALTER TABLE ${TABLA} ADD COLUMN IF NOT EXISTS ${c.nombre} ${c.tipo}`, { transaction: t });
    }
    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS ${TABLA}_odp_id_idx ON ${TABLA} (odp_id) WHERE odp_id IS NOT NULL`,
      { transaction: t }
    );
  });
  console.log('\n  ✔ Migración aplicada. Ya se puede desplegar el backend.');
}

async function revertir() {
  console.log('=== Revertir reporte diario de asesores — 2026-10-12 ===\n');
  const [{ n }] = (await sequelize.query(
    `SELECT count(*)::int AS n FROM ${TABLA} WHERE envio IS NOT NULL`,
    { type: QueryTypes.SELECT }
  )) as Array<{ n: number }>;
  console.log(`  Ítems del reporte diario que se borrarían: ${n}`);
  if (!APLICAR) {
    console.log('\nSimulación: nada escrito. Usa --revertir --aplicar.');
    return;
  }
  await sequelize.transaction(async (t) => {
    await sequelize.query(`DELETE FROM ${TABLA} WHERE envio IS NOT NULL OR origen::text IN (:valores)`, {
      replacements: { valores: VALORES_NUEVOS }, transaction: t,
    });
    for (const c of [...COLUMNAS].reverse()) {
      await sequelize.query(`ALTER TABLE ${TABLA} DROP COLUMN IF EXISTS ${c.nombre}`, { transaction: t });
    }
  });
  console.log('\n  ✔ Columnas eliminadas.');
}

(REVERTIR ? revertir() : aplicar())
  .catch((e) => { console.error('Error:', e.message); process.exitCode = 1; })
  .finally(() => sequelize.close());
