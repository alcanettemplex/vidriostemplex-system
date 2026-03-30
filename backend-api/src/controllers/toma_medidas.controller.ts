import { Request, Response } from 'express';
import { TomaMedidas, ODP, Usuario, Cliente, Prospecto } from '../models';

const generarNumeroTM = async (): Promise<string> => {
  const last = await TomaMedidas.findOne({
    where: { numero_tm: { [require('sequelize').Op.like]: 'TM-%' } },
    order: [['numero_tm', 'DESC']],
    attributes: ['numero_tm'],
  });
  let next = 1;
  if (last) {
    const parts = last.getDataValue('numero_tm').split('-');
    next = parseInt(parts[parts.length - 1]) + 1;
  }
  return `TM-${String(next).padStart(4, '0')}`;
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
    const {
      odp_id, prospecto_id,
      fecha_visita, direccion, nombre_contacto, telefono_contacto,
      contacto_obra, telefono_obra, observaciones, medidas_json,
    } = req.body;
    const userId = (req as any).user?.id;

    // Requiere al menos odp_id o prospecto_id
    if (!odp_id && !prospecto_id) {
      return res.status(400).json({ error: 'Se requiere odp_id o prospecto_id' });
    }

    if (odp_id) {
      const odp = await ODP.findByPk(odp_id);
      if (!odp) return res.status(404).json({ error: 'ODP no encontrada' });
    }

    if (prospecto_id) {
      const prospecto = await Prospecto.findByPk(prospecto_id);
      if (!prospecto) return res.status(404).json({ error: 'Prospecto no encontrado' });
    }

    const numero_tm = await generarNumeroTM();
    const estado = fecha_visita ? 'programada' : 'solicitada';

    const tm = await TomaMedidas.create({
      numero_tm,
      odp_id: odp_id || null,
      prospecto_id: prospecto_id || null,
      realizado_por: userId,
      estado,
      fecha_visita: fecha_visita || null,
      direccion,
      nombre_contacto,
      telefono_contacto,
      contacto_obra,
      telefono_obra,
      observaciones,
      medidas_json: medidas_json || [],
    });

    const tmWithUser = await TomaMedidas.findByPk(tm.getDataValue('id'), {
      include: [{ model: Usuario, as: 'realizador', attributes: ['id', 'nombre_completo'] }],
    });

    res.status(201).json(tmWithUser);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al crear TM', detail: error.message });
  }
};

// Asignar fecha de visita a una TM (pasa a estado 'programada')
export const programarTM = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { fecha_visita } = req.body;
    if (!fecha_visita) return res.status(400).json({ error: 'Se requiere fecha_visita' });

    const tm = await TomaMedidas.findByPk(id);
    if (!tm) return res.status(404).json({ error: 'TM no encontrada' });

    await tm.update({ fecha_visita, estado: 'programada' });
    res.json(tm);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al programar TM', detail: error.message });
  }
};

// Panel de TMs para el jefe de producción — 3 secciones
// Incluye TMs de ODPs (VISITA_TECNICA) y TMs de Prospectos (sin ODP)
export const getTMPanel = async (_req: Request, res: Response) => {
  try {
    const includeBase = [
      { model: Usuario, as: 'realizador', attributes: ['id', 'nombre_completo'] },
      {
        model: ODP, as: 'odp', required: false,
        attributes: ['id', 'numero_odp', 'fecha_entrega', 'fecha_creacion', 'direccion_instalacion',
          'tipo_servicio', 'descripcion_pedido', 'observaciones', 'nombre_recibe', 'telefono_recibe'],
        include: [
          { model: Cliente, as: 'cliente', attributes: ['nombre_razon_social'] },
          { model: Usuario, as: 'asesor', attributes: ['nombre_completo'] },
        ],
      },
      {
        model: Prospecto, as: 'prospecto', required: false,
        attributes: ['id', 'numero_prospecto', 'nombre_contacto', 'telefono_contacto',
          'email_contacto', 'direccion', 'descripcion', 'estado'],
        include: [
          { model: Usuario, as: 'asesor', attributes: ['nombre_completo'] },
          { model: Cliente, as: 'cliente', attributes: ['nombre_razon_social'] },
        ],
      },
    ];

    // SOLICITADAS: TMs en estado 'solicitada'
    const solicitadas = await TomaMedidas.findAll({
      where: { estado: 'solicitada' },
      include: includeBase,
      order: [['fecha_creacion', 'ASC']],
    });

    // También incluir ODPs en VISITA_TECNICA sin TM registrada
    const odpsSinTM = await ODP.findAll({
      where: { estado_produccion: 'VISITA_TECNICA' },
      include: [
        { model: Cliente, as: 'cliente', attributes: ['nombre_razon_social'] },
        { model: Usuario, as: 'asesor', attributes: ['nombre_completo'] },
        { model: TomaMedidas, as: 'tomas_medidas', required: false },
      ],
      order: [['fecha_entrega', 'ASC']],
    });
    const odpsSinTMFiltradas = odpsSinTM.filter((o: any) => !o.tomas_medidas?.length);

    // PROGRAMADAS: TMs en estado 'programada' (con fecha_visita pero sin croquis)
    const programadas = await TomaMedidas.findAll({
      where: { estado: 'programada' },
      include: includeBase,
      order: [['fecha_visita', 'ASC']],
    });

    // REALIZADAS: TMs en estado 'realizada' (últimas 50)
    const realizadas = await TomaMedidas.findAll({
      where: { estado: 'realizada' },
      include: includeBase,
      order: [['fecha_creacion', 'DESC']],
      limit: 50,
    });

    res.json({
      solicitadas,
      odpsSinTM: odpsSinTMFiltradas,
      programadas,
      realizadas,
    });
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

    // Acumular fotos en medidas_json (array de URLs) en lugar de sobreescribir
    const fotosActuales: string[] = tm.getDataValue('medidas_json') || [];
    const nuevasFotos = Array.isArray(fotosActuales) && fotosActuales.every(f => typeof f === 'string')
      ? [...fotosActuales, foto_url]
      : [foto_url];

    await tm.update({
      croquis_url: nuevasFotos[0], // primera foto como referencia principal
      medidas_json: nuevasFotos,
      estado: 'realizada',
    });

    // Si la TM tiene ODP vinculada: siempre activar chk_medicion;
    // avanzar a MEDICION solo si la ODP estaba en VISITA_TECNICA
    const odp_id = tm.getDataValue('odp_id');
    if (odp_id) {
      const odp = await ODP.findByPk(odp_id);
      if (odp) {
        const updates: any = { chk_medicion: true };
        if (odp.getDataValue('estado_produccion') === 'VISITA_TECNICA') {
          updates.estado_produccion = 'MEDICION';
        }
        await odp.update(updates);
      }
    }

    res.json({ croquis_url: foto_url });
  } catch (error: any) {
    res.status(500).json({ error: 'Error al subir foto', detail: error.message });
  }
};
