import 'dotenv/config';
import Usuario from './models/usuario.model';
import sequelize from './config/database';

const updateName = async () => {
  try {
    await sequelize.authenticate();
    
    // Buscar al usuario por el nombre antiguo o por el username aproximado si el nombre se insertó mal
    const user = await Usuario.findOne({ 
      where: { 
        nombre_completo: 'Alejandro Arcila' 
      } 
    });

    if (user) {
      await user.update({ 
        nombre_completo: 'Alejandro Ardila'
        // También podríamos actualizar el correo/username si lo consideramos necesario,
        // pero para evitar romper inicios de sesión, solo cambiaré el nombre para visualización.
      });
      console.log('Nombre de asesor actualizado existosamente a Alejandro Ardila.');
    } else {
      console.log('No se encontró al asesor Alejandro Arcila. Quizás ya fue actualizado.');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error actualizando el nombre del asesor:', error);
    process.exit(1);
  }
};

updateName();
