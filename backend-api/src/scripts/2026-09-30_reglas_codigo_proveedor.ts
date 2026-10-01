/**
 * Script: 2026-09-30_reglas_codigo_proveedor.ts
 *
 * Propósito: que cada proveedor pueda tener una REGLA que reconozca sus códigos
 *            inconsistentes, para no mapear a mano el mismo producto cada vez que
 *            el proveedor lo factura con otro código.
 *
 * Origen (2026-09-30): GRUPO ROLDAN factura el mismo adaptador 3831 negro como
 * `GRE175NG` y como `ALU175NG`; VENTANAS Y PUERTAS agrega `MT` a los retales
 * (`392EC` / `392ECMT`); VEA usa un código distinto para la mano izquierda y la
 * derecha de una chapeta que el catálogo no distingue. Cada código nuevo volvía a
 * "Por Mapear" aunque el producto ya estuviera vinculado. Las reglas viven en
 * `utils/proveedorReglasCodigo.ts`; aquí solo se crean las columnas.
 *
 *   1. proveedores.regla_codigo       — qué regla aplica (NULL = ninguna).
 *   2. proveedores.regla_codigo_modo  — AUTO (vincula sola) | SUGERENCIA (solo propone).
 *   3. proveedor_codigo_pendiente.regla_rechazada — el usuario deshizo un vínculo
 *      hecho por la regla: no se vuelve a aplicar a ese código, o la siguiente
 *      factura lo revincularía y el "deshacer" no serviría de nada.
 *
 * Son columnas nullable / con default: el backend en producción, que todavía no
 * las conoce, sigue funcionando igual (Sequelize solo lee los atributos del modelo).
 *
 * Ejecutar: npx ts-node --files src/scripts/2026-09-30_reglas_codigo_proveedor.ts
 * Idempotente: ADD COLUMN IF NOT EXISTS. Puede repetirse. NO corre con `npm run dev`.
 */

import sequelize from '../config/database';

async function run() {
  console.log('=== Reglas de código por proveedor — 2026-09-30 ===\n');

  await sequelize.query(`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS regla_codigo VARCHAR(40) NULL;`);
  console.log('  ✔ proveedores.regla_codigo');

  await sequelize.query(`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS regla_codigo_modo VARCHAR(12) NULL;`);
  console.log('  ✔ proveedores.regla_codigo_modo');

  await sequelize.query(
    `ALTER TABLE proveedor_codigo_pendiente ADD COLUMN IF NOT EXISTS regla_rechazada BOOLEAN NOT NULL DEFAULT false;`
  );
  console.log('  ✔ proveedor_codigo_pendiente.regla_rechazada');

  const [filas] = await sequelize.query(`
    SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
     WHERE (table_name = 'proveedores' AND column_name IN ('regla_codigo', 'regla_codigo_modo'))
        OR (table_name = 'proveedor_codigo_pendiente' AND column_name = 'regla_rechazada')
     ORDER BY table_name, column_name;
  `);
  console.log('\nVerificación:');
  console.table(filas);
}

run()
  .then(() => console.log('\nListo.'))
  .catch((e) => {
    console.error('Falló la migración:', e);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
