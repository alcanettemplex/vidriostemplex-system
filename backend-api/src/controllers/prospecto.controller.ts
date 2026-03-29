import { Request, Response } from 'express';
import { Prospecto, Cliente, Usuario, TomaMedidas, ODP, ODPItem } from '../models';
import sequelize from '../config/database';

const generarNumeroProspecto = async (): Promise<string> => {
  const count = await Prospecto.count();
  const year = new Date().getFullYear();
  return `PRO-${year}-${String(count + 1).padStart(4, '0')}`;
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
        { model: TomaMedidas, as: 'tomas_medidas', attributes: ['id', 'numero_tm', 'estado', 'fecha_visita', 'croquis_url'] },
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
    const asesor_id = (req as any).user?.id;

    const numero_prospecto = await generarNumeroProspecto();

    const prospecto = await Prospecto.create({
      numero_prospecto, asesor_id, cliente_id, nombre_contacto,
      telefono_contacto, email_contacto, direccion, descripcion,
      estado: 'en_gestion',
    });

    const completo = await Prospecto.findByPk(prospecto.getDataValue('id'), {
      include: [
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
        { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] },
      ],
    });
    res.status(201).json(completo);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al crear prospecto', detail: error.message });
  }
};

// PUT /prospectos/:id — editar datos del prospecto
export const updateProspecto = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { cliente_id, nombre_contacto, telefono_contacto, email_contacto, direccion, descripcion } = req.body;

    const prospecto = await Prospecto.findByPk(id);
    if (!prospecto) return res.status(404).json({ error: 'Prospecto no encontrado' });

    await prospecto.update({ cliente_id, nombre_contacto, telefono_contacto, email_contacto, direccion, descripcion });
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
    const { tipo_servicio, descripcion_pedido, fecha_entrega, valor_total, forma_pago, observaciones } = req.body;
    const userId = (req as any).user?.id;

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

    const tm = (prospecto as any).tomas_medidas?.[0];

    // Contar ODPs para generar número
    const { ODP: ODPModel } = await import('../models');
    const count = await ODPModel.count({ transaction: t });
    const year = new Date().getFullYear();
    const numero_odp = `ODP-${year}-${String(count + 1).padStart(4, '0')}`;

    // Datos de contacto desde TM si existen, sino del prospecto
    const nombre_recibe = tm?.contacto_obra || prospecto.getDataValue('nombre_contacto') || '';
    const telefono_recibe = tm?.telefono_obra || prospecto.getDataValue('telefono_contacto') || '';
    const direccion_instalacion = tm?.direccion || prospecto.getDataValue('direccion') || '';

    const odp = await ODPModel.create({
      numero_odp,
      cliente_id: prospecto.getDataValue('cliente_id'),
      asesor_id: userId,
      estado_produccion: 'EN_ESPERA',
      tipo_servicio,
      descripcion_pedido: descripcion_pedido || prospecto.getDataValue('descripcion'),
      fecha_entrega,
      valor_total: valor_total || 0,
      forma_pago,
      observaciones,
      nombre_recibe,
      telefono_recibe,
      direccion_instalacion,
    }, { transaction: t });

    const odp_id = odp.getDataValue('id');

    // Vincular TM a la ODP si existe
    if (tm) {
      await TomaMedidas.update(
        { odp_id, estado: 'convertida' },
        { where: { id: tm.id }, transaction: t }
      );
    }

    // Marcar prospecto como aprobado y vincularlo a la ODP
    await prospecto.update({ estado: 'aprobado', odp_id, fecha_gestion: new Date() }, { transaction: t });

    await t.commit();

    const odpCompleta = await ODPModel.findByPk(odp_id, {
      include: [
        { model: Cliente, as: 'cliente' },
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
        { model: ODPItem, as: 'items' },
      ],
    });

    res.status(201).json({ odp: odpCompleta, prospecto_id: id });
  } catch (error: any) {
    await t.rollback();
    res.status(500).json({ error: 'Error al aprobar prospecto', detail: error.message });
  }
};
