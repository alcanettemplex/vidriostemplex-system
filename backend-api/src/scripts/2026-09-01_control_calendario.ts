/**
 * Script: 2026-09-01_control_calendario.ts — SOLO LECTURA
 *
 * Tercer control del diagnóstico de reintentos. La ventana del bug mostró ~62% menos
 * actividad que la de control, lo que admite dos lecturas opuestas:
 *   (a) el bug frenó a los usuarios (→ el diagnóstico limpio sería un falso negativo), o
 *   (b) la ventana del bug cae en fin de semana (→ menor volumen esperado, sin relación).
 * Este script desglosa por día y día-de-semana para separar ambas.
 *
 * Además audita la calidad del rastro: usuario_id / usuario_nombre / ip_address, que
 * salieron vacíos en el control anterior.
 *
 * Ejecutar: npx ts-node src/scripts/2026-09-01_control_calendario.ts
 */

import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';

async function run() {
  console.log('=== Control de calendario y calidad del rastro de auditoría ===\n');

  // --- 1. Actividad por día, cubriendo control + ventana del bug --------------
  const porDia = await sequelize.query<{
    dia: string; dow: string; updates_odp: string; total: string;
  }>(
    `SELECT to_char(fecha AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS dia,
            trim(to_char(fecha AT TIME ZONE 'America/Bogota', 'Day')) AS dow,
            COUNT(*) FILTER (WHERE tabla = 'odp' AND operacion = 'UPDATE')::text AS updates_odp,
            COUNT(*)::text AS total
       FROM auditoria_log
      WHERE fecha >= '2026-08-25 00:00:00-05' AND fecha < '2026-09-01 00:00:00-05'
      GROUP BY 1, 2
      ORDER BY 1`,
    { type: QueryTypes.SELECT }
  );

  console.log('--- 1. Actividad diaria (25-ago → 31-ago) ---');
  console.log('  fecha        día          UPDATEs odp   total auditoría   ventana');
  for (const d of porDia) {
    const enBug = d.dia >= '2026-08-28' && d.dia <= '2026-08-31';
    const marca = enBug ? '← BUG' : '  control';
    console.log(`  ${d.dia}   ${d.dow.padEnd(12)}${d.updates_odp.padStart(11)}${d.total.padStart(17)}   ${marca}`);
  }
  console.log();

  // --- 2. Solo días hábiles: control vs bug ----------------------------------
  const habiles = await sequelize.query<{ ventana: string; dias: string; updates: string; prom: string }>(
    `SELECT CASE WHEN fecha < '2026-08-28 12:58:40-05' THEN 'control' ELSE 'bug' END AS ventana,
            COUNT(DISTINCT (fecha AT TIME ZONE 'America/Bogota')::date)::text AS dias,
            COUNT(*)::text AS updates,
            ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT (fecha AT TIME ZONE 'America/Bogota')::date),0), 1)::text AS prom
       FROM auditoria_log
      WHERE tabla = 'odp' AND operacion = 'UPDATE'
        AND fecha >= '2026-08-25 16:59:00-05' AND fecha < '2026-08-31 08:55:36-05'
        AND EXTRACT(ISODOW FROM fecha AT TIME ZONE 'America/Bogota') <= 5
      GROUP BY 1`,
    { type: QueryTypes.SELECT }
  );
  console.log('--- 2. Normalizado a días hábiles (lun-vie) ---');
  for (const h of habiles) {
    console.log(`  ${h.ventana.padEnd(10)} ${h.dias} día(s) hábil(es) · ${h.updates} UPDATEs · promedio ${h.prom}/día`);
  }
  console.log();

  // --- 3. Calidad del rastro: ¿se está guardando quién hizo el cambio? -------
  const rastro = await sequelize.query<{
    tabla: string; total: string; con_user_id: string; con_nombre: string; con_ip: string;
  }>(
    `SELECT tabla, COUNT(*)::text AS total,
            COUNT(usuario_id)::text AS con_user_id,
            COUNT(usuario_nombre)::text AS con_nombre,
            COUNT(ip_address)::text AS con_ip
       FROM auditoria_log
      WHERE fecha BETWEEN '2026-08-28 12:58:40-05' AND '2026-08-31 08:55:36-05'
      GROUP BY tabla
      ORDER BY COUNT(*) DESC`,
    { type: QueryTypes.SELECT }
  );
  console.log('--- 3. Calidad del rastro en la ventana (¿quién hizo el cambio?) ---');
  console.log('  tabla'.padEnd(28) + 'total'.padStart(8) + 'user_id'.padStart(9) + 'nombre'.padStart(9) + 'ip'.padStart(7));
  for (const r of rastro) {
    console.log(`  ${r.tabla.padEnd(26)}${r.total.padStart(8)}${r.con_user_id.padStart(9)}${r.con_nombre.padStart(9)}${r.con_ip.padStart(7)}`);
  }

  // ¿es un problema general o solo de esa ventana?
  const rastroGlobal = await sequelize.query<{ total: string; con_nombre: string; desde: Date }>(
    `SELECT COUNT(*)::text AS total, COUNT(usuario_nombre)::text AS con_nombre, MIN(fecha) AS desde
       FROM auditoria_log`,
    { type: QueryTypes.SELECT }
  );
  const g = rastroGlobal[0];
  const pct = ((Number(g.con_nombre) / Number(g.total)) * 100).toFixed(1);
  console.log(`\n  Global (desde ${new Date(g.desde).toLocaleDateString('es-CO')}): ${g.con_nombre}/${g.total} con usuario_nombre (${pct}%)`);

  await sequelize.close();
  console.log('\n=== Fin (no se modificó nada) ===');
}

run().catch(async (e) => {
  console.error('Error:', e);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
