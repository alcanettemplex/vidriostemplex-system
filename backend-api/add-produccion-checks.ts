import { Sequelize } from 'sequelize';
import * as dotenv from 'dotenv';
dotenv.config();

const sequelize = new Sequelize(process.env.DATABASE_URL as string, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: { require: true, rejectUnauthorized: false }
  },
  logging: false,
});

async function addCols() {
  try {
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');

    const queryInterface = sequelize.getQueryInterface();

    await queryInterface.addColumn('odp', 'chk_medicion', {
      type: 'BOOLEAN',
      defaultValue: false,
    });
    console.log('Added chk_medicion');

    await queryInterface.addColumn('odp', 'chk_corte', {
      type: 'BOOLEAN',
      defaultValue: false,
    });
    console.log('Added chk_corte');

    await queryInterface.addColumn('odp', 'chk_vidrio', {
        type: 'BOOLEAN',
        defaultValue: false,
    });
    console.log('Added chk_vidrio');

    await queryInterface.addColumn('odp', 'chk_accesorios', {
        type: 'BOOLEAN',
        defaultValue: false,
    });
    console.log('Added chk_accesorios');

    console.log('All checks added successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Unable to connect to the database or add columns:', error);
    process.exit(1);
  }
}

addCols();
