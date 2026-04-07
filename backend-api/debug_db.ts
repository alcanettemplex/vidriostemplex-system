import { sequelize } from './src/models';

(async () => {
  try {
    const [results] = await sequelize.query(`
      SELECT column_name, data_type, character_maximum_length 
      FROM information_schema.columns 
      WHERE table_name = 'usuarios' AND column_name = 'rol'
    `);
    console.log(JSON.stringify(results, null, 2));
    
    // Si data_type character varying y max length 20, tenemos nuestro problema
    const rolColumn = results[0] as any;
    if (rolColumn && rolColumn.character_maximum_length && rolColumn.character_maximum_length < 24) {
      console.log('Detectado VARCHAR demasiado corto. Expandiendo...');
      await sequelize.query(`ALTER TABLE usuarios ALTER COLUMN rol TYPE VARCHAR(50);`);
      console.log('Columna rol expandida a VARCHAR(50).');
    }
  } catch (err) {
    console.error('Error DB:', err);
  } finally {
    process.exit(0);
  }
})();
