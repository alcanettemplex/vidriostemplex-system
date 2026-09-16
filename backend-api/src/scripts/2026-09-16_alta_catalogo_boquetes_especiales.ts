// Alta de 2 códigos en catalogo_productos, confirmados por el usuario vía captura del
// sistema de inventario (2026-09-16): BOQUETE ESPECIAL INTERNO / PERIMETRAL. BOQN02
// (BOQUETE NORMAL) ya existía (alta previa, 2026-09-16_alta_catalogo_pulido_boquete_perforacion.ts).
//
// Contexto: resuelve la reconciliación de códigos huérfanos del Cotizador — la fila
// "BOQE01" del Cotizador tenía codigo_homologo=BOQE01 (inexistente hasta ahora), y
// "BOQN03" también apuntaba a BOQE01 (probable typo: por nombre, BOQN03 parece
// corresponder más a BOQE03 "PERIMETRAL" — pendiente de confirmar con el usuario, no se
// asume aquí).
//
// Mismo patrón que los scripts anteriores: create() dentro de una transacción (dispara
// el hook de auditoría) envuelto en contexto ROOT (id 30).
import { sequelize, CatalogoProducto } from '../models';
import { requestContext } from '../utils/requestContext';

const NUEVOS = [
  { codigo: 'BOQE01', nombre: 'BOQUETE ESPECIAL INTERNO' },
  { codigo: 'BOQE03', nombre: 'BOQUETE ESPECIAL PERIMETRAL' },
];

async function main() {
  await requestContext.run({ userId: 30, userName: 'ROOT System', ip: null }, async () => {
    const t = await sequelize.transaction();
    try {
      const existentes = await CatalogoProducto.findAll({
        where: { codigo: NUEVOS.map((n) => n.codigo) },
        transaction: t,
      });
      if (existentes.length > 0) {
        throw new Error(
          `Ya existen en catalogo_productos, abortando sin insertar nada: ${existentes.map((e) => e.getDataValue('codigo')).join(', ')}`
        );
      }

      const creados = [];
      for (const n of NUEVOS) {
        const fila = await CatalogoProducto.create(
          {
            codigo: n.codigo,
            nombre: n.nombre,
            categoria: null,
            descripcion: null,
            activo: true,
            es_aluminio: false,
            unidad_medida: null,
          },
          { transaction: t }
        );
        creados.push(fila);
      }

      await t.commit();

      console.log(`${creados.length} producto(s) creado(s) en catalogo_productos:`);
      for (const c of creados) {
        console.log(`  - id=${c.getDataValue('id')} ${c.getDataValue('codigo')}: ${c.getDataValue('nombre')}`);
      }
    } catch (err) {
      await t.rollback();
      throw err;
    }
  });

  await new Promise((r) => setTimeout(r, 1000));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
