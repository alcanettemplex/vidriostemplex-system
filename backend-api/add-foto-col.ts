import { sequelize } from './src/models';
import { DataTypes } from 'sequelize';

async function addFotoInstalacionCol() {
    const queryInterface = sequelize.getQueryInterface();
    try {
        await queryInterface.addColumn('odp', 'foto_instalacion_url', {
            type: DataTypes.STRING(1000),
            allowNull: true
        });
        console.log('Columna foto_instalacion_url agregada (1000 max).');
    } catch (error: any) {
        if (error.message.includes('already exists')) {
            console.log('La columna foto_instalacion_url ya existe.');
        } else {
            console.error('Error al agregar columna:', error);
        }
    }
    process.exit(0);
}

addFotoInstalacionCol();
