import { Request, Response } from 'express';
import { CatalogoProducto } from '../models';
import { z } from 'zod';

const catalogoSchema = z.object({
  categoria: z.string().min(1),
  nombre: z.string().min(1),
  descripcion: z.string().optional(),
  activo: z.boolean().optional().default(true),
});

export const getCatalogo = async (req: Request, res: Response) => {
  try {
    const where: any = { activo: true };
    if (req.query.es_aluminio === 'true') where.es_aluminio = true;
    const items = await CatalogoProducto.findAll({
      where,
      order: [['categoria', 'ASC'], ['nombre', 'ASC']],
    });
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: 'Error al obtener catálogo' });
  }
};

export const getCatalogoAll = async (_req: Request, res: Response) => {
  try {
    const items = await CatalogoProducto.findAll({
      order: [['categoria', 'ASC'], ['nombre', 'ASC']],
    });
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: 'Error al obtener catálogo' });
  }
};

export const createCatalogo = async (req: Request, res: Response) => {
  try {
    const data = catalogoSchema.parse(req.body);
    const item = await CatalogoProducto.create(data as any);
    res.status(201).json(item);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
};

export const updateCatalogo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = catalogoSchema.partial().parse(req.body);
    const item = await CatalogoProducto.findByPk(id);
    if (!item) return res.status(404).json({ error: 'No encontrado' });
    await item.update(data);
    res.json(item);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
};

export const deleteCatalogo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const item = await CatalogoProducto.findByPk(id);
    if (!item) return res.status(404).json({ error: 'No encontrado' });
    await item.update({ activo: false });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Error al eliminar' });
  }
};
