import { Request, Response } from 'express';
import { z } from 'zod';
import Produccion from '../models/produccion.model';

const produccionSchema = z.object({
  odp_id: z.number().int().positive().optional(),
  estado: z.string().optional(),
  observaciones: z.string().optional().nullable(),
}).strict();

export const getProduccion = async (_req: Request, res: Response) => {
  try {
    const produccion = await Produccion.findAll();
    res.json(produccion);
  } catch (error: any) {
    console.error('Error al obtener producción:', error);
    res.status(500).json({ error: 'Error al obtener producción' });
  }
};

export const createProduccion = async (req: Request, res: Response) => {
  try {
    const data = produccionSchema.parse(req.body);
    const produccion = await Produccion.create(data as any);
    res.status(201).json(produccion);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos', detalles: error.issues });
    }
    console.error('Error al crear producción:', error);
    res.status(500).json({ error: 'Error al crear producción' });
  }
};

export const updateProduccion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = produccionSchema.partial().parse(req.body);
    const produccion = await Produccion.findByPk(id);
    if (!produccion) return res.status(404).json({ error: 'Registro no encontrado' });
    await produccion.update(data as any);
    res.json(produccion);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos', detalles: error.issues });
    }
    console.error('Error al actualizar producción:', error);
    res.status(500).json({ error: 'Error al actualizar producción' });
  }
};

export const deleteProduccion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const produccion = await Produccion.findByPk(id);
    if (!produccion) return res.status(404).json({ error: 'Registro no encontrado' });
    await produccion.destroy();
    res.json({ status: 'Registro eliminado' });
  } catch (error: any) {
    console.error('Error al eliminar producción:', error);
    res.status(500).json({ error: 'Error al eliminar producción' });
  }
};
