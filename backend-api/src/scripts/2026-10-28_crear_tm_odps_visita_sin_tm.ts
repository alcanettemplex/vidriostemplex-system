/**
 * 2026-10-28_crear_tm_odps_visita_sin_tm.ts
 *
 * Crea la TM "solicitada" de cada ODP que está en VISITA_TECNICA sin ninguna toma de
 * medidas (al 2026-10-28 solo la ODP-24479, SANTIAGO GARCIA VANEGAS). Desde ese día la
 * regla es "toda ODP en Visita técnica tiene su TM real" (`asegurarTMDeODP` en
 * `utils/tomaMedidas.ts`); este script pone al día las que nacieron antes. Así el panel de
 * Tomas de Medida las muestra como TM normales, con Programar / Editar / Eliminar.
 *
 * No cambia el estado de la ODP. La TM queda a nombre del asesor de la ODP, con su
 * dirección de instalación y quien recibe. Sin socket (ver `emitir: false`): las
 * pantallas la ven al recargar.
 *
 * EJECUCIÓN:
 *   backend-api/node_modules/.bin/ts-node --project backend-api/tsconfig.json \
 *     backend-api/src/scripts/2026-10-28_crear_tm_odps_visita_sin_tm.ts            (solo lista)
 *   ... mismo comando con --aplicar                                                 (escribe)
 */
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import sequelize from '../config/database';
import { ODP, TomaMedidas, Cliente } from '../models';
import { requestContext } from '../utils/requestContext';
import { asegurarTMDeODP } from '../utils/tomaMedidas';

const APLICAR = process.argv.includes('--aplicar');
const USUARIO_ROOT = 30;

(async () => {
  try {
    await sequelize.authenticate();

    const odps = await ODP.findAll({
      where: { estado_produccion: 'VISITA_TECNICA' },
      attributes: ['id', 'numero_odp', 'asesor_id', 'direccion_instalacion', 'nombre_recibe', 'telefono_recibe'],
      include: [
        { model: Cliente, as: 'cliente', attributes: ['nombre_razon_social'] },
        { model: TomaMedidas, as: 'tomas_medidas', attributes: ['id'], required: false },
      ],
      order: [['id', 'ASC']],
    });
    const sinTM = odps.filter((o: any) => !o.tomas_medidas?.length);

    console.log(`ODP en Visita técnica: ${odps.length}. Sin TM: ${sinTM.length}.`);
    sinTM.forEach((o: any) => console.log(`  - ${o.numero_odp} · ${o.cliente?.nombre_razon_social || '—'} · ${o.direccion_instalacion || '(sin dirección)'}`));

    if (!APLICAR || sinTM.length === 0) {
      console.log(APLICAR ? 'Nada que crear.' : 'Solo lectura. Corre con --aplicar para crear las TM.');
      await sequelize.close();
      return;
    }

    for (const odp of sinTM) {
      const numero = await requestContext.run(
        { userId: USUARIO_ROOT, userName: 'SCRIPT 2026-10-28_crear_tm_odps_visita_sin_tm', ip: null },
        () => sequelize.transaction(async (t) => asegurarTMDeODP(odp, {
          usuarioId: Number(odp.getDataValue('asesor_id')) || USUARIO_ROOT,
          transaction: t,
          emitir: false,
        })),
      );
      console.log(`OK: ${odp.getDataValue('numero_odp')} → ${numero ?? '(ya tenía TM)'}`);
    }
    await sequelize.close();
  } catch (err) {
    console.error('ERROR:', err);
    process.exit(1);
  }
})();
