// Alta de PERF02 en catalogo_productos — confirmado por captura del usuario del sistema
// real (PERF001 PERFILERIA ESPECIAL, PERF01/03/04 perforaciones por rango de vidrio,
// PERF02 PERFORACION ESPECIAL). Resuelve la última ambigüedad de la reconciliación de
// códigos huérfanos del Cotizador: la fila "PERF02" del Cotizador homologa a este código.
import { sequelize, CatalogoProducto } from '../models';
import { requestContext } from '../utils/requestContext';

async function main() {
  await requestContext.run({ userId: 30, userName: 'ROOT System', ip: null }, async () => {
    const t = await sequelize.transaction();
    try {
      const existente = await CatalogoProducto.findOne({ where: { codigo: 'PERF02' }, transaction: t });
      if (existente) throw new Error('PERF02 ya existe en catalogo_productos, abortando');

      const fila = await CatalogoProducto.create(
        {
          codigo: 'PERF02',
          nombre: 'PERFORACION ESPECIAL',
          categoria: null,
          descripcion: null,
          activo: true,
          es_aluminio: false,
          unidad_medida: null,
        },
        { transaction: t }
      );

      await t.commit();
      console.log(`Creado: id=${fila.getDataValue('id')} PERF02: ${fila.getDataValue('nombre')}`);
    } catch (err) {
      await t.rollback();
      throw err;
    }
  });

  await new Promise((r) => setTimeout(r, 1000));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
