import { Request, Response } from 'express';
import { z } from 'zod';
import { Op, fn, col } from 'sequelize';
import { ODP, Cliente, Usuario, sequelize } from '../models';
import Pago from '../models/pago.model';

const pagoSchema = z.object({
  odp_id: z.number().int().positive('ODP requerida'),
  monto: z.number().positive('El monto debe ser mayor a 0'),
  metodo_pago: z.string().min(1, 'El método de pago es requerido'),
  referencia_pago: z.string().optional(),
  observaciones: z.string().optional(),
});

/**
 * Resumen financiero global para el módulo de contabilidad.
 * Calcula KPIs a partir de ODPs y pagos registrados.
 */
export const getResumenFinanciero = async (_req: Request, res: Response) => {
  try {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Totales generales
    const totalAbonado = (await ODP.sum('abono')) || 0;

    // Pendiente real: valor_total - abono para ODPs no canceladas (evita NULLs en campo pendiente)
    const odpsActivas = await ODP.findAll({
      where: { estado_caja: { [Op.notIn]: ['CANCELADO'] } },
      attributes: ['valor_total', 'abono'],
      raw: true,
    });
    const totalPendiente = (odpsActivas as any[]).reduce((sum, o) => {
      return sum + Math.max(0, Number(o.valor_total || 0) - Number(o.abono || 0));
    }, 0);

    // Facturadas: tiene numero FE o estado = FACTURADA
    const totalFacturadas = await ODP.count({
      where: {
        [Op.or]: [
          { estado_facturacion: 'FACTURADA' },
          { factura_electronica: { [Op.ne]: null } },
        ],
      },
    });
    const totalPendFactura = await ODP.count({
      where: {
        estado_facturacion: 'PENDIENTE',
        factura_electronica: null,
      },
    });

    // Totales del mes
    const abonoMes =
      (await ODP.sum('abono', { where: { fecha_creacion: { [Op.gte]: firstDayOfMonth } } })) || 0;
    const pendienteMes =
      (await ODP.sum('pendiente', { where: { fecha_creacion: { [Op.gte]: firstDayOfMonth } } })) || 0;

    // Cartera vencida (ODPs con pendiente > 0 y fecha_entrega pasada)
    const carteraVencida = await ODP.findAll({
      where: {
        pendiente: { [Op.gt]: 0 },
        fecha_entrega: { [Op.lt]: today },
        estado_caja: { [Op.notIn]: ['CANCELADO'] },
      },
      include: [{ model: Cliente, as: 'cliente' }],
      order: [['fecha_entrega', 'ASC']],
      limit: 10,
    });

    const totalCarteraVencida = await ODP.sum('pendiente', {
      where: {
        pendiente: { [Op.gt]: 0 },
        fecha_entrega: { [Op.lt]: today },
        estado_caja: { [Op.notIn]: ['CANCELADO'] },
      },
    });

    const fmt = (n: number) =>
      new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

    const carteraDetalle = carteraVencida.map((odp: any) => {
      const diffTime = Math.abs(today.getTime() - new Date(odp.fecha_entrega).getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return {
        odp: odp.numero_odp,
        cliente: odp.cliente?.nombre_razon_social || 'Sin cliente',
        pendiente: fmt(Number(odp.pendiente)),
        dias_vencido: diffDays,
      };
    });

    // Pagos recientes
    const pagosRecientes = await Pago.findAll({
      include: [
        { model: ODP, as: 'odp', attributes: ['id', 'numero_odp'] },
        { model: Usuario, as: 'registrador', attributes: ['id', 'nombre_completo'] },
      ],
      order: [['fecha', 'DESC']],
      limit: 10,
    });

    res.json({
      total_abonado: fmt(Number(totalAbonado)),
      total_pendiente: fmt(Number(totalPendiente)),
      total_facturadas: totalFacturadas,
      pendientes_factura: totalPendFactura,
      abono_mes: fmt(Number(abonoMes)),
      pendiente_mes: fmt(Number(pendienteMes)),
      cartera_vencida: fmt(Number(totalCarteraVencida) || 0),
      cartera_detalle: carteraDetalle,
      pagos_recientes: pagosRecientes,
    });
  } catch (error) {
    console.error('Error en resumen financiero:', error);
    res.status(500).json({ error: 'Error al calcular resumen financiero' });
  }
};

/**
 * Lista todos los pagos registrados con información de ODP y cliente.
 */
export const getPagos = async (_req: Request, res: Response) => {
  try {
    const pagos = await Pago.findAll({
      include: [
        {
          model: ODP,
          as: 'odp',
          attributes: ['id', 'numero_odp', 'cliente_id'],
          include: [{ model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] }],
        },
        { model: Usuario, as: 'registrador', attributes: ['id', 'nombre_completo'] },
      ],
      order: [['fecha', 'DESC']],
    });
    res.json(pagos);
  } catch (error) {
    console.error('Error al obtener pagos:', error);
    res.status(500).json({ error: 'Error al obtener pagos' });
  }
};

/**
 * Lista los pagos de una ODP específica.
 */
export const getPagosPorODP = async (req: Request, res: Response) => {
  try {
    const { odp_id } = req.params;
    const pagos = await Pago.findAll({
      where: { odp_id: Number(odp_id) },
      include: [{ model: Usuario, as: 'registrador', attributes: ['id', 'nombre_completo'] }],
      order: [['fecha', 'ASC']],
    });
    res.json(pagos);
  } catch (error) {
    console.error('Error al obtener pagos por ODP:', error);
    res.status(500).json({ error: 'Error al obtener pagos de la ODP' });
  }
};

/**
 * Registra un pago y actualiza automáticamente el abono y pendiente de la ODP.
 * Cambia el estado_caja a ABONADO o CANCELADO según corresponda.
 */
export const registrarPago = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const data = pagoSchema.parse(req.body);
    const userId = (req as any).user?.id;
    if (!userId) {
      await t.rollback();
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    // Verificar ODP
    const odp = await ODP.findByPk(data.odp_id, { transaction: t });
    if (!odp) {
      await t.rollback();
      return res.status(404).json({ error: 'ODP no encontrada' });
    }

    // Crear pago
    const pago = await Pago.create(
      {
        ...data,
        registrado_por: userId,
      } as any,
      { transaction: t },
    );

    // Actualizar financiero de la ODP
    // Derivar pendiente desde valor_total - abono para evitar errores por campo pendiente NULL
    const valorTotal = Number(odp.getDataValue('valor_total')) || 0;
    const abonoActual = Number(odp.getDataValue('abono')) || 0;
    const nuevoAbono = abonoActual + data.monto;
    const nuevoPendiente = Math.max(0, valorTotal - nuevoAbono);

    // Determinar nuevo estado de caja
    let nuevoEstadoCaja = 'ABONADO';
    if (nuevoPendiente <= 0) {
      nuevoEstadoCaja = 'CANCELADO';
    }

    await odp.update(
      {
        abono: nuevoAbono,
        pendiente: nuevoPendiente,
        estado_caja: nuevoEstadoCaja,
      },
      { transaction: t },
    );

    await t.commit();

    // Notificación por socket
    import('../server')
      .then(({ io }) => {
        io.emit('notification', {
          type: 'PAGO_REGISTRADO',
          message: `Pago de ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(data.monto)} registrado en ${odp.getDataValue('numero_odp')}`,
          notificacionPara: ['admin', 'gerencia', 'contabilidad'],
          timestamp: new Date(),
        });
      })
      .catch((err) => console.error('Error emitiendo socket de pago:', err));

    res.status(201).json({
      message: 'Pago registrado correctamente',
      pago,
      odp_actualizada: {
        abono: nuevoAbono,
        pendiente: nuevoPendiente,
        estado_caja: nuevoEstadoCaja,
      },
    });
  } catch (error: any) {
    try {
      await t.rollback();
    } catch (_) {
      /* ya hicimos commit/rollback */
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos', detalles: (error as any).errors });
    }
    console.error('Error al registrar pago:', error);
    res.status(500).json({ error: error.message || 'Error al registrar pago' });
  }
};
