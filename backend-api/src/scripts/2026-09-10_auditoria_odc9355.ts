/**
 * Auditoría SOLO LECTURA de la ODC id=398 (ODC-9355) y sus ítems.
 * No escribe nada.
 */
import dotenv from 'dotenv';
dotenv.config({ path: 'backend-api/.env' });

import { QueryTypes } from 'sequelize';
import { sequelize } from '../models';

(async () => {
  try {
    const filas: any[] = await sequelize.query(
      `SELECT id, tabla, registro_id, operacion, usuario_id, usuario_nombre, fecha,
              datos_anteriores, datos_nuevos
         FROM auditoria_log
        WHERE (tabla = 'ordenes_compra' AND registro_id = '398')
           OR (tabla = 'odc_items'      AND registro_id IN ('2004','2005','2006','2007','2008','2009'))
        ORDER BY fecha ASC, id ASC`,
      { type: QueryTypes.SELECT },
    );

    console.log(`Registros de auditoría: ${filas.length}\n`);
    for (const f of filas) {
      const ant = typeof f.datos_anteriores === 'string' ? JSON.parse(f.datos_anteriores) : f.datos_anteriores;
      const nue = typeof f.datos_nuevos === 'string' ? JSON.parse(f.datos_nuevos) : f.datos_nuevos;
      const resumen = (o: any) => o ? {
        estado: o.estado, recibido: o.recibido,
        fecha_recepcion: o.fecha_recepcion, proveedor: o.proveedor, notas: o.notas,
      } : null;
      console.log(`[${f.fecha}] ${f.tabla}#${f.registro_id} ${f.operacion} usuario=${f.usuario_id} (${f.usuario_nombre})`);
      console.log('   antes:', JSON.stringify(resumen(ant)));
      console.log('   desp :', JSON.stringify(resumen(nue)));
    }

    // SAPItems tocados, por si hay pistas del orden de eventos
    const sap: any[] = await sequelize.query(
      `SELECT id, registro_id, operacion, usuario_id, usuario_nombre, fecha,
              datos_anteriores->>'estado_compra' AS antes,
              datos_nuevos->>'estado_compra'     AS despues
         FROM auditoria_log
        WHERE tabla = 'sap_items' AND registro_id IN ('1810','1912','1940','1941')
        ORDER BY fecha ASC, id ASC`,
      { type: QueryTypes.SELECT },
    );
    console.log(`\n═══ sap_items (${sap.length}) ═══`);
    sap.forEach(s => console.log(`[${s.fecha}] sap_item#${s.registro_id} ${s.operacion} u=${s.usuario_id} ${s.antes} → ${s.despues}`));
  } catch (e: any) {
    console.error('ERROR:', e.message);
  } finally {
    await sequelize.close();
  }
})();
