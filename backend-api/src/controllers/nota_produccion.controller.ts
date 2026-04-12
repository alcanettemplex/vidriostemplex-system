import { Request, Response } from 'express';
import { NotaProduccion, Usuario } from '../models';

export const getNotasByODP = async (req: Request, res: Response) => {
  try {
    const { odpId } = req.params;
    const notas = await NotaProduccion.findAll({
      where: { odp_id: odpId },
      include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombre_completo'] }],
      order: [['fecha', 'DESC']]
    });
    res.json(notas);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener notas' });
  }
};

export const createNota = async (req: Request, res: Response) => {
  try {
    const { odp_id, texto } = req.body;
    const usuario_id = req.user?.id;

    if (!usuario_id) return res.status(401).json({ error: 'No autenticado' });

    const nuevaNota = await NotaProduccion.create({
      odp_id,
      usuario_id,
      texto,
      fecha: new Date()
    });

    const notaConUsuario = await NotaProduccion.findByPk(nuevaNota.getDataValue('id'), {
      include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombre_completo'] }]
    });

    res.status(201).json(notaConUsuario);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al crear nota' });
  }
};
