import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { z } from 'zod';
import { Cotizacion, CotizacionItem, ODP, Usuario, Cliente, Prospecto, sequelize } from '../models';
import { withUniqueRetry } from '../utils/withUniqueRetry';

// ─── Esquemas Zod ─────────────────────────────────────────────────────────────

const cotizacionItemSchema = z.object({
  seccion: z.enum(['vidrio', 'acabado', 'gasto_instalacion']).default('acabado'),
  descripcion: z.string().min(1, 'La descripción es requerida'),
  codigo: z.string().optional().nullable(),
  cantidad: z.number().positive('La cantidad debe ser mayor a 0'),
  unidad: z.enum(['M2', 'ML', 'UND', 'GL', 'HR', 'X M2', 'X METRO']).default('UND'),
  precio_unitario: z.number().nonnegative('El precio no puede ser negativo'),
  producto_ref: z.string().optional().nullable(),
  orden: z.number().int().optional().default(0),
});

const createCotizacionSchema = z.object({
  cliente_id: z.number().int().positive('El cliente es requerido'),
  prospecto_id: z.number().int().positive().optional().nullable(),
  nombre_proyecto: z.string().optional().nullable(),
  tipo_cliente: z.enum(['PA', 'PM', 'PB']).optional().nullable(),
  descuento: z.number().min(0).max(100).default(0),
  forma_pago: z.string().optional().nullable(),
  validez_dias: z.number().int().positive().default(30),
  notas: z.string().optional().nullable(),
  estado: z.enum(['borrador', 'enviada']).default('borrador'),
  items: z.array(cotizacionItemSchema).min(1, 'Debe ingresar al menos un ítem'),
});

const updateCotizacionSchema = z.object({
  cliente_id: z.number().int().positive().optional(),
  nombre_proyecto: z.string().optional().nullable(),
  tipo_cliente: z.enum(['PA', 'PM', 'PB']).optional().nullable(),
  descuento: z.number().min(0).max(100).optional(),
  forma_pago: z.string().optional().nullable(),
  validez_dias: z.number().int().positive().optional(),
  notas: z.string().optional().nullable(),
  estado: z.enum(['borrador', 'enviada', 'aprobada', 'rechazada', 'vencida']).optional(),
  items: z.array(cotizacionItemSchema).min(1).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generarNumeroCOT = async (): Promise<string> => {
  const last = await Cotizacion.findOne({
    where: { numero_cot: { [Op.like]: 'COT-%' } },
    order: [['numero_cot', 'DESC']],
    attributes: ['numero_cot'],
  });
  let next = 1;
  if (last) {
    const parts = last.getDataValue('numero_cot').split('-');
    next = parseInt(parts[parts.length - 1]) + 1;
  }
  return `COT-${String(next).padStart(4, '0')}`;
};

const generarNumeroODP = async (t?: any): Promise<string> => {
  const lastODP = await ODP.findOne({
    where: { numero_odp: { [Op.like]: 'ODP-%' } },
    order: [['numero_odp', 'DESC']],
    attributes: ['numero_odp'],
    ...(t ? { transaction: t } : {}),
  });
  let next = 1;
  if (lastODP) {
    const parts = lastODP.getDataValue('numero_odp').split('-');
    next = parseInt(parts[parts.length - 1]) + 1;
  }
  return `ODP-${String(next).padStart(4, '0')}`;
};

interface ItemInput {
  seccion: 'vidrio' | 'acabado' | 'gasto_instalacion';
  cantidad: number;
  precio_unitario: number;
  [key: string]: any;
}

const calcularTotales = (items: ItemInput[], descuento: number) => {
  const round = (n: number) => Math.round(n * 100) / 100;

  const total_vidrio = round(
    items.filter(i => i.seccion === 'vidrio')
      .reduce((acc, i) => acc + Number(i.cantidad) * Number(i.precio_unitario), 0)
  );
  const total_acabados = round(
    items.filter(i => i.seccion === 'acabado')
      .reduce((acc, i) => acc + Number(i.cantidad) * Number(i.precio_unitario), 0)
  );
  const total_gastos_instalacion = round(
    items.filter(i => i.seccion === 'gasto_instalacion')
      .reduce((acc, i) => acc + Number(i.cantidad) * Number(i.precio_unitario), 0)
  );
  const subtotal = round(total_vidrio + total_acabados + total_gastos_instalacion);
  const descuento_monto = round(subtotal * (Number(descuento) / 100));
  const base_gravable = round(subtotal - descuento_monto);
  const iva = round(base_gravable * 0.19);
  const valor_total = round(base_gravable + iva);

  return { total_vidrio, total_acabados, total_gastos_instalacion, subtotal, base_gravable, iva, valor_total };
};

const INCLUDE_COMPLETO = [
  { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social', 'telefono', 'direccion'] },
  { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
  {
    model: CotizacionItem,
    as: 'items',
    order: [['seccion', 'ASC'], ['orden', 'ASC']],
  },
  { model: Prospecto, as: 'prospecto', attributes: ['id', 'numero_prospecto'] },
  { model: ODP, as: 'odp' /* alias default */, attributes: ['id', 'numero_odp'], required: false },
];

// ─── Controladores ────────────────────────────────────────────────────────────

export const getCotizaciones = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const userRol = req.user?.rol;
    const { estado, cliente_id } = req.query;

    const where: Record<string, any> = {};
    if (userRol === 'asesor_comercial') where.creado_por = userId;
    if (estado) where.estado = estado;
    if (cliente_id) where.cliente_id = Number(cliente_id);

    const cots = await Cotizacion.findAll({
      where,
      include: [
        { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] },
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
        { model: ODP, attributes: ['id', 'numero_odp'], required: false },
      ],
      order: [['fecha_creacion', 'DESC']],
    });
    res.json(cots);
  } catch (error: any) {
    console.error('getCotizaciones:', error);
    res.status(500).json({ error: 'Error al obtener cotizaciones' });
  }
};

export const getCotizacion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const cot = await Cotizacion.findByPk(id, {
      include: [
        { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social', 'telefono', 'direccion'] },
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
        {
          model: CotizacionItem,
          as: 'items',
        },
        { model: Prospecto, as: 'prospecto', attributes: ['id', 'numero_prospecto'] },
        { model: ODP, attributes: ['id', 'numero_odp'], required: false },
      ],
    });
    if (!cot) return res.status(404).json({ error: 'Cotización no encontrada' });
    res.json(cot);
  } catch (error: any) {
    console.error('getCotizacion:', error);
    res.status(500).json({ error: 'Error al obtener cotización' });
  }
};

export const createCotizacion = async (req: Request, res: Response) => {
  const parsed = createCotizacionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', detalles: parsed.error.flatten() });
  }

  const data = parsed.data;
  const userId = req.user?.id;

  try {
    // Verificar que el cliente existe
    const cliente = await Cliente.findByPk(data.cliente_id);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

    // Verificar prospecto si viene
    if (data.prospecto_id) {
      const prospecto = await Prospecto.findByPk(data.prospecto_id);
      if (!prospecto) return res.status(404).json({ error: 'Prospecto no encontrado' });
    }

    const totales = calcularTotales(data.items, data.descuento);

    const cotId = await withUniqueRetry(async () => {
      const numero_cot = await generarNumeroCOT();
      const t = await sequelize.transaction();
      try {
        const cot = await Cotizacion.create({
          numero_cot,
          cliente_id: data.cliente_id,
          prospecto_id: data.prospecto_id ?? null,
          nombre_proyecto: data.nombre_proyecto ?? null,
          tipo_cliente: data.tipo_cliente ?? null,
          creado_por: userId,
          descuento: data.descuento,
          forma_pago: data.forma_pago ?? null,
          validez_dias: data.validez_dias,
          notas: data.notas ?? null,
          estado: data.estado,
          ...totales,
        }, { transaction: t });

        const id = cot.getDataValue('id');
        const itemsData = data.items.map((item, idx) => ({
          cotizacion_id: id,
          seccion: item.seccion,
          descripcion: item.descripcion,
          codigo: item.codigo ?? null,
          cantidad: item.cantidad,
          unidad: item.unidad,
          precio_unitario: item.precio_unitario,
          producto_ref: item.producto_ref ?? null,
          orden: item.orden ?? idx,
        }));

        await CotizacionItem.bulkCreate(itemsData, { transaction: t });
        await t.commit();
        return id;
      } catch (err) {
        await t.rollback();
        throw err;
      }
    });

    const cotFull = await Cotizacion.findByPk(cotId, {
      include: [
        { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] },
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
        { model: CotizacionItem, as: 'items' },
      ],
    });

    res.status(201).json(cotFull);
  } catch (error: any) {
    console.error('createCotizacion:', error);
    res.status(500).json({ error: 'Error al crear cotización', detail: error.message });
  }
};

export const updateCotizacion = async (req: Request, res: Response) => {
  const parsed = updateCotizacionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', detalles: parsed.error.flatten() });
  }

  const data = parsed.data;
  const { id } = req.params;

  try {
    const cot = await Cotizacion.findByPk(id);
    if (!cot) return res.status(404).json({ error: 'Cotización no encontrada' });

    const estadoActual = cot.getDataValue('estado');
    if (estadoActual === 'aprobada' || estadoActual === 'convertida') {
      return res.status(400).json({ error: `No se puede editar una cotización en estado "${estadoActual}"` });
    }

    const t = await sequelize.transaction();
    try {
      let totales = {};
      if (data.items) {
        const descuento = data.descuento ?? Number(cot.getDataValue('descuento'));
        totales = calcularTotales(data.items, descuento);
        await CotizacionItem.destroy({ where: { cotizacion_id: id }, transaction: t });
        const itemsData = data.items.map((item, idx) => ({
          cotizacion_id: Number(id),
          seccion: item.seccion,
          descripcion: item.descripcion,
          codigo: item.codigo ?? null,
          cantidad: item.cantidad,
          unidad: item.unidad,
          precio_unitario: item.precio_unitario,
          producto_ref: item.producto_ref ?? null,
          orden: item.orden ?? idx,
        }));
        await CotizacionItem.bulkCreate(itemsData, { transaction: t });
      }

      const updateData: Record<string, any> = { ...totales };
      if (data.cliente_id !== undefined) updateData.cliente_id = data.cliente_id;
      if (data.nombre_proyecto !== undefined) updateData.nombre_proyecto = data.nombre_proyecto;
      if (data.tipo_cliente !== undefined) updateData.tipo_cliente = data.tipo_cliente;
      if (data.descuento !== undefined && !data.items) updateData.descuento = data.descuento;
      if (data.forma_pago !== undefined) updateData.forma_pago = data.forma_pago;
      if (data.validez_dias !== undefined) updateData.validez_dias = data.validez_dias;
      if (data.notas !== undefined) updateData.notas = data.notas;
      if (data.estado !== undefined) updateData.estado = data.estado;

      await cot.update(updateData, { transaction: t });
      await t.commit();

      const cotFull = await Cotizacion.findByPk(id, {
        include: [
          { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] },
          { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
          { model: CotizacionItem, as: 'items' },
        ],
      });
      res.json(cotFull);
    } catch (err: any) {
      await t.rollback();
      throw err;
    }
  } catch (error: any) {
    console.error('updateCotizacion:', error);
    res.status(500).json({ error: 'Error al actualizar cotización', detail: error.message });
  }
};

export const cambiarEstado = async (req: Request, res: Response) => {
  const parsed = z.object({
    estado: z.enum(['borrador', 'enviada', 'aprobada', 'rechazada', 'vencida']),
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: 'Estado inválido', detalles: parsed.error.flatten() });
  }

  const { id } = req.params;
  const { estado } = parsed.data;

  try {
    const cot = await Cotizacion.findByPk(id);
    if (!cot) return res.status(404).json({ error: 'Cotización no encontrada' });

    const estadoActual = cot.getDataValue('estado');
    if (estadoActual === 'convertida') {
      return res.status(400).json({ error: 'No se puede cambiar el estado de una cotización ya convertida a ODP' });
    }

    await cot.update({ estado });
    res.json(cot);
  } catch (error: any) {
    console.error('cambiarEstado:', error);
    res.status(500).json({ error: 'Error al cambiar estado' });
  }
};

export const convertirAODP = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { fecha_entrega, direccion_instalacion, observaciones_adicionales } = req.body;

  try {
    const cot = await Cotizacion.findByPk(id, {
      include: [{ model: CotizacionItem, as: 'items' }],
    });
    if (!cot) return res.status(404).json({ error: 'Cotización no encontrada' });

    if (cot.getDataValue('estado') !== 'aprobada') {
      return res.status(400).json({ error: 'Solo se pueden convertir cotizaciones en estado "aprobada"' });
    }
    if (cot.getDataValue('odp_id')) {
      return res.status(409).json({ error: 'Esta cotización ya fue convertida a ODP' });
    }
    if (!cot.getDataValue('cliente_id')) {
      return res.status(400).json({ error: 'La cotización no tiene cliente asignado' });
    }

    const result = await withUniqueRetry(async () => {
      const t = await sequelize.transaction();
      try {
        const numero_odp = await generarNumeroODP(t);

        const notasJuntas = [
          cot.getDataValue('notas'),
          observaciones_adicionales,
        ].filter(Boolean).join('\n');

        const newODP = await ODP.create({
          numero_odp,
          cliente_id: cot.getDataValue('cliente_id'),
          asesor_id: cot.getDataValue('creado_por'),
          descripcion_pedido: cot.getDataValue('nombre_proyecto') || '',
          valor_total: cot.getDataValue('valor_total'),
          forma_pago: cot.getDataValue('forma_pago') || null,
          observaciones: notasJuntas || null,
          fecha_entrega: fecha_entrega || null,
          direccion_instalacion: direccion_instalacion || null,
          estado_produccion: 'EN_ESPERA',
        }, { transaction: t });

        await cot.update({
          odp_id: newODP.getDataValue('id'),
          estado: 'convertida',
        }, { transaction: t });

        const prospectoId = cot.getDataValue('prospecto_id');
        if (prospectoId) {
          await Prospecto.update(
            { odp_id: newODP.getDataValue('id'), estado: 'aprobado', fecha_gestion: new Date() },
            { where: { id: prospectoId }, transaction: t }
          );
        }

        await t.commit();
        return newODP;
      } catch (err) {
        await t.rollback();
        throw err;
      }
    });

    const cotActualizada = await Cotizacion.findByPk(id, {
      include: [
        { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] },
        { model: CotizacionItem, as: 'items' },
      ],
    });

    res.json({ cotizacion: cotActualizada, odp: result });
  } catch (error: any) {
    console.error('convertirAODP:', error);
    res.status(500).json({ error: 'Error al convertir cotización a ODP', detail: error.message });
  }
};

export const deleteCotizacion = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const cot = await Cotizacion.findByPk(id);
    if (!cot) return res.status(404).json({ error: 'Cotización no encontrada' });

    const estado = cot.getDataValue('estado');
    if (estado !== 'borrador' && estado !== 'rechazada') {
      return res.status(400).json({ error: `Solo se pueden eliminar cotizaciones en estado borrador o rechazada (actual: ${estado})` });
    }

    await cot.destroy(); // CASCADE elimina los items
    res.json({ message: 'Cotización eliminada' });
  } catch (error: any) {
    console.error('deleteCotizacion:', error);
    res.status(500).json({ error: 'Error al eliminar cotización' });
  }
};

// Ruta legacy — mantener compatibilidad con COTModal.tsx
export const getCotizacionesByODP = async (req: Request, res: Response) => {
  try {
    const { odp_id } = req.params;
    const cots = await Cotizacion.findAll({
      where: { odp_id },
      include: [
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
        { model: CotizacionItem, as: 'items' },
      ],
      order: [['fecha_creacion', 'DESC']],
    });
    res.json(cots);
  } catch (error: any) {
    console.error('getCotizacionesByODP:', error);
    res.status(500).json({ error: 'Error al obtener cotizaciones' });
  }
};
