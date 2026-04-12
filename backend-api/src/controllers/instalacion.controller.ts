import { Request, Response } from 'express';
import { z } from 'zod';
import ProgramacionInstalacion from '../models/programacion_instalacion.model';

const instalacionSchema = z.object({
  odp_id: z.number().int().positive().optional(),
  fecha_programada: z.string().optional().nullable(),
  hora_inicio: z.string().optional().nullable(),
  hora_fin: z.string().optional().nullable(),
  estado: z.string().optional(),
  observaciones: z.string().optional().nullable(),
}).strict();

export const getInstalaciones = async (_req: Request, res: Response) => {
  try {
    const instalaciones = await ProgramacionInstalacion.findAll();
    res.json(instalaciones);
  } catch (error: any) {
    console.error('Error al obtener instalaciones:', error);
    res.status(500).json({ error: 'Error al obtener instalaciones' });
  }
};

export const getInstalacion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const instalacion = await ProgramacionInstalacion.findByPk(id);
    if (!instalacion) return res.status(404).json({ error: 'Instalación no encontrada' });
    res.json(instalacion);
  } catch (error: any) {
    console.error('Error al obtener instalación:', error);
    res.status(500).json({ error: 'Error al obtener instalación' });
  }
};

export const createInstalacion = async (req: Request, res: Response) => {
  try {
    const data = instalacionSchema.parse(req.body);
    const instalacion = await ProgramacionInstalacion.create(data as any);
    res.status(201).json(instalacion);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos', detalles: error.issues });
    }
    console.error('Error al crear instalación:', error);
    res.status(500).json({ error: 'Error al crear instalación' });
  }
};

export const updateInstalacion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = instalacionSchema.partial().parse(req.body);
    const instalacion = await ProgramacionInstalacion.findByPk(id);
    if (!instalacion) return res.status(404).json({ error: 'Instalación no encontrada' });
    await instalacion.update(data as any);
    res.json(instalacion);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos', detalles: error.issues });
    }
    console.error('Error al actualizar instalación:', error);
    res.status(500).json({ error: 'Error al actualizar instalación' });
  }
};

export const deleteInstalacion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const instalacion = await ProgramacionInstalacion.findByPk(id);
    if (!instalacion) return res.status(404).json({ error: 'Instalación no encontrada' });
    await instalacion.destroy();
    res.json({ status: 'Instalación eliminada' });
  } catch (error: any) {
    console.error('Error al eliminar instalación:', error);
    res.status(500).json({ error: 'Error al eliminar instalación' });
  }
};
