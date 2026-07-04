// Fusion puntual de clientes duplicados: cliente 1539 (YURI GONZALEZ ARRIETA) y
// 1542 (YURY GONZALEZ ARRIETA) son la misma persona -- se duplico porque
// numero_documento se guardo sin trim ("1102803613" vs " 1102803613 ", con
// espacios, que el UNIQUE constraint no detecto como igual). Confirmado con el
// usuario en conversacion 2026-07-04: 1542 es el que quedo enganchado a la ODP-23975
// real (lead 570 ya se vinculo a el en el fix anterior); 1539 no tiene ninguna
// referencia en odp/leads/prospectos/cotizacion -- verificado antes de tocar nada.
// Se completan en 1542 los campos que 1539 tenia y 1542 no, luego se elimina 1539.
import sequelize from '../config/database';
import { Cliente } from '../models';

async function run() {
  await sequelize.authenticate();
  const t = await sequelize.transaction();

  try {
    const bueno = await Cliente.findByPk(1542, { transaction: t });
    const duplicado = await Cliente.findByPk(1539, { transaction: t });

    if (!bueno || !duplicado) {
      console.log('SALTADO: no se encontro alguno de los dos clientes.');
      await t.rollback();
      return;
    }

    // Borrar el duplicado primero: el UNIQUE de numero_documento choca si se
    // intenta recortar el espacio en 1542 mientras 1539 todavia existe con el
    // mismo numero sin espacios.
    await duplicado.destroy({ transaction: t });

    await bueno.update({
      numero_documento: (bueno.getDataValue('numero_documento') as string).trim(),
      celular: bueno.getDataValue('celular') ?? duplicado.getDataValue('celular'),
      segmento: bueno.getDataValue('segmento') ?? duplicado.getDataValue('segmento'),
      creado_por: bueno.getDataValue('creado_por') ?? duplicado.getDataValue('creado_por'),
    }, { transaction: t });

    await t.commit();
    console.log('OK: cliente 1542 completado y cliente 1539 eliminado.');
  } catch (err) {
    await t.rollback();
    console.error('ERROR:', err);
  } finally {
    await sequelize.close();
  }
}

run();
