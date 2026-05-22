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
    const userId = req.user?.id;

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

    import('../server').then(({ emitirCambio }) => emitirCambio('toma_medidas')).catch(() => {});
    res.status(201).json(tmWithUser);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al crear TM', detail: error.message });
  }
};

// Asignar fecha de visita a una TM (pasa a estado 'programada')
export const programarTM = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { fecha_visita, hora_visita } = req.body;
    if (!fecha_visita) return res.status(400).json({ error: 'Se requiere fecha_visita' });

    const tm = await TomaMedidas.findByPk(id);
    if (!tm) return res.status(404).json({ error: 'TM no encontrada' });

    await tm.update({ fecha_visita, hora_visita: hora_visita || null, estado: 'programada' });
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

    // PROGRAMADAS: TMs en estado 'programada' ordenadas por fecha y hora (hora null al final del día)
    const programadas = await TomaMedidas.findAll({
      where: { estado: 'programada' },
      include: includeBase,
      order: [
        ['fecha_visita', 'ASC'],
        require('sequelize').literal('hora_visita ASC NULLS LAST'),
      ],
    });

    // REALIZADAS: TMs en estado 'realizada' o 'convertida'
    const realizadas = await TomaMedidas.findAll({
      where: { estado: { [require('sequelize').Op.in]: ['realizada', 'convertida'] } },
      include: includeBase,
      order: [['fecha_creacion', 'DESC']],
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
    const {
      observaciones, medidas_json, croquis_url,
      nombre_contacto, telefono_contacto, contacto_obra, telefono_obra,
      direccion, fecha_visita, hora_visita,
    } = req.body;
    const tm = await TomaMedidas.findByPk(id);
    if (!tm) return res.status(404).json({ error: 'TM no encontrada' });

    const estado = tm.getDataValue('estado');
    if (!['solicitada', 'programada'].includes(estado)) {
      return res.status(400).json({ error: 'Solo se pueden editar TMs en estado solicitada o programada' });
    }

    const campos: Record<string, any> = {
      observaciones, medidas_json, croquis_url,
      nombre_contacto, telefono_contacto, contacto_obra, telefono_obra, direccion,
    };
    if (fecha_visita !== undefined) campos.fecha_visita = fecha_visita || null;
    if (hora_visita !== undefined) campos.hora_visita = hora_visita || null;

    await tm.update(campos);
    res.json(tm);
  } catch {
    res.status(500).json({ error: 'Error al actualizar TM' });
  }
};

export const deleteTM = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tm = await TomaMedidas.findByPk(id);
    if (!tm) return res.status(404).json({ error: 'TM no encontrada' });

    const estado = tm.getDataValue('estado');
    if (!['solicitada', 'programada'].includes(estado)) {
      return res.status(400).json({ error: 'Solo se pueden eliminar TMs en estado solicitada o programada' });
    }

    await tm.destroy();
    res.json({ message: 'TM eliminada correctamente' });
  } catch {
    res.status(500).json({ error: 'Error al eliminar TM' });
  }
};

export const retornarTM = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tm = await TomaMedidas.findByPk(id);
    if (!tm) return res.status(404).json({ error: 'TM no encontrada' });
    if (tm.getDataValue('estado') !== 'programada') {
      return res.status(400).json({ error: 'Solo se puede retornar una TM en estado programada' });
    }
    await tm.update({ estado: 'solicitada', fecha_visita: null });
    res.json(tm);
  } catch {
    res.status(500).json({ error: 'Error al retornar TM a solicitada' });
  }
};

// TMs sin ODP asignada — para el selector de "Relacionar TM"
export const getTMsSinODP = async (_req: Request, res: Response) => {
  try {
    const tms = await TomaMedidas.findAll({
      where: { odp_id: null },
      include: [
        { model: Usuario, as: 'realizador', attributes: ['id', 'nombre_completo'] },
        {
          model: Prospecto, as: 'prospecto', required: false,
          attributes: ['id', 'numero_prospecto', 'nombre_contacto', 'descripcion'],
          include: [{ model: Cliente, as: 'cliente', attributes: ['nombre_razon_social'] }],
        },
      ],
      order: [['fecha_creacion', 'DESC']],
    });
    res.json(tms);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener TMs sin ODP', detail: error.message });
  }
};

// Vincular una TM (sin ODP) a una ODP existente
// Reglas de estado:
//   - TM realizada  → ODP sube a MEDICION (+ chk_medicion=true)
//   - TM no realizada → ODP sube a VISITA_TECNICA (si estaba EN_ESPERA)
export const vincularTMaODP = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { odp_id } = req.body;

    if (!odp_id) return res.status(400).json({ error: 'Se requiere odp_id' });

    const tm = await TomaMedidas.findByPk(id);
    if (!tm) return res.status(404).json({ error: 'TM no encontrada' });
    if (tm.getDataValue('odp_id')) {
      return res.status(400).json({ error: 'Esta TM ya está vinculada a una ODP' });
    }

    const odp = await ODP.findByPk(odp_id);
    if (!odp) return res.status(404).json({ error: 'ODP no encontrada' });

    await tm.update({ odp_id });

    const estadoTM = tm.getDataValue('estado');
    const estadoODP = odp.getDataValue('estado_produccion');

    if (estadoTM === 'realizada') {
      const updates: any = { chk_medicion: true };
      if (['EN_ESPERA', 'VISITA_TECNICA'].includes(estadoODP)) {
        updates.estado_produccion = 'MEDICION';
      }
      await odp.update(updates);
    } else {
      if (estadoODP === 'EN_ESPERA') {
        await odp.update({ estado_produccion: 'VISITA_TECNICA' });
      }
    }

    const tmActualizada = await TomaMedidas.findByPk(id, {
      include: [{ model: Usuario, as: 'realizador', attributes: ['id', 'nombre_completo'] }],
    });

    import('../server').then(({ emitirCambio }) => emitirCambio('toma_medidas')).catch(() => {});
    res.json(tmActualizada);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al vincular TM', detail: error.message });
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
