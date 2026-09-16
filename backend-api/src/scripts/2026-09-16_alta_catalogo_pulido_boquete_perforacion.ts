// Alta de 6 códigos en catalogo_productos, tomados del reporte "Existencia de inventarios
// por Bodega al 16/09/2026" (imagen aportada por el usuario) — códigos con existencia
// real y en uso activo que no estaban en el catálogo maestro. Se dejan fuera a propósito
// (decisión del usuario, 2026-09-16):
//   - 1BPB07 y 1BOQN02: dudosos, el usuario prefirió no agregarlos.
//   - 1PERF01 ("PERFORACIÓN NO USAR"): descontinuado, lo dice el propio nombre.
//   - APRENDIZ: ya existe en catalogo_productos y de todas formas es una cuenta contable
//     (contratos de aprendizaje), no un producto.
//
// categoria/unidad_medida quedan NULL a propósito: así están los 6 códigos hermanos de
// esta misma familia que ya existían en el catálogo (BPB04, BPB018, BIESP01, BIESP02,
// 1BPB10) — insertar estos con el mismo patrón los deja consistentes con sus pares.
//
// Mismo patrón que los scripts anteriores de ODP-24202: create() dentro de una
// transacción (dispara el hook de auditoría) envuelto en contexto ROOT (id 30).
import { sequelize, CatalogoProducto } from '../models';
import { requestContext } from '../utils/requestContext';

const NUEVOS = [
  { codigo: 'BPB05', nombre: 'BORDE PULIDO BRILLADO (8 - 12MM)' },
  { codigo: 'DIAMBPB', nombre: 'DIAMETROS' },
  { codigo: 'BOQN02', nombre: 'BOQUETE NORMAL' },
  { codigo: 'PERF01', nombre: 'PERFORACIONES VIDRIO 05-20' },
  { codigo: 'PERF03', nombre: 'PERFORACIONES VIDRIO 21-50' },
  { codigo: 'PERF04', nombre: 'PERFORACIONES VIDRIO 51-85' },
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

  // Dar tiempo a que el hook afterCreate (fire-and-forget) termine de escribir la auditoría.
  await new Promise((r) => setTimeout(r, 1000));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
