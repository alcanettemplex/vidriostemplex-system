import { Request, Response } from 'express';
import { Prospecto, Cliente, Usuario, TomaMedidas, ODP, ODPItem, CotizacionCaptura, Lead, LeadEvento } from '../models';
import sequelize from '../config/database';
import { withUniqueRetry } from '../utils/withUniqueRetry';
import { generarNumeroODP } from '../utils/generarNumeroODP';

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
    const { estado, page: pageRaw, limit: limitRaw } = req.query;
    const page = Math.max(1, parseInt(pageRaw as string) || 1);
    const limit = Math.max(1, Math.min(500, parseInt(limitRaw as string) || 100));
    const offset = (page - 1) * limit;
    const where: any = {};
    if (estado) where.estado = estado;

    const { rows, count } = await Prospecto.findAndCountAll({
      where,
      include: [
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
        { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social', 'telefono', 'fuente'] },
        { model: TomaMedidas, as: 'tomas_medidas', attributes: ['id', 'numero_tm', 'estado', 'fecha_visita', 'croquis_url', 'medidas_json', 'direccion', 'nombre_contacto', 'telefono_contacto', 'observaciones'] },
        { model: ODP, as: 'odp', attributes: ['id', 'numero_odp', 'estado_produccion'] },
      ],
      order: [['fecha_creacion', 'DESC']],
      limit,
      offset,
    });

    res.json({ rows, count, page, totalPages: Math.ceil(count / limit) });
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

    // ─── Verificación de ownership (solo creador, admin o gerencia) ───
    if (!['admin', 'gerencia'].includes(req.user?.rol ?? '')) {
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
      // Fuente a registrar en un cliente existente que aún no la tenga
      cliente_fuente,
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

    // ─── Verificación de ownership (solo creador, admin o gerencia) ───
    if (!['admin', 'gerencia'].includes(req.user?.rol ?? '')) {
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

    // ── Registrar fuente en el cliente si aún no la tiene (clientes existentes/viejos) ──
    if (cliente_fuente && cliente_id_final) {
      const clienteActual = await Cliente.findByPk(cliente_id_final, { transaction: t });
      if (clienteActual && !clienteActual.getDataValue('fuente')) {
        await clienteActual.update({ fuente: cliente_fuente }, { transaction: t });
      }
    }

    // Derivar tipo_servicio y descripcion_pedido de servicios_detalle
    const servicios = Array.isArray(servicios_detalle) && servicios_detalle.length > 0 ? servicios_detalle : [];
    const tipo_servicio = servicios[0]?.tipo_servicio || '';
    const descripcion_pedido = servicios.length > 0
      ? servicios.map((s: any) => `${s.cantidad}x ${s.tipo_servicio}: ${s.descripcion}`).join('\n')
      : prospecto.getDataValue('descripcion') || '';
    const cantidad_total = servicios.reduce((acc: number, s: any) => acc + (Number(s.cantidad) || 0), 0) || 1;

    const { ODP: ODPModel } = await import('../models');

    // Datos de contacto de instalación: prioridad → body → TM → prospecto
    const tmPrincipal = tms[0];
    const nombre_recibe_final = nombre_recibe || tmPrincipal?.contacto_obra || prospecto.getDataValue('nombre_contacto') || '';
    const telefono_recibe_final = telefono_recibe || tmPrincipal?.telefono_obra || prospecto.getDataValue('telefono_contacto') || '';
    const direccion_final = direccion_instalacion || tmPrincipal?.direccion || prospecto.getDataValue('direccion') || '';

    // Derivar estado inicial según TMs del prospecto
    const tmRealizada = tms.some((tm: any) => tm.estado === 'realizada');
    const tmPendiente = tms.some((tm: any) => ['solicitada', 'programada'].includes(tm.estado));
    const estadoInicialProspecto = tmRealizada ? 'MEDICION' : tmPendiente ? 'VISITA_TECNICA' : 'EN_ESPERA';

    // Crear la ODP con número consecutivo. Savepoint + withUniqueRetry: ante colisión
    // del UNIQUE numero_odp se regenera dentro de la misma transacción `t` (rollback
    // solo al savepoint), sin abortar la aprobación completa del prospecto.
    let numero_odp = '';
    const odp = await withUniqueRetry(async () =>
      sequelize.transaction({ transaction: t }, async (sp) => {
        numero_odp = await generarNumeroODP('ODP', sp);
        return ODPModel.create({
          numero_odp,
          cliente_id: cliente_id_final,
          asesor_id: asesor_id_body || userId,
          estado_produccion: estadoInicialProspecto,
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
        }, { transaction: sp });
      }),
    );

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

    // ── Sincronizar el/los Lead(s) de origen (CRM) ────────────────────────────
    // Un prospecto puede haber nacido de un lead vía "solicitar visita técnica"
    // (lead.prospecto_id). Al aprobar el prospecto, el negocio se cierra: el lead
    // debe reflejar APROBADO y heredar la ODP/cliente para no quedar colgado en
    // VISITA_TECNICA (esto además corrige la tasa de conversión del CRM y evita el
    // falso positivo "aprobado sin ODP"). Va DENTRO de la transacción: la
    // aprobación del prospecto y la sincronización del lead son atómicas.
    // Prospectos creados directamente en /prospectos (sin lead) → findAll = [] → no-op.
    const leadsVinculados = await Lead.findAll({ where: { prospecto_id: Number(id) }, transaction: t });
    for (const lead of leadsVinculados) {
      await lead.update({
        estado_crm: 'APROBADO',
        odp_id,
        cliente_id: lead.getDataValue('cliente_id') || cliente_id_final,
        fecha_aprobado: lead.getDataValue('fecha_aprobado') || new Date(),
        fecha_cierre: lead.getDataValue('fecha_cierre') || new Date(),
        monto_real_venta: Number(valor_total) > 0 ? valor_total : lead.getDataValue('monto_proyectado_cotizacion'),
      }, { transaction: t });

      await LeadEvento.create({
        tipo: 'CONVERSION',
        detalle_texto: `Prospecto ${prospecto.getDataValue('numero_prospecto')} aprobado → ODP ${numero_odp} generada y vinculada automáticamente.`,
        lead_id: lead.getDataValue('id'),
        creado_por: userId,
      }, { transaction: t });
    }

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
        { model: ODPItem, as: 'items', separate: true, order: [['id', 'ASC']] },
      ],
    });

    import('../server').then(({ emitirCambio }) => { emitirCambio('crm'); emitirCambio('odp'); }).catch(() => {});
    res.status(201).json({ odp: odpCompleta, prospecto_id: id });
  } catch (error: any) {
    await t.rollback();
    res.status(500).json({ error: 'Error al aprobar prospecto', detail: error.message });
  }
};
