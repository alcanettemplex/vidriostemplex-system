import { Request, Response } from 'express';
import { z } from 'zod';
import { Op } from 'sequelize';
import { ODP, Cliente, Usuario, NoConformidad, FacturaAdicionalODP } from '../models';
import SalidaAlmacen from '../models/salida_almacen.model';

const salidaSchema = z.object({
  numero_sa: z.string().min(1, 'El número SA es requerido'),
  fecha_sa:  z.string().min(1, 'La fecha es requerida'),
});

const INCLUDE_ODP = [
  { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] },
];

// ─── GET: ODPs facturadas SIN salida de almacén ───────────────────────────────
export const getFacturadas = async (_req: Request, res: Response) => {
  try {
    // IDs de ODPs que ya tienen SA
    const conSalida = await SalidaAlmacen.findAll({ attributes: ['odp_id'], raw: true }) as any[];
    const idsConSalida = conSalida.map((s: any) => s.odp_id);

    const where: any = { estado_facturacion: 'FACTURADA' };
    if (idsConSalida.length) {
      where.id = { [Op.notIn]: idsConSalida };
    }

    const odps = await ODP.findAll({
      where,
      include: [
        ...INCLUDE_ODP,
        { model: FacturaAdicionalODP, as: 'facturas_adicionales', attributes: ['id', 'numero_fe', 'fecha_factura'], separate: true },
      ],
      attributes: ['id', 'numero_odp', 'fecha_factura', 'factura_electronica', 'valor_total', 'estado_caja'],
      order: [['fecha_factura', 'DESC']],
    });

    res.json(odps);
  } catch (e: any) {
    console.error('getFacturadas:', e.message);
    res.status(500).json({ error: 'Error al obtener ODPs facturadas' });
  }
};

// ─── GET: ODPs con salida de almacén registrada (excluye OA) ─────────────────
export const getConSalida = async (_req: Request, res: Response) => {
  try {
    const salidas = await SalidaAlmacen.findAll({
      include: [
        {
          model: ODP,
          as: 'odp',
          where: { tipo_odp: { [Op.ne]: 'OA' } },
          required: true,
          attributes: ['id', 'numero_odp', 'fecha_factura', 'factura_electronica', 'valor_total'],
          include: [
            ...INCLUDE_ODP,
            { model: FacturaAdicionalODP, as: 'facturas_adicionales', attributes: ['id', 'numero_fe', 'fecha_factura'], separate: true },
          ],
        },
        { model: Usuario, as: 'creador', attributes: ['id', 'nombre_completo'] },
      ],
      order: [['creado_en', 'DESC']],
    });
    res.json(salidas);
  } catch (e: any) {
    console.error('getConSalida:', e.message);
    res.status(500).json({ error: 'Error al obtener salidas de almacén' });
  }
};

// ─── GET: OAs sin salida de almacén registrada ────────────────────────────────
export const getOAPendientes = async (_req: Request, res: Response) => {
  try {
    const conSalida = await SalidaAlmacen.findAll({ attributes: ['odp_id'], raw: true }) as any[];
    const idsConSalida = conSalida.map((s: any) => s.odp_id);

    const where: any = { tipo_odp: 'OA' };
    if (idsConSalida.length) where.id = { [Op.notIn]: idsConSalida };

    const oas = await ODP.findAll({
      where,
      include: INCLUDE_ODP,
      attributes: ['id', 'numero_odp', 'estado_produccion', 'fecha_creacion'],
      order: [['id', 'DESC']],
    });

    res.json(oas);
  } catch (e: any) {
    console.error('getOAPendientes:', e.message);
    res.status(500).json({ error: 'Error al obtener OAs pendientes' });
  }
};

// ─── GET: OAs con salida de almacén (SFV) registrada ─────────────────────────
export const getConSalidaOA = async (_req: Request, res: Response) => {
  try {
    const salidas = await SalidaAlmacen.findAll({
      include: [
        {
          model: ODP,
          as: 'odp',
          where: { tipo_odp: 'OA' },
          required: true,
          attributes: ['id', 'numero_odp', 'estado_produccion', 'fecha_creacion'],
          include: INCLUDE_ODP,
        },
        { model: Usuario, as: 'creador', attributes: ['id', 'nombre_completo'] },
      ],
      order: [['creado_en', 'DESC']],
    });
    res.json(salidas);
  } catch (e: any) {
    console.error('getConSalidaOA:', e.message);
    res.status(500).json({ error: 'Error al obtener salidas SFV de OA' });
  }
};

// ─── GET: NC (es_no_conformidad=true) en estado INSTALADA/ENTREGADA SIN salida ─
export const getNcSinSalida = async (_req: Request, res: Response) => {
  try {
    const conSalida = await SalidaAlmacen.findAll({ attributes: ['odp_id'], raw: true }) as any[];
    const idsConSalida = conSalida.map((s: any) => s.odp_id);

    const where: any = {
      es_no_conformidad: true,
      estado_produccion: { [Op.in]: ['INSTALADA', 'ENTREGADA'] },
    };
    if (idsConSalida.length) {
      where.id = { [Op.notIn]: idsConSalida };
    }

    const odps = await ODP.findAll({
      where,
      include: [
        ...INCLUDE_ODP,
        { model: ODP, as: 'odp_padre', attributes: ['id', 'numero_odp'] },
        { model: NoConformidad, as: 'no_conformidad_origen', attributes: ['tipo_error'] },
      ],
      attributes: ['id', 'numero_odp', 'estado_produccion', 'fecha_creacion'],
      order: [['id', 'DESC']],
    });

    res.json(odps);
  } catch (e: any) {
    console.error('getNcSinSalida:', e.message);
    res.status(500).json({ error: 'Error al obtener NC sin salida' });
  }
};

// ─── POST: Crear salida de almacén ───────────────────────────────────────────
export const createSalida = async (req: Request, res: Response) => {
  try {
    const { odp_id } = req.params;
    const user = req.user!;
    const data = salidaSchema.parse(req.body);

    const existe = await SalidaAlmacen.findOne({ where: { odp_id: Number(odp_id) } });
    if (existe) return res.status(409).json({ error: 'Esta ODP ya tiene una salida de almacén registrada' });

    const salida = await SalidaAlmacen.create({
      odp_id: Number(odp_id),
      numero_sa: data.numero_sa,
      fecha_sa: data.fecha_sa,
      creado_por: user?.id || null,
    });

    import('../server').then(({ emitirCambio }) => emitirCambio('facturas_salidas')).catch(() => {});
    res.status(201).json(salida);
  } catch (e: any) {
    if (e.name === 'ZodError') return res.status(400).json({ error: e.errors[0].message });
    console.error('createSalida:', e.message);
    res.status(500).json({ error: 'Error al crear salida de almacén' });
  }
};

// ─── PUT: Editar salida de almacén ───────────────────────────────────────────
export const updateSalida = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = salidaSchema.parse(req.body);

    const salida = await SalidaAlmacen.findByPk(id);
    if (!salida) return res.status(404).json({ error: 'Salida de almacén no encontrada' });

    await salida.update({ numero_sa: data.numero_sa, fecha_sa: data.fecha_sa });
    res.json(salida);
  } catch (e: any) {
    if (e.name === 'ZodError') return res.status(400).json({ error: e.errors[0].message });
    console.error('updateSalida:', e.message);
    res.status(500).json({ error: 'Error al actualizar salida de almacén' });
  }
};

// ─── DELETE: Eliminar salida de almacén ──────────────────────────────────────
export const deleteSalida = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const salida = await SalidaAlmacen.findByPk(id);
    if (!salida) return res.status(404).json({ error: 'Salida de almacén no encontrada' });

    await salida.destroy();
    res.json({ ok: true });
  } catch (e: any) {
    console.error('deleteSalida:', e.message);
    res.status(500).json({ error: 'Error al eliminar salida de almacén' });
  }
};
