/**
 * Script: 2026-09-26_cotizador_mano_obra_por_producto.ts
 *
 * Propósito: estructura de la MANO DE OBRA POR PRODUCTO del Cotizador (decisión
 * del usuario, 2026-09-26; ver docs/modulos/cotizador.md → "Mano de obra por
 * producto").
 *
 *   1. Dos valores nuevos en `public.enum_cotizador_cargo_tipo`: ENSAMBLE e
 *      INSTALACION — las líneas automáticas que genera `recalcularPropuesta`.
 *   2. Cuatro tarifas en `cotizador.parametro`, antes de AIU e IVA, editables
 *      desde Configuración: ensamble de ventanas/proyectantes $60.000/m²,
 *      instalación de ventanas/proyectantes $25.000/m², instalación de cabinas
 *      $120.000/und, instalación de espejos/tableros $85.000/m².
 *   3. `cotizador.propuesta.total_mano_obra`: la suma de esas líneas, que entra
 *      en la base del descuento y del IVA junto a los productos.
 *
 * `ALTER TYPE ... ADD VALUE` va FUERA de la transacción: Postgres no deja usar
 * el valor nuevo dentro de la misma transacción que lo crea, y `IF NOT EXISTS`
 * lo hace idempotente.
 *
 * Las propuestas ya guardadas (todas de prueba: el módulo sigue aislado del ERP)
 * no se tocan: se recalculan solas la próxima vez que alguien edite sus ítems o
 * cargos.
 *
 * Ejecutar:  npx ts-node src/scripts/2026-09-26_cotizador_mano_obra_por_producto.ts
 * Revertir:  npx ts-node src/scripts/2026-09-26_cotizador_mano_obra_por_producto.ts --revertir
 *            (borra las líneas ENSAMBLE/INSTALACION y las columnas nuevas; los
 *            valores del ENUM no se pueden quitar en Postgres sin recrear el
 *            tipo, así que quedan, sin uso.)
 * Después:   reiniciar el backend para recargar la caché del Cotizador.
 */

import sequelize from '../config/database';

const TARIFAS = [
  { columna: 'mo_ensamble_ventana_m2', valor: 60000 },
  { columna: 'mo_instalacion_ventana_m2', valor: 25000 },
  { columna: 'mo_instalacion_cabina_und', valor: 120000 },
  { columna: 'mo_instalacion_espejo_tablero_m2', valor: 85000 },
] as const;

async function aplicar() {
  console.log('=== Cotizador: mano de obra por producto — 2026-09-26 ===\n');

  for (const valor of ['ENSAMBLE', 'INSTALACION']) {
    await sequelize.query(`ALTER TYPE public.enum_cotizador_cargo_tipo ADD VALUE IF NOT EXISTS '${valor}'`);
  }
  console.log('  ✔ enum_cotizador_cargo_tipo: + ENSAMBLE, INSTALACION');

  await sequelize.transaction(async (t) => {
    for (const { columna, valor } of TARIFAS) {
      await sequelize.query(
        `ALTER TABLE cotizador.parametro ADD COLUMN IF NOT EXISTS ${columna} DOUBLE PRECISION NOT NULL DEFAULT ${valor}`,
        { transaction: t }
      );
    }
    console.log(`  ✔ cotizador.parametro: ${TARIFAS.map((x) => `${x.columna}=${x.valor}`).join(', ')}`);

    await sequelize.query(
      `ALTER TABLE cotizador.propuesta ADD COLUMN IF NOT EXISTS total_mano_obra DOUBLE PRECISION NOT NULL DEFAULT 0`,
      { transaction: t }
    );
    console.log('  ✔ cotizador.propuesta.total_mano_obra');
  });

  const [[fila]] = (await sequelize.query(
    `SELECT ${TARIFAS.map((x) => x.columna).join(', ')} FROM cotizador.parametro WHERE id = 1`
  )) as [Record<string, number>[], unknown];
  console.log('\nTarifas vigentes:', fila);
  console.log('\n⚠ Reinicia el backend para que la caché del Cotizador vea los cambios.');
}

async function revertir() {
  console.log('=== REVERTIR mano de obra por producto — 2026-09-26 ===\n');
  await sequelize.transaction(async (t) => {
    await sequelize.query(
      `DELETE FROM cotizador.propuesta_cargo WHERE tipo IN ('ENSAMBLE', 'INSTALACION')`,
      { transaction: t }
    );
    await sequelize.query(`ALTER TABLE cotizador.propuesta DROP COLUMN IF EXISTS total_mano_obra`, { transaction: t });
    for (const { columna } of TARIFAS) {
      await sequelize.query(`ALTER TABLE cotizador.parametro DROP COLUMN IF EXISTS ${columna}`, { transaction: t });
    }
  });
  console.log('  ✔ Líneas automáticas borradas y columnas quitadas (el ENUM conserva sus valores).');
  console.log('\n⚠ Reinicia el backend para que la caché del Cotizador vea los cambios.');
}

(process.argv.includes('--revertir') ? revertir() : aplicar())
  .then(() => sequelize.close())
  .catch(async (e) => {
    console.error('\n✖', e instanceof Error ? e.message : e);
    await sequelize.close();
    process.exit(1);
  });
