/**
 * Migración: monto real por factura electrónica.
 *
 * - odp.monto_factura_principal: monto de la FE principal (default = valor_total, editable).
 * - facturas_adicionales_odp.monto: monto de cada FE adicional.
 *
 * Backfill acordado con el usuario (2026-07-24):
 *   - FE principal de ODPs ya facturadas  → monto = valor_total.
 *   - FE adicionales ya existentes         → monto = 0 (editables después).
 *
 * Idempotente: usa ADD COLUMN IF NOT EXISTS y solo backfillea filas con monto NULL.
 * Ejecutar UNA vez:  npx ts-node src/scripts/2026-07-24_montos_por_factura.ts
 */
import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';

const run = async () => {
  await sequelize.authenticate();
  console.log('Conectado. Aplicando migración de montos por factura...\n');

  await sequelize.query(`ALTER TABLE odp ADD COLUMN IF NOT EXISTS monto_factura_principal DECIMAL(15,2)`);
  console.log('✓ odp.monto_factura_principal');

  await sequelize.query(`ALTER TABLE facturas_adicionales_odp ADD COLUMN IF NOT EXISTS monto DECIMAL(15,2)`);
  console.log('✓ facturas_adicionales_odp.monto');

  const [, metaPrincipal]: any = await sequelize.query(`
    UPDATE odp
       SET monto_factura_principal = valor_total
     WHERE estado_facturacion = 'FACTURADA'
       AND factura_electronica IS NOT NULL
       AND monto_factura_principal IS NULL
  `);
  console.log(`✓ Backfill principal: ${metaPrincipal?.rowCount ?? '?'} ODPs → monto = valor_total`);

  const [, metaAdic]: any = await sequelize.query(`
    UPDATE facturas_adicionales_odp SET monto = 0 WHERE monto IS NULL
  `);
  console.log(`✓ Backfill adicionales: ${metaAdic?.rowCount ?? '?'} FE → monto = 0`);

  // Verificación rápida
  const chk: any[] = await sequelize.query(`
    SELECT
      (SELECT COUNT(*) FROM odp WHERE monto_factura_principal IS NOT NULL) AS odps_con_monto,
      (SELECT COUNT(*) FROM facturas_adicionales_odp)                       AS total_adicionales,
      (SELECT COUNT(*) FROM facturas_adicionales_odp WHERE monto IS NOT NULL) AS adic_con_monto
  `, { type: QueryTypes.SELECT });
  console.log('\nVerificación:', chk[0]);

  await sequelize.close();
  console.log('\n✅ Migración completa.');
};

run().catch((e) => { console.error('❌ Error en migración:', e); process.exit(1); });
