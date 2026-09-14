// Cierra el backlog de cotizador_mapeo_accesorio para Sistema7038-Interior:
// las 2 filas que seguían PENDIENTE (Chapa Overseas Doble Cilindro, Empaque
// monumental 6mm) ya tienen SKU real (COG0101, EMP1312 -- ver
// 2026-09-14_alta_accesorios_7038_restantes.ts). Guia 7038 y Rodamiento 7038
// ya estaban MAPEADO desde el 2026-09-12; no se tocan.
//
// Uso: npx ts-node backend-api/src/scripts/2026-09-14_mapear_accesorios_7038_restantes.ts
import { sequelize, CotizadorMapeoAccesorio } from '../models';

const NOTA_FECHA = '2026-09-14';

async function main() {
  const t = await sequelize.transaction();
  try {
    const chapa = await CotizadorMapeoAccesorio.findOne({
      where: { descripcion: 'Chapa Overseas Doble Cilindro' },
      transaction: t,
    });
    if (!chapa) throw new Error('No existe la fila "Chapa Overseas Doble Cilindro"');
    await (chapa as any).update(
      {
        estado: 'MAPEADO',
        codigo: 'COG0101',
        nota:
          `${NOTA_FECHA}: RESUELTO. Taller confirma COG0101 (Cerradura Overseas Gancho), costo=$84.542, ` +
          `PA/PM/PB=131093.19/121800.67/112508.16. Con esto Sistema7038-Interior queda con los 4 accesorios ` +
          `conectados en CATALOGO_SISTEMAS (ventanas.ts): guia, rodamiento, empaque y chapa.`,
      },
      { transaction: t }
    );

    const empaque = await CotizadorMapeoAccesorio.findOne({
      where: { descripcion: 'E7038_6mm Empaque monumental 6mm' },
      transaction: t,
    });
    if (!empaque) throw new Error('No existe la fila "E7038_6mm Empaque monumental 6mm"');
    await (empaque as any).update(
      {
        estado: 'MAPEADO',
        codigo: 'EMP1312',
        nota:
          `${NOTA_FECHA}: RESUELTO. Taller confirma EMP1312 (Empaque 7038 Ref 6-8mm), costo=$988/m, ` +
          `PA/PM/PB=1532.02/1423.42/1314.83. Último de los 5 SKU que faltaban para Sistema7038-Interior.`,
      },
      { transaction: t }
    );

    await t.commit();
    console.log('OK: Chapa Overseas Doble Cilindro -> COG0101, E7038_6mm Empaque monumental 6mm -> EMP1312');
  } catch (e) {
    await t.rollback();
    throw e;
  } finally {
    await sequelize.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
