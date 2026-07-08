/**
 * One-off 2026-07-07 — Corrección de inventario de perfilería:
 *  1. Consecutivo 10789: código PEP0301 → MOS0501 (la pieza física es PERFIL MOSQUITERO;
 *     la UI no permite editar código, solo mm/ubicación).
 *  2. Consecutivo 10812: restaurar registro eliminado por error hoy a las 14:07
 *     (era ANG0301, 6000 mm, C1) con el código correcto PERF001 (PERFILERIA ESPECIAL).
 *
 * Usa los modelos Sequelize (models/index.ts) para que los hooks de auditoría registren
 * los cambios. Ejecutar UNA sola vez:
 *   cd backend-api && npx ts-node --transpile-only src/scripts/fix_inventario_10789_10812_2026-07-07.ts
 */
import 'dotenv/config';
import sequelize from '../config/database';
import { InventarioPerfileria } from '../models';

const run = async () => {
  const t = await sequelize.transaction();
  try {
    // 1. Corregir código del 10789
    const pieza10789 = await InventarioPerfileria.findOne({ where: { consecutivo: 10789 }, transaction: t });
    if (!pieza10789) throw new Error('Consecutivo 10789 no encontrado');
    const codigoActual = pieza10789.getDataValue('codigo');
    if (codigoActual === 'MOS0501') {
      console.log('10789 ya tiene código MOS0501 — sin cambios (script ya ejecutado?)');
    } else {
      if (codigoActual !== 'PEP0301') throw new Error(`10789 tiene código inesperado: ${codigoActual}`);
      await pieza10789.update({ codigo: 'MOS0501' }, { transaction: t });
      console.log('✔ 10789: PEP0301 → MOS0501');
    }

    // 2. Restaurar el 10812 con código PERF001
    const existe10812 = await InventarioPerfileria.findOne({ where: { consecutivo: 10812 }, transaction: t });
    if (existe10812) {
      console.log(`10812 ya existe con código ${existe10812.getDataValue('codigo')} — sin cambios`);
    } else {
      await InventarioPerfileria.create({
        consecutivo: 10812,
        codigo: 'PERF001',
        mm: 6000,
        ubicacion: 'C1',
        fecha_corte: '2026-07-07',
      }, { transaction: t });
      console.log('✔ 10812: restaurado con código PERF001, 6000 mm, C1');
    }

    await t.commit();

    const verif = await InventarioPerfileria.findAll({
      where: { consecutivo: [10789, 10812] },
      attributes: ['consecutivo', 'codigo', 'mm', 'ubicacion', 'fecha_corte'],
      order: [['consecutivo', 'ASC']],
      raw: true,
    });
    console.log('Estado final:', verif);
    process.exit(0);
  } catch (e: any) {
    await t.rollback();
    console.error('ERROR — rollback aplicado:', e.message);
    process.exit(1);
  }
};

run();
