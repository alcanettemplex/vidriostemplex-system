import { Request, Response } from 'express';
import '../config/upload';
import { v2 as cloudinary } from 'cloudinary';
import DetalleSAPImagen from '../models/detalle_sap_imagen.model';
import { Usuario } from '../models';

// GET /api/detalle-sap-imagenes?odp_id=X
export const getImagenes = async (req: Request, res: Response) => {
  try {
    const { odp_id } = req.query;
    if (!odp_id) return res.status(400).json({ error: 'Se requiere odp_id' });

    const imagenes = await DetalleSAPImagen.findAll({
      where: { odp_id: Number(odp_id) },
      include: [{ model: Usuario, as: 'subidor', attributes: ['id', 'nombre_completo'] }],
      order: [['creado_en', 'ASC']],
    });

    res.json(imagenes);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener imágenes Det. SAP', detail: error.message });
  }
};

// POST /api/detalle-sap-imagenes  (multipart/form-data: imagen, odp_id)
export const createImagen = async (req: Request, res: Response) => {
  try {
    const file = req.file as any;
    if (!file) return res.status(400).json({ error: 'Se requiere una imagen' });

    const { odp_id } = req.body;
    if (!odp_id) return res.status(400).json({ error: 'Se requiere odp_id' });

    const userId = req.user?.id;

    const imagen = await DetalleSAPImagen.create({
      odp_id: Number(odp_id),
      url: file.path,
      public_id: file.filename,
      subido_por: userId,
    });

    const completa = await DetalleSAPImagen.findByPk(imagen.getDataValue('id'), {
      include: [{ model: Usuario, as: 'subidor', attributes: ['id', 'nombre_completo'] }],
    });

    res.status(201).json(completa);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al subir imagen Det. SAP', detail: error.message });
  }
};

// DELETE /api/detalle-sap-imagenes/:id
export const deleteImagen = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const imagen = await DetalleSAPImagen.findByPk(id);
    if (!imagen) return res.status(404).json({ error: 'Imagen no encontrada' });

    const esCreador = imagen.getDataValue('subido_por') === user.id;
    const esAdmin = ['admin', 'gerencia'].includes(user.rol);
    if (!esCreador && !esAdmin) {
      return res.status(403).json({ error: 'Solo el creador o admin puede eliminar esta imagen' });
    }

    const publicId = imagen.getDataValue('public_id');
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch {
      // No bloquear si Cloudinary falla
    }

    await imagen.destroy();
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Error al eliminar imagen Det. SAP', detail: error.message });
  }
};
