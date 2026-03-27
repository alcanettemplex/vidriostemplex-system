import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { TomaMedidas, ODP, Usuario, Cliente } from '../models';

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

    // La ODP queda en VISITA_TECNICA — avanza a MEDICION cuando se sube la foto

    const tmWithUser = await TomaMedidas.findByPk(tm.getDataValue('id'), {
      include: [{ model: Usuario, as: 'realizador', attributes: ['id', 'nombre_completo'] }],
    });

    res.status(201).json(tmWithUser);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al crear TM', detail: error.message });
  }
};

// Panel de TMs para el jefe de producción — 3 secciones
export const getTMPanel = async (_req: Request, res: Response) => {
  try {
    // SOLICITADAS: ODPs en VISITA_TECNICA sin TM registrada
    const odpsSolicitadas = await ODP.findAll({
      where: { estado_produccion: 'VISITA_TECNICA' },
      include: [
        { model: Cliente, as: 'cliente', attributes: ['nombre_razon_social'] },
        { model: Usuario, as: 'asesor', attributes: ['nombre_completo'] },
        { model: TomaMedidas, as: 'tomas_medidas', required: false },
      ],
      order: [['fecha_entrega', 'ASC']],
    });
    const solicitadas = odpsSolicitadas.filter((o: any) => !o.tomas_medidas?.length);

    // PROGRAMADAS: ODPs en VISITA_TECNICA con TM que tiene fecha_visita pero sin medidas cargadas
    const odpsProgramadas = await ODP.findAll({
      where: { estado_produccion: 'VISITA_TECNICA' },
      include: [
        { model: Cliente, as: 'cliente', attributes: ['nombre_razon_social'] },
        { model: Usuario, as: 'asesor', attributes: ['nombre_completo'] },
        {
          model: TomaMedidas, as: 'tomas_medidas', required: true,
          where: { fecha_visita: { [Op.ne]: null } },
        },
      ],
      order: [['fecha_entrega', 'ASC']],
    });
    const programadas = odpsProgramadas.filter((o: any) =>
      o.tomas_medidas?.some((tm: any) => !tm.croquis_url)
    );

    // REALIZADAS: ODPs en MEDICION con TM completa (con medidas)
    const odpsRealizadas = await ODP.findAll({
      where: { estado_produccion: 'MEDICION' },
      include: [
        { model: Cliente, as: 'cliente', attributes: ['nombre_razon_social'] },
        { model: Usuario, as: 'asesor', attributes: ['nombre_completo'] },
        {
          model: TomaMedidas, as: 'tomas_medidas', required: true,
          include: [{ model: Usuario, as: 'realizador', attributes: ['nombre_completo'] }],
        },
      ],
      order: [['fecha_creacion', 'DESC']],
      limit: 50,
    });
    const tmsRealizadas = odpsRealizadas.filter((o: any) =>
      o.tomas_medidas?.some((tm: any) => tm.croquis_url)
    );

    res.json({ solicitadas, programadas, realizadas: tmsRealizadas });
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener panel TM', detail: error.message });
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

export const uploadFotoTM = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tm = await TomaMedidas.findByPk(id);
    if (!tm) return res.status(404).json({ error: 'TM no encontrada' });

    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: 'No se recibió ninguna foto' });

    const foto_url = file.path || file.secure_url;
    await tm.update({ croquis_url: foto_url });

    // Avanzar la ODP a MEDICION si está en VISITA_TECNICA
    const odp = await ODP.findByPk(tm.getDataValue('odp_id'));
    if (odp && odp.getDataValue('estado_produccion') === 'VISITA_TECNICA') {
      await odp.update({ estado_produccion: 'MEDICION', chk_medicion: true });
    }

    res.json({ croquis_url: foto_url });
  } catch (error: any) {
    res.status(500).json({ error: 'Error al subir foto', detail: error.message });
  }
};
