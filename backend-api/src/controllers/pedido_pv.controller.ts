import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { z } from 'zod';
import { PedidoPV, ODP, ODPItem, Usuario, HistorialEstadoODP, sequelize } from '../models';
import Cliente from '../models/cliente.model';
import { emitirNotificacion } from '../server';

// ─── Esquema de validación ────────────────────────────────────────────────────

const pedidoPVSchema = z.object({
  odp_id: z.number().int().positive(),
  proveedor: z.string().min(1),
  sufijo: z.string().max(5).optional().nullable(),
  fecha_envio: z.string().optional().nullable(),
  hora_envio: z.string().optional().nullable(),
  fecha_entrega_prometida: z.string().optional().nullable(),
  metraje_venta: z.number().nonnegative().optional().nullable(),
  espesor_vidrio: z.string().optional().nullable(),
  observaciones: z.string().optional().nullable(),
});

// ─── Helper: generar número de pedido ────────────────────────────────────────

const generarNumeroPedido = async (sufijo?: string | null): Promise<{ numero_pedido: string; numero_base: number }> => {
  const ultimo = await PedidoPV.findOne({
    order: [['numero_base', 'DESC']],
    attributes: ['numero_base'],
  });

  const numero_base = ultimo ? (ultimo.getDataValue('numero_base') as number) + 1 : 6733;
  const numero_pedido = sufijo ? `${numero_base}-${sufijo.toUpperCase()}` : `${numero_base}`;
  return { numero_pedido, numero_base };
};

// ─── Helper: include estándar ─────────────────────────────────────────────────

const INCLUDE_COMPLETO = [
  {
    model: ODP,
    as: 'odp',
    attributes: ['id', 'numero_odp', 'estado_produccion'],
    include: [{ model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] }],
  },
  { model: Usuario, as: 'creador', attributes: ['id', 'nombre_completo'] },
  { model: Usuario, as: 'verificador', attributes: ['id', 'nombre_completo'] },
  {
    model: ODPItem,
    as: 'items_asignados',
    attributes: ['id', 'item', 'color', 'espesor', 'cantidad', 'ancho_mm', 'alto_mm',
      'tipo_vidrio', 'pulidos', 'pulidos_h', 'perforaciones', 'boquetes',
      'descuentos', 'otros', 'mts_pt_a', 'mts_pt_h', 'accesorios'],
  },
];

// ─── Helper: avanzar ODP a VIDRIO_RECIBIDO si todos los PV están verificados ──

const verificarAvanceODP = async (odp_id: number, usuario_id: number) => {
  const pedidos = await PedidoPV.findAll({ where: { odp_id } });
  const todosVerificados = pedidos.every(
    (p) => p.getDataValue('estado') === 'VERIFICADO'
  );
  if (!todosVerificados) return;

  const odp = await ODP.findByPk(odp_id);
  if (!odp) return;

  const estadoActual = odp.getDataValue('estado_produccion');
  if (estadoActual === 'VIDRIO_RECIBIDO' || estadoActual === 'VERIFICADO') return;

  await odp.update({ chk_vidrio: true, estado_produccion: 'VIDRIO_RECIBIDO' });

  await HistorialEstadoODP.create({
    odp_id,
    usuario_id,
    estado_anterior: estadoActual,
    estado_nuevo: 'VIDRIO_RECIBIDO',
    observacion: 'Avance automático: todos los pedidos PV verificados',
  });

  const numero_odp = odp.getDataValue('numero_odp');
  const asesor_id = odp.getDataValue('asesor_id');

  emitirNotificacion(
    { userId: asesor_id, roles: ['jefe_produccion', 'produccion', 'compras', 'gerencia'] },
    {
      titulo: `ODP ${numero_odp}`,
      mensaje: 'Todos los vidrios verificados — ODP avanzó a Vidrio Recibido',
      odp_id,
      numero_odp,
      tipo: 'VIDRIO_RECIBIDO',
    }
  );
};

// ─── CONTROLADORES ────────────────────────────────────────────────────────────

// GET /api/pedidos-pv
export const getPedidosPV = async (req: Request, res: Response) => {
  try {
    const { estado, proveedor, odp_id, origen } = req.query;
    const where: Record<string, unknown> = {};

    if (estado) where.estado = estado;
    if (proveedor) where.proveedor = { [Op.iLike]: `%${proveedor}%` };
    if (odp_id) where.odp_id = odp_id;
    if (origen) where.origen = origen;

    const pedidos = await PedidoPV.findAll({
      where,
      include: INCLUDE_COMPLETO,
      order: [['numero_base', 'DESC'], ['sufijo', 'ASC']],
    });

    res.json(pedidos);
  } catch (error) {
    console.error('Error getPedidosPV:', error);
    res.status(500).json({ error: 'Error al obtener pedidos PV' });
  }
};

// GET /api/pedidos-pv/:id
export const getPedidoPV = async (req: Request, res: Response) => {
  try {
    const pedido = await PedidoPV.findByPk(req.params.id, { include: INCLUDE_COMPLETO });
    if (!pedido) return res.status(404).json({ error: 'Pedido PV no encontrado' });
    res.json(pedido);
  } catch (error) {
    console.error('Error getPedidoPV:', error);
    res.status(500).json({ error: 'Error al obtener pedido PV' });
  }
};

// POST /api/pedidos-pv — solo puede_gestionar_pv
export const createPedidoPV = async (req: Request, res: Response) => {
  try {
    const user = req.user as { id: number; rol: string };

    // Verificar permiso específico
    const usuario = await Usuario.findByPk(user.id, { attributes: ['puede_gestionar_pv'] });
    if (!usuario || !usuario.getDataValue('puede_gestionar_pv')) {
      return res.status(403).json({ error: 'No tienes permiso para crear pedidos PV' });
    }

    const data = pedidoPVSchema.parse(req.body);
    const { numero_pedido, numero_base } = await generarNumeroPedido(data.sufijo);

    const pedido = await PedidoPV.create({
      ...data,
      numero_pedido,
      numero_base,
      creado_por: user.id,
      estado: 'PENDIENTE',
      origen: 'SISTEMA',
    });

    const pedidoCompleto = await PedidoPV.findByPk(pedido.getDataValue('id'), { include: INCLUDE_COMPLETO });
    res.status(201).json(pedidoCompleto);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues });
    console.error('Error createPedidoPV:', error);
    res.status(500).json({ error: 'Error al crear pedido PV' });
  }
};

// PATCH /api/pedidos-pv/:id/enviar
export const marcarEnviado = async (req: Request, res: Response) => {
  try {
    const pedido = await PedidoPV.findByPk(req.params.id);
    if (!pedido) return res.status(404).json({ error: 'Pedido PV no encontrado' });

    const { fecha_envio, hora_envio, fecha_entrega_prometida, confirmado_proveedor } = req.body;

    await pedido.update({
      estado: 'ENVIADO',
      fecha_envio: fecha_envio || new Date().toISOString().split('T')[0],
      hora_envio: hora_envio || new Date().toTimeString().split(' ')[0],
      fecha_entrega_prometida,
      confirmado_proveedor: confirmado_proveedor ?? false,
    });

    const pedidoActualizado = await PedidoPV.findByPk(req.params.id, { include: INCLUDE_COMPLETO });
    res.json(pedidoActualizado);
  } catch (error) {
    console.error('Error marcarEnviado:', error);
    res.status(500).json({ error: 'Error al marcar como enviado' });
  }
};

// PATCH /api/pedidos-pv/:id/confirmar-proveedor
export const confirmarProveedor = async (req: Request, res: Response) => {
  try {
    const pedido = await PedidoPV.findByPk(req.params.id);
    if (!pedido) return res.status(404).json({ error: 'Pedido PV no encontrado' });

    await pedido.update({
      confirmado_proveedor: true,
      estado: 'CONFIRMADO_PROVEEDOR',
    });

    const pedidoActualizado = await PedidoPV.findByPk(req.params.id, { include: INCLUDE_COMPLETO });
    res.json(pedidoActualizado);
  } catch (error) {
    console.error('Error confirmarProveedor:', error);
    res.status(500).json({ error: 'Error al confirmar proveedor' });
  }
};

// PATCH /api/pedidos-pv/:id/registrar-llegada — produccion/compras
export const registrarLlegada = async (req: Request, res: Response) => {
  try {
    const pedido = await PedidoPV.findByPk(req.params.id, { include: INCLUDE_COMPLETO });
    if (!pedido) return res.status(404).json({ error: 'Pedido PV no encontrado' });

    const fecha_llegada_real = req.body.fecha_llegada_real || new Date().toISOString().split('T')[0];
    const fecha_prometida = pedido.getDataValue('fecha_entrega_prometida');

    let dias_diferencia = null;
    if (fecha_prometida) {
      const prometida = new Date(fecha_prometida);
      const llegada = new Date(fecha_llegada_real);
      dias_diferencia = Math.floor((prometida.getTime() - llegada.getTime()) / (1000 * 60 * 60 * 24));
    }

    await pedido.update({ estado: 'LLEGADO', fecha_llegada_real, dias_diferencia });

    // Notificar asesores + roles
    const odp = pedido.getDataValue('odp') as any;
    if (odp) {
      emitirNotificacion(
        { userId: odp.asesor_id, roles: ['jefe_produccion', 'produccion', 'compras'] },
        {
          titulo: `Pedido PV ${pedido.getDataValue('numero_pedido')}`,
          mensaje: `Vidrios de ODP ${odp.numero_odp} llegaron — en proceso de verificación`,
          odp_id: odp.id,
          numero_odp: odp.numero_odp,
          tipo: 'PV_LLEGADA',
        }
      );
    }

    const pedidoActualizado = await PedidoPV.findByPk(req.params.id, { include: INCLUDE_COMPLETO });
    res.json(pedidoActualizado);
  } catch (error) {
    console.error('Error registrarLlegada:', error);
    res.status(500).json({ error: 'Error al registrar llegada' });
  }
};

// PATCH /api/pedidos-pv/:id/verificar — produccion/compras
export const verificarPedido = async (req: Request, res: Response) => {
  try {
    const user = req.user as { id: number };
    const pedido = await PedidoPV.findByPk(req.params.id, { include: INCLUDE_COMPLETO });
    if (!pedido) return res.status(404).json({ error: 'Pedido PV no encontrado' });

    await pedido.update({
      estado: 'VERIFICADO',
      verificado_por: user.id,
      fecha_verificacion: new Date(),
      observacion_verificacion: req.body.observacion_verificacion || null,
    });

    // Notificar asesores
    const odp = pedido.getDataValue('odp') as any;
    if (odp) {
      emitirNotificacion(
        { userId: odp.asesor_id, roles: ['jefe_produccion'] },
        {
          titulo: `Pedido PV ${pedido.getDataValue('numero_pedido')} verificado`,
          mensaje: `Vidrios de ODP ${odp.numero_odp} verificados correctamente`,
          odp_id: odp.id,
          numero_odp: odp.numero_odp,
          tipo: 'PV_VERIFICADO',
        }
      );

      // Intentar avanzar ODP automáticamente
      await verificarAvanceODP(odp.id, user.id);
    }

    const pedidoActualizado = await PedidoPV.findByPk(req.params.id, { include: INCLUDE_COMPLETO });
    res.json(pedidoActualizado);
  } catch (error) {
    console.error('Error verificarPedido:', error);
    res.status(500).json({ error: 'Error al verificar pedido' });
  }
};

// PATCH /api/pedidos-pv/:id/problema — produccion/compras
export const marcarProblema = async (req: Request, res: Response) => {
  try {
    const pedido = await PedidoPV.findByPk(req.params.id, { include: INCLUDE_COMPLETO });
    if (!pedido) return res.status(404).json({ error: 'Pedido PV no encontrado' });

    await pedido.update({
      estado: 'ENVIADO',          // regresa a ENVIADO para re-seguimiento
      tuvo_problema: true,         // queda marcado en rojo permanentemente
      observacion_verificacion: req.body.observacion || null,
      alerta_enviada: false,       // resetear para que vuelva a alertar si se demora
    });

    const odp = pedido.getDataValue('odp') as any;
    if (odp) {
      emitirNotificacion(
        { userId: odp.asesor_id, roles: ['jefe_produccion', 'compras', 'produccion', 'gerencia'] },
        {
          titulo: `⚠️ Problema — Pedido PV ${pedido.getDataValue('numero_pedido')}`,
          mensaje: `Vidrios de ODP ${odp.numero_odp} llegaron con problema. Se re-pedirá al proveedor.`,
          odp_id: odp.id,
          numero_odp: odp.numero_odp,
          tipo: 'PV_PROBLEMA',
        }
      );
    }

    const pedidoActualizado = await PedidoPV.findByPk(req.params.id, { include: INCLUDE_COMPLETO });
    res.json(pedidoActualizado);
  } catch (error) {
    console.error('Error marcarProblema:', error);
    res.status(500).json({ error: 'Error al marcar problema' });
  }
};

// PATCH /api/pedidos-pv/:id — edición general (solo puede_gestionar_pv)
export const updatePedidoPV = async (req: Request, res: Response) => {
  try {
    const user = req.user as { id: number };
    const usuario = await Usuario.findByPk(user.id, { attributes: ['puede_gestionar_pv'] });
    if (!usuario || !usuario.getDataValue('puede_gestionar_pv')) {
      return res.status(403).json({ error: 'No tienes permiso para editar pedidos PV' });
    }

    const pedido = await PedidoPV.findByPk(req.params.id);
    if (!pedido) return res.status(404).json({ error: 'Pedido PV no encontrado' });

    const campos = ['proveedor', 'fecha_envio', 'hora_envio', 'fecha_entrega_prometida',
      'metraje_venta', 'espesor_vidrio', 'factura_pv', 'observaciones'];
    const update: Record<string, unknown> = {};
    for (const campo of campos) {
      if (req.body[campo] !== undefined) update[campo] = req.body[campo];
    }

    await pedido.update(update);
    const pedidoActualizado = await PedidoPV.findByPk(req.params.id, { include: INCLUDE_COMPLETO });
    res.json(pedidoActualizado);
  } catch (error) {
    console.error('Error updatePedidoPV:', error);
    res.status(500).json({ error: 'Error al actualizar pedido PV' });
  }
};

// GET /api/pedidos-pv/siguiente-numero — para mostrar en el form antes de crear
export const getSiguienteNumero = async (_req: Request, res: Response) => {
  try {
    const ultimo = await PedidoPV.findOne({
      order: [['numero_base', 'DESC']],
      attributes: ['numero_base'],
    });
    const siguiente = ultimo ? (ultimo.getDataValue('numero_base') as number) + 1 : 6733;
    res.json({ siguiente });
  } catch (error) {
    console.error('Error getSiguienteNumero:', error);
    res.status(500).json({ error: 'Error al obtener siguiente número' });
  }
};

// GET /api/pedidos-pv/por-gestionar — ODPs con PedidoPV PENDIENTE sin ítems asignados (para Alejandro)
export const getPorGestionar = async (_req: Request, res: Response) => {
  try {
    const pedidos = await PedidoPV.findAll({
      where: { estado: 'PENDIENTE', origen: 'SISTEMA' },
      include: [
        {
          model: ODP,
          as: 'odp',
          attributes: ['id', 'numero_odp', 'estado_produccion', 'proveedor_vidrio'],
          include: [
            { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] },
            {
              model: ODPItem,
              as: 'items',
              attributes: ['id', 'item', 'color', 'espesor', 'cantidad', 'ancho_mm', 'alto_mm',
                'tipo_vidrio', 'pulidos', 'pulidos_h', 'perforaciones', 'boquetes',
                'descuentos', 'otros', 'mts_pt_a', 'mts_pt_h', 'accesorios', 'pedido_pv_id'],
            },
          ],
        },
        { model: Usuario, as: 'creador', attributes: ['id', 'nombre_completo'] },
      ],
      order: [['numero_base', 'DESC']],
    });
    res.json(pedidos);
  } catch (error) {
    console.error('Error getPorGestionar:', error);
    res.status(500).json({ error: 'Error al obtener pedidos por gestionar' });
  }
};

// PATCH /api/pedidos-pv/:id/asignar-items — Alejandro asigna ítems al PedidoPV
// Regla: máx 12 ítems por PedidoPV; si hay más se crean extensiones -1, -2, ...
export const asignarItems = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const pedidoId = parseInt(req.params.id);
    const { odp_item_ids }: { odp_item_ids: number[] } = req.body;

    if (!Array.isArray(odp_item_ids) || odp_item_ids.length === 0) {
      await t.rollback();
      return res.status(400).json({ error: 'Debe seleccionar al menos un ítem' });
    }

    const pedido = await PedidoPV.findByPk(pedidoId, { transaction: t });
    if (!pedido) {
      await t.rollback();
      return res.status(404).json({ error: 'Pedido PV no encontrado' });
    }

    const numero_base = pedido.getDataValue('numero_base') as number;
    const odp_id = pedido.getDataValue('odp_id') as number;
    const proveedor = pedido.getDataValue('proveedor') as string;
    const creado_por = pedido.getDataValue('creado_por') as number;

    // Desasignar todos los ítems previos de este pedido y sus extensiones
    const extensiones = await PedidoPV.findAll({
      where: { numero_base, odp_id },
      attributes: ['id'],
      transaction: t,
    });
    const todosIds = extensiones.map(e => e.getDataValue('id'));
    await ODPItem.update({ pedido_pv_id: null }, { where: { pedido_pv_id: todosIds }, transaction: t });

    // Dividir en bloques de 12
    const bloques: number[][] = [];
    for (let i = 0; i < odp_item_ids.length; i += 12) {
      bloques.push(odp_item_ids.slice(i, i + 12));
    }

    // Asignar bloque 0 → pedido principal (sin sufijo)
    await ODPItem.update(
      { pedido_pv_id: pedidoId },
      { where: { id: bloques[0] }, transaction: t }
    );

    // Eliminar extensiones previas (excepto el principal)
    await PedidoPV.destroy({
      where: { numero_base, odp_id, sufijo: { [Op.ne]: null } },
      transaction: t,
    });

    // Crear extensiones para bloques adicionales
    for (let i = 1; i < bloques.length; i++) {
      const sufijo = String(i);
      const numero_pedido = `${numero_base}-${sufijo}`;
      const extension = await PedidoPV.create({
        odp_id,
        proveedor,
        numero_pedido,
        numero_base,
        sufijo,
        estado: 'PENDIENTE',
        origen: 'SISTEMA',
        creado_por,
      }, { transaction: t });

      await ODPItem.update(
        { pedido_pv_id: extension.getDataValue('id') },
        { where: { id: bloques[i] }, transaction: t }
      );
    }

    await t.commit();

    // Retornar pedido actualizado con ítems
    const pedidoActualizado = await PedidoPV.findByPk(pedidoId, { include: INCLUDE_COMPLETO });
    res.json(pedidoActualizado);
  } catch (error) {
    await t.rollback();
    console.error('Error asignarItems:', error);
    res.status(500).json({ error: 'Error al asignar ítems al pedido PV' });
  }
};
