import 'dotenv/config';
import Sequelize from 'sequelize';
import { Op } from 'sequelize';
import sequelize from './config/database';
import { ODP, Cliente, Usuario } from './models';

const seedOdpsReales = async () => {
  try {
    await sequelize.authenticate();
    console.log('Generando ODPs de prueba para los nuevos asesores...');

    // 1. Obtener los asesores reales recién creados
    const asesores = await Usuario.findAll({ where: { rol: 'asesor_comercial' } });
    if (asesores.length === 0) throw new Error('No hay asesores creados.');

    // 2. Crear un par de clientes de prueba si no existen
    const clientesNombres = ['Constructora Bolívar', 'Arquitectura y Concreto', 'Ingeniería SAS', 'Juan Pérez'];
    const clientes = [];
    for (const nombre of clientesNombres) {
      let cliente = await Cliente.findOne({ where: { nombre_razon_social: nombre } });
      if (!cliente) {
        cliente = await Cliente.create({
          nombre_razon_social: nombre,
          tipo_documento: 'NIT',
          numero_documento: Math.floor(Math.random() * 900000000).toString(),
          email: `${nombre.replace(/\s/g, '').toLowerCase()}@test.com`,
          telefono: '3000000000',
          direccion: 'Av Principal 123'
        });
      }
      clientes.push(cliente);
    }

    // 3. Crear 15 ODPs distribuidas
    const estados = ['EN_ESPERA', 'MEDICION', 'PEDIDO_PROVEEDOR', 'ALUMINIO_CORTADO', 'VIDRIO_RECIBIDO', 'ACCESORIOS_SEPARADOS', 'LISTO_INSTALAR', 'PROGRAMADA', 'INSTALADA', 'ENTREGADA'];
    
    for (let i = 1; i <= 15; i++) {
        const asesorId = asesores[i % asesores.length].getDataValue('id');
        const clienteId = clientes[i % clientes.length].getDataValue('id');
        const abono = Math.floor(Math.random() * 5000000) + 1000000;
        const pendiente = Math.random() > 0.5 ? Math.floor(Math.random() * 2000000) : 0;
        
        // Distribuir algunas en meses pasados para gráficas mensuales
        const fechaCreacion = new Date();
        fechaCreacion.setDate(fechaCreacion.getDate() - Math.floor(Math.random() * 60)); // hasta 2 meses atras

        const fechaEntrega = new Date();
        fechaEntrega.setDate(fechaEntrega.getDate() + (Math.floor(Math.random() * 20) - 10)); // Algunas vencidas, otras a futuro

        const estadoP = estados[Math.floor(Math.random() * estados.length)];

        await ODP.create({
            numero_odp: `ODP-${20300 + i}`,
            cliente_id: clienteId,
            asesor_id: asesorId,
            tipo_servicio: i % 2 === 0 ? 'Suministro_e_Instalacion' : 'Solo_Suministro',
            direccion_instalacion: 'Dirección Test ' + i,
            fecha_entrega: fechaEntrega.toISOString().split('T')[0],
            descripcion_pedido: 'Pedido de muestra automático ' + i,
            estado_produccion: estadoP,
            estado_caja: pendiente > 0 ? 'PENDIENTE' : 'CANCELADO',
            abono,
            pendiente,
            fecha_creacion: fechaCreacion
        });
    }

    console.log('Se inyectaron 15 ODPs en la base de datos distribuidas entre tus asesores reales.');
    process.exit(0);

  } catch (error) {
    console.error('Error insertando ODPs:', error);
    process.exit(1);
  }
};

seedOdpsReales();
