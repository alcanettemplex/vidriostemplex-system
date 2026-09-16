// Alta de 1BPB07 en catalogo_productos — el usuario había dejado este código fuera de la
// primera tanda (2026-09-16_alta_catalogo_pulido_boquete_perforacion.ts) por dudoso, pero
// al comparar descripciones la fila del Cotizador "BPB07" (descripcion="BPB REDONDO",
// categoria=ACABADO, unidad=X METRO) calza casi textual con "1BPB07 BPB REDONDO
// DIAMETRO" del inventario oficial — a diferencia de los candidatos alternativos BPB04/
// BPB018, que hablan de espesor de vidrio, no de pieza redonda. Confirmado por el usuario.
//
// Mismo patrón que los scripts anteriores: create() dentro de una transacción (dispara
// el hook de auditoría) envuelto en contexto ROOT (id 30).
import { sequelize, CatalogoProducto } from '../models';
import { requestContext } from '../utils/requestContext';

async function main() {
  await requestContext.run({ userId: 30, userName: 'ROOT System', ip: null }, async () => {
    const t = await sequelize.transaction();
    try {
      const existente = await CatalogoProducto.findOne({ where: { codigo: '1BPB07' }, transaction: t });
      if (existente) throw new Error('1BPB07 ya existe en catalogo_productos, abortando');

      const fila = await CatalogoProducto.create(
        {
          codigo: '1BPB07',
          nombre: 'BPB REDONDO DIAMETRO',
          categoria: null,
          descripcion: null,
          activo: true,
          es_aluminio: false,
          unidad_medida: null,
        },
        { transaction: t }
      );

      await t.commit();
      console.log(`Creado: id=${fila.getDataValue('id')} 1BPB07: ${fila.getDataValue('nombre')}`);
    } catch (err) {
      await t.rollback();
      throw err;
    }
  });

  await new Promise((r) => setTimeout(r, 1000));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
