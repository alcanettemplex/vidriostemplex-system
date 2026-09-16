// Corrección puntual solicitada por el usuario: ODP-24202 tenía el cliente equivocado
// (JULIAN ANDRES LOPERA TIRADO) y debía quedar con JARAMILLO LOBO INGENIERIA Y
// CONSTRUCCION SAS (cliente ya existente en el maestro, id 1143). Se usa el mismo
// camino que `updateODP` (odp.update dentro de una transacción) para que el hook de
// auditoría capture el snapshot anterior, envuelto en el contexto de ROOT (id 30) para
// que el registro de auditoría quede atribuido a un actor real en vez de null.
import { sequelize, ODP, Cliente } from '../models';
import { requestContext } from '../utils/requestContext';

async function main() {
  await requestContext.run({ userId: 30, userName: 'ROOT System', ip: null }, async () => {
    const t = await sequelize.transaction();
    try {
      const odp = await ODP.findOne({ where: { numero_odp: 'ODP-24202' }, transaction: t });
      if (!odp) throw new Error('ODP-24202 no encontrada');

      const nuevoCliente = await Cliente.findByPk(1143, { transaction: t });
      if (!nuevoCliente) throw new Error('Cliente 1143 no encontrado');

      const clienteAnteriorId = odp.getDataValue('cliente_id');
      await odp.update({ cliente_id: 1143 }, { transaction: t });
      await t.commit();

      console.log(`ODP-24202: cliente_id ${clienteAnteriorId} -> 1143 (${nuevoCliente.getDataValue('nombre_razon_social')})`);
    } catch (err) {
      await t.rollback();
      throw err;
    }
  });

  // Dar tiempo a que el hook afterUpdate (fire-and-forget) termine de escribir la auditoría.
  await new Promise((r) => setTimeout(r, 1000));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
