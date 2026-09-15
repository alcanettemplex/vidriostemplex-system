/**
 * Diagnóstico SOLO LECTURA — verifica que "Pendiente" en Cartera Vencida (dashboard) sea
 * el saldo restante real: valor_total - abono - SUM(diferencia de sus pagos), no el
 * valor_total completo. No escribe nada.
 *
 * Contexto: el usuario reportó (2026-09-15) que esperaba ver el saldo restante (ej. ODP de
 * 10M con 2M abonados → debía mostrar 8M) y pidió verificación. Sobre una muestra de 6 ODPs
 * de la captura real de Cartera Vencida, las 6 cuadran. ODP-24000 parecía no cuadrar contra
 * `valor_total - abono` a secas ($146.204.610 vs pendiente $143.490.633), pero la diferencia
 * exacta ($2.713.977) es la suma de `pagos.diferencia` (descuento que reduce el pendiente sin
 * contar como abono, ver `contabilidad.controller.ts` registrarPago) — con ese término, cuadra
 * exacto. No era un bug: el campo `pendiente` ya refleja el saldo real en los 6 casos.
 *
 * Uso:
 *   ./backend-api/node_modules/.bin/ts-node backend-api/src/scripts/2026-09-15_verificar_pendiente_cartera_vencida.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: 'backend-api/.env' });

import { QueryTypes } from 'sequelize';
import sequelize from '../config/database';

const NUMEROS_ODP = ['ODP-24000', 'ODP-23859', 'ODP-24168', 'ODP-24143', 'ODP-24109', 'ODP-24178'];

(async () => {
  try {
    const rows: any[] = await sequelize.query(`
      SELECT o.numero_odp, o.valor_total, o.abono, o.pendiente,
             COALESCE((SELECT SUM(p.diferencia) FROM pagos p WHERE p.odp_id = o.id), 0) AS suma_diferencia,
             (o.valor_total - o.abono - COALESCE((SELECT SUM(p.diferencia) FROM pagos p WHERE p.odp_id = o.id), 0)) AS pendiente_calculado,
             (o.pendiente = (o.valor_total - o.abono - COALESCE((SELECT SUM(p.diferencia) FROM pagos p WHERE p.odp_id = o.id), 0))) AS coincide
        FROM odp o
       WHERE o.numero_odp IN (:numeros)
       ORDER BY o.numero_odp
    `, { type: QueryTypes.SELECT, replacements: { numeros: NUMEROS_ODP } });
    console.log('═══ PENDIENTE vs (valor_total - abono - diferencia) ═══');
    console.table(rows);
  } catch (e: any) {
    console.error('ERROR:', e.message);
  } finally {
    await sequelize.close();
  }
})();
