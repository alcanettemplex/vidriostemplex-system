import sequelize from '../config/database';
import { AuditoriaLog } from '../models';

async function verificar() {
  try {
    await sequelize.authenticate();
    const registros = await AuditoriaLog.findAll({
      where: { tabla: 'odp', registro_id: '62' as any },
      order: [['id', 'DESC']],
      limit: 2,
    });
    for (const r of registros as any[]) {
      console.log(JSON.stringify({
        id: r.id, tabla: r.tabla, registro_id: r.registro_id, accion: r.accion,
        usuario_id: r.usuario_id, fecha: r.fecha,
      }));
    }
  } finally {
    await sequelize.close();
  }
}

verificar();
