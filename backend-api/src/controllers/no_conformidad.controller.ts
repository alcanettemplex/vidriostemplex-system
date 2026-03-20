import { Request, Response } from 'express';
import { NoConformidad, ODP, Usuario } from '../models';

export const createNoConformidad = async (req: Request, res: Response) => {
  try {
    const { odp_id } = req.body;
    const usuario_reporta_id = (req as any).user.id;

    const odp = await ODP.findByPk(odp_id);
    if (!odp) {
      return res.status(404).json({ message: 'ODP no encontrada' });
    }

    // Generar número de reporte
    const count = await NoConformidad.count();
    const numero_reporte = `NC-${(count + 1).toString().padStart(4, '0')}`;

    const nc = await NoConformidad.create({
      ...req.body,
      numero_reporte,
      usuario_reporta_id
    });

    res.status(201).json(nc);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getNoConformidadesByODP = async (req: Request, res: Response) => {
  try {
    const { odpId } = req.params;
    const ncs = await NoConformidad.findAll({
      where: { odp_id: odpId },
      include: [
        { model: Usuario, as: 'usuario_reporta', attributes: ['nombre_completo'] }
      ],
      order: [['creado_en', 'DESC']]
    });
    res.json(ncs);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateNoConformidad = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const nc = await NoConformidad.findByPk(id);
    if (!nc) {
      return res.status(404).json({ message: 'Reporte no encontrado' });
    }

    await nc.update(req.body);
    res.json(nc);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
