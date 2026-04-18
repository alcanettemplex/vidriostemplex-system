import { Request, Response } from 'express';
import { z } from 'zod';
import { Op } from 'sequelize';
import { ODP, Cliente, Usuario, Pago, sequelize } from '../models';

// Helper: recalcula abono/pendiente/estado_caja de una ODP a partir de sus pagos actuales
const recalcularFinanciero = async (odp_id: number, t: any) => {
  const odp = await ODP.findByPk(odp_id, { transaction: t });
  if (!odp) throw new Error('ODP no encontrada');

  const pagos = await Pago.findAll({ where: { odp_id }, transaction: t, attributes: ['monto'] });
  const nuevoAbono = (pagos as any[]).reduce((s, p) => s + Number(p.getDataValue('monto') || 0), 0);
  const valorTotal = Number(odp.getDataValue('valor_total')) || 0;
  const nuevoPendiente = Math.max(0, valorTotal - nuevoAbono);
  const estadoActual: string = odp.getDataValue('estado_caja');

  let nuevoEstadoCaja = estadoActual;
  if (estadoActual !== 'CREDITO_APROBADO') {
    if (nuevoPendiente <= 0) nuevoEstadoCaja = 'CANCELADO';
    else if (nuevoAbono > 0) nuevoEstadoCaja = 'ABONADO';
    else nuevoEstadoCaja = 'PENDIENTE';
  } else {
    if (nuevoPendiente <= 0) nuevoEstadoCaja = 'CANCELADO';
  }

  await odp.update({ abono: nuevoAbono, pendiente: nuevoPendiente, estado_caja: nuevoEstadoCaja }, { transaction: t });
  return { abono: nuevoAbono, pendiente: nuevoPendiente, estado_caja: nuevoEstadoCaja };
};

const pagoSchema = z.object({
  odp_id: z.number().int().positive('ODP requerida'),
  monto: z.number().positive('El monto debe ser mayor a 0'),
  diferencia: z.number().min(0).optional().default(0), // Descuento adicional que reduce pendiente pero no cuenta en abono
  metodo_pago: z.string().min(1, 'El método de pago es requerido'),
  referencia_pago: z.string().optional(),
  observaciones: z.string().optional(),
  fecha: z.string().optional(), // ISO date string YYYY-MM-DD; si no se envía usa NOW
});

/**
 * Resumen financiero global para el módulo de contabilidad.
 */
export const getResumenFinanciero = async (_req: Request, res: Response) => {
  try {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Totales generales
    const totalAbonado = (await ODP.sum('abono')) || 0;

    // Pendiente real
    const odpsActivas = await ODP.findAll({
      where: { estado_caja: { [Op.notIn]: ['CANCELADO'] } },
      attributes: ['valor_total', 'abono'],
    });
    const totalPendiente = odpsActivas.reduce((sum, o) => {
      return sum + Math.max(0, Number(o.getDataValue('valor_total') || 0) - Number(o.getDataValue('abono') || 0));
    }, 0);

    const totalFacturadas = await ODP.count({
      where: {
        tipo_odp: 'ODP',
        [Op.or]: [
          { estado_facturacion: 'FACTURADA' },
          { factura_electronica: { [Op.ne]: null } },
        ],
      },
    });
    const totalPendFactura = await ODP.count({
      where: { tipo_odp: 'ODP', estado_facturacion: 'PENDIENTE', factura_electronica: null },
    });

    const abonoMes = (await ODP.sum('abono', { where: { fecha_creacion: { [Op.gte]: firstDayOfMonth } } })) || 0;
    const pendienteMes = (await ODP.sum('pendiente', { where: { fecha_creacion: { [Op.gte]: firstDayOfMonth } } })) || 0;

    const fmtCurrency = (n: number) =>
      new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

    // Cartera vencida
    const carteraVencidaRecords = await ODP.findAll({
      where: {
        pendiente: { [Op.gt]: 0 },
        estado_caja: { [Op.notIn]: ['CANCELADO'] },
        [Op.or]: [
          { fecha_entrega: { [Op.lt]: today }, estado_caja: { [Op.notIn]: ['CANCELADO', 'CREDITO_APROBADO'] } },
          { estado_caja: 'CREDITO_APROBADO', fecha_vencimiento_credito: { [Op.lt]: today, [Op.ne]: null } },
        ],
      },
      include: [
        { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] },
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
      ],
      order: [['fecha_entrega', 'ASC']],
      limit: 15,
    });

    const totalCarteraVencida = await ODP.sum('pendiente', {
      where: {
        pendiente: { [Op.gt]: 0 },
        estado_caja: { [Op.notIn]: ['CANCELADO'] },
        [Op.or]: [
          { fecha_entrega: { [Op.lt]: today }, estado_caja: { [Op.notIn]: ['CANCELADO', 'CREDITO_APROBADO'] } },
          { estado_caja: 'CREDITO_APROBADO', fecha_vencimiento_credito: { [Op.lt]: today, [Op.ne]: null } },
        ],
      },
    });

    const carteraDetalle = carteraVencidaRecords.map((odp: any) => {
      const esCreditoVencido = odp.estado_caja === 'CREDITO_APROBADO';
      const fechaRefStr = esCreditoVencido ? odp.fecha_vencimiento_credito : odp.fecha_entrega;
      const todayTime = new Date().setHours(0,0,0,0);
      const fechaRef = fechaRefStr ? new Date(fechaRefStr) : new Date(todayTime);
      fechaRef.setHours(0,0,0,0);
      
      const diffTime = todayTime - fechaRef.getTime();
      const diffDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

      return {
        odp: odp.numero_odp,
        cliente: odp.cliente?.nombre_razon_social || 'Sin cliente',
        asesor: odp.asesor?.nombre_completo || '—',
        pendiente: fmtCurrency(Number(odp.pendiente) || 0),
        dias_vencido: diffDays,
        tipo_vencimiento: esCreditoVencido ? 'credito' : 'entrega',
        fecha_creacion: odp.fecha_creacion,
      };
    });

    const pagosRecientes = await Pago.findAll({
      include: [
        { 
          model: ODP, 
          as: 'odp', 
          attributes: ['id', 'numero_odp', 'fecha_creacion', 'cliente_id', 'asesor_id'],
          include: [
            { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] },
            { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] }
          ]
        },
        { model: Usuario, as: 'registrador', attributes: ['id', 'nombre_completo'] },
      ],
      order: [['fecha', 'DESC']],
      limit: 10,
    });

    res.json({
      total_abonado: fmtCurrency(Number(totalAbonado) || 0),
      total_pendiente: fmtCurrency(Number(totalPendiente) || 0),
      total_facturadas: totalFacturadas,
      pendientes_factura: totalPendFactura,
      abono_mes: fmtCurrency(Number(abonoMes) || 0),
      pendiente_mes: fmtCurrency(Number(pendienteMes) || 0),
      cartera_vencida: fmtCurrency(Number(totalCarteraVencida) || 0),
      cartera_detalle: carteraDetalle,
      pagos_recientes: pagosRecientes,
    });
  } catch (error) {
    console.error('Error en resumen financiero:', error);
    res.status(500).json({ error: 'Error al calcular resumen financiero' });
  }
};

/**
 * Lista todos los pagos registrados con información detallada.
 */
export const getPagos = async (_req: Request, res: Response) => {
  try {
    const pagos = await Pago.findAll({
      include: [
        {
          model: ODP,
          as: 'odp',
          attributes: ['id', 'numero_odp', 'fecha_creacion', 'cliente_id', 'asesor_id'],
          include: [
            { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] },
            { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
          ],
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
    const userId = req.user?.id;
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

    // Crear pago — usar T12:00:00Z para evitar offset de zona horaria al mostrar en Bogotá
    const fechaPago = data.fecha ? new Date(data.fecha + 'T12:00:00.000Z') : new Date();
    const pago = await Pago.create(
      {
        ...data,
        fecha: fechaPago,
        registrado_por: userId,
      } as any,
      { transaction: t },
    );

    // Actualizar financiero de la ODP
    // monto: se suma al abono (aparece en stats)
    // diferencia: reduce el pendiente adicional sin contar en abono (descuento o ajuste)
    const valorTotal = Number(odp.getDataValue('valor_total')) || 0;
    const abonoActual = Number(odp.getDataValue('abono')) || 0;
    const nuevoAbono = abonoActual + data.monto; // stats solo usan monto
    const pendienteActual = Math.max(0, valorTotal - abonoActual);
    const nuevoPendiente = Math.max(0, pendienteActual - data.monto - (data.diferencia || 0));

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

const pagoEditSchema = z.object({
  monto: z.number().positive('El monto debe ser mayor a 0').optional(),
  metodo_pago: z.string().min(1).optional(),
  referencia_pago: z.string().optional().nullable(),
  observaciones: z.string().optional().nullable(),
  fecha: z.string().optional().nullable(), // ISO date string YYYY-MM-DD
});

/**
 * Edita un pago existente y recalcula el financiero de la ODP automáticamente.
 */
export const editarPago = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const data = pagoEditSchema.parse(req.body);

    const pago = await Pago.findByPk(id, { transaction: t });
    if (!pago) {
      await t.rollback();
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    const updateData: any = { ...data };
    if (data.fecha) updateData.fecha = new Date(data.fecha + 'T12:00:00.000Z');
    await pago.update(updateData, { transaction: t });
    const odp_id = Number(pago.getDataValue('odp_id'));
    const financiero = await recalcularFinanciero(odp_id, t);

    await t.commit();
    import('../server').then(({ emitirCambio }) => emitirCambio('contabilidad')).catch(() => {});
    res.json({ message: 'Pago actualizado', pago, odp_actualizada: financiero });
  } catch (error: any) {
    try { await t.rollback(); } catch (_) { /* ya hecho */ }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos', detalles: error.issues });
    }
    console.error('Error al editar pago:', error);
    res.status(500).json({ error: error.message || 'Error al editar pago' });
  }
};

/**
 * Elimina un pago y recalcula el financiero de la ODP automáticamente.
 * El estado_caja se revierte a PENDIENTE/ABONADO si corresponde.
 */
export const eliminarPago = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;

    const pago = await Pago.findByPk(id, { transaction: t });
    if (!pago) {
      await t.rollback();
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    const odp_id = Number(pago.getDataValue('odp_id'));
    await pago.destroy({ transaction: t });
    const financiero = await recalcularFinanciero(odp_id, t);

    await t.commit();
    import('../server').then(({ emitirCambio }) => emitirCambio('contabilidad')).catch(() => {});
    res.json({ message: 'Pago eliminado', odp_actualizada: financiero });
  } catch (error: any) {
    try { await t.rollback(); } catch (_) { /* ya hecho */ }
    console.error('Error al eliminar pago:', error);
    res.status(500).json({ error: error.message || 'Error al eliminar pago' });
  }
};
