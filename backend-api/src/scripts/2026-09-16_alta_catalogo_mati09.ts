// Alta de MATI09 en catalogo_productos — confirmado por captura del usuario del sistema
// real (MATI07 MATIZADO TOTAL, MATI08 MATIZADO DIBUJO CATALOGO, MATI09 MATIZADO DIBUJO
// ESPECIAL). El Excel de reconciliación traía MATI08↔MATI09 cruzados; la descripción del
// Cotizador para "MATI09" ("MATIZADO DIBUJO") calza con el MATI09 real ("...DIBUJO
// ESPECIAL"), no con MATI08 ("...DIBUJO CATALOGO"). MATI08 del Cotizador tiene
// descripción "MATIZADO RAYA", que no calza con ninguno de los tres códigos reales —
// queda pendiente de resolver aparte, no se homologa aquí.
import { sequelize, CatalogoProducto } from '../models';
import { requestContext } from '../utils/requestContext';

async function main() {
  await requestContext.run({ userId: 30, userName: 'ROOT System', ip: null }, async () => {
    const t = await sequelize.transaction();
    try {
      const existente = await CatalogoProducto.findOne({ where: { codigo: 'MATI09' }, transaction: t });
      if (existente) throw new Error('MATI09 ya existe en catalogo_productos, abortando');

      const fila = await CatalogoProducto.create(
        {
          codigo: 'MATI09',
          nombre: 'MATIZADO DIBUJO ESPECIAL',
          categoria: null,
          descripcion: null,
          activo: true,
          es_aluminio: false,
          unidad_medida: null,
        },
        { transaction: t }
      );

      await t.commit();
      console.log(`Creado: id=${fila.getDataValue('id')} MATI09: ${fila.getDataValue('nombre')}`);
    } catch (err) {
      await t.rollback();
      throw err;
    }
  });

  await new Promise((r) => setTimeout(r, 1000));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
