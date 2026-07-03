// Corrige la SAP-7837 (ODP-24103, sap_id=208), corrompida por una edición manual
// el 2026-06-26 que reasignó letras C->A y D->B (colisionando con A/B existentes)
// y creó un ítem CCE0601 duplicado con letra D. Ver auditoria_log ids 17519-17522.
//
// Verificado antes de correr: sap_item_id 1123, 1124 y 1199 NO tienen odc_items
// asociados (no hay orden de compra generada sobre ellos), por lo tanto es seguro
// restaurar sus letras originales y eliminar el duplicado sin afectar compras reales.
import sequelize from '../config/database';
import { SAPItem } from '../models';

async function run() {
  await sequelize.authenticate();

  const bha = await SAPItem.findByPk(1123);
  const per = await SAPItem.findByPk(1124);
  const duplicado = await SAPItem.findByPk(1199);

  if (!bha || !per || !duplicado) {
    throw new Error('No se encontraron los sap_items esperados (1123, 1124, 1199). Abortando sin cambios.');
  }

  await bha.update({ item: 'C' });
  console.log('sap_item 1123 (BHA0601) restaurado a letra C');

  await per.update({ item: 'D' });
  console.log('sap_item 1124 (PER0902) restaurado a letra D');

  await duplicado.destroy();
  console.log('sap_item 1199 (CCE0601 duplicado, letra D espuria) eliminado');

  await sequelize.close();
}

run().catch((err) => {
  console.error('Error en corrección SAP-7837:', err);
  process.exit(1);
});
