import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { InventarioPerfileria, CatalogoProducto } from '../models';

export const getInventario = async (req: Request, res: Response) => {
  try {
    const { codigo, ubicacion, search, page = '1', limit = '100' } = req.query as Record<string, string>;
    const where: any = {};

    if (codigo) where.codigo = codigo;
    if (ubicacion) where.ubicacion = ubicacion;
    if (search) {
      const conditions: any[] = [
        { codigo: { [Op.iLike]: `%${search}%` } },
        { ubicacion: { [Op.iLike]: `%${search}%` } },
      ];
      const searchNum = parseInt(search, 10);
      if (!isNaN(searchNum)) conditions.push({ consecutivo: searchNum });
      where[Op.or as any] = conditions;
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await InventarioPerfileria.findAndCountAll({
      where,
      order: [['consecutivo', 'ASC']],
      limit: parseInt(limit),
      offset,
    });

    const ultimaEntrada = await InventarioPerfileria.max('creado_en');
    res.json({ total: count, items: rows, ultima_entrada: ultimaEntrada });
  } catch (e) {
    res.status(500).json({ error: 'Error al obtener inventario' });
  }
};

export const getInventarioStats = async (_req: Request, res: Response) => {
  try {
    const items = await InventarioPerfileria.findAll({
      attributes: ['codigo', 'ubicacion', 'mm'],
    });

    const stats: Record<string, { total_piezas: number; total_mm: number; ubicaciones: Set<string> }> = {};

    for (const item of items as any[]) {
      const cod = item.codigo || 'SIN CODIGO';
      if (!stats[cod]) stats[cod] = { total_piezas: 0, total_mm: 0, ubicaciones: new Set() };
      stats[cod].total_piezas += 1;
      stats[cod].total_mm += parseFloat(item.mm) || 0;
      if (item.ubicacion) stats[cod].ubicaciones.add(item.ubicacion);
    }

    const result = Object.entries(stats).map(([codigo, s]) => ({
      codigo,
      total_piezas: s.total_piezas,
      total_mm: Math.round(s.total_mm),
      ubicaciones: Array.from(s.ubicaciones).join(', '),
    })).sort((a, b) => a.codigo.localeCompare(b.codigo));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
};

export const updateInventarioItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { ubicacion, mm } = req.body;

    const item = await InventarioPerfileria.findByPk(id);
    if (!item) return res.status(404).json({ error: 'Perfil no encontrado' });

    const updates: any = {};
    if (ubicacion !== undefined) updates.ubicacion = ubicacion;
    if (mm !== undefined) updates.mm = mm;

    await item.update(updates);
    res.json(item);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
};

export const bulkInsertPerfileria = async (req: Request, res: Response) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'Se requiere al menos un ítem' });

    const maxConsecutivo = ((await InventarioPerfileria.max('consecutivo')) as number) || 0;
    const hoy = new Date().toISOString().split('T')[0];

    const toInsert = items.map((item: any, idx: number) => ({
      consecutivo: maxConsecutivo + idx + 1,
      codigo: item.codigo || null,
      mm: parseFloat(item.mm) || 0,
      ubicacion: item.ubicacion || null,
      fecha_corte: hoy,
    }));

    const created = await InventarioPerfileria.bulkCreate(toInsert);
    res.status(201).json({ insertados: created.length, items: created });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Error al insertar perfilería' });
  }
};

export const exportInventario = async (_req: Request, res: Response) => {
  try {
    const items = await InventarioPerfileria.findAll({
      attributes: ['consecutivo', 'codigo', 'mm', 'ubicacion'],
      order: [['consecutivo', 'ASC']],
      include: [{
        model: CatalogoProducto,
        as: 'catalogo',
        attributes: ['nombre'],
        required: false,
      }],
    });

    const rows = (items as any[]).map(item => ({
      consecutivo: item.consecutivo,
      codigo: item.codigo || '',
      descripcion: item.catalogo?.nombre || '',
      mm: parseFloat(item.mm) || 0,
      ubicacion: item.ubicacion || '',
    }));

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Error al exportar inventario' });
  }
};

export const deleteInventarioItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const item = await InventarioPerfileria.findByPk(id);
    if (!item) return res.status(404).json({ error: 'Perfil no encontrado' });
    await item.destroy();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Error al eliminar perfil' });
  }
};
