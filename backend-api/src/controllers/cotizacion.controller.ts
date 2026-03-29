import { Request, Response } from 'express';
import { Cotizacion, ODP, Usuario } from '../models';

const generarNumeroCOT = async (): Promise<string> => {
  const { Op } = require('sequelize');
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

export const getCotizacionesByODP = async (req: Request, res: Response) => {
  try {
    const { odp_id } = req.params;
    const cots = await Cotizacion.findAll({
      where: { odp_id },
      include: [{ model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] }],
      order: [['fecha_creacion', 'DESC']],
    });
    res.json(cots);
  } catch {
    res.status(500).json({ error: 'Error al obtener cotizaciones' });
  }
};

export const createCotizacion = async (req: Request, res: Response) => {
  try {
    const { odp_id, valor_total, descuento, forma_pago, validez_dias, notas } = req.body;
    const userId = (req as any).user?.id;

    const odp = await ODP.findByPk(odp_id);
    if (!odp) return res.status(404).json({ error: 'ODP no encontrada' });

    const numero_cot = await generarNumeroCOT();

    const cot = await Cotizacion.create({
      numero_cot, odp_id, creado_por: userId,
      valor_total, descuento, forma_pago, validez_dias, notas,
      estado: 'enviada',
    });

    const cotWithUser = await Cotizacion.findByPk(cot.getDataValue('id'), {
      include: [{ model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] }],
    });

    res.status(201).json(cotWithUser);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al crear cotización', detail: error.message });
  }
};

export const updateCotizacion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { estado, valor_total, notas } = req.body;
    const cot = await Cotizacion.findByPk(id);
    if (!cot) return res.status(404).json({ error: 'Cotización no encontrada' });
    await cot.update({ estado, valor_total, notas });
    res.json(cot);
  } catch {
    res.status(500).json({ error: 'Error al actualizar cotización' });
  }
};
