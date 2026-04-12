import { Request, Response } from 'express';
import '../config/upload'; // garantiza que cloudinary está configurado antes de usarlo
import { v2 as cloudinary } from 'cloudinary';
import CotizacionCaptura from '../models/cotizacion_captura.model';
import { Usuario } from '../models';

// GET /api/cotizacion-capturas?odp_id=X  o  ?prospecto_id=X
export const getCapturas = async (req: Request, res: Response) => {
  try {
    const { odp_id, prospecto_id } = req.query;
    if (!odp_id && !prospecto_id) {
      return res.status(400).json({ error: 'Se requiere odp_id o prospecto_id' });
    }

    const where: any = {};
    if (odp_id) where.odp_id = Number(odp_id);
    else if (prospecto_id) where.prospecto_id = Number(prospecto_id);

    const capturas = await CotizacionCaptura.findAll({
      where,
      include: [{ model: Usuario, as: 'subidor', attributes: ['id', 'nombre_completo'] }],
      order: [['created_at', 'ASC']],
    });

    res.json(capturas);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener capturas', detail: error.message });
  }
};

// POST /api/cotizacion-capturas  (multipart/form-data: imagen, nota, odp_id?, prospecto_id?)
export const createCaptura = async (req: Request, res: Response) => {
  try {
    const file = req.file as any;
    if (!file) return res.status(400).json({ error: 'Se requiere una imagen' });

    const { odp_id, prospecto_id, nota } = req.body;
    if (!odp_id && !prospecto_id) {
      return res.status(400).json({ error: 'Se requiere odp_id o prospecto_id' });
    }

    const userId = req.user?.id;

    const captura = await CotizacionCaptura.create({
      odp_id: odp_id ? Number(odp_id) : null,
      prospecto_id: prospecto_id ? Number(prospecto_id) : null,
      url: file.path,
      public_id: file.filename,
      nota: nota || null,
      subido_por: userId,
    });

    const completa = await CotizacionCaptura.findByPk(captura.getDataValue('id'), {
      include: [{ model: Usuario, as: 'subidor', attributes: ['id', 'nombre_completo'] }],
    });

    res.status(201).json(completa);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al subir captura', detail: error.message });
  }
};

// PATCH /api/cotizacion-capturas/:id  (editar nota)
export const updateNota = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { nota } = req.body;
    const user = req.user!;

    const captura = await CotizacionCaptura.findByPk(id);
    if (!captura) return res.status(404).json({ error: 'Captura no encontrada' });

    const esCreador = captura.getDataValue('subido_por') === user.id;
    const esAdmin = user.rol === 'admin';
    if (!esCreador && !esAdmin) {
      return res.status(403).json({ error: 'Solo el creador o admin puede editar la nota' });
    }

    await captura.update({ nota: nota ?? null });
    res.json(captura);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al actualizar nota', detail: error.message });
  }
};

// DELETE /api/cotizacion-capturas/:id
export const deleteCaptura = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const captura = await CotizacionCaptura.findByPk(id);
    if (!captura) return res.status(404).json({ error: 'Captura no encontrada' });

    const esCreador = captura.getDataValue('subido_por') === user.id;
    const esAdmin = user.rol === 'admin';
    if (!esCreador && !esAdmin) {
      return res.status(403).json({ error: 'Solo el creador o admin puede eliminar esta captura' });
    }

    const publicId = captura.getDataValue('public_id');
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch {
      // No bloquear si Cloudinary falla
    }

    await captura.destroy();
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Error al eliminar captura', detail: error.message });
  }
};
