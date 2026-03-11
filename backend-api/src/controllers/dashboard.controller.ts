import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { ODP, Cliente } from '../models';
import sequelize from '../config/database';

export const getDashboardData = async (_req: Request, res: Response) => {
  try {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // 1. Ventas del Mes (Abono + Pendiente de ODPs creadas este mes)
    const odpsMes = await ODP.findAll({
      where: {
        fecha_creacion: {
          [Op.gte]: firstDayOfMonth
        }
      }
    });

    let ventasMesTotal = 0;
    let abonosTotal = 0;
    
    odpsMes.forEach(odp => {
       const abono = Number(odp.getDataValue('abono')) || 0;
       const pendiente = Number(odp.getDataValue('pendiente')) || 0;
       ventasMesTotal += (abono + pendiente);
       abonosTotal += abono;
    });

    // 2. Pedidos en Producción (Estados intermedios)
    const enProduccion = await ODP.count({
      where: {
        estado_produccion: {
          [Op.in]: ['MEDICION', 'PEDIDO_PROVEEDOR', 'ALUMINIO_CORTADO', 'VIDRIO_RECIBIDO', 'ACCESORIOS_SEPARADOS', 'LISTO_INSTALAR', 'PROGRAMADA']
        }
      }
    });

    // 3. Pedidos Atrasados (fecha_entrega < hoy y no entregada)
    const atrasadosData = await ODP.findAll({
      where: {
        fecha_entrega: {
          [Op.lt]: today
        },
        estado_produccion: {
          [Op.notIn]: ['ENTREGADA', 'INSTALADA']
        }
      },
      include: [{ model: Cliente, as: 'cliente' }],
      limit: 5,
      order: [['fecha_entrega', 'ASC']]
    });

    const pedidos_atrasados = await ODP.count({
       where: {
         fecha_entrega: {
           [Op.lt]: today
         },
         estado_produccion: {
           [Op.notIn]: ['ENTREGADA', 'INSTALADA']
         }
       }
     });

    const alertas_atrasos = atrasadosData.map((odp: any) => {
       const diffTime = Math.abs(today.getTime() - new Date(odp.fecha_entrega).getTime());
       const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
       return {
         odp: odp.numero_odp,
         cliente: odp.cliente?.nombre_razon_social || 'Cliente Local',
         dias: diffDays
       };
    });

    // 4. Margen Promedio
    // Mismo mock por ahora hasta tener módulo de Costos, asume un estándar de industria
    const margen_promedio = "32.5%";

    // Formatter de moneda
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD', // Usa USD o la moneda local
      minimumFractionDigits: 2
    });

    // 5. Cuentas por cobrar (Clientes con saldo pendiente)
    const porCobrarData = await ODP.findAll({
       where: {
         pendiente: { [Op.gt]: 0 },
         estado_caja: { [Op.notIn]: ['CANCELADO'] }
       },
       include: [{ model: Cliente, as: 'cliente' }],
       order: [['fecha_creacion', 'ASC']],
       limit: 3
    });

    const alertas_cartera = porCobrarData.map((odp: any) => {
      const diffTime = Math.abs(today.getTime() - new Date(odp.fecha_creacion).getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
      return {
        cliente: odp.cliente?.nombre_razon_social || 'Cliente',
        monto: formatter.format(Number(odp.pendiente)),
        dias_vencido: diffDays
      }
    });

    res.json({
      ventas_mes: formatter.format(ventasMesTotal),
      en_produccion: enProduccion,
      pedidos_atrasados: pedidos_atrasados,
      flujo_caja: formatter.format(abonosTotal), // Dinero efectivo cobrado
      margen_promedio: margen_promedio,
      
      alertas_inventario: [
        { item: "Vidrio Templado 10mm Claro", stock: "12 m²", status: "Crítico" },
        { item: "Silicona Estructural Negra", stock: "3 tubos", status: "Crítico" },
        { item: "Herraje Araña Inox", stock: "8 und", status: "Bajo" }
      ],
      alertas_atrasos,
      alertas_cartera,
      actividad: [
         { tipo: 'nueva_venta', texto: 'Nuevos ODPs facturados este mes', tiempo: `+${odpsMes.length} ordenes` }
      ]
    });

  } catch (error) {
    console.error('Error calculando dashboard gerencial:', error);
    res.status(500).json({ error: 'Error del servidor al calcular dashboard' });
  }
};
