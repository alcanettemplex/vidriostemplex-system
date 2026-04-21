import { Request, Response } from 'express';
import { Prospecto, Cliente, Usuario, TomaMedidas, ODP, ODPItem, CotizacionCaptura } from '../models';
import sequelize from '../config/database';
import { withUniqueRetry } from '../utils/withUniqueRetry';

const generarNumeroProspecto = async (): Promise<string> => {
  const last = await Prospecto.findOne({
    where: { numero_prospecto: { [require('sequelize').Op.like]: 'PR-%' } },
    order: [['numero_prospecto', 'DESC']],
    attributes: ['numero_prospecto'],
  });
  let next = 1;
  if (last) {
    const parts = last.getDataValue('numero_prospecto').split('-');
    next = parseInt(parts[parts.length - 1]) + 1;
  }
  return `PR-${String(next).padStart(4, '0')}`;
};

// GET /prospectos/cliente/:cliente_id/en-gestion — prospectos activos de un cliente
export const getProspectosEnGestionPorCliente = async (req: Request, res: Response) => {
  try {
    const { cliente_id } = req.params;
    const prospectos = await Prospecto.findAll({
      where: { cliente_id, estado: 'en_gestion' },
      attributes: ['id', 'numero_prospecto', 'descripcion', 'estado', 'odp_id'],
      order: [['id', 'DESC']],
    });
    res.json(prospectos);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al consultar prospectos', detail: error.message });
  }
};

// GET /prospectos — listar todos (con filtro de estado opcional)
export const getProspectos = async (req: Request, res: Response) => {
  try {
    const { estado } = req.query;
    const where: any = {};
    if (estado) where.estado = estado;

    const prospectos = await Prospecto.findAll({
      where,
      include: [
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
        { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social', 'telefono'] },
        { model: TomaMedidas, as: 'tomas_medidas', attributes: ['id', 'numero_tm', 'estado', 'fecha_visita', 'croquis_url', 'medidas_json', 'direccion', 'nombre_contacto', 'telefono_contacto', 'observaciones'] },
        { model: ODP, as: 'odp', attributes: ['id', 'numero_odp', 'estado_produccion'] },
      ],
      order: [['fecha_creacion', 'DESC']],
    });
    res.json(prospectos);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener prospectos', detail: error.message });
  }
};

// GET /prospectos/:id
export const getProspecto = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const prospecto = await Prospecto.findByPk(id, {
      include: [
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
        { model: Cliente, as: 'cliente' },
        { model: TomaMedidas, as: 'tomas_medidas' },
        { model: ODP, as: 'odp', attributes: ['id', 'numero_odp', 'estado_produccion'] },
      ],
    });
    if (!prospecto) return res.status(404).json({ error: 'Prospecto no encontrado' });
    res.json(prospecto);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener prospecto', detail: error.message });
  }
};

// POST /prospectos — crear prospecto
export const createProspecto = async (req: Request, res: Response) => {
  try {
    const { cliente_id, nombre_contacto, telefono_contacto, email_contacto, direccion, descripcion } = req.body;
    const asesor_id = req.user?.id;

    const prospecto = await withUniqueRetry(async () => {
      const numero_prospecto = await generarNumeroProspecto();
      return Prospecto.create({
        numero_prospecto, asesor_id, cliente_id, nombre_contacto,
        telefono_contacto, email_contacto, direccion, descripcion,
        estado: 'en_gestion',
      });
    });

    const completo = await Prospecto.findByPk(prospecto.getDataValue('id'), {
      include: [
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
        { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] },
      ],
    });
    import('../server').then(({ emitirCambio }) => emitirCambio('crm')).catch(() => {});
    res.status(201).json(completo);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al crear prospecto', detail: error.message });
  }
};

// PUT /prospectos/:id — editar datos del prospecto
export const updateProspecto = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { cliente_id, nombre_contacto, telefono_contacto, email_contacto, direccion, descripcion, numero_cotizacion } = req.body;

    const prospecto = await Prospecto.findByPk(id);
    if (!prospecto) return res.status(404).json({ error: 'Prospecto no encontrado' });

    // ─── Verificación de ownership (creador, admin, gerencia o asistente_administrativo) ───
    const rolUser: string = req.user?.rol || '';
    if (!['admin', 'gerencia', 'asistente_administrativo'].includes(rolUser)) {
      if (Number(prospecto.getDataValue('asesor_id')) !== Number(req.user?.id)) {
        return res.status(403).json({ error: 'Solo el creador del prospecto puede editarlo' });
      }
    }

    const updates: any = { cliente_id, nombre_contacto, telefono_contacto, email_contacto, direccion, descripcion };
    if (numero_cotizacion !== undefined) updates.numero_cotizacion = numero_cotizacion;
    await prospecto.update(updates);
    res.json(prospecto);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al actualizar prospecto', detail: error.message });
  }
};

// PATCH /prospectos/:id/no-aprobar — marcar como no aprobado
export const noAprobarProspecto = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { motivo_no_aprobado } = req.body;

    const prospecto = await Prospecto.findByPk(id);
    if (!prospecto) return res.status(404).json({ error: 'Prospecto no encontrado' });
    if (prospecto.getDataValue('estado') === 'aprobado') {
      return res.status(400).json({ error: 'No se puede archivar un prospecto ya aprobado' });
    }

    // ─── Verificación de ownership (solo creador o admin) ───
    if (req.user?.rol !== 'admin') {
      if (Number(prospecto.getDataValue('asesor_id')) !== Number(req.user?.id)) {
        return res.status(403).json({ error: 'Solo el creador del prospecto puede archivarlo' });
      }
    }

    await prospecto.update({ estado: 'no_aprobado', motivo_no_aprobado, fecha_gestion: new Date() });
    res.json(prospecto);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al archivar prospecto', detail: error.message });
  }
};

// POST /prospectos/:id/aprobar — aprobar y generar ODP borrador
export const aprobarProspecto = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const {
      servicios_detalle, fecha_entrega, valor_total, forma_pago, observaciones,
      nombre_recibe, telefono_recibe, cargo_recibe, direccion_instalacion,
      matizado, pelicula, acarreo, instalacion, huacal, carton,
      proveedor_vidrio, numero_pedido_proveedor,
      // Para contacto nuevo: cliente_id existente o datos de nuevo cliente
      cliente_id: cliente_id_body, nuevo_cliente,
      // asesor_id opcional: si se pasa, asigna la ODP a ese asesor; si no, al usuario logueado
      asesor_id: asesor_id_body,
    } = req.body;
    const userId = req.user?.id;

    const prospecto = await Prospecto.findByPk(id, {
      include: [
        { model: TomaMedidas, as: 'tomas_medidas' },
        { model: Cliente, as: 'cliente' },
      ],
      transaction: t,
    });
    if (!prospecto) { await t.rollback(); return res.status(404).json({ error: 'Prospecto no encontrado' }); }
    if (prospecto.getDataValue('estado') !== 'en_gestion') {
      await t.rollback();
      return res.status(400).json({ error: 'Solo se pueden aprobar prospectos en gestión' });
    }

    // ─── Verificación de ownership (solo creador o admin) ───
    if (req.user?.rol !== 'admin') {
      if (Number(prospecto.getDataValue('asesor_id')) !== Number(req.user?.id)) {
        await t.rollback();
        return res.status(403).json({ error: 'Solo el creador del prospecto puede aprobarlo' });
      }
    }

    const tms: any[] = (prospecto as any).tomas_medidas || [];

    // ── Resolver cliente_id ────────────────────────────────────────────────────
    let cliente_id_final = prospecto.getDataValue('cliente_id');

    if (!cliente_id_final) {
      // Prospecto era contacto nuevo — debe venir cliente_id o nuevo_cliente
      if (cliente_id_body) {
        cliente_id_final = Number(cliente_id_body);
        // Vincular prospecto al cliente
        await prospecto.update({ cliente_id: cliente_id_final }, { transaction: t });
      } else if (nuevo_cliente) {
        const clienteCreado = await Cliente.create(nuevo_cliente, { transaction: t });
        cliente_id_final = clienteCreado.getDataValue('id');
        await prospecto.update({ cliente_id: cliente_id_final }, { transaction: t });
      } else {
        await t.rollback();
        return res.status(400).json({ error: 'Debes seleccionar o crear un cliente para aprobar el prospecto' });
      }
    }

    // Derivar tipo_servicio y descripcion_pedido de servicios_detalle
    const servicios = Array.isArray(servicios_detalle) && servicios_detalle.length > 0 ? servicios_detalle : [];
    const tipo_servicio = servicios[0]?.tipo_servicio || '';
    const descripcion_pedido = servicios.length > 0
      ? servicios.map((s: any) => `${s.cantidad}x ${s.tipo_servicio}: ${s.descripcion}`).join('\n')
      : prospecto.getDataValue('descripcion') || '';
    const cantidad_total = servicios.reduce((acc: number, s: any) => acc + (Number(s.cantidad) || 0), 0) || 1;

    // Generar número ODP consecutivo sin año
    const { ODP: ODPModel, sequelize: seq } = await import('../models');
    const { Op } = require('sequelize');
    const lastODP = await ODPModel.findOne({
      where: { numero_odp: { [Op.like]: 'ODP-%' } },
      order: [['numero_odp', 'DESC']],
      attributes: ['numero_odp'],
      transaction: t,
    });
    let nextODP = 1;
    if (lastODP) {
      const parts = lastODP.getDataValue('numero_odp').split('-');
      nextODP = parseInt(parts[parts.length - 1]) + 1;
    }
    const numero_odp = `ODP-${String(nextODP).padStart(4, '0')}`;

    // Datos de contacto de instalación: prioridad → body → TM → prospecto
    const tmPrincipal = tms[0];
    const nombre_recibe_final = nombre_recibe || tmPrincipal?.contacto_obra || prospecto.getDataValue('nombre_contacto') || '';
    const telefono_recibe_final = telefono_recibe || tmPrincipal?.telefono_obra || prospecto.getDataValue('telefono_contacto') || '';
    const direccion_final = direccion_instalacion || tmPrincipal?.direccion || prospecto.getDataValue('direccion') || '';

    const odp = await ODPModel.create({
      numero_odp,
      cliente_id: cliente_id_final,
      asesor_id: asesor_id_body || userId,
      estado_produccion: 'EN_ESPERA',
      tipo_servicio,
      descripcion_pedido,
      servicios_detalle: servicios.length > 0 ? servicios : null,
      cantidad_total,
      fecha_entrega: fecha_entrega || null,
      valor_total: valor_total || 0,
      forma_pago,
      observaciones,
      nombre_recibe: nombre_recibe_final,
      telefono_recibe: telefono_recibe_final,
      cargo_recibe: cargo_recibe || null,
      direccion_instalacion: direccion_final,
      matizado: matizado || false,
      pelicula: pelicula || false,
      acarreo: acarreo || false,
      instalacion: instalacion || false,
      huacal: huacal || false,
      carton: carton || false,
      proveedor_vidrio: proveedor_vidrio || null,
      numero_pedido_proveedor: numero_pedido_proveedor || null,
    }, { transaction: t });

    const odp_id = odp.getDataValue('id');

    // Vincular todas las TMs del prospecto a la ODP
    if (tms.length > 0) {
      const { Op: OpTM } = require('sequelize');
      await TomaMedidas.update(
        { odp_id, estado: 'convertida' },
        { where: { id: { [OpTM.in]: tms.map((tmItem: any) => tmItem.id) } }, transaction: t }
      );
    }

    // Marcar prospecto como aprobado y vincularlo a la ODP
    await prospecto.update({ estado: 'aprobado', odp_id, fecha_gestion: new Date() }, { transaction: t });

    // Migrar capturas de cotización del prospecto a la ODP (prospecto_id se mantiene para historial)
    await CotizacionCaptura.update(
      { odp_id },
      { where: { prospecto_id: Number(id) }, transaction: t }
    );

    await t.commit();

    // ── Crear PedidoPV automático si se seleccionó proveedor ──────────────
    if (proveedor_vidrio) {
      try {
        const { PedidoPV } = await import('../models');
        const ultimoPV = await PedidoPV.findOne({
          order: [['numero_base', 'DESC']],
          attributes: ['numero_base'],
        });
        const numero_base = ultimoPV ? (ultimoPV.getDataValue('numero_base') as number) + 1 : 6733;
        const numero_pedido = String(numero_base);

        await PedidoPV.create({
          odp_id: odp_id,
          proveedor: proveedor_vidrio,
          numero_pedido,
          numero_base,
          sufijo: null,
          estado: 'PENDIENTE',
          origen: 'SISTEMA',
          creado_por: userId,
        });

        // Guardar el número generado en la ODP
        await ODPModel.update(
          { numero_pedido_proveedor: numero_pedido },
          { where: { id: odp_id } }
        );
        console.warn(`PedidoPV ${numero_pedido} creado automáticamente para ODP ${odp_id} desde prospecto`);
      } catch (pvError: any) {
        console.error('Error creando PedidoPV automático desde prospecto:', pvError.message);
      }
    }

    const odpCompleta = await ODPModel.findByPk(odp_id, {
      include: [
        { model: Cliente, as: 'cliente' },
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
        { model: ODPItem, as: 'items' },
      ],
    });

    import('../server').then(({ emitirCambio }) => { emitirCambio('crm'); emitirCambio('odp'); }).catch(() => {});
    res.status(201).json({ odp: odpCompleta, prospecto_id: id });
  } catch (error: any) {
    await t.rollback();
    res.status(500).json({ error: 'Error al aprobar prospecto', detail: error.message });
  }
};
