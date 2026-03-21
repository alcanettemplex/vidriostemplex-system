import { Request, Response } from 'express';
import EvidenciaInstalacion from '../models/evidencia_instalacion.model';

export const getEvidencias = async (_req: Request, res: Response) => {
  const evidencias = await EvidenciaInstalacion.findAll();
  res.json(evidencias);
};

export const getEvidencia = async (req: Request, res: Response) => {
  const { id } = req.params;
  const evidencia = await EvidenciaInstalacion.findByPk(id);
  if (!evidencia) return res.status(404).json({ error: 'Evidencia no encontrada' });
  res.json(evidencia);
};

export const createEvidencia = async (req: any, res: Response) => {
  try {
    const { odp_id, tipo_evidencia, gps, datos_firmante } = req.body;
    let instalador_id = 1;

    try {
      if (req.user && typeof req.user !== 'string') {
        instalador_id = req.user.id || 1;
      }
    } catch (e) { }

    const fotoUrl = req.file ? req.file.path : null;

    if (!fotoUrl) {
      return res.status(400).json({ error: 'Se requiere archivo fotográfico (foto)' });
    }

    const evidencia = await EvidenciaInstalacion.create({
      odp_id,
      instalador_id,
      tipo_evidencia,
      archivo_url: fotoUrl,
      gps,
      datos_firmante
    });

    // Actualizar estado de la ODP a ENTREGADA
    const ODP = require('../models').ODP;
    const odp = await ODP.findByPk(odp_id);
    if (odp) {
      await odp.update({ estado_produccion: 'ENTREGADA' });

      // ─── ODP padre → INSTALADA si esta es ODP de reproceso ───
      if (odp.getDataValue('es_no_conformidad') && odp.getDataValue('odp_padre_id')) {
        try {
          const { HistorialEstadoODP } = require('../models');
          const odpPadre = await ODP.findByPk(odp.getDataValue('odp_padre_id'));
          if (odpPadre && odpPadre.getDataValue('estado_produccion') === 'PAUSADA') {
            await odpPadre.update({ estado_produccion: 'INSTALADA' });
            await HistorialEstadoODP.create({
              odp_id: odpPadre.getDataValue('id'),
              estado_anterior: 'PAUSADA',
              estado_nuevo: 'INSTALADA',
              usuario_id: instalador_id,
              fecha: new Date(),
              observacion: `Completada automáticamente: la ODP de reproceso ${odp.getDataValue('numero_odp')} resolvió la no conformidad.`
            });
            console.log(`✅ ODP padre ${odpPadre.getDataValue('numero_odp')} → INSTALADA (desde evidencia)`);
          }
        } catch (autoErr) {
          console.error('⚠️ Error al completar ODP padre desde evidencia:', autoErr);
        }
      }

      // Broadcast
      import('../server').then(({ io }) => {
        io.emit('notification', {
          type: 'ESTADO_ACTUALIZADO',
          message: `La orden ${odp.getDataValue('numero_odp')} ha sido entregada exitosamente (con evidencia fotográfica).`,
          notificacionPara: ['admin', 'gerencia', 'asesor_comercial', 'contabilidad', 'produccion'],
          timestamp: new Date()
        });
      }).catch(err => console.error('Error emitiendo socket', err));
    }

    res.status(201).json(evidencia);
  } catch (err: any) {
    console.error('Error interno al crear evidencia:', err);
    res.status(500).json({ error: 'Error interno en evidencia', message: err.message });
  }
};

export const updateEvidencia = async (req: Request, res: Response) => {
  const { id } = req.params;
  const evidencia = await EvidenciaInstalacion.findByPk(id);
  if (!evidencia) return res.status(404).json({ error: 'Evidencia no encontrada' });
  await evidencia.update(req.body);
  res.json(evidencia);
};

export const deleteEvidencia = async (req: Request, res: Response) => {
  const { id } = req.params;
  const evidencia = await EvidenciaInstalacion.findByPk(id);
  if (!evidencia) return res.status(404).json({ error: 'Evidencia no encontrada' });
  await evidencia.destroy();
  res.json({ status: 'Evidencia eliminada' });
};
