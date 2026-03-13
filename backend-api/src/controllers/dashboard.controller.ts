import { Request, Response } from 'express';
import { Op, fn, col, literal } from 'sequelize';
import { ODP, Cliente } from '../models';
import sequelize from '../config/database';

/**
 * Controlador del Dashboard Gerencial.
 * Calcula KPIs reales en base a los datos de la DB.
 */
export const getDashboardData = async (_req: Request, res: Response) => {
  try {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // ─── 1. Ventas del Mes ─────────────────────────────────────────────
    const odpsMes = await ODP.findAll({
      where: {
        fecha_creacion: { [Op.gte]: firstDayOfMonth },
      },
    });

    let ventasMesTotal = 0;
    let abonosTotal = 0;
    let pendienteTotal = 0;

    odpsMes.forEach((odp) => {
      const abono = Number(odp.getDataValue('abono')) || 0;
      const pendiente = Number(odp.getDataValue('pendiente')) || 0;
      ventasMesTotal += abono + pendiente;
      abonosTotal += abono;
      pendienteTotal += pendiente;
    });

    // ─── 2. Pedidos en Producción ──────────────────────────────────────
    const enProduccion = await ODP.count({
      where: {
        estado_produccion: {
          [Op.in]: [
            'MEDICION',
            'PEDIDO_PROVEEDOR',
            'ALUMINIO_CORTADO',
            'VIDRIO_RECIBIDO',
            'ACCESORIOS_SEPARADOS',
            'LISTO_INSTALAR',
            'PROGRAMADA',
          ],
        },
      },
    });

    // ─── 3. Pedidos Atrasados (con cálculo real de días) ───────────────
    const atrasadosData = await ODP.findAll({
      where: {
        fecha_entrega: { [Op.lt]: today },
        estado_produccion: { [Op.notIn]: ['ENTREGADA', 'INSTALADA'] },
      },
      include: [{ model: Cliente, as: 'cliente' }],
      order: [['fecha_entrega', 'ASC']],
      limit: 5,
    });

    const pedidos_atrasados = await ODP.count({
      where: {
        fecha_entrega: { [Op.lt]: today },
        estado_produccion: { [Op.notIn]: ['ENTREGADA', 'INSTALADA'] },
      },
    });

    const alertas_atrasos = atrasadosData.map((odp: any) => {
      const diffTime = Math.abs(today.getTime() - new Date(odp.fecha_entrega).getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return {
        odp: odp.numero_odp,
        cliente: odp.cliente?.nombre_razon_social || 'Sin cliente',
        dias: diffDays,
        estado: odp.estado_produccion,
      };
    });

    // ─── 4. Margen Promedio (calculado sobre abono vs total) ───────────
    const margen_promedio =
      ventasMesTotal > 0 ? `${((abonosTotal / ventasMesTotal) * 100).toFixed(1)}%` : '0.0%';

    // Formato moneda COP
    const formatter = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

    // ─── 5. Cuentas por Cobrar ─────────────────────────────────────────
    const porCobrarData = await ODP.findAll({
      where: {
        pendiente: { [Op.gt]: 0 },
        estado_caja: { [Op.notIn]: ['CANCELADO'] },
      },
      include: [{ model: Cliente, as: 'cliente' }],
      order: [['fecha_creacion', 'ASC']],
      limit: 5,
    });

    const totalPorCobrar = await ODP.sum('pendiente', {
      where: {
        pendiente: { [Op.gt]: 0 },
        estado_caja: { [Op.notIn]: ['CANCELADO'] },
      },
    });

    const alertas_cartera = porCobrarData.map((odp: any) => {
      const diffTime = Math.abs(today.getTime() - new Date(odp.fecha_creacion).getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return {
        cliente: odp.cliente?.nombre_razon_social || 'Sin cliente',
        odp: odp.numero_odp,
        monto: formatter.format(Number(odp.pendiente)),
        dias_vencido: diffDays,
      };
    });

    // ─── 6. Distribución de estados (para gráfico) ─────────────────────
    const distribucionEstados = await ODP.findAll({
      attributes: ['estado_produccion', [fn('COUNT', col('id')), 'total']],
      group: ['estado_produccion'],
      raw: true,
    });

    // ─── 7. ODPs por mes (últimos 6 meses) ─────────────────────────────
    const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 5, 1);
    const odpsPorMes = await ODP.findAll({
      attributes: [
        [fn('DATE_TRUNC', 'month', col('fecha_creacion')), 'mes'],
        [fn('COUNT', col('id')), 'total'],
        [fn('SUM', col('abono')), 'total_abonos'],
        [fn('SUM', col('pendiente')), 'total_pendiente'],
      ],
      where: {
        fecha_creacion: { [Op.gte]: sixMonthsAgo },
      },
      group: [fn('DATE_TRUNC', 'month', col('fecha_creacion'))],
      order: [[fn('DATE_TRUNC', 'month', col('fecha_creacion')), 'ASC']],
      raw: true,
    });

    // ─── 8. Totales generales ──────────────────────────────────────────
    const totalODPs = await ODP.count();
    const totalClientes = await Cliente.count();
    const odpsMesCount = odpsMes.length;

    res.json({
      // KPIs principales
      ventas_mes: formatter.format(ventasMesTotal),
      en_produccion: enProduccion,
      pedidos_atrasados,
      flujo_caja: formatter.format(abonosTotal),
      total_por_cobrar: formatter.format(totalPorCobrar || 0),
      margen_recaudo: margen_promedio,

      // Totales
      total_odps: totalODPs,
      total_clientes: totalClientes,
      odps_este_mes: odpsMesCount,

      // Datos para gráficas
      distribucion_estados: distribucionEstados,
      tendencia_mensual: odpsPorMes,

      // Alertas
      alertas_atrasos,
      alertas_cartera,

      // Actividad reciente
      actividad: [
        {
          tipo: 'resumen_mes',
          texto: `${odpsMesCount} ODPs creadas este mes`,
          detalle: `${formatter.format(abonosTotal)} cobrado / ${formatter.format(pendienteTotal)} pendiente`,
        },
      ],
    });
  } catch (error) {
    console.error('Error calculando dashboard gerencial:', error);
    res.status(500).json({ error: 'Error del servidor al calcular dashboard' });
  }
};
