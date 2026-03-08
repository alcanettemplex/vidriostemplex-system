import { Request, Response } from 'express';
import Cliente from '../models/cliente.model';
import { z } from 'zod';

const clienteSchema = z.object({
  nombre_razon_social: z.string().min(1, 'El nombre es requerido'),
  tipo_documento: z.string().optional(),
  numero_documento: z.string().min(1, 'La cédula o NIT es requerido'),
  direccion: z.string().optional(),
  telefono: z.string().optional(),
  celular: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  segmento: z.string().optional()
});

export const getClientes = async (req: Request, res: Response) => {
  try {
    const clientes = await Cliente.findAll();
    res.json(clientes);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
};

export const getCliente = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const cliente = await Cliente.findByPk(id);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(cliente);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener cliente' });
  }
};

export const createCliente = async (req: Request, res: Response) => {
  try {
    const data = clienteSchema.parse(req.body);
    const cliente = await Cliente.create(data as any);
    res.status(201).json(cliente);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos', detalles: (error as any).errors });
    }
    res.status(500).json({ error: error.message || 'Error al crear cliente' });
  }
};

export const updateCliente = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = clienteSchema.partial().parse(req.body);

    const cliente = await Cliente.findByPk(id);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

    await cliente.update(data as any);
    res.json(cliente);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos', detalles: (error as any).errors });
    }
    res.status(500).json({ error: 'Error al actualizar cliente' });
  }
};

export const deleteCliente = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const cliente = await Cliente.findByPk(id);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

    await cliente.destroy();
    res.json({ status: 'Cliente eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar cliente' });
  }
};
