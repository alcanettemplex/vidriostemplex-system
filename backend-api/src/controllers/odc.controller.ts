import { Request, Response } from 'express';
import { OrdenCompra, ODCItem, SAP, SAPItem, ODP, ODPItem, Cliente, Usuario, InventarioPerfileria } from '../models';
import sequelize from '../config/database';
import { Op } from 'sequelize';

// Consecutivo automático ODC-YYYY-NNNN
const generarNumeroODC = async (): Promise<string> => {
  const last = await OrdenCompra.findOne({
    where: { numero_odc: { [Op.like]: 'ODC-%' } },
    order: [['numero_odc', 'DESC']],
    attributes: ['numero_odc'],
  });
  let next = 1;
  if (last) {
    const parts = last.getDataValue('numero_odc').split('-');
    next = parseInt(parts[parts.length - 1]) + 1;
  }
  return `ODC-${String(next).padStart(4, '0')}`;
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
    const { proveedor, notas, items } = req.body;
    const userId = (req as any).user?.id;

    if (!items || !Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return res.status(400).json({ error: 'Debes seleccionar al menos un item' });
    }
    if (!proveedor?.trim()) {
      await t.rollback();
      return res.status(400).json({ error: 'El proveedor es requerido' });
    }

    const numero_odc = await generarNumeroODC();

    const odc = await OrdenCompra.create({
      numero_odc,
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
    if ((req as any).user?.rol !== 'admin') {
      if (Number(odc.getDataValue('creado_por')) !== Number((req as any).user?.id)) {
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
    if ((req as any).user?.rol !== 'admin') {
      if (Number(odc.getDataValue('creado_por')) !== Number((req as any).user?.id)) {
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

// ─── VIDRIOS ─────────────────────────────────────────────────────────────────

// GET /compras/vidrios — ODPs con ítems de vidrio pendientes de gestionar por compras
// Regla:
//   1. ODP sin proveedor_vidrio → todos sus ítems sin asignar van a compras
//   2. ODP con proveedor_vidrio → solo ítems con pedido_pv_id IS NULL (los que Alejandro no asignó)
//      pero solo si al menos un ítem SÍ fue asignado (la sesión de Alejandro ya terminó)
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
        // Sin proveedor → todos los ítems van a compras
        itemsParaCompras = todosItems;
      } else {
        // Con proveedor → solo si Alejandro ya gestionó (al menos 1 ítem asignado)
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

// POST /compras/vidrios/odc — Crear ODC de vidrios directamente desde ítems de ODP
export const createODCVidrios = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const userId = (req as any).user?.id;
    const { odp_id, proveedor, odp_item_ids, notas } = req.body;

    if (!odp_id || !proveedor || !Array.isArray(odp_item_ids) || odp_item_ids.length === 0) {
      await t.rollback();
      return res.status(400).json({ error: 'odp_id, proveedor y odp_item_ids son requeridos' });
    }

    const numero_odc = await generarNumeroODC();

    const odc = await OrdenCompra.create({
      numero_odc,
      sap_id: null,
      odp_id,
      tipo: 'vidrio',
      proveedor,
      notas: notas || null,
      estado: 'pendiente',
      creado_por: userId,
    }, { transaction: t });

    const odcId = odc.getDataValue('id');

    // Obtener los ítems para construir los ODCItems
    const items = await ODPItem.findAll({ where: { id: odp_item_ids }, transaction: t });

    const odcItems = items.map((it: any, idx: number) => ({
      odc_id: odcId,
      sap_item_id: null,
      odp_item_id: it.getDataValue('id'),
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

    // Marcar los ítems como en_odc
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

    res.status(201).json(odcCompleta);
  } catch (error: any) {
    await t.rollback();
    console.error('Error createODCVidrios:', error);
    res.status(500).json({ error: 'Error al crear ODC de vidrios', detail: error.message });
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
