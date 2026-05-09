import { Request, Response } from 'express';
import { OrdenCompra, ODCItem, SAP, SAPItem, ODP, ODPItem, Cliente, Usuario, InventarioPerfileria } from '../models';
import sequelize from '../config/database';
import { Op } from 'sequelize';

// Validar unicidad de numero_odc
const validarNumeroODC = async (numero_odc: string, excludeId?: number): Promise<void> => {
  const where: any = { numero_odc };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  const existente = await OrdenCompra.findOne({ where, attributes: ['id'] });
  if (existente) throw new Error(`Ya existe una ODC con el número ${numero_odc}`);
};

// Inclusión profunda de trazabilidad SAP/ODP por item (reutilizable en seguimiento y recibidas)
const includeItemsTrazabilidad = [
  {
    model: ODCItem,
    as: 'items',
    include: [
      {
        model: SAPItem,
        as: 'sap_item',
        include: [
          {
            model: SAP,
            include: [
              {
                model: ODP,
                include: [
                  { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] },
                  { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
                ],
              },
            ],
          },
        ],
      },
      {
        model: ODPItem,
        as: 'odp_item',
        include: [
          {
            model: ODP,
            include: [
              { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] },
            ],
          },
        ],
      },
      {
        model: ODP, as: 'odp_directo',
        required: false,
        include: [{ model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] }],
      },
    ],
  },
];

// GET /odc/seguimiento — ODCs en estado pendiente o en_transito
export const getODCsSeguimiento = async (req: Request, res: Response) => {
  try {
    const odcs = await OrdenCompra.findAll({
      where: { estado: { [Op.in]: ['pendiente', 'en_transito'] } },
      include: [
        ...includeItemsTrazabilidad,
        { model: Usuario, as: 'creador', attributes: ['id', 'nombre_completo'] },
        // Backward compat: ODCs antiguas con sap_id
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
        // ODCs con odp_id directo en cabecera (sin sap_id ni items vinculados)
        {
          model: ODP, as: 'odp',
          required: false,
          include: [{ model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] }],
        },
      ],
      order: [['fecha_creacion', 'ASC']],
    });
    res.json(odcs);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener seguimiento', detail: error.message });
  }
};

// GET /odc/recibidas — ODCs en estado recibido
export const getODCsRecibidas = async (req: Request, res: Response) => {
  try {
    const odcs = await OrdenCompra.findAll({
      where: { estado: 'recibido' },
      include: [
        ...includeItemsTrazabilidad,
        { model: Usuario, as: 'creador', attributes: ['id', 'nombre_completo'] },
        // Backward compat: ODCs antiguas con sap_id
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
        // ODCs con odp_id directo en cabecera (sin sap_id ni items vinculados)
        {
          model: ODP, as: 'odp',
          required: false,
          include: [{ model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] }],
        },
      ],
      order: [['fecha_recepcion', 'DESC']],
    });
    res.json(odcs);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener recibidas', detail: error.message });
  }
};

// GET /odc/panel — Lista plana de todos los SAPItems pendientes, ordenados por código
export const getODPsConSAPPendiente = async (req: Request, res: Response) => {
  try {
    const items = await SAPItem.findAll({
      where: { estado_compra: 'pendiente' },
      include: [
        {
          model: SAP,
          include: [
            {
              model: ODP,
              include: [
                { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] },
                { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
              ],
            },
          ],
        },
      ],
      order: [['codigo', 'ASC']],
    });
    res.json(items);
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

// POST /odc — Crear ODC consolidada multi-SAP
// Body: { proveedor, notas?, items: [{ sap_item_id, item, codigo, descripcion, cantidad }] }
// sap_id y odp_id son null — la trazabilidad queda a nivel de cada ODCItem.sap_item_id
export const createODC = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { proveedor, notas, items, numero_odc } = req.body;
    const userId = req.user?.id;

    if (!items || !Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return res.status(400).json({ error: 'Debes seleccionar al menos un item' });
    }
    if (!proveedor?.trim()) {
      await t.rollback();
      return res.status(400).json({ error: 'El proveedor es requerido' });
    }
    if (!numero_odc || !/^\d+$/.test(String(numero_odc).trim())) {
      await t.rollback();
      return res.status(400).json({ error: 'El número de ODC es requerido y debe contener solo dígitos' });
    }
    try { await validarNumeroODC(String(numero_odc).trim()); } catch (e: any) {
      await t.rollback();
      return res.status(409).json({ error: e.message });
    }

    const odc = await OrdenCompra.create({
      numero_odc: String(numero_odc).trim(),
      sap_id: null,
      odp_id: null,
      tipo: 'perfileria',
      proveedor,
      notas: notas || null,
      estado: 'pendiente',
      creado_por: userId,
    }, { transaction: t });

    const odcId = odc.getDataValue('id');

    // Un ODCItem por SAPItem original (mantiene trazabilidad completa)
    await ODCItem.bulkCreate(
      items.map((i: any) => ({ ...i, odc_id: odcId })),
      { transaction: t }
    );

    const createdCount = await ODCItem.count({ where: { odc_id: odcId }, transaction: t });
    if (createdCount !== items.length) {
      await t.rollback();
      return res.status(500).json({ error: `Error interno al crear ítems: se esperaban ${items.length} pero se guardaron ${createdCount}` });
    }

    // Marcar todos los SAPItems incluidos como en_odc
    const sapItemIds = items.map((i: any) => i.sap_item_id).filter(Boolean);
    if (sapItemIds.length > 0) {
      await SAPItem.update(
        { estado_compra: 'en_odc' },
        { where: { id: { [Op.in]: sapItemIds } }, transaction: t }
      );
    }

    await t.commit();

    const odcCompleta = await OrdenCompra.findByPk(odcId, {
      include: [
        { model: ODCItem, as: 'items' },
        { model: Usuario, as: 'creador', attributes: ['id', 'nombre_completo'] },
      ],
    });

    import('../server').then(({ emitirCambio }) => emitirCambio('compras')).catch(() => {});
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

    // ─── Verificación de ownership (solo creador o admin) ───
    if (req.user?.rol !== 'admin') {
      if (Number(odc.getDataValue('creado_por')) !== Number(req.user?.id)) {
        return res.status(403).json({ error: 'Solo el creador de la ODC puede editarla' });
      }
    }

    const estadoAnterior = odc.getDataValue('estado');
    const fechaRecepcion = estado === 'recibido' && estadoAnterior !== 'recibido'
      ? new Date() : odc.getDataValue('fecha_recepcion');

    await odc.update({ estado, proveedor, notas, ...(fechaRecepcion ? { fecha_recepcion: fechaRecepcion } : {}) });

    // Al marcar como recibida: pasar SAPItems de esta ODC a en_existencia
    if (estado === 'recibido' && estadoAnterior !== 'recibido') {
      const odcItems = await ODCItem.findAll({ where: { odc_id: id } });
      const sapItemIds = odcItems.map((i: any) => i.getDataValue('sap_item_id'));
      if (sapItemIds.length > 0) {
        await SAPItem.update(
          { estado_compra: 'en_existencia' },
          { where: { id: { [Op.in]: sapItemIds } } }
        );
      }
    }

    // Notificar cuando se marca como recibida
    if (estado === 'recibido' && estadoAnterior !== 'recibido') {
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

    // ─── Verificación de ownership (solo creador o admin) ───
    if (req.user?.rol !== 'admin') {
      if (Number(odc.getDataValue('creado_por')) !== Number(req.user?.id)) {
        await t.rollback();
        return res.status(403).json({ error: 'Solo el creador de la ODC puede eliminarla' });
      }
    }

    const odcItems = (odc as any).items as any[];
    const sapItemIds = odcItems.map((i: any) => i.sap_item_id);

    await ODCItem.destroy({ where: { odc_id: id }, transaction: t });
    await odc.destroy({ transaction: t });

    // Revertir estado de sap_items a 'pendiente' si no están en otra ODC
    for (const sapItemId of sapItemIds) {
      if (!sapItemId) continue;
      const enOtraODC = await ODCItem.count({ where: { sap_item_id: sapItemId }, transaction: t });
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

/**
 * PUT /odc/:id/recibir-items
 * Marca ítems individuales como recibidos.
 * - Si TODOS los ítems están recibidos → ODC pasa a estado 'recibido' + SAPItems a 'en_existencia'
 * - Si parcial → ODC queda en 'pendiente'; ítems no recibidos quedan resaltados (recibido=false)
 */
export const recibirItems = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { items_recibidos } = req.body as { items_recibidos: number[] };

    if (!Array.isArray(items_recibidos)) {
      await t.rollback();
      return res.status(400).json({ error: 'items_recibidos debe ser un arreglo de IDs' });
    }

    const odc = await OrdenCompra.findByPk(id, {
      include: [{ model: ODCItem, as: 'items' }],
      transaction: t,
    });
    if (!odc) {
      await t.rollback();
      return res.status(404).json({ error: 'ODC no encontrada' });
    }

    // Marcar como recibido los ítems seleccionados
    if (items_recibidos.length > 0) {
      await ODCItem.update(
        { recibido: true },
        { where: { id: { [Op.in]: items_recibidos }, odc_id: id }, transaction: t },
      );
    }

    // Verificar si todos los ítems están ahora recibidos
    const todosLosItems = await ODCItem.findAll({
      where: { odc_id: id },
      transaction: t,
      attributes: ['id', 'recibido', 'sap_item_id'],
    });

    const todosRecibidos = todosLosItems.length > 0 &&
      todosLosItems.every((it: any) => it.getDataValue('recibido') === true);

    if (todosRecibidos) {
      // ODC completa → estado recibido + SAPItems a en_existencia
      await odc.update({ estado: 'recibido', fecha_recepcion: new Date() }, { transaction: t });

      const sapItemIds = todosLosItems
        .map((it: any) => it.getDataValue('sap_item_id'))
        .filter(Boolean);
      if (sapItemIds.length > 0) {
        await SAPItem.update(
          { estado_compra: 'en_existencia' },
          { where: { id: { [Op.in]: sapItemIds } }, transaction: t },
        );

        // Auto-activar chk_accesorios en la ODP: trazar SAPItem → SAP → ODP
        const sapItem = await SAPItem.findOne({
          where: { id: { [Op.in]: sapItemIds } },
          include: [{ model: SAP, attributes: ['id', 'odp_id'] }],
          transaction: t,
        });
        const sapData = (sapItem as any)?.SAP ?? (sapItem as any)?.dataValues?.SAP;
        const odpId: number | null = sapData?.odp_id ?? sapData?.getDataValue?.('odp_id') ?? null;
        if (odpId) {
          await ODP.update(
            { chk_accesorios: true },
            { where: { id: odpId, chk_accesorios: false }, transaction: t },
          );
        }
      }
    } else {
      // Recepción parcial → mantener pendiente
      await odc.update({ estado: 'pendiente' }, { transaction: t });
    }

    await t.commit();

    // Retornar ODC actualizada
    const updated = await OrdenCompra.findByPk(id, {
      include: [
        ...includeItemsTrazabilidad,
        { model: Usuario, as: 'creador', attributes: ['id', 'nombre_completo'] },
      ],
    });
    res.json({ message: todosRecibidos ? 'ODC marcada como recibida' : 'Recepción parcial registrada', odc: updated });
  } catch (error: any) {
    try { await t.rollback(); } catch (_) { /* ya hecho */ }
    res.status(500).json({ error: 'Error al registrar recepción', detail: error.message });
  }
};

// GET /inventario-perfileria/:codigo — Buscar registros en inventario por código
export const getInventarioPorCodigo = async (req: Request, res: Response) => {
  try {
    const { codigo } = req.params;
    const items = await InventarioPerfileria.findAll({
      where: { codigo },
      order: [['consecutivo', 'ASC']],
    });
    res.json(items);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al consultar inventario', detail: error.message });
  }
};

// DELETE /inventario-perfileria/:consecutivo — Consumir una pieza del inventario
export const deleteInventarioPerfileria = async (req: Request, res: Response) => {
  try {
    const { consecutivo } = req.params;
    const item = await InventarioPerfileria.findOne({ where: { consecutivo: parseInt(consecutivo) } });
    if (!item) return res.status(404).json({ error: 'Registro no encontrado' });
    await item.destroy();
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Error al eliminar registro', detail: error.message });
  }
};

// PATCH /sap-item/:id/exist-perf — Guardar texto de existencia en perfilería
export const updateExistPerf = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { exist_perf } = req.body;
    const item = await SAPItem.findByPk(id);
    if (!item) return res.status(404).json({ error: 'Item no encontrado' });
    await item.update({ exist_perf: exist_perf || null });
    res.json({ id, exist_perf });
  } catch (error: any) {
    res.status(500).json({ error: 'Error al actualizar exist_perf', detail: error.message });
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

// GET /codigos-perfileria — Devuelve el set de códigos únicos en inventario_perfileria
export const getCodigosPerfileria = async (req: Request, res: Response) => {
  try {
    const rows = await InventarioPerfileria.findAll({
      attributes: ['codigo'],
      group: ['codigo'],
      where: { codigo: { [Op.ne]: null } },
    });
    res.json(rows.map((r: any) => r.getDataValue('codigo')));
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener códigos de perfilería', detail: error.message });
  }
};

// GET /compras/vidrios — ODPs con ítems de vidrio pendientes (vista por ODP, backward compat)
export const getVidriosPorGestionar = async (req: Request, res: Response) => {
  try {
    const odps = await ODP.findAll({
      include: [
        { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] },
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
        {
          model: ODPItem,
          as: 'items',
          where: { estado_compra: 'pendiente' },
          required: true,
        },
      ],
      order: [['fecha_creacion', 'DESC']],
    });

    const resultado: any[] = [];

    for (const odp of odps) {
      const todosItems: any[] = (odp as any).items || [];
      const proveedor_vidrio = odp.getDataValue('proveedor_vidrio');

      let itemsParaCompras: any[] = [];

      if (!proveedor_vidrio) {
        itemsParaCompras = todosItems;
      } else {
        const algunAsignado = todosItems.some((it: any) => it.pedido_pv_id !== null);
        if (algunAsignado) {
          itemsParaCompras = todosItems.filter((it: any) => it.pedido_pv_id === null);
        }
      }

      if (itemsParaCompras.length > 0) {
        resultado.push({
          ...odp.toJSON(),
          items: itemsParaCompras,
        });
      }
    }

    res.json(resultado);
  } catch (error: any) {
    console.error('Error getVidriosPorGestionar:', error);
    res.status(500).json({ error: 'Error al obtener vidrios por gestionar', detail: error.message });
  }
};

// GET /compras/vidrios/panel — Lista plana de ODPItems de vidrio pendientes, ordenada por tipo_vidrio ASC
// Aplica las mismas reglas de negocio que getVidriosPorGestionar pero devuelve una lista plana
// (igual que getODPsConSAPPendiente para perfilaría) para el panel de selección con checkboxes.
export const getVidriosPanel = async (req: Request, res: Response) => {
  try {
    const odps = await ODP.findAll({
      include: [
        { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] },
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
        {
          model: ODPItem,
          as: 'items',
          where: { estado_compra: 'pendiente' },
          required: true,
        },
      ],
    });

    const itemsPlanos: any[] = [];

    for (const odp of odps) {
      const todosItems: any[] = (odp as any).items || [];
      const proveedor_vidrio = odp.getDataValue('proveedor_vidrio');

      let itemsParaCompras: any[] = [];
      if (!proveedor_vidrio) {
        itemsParaCompras = todosItems;
      } else {
        const algunAsignado = todosItems.some((it: any) => it.pedido_pv_id !== null);
        if (algunAsignado) {
          itemsParaCompras = todosItems.filter((it: any) => it.pedido_pv_id === null);
        }
      }

      // Enriquecer cada item con el contexto de su ODP para trazabilidad en el frontend
      const odpContext = {
        id: odp.getDataValue('id'),
        numero_odp: odp.getDataValue('numero_odp'),
        cliente: (odp as any).cliente,
        asesor: (odp as any).asesor,
      };

      for (const item of itemsParaCompras) {
        itemsPlanos.push({
          ...(item.toJSON ? item.toJSON() : item),
          ODP: odpContext,
        });
      }
    }

    // Ordenar por tipo_vidrio ASC (igual que perfilaría ordena por código)
    itemsPlanos.sort((a, b) =>
      (a.tipo_vidrio || '').localeCompare(b.tipo_vidrio || '', 'es', { sensitivity: 'base' })
    );

    res.json(itemsPlanos);
  } catch (error: any) {
    console.error('Error getVidriosPanel:', error);
    res.status(500).json({ error: 'Error al obtener panel de vidrios', detail: error.message });
  }
};

// POST /compras/vidrios/odc — Crear ODC de vidrios desde ítems de ODP (multi-ODP)
// odp_id se guarda como null en la ODC ya que los ítems pueden venir de ODPs distintas;
// la trazabilidad queda a nivel de cada ODCItem.odp_item_id (igual que perfilaría usa sap_item_id).
export const createODCVidrios = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const userId = req.user?.id;
    // odp_id eliminado del destructuring — ahora puede venir de múltiples ODPs
    const { proveedor, odp_item_ids, notas, numero_odc } = req.body;

    if (!proveedor || !Array.isArray(odp_item_ids) || odp_item_ids.length === 0) {
      await t.rollback();
      return res.status(400).json({ error: 'proveedor y odp_item_ids son requeridos' });
    }
    if (!numero_odc || !/^\d+$/.test(String(numero_odc).trim())) {
      await t.rollback();
      return res.status(400).json({ error: 'El número de ODC es requerido y debe contener solo dígitos' });
    }
    try { await validarNumeroODC(String(numero_odc).trim()); } catch (e: any) {
      await t.rollback();
      return res.status(409).json({ error: e.message });
    }

    const odc = await OrdenCompra.create({
      numero_odc: String(numero_odc).trim(),
      sap_id: null,
      odp_id: null, // null porque los ítems pueden ser de múltiples ODPs
      tipo: 'vidrio',
      proveedor,
      notas: notas || null,
      estado: 'pendiente',
      creado_por: userId,
    }, { transaction: t });

    const odcId = odc.getDataValue('id');

    const items = await ODPItem.findAll({ where: { id: odp_item_ids }, transaction: t });

    const odcItems = items.map((it: any, idx: number) => ({
      odc_id: odcId,
      sap_item_id: null,
      odp_item_id: it.getDataValue('id'),
      odp_id: it.getDataValue('odp_id'),
      item: String(idx + 1),
      codigo: it.getDataValue('tipo_vidrio') || '',
      descripcion: [
        it.getDataValue('color') || '',
        `${it.getDataValue('espesor') || ''}mm`,
        `${it.getDataValue('ancho_mm') || ''}x${it.getDataValue('alto_mm') || ''}`,
        it.getDataValue('otros') || '',
      ].filter(Boolean).join(' — '),
      cantidad: it.getDataValue('cantidad') || 1,
    }));

    await ODCItem.bulkCreate(odcItems, { transaction: t });

    await ODPItem.update(
      { estado_compra: 'en_odc' },
      { where: { id: odp_item_ids }, transaction: t }
    );

    await t.commit();

    const odcCompleta = await OrdenCompra.findByPk(odcId, {
      include: [
        { model: ODCItem, as: 'items' },
        { model: Usuario, as: 'creador', attributes: ['id', 'nombre_completo'] },
      ],
    });

    import('../server').then(({ emitirCambio }) => emitirCambio('compras')).catch(() => {});
    res.status(201).json(odcCompleta);
  } catch (error: any) {
    await t.rollback();
    console.error('Error createODCVidrios:', error);
    res.status(500).json({ error: 'Error al crear ODC de vidrios', detail: error.message });
  }
};

// GET /compras/vidrios/existencia — Lista plana de ODPItems con estado_compra = 'en_existencia'
// Excluye ODPs en estado ENTREGADA
export const getVidriosExistencia = async (req: Request, res: Response) => {
  try {
    const { Op: Op2 } = require('sequelize');
    const odps = await ODP.findAll({
      where: { estado_produccion: { [Op2.ne]: 'ENTREGADA' } },
      include: [
        { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] },
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
        {
          model: ODPItem,
          as: 'items',
          where: { estado_compra: 'en_existencia' },
          required: true,
        },
      ],
    });

    const itemsPlanos: any[] = [];
    for (const odp of odps) {
      const odpContext = {
        id: odp.getDataValue('id'),
        numero_odp: odp.getDataValue('numero_odp'),
        estado_produccion: odp.getDataValue('estado_produccion'),
        cliente: (odp as any).cliente,
        asesor: (odp as any).asesor,
      };
      for (const item of (odp as any).items) {
        itemsPlanos.push({ ...(item.toJSON ? item.toJSON() : item), ODP: odpContext });
      }
    }
    itemsPlanos.sort((a, b) =>
      (a.tipo_vidrio || '').localeCompare(b.tipo_vidrio || '', 'es', { sensitivity: 'base' })
    );
    res.json(itemsPlanos);
  } catch (error: any) {
    console.error('Error getVidriosExistencia:', error);
    res.status(500).json({ error: 'Error al obtener ítems en existencia', detail: error.message });
  }
};

// PATCH /compras/vidrios/item/:id/estado — Marcar ítem de vidrio en_existencia o pendiente
export const updateEstadoItemVidrio = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { estado_compra } = req.body;
    if (!['pendiente', 'en_odc', 'en_existencia'].includes(estado_compra)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }
    const item = await ODPItem.findByPk(id);
    if (!item) return res.status(404).json({ error: 'Ítem no encontrado' });
    await item.update({ estado_compra });
    res.json({ id, estado_compra });
  } catch (error: any) {
    res.status(500).json({ error: 'Error al actualizar estado del ítem', detail: error.message });
  }
};

// POST /compras/odc-sin-sap — Crear ODC libre sin SAP (consumibles: tornillos, silicona, etc.)
// Body: { numero_odc, proveedor, notas?, items: [{ descripcion, codigo?, cantidad, und? }] }
export const createODCSinSAP = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { proveedor, notas, items, numero_odc } = req.body;
    const userId = req.user?.id;

    if (!items || !Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return res.status(400).json({ error: 'Debes agregar al menos un ítem' });
    }
    if (!proveedor?.trim()) {
      await t.rollback();
      return res.status(400).json({ error: 'El proveedor es requerido' });
    }
    if (!numero_odc || !/^\d+$/.test(String(numero_odc).trim())) {
      await t.rollback();
      return res.status(400).json({ error: 'El número de ODC es requerido y debe contener solo dígitos' });
    }
    try { await validarNumeroODC(String(numero_odc).trim()); } catch (e: any) {
      await t.rollback();
      return res.status(409).json({ error: e.message });
    }

    const odc = await OrdenCompra.create({
      numero_odc: String(numero_odc).trim(),
      sap_id: null,
      odp_id: null,
      tipo: 'consumible',
      proveedor,
      notas: notas || null,
      estado: 'pendiente',
      creado_por: userId,
    }, { transaction: t });

    const odcId = odc.getDataValue('id');

    await ODCItem.bulkCreate(
      items.map((i: any) => ({
        odc_id: odcId,
        sap_item_id: null,
        odp_item_id: null,
        item: i.item || null,
        codigo: i.codigo || null,
        descripcion: i.descripcion,
        cantidad: Number(i.cantidad) || 1,
        recibido: false,
      })),
      { transaction: t },
    );

    await t.commit();
    import('../server').then(({ emitirCambio }) => emitirCambio('compras')).catch(() => {});
    const odcCompleta = await OrdenCompra.findByPk(odcId, {
      include: [
        { model: ODCItem, as: 'items' },
        { model: Usuario, as: 'creador', attributes: ['id', 'nombre_completo'] },
      ],
    });
    res.status(201).json(odcCompleta);
  } catch (error: any) {
    await t.rollback();
    res.status(500).json({ error: 'Error al crear ODC sin SAP', detail: error.message });
  }
};
