import { Request, Response } from 'express';
import ProgramacionInstalacion from '../models/programacion_instalacion.model';

export const getInstalaciones = async (_req: Request, res: Response) => {
  const instalaciones = await ProgramacionInstalacion.findAll();
  res.json(instalaciones);
};

export const getInstalacion = async (req: Request, res: Response) => {
  const { id } = req.params;
  const instalacion = await ProgramacionInstalacion.findByPk(id);
  if (!instalacion) return res.status(404).json({ error: 'Instalación no encontrada' });
  res.json(instalacion);
};

export const createInstalacion = async (req: Request, res: Response) => {
  const instalacion = await ProgramacionInstalacion.create(req.body);
  res.status(201).json(instalacion);
};

export const updateInstalacion = async (req: Request, res: Response) => {
  const { id } = req.params;
  const instalacion = await ProgramacionInstalacion.findByPk(id);
  if (!instalacion) return res.status(404).json({ error: 'Instalación no encontrada' });
  await instalacion.update(req.body);
  res.json(instalacion);
};

export const deleteInstalacion = async (req: Request, res: Response) => {
  const { id } = req.params;
  const instalacion = await ProgramacionInstalacion.findByPk(id);
  if (!instalacion) return res.status(404).json({ error: 'Instalación no encontrada' });
  await instalacion.destroy();
  res.json({ status: 'Instalación eliminada' });
};
