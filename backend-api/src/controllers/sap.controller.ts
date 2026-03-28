import { Request, Response } from 'express';
import { SAP, SAPItem, ODP, Usuario, CatalogoProducto } from '../models';
import sequelize from '../config/database';
import { Op } from 'sequelize';

// Recalcular tiene_aluminio en ODP según todos sus SAP items
const recalcularAluminioODP = async (odp_id: number): Promise<void> => {
  const saps = await SAP.findAll({
    where: { odp_id },
    include: [{ model: SAPItem, as: 'items', attributes: ['codigo'] }],
  });
  const codigos = saps.flatMap((s: any) => s.items.map((i: any) => i.codigo));
  if (codigos.length === 0) {
    await ODP.update({ tiene_aluminio: false }, { where: { id: odp_id } });
    return;
  }
  const count = await CatalogoProducto.count({ where: { codigo: { [Op.in]: codigos }, es_aluminio: true } });
  await ODP.update({ tiene_aluminio: count > 0 }, { where: { id: odp_id } });
};

// Generar número SAP consecutivo
const generarNumeroSAP = async (): Promise<string> => {
  const count = await SAP.count();
  const year = new Date().getFullYear();
  return `SAP-${year}-${String(count + 1).padStart(4, '0')}`;
};

export const getSAPsByODP = async (req: Request, res: Response) => {
  try {
    const { odp_id } = req.params;
    const saps = await SAP.findAll({
      where: { odp_id },
      include: [
        { model: SAPItem, as: 'items' },
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
      ],
      order: [['fecha_creacion', 'DESC']],
    });
    res.json(saps);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener SAPs' });
  }
};

export const createSAP = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { odp_id, notas, items } = req.body;
    const userId = (req as any).user?.id;

    const odp = await ODP.findByPk(odp_id);
    if (!odp) { await t.rollback(); return res.status(404).json({ error: 'ODP no encontrada' }); }

    const numero_sap = await generarNumeroSAP();

    const sap = await SAP.create({
      numero_sap, odp_id, creado_por: userId, notas, estado: 'borrador',
    }, { transaction: t });

    if (items && Array.isArray(items) && items.length > 0) {
      const sapItems = items.map((item: any) => ({ ...item, sap_id: sap.getDataValue('id') }));
      await SAPItem.bulkCreate(sapItems, { transaction: t });
    }

    await t.commit();

    await recalcularAluminioODP(odp_id);

    const sapWithItems = await SAP.findByPk(sap.getDataValue('id'), {
      include: [{ model: SAPItem, as: 'items' }, { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] }],
    });

    res.status(201).json(sapWithItems);
  } catch (error: any) {
    await t.rollback();
    res.status(500).json({ error: 'Error al crear SAP', detail: error.message });
  }
};

export const updateSAP = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { notas, estado, items } = req.body;

    const sap = await SAP.findByPk(id, { transaction: t });
    if (!sap) { await t.rollback(); return res.status(404).json({ error: 'SAP no encontrada' }); }

    await sap.update({ notas, estado }, { transaction: t });

    if (items && Array.isArray(items)) {
      await SAPItem.destroy({ where: { sap_id: id }, transaction: t });
      if (items.length > 0) {
        await SAPItem.bulkCreate(items.map((i: any) => ({ ...i, sap_id: id })), { transaction: t });
      }
    }

    await t.commit();

    const odp_id = sap.getDataValue('odp_id');
    await recalcularAluminioODP(odp_id);

    const updated = await SAP.findByPk(id, {
      include: [{ model: SAPItem, as: 'items' }, { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] }],
    });

    res.json(updated);
  } catch (error: any) {
    await t.rollback();
    res.status(500).json({ error: 'Error al actualizar SAP', detail: error.message });
  }
};

export const deleteSAP = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const sap = await SAP.findByPk(id);
    if (!sap) return res.status(404).json({ error: 'SAP no encontrada' });
    await SAPItem.destroy({ where: { sap_id: id } });
    await sap.destroy();
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Error al eliminar SAP', detail: error.message });
  }
};

export const buscarCatalogo = async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    if (!q || String(q).length < 2) return res.json([]);
    const term = String(q).toUpperCase();
    const items = await CatalogoProducto.findAll({
      where: {
        [Op.or]: [
          { codigo: { [Op.iLike]: `%${term}%` } },
          { nombre: { [Op.iLike]: `%${q}%` } },
        ],
        activo: true,
      },
      limit: 15,
      order: [['codigo', 'ASC']],
    });
    res.json(items);
  } catch (error: any) {
    res.status(500).json({ error: 'Error en búsqueda' });
  }
};
