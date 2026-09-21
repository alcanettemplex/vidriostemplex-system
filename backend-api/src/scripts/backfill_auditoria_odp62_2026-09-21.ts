// El hook de auditoría de afterUpdate (models/index.ts:463-472) dispara
// AuditoriaLog.create() sin await ("no interrumpir la operación principal"). En
// marcar_nc_odp23891_23857_2026-09-21.ts esa carrera se perdió para ODP-23857
// (id=62, segunda de dos actualizaciones secuenciales) porque sequelize.close()
// se ejecutó antes de que el insert en segundo plano terminara: el registro
// quedó marcado como NC en `odp` pero sin fila en `auditoria_log`. Este script
// reconstruye esa fila para no dejar hueco en el rastro. ODP-23891 (id=99) sí
// quedó registrada (auditoria_log.id=46797) — no requiere backfill.
import sequelize from '../config/database';
import { ODP, AuditoriaLog } from '../models';

async function backfill() {
  try {
    await sequelize.authenticate();
    const odp: any = await ODP.findByPk(62);
    if (!odp) throw new Error('ODP id=62 no encontrada');

    const datosNuevos = odp.toJSON();
    const datosAnteriores = { ...datosNuevos, es_no_conformidad: false };

    await AuditoriaLog.create({
      tabla: 'odp',
      operacion: 'UPDATE',
      registro_id: '62',
      datos_anteriores: datosAnteriores,
      datos_nuevos: datosNuevos,
      usuario_id: 30,
      usuario_nombre: 'ROOT',
      ip_address: null,
    });

    console.log('Backfill de auditoría para ODP id=62 completado.');
  } finally {
    await sequelize.close();
  }
}

backfill();
