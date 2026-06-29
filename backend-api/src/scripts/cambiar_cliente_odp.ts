/**
 * Script one-off: cambiar cliente de ODP-24032 a ALGAMAR
 * Ejecutar: npx ts-node src/scripts/cambiar_cliente_odp.ts
 */
import sequelize from '../config/database';
import dotenv from 'dotenv';
dotenv.config();

(async () => {
  try {
    await sequelize.authenticate();

    // Buscar la ODP (acepta '24032' o 'ODP-24032')
    const [odps] = await sequelize.query(
      `SELECT o.id, o.numero_odp, o.cliente_id, c.nombre_razon_social AS cliente_actual
       FROM odp o
       JOIN clientes c ON c.id = o.cliente_id
       WHERE o.numero_odp ILIKE '%24032%'`
    ) as [any[], unknown];

    if (!odps.length) {
      console.error('No se encontró ninguna ODP con número 24032.');
      process.exit(1);
    }
    console.log('ODP encontrada:', odps[0]);

    // Buscar el cliente ALGAMAR
    const [clientes] = await sequelize.query(
      `SELECT id, nombre_razon_social, numero_documento
       FROM clientes
       WHERE nombre_razon_social ILIKE '%ALGAMAR%'`
    ) as [any[], unknown];

    if (!clientes.length) {
      console.error('No se encontró ningún cliente que coincida con ALGAMAR.');
      process.exit(1);
    }
    if (clientes.length > 1) {
      console.warn('Se encontraron varios clientes ALGAMAR:');
      clientes.forEach((c: any) => console.log(`  id=${c.id} → ${c.nombre_razon_social} (${c.numero_documento})`));
      console.error('Especificar cuál usar y ajustar el script.');
      process.exit(1);
    }

    const nuevoCliente = clientes[0];
    const odp = odps[0];

    console.log(`\nActualizando ODP ${odp.numero_odp}:`);
    console.log(`  cliente anterior: [${odp.cliente_id}] ${odp.cliente_actual}`);
    console.log(`  cliente nuevo:    [${nuevoCliente.id}] ${nuevoCliente.nombre_razon_social}`);

    await sequelize.query(
      `UPDATE odp SET cliente_id = :nuevoClienteId WHERE id = :odpId`,
      { replacements: { nuevoClienteId: nuevoCliente.id, odpId: odp.id } }
    );

    console.log('\n✅ ODP actualizada correctamente.');
    process.exit(0);
  } catch (e: any) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
