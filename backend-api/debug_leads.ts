import { Lead } from './src/models';
import sequelize from './src/config/database';

async function debug() {
  try {
    await sequelize.authenticate();
    console.log('DB Connected');
    const description = await sequelize.getQueryInterface().describeTable('leads');
    console.log('TABLE LEADS DESCRIPTION:');
    console.log(JSON.stringify(description, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('DEBUG ERROR:', err);
    process.exit(1);
  }
}
debug();
