/**
 * Script: 2026-09-01_control_ventana_reintentos.ts  — SOLO LECTURA
 *
 * Control de sanidad del diagnóstico 2026-09-01_diagnostico_reintentos_updateodp.ts.
 * El diagnóstico salió limpio; esto verifica que sea un negativo REAL y no un falso
 * negativo por bajo volumen o por auditoría incompleta.
 *
 *   A. Compara el volumen de la ventana del bug contra una ventana de control de la
 *      misma duración inmediatamente anterior. Si la actividad es comparable, la
 *      ausencia de duplicados es concluyente.
 *   B. Busca el patrón de reintento propiamente dicho: UPDATEs sobre la misma ODP
 *      muy seguidos en el tiempo (el usuario reintentando tras ver el 500).
 *   C. Confirma que el dato SÍ se guardaba: reintentos cuyo `datos_nuevos` es idéntico
 *      al anterior (segundo intento sin cambios = el primero ya había pasado).
 *
 * Ejecutar: npx ts-node src/scripts/2026-09-01_control_ventana_reintentos.ts
 */

import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';

const BUG_INI = '2026-08-28 12:58:40-05';
const BUG_FIN = '2026-08-31 08:55:36-05';
// Ventana de control: misma duración (2d 19h 57m) justo antes del despliegue del bug
const CTL_INI = '2026-08-25 16:59:00-05';
const CTL_FIN = '2026-08-28 12:58:40-05';

const fmt = (d: Date) =>
  new Date(d).toLocaleString('es-CO', { timeZone: 'America/Bogota', hour12: false });

async function volumen(ini: string, fin: string) {
  const r = await sequelize.query<{ tabla: string; operacion: string; n: string }>(
    `SELECT tabla, operacion, COUNT(*)::text AS n
       FROM auditoria_log
      WHERE fecha BETWEEN :ini AND :fin
        AND tabla IN ('odp','odp_items','historial_estados_odp','pedido_pv')
      GROUP BY tabla, operacion
      ORDER BY tabla, operacion`,
    { type: QueryTypes.SELECT, replacements: { ini, fin } }
  );
  return r;
}

async function run() {
  console.log('=== Control de sanidad — ventana del bug vs ventana previa ===\n');

  // --- A. Volumen comparado ---------------------------------------------------
  const [bug, ctl] = await Promise.all([volumen(BUG_INI, BUG_FIN), volumen(CTL_INI, CTL_FIN)]);
  const claves = [...new Set([...bug, ...ctl].map((r) => `${r.tabla}|${r.operacion}`))].sort();

  console.log('--- A. Volumen de actividad (misma duración: 2d 20h) ---');
  console.log('  tabla / operación'.padEnd(42) + 'CONTROL'.padStart(9) + 'BUG'.padStart(9));
  for (const k of claves) {
    const [t, o] = k.split('|');
    const b = bug.find((r) => r.tabla === t && r.operacion === o)?.n ?? '0';
    const c = ctl.find((r) => r.tabla === t && r.operacion === o)?.n ?? '0';
    console.log(`  ${`${t} / ${o}`.padEnd(40)}${c.padStart(9)}${b.padStart(9)}`);
  }
  console.log();

  // --- B. Patrón de reintento: UPDATEs seguidos sobre la misma ODP ------------
  console.log('--- B. Reintentos: UPDATEs sobre la misma ODP con < 3 min de diferencia ---');
  const reintentos = await sequelize.query<{
    registro_id: string; numero_odp: string | null; usuario_nombre: string | null;
    fecha: Date; anterior: Date; seg: string;
  }>(
    `WITH u AS (
       SELECT a.registro_id, a.usuario_nombre, a.fecha,
              LAG(a.fecha) OVER (PARTITION BY a.registro_id ORDER BY a.fecha) AS anterior
         FROM auditoria_log a
        WHERE a.tabla = 'odp' AND a.operacion = 'UPDATE'
          AND a.fecha BETWEEN :ini AND :fin
     )
     SELECT u.registro_id, o.numero_odp, u.usuario_nombre, u.fecha, u.anterior,
            ROUND(EXTRACT(EPOCH FROM (u.fecha - u.anterior)))::text AS seg
       FROM u
       LEFT JOIN odp o ON o.id::text = u.registro_id
      WHERE u.anterior IS NOT NULL
        AND u.fecha - u.anterior < INTERVAL '3 minutes'
      ORDER BY u.fecha`,
    { type: QueryTypes.SELECT, replacements: { ini: BUG_INI, fin: BUG_FIN } }
  );
  if (reintentos.length === 0) {
    console.log('  Sin UPDATEs consecutivos rápidos — no hay evidencia de reintentos.\n');
  } else {
    console.log(`  ${reintentos.length} par(es) de UPDATEs consecutivos rápidos:\n`);
    for (const r of reintentos) {
      console.log(`  · ODP ${r.numero_odp ?? `id ${r.registro_id}`} — +${r.seg}s — ${r.usuario_nombre ?? '?'} — ${fmt(r.fecha)}`);
    }
    console.log();
  }

  // --- C. ¿El reintento traía el mismo payload? -------------------------------
  console.log('--- C. ¿Los reintentos repetían el mismo contenido? ---');
  const identicos = await sequelize.query<{
    numero_odp: string | null; registro_id: string; fecha: Date; iguales: boolean;
  }>(
    `WITH u AS (
       SELECT a.registro_id, a.fecha, a.datos_nuevos,
              LAG(a.datos_nuevos) OVER (PARTITION BY a.registro_id ORDER BY a.fecha) AS prev,
              LAG(a.fecha) OVER (PARTITION BY a.registro_id ORDER BY a.fecha) AS fprev
         FROM auditoria_log a
        WHERE a.tabla = 'odp' AND a.operacion = 'UPDATE'
          AND a.fecha BETWEEN :ini AND :fin
     )
     SELECT o.numero_odp, u.registro_id, u.fecha,
            (u.datos_nuevos = u.prev) AS iguales
       FROM u
       LEFT JOIN odp o ON o.id::text = u.registro_id
      WHERE u.prev IS NOT NULL
        AND u.fecha - u.fprev < INTERVAL '3 minutes'
      ORDER BY u.fecha`,
    { type: QueryTypes.SELECT, replacements: { ini: BUG_INI, fin: BUG_FIN } }
  );
  const nIguales = identicos.filter((i) => i.iguales).length;
  console.log(`  Pares consecutivos rápidos analizados: ${identicos.length}`);
  console.log(`  Con payload IDÉNTICO (reintento puro): ${nIguales}`);
  console.log(`  Con payload distinto (edición real encadenada): ${identicos.length - nIguales}`);
  for (const i of identicos.filter((x) => x.iguales)) {
    console.log(`    · ODP ${i.numero_odp ?? i.registro_id} — ${fmt(i.fecha)}`);
  }
  console.log();

  // --- D. ODPs tocadas en la ventana, para revisión manual si hiciera falta ----
  const lista = await sequelize.query<{ numero_odp: string; registro_id: string; n: string }>(
    `SELECT o.numero_odp, a.registro_id, COUNT(*)::text AS n
       FROM auditoria_log a
       LEFT JOIN odp o ON o.id::text = a.registro_id
      WHERE a.tabla = 'odp' AND a.operacion = 'UPDATE'
        AND a.fecha BETWEEN :ini AND :fin
      GROUP BY o.numero_odp, a.registro_id
      ORDER BY COUNT(*) DESC`,
    { type: QueryTypes.SELECT, replacements: { ini: BUG_INI, fin: BUG_FIN } }
  );
  console.log('--- D. ODPs editadas durante la ventana (por nº de UPDATEs) ---');
  console.log('  ' + lista.map((l) => `${l.numero_odp ?? l.registro_id}(${l.n})`).join('  '));

  await sequelize.close();
  console.log('\n=== Fin del control (no se modificó nada) ===');
}

run().catch(async (e) => {
  console.error('Error en el control:', e);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
