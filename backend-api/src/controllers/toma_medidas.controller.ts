import { Request, Response } from 'express';
import { Op, Transaction } from 'sequelize';
import { sequelize, TomaMedidas, ODP, Usuario, Cliente, Prospecto } from '../models';
import { aplicarCambioODPPorTM } from '../utils/tomaMedidas';

const generarNumeroTM = async (transaction?: Transaction): Promise<string> => {
  const last = await TomaMedidas.findOne({
    where: { numero_tm: { [Op.like]: 'TM-%' } },
    order: [['numero_tm', 'DESC']],
    attributes: ['numero_tm'],
    transaction,
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

// Crear una TM (desde un prospecto o desde la ficha de una ODP).
// Desde una ODP (2026-10-28): la TM y el cambio de estado van en la MISMA
// transacción. Antes el frontend hacía un `PUT /api/odp` aparte que forzaba
// VISITA_TECNICA en cualquier estado (devolvía una ODP ya cortada o programada)
// y, si fallaba, dejaba la TM creada con un "Error al solicitar" que invitaba a
// repetirla. Ahora solo EN_ESPERA → VISITA_TECNICA (misma regla que relacionar
// una TM existente); en otro estado la ODP no se mueve.
export const createTM = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const {
      odp_id, prospecto_id,
      fecha_visita, direccion, nombre_contacto, telefono_contacto,
      contacto_obra, telefono_obra, observaciones, medidas_json,
    } = req.body;
    const userId = req.user!.id;

    // Requiere al menos odp_id o prospecto_id
    if (!odp_id && !prospecto_id) {
      await t.rollback();
      return res.status(400).json({ error: 'Se requiere odp_id o prospecto_id' });
    }

    let odp: any = null;
    if (odp_id) {
      odp = await ODP.findByPk(odp_id, { transaction: t });
      if (!odp) { await t.rollback(); return res.status(404).json({ error: 'ODP no encontrada' }); }
      if (odp.getDataValue('estado_produccion') === 'ANULADA') {
        await t.rollback();
        return res.status(409).json({ error: `La ${odp.getDataValue('numero_odp')} está anulada: no se le puede solicitar toma de medidas.` });
      }
    }

    if (prospecto_id) {
      const prospecto = await Prospecto.findByPk(prospecto_id, { transaction: t });
      if (!prospecto) { await t.rollback(); return res.status(404).json({ error: 'Prospecto no encontrado' }); }
    }

    const numero_tm = await generarNumeroTM(t);
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
    }, { transaction: t });

    let estadoODP: string | null = null;
    if (odp) {
      if (odp.getDataValue('estado_produccion') === 'EN_ESPERA') {
        await aplicarCambioODPPorTM(odp, { estado_produccion: 'VISITA_TECNICA' }, {
          usuarioId: userId,
          observacion: `Toma de medidas ${numero_tm} solicitada.`,
          transaction: t,
        });
      }
      estadoODP = odp.getDataValue('estado_produccion');
    }
    await t.commit();

    const tmWithUser = await TomaMedidas.findByPk(tm.getDataValue('id'), {
      include: [{ model: Usuario, as: 'realizador', attributes: ['id', 'nombre_completo'] }],
    });

    import('../server').then(({ emitirCambio }) => emitirCambio('toma_medidas')).catch(() => {});
    // `estado_odp` le dice a la ficha en qué quedó la ODP (null si la TM es de un prospecto).
    res.status(201).json({ ...(tmWithUser?.toJSON() ?? {}), estado_odp: estadoODP });
  } catch (error: any) {
    await t.rollback().catch(() => {});
    console.error('Error al crear TM:', error?.message);
    res.status(500).json({ error: 'No se pudo crear la toma de medidas. No se guardó nada; inténtalo de nuevo.' });
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

    import('../server').then(({ emitirCambio }) => emitirCambio('toma_medidas')).catch(() => {});
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

// Retornar una TM al panel "Solicitadas".
//   - 'programada'               → siempre permitido (se descarta la fecha/hora de visita).
//   - 'realizada' | 'convertida' → solo si la visita NO se realizó de verdad, es decir, sin
//     croquis ni fotos. Cubre las TMs que quedaron marcadas como realizadas sin haberse
//     visitado; con fotos se rechaza, porque retornarla obligaría a decidir qué hacer con
//     esas fotos (mismo criterio que el script fix_tm_0178_2026-07-27).
// No toca la ODP vinculada: `odp_id` se conserva para que al subir la foto `uploadFotoTM`
// avance la ODP a MEDICION y marque chk_medicion.
const ESTADOS_RETORNABLES = ['programada', 'realizada', 'convertida'];

export const retornarTM = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tm = await TomaMedidas.findByPk(id);
    if (!tm) return res.status(404).json({ error: 'TM no encontrada' });

    const estado = tm.getDataValue('estado');
    if (!ESTADOS_RETORNABLES.includes(estado)) {
      return res.status(400).json({
        error: `No se puede retornar una toma de medidas en estado "${estado}". Solo aplica a visitas programadas o marcadas como realizadas sin registrar.`,
      });
    }

    if (estado !== 'programada') {
      const fotos = tm.getDataValue('medidas_json');
      const numFotos = Array.isArray(fotos) ? fotos.length : 0;
      if (tm.getDataValue('croquis_url') || numFotos > 0) {
        return res.status(409).json({
          error: `Esta toma de medidas ya tiene ${numFotos || 1} archivo(s) registrado(s), así que la visita sí se realizó. Para devolverla a Solicitadas primero hay que decidir qué hacer con esas fotos.`,
        });
      }
    }

    await tm.update({ estado: 'solicitada', fecha_visita: null, hora_visita: null });

    import('../server').then(({ emitirCambio }) => emitirCambio('toma_medidas')).catch(() => {});
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
      // Solo lo que muestra el modal (2026-10-28): con todas las columnas (fotos en
      // `medidas_json`, croquis…) la lista pesaba ~148 KB por apertura.
      attributes: ['id', 'numero_tm', 'estado', 'direccion', 'fecha_creacion', 'prospecto_id'],
      include: [
        { model: Usuario, as: 'realizador', attributes: ['id', 'nombre_completo'] },
        {
          model: Prospecto, as: 'prospecto', required: false,
          // `estado` y el `id` del cliente (2026-10-28): la ficha agrupa las del cliente
          // de la ODP y avisa si el prospecto sigue en gestión.
          attributes: ['id', 'numero_prospecto', 'nombre_contacto', 'descripcion', 'estado', 'cliente_id'],
          include: [{ model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] }],
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
//   - ODP anulada → se rechaza (2026-10-28).
// En una transacción, con historial y patch de socket (`aplicarCambioODPPorTM`).
export const vincularTMaODP = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { odp_id } = req.body;

    if (!odp_id) { await t.rollback(); return res.status(400).json({ error: 'Se requiere odp_id' }); }

    // FOR UPDATE: dos personas relacionando la misma TM a la vez no la ponen en dos ODP.
    const tm = await TomaMedidas.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!tm) { await t.rollback(); return res.status(404).json({ error: 'TM no encontrada' }); }
    if (tm.getDataValue('odp_id')) {
      await t.rollback();
      return res.status(409).json({ error: `${tm.getDataValue('numero_tm')} ya está vinculada a otra ODP. Cierra y vuelve a abrir la lista.` });
    }

    const odp = await ODP.findByPk(odp_id, { transaction: t });
    if (!odp) { await t.rollback(); return res.status(404).json({ error: 'ODP no encontrada' }); }
    if (odp.getDataValue('estado_produccion') === 'ANULADA') {
      await t.rollback();
      return res.status(409).json({ error: `La ${odp.getDataValue('numero_odp')} está anulada: no se le puede vincular una toma de medidas.` });
    }

    await tm.update({ odp_id }, { transaction: t });

    const numeroTM = tm.getDataValue('numero_tm');
    const estadoTM = tm.getDataValue('estado');
    const estadoODP = odp.getDataValue('estado_produccion');

    if (estadoTM === 'realizada') {
      await aplicarCambioODPPorTM(odp, {
        chk_medicion: true,
        ...(['EN_ESPERA', 'VISITA_TECNICA'].includes(estadoODP) ? { estado_produccion: 'MEDICION' } : {}),
      }, { usuarioId: req.user!.id, observacion: `Toma de medidas ${numeroTM} (realizada) relacionada.`, transaction: t });
    } else if (estadoODP === 'EN_ESPERA') {
      await aplicarCambioODPPorTM(odp, { estado_produccion: 'VISITA_TECNICA' }, {
        usuarioId: req.user!.id, observacion: `Toma de medidas ${numeroTM} relacionada.`, transaction: t,
      });
    }
    await t.commit();

    const tmActualizada = await TomaMedidas.findByPk(id, {
      include: [{ model: Usuario, as: 'realizador', attributes: ['id', 'nombre_completo'] }],
    });

    import('../server').then(({ emitirCambio }) => emitirCambio('toma_medidas')).catch(() => {});
    res.json(tmActualizada);
  } catch (error: any) {
    await t.rollback().catch(() => {});
    console.error('Error al vincular TM:', error?.message);
    res.status(500).json({ error: 'No se pudo vincular la toma de medidas. No se modificó nada; inténtalo de nuevo.' });
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
    // avanzar a MEDICION solo si la ODP estaba en VISITA_TECNICA.
    // Con historial y patch de socket desde el 2026-10-28.
    const odp_id = tm.getDataValue('odp_id');
    if (odp_id) {
      const odp = await ODP.findByPk(odp_id);
      if (odp) {
        await aplicarCambioODPPorTM(odp, {
          chk_medicion: true,
          ...(odp.getDataValue('estado_produccion') === 'VISITA_TECNICA' ? { estado_produccion: 'MEDICION' } : {}),
        }, { usuarioId: req.user!.id, observacion: `Foto de la toma de medidas ${tm.getDataValue('numero_tm')} registrada.` });
      }
    }

    res.json({ croquis_url: foto_url });
  } catch (error: any) {
    res.status(500).json({ error: 'Error al subir foto', detail: error.message });
  }
};
