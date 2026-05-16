import { Request, Response } from 'express';
import { SAP, SAPItem, ODP, Usuario, CatalogoProducto, ODCItem } from '../models';
import sequelize from '../config/database';
import { Op } from 'sequelize';
import { withUniqueRetry } from '../utils/withUniqueRetry';

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
  const last = await SAP.findOne({
    where: { numero_sap: { [Op.like]: 'SAP-%' } },
    order: [['numero_sap', 'DESC']],
    attributes: ['numero_sap'],
  });
  let next = 1;
  if (last) {
    const parts = last.getDataValue('numero_sap').split('-');
    next = parseInt(parts[parts.length - 1]) + 1;
  }
  return `SAP-${String(next).padStart(4, '0')}`;
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
  try {
    const { odp_id, notas, items } = req.body;
    const userId = req.user?.id;

    const odp = await ODP.findByPk(odp_id);
    if (!odp) return res.status(404).json({ error: 'ODP no encontrada' });

    const sap = await withUniqueRetry(async () => {
      const t = await sequelize.transaction();
      try {
        const numero_sap = await generarNumeroSAP();

        const newSap = await SAP.create({
          numero_sap, odp_id, creado_por: userId, notas, estado: 'borrador',
        }, { transaction: t });

        if (items && Array.isArray(items) && items.length > 0) {
          const sapItems = items.map((item: any) => ({ ...item, sap_id: newSap.getDataValue('id') }));
          await SAPItem.bulkCreate(sapItems, { transaction: t });
        }

        await t.commit();
        return newSap;
      } catch (err) {
        await t.rollback();
        throw err;
      }
    });

    await recalcularAluminioODP(odp_id);

    const sapWithItems = await SAP.findByPk(sap.getDataValue('id'), {
      include: [{ model: SAPItem, as: 'items' }, { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] }],
    });

    import('../server').then(({ emitirCambio }) => emitirCambio('odp')).catch(() => {});
    res.status(201).json(sapWithItems);
  } catch (error: any) {
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
      // Cargar items existentes con sus ODCItems para detectar cuáles ya están en una ODC
      const existingItems = await SAPItem.findAll({
        where: { sap_id: id },
        include: [{ model: ODCItem, as: 'odc_items', attributes: ['id'] }],
        transaction: t,
      });

      const existingMap = new Map<number, any>(
        existingItems.map((ei: any) => [ei.getDataValue('id'), ei])
      );
      const incomingIds = new Set<number>(
        items.filter((i: any) => i.id).map((i: any) => Number(i.id))
      );

      // Procesar cada ítem entrante
      for (const item of items) {
        const itemId = item.id ? Number(item.id) : null;

        if (itemId && existingMap.has(itemId)) {
          const existing = existingMap.get(itemId);
          const tieneODC = Array.isArray(existing.odc_items) && existing.odc_items.length > 0;

          if (tieneODC) {
            // Ítem ya en ODC: guardar snapshot y marcar como modificado si hubo cambio real
            const datosAnteriores = {
              codigo: existing.getDataValue('codigo'),
              descripcion: existing.getDataValue('descripcion'),
              dimension: existing.getDataValue('dimension'),
              cantidad: existing.getDataValue('cantidad'),
              und: existing.getDataValue('und'),
              observacion: existing.getDataValue('observacion'),
            };
            const hubo_cambio =
              datosAnteriores.codigo !== item.codigo ||
              datosAnteriores.descripcion !== item.descripcion ||
              datosAnteriores.dimension !== item.dimension ||
              String(datosAnteriores.cantidad) !== String(item.cantidad) ||
              datosAnteriores.und !== item.und ||
              datosAnteriores.observacion !== item.observacion;

            await existing.update({
              codigo: item.codigo,
              descripcion: item.descripcion,
              dimension: item.dimension,
              cantidad: item.cantidad,
              und: item.und,
              observacion: item.observacion,
              exist_perf: item.exist_perf,
              // estado_compra se preserva: sigue 'en_odc'
              modificado: hubo_cambio ? true : existing.getDataValue('modificado'),
              datos_anteriores: hubo_cambio
                ? datosAnteriores
                : existing.getDataValue('datos_anteriores'),
            }, { transaction: t });
          } else {
            // Ítem no vinculado a ODC: actualizar normalmente y limpiar flags
            await existing.update({
              ...item,
              sap_id: Number(id),
              modificado: false,
              datos_anteriores: null,
            }, { transaction: t });
          }
        } else {
          // Ítem nuevo: crear
          const { id: _ignore, ...itemSinId } = item;
          await SAPItem.create({
            ...itemSinId,
            sap_id: Number(id),
            modificado: false,
            datos_anteriores: null,
          }, { transaction: t });
        }
      }

      // Eliminar items que el asesor quitó del formulario (solo si no tienen ODC activa)
      for (const [existingId, existing] of existingMap) {
        if (!incomingIds.has(existingId)) {
          const tieneODC = Array.isArray(existing.odc_items) && existing.odc_items.length > 0;
          if (!tieneODC) {
            await existing.destroy({ transaction: t });
          }
          // Si tiene ODC activa: no se puede eliminar, se deja intacto
        }
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
