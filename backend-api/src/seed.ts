import sequelize from './config/database';
import { Usuario, Vehiculo } from './models';
import bcrypt from 'bcrypt';

(async () => {
    try {
        await sequelize.sync({ force: true });
        const hash = await bcrypt.hash('123456', 10);

        // Usuarios
        await Usuario.create({ username: 'admin', nombre_completo: 'Administrador Templex', email: 'admin@templex.com', password_hash: hash, rol: 'admin', estado: 'activo' });
        await Usuario.create({ username: 'asesor1', nombre_completo: 'Asesor Comercial Uno', email: 'asesor1@templex.com', password_hash: hash, rol: 'asesor_comercial', estado: 'activo' });
        await Usuario.create({ username: 'jefeprod', nombre_completo: 'Jefe de Produccion', email: 'jefe@templex.com', password_hash: hash, rol: 'jefe_produccion', estado: 'activo' });
        await Usuario.create({ username: 'auxproduccion', nombre_completo: 'Auxiliar de Produccion', email: 'auxiliar@templex.com', password_hash: hash, rol: 'auxiliar_produccion', estado: 'activo' });
        const inst1 = await Usuario.create({ username: 'instalador1', nombre_completo: 'Juan Montador (Moto)', email: 'inst1@templex.com', password_hash: hash, rol: 'instalador', estado: 'activo' });
        const inst2 = await Usuario.create({ username: 'instalador2', nombre_completo: 'Pedro Montador (Moto)', email: 'inst2@templex.com', password_hash: hash, rol: 'instalador', estado: 'activo' });
        const inst3 = await Usuario.create({ username: 'instalador3', nombre_completo: 'Carlos Montador (Camion)', email: 'inst3@templex.com', password_hash: hash, rol: 'instalador', estado: 'activo' });

        // Vehiculos
        await Vehiculo.create({ tipo: 'moto', placa: 'MTO-001', estado: 'activo' });
        await Vehiculo.create({ tipo: 'moto', placa: 'MTO-002', estado: 'activo' });
        await Vehiculo.create({ tipo: 'moto', placa: 'MTO-003', estado: 'mantenimiento' });
        await Vehiculo.create({ tipo: 'camion', placa: 'CAM-999', estado: 'activo' });

        console.log('Base de datos inicializada: Admin, Asesor, Instaladores, y Flota Comercial 3 Motos + 1 Camion.');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding data:', error);
        process.exit(1);
    }
})();
