import sequelize from '../config/database';

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Conectado a BD.');

    const [ruta] = await sequelize.query(
      `SELECT id, estado FROM rutas_instalacion WHERE id = 37`,
    );
    if (!ruta.length) { console.log('Ruta 37 no existe.'); process.exit(0); }
    console.log('Ruta encontrada:', ruta[0]);

    await sequelize.query(`DELETE FROM ruta_instaladores WHERE ruta_id = 37`);
    console.log('ruta_instaladores eliminados.');

    await sequelize.query(`DELETE FROM ruta_odp WHERE ruta_id = 37`);
    console.log('ruta_odp eliminados.');

    await sequelize.query(`DELETE FROM rutas_instalacion WHERE id = 37`);
    console.log('Ruta 37 eliminada correctamente.');

    process.exit(0);
  } catch (e: any) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
