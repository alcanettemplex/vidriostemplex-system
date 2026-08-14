import sequelize from '../config/database';
import CatalogoProducto from '../models/catalogo_producto.model';

async function updateEsAluminio() {
  const codigos = [
    'PIS0401', '965MPER', 'ANG0204', 'PERF001', 'PIS0101', 
    'PIS0102', 'PIS0103', 'PIS0204', 'PIS0304', 'PIS0405', 
    'PIS0601', 'PIS0602', 'PLP1203', 'PT-0201'
  ];

  try {
    await sequelize.authenticate();
    console.log('Actualizando productos...');
    
    const [afectados] = await CatalogoProducto.update(
      { es_aluminio: true },
      { 
        where: { 
          codigo: codigos 
        } 
      }
    );

    console.log(`¡Éxito! Se actualizaron ${afectados} productos a es_aluminio = true.`);
  } catch (error) {
    console.error('Error al actualizar:', error);
  } finally {
    await sequelize.close();
  }
}

updateEsAluminio();
