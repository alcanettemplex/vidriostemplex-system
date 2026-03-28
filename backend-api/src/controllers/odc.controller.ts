import { Request, Response } from 'express';
import { OrdenCompra, ODCItem, SAP, SAPItem, ODP, Cliente, Usuario } from '../models';
import sequelize from '../config/database';
import { Op } from 'sequelize';

// Consecutivo automático ODC-YYYY-NNNN
const generarNumeroODC = async (): Promise<string> => {
  const count = await OrdenCompra.count();
  const year = new Date().getFullYear();
  return `ODC-${year}-${String(count + 1).padStart(4, '0')}`;
};

// GET /odc/seguimiento — ODCs en estado pendiente o enviada
export const getODCsSeguimiento = async (req: Request, res: Response) => {
  try {
    const odcs = await OrdenCompra.findAll({
      where: { estado: { [Op.in]: ['pendiente', 'enviada'] } },
      include: [
        { model: ODCItem, as: 'items' },
        { model: Usuario, as: 'creador', attributes: ['id', 'nombre_completo'] },
        {
          model: SAP, as: 'sap',
          include: [{
            model: ODP,
            include: [
              { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] },
              { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
            ],
          }],
        },
      ],
      order: [['fecha_creacion', 'ASC']],
    });
    res.json(odcs);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener seguimiento', detail: error.message });
  }
};

// GET /odc/recibidas — ODCs en estado recibida
export const getODCsRecibidas = async (req: Request, res: Response) => {
  try {
    const odcs = await OrdenCompra.findAll({
      where: { estado: 'recibida' },
      include: [
        { model: ODCItem, as: 'items' },
        { model: Usuario, as: 'creador', attributes: ['id', 'nombre_completo'] },
        {
          model: SAP, as: 'sap',
          include: [{
            model: ODP,
            include: [
              { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] },
              { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
            ],
          }],
        },
      ],
      order: [['fecha_recepcion', 'DESC']],
    });
    res.json(odcs);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener recibidas', detail: error.message });
  }
};

// GET /odc/panel — ODPs con SAP que tienen items pendientes
export const getODPsConSAPPendiente = async (req: Request, res: Response) => {
  try {
    // Buscar SAPs que tienen al menos un item en estado 'pendiente'
    const sapsConPendiente = await SAP.findAll({
      include: [
        {
          model: SAPItem,
          as: 'items',
          where: { estado_compra: 'pendiente' },
          required: true,
        },
        {
          model: ODP,
          include: [
            { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] },
            { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
          ],
        },
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
      ],
      order: [['fecha_creacion', 'DESC']],
    });
    res.json(sapsConPendiente);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener panel de compras', detail: error.message });
  }
};

// GET /odc/sap/:sap_id — SAP con todos sus items y estado_compra + ODCs existentes
export const getSAPParaCompras = async (req: Request, res: Response) => {
  try {
    const { sap_id } = req.params;

    const sap = await SAP.findByPk(sap_id, {
      include: [
        { model: SAPItem, as: 'items' },
        {
          model: OrdenCompra,
          as: 'ordenes_compra',
          include: [
            { model: ODCItem, as: 'items' },
            { model: Usuario, as: 'creador', attributes: ['id', 'nombre_completo'] },
          ],
          order: [['fecha_creacion', 'DESC']],
        },
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
      ],
    });

    if (!sap) return res.status(404).json({ error: 'SAP no encontrada' });
    res.json(sap);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener SAP', detail: error.message });
  }
};

// POST /odc — Crear ODC con items seleccionados
export const createODC = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { sap_id, odp_id, proveedor, notas, items } = req.body;
    // items: [{ sap_item_id, item, codigo, descripcion, cantidad }]
    const userId = (req as any).user?.id;

    if (!items || !Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return res.status(400).json({ error: 'Debes seleccionar al menos un item' });
    }

    const numero_odc = await generarNumeroODC();

    const odc = await OrdenCompra.create({
      numero_odc, sap_id, odp_id, proveedor, notas, estado: 'pendiente', creado_por: userId,
    }, { transaction: t });

    const odcId = odc.getDataValue('id');

    // Crear items de la ODC
    await ODCItem.bulkCreate(
      items.map((i: any) => ({ ...i, odc_id: odcId })),
      { transaction: t }
    );

    // Actualizar estado_compra de los sap_items incluidos
    const sapItemIds = items.map((i: any) => i.sap_item_id);
    await SAPItem.update(
      { estado_compra: 'en_odc' },
      { where: { id: { [Op.in]: sapItemIds } }, transaction: t }
    );

    await t.commit();

    const odcCompleta = await OrdenCompra.findByPk(odcId, {
      include: [
        { model: ODCItem, as: 'items' },
        { model: Usuario, as: 'creador', attributes: ['id', 'nombre_completo'] },
      ],
    });

    res.status(201).json(odcCompleta);
  } catch (error: any) {
    await t.rollback();
    res.status(500).json({ error: 'Error al crear ODC', detail: error.message });
  }
};

// PUT /odc/:id — Actualizar estado o proveedor de ODC
export const updateODC = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { estado, proveedor, notas } = req.body;

    const odc = await OrdenCompra.findByPk(id, {
      include: [{ model: SAP, as: 'sap', include: [{ model: ODP }] }],
    });
    if (!odc) return res.status(404).json({ error: 'ODC no encontrada' });

    const estadoAnterior = odc.getDataValue('estado');
    const fechaRecepcion = estado === 'recibida' && estadoAnterior !== 'recibida'
      ? new Date() : odc.getDataValue('fecha_recepcion');

    await odc.update({ estado, proveedor, notas, ...(fechaRecepcion ? { fecha_recepcion: fechaRecepcion } : {}) });

    // Notificar cuando se marca como recibida
    if (estado === 'recibida' && estadoAnterior !== 'recibida') {
      const sap = (odc as any).sap;
      const odp = sap?.ODP;
      if (odp) {
        import('../utils/notificaciones').then(({ notificarCambioEstadoODP }) => {
          notificarCambioEstadoODP({
            numero_odp: odp.numero_odp,
            odp_id: odp.id,
            asesor_id: odp.asesor_id,
            estado_nuevo: 'PEDIDO_PROVEEDOR',
            mensaje: `ODC ${odc.getDataValue('numero_odc')} recibida — proveedor: ${proveedor || odc.getDataValue('proveedor')}`,
          });
        }).catch(err => console.error('Error notificación ODC recibida:', err));
      }
    }

    const updated = await OrdenCompra.findByPk(id, {
      include: [
        { model: ODCItem, as: 'items' },
        { model: Usuario, as: 'creador', attributes: ['id', 'nombre_completo'] },
      ],
    });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al actualizar ODC', detail: error.message });
  }
};

// DELETE /odc/:id — Eliminar ODC y revertir estado_compra de sus items
export const deleteODC = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;

    const odc = await OrdenCompra.findByPk(id, {
      include: [{ model: ODCItem, as: 'items' }],
      transaction: t,
    });
    if (!odc) { await t.rollback(); return res.status(404).json({ error: 'ODC no encontrada' }); }

    const odcItems = (odc as any).items as any[];
    const sapItemIds = odcItems.map((i: any) => i.sap_item_id);

    await ODCItem.destroy({ where: { odc_id: id }, transaction: t });
    await odc.destroy({ transaction: t });

    // Revertir estado de sap_items a 'pendiente' si no están en otra ODC
    for (const sapItemId of sapItemIds) {
      const enOtraODC = await ODCItem.count({ where: { sap_item_id: sapItemId } });
      if (enOtraODC === 0) {
        await SAPItem.update(
          { estado_compra: 'pendiente' },
          { where: { id: sapItemId }, transaction: t }
        );
      }
    }

    await t.commit();
    res.json({ ok: true });
  } catch (error: any) {
    await t.rollback();
    res.status(500).json({ error: 'Error al eliminar ODC', detail: error.message });
  }
};

// PATCH /odc/sap-item/:id/existencia — Marcar item como en_existencia o revertir a pendiente
export const toggleExistencia = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const item = await SAPItem.findByPk(id);
    if (!item) return res.status(404).json({ error: 'Item no encontrado' });

    const estadoActual = item.getDataValue('estado_compra');
    // Solo permite cambiar si está pendiente → en_existencia o en_existencia → pendiente
    if (estadoActual === 'en_odc') {
      return res.status(400).json({ error: 'No se puede marcar en existencia un item ya asignado a una ODC' });
    }
    const nuevoEstado = estadoActual === 'en_existencia' ? 'pendiente' : 'en_existencia';
    await item.update({ estado_compra: nuevoEstado });
    res.json({ id, estado_compra: nuevoEstado });
  } catch (error: any) {
    res.status(500).json({ error: 'Error al actualizar item', detail: error.message });
  }
};
