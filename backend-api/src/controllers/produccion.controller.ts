import { Request, Response } from 'express';
import Produccion from '../models/produccion.model';

export const getProduccion = async (_req: Request, res: Response) => {
  const produccion = await Produccion.findAll();
  res.json(produccion);
};

export const createProduccion = async (req: Request, res: Response) => {
  const produccion = await Produccion.create(req.body);
  res.status(201).json(produccion);
};

export const updateProduccion = async (req: Request, res: Response) => {
  const { id } = req.params;
  const produccion = await Produccion.findByPk(id);
  if (!produccion) return res.status(404).json({ error: 'Registro no encontrado' });
  await produccion.update(req.body);
  res.json(produccion);
};

export const deleteProduccion = async (req: Request, res: Response) => {
  const { id } = req.params;
  const produccion = await Produccion.findByPk(id);
  if (!produccion) return res.status(404).json({ error: 'Registro no encontrado' });
  await produccion.destroy();
  res.json({ status: 'Registro eliminado' });
};
