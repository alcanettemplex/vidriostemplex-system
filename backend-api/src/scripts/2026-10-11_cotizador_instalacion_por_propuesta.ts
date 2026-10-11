/**
 * Script: 2026-10-11_cotizador_instalacion_por_propuesta.ts
 *
 * Propósito: la instalación pasa de una casilla POR PRODUCTO a un cargo de la obra,
 * una casilla por propuesta (decisión del usuario, 2026-10-11). Los asesores
 * reportaban que con varios productos "la calculaba por aparte".
 *
 *   cotizador.propuesta.con_instalacion           BOOLEAN NULL
 *       NULL  = propuesta anterior al cambio: sigue con la casilla por producto
 *               (decisión del usuario: las guardadas no se tocan).
 *       true / false = forma nueva: la casilla de la propuesta manda sobre todos
 *               sus productos.
 *   cotizador.propuesta.instalacion_valor_manual  DOUBLE PRECISION NULL
 *       NULL = valor automático por tarifas; con número = el que escribió el asesor
 *       (ya con AIU, antes de descuento e IVA, igual que las líneas automáticas).
 *
 * No modifica filas existentes: todas quedan en NULL (= forma anterior).
 *
 * ⚠️ ORDEN: correr ANTES de desplegar el backend. `cotizador_propuesta.model.ts`
 * declara las columnas: sin ellas, toda lectura de cotizaciones falla. El backend
 * anterior las ignora (columnas nullable).
 *
 * Simular:  npx ts-node --files src/scripts/2026-10-11_cotizador_instalacion_por_propuesta.ts
 * Aplicar:  npx ts-node --files src/scripts/2026-10-11_cotizador_instalacion_por_propuesta.ts --aplicar
 * Revertir: npx ts-node --files src/scripts/2026-10-11_cotizador_instalacion_por_propuesta.ts --revertir --aplicar
 *           (solo con el backend anterior desplegado; las propuestas nuevas vuelven a
 *           leerse por la casilla de cada producto, que el sistema dejó sellada.)
 */

import { QueryTypes } from 'sequelize';
import sequelize from '../config/database';

const APLICAR = process.argv.includes('--aplicar');
const REVERTIR = process.argv.includes('--revertir');

const COLUMNAS = [
  { nombre: 'con_instalacion', tipo: 'BOOLEAN NULL' },
  { nombre: 'instalacion_valor_manual', tipo: 'DOUBLE PRECISION NULL' },
];

async function existe(columna: string): Promise<boolean> {
  const filas = (await sequelize.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'cotizador' AND table_name = 'propuesta' AND column_name = :columna`,
    { replacements: { columna }, type: QueryTypes.SELECT }
  )) as unknown[];
  return filas.length > 0;
}

async function aplicar() {
  console.log(`=== cotizador.propuesta: instalación por propuesta — 2026-10-11${APLICAR ? '' : ' (SIMULACIÓN)'} ===\n`);
  for (const c of COLUMNAS) {
    console.log(`  ${(await existe(c.nombre)) ? '= ya existe' : '+ agregar  '} cotizador.propuesta.${c.nombre}`);
  }
  if (!APLICAR) {
    console.log('\nSimulación: nada escrito. Usa --aplicar.');
    return;
  }
  for (const c of COLUMNAS) {
    await sequelize.query(`ALTER TABLE cotizador.propuesta ADD COLUMN IF NOT EXISTS ${c.nombre} ${c.tipo}`);
  }
  console.log('\n  ✔ Columnas creadas. Ya se puede desplegar el backend.');
}

async function revertir() {
  console.log('=== Revertir instalación por propuesta — 2026-10-11 ===\n');
  const [{ n }] = (await sequelize.query(
    `SELECT count(*)::int AS n FROM cotizador.propuesta WHERE con_instalacion IS NOT NULL`,
    { type: QueryTypes.SELECT }
  )) as Array<{ n: number }>;
  console.log(`  Propuestas en la forma nueva que volverían a la casilla por producto: ${n}`);
  if (!APLICAR) {
    console.log('\nSimulación: nada escrito. Usa --revertir --aplicar.');
    return;
  }
  for (const c of COLUMNAS) {
    await sequelize.query(`ALTER TABLE cotizador.propuesta DROP COLUMN IF EXISTS ${c.nombre}`);
  }
  console.log('\n  ✔ Columnas eliminadas.');
}

(REVERTIR ? revertir() : aplicar())
  .catch((e) => { console.error('Error:', e.message); process.exitCode = 1; })
  .finally(() => sequelize.close());
