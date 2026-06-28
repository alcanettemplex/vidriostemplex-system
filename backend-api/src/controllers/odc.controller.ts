import { Request, Response } from 'express';
import { OrdenCompra, ODCItem, SAP, SAPItem, ODP, ODPItem, Cliente, Usuario, InventarioPerfileria } from '../models';
import sequelize from '../config/database';
import { Op } from 'sequelize';

// Snapshot de una pieza de inventario consumida al cubrir un SAPItem por existencia.
// Se persiste en SAPItem.existencia_piezas para poder revertir (recrear el inventario).
interface PiezaExistencia {
  consecutivo: number;
  codigo: string | null;
  mm: number | null;
  ubicacion: string | null;
  fecha_corte: string | null;
}
// Forma del campo JSONB SAPItem.existencia_piezas
interface ExistenciaPiezas {
  piezas: PiezaExistencia[];
  faltante_id: number | null;
}

// Validar unicidad de numero_odc
const validarNumeroODC = async (numero_odc: string, excludeId?: number): Promise<void> => {
  const where: any = { numero_odc };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  const existente = await OrdenCompra.findOne({ where, attributes: ['id'] });
  if (existente) throw new Error(`Ya existe una ODC con el número ${numero_odc}`);
};

// True si la ODC tiene algún SAPItem vinculado con modificado=true (cambio sin resolver).
// Se usa para bloquear la recepción hasta que el comprador actualice la orden.
const hayItemsModificadosEnODC = async (odcId: number | string, transaction?: any): Promise<boolean> => {
  const odcItems = await ODCItem.findAll({ where: { odc_id: odcId }, attributes: ['sap_item_id'], transaction });
  const sapItemIds = odcItems.map((i: any) => i.getDataValue('sap_item_id')).filter(Boolean);
  if (sapItemIds.length === 0) return false;
  const count = await SAPItem.count({ where: { id: { [Op.in]: sapItemIds }, modificado: true }, transaction });
  return count > 0;
};

// Inclusión completa para detalle expandido y actualización tras recepción
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
                attributes: ['id', 'numero_odp', 'estado_produccion', 'fecha_creacion'],
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
            attributes: ['id', 'numero_odp', 'estado_produccion'],
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

// Inclusión para listados: campos de display + trazabilidad mínima (sin campos pesados de SAPItem/ODCItem)
const includeItemsLista = [
  {
    model: ODCItem,
    as: 'items',
    attributes: ['id', 'codigo', 'descripcion', 'cantidad', 'recibido'],
    include: [
      {
        model: SAPItem, as: 'sap_item',
        attributes: ['id', 'dimension', 'observacion', 'modificado', 'exist_perf', 'estado_compra'],
        include: [{
          model: SAP,
          attributes: ['id', 'numero_sap'],
          include: [{
            model: ODP,
            attributes: ['id', 'numero_odp'],
            include: [
              { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] },
              { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
            ],
          }],
        }],
      },
      {
        model: ODPItem, as: 'odp_item',
        attributes: ['id'],
        include: [{ model: ODP, attributes: ['id', 'numero_odp'] }],
      },
      {
        model: ODP, as: 'odp_directo',
        required: false,
        attributes: ['id', 'numero_odp'],
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
        ...includeItemsLista,
        { model: Usuario, as: 'creador', attributes: ['id', 'nombre_completo'] },
        // Backward compat: ODCs antiguas con sap_id
        {
          model: SAP, as: 'sap',
          include: [{
            model: ODP,
            attributes: ['id', 'numero_odp', 'estado_produccion', 'fecha_creacion'],
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
      limit: 200,
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
        ...includeItemsLista,
        { model: Usuario, as: 'creador', attributes: ['id', 'nombre_completo'] },
        // Backward compat: ODCs antiguas con sap_id
        {
          model: SAP, as: 'sap',
          include: [{
            model: ODP,
            attributes: ['id', 'numero_odp', 'estado_produccion', 'fecha_creacion'],
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
      limit: 200,
    });
    res.json(odcs);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener recibidas', detail: error.message });
  }
};

// GET /odc/panel — Lista plana de SAPItems realmente pendientes.
// Los ítems modificados que ya están en una ODC NO reaparecen aquí: se resuelven
// desde Seguimiento con el botón "Actualizar orden" (evita el doble pedido).
export const getODPsConSAPPendiente = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string) || 100));
    const offset = (page - 1) * limit;
    const items = await SAPItem.findAndCountAll({
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
      limit,
      offset,
    });
    res.json({
      rows: items.rows,
      count: items.count,
      page,
      totalPages: Math.ceil(items.count / limit),
    });
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

    // ─── Salvaguarda anti-doble-pedido ───
    // Ningún SAPItem seleccionado puede estar ya en otra ODC activa (no recibida/cancelada).
    const sapItemIdsSel = items.map((i: any) => i.sap_item_id).filter(Boolean);
    if (sapItemIdsSel.length > 0) {
      const yaEnODC = await ODCItem.findAll({
        where: { sap_item_id: { [Op.in]: sapItemIdsSel } },
        include: [{
          model: OrdenCompra, attributes: ['numero_odc'], required: true,
          where: { estado: { [Op.in]: ['pendiente', 'en_transito', 'problema'] } },
        }],
        transaction: t,
      });
      if (yaEnODC.length > 0) {
        const numeros = [...new Set(yaEnODC.map((x: any) => x.OrdenCompra?.numero_odc).filter(Boolean))];
        await t.rollback();
        return res.status(409).json({
          error: `Hay material que ya está en una ODC activa (${numeros.join(', ')}). Actualiza esa orden en lugar de crear un pedido nuevo.`,
        });
      }
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

    // Marcar todos los SAPItems incluidos como en_odc y limpiar flag de modificado
    if (sapItemIdsSel.length > 0) {
      await SAPItem.update(
        { estado_compra: 'en_odc', modificado: false, datos_anteriores: null },
        { where: { id: { [Op.in]: sapItemIdsSel } }, transaction: t }
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

    // No se puede recibir una ODC con material modificado sin actualizar
    if (estado === 'recibido' && estadoAnterior !== 'recibido') {
      if (await hayItemsModificadosEnODC(id)) {
        return res.status(400).json({ error: 'Hay materiales modificados sin actualizar. Actualiza la orden antes de marcarla como recibida.' });
      }
    }

    const fechaRecepcion = estado === 'recibido' && estadoAnterior !== 'recibido'
      ? new Date() : odc.getDataValue('fecha_recepcion');

    await odc.update({ estado, proveedor, notas, ...(fechaRecepcion ? { fecha_recepcion: fechaRecepcion } : {}) });

    // Al marcar como recibida: pasar SAPItems de esta ODC a en_existencia y limpiar modificado
    if (estado === 'recibido' && estadoAnterior !== 'recibido') {
      const odcItems = await ODCItem.findAll({ where: { odc_id: id } });
      const sapItemIds = odcItems.map((i: any) => i.getDataValue('sap_item_id'));
      if (sapItemIds.length > 0) {
        await SAPItem.update(
          { estado_compra: 'en_existencia', modificado: false, datos_anteriores: null },
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
            estado_nuevo: odp.estado_produccion,
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

    // No se puede recibir una ODC con material modificado sin actualizar
    if (await hayItemsModificadosEnODC(id, t)) {
      await t.rollback();
      return res.status(400).json({ error: 'Hay materiales modificados sin actualizar. Actualiza la orden antes de registrar la recepción.' });
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
          { estado_compra: 'en_existencia', modificado: false, datos_anteriores: null },
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

/**
 * PATCH /odc/:id/sincronizar-item/:itemId
 * Caso 1 — "Actualizar orden": sincroniza una línea de la ODC con los datos actuales
 * del SAPItem (código, descripción, cantidad) y limpia la alerta de modificado.
 * Solo el creador de la ODC o un admin. Solo en ODCs activas (no recibidas).
 */
export const sincronizarItemODC = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { id, itemId } = req.params;

    const odc = await OrdenCompra.findByPk(id, { transaction: t });
    if (!odc) { await t.rollback(); return res.status(404).json({ error: 'ODC no encontrada' }); }

    // Ownership: solo creador o admin
    if (req.user?.rol !== 'admin' && Number(odc.getDataValue('creado_por')) !== Number(req.user?.id)) {
      await t.rollback();
      return res.status(403).json({ error: 'Solo el creador de la ODC puede actualizarla' });
    }

    const estadoODC = odc.getDataValue('estado');
    if (estadoODC === 'recibido') {
      await t.rollback();
      return res.status(400).json({ error: 'No se puede actualizar una ODC recibida' });
    }

    const odcItem = await ODCItem.findOne({ where: { id: itemId, odc_id: id }, transaction: t });
    if (!odcItem) { await t.rollback(); return res.status(404).json({ error: 'Ítem no encontrado en esta ODC' }); }

    const sapItemId = odcItem.getDataValue('sap_item_id');
    if (!sapItemId) {
      await t.rollback();
      return res.status(400).json({ error: 'Este ítem no proviene de una SAP; no hay nada que sincronizar' });
    }

    const sapItem = await SAPItem.findByPk(sapItemId, { transaction: t });
    if (!sapItem) { await t.rollback(); return res.status(404).json({ error: 'SAPItem no encontrado' }); }

    // Copiar valores actuales del SAPItem a la línea de la ODC
    await odcItem.update({
      codigo: sapItem.getDataValue('codigo'),
      descripcion: sapItem.getDataValue('descripcion'),
      cantidad: sapItem.getDataValue('cantidad'),
    }, { transaction: t });

    // Limpiar la alerta de modificado
    await sapItem.update({ modificado: false, datos_anteriores: null }, { transaction: t });

    await t.commit();
    import('../server').then(({ emitirCambio }) => emitirCambio('compras')).catch(() => {});
    res.json({ ok: true, odc_item_id: Number(itemId) });
  } catch (error: any) {
    await t.rollback();
    res.status(500).json({ error: 'Error al sincronizar el ítem', detail: error.message });
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

// POST /sap-item/:id/dividir-existencia — Cobertura parcial de existencia perfilería:
//   1. Crea un ítem "faltante" (pendiente) heredando el contexto del original
//   2. Marca el ítem original como en_existencia, guardando el texto de piezas en exist_perf
//   3. Consume del inventario las piezas asignadas (consecutivos)
// Operación atómica: si algo falla, no quedan estados a medias.
export const dividirPorExistencia = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { exist_perf, consecutivos, faltante, piezas } = req.body as {
      exist_perf?: string;
      consecutivos?: number[];
      faltante?: { cantidad?: number; dimension?: string };
      piezas?: PiezaExistencia[];
    };

    if (!faltante || !faltante.dimension || !String(faltante.dimension).trim()) {
      await t.rollback();
      return res.status(400).json({ error: 'La dimensión del faltante es requerida' });
    }

    const original = await SAPItem.findByPk(id, { transaction: t });
    if (!original) {
      await t.rollback();
      return res.status(404).json({ error: 'Ítem no encontrado' });
    }

    // 1. Crear el ítem faltante (pendiente), heredando contexto del original
    const faltanteItem = await SAPItem.create({
      sap_id: original.getDataValue('sap_id'),
      item: original.getDataValue('item'),
      codigo: original.getDataValue('codigo'),
      descripcion: original.getDataValue('descripcion'),
      dimension: String(faltante.dimension).trim(),
      cantidad: Number(faltante.cantidad) || 0,
      und: original.getDataValue('und'),
      estado_compra: 'pendiente',
      modificado: false,
      es_faltante: true,
    }, { transaction: t });

    // 2. Marcar el original como cubierto por existencia (sale de Pendientes)
    //    Guardar snapshot de piezas + id del faltante para poder revertir después
    await original.update({
      estado_compra: 'en_existencia',
      exist_perf: (exist_perf && exist_perf.trim()) || original.getDataValue('exist_perf') || null,
      existencia_piezas: { piezas: piezas || [], faltante_id: faltanteItem.getDataValue('id') },
      modificado: false,
      datos_anteriores: null,
    }, { transaction: t });

    // 3. Consumir las piezas del inventario asignadas
    if (Array.isArray(consecutivos) && consecutivos.length > 0) {
      await InventarioPerfileria.destroy({
        where: { consecutivo: { [Op.in]: consecutivos } },
        transaction: t,
      });
    }

    await t.commit();
    import('../server').then(({ emitirCambio }) => emitirCambio('compras')).catch(() => {});
    res.status(201).json({ original_id: Number(id), faltante: faltanteItem });
  } catch (error: any) {
    await t.rollback();
    res.status(500).json({ error: 'Error al dividir por existencia', detail: error.message });
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

// GET /odc/:id/items — ítems completos con trazabilidad (lazy-load al expandir tarjeta)
export const getODCItems = async (req: Request, res: Response) => {
  try {
    const odc = await OrdenCompra.findByPk(req.params.id, {
      include: includeItemsTrazabilidad,
      attributes: ['id'],
    });
    if (!odc) return res.status(404).json({ error: 'ODC no encontrada' });
    res.json((odc as any).items ?? []);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener ítems', detail: error.message });
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
      const numero_pedido_proveedor = odp.getDataValue('numero_pedido_proveedor');
      const tieneRutaPV = !!(proveedor_vidrio || numero_pedido_proveedor);

      let itemsParaCompras: any[] = [];

      if (!tieneRutaPV) {
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
      const numero_pedido_proveedor = odp.getDataValue('numero_pedido_proveedor');
      const tieneRutaPV = !!(proveedor_vidrio || numero_pedido_proveedor);

      let itemsParaCompras: any[] = [];
      if (!tieneRutaPV) {
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

    // ─── Salvaguarda anti-doble-pedido ───
    // Ningún ODPItem seleccionado puede estar ya en otra ODC activa (no recibida/cancelada).
    const yaEnODCVidrio = await ODCItem.findAll({
      where: { odp_item_id: { [Op.in]: odp_item_ids } },
      include: [{
        model: OrdenCompra, attributes: ['numero_odc'], required: true,
        where: { estado: { [Op.in]: ['pendiente', 'en_transito', 'problema'] } },
      }],
      transaction: t,
    });
    if (yaEnODCVidrio.length > 0) {
      const numeros = [...new Set(yaEnODCVidrio.map((x: any) => x.OrdenCompra?.numero_odc).filter(Boolean))];
      await t.rollback();
      return res.status(409).json({
        error: `Hay vidrio que ya está en una ODC activa (${numeros.join(', ')}). Actualiza esa orden en lugar de crear un pedido nuevo.`,
      });
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

    // Verificar que todos los IDs solicitados existen en BD
    if (items.length !== odp_item_ids.length) {
      const encontrados = items.map((it: any) => it.getDataValue('id'));
      const faltantes = odp_item_ids.filter((id: number) => !encontrados.includes(id));
      await t.rollback();
      return res.status(400).json({
        error: `Los siguientes odp_item_ids no existen: ${faltantes.join(', ')}`,
      });
    }

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

    // Guardia final: ningún ODCItem puede quedar sin odp_item_id
    const sinEnlace = odcItems.filter(i => !i.odp_item_id);
    if (sinEnlace.length > 0) {
      await t.rollback();
      return res.status(500).json({ error: 'Error interno: ODCItems generados sin odp_item_id. Operación cancelada.' });
    }

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

// POST /sap-item/:id/asignar-existencia — Cobertura TOTAL por existencia perfilería:
//   El ítem completo queda cubierto por inventario (no genera faltante).
//   Guarda snapshot de piezas (faltante_id=null) y consume del inventario los consecutivos.
// Body: { exist_perf, consecutivos: number[], piezas: PiezaExistencia[] }
export const asignarExistencia = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { exist_perf, consecutivos, piezas } = req.body as {
      exist_perf?: string;
      consecutivos?: number[];
      piezas?: PiezaExistencia[];
    };

    const item = await SAPItem.findByPk(id, { transaction: t });
    if (!item) {
      await t.rollback();
      return res.status(404).json({ error: 'Ítem no encontrado' });
    }

    if (item.getDataValue('estado_compra') === 'en_odc') {
      await t.rollback();
      return res.status(400).json({ error: 'No se puede marcar en existencia un ítem ya asignado a una ODC' });
    }

    await item.update({
      estado_compra: 'en_existencia',
      exist_perf: (exist_perf && exist_perf.trim()) || null,
      existencia_piezas: { piezas: piezas || [], faltante_id: null },
      modificado: false,
      datos_anteriores: null,
    }, { transaction: t });

    // Consumir del inventario las piezas asignadas
    if (Array.isArray(consecutivos) && consecutivos.length > 0) {
      await InventarioPerfileria.destroy({
        where: { consecutivo: { [Op.in]: consecutivos } },
        transaction: t,
      });
    }

    await t.commit();
    import('../server').then(({ emitirCambio }) => emitirCambio('compras')).catch(() => {});
    res.json({ ok: true, id: Number(id), estado_compra: 'en_existencia' });
  } catch (error: any) {
    await t.rollback();
    res.status(500).json({ error: 'Error al asignar existencia', detail: error.message });
  }
};

// POST /sap-item/:id/revertir-existencia — Deshacer una cobertura por existencia:
//   1. Si hay faltante asociado y aún es revertible (pendiente, sin ODC) → se elimina.
//   2. Recrea en inventario las piezas consumidas (desde el snapshot existencia_piezas).
//   3. Devuelve el SAPItem a 'pendiente' y limpia exist_perf/existencia_piezas.
// Caso legacy (sin snapshot pero con exist_perf): solo limpia y vuelve a pendiente.
export const revertirExistencia = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;

    const item = await SAPItem.findByPk(id, { transaction: t });
    if (!item) {
      await t.rollback();
      return res.status(404).json({ error: 'Ítem no encontrado' });
    }

    const snapshot = item.getDataValue('existencia_piezas') as ExistenciaPiezas | null;

    // 1. Manejar el faltante asociado (cobertura parcial previa)
    const faltanteId = snapshot?.faltante_id ?? null;
    if (faltanteId) {
      const faltante = await SAPItem.findByPk(faltanteId, { transaction: t });
      if (faltante) {
        // ¿El faltante ya entró a una ODC activa (no cancelada)?
        const enODCActiva = await ODCItem.count({
          where: { sap_item_id: faltanteId },
          include: [{ model: OrdenCompra, attributes: [], required: true, where: { estado: { [Op.ne]: 'cancelado' } } }],
          transaction: t,
        });
        if (faltante.getDataValue('estado_compra') === 'en_odc' || enODCActiva > 0) {
          await t.rollback();
          return res.status(400).json({
            error: 'No se puede revertir: el faltante asociado ya está en una ODC. Elimina o cancela esa ODC primero.',
          });
        }
        // Faltante pendiente y sin ODC activa → eliminar
        await faltante.destroy({ transaction: t });
      }
    }

    // 2. Recrear las piezas consumidas en el inventario (si hay snapshot)
    const piezas = snapshot?.piezas ?? [];
    if (piezas.length > 0) {
      try {
        await InventarioPerfileria.bulkCreate(
          piezas.map((p) => ({
            consecutivo: p.consecutivo,
            codigo: p.codigo ?? null,
            mm: p.mm ?? null,
            ubicacion: p.ubicacion ?? null,
            fecha_corte: p.fecha_corte ?? null,
          })),
          { transaction: t },
        );
      } catch (e: any) {
        await t.rollback();
        const esUnique = e?.name === 'SequelizeUniqueConstraintError';
        return res.status(esUnique ? 409 : 500).json({
          error: esUnique
            ? 'No se puede revertir: uno o más consecutivos ya existen en el inventario.'
            : 'Error al recrear las piezas en el inventario',
          detail: e?.message,
        });
      }
    }

    // 3. Devolver el SAPItem a pendiente
    await item.update({
      estado_compra: 'pendiente',
      exist_perf: null,
      existencia_piezas: null,
    }, { transaction: t });

    await t.commit();
    import('../server').then(({ emitirCambio }) => emitirCambio('compras')).catch(() => {});
    res.json({ ok: true, id: Number(id), estado_compra: 'pendiente' });
  } catch (error: any) {
    await t.rollback();
    res.status(500).json({ error: 'Error al revertir existencia', detail: error.message });
  }
};

// GET /perfileria/existencia — Lista de SAPItems de perfilería cubiertos por existencia.
// Pestaña "En Existencia". Excluye ODPs ENTREGADA. Ordena por código ASC.
export const getPerfileriaExistencia = async (req: Request, res: Response) => {
  try {
    const items = await SAPItem.findAll({
      where: {
        estado_compra: 'en_existencia',
        exist_perf: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] },
      },
      include: [
        {
          model: SAP,
          required: true,
          include: [
            {
              model: ODP,
              required: true,
              attributes: ['id', 'numero_odp', 'estado_produccion'],
              where: { estado_produccion: { [Op.ne]: 'ENTREGADA' } },
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
    res.status(500).json({ error: 'Error al obtener existencia de perfilería', detail: error.message });
  }
};

// DELETE /odc/:id — Eliminación FÍSICA de una ODC (perfilería/consumible/vidrio) no recibida.
// Revierte a 'pendiente' los SAPItems/ODPItems que no queden en otra ODC activa.
export const eliminarODC = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;

    const odc = await OrdenCompra.findByPk(id, {
      include: [{ model: ODCItem, as: 'items' }],
      transaction: t,
    });
    if (!odc) { await t.rollback(); return res.status(404).json({ error: 'ODC no encontrada' }); }

    const odcItems = (odc as any).items as any[];
    const tieneRecibidos = odc.getDataValue('estado') === 'recibido' || odcItems.some((i: any) => i.recibido === true);
    if (tieneRecibidos) {
      await t.rollback();
      return res.status(400).json({ error: 'No se puede eliminar una ODC con material ya recibido.' });
    }

    const sapItemIds = odcItems.map((i: any) => i.sap_item_id).filter(Boolean);
    const odpItemIds = odcItems.map((i: any) => i.odp_item_id).filter(Boolean);

    // Revertir sap_items a 'pendiente' si no quedan en OTRA ODC activa (excluyendo esta, que se borrará)
    for (const sapItemId of sapItemIds) {
      const enOtraODCActiva = await ODCItem.count({
        where: { sap_item_id: sapItemId, odc_id: { [Op.ne]: id } },
        include: [{ model: OrdenCompra, attributes: [], required: true, where: { estado: { [Op.ne]: 'cancelado' } } }],
        transaction: t,
      });
      if (enOtraODCActiva === 0) {
        await SAPItem.update(
          { estado_compra: 'pendiente', modificado: false, datos_anteriores: null },
          { where: { id: sapItemId }, transaction: t },
        );
      }
    }

    // Revertir odp_items (vidrio) a 'pendiente' si no quedan en OTRA ODC activa
    for (const odpItemId of odpItemIds) {
      const enOtraODCActiva = await ODCItem.count({
        where: { odp_item_id: odpItemId, odc_id: { [Op.ne]: id } },
        include: [{ model: OrdenCompra, attributes: [], required: true, where: { estado: { [Op.ne]: 'cancelado' } } }],
        transaction: t,
      });
      if (enOtraODCActiva === 0) {
        await ODPItem.update(
          { estado_compra: 'pendiente' },
          { where: { id: odpItemId }, transaction: t },
        );
      }
    }

    // Borrado físico: primero los ítems, luego la cabecera
    await ODCItem.destroy({ where: { odc_id: id }, transaction: t });
    await odc.destroy({ transaction: t });

    await t.commit();
    import('../server').then(({ emitirCambio }) => emitirCambio('compras')).catch(() => {});
    res.json({ ok: true, eliminado: true });
  } catch (error: any) {
    await t.rollback();
    res.status(500).json({ error: 'Error al eliminar ODC', detail: error.message });
  }
};

// PUT /odc/:id/items — Editar las líneas de una ODC (perfilería/consumible).
// Body: { proveedor?, notas?, items: [{ id?, sap_item_id?, codigo?, descripcion?, cantidad, und? }] }
// `items` es el SET FINAL deseado. Las líneas con id se actualizan; sin id se crean;
// las existentes ausentes del set se eliminan (revirtiendo su SAPItem si aplica).
export const editarItemsODC = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { proveedor, notas, items } = req.body as {
      proveedor?: string;
      notas?: string;
      items?: Array<{
        id?: number;
        sap_item_id?: number | null;
        codigo?: string;
        descripcion?: string;
        cantidad: number;
        und?: string;
      }>;
    };

    if (!Array.isArray(items)) {
      await t.rollback();
      return res.status(400).json({ error: 'items debe ser un arreglo' });
    }
    if (items.length === 0) {
      await t.rollback();
      return res.status(400).json({ error: 'La ODC debe conservar al menos un ítem. Si deseas eliminarla, usa la opción de eliminar.' });
    }

    const odc = await OrdenCompra.findByPk(id, {
      include: [{ model: ODCItem, as: 'items' }],
      transaction: t,
    });
    if (!odc) { await t.rollback(); return res.status(404).json({ error: 'ODC no encontrada' }); }

    const tipo = odc.getDataValue('tipo');
    if (tipo === 'vidrio') {
      await t.rollback();
      return res.status(400).json({ error: 'La edición de ítems no aplica a ODC de vidrio.' });
    }

    // ─── Bloqueos ───
    const existentes = (odc as any).items as any[];
    const tieneRecibidos = odc.getDataValue('estado') === 'recibido' || existentes.some((i: any) => i.recibido === true);
    if (tieneRecibidos) {
      await t.rollback();
      return res.status(400).json({ error: 'No se puede editar una ODC con material ya recibido.' });
    }
    if (await hayItemsModificadosEnODC(id, t)) {
      await t.rollback();
      return res.status(400).json({ error: 'Hay materiales modificados sin sincronizar. Actualiza la orden antes de editarla.' });
    }

    // ─── Cabecera ───
    const cambiosCabecera: { proveedor?: string; notas?: string | null } = {};
    if (typeof proveedor === 'string' && proveedor.trim()) cambiosCabecera.proveedor = proveedor.trim();
    if (notas !== undefined) cambiosCabecera.notas = notas || null;
    if (Object.keys(cambiosCabecera).length > 0) {
      await odc.update(cambiosCabecera, { transaction: t });
    }

    const existentesPorId = new Map<number, any>(existentes.map((i: any) => [i.getDataValue('id'), i]));
    const idsEnSet = new Set<number>(items.filter((l) => l.id != null).map((l) => Number(l.id)));

    // ─── 1. Eliminar líneas existentes ausentes del set final ───
    for (const existente of existentes) {
      const odcItemId = existente.getDataValue('id');
      if (idsEnSet.has(odcItemId)) continue;
      const sapItemId = existente.getDataValue('sap_item_id');
      await existente.destroy({ transaction: t });
      if (sapItemId) {
        const enOtraODCActiva = await ODCItem.count({
          where: { sap_item_id: sapItemId, odc_id: { [Op.ne]: id } },
          include: [{ model: OrdenCompra, attributes: [], required: true, where: { estado: { [Op.ne]: 'cancelado' } } }],
          transaction: t,
        });
        if (enOtraODCActiva === 0) {
          await SAPItem.update(
            { estado_compra: 'pendiente', modificado: false, datos_anteriores: null },
            { where: { id: sapItemId }, transaction: t },
          );
        }
      }
    }

    // ─── 2. Procesar el set final: update existentes / crear nuevas ───
    for (const linea of items) {
      const cantidad = Number(linea.cantidad);
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        await t.rollback();
        return res.status(400).json({ error: 'Cada ítem debe tener una cantidad válida mayor a 0' });
      }

      if (linea.id != null) {
        // Línea existente → actualizar
        const existente = existentesPorId.get(Number(linea.id));
        if (!existente) {
          await t.rollback();
          return res.status(400).json({ error: `El ítem ${linea.id} no pertenece a esta ODC` });
        }
        const cambios: any = { cantidad };
        if (tipo === 'consumible') {
          if (linea.codigo !== undefined) cambios.codigo = linea.codigo || null;
          if (linea.descripcion !== undefined) cambios.descripcion = linea.descripcion || null;
        }
        await existente.update(cambios, { transaction: t });
      } else {
        // Línea nueva
        if (tipo === 'perfileria') {
          if (linea.sap_item_id == null) {
            await t.rollback();
            return res.status(400).json({ error: 'En ODC de perfilería solo se pueden agregar ítems desde pendientes (con sap_item_id).' });
          }
          const sapItem = await SAPItem.findByPk(linea.sap_item_id, { transaction: t });
          if (!sapItem) {
            await t.rollback();
            return res.status(400).json({ error: `El SAPItem ${linea.sap_item_id} no existe` });
          }
          // Anti-doble-pedido: que no esté en otra ODC activa
          const yaEnODC = await ODCItem.count({
            where: { sap_item_id: linea.sap_item_id },
            include: [{
              model: OrdenCompra, attributes: [], required: true,
              where: { estado: { [Op.in]: ['pendiente', 'en_transito', 'problema'] } },
            }],
            transaction: t,
          });
          if (yaEnODC > 0) {
            await t.rollback();
            return res.status(409).json({ error: `El material (SAPItem ${linea.sap_item_id}) ya está en una ODC activa. Actualiza esa orden en lugar de agregarlo aquí.` });
          }
          await ODCItem.create({
            odc_id: Number(id),
            sap_item_id: sapItem.getDataValue('id'),
            odp_item_id: null,
            odp_id: null,
            item: sapItem.getDataValue('item'),
            codigo: sapItem.getDataValue('codigo'),
            descripcion: sapItem.getDataValue('descripcion'),
            cantidad,
            recibido: false,
          }, { transaction: t });
          await sapItem.update({ estado_compra: 'en_odc', modificado: false, datos_anteriores: null }, { transaction: t });
        } else {
          // consumible: línea libre
          await ODCItem.create({
            odc_id: Number(id),
            sap_item_id: null,
            odp_item_id: null,
            odp_id: null,
            item: null,
            codigo: linea.codigo || null,
            descripcion: linea.descripcion || null,
            cantidad,
            recibido: false,
          }, { transaction: t });
        }
      }
    }

    // ─── Guardia: la ODC no puede quedar vacía ───
    const finales = await ODCItem.count({ where: { odc_id: id }, transaction: t });
    if (finales === 0) {
      await t.rollback();
      return res.status(400).json({ error: 'La ODC quedaría sin ítems. Operación cancelada.' });
    }

    await t.commit();
    import('../server').then(({ emitirCambio }) => emitirCambio('compras')).catch(() => {});

    const actualizada = await OrdenCompra.findByPk(id, {
      include: [
        { model: ODCItem, as: 'items' },
        { model: Usuario, as: 'creador', attributes: ['id', 'nombre_completo'] },
      ],
    });
    res.json(actualizada);
  } catch (error: any) {
    await t.rollback();
    res.status(500).json({ error: 'Error al editar ítems de la ODC', detail: error.message });
  }
};
