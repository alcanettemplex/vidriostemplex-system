/**
 * fix_tm_0178_2026-07-27.ts
 *
 * Retorna TM-0178 del panel "Realizadas" al panel "Solicitadas".
 *
 * CONTEXTO
 * La TM-0178 quedó en estado 'convertida' sin haberse realizado nunca la visita:
 * no tiene fotos (medidas_json = [], croquis_url = NULL) y su ODP-24201 sigue en
 * VISITA_TECNICA con chk_medicion = false. El estado 'convertida' se lo asignó el
 * flujo de aprobación del prospecto (prospecto.controller.ts, "Vincular todas las
 * TMs del prospecto a la ODP"), que marca TODAS las TMs del prospecto sin verificar
 * si la visita se realizó — ver TECH_DEBT.md 2026-07-27.
 *
 * QUÉ HACE
 *   toma_medidas(id=199): estado → 'solicitada', fecha_visita → NULL, hora_visita → NULL
 *
 * QUÉ NO TOCA
 *   - odp_id (427): se conserva para que al subir la foto, uploadFotoTM avance la
 *     ODP a MEDICION y marque chk_medicion.
 *   - prospecto_id (158), la ODP-24201 y el prospecto 158 quedan intactos.
 *
 * Usa el modelo Sequelize (no raw SQL) para que disparen los hooks de auditoría.
 *
 * EJECUCIÓN (one-off, ya ejecutado el 2026-07-27):
 *   cd backend-api && npx ts-node src/scripts/fix_tm_0178_2026-07-27.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import sequelize from '../config/database';
import { TomaMedidas, ODP } from '../models';
import { requestContext } from '../utils/requestContext';

const NUMERO_TM = 'TM-0178';

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Conectado a BD.\n');

    const tm = await TomaMedidas.findOne({ where: { numero_tm: NUMERO_TM } });

    // ── Guardas ───────────────────────────────────────────────────────────────
    if (!tm) {
      console.error(`ABORTA: ${NUMERO_TM} no encontrada.`);
      process.exit(1);
    }

    const estado = tm.getDataValue('estado');
    const croquis = tm.getDataValue('croquis_url');
    const fotos = tm.getDataValue('medidas_json');
    const numFotos = Array.isArray(fotos) ? fotos.length : 0;

    console.log('Estado actual:', {
      id: tm.getDataValue('id'),
      numero_tm: NUMERO_TM,
      estado,
      fecha_visita: tm.getDataValue('fecha_visita'),
      hora_visita: tm.getDataValue('hora_visita'),
      odp_id: tm.getDataValue('odp_id'),
      prospecto_id: tm.getDataValue('prospecto_id'),
      croquis_url: croquis,
      num_fotos: numFotos,
    });

    if (!['convertida', 'realizada'].includes(estado)) {
      console.error(`\nABORTA: la TM está en estado '${estado}', no en 'convertida'/'realizada'.`);
      console.error('El script ya fue ejecutado o el estado cambió. Sin cambios.');
      process.exit(1);
    }

    if (croquis || numFotos > 0) {
      console.error(`\nABORTA: la TM tiene ${numFotos} foto(s) y/o croquis registrado.`);
      console.error('Retornarla a Solicitadas implicaría decidir qué hacer con esas fotos.');
      console.error('Revisar manualmente antes de continuar. Sin cambios.');
      process.exit(1);
    }

    // ── Actualización (auditada) ──────────────────────────────────────────────
    await requestContext.run(
      { userId: null, userName: 'SCRIPT fix_tm_0178_2026-07-27', ip: null },
      async () => {
        await tm.update({ estado: 'solicitada', fecha_visita: null, hora_visita: null });
      },
    );

    console.log('\n✅ TM-0178 actualizada → estado: solicitada, fecha_visita: NULL, hora_visita: NULL');

    // ── Verificación ──────────────────────────────────────────────────────────
    const tmVerif = await TomaMedidas.findOne({ where: { numero_tm: NUMERO_TM } });
    console.log('\nEstado final TM:', {
      estado: tmVerif!.getDataValue('estado'),
      fecha_visita: tmVerif!.getDataValue('fecha_visita'),
      hora_visita: tmVerif!.getDataValue('hora_visita'),
      odp_id: tmVerif!.getDataValue('odp_id'),
      prospecto_id: tmVerif!.getDataValue('prospecto_id'),
    });

    const odpId = tmVerif!.getDataValue('odp_id');
    if (odpId) {
      const odp = await ODP.findByPk(odpId, {
        attributes: ['numero_odp', 'estado_produccion', 'chk_medicion'],
      });
      console.log('ODP vinculada (sin cambios):', odp?.toJSON());
    }

    await sequelize.close();
    process.exit(0);
  } catch (e: any) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
