import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { CatalogoProducto } from '../models';
import { z } from 'zod';

const catalogoSchema = z.object({
  categoria: z.string().min(1),
  nombre: z.string().min(1),
  descripcion: z.string().optional(),
  activo: z.boolean().optional().default(true),
  // `codigo` es NOT NULL UNIQUE en la tabla: sin él ninguna creación llegaba a
  // insertarse. Se acepta desde el cliente y, si no viene, se genera uno libre.
  codigo: z.string().trim().max(50).optional(),
  es_aluminio: z.boolean().optional(),
  unidad_medida: z.string().trim().max(30).optional().nullable(),
  porcentaje_iva: z.coerce.number().min(0).max(100).optional(),
});

/** Genera un código correlativo libre con prefijo PROD- para productos sin código propio */
async function generarCodigoLibre(): Promise<string> {
  const ultimo = await CatalogoProducto.findOne({
    where: { codigo: { [Op.iLike]: 'PROD-%' } },
    order: [['codigo', 'DESC']],
    attributes: ['codigo'],
  });
  const actual = ultimo ? parseInt(String(ultimo.getDataValue('codigo')).replace(/\D/g, ''), 10) : 0;
  return `PROD-${String((Number.isFinite(actual) ? actual : 0) + 1).padStart(4, '0')}`;
}

export const getCatalogo = async (req: Request, res: Response) => {
  try {
    const where: any = { activo: true };
    if (req.query.es_aluminio === 'true') where.es_aluminio = true;

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    if (q) {
      const palabras = q.split(/\s+/).filter(Boolean);
      const condiciones = palabras.map((p) => ({
        [Op.or]: [
          { codigo: { [Op.iLike]: `%${p}%` } },
          { nombre: { [Op.iLike]: `%${p}%` } },
          { descripcion: { [Op.iLike]: `%${p}%` } },
        ],
      }));

      where[Op.and] = condiciones;

      const items = await CatalogoProducto.findAll({
        where,
        order: [
          ['codigo', 'ASC'],
          ['nombre', 'ASC'],
        ],
        limit: req.query.limit ? parseInt(String(req.query.limit)) : 50,
      });
      return res.json(items);
    }

    const items = await CatalogoProducto.findAll({
      where,
      order: [['categoria', 'ASC'], ['nombre', 'ASC']],
    });
    res.json(items);
  } catch (e: any) {
    res.status(500).json({ error: 'Error al obtener catálogo', detalle: e.message });
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
    const codigo = data.codigo?.toUpperCase() || (await generarCodigoLibre());

    const duplicado = await CatalogoProducto.findOne({ where: { codigo }, attributes: ['id', 'nombre'] });
    if (duplicado) {
      return res.status(409).json({
        error: `El código ${codigo} ya está en uso por "${duplicado.getDataValue('nombre')}". Usa otro código.`,
      });
    }

    const item = await CatalogoProducto.create({ ...data, codigo } as any);
    res.status(201).json(item);
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      const primero = e.issues[0];
      return res.status(400).json({
        error: `Revisa el campo "${primero?.path?.join('.') || 'dato'}": ${primero?.message ?? 'valor inválido'}.`,
      });
    }
    console.error('[catalogo] createCatalogo:', e?.message ?? e);
    res.status(500).json({ error: 'No se pudo crear el producto. Vuelve a intentarlo.' });
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
