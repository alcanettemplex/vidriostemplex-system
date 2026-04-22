import { Request, Response } from 'express';
import Cliente from '../models/cliente.model';
import { z } from 'zod';
import { UniqueConstraintError } from 'sequelize';

const CAMPO_LABELS: Record<string, string> = {
  numero_documento: 'número de documento',
  telefono: 'teléfono',
  celular: 'celular',
  email: 'correo electrónico',
};

const clienteSchema = z.object({
  nombre_razon_social: z.string().min(1, 'El nombre es requerido'),
  tipo_documento: z.string().optional(),
  numero_documento: z.string().min(1, 'La cédula o NIT es requerido'),
  direccion: z.string().optional(),
  telefono: z.string().optional(),
  celular: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  correo_comercial: z.string().email('Correo comercial inválido').optional().or(z.literal('')),
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

const handleUniqueError = (error: any): string | null => {
  if (!(error instanceof UniqueConstraintError)) return null;
  const campo = error.errors?.[0]?.path || '';
  const label = CAMPO_LABELS[campo] || campo;
  return `Ya existe un cliente con ese ${label}`;
};

export const createCliente = async (req: Request, res: Response) => {
  try {
    const data = clienteSchema.parse(req.body);
    const clienteData = {
      ...data,
      creado_por: req.user?.id,
    };
    const cliente = await Cliente.create(clienteData as any);
    res.status(201).json(cliente);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos', detalles: (error as any).errors });
    }
    const uniqueMsg = handleUniqueError(error);
    if (uniqueMsg) return res.status(409).json({ error: uniqueMsg });
    res.status(500).json({ error: error.message || 'Error al crear cliente' });
  }
};

export const updateCliente = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = clienteSchema.partial().parse(req.body);

    const cliente = await Cliente.findByPk(id);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

    // ─── Verificación de ownership (solo creador, admin o gerencia) ───
    if (!['admin', 'gerencia'].includes(req.user?.rol ?? '')) {
      if (Number(cliente.getDataValue('creado_por')) !== Number(req.user?.id)) {
        return res.status(403).json({ error: 'Solo el creador del cliente puede editarlo' });
      }
    }

    await cliente.update(data as any);
    res.json(cliente);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos', detalles: (error as any).errors });
    }
    const uniqueMsg = handleUniqueError(error);
    if (uniqueMsg) return res.status(409).json({ error: uniqueMsg });
    res.status(500).json({ error: 'Error al actualizar cliente' });
  }
};

export const deleteCliente = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const cliente = await Cliente.findByPk(id);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

    // ─── Verificación de ownership (solo creador, admin o gerencia) ───
    if (!['admin', 'gerencia'].includes(req.user?.rol ?? '')) {
      if (Number(cliente.getDataValue('creado_por')) !== Number(req.user?.id)) {
        return res.status(403).json({ error: 'Solo el creador del cliente puede eliminarlo' });
      }
    }

    await cliente.destroy();
    res.json({ status: 'Cliente eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar cliente' });
  }
};
