import { Request, Response } from 'express';
import { z } from 'zod';
import OrdenCompra from '../models/orden_compra.model';
import { ODP, Usuario } from '../models';

const compraSchema = z.object({
  odp_id: z.number().int().positive().optional(),
  proveedor: z.string().min(1, 'El proveedor es requerido'),
  odc: z.string().min(1, 'El número de ODC es requerido'),
  descripcion: z.string().optional(),
  monto: z.number().nonnegative().optional().default(0),
  estado: z.enum(['pendiente', 'en_transito', 'recibido', 'problema']).default('pendiente'),
  fecha_entrega: z.string().optional(),
});

export const getCompras = async (_req: Request, res: Response) => {
  try {
    const compras = await OrdenCompra.findAll({
      include: [
        { model: ODP, as: 'odp', attributes: ['id', 'numero_odp'] },
        { model: Usuario, as: 'creador', attributes: ['id', 'nombre_completo'] },
      ],
      order: [['fecha_creacion', 'DESC']],
    });

    // Aplanar numero_odp para consumo directo del frontend
    const resultado = compras.map((c: any) => ({
      ...c.toJSON(),
      numero_odp: c.odp?.numero_odp || null,
    }));

    res.json(resultado);
  } catch (error) {
    console.error('Error al obtener compras:', error);
    res.status(500).json({ error: 'Error al obtener órdenes de compra' });
  }
};

export const getCompra = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const compra = await OrdenCompra.findByPk(id, {
      include: [
        { model: ODP, as: 'odp', attributes: ['id', 'numero_odp'] },
        { model: Usuario, as: 'creador', attributes: ['id', 'nombre_completo'] },
      ],
    });
    if (!compra) return res.status(404).json({ error: 'Orden de compra no encontrada' });
    res.json(compra);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener orden de compra' });
  }
};

export const createCompra = async (req: Request, res: Response) => {
  try {
    const data = compraSchema.parse(req.body);
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Usuario no autenticado' });

    // Validar que la ODP exista si se vincula
    if (data.odp_id) {
      const odp = await ODP.findByPk(data.odp_id);
      if (!odp) return res.status(404).json({ error: 'ODP no encontrada' });
    }

    const compra = await OrdenCompra.create({
      ...data,
      creado_por: userId,
    } as any);

    res.status(201).json(compra);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos', detalles: (error as any).errors });
    }
    console.error('Error al crear compra:', error);
    res.status(500).json({ error: error.message || 'Error al crear orden de compra' });
  }
};

export const updateCompra = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = compraSchema.partial().parse(req.body);

    const compra = await OrdenCompra.findByPk(id);
    if (!compra) return res.status(404).json({ error: 'Orden de compra no encontrada' });

    await compra.update(data as any);
    res.json(compra);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos', detalles: (error as any).errors });
    }
    res.status(500).json({ error: 'Error al actualizar orden de compra' });
  }
};

export const deleteCompra = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const compra = await OrdenCompra.findByPk(id);
    if (!compra) return res.status(404).json({ error: 'Orden de compra no encontrada' });

    await compra.destroy();
    res.json({ status: 'Orden de compra eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar orden de compra' });
  }
};
