/**
 * Diagnóstico SOLO LECTURA de la ODP-24317 (id 565) — estado de montos y rastro de auditoría.
 * No escribe nada. Acompaña a `2026-09-11_corregir_monto_odp24317.ts`.
 *
 * Uso:
 *   ./backend-api/node_modules/.bin/ts-node backend-api/src/scripts/2026-09-11_consultar_odp24317.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: 'backend-api/.env' });

import { QueryTypes } from 'sequelize';
import sequelize from '../config/database';

const ODP_ID = 565;

(async () => {
  try {
    const cab: any[] = await sequelize.query(`
      SELECT numero_odp, estado_produccion, estado_facturacion, estado_caja,
             factura_electronica, fecha_factura::date AS fecha_factura,
             valor_total, monto_factura_principal, abono, pendiente, forma_pago
        FROM odp WHERE id = :id
    `, { type: QueryTypes.SELECT, replacements: { id: ODP_ID } });
    console.log('═══ CABECERA ═══'); console.table(cab);

    const pagos: any[] = await sequelize.query(
      `SELECT id, monto, diferencia, metodo_pago, fecha::date AS fecha FROM pagos WHERE odp_id = :id ORDER BY id`,
      { type: QueryTypes.SELECT, replacements: { id: ODP_ID } });
    console.log(`\n═══ PAGOS (${pagos.length}) · FE ADICIONALES / SALIDAS / COTIZACIONES ═══`);
    console.table(pagos);

    // Rastro completo de auditoría de esta ODP, con el diff campo a campo.
    const aud: any[] = await sequelize.query(`
      SELECT id, operacion, usuario_id, usuario_nombre, ip_address, fecha,
             datos_anteriores, datos_nuevos
        FROM auditoria_log WHERE tabla = 'odp' AND registro_id = :id
       ORDER BY fecha DESC LIMIT 8
    `, { type: QueryTypes.SELECT, replacements: { id: String(ODP_ID) } });

    console.log(`\n═══ AUDITORÍA (${aud.length}) ═══`);
    for (const row of aud) {
      const ant = row.datos_anteriores || {};
      const nue = row.datos_nuevos || {};
      const diff: Record<string, string> = {};
      for (const k of new Set([...Object.keys(ant), ...Object.keys(nue)])) {
        if (JSON.stringify(ant[k]) !== JSON.stringify(nue[k])) {
          diff[k] = `${JSON.stringify(ant[k])} → ${JSON.stringify(nue[k])}`;
        }
      }
      console.log(`\n#${row.id} · ${row.fecha} · ${row.operacion} · usuario=${row.usuario_nombre ?? 'null'} (id ${row.usuario_id ?? 'null'}) · ip=${row.ip_address ?? 'null'}`);
      console.log(Object.keys(diff).length ? diff : '(sin diferencias de campo)');
    }
  } catch (e: any) {
    console.error('ERROR:', e.message);
  } finally {
    await sequelize.close();
  }
})();
