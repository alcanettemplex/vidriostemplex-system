import { Request, Response } from 'express';
import { TomaMedidas, ODP, Usuario } from '../models';

const generarNumeroTM = async (): Promise<string> => {
  const count = await TomaMedidas.count();
  const year = new Date().getFullYear();
  return `TM-${year}-${String(count + 1).padStart(4, '0')}`;
};

export const getTMsByODP = async (req: Request, res: Response) => {
  try {
    const { odp_id } = req.params;
    const tms = await TomaMedidas.findAll({
      where: { odp_id },
      include: [{ model: Usuario, as: 'realizador', attributes: ['id', 'nombre_completo'] }],
      order: [['fecha_creacion', 'DESC']],
    });
    res.json(tms);
  } catch {
    res.status(500).json({ error: 'Error al obtener TMs' });
  }
};

export const createTM = async (req: Request, res: Response) => {
  try {
    const { odp_id, fecha_visita, direccion, contacto_obra, telefono_obra, observaciones, medidas_json } = req.body;
    const userId = (req as any).user?.id;

    const odp = await ODP.findByPk(odp_id);
    if (!odp) return res.status(404).json({ error: 'ODP no encontrada' });

    const numero_tm = await generarNumeroTM();

    const tm = await TomaMedidas.create({
      numero_tm, odp_id, realizado_por: userId,
      fecha_visita, direccion, contacto_obra, telefono_obra,
      observaciones, medidas_json: medidas_json || [],
    });

    // Actualizar ODP al estado MEDICION automáticamente
    await odp.update({ estado_produccion: 'MEDICION', chk_medicion: true });

    const tmWithUser = await TomaMedidas.findByPk(tm.getDataValue('id'), {
      include: [{ model: Usuario, as: 'realizador', attributes: ['id', 'nombre_completo'] }],
    });

    res.status(201).json(tmWithUser);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al crear TM', detail: error.message });
  }
};

export const updateTM = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { observaciones, medidas_json, croquis_url } = req.body;
    const tm = await TomaMedidas.findByPk(id);
    if (!tm) return res.status(404).json({ error: 'TM no encontrada' });
    await tm.update({ observaciones, medidas_json, croquis_url });
    res.json(tm);
  } catch {
    res.status(500).json({ error: 'Error al actualizar TM' });
  }
};
