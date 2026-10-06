/**
 * Script: 2026-10-06_reprogramadas_a_pausada.ts
 *
 * Propósito: corregir las paradas que "Reprogramar" (panel Pendientes de cierre) marcó
 * como `completada` aunque la instalación NO se hizo.
 *
 * Por qué existen: hasta el 2026-10-06, `reprogramarAtascada` cerraba la parada como
 * `completada` y devolvía la ODP a LISTO_INSTALAR. Con el resultado real de cada parada en
 * Completados (decisión del usuario) esas paradas se leerían "Entregada". Desde ese día
 * la parada queda `pausada` —salió de la ruta y la ODP volvió a su bandeja— con el motivo.
 *
 * Identificación exacta: cada reprogramación escribe en `historial_estados_odp` una fila
 * "Reprogramada desde \"Pendientes de cierre\"…" con `fecha` = el mismo instante que puso
 * en `ruta_odp.fin_instalacion`. Solo se toca la parada `completada` de esa ODP cuyo
 * `fin_instalacion` coincide al milisegundo; las reprogramaciones sin parada (la ODP no
 * tenía ruta) se listan y no se tocan.
 *
 * Cada parada pasa a `pausada` con `motivo_pausa` = el texto del historial
 * (fin_instalacion se conserva como registro de cuándo se reprogramó).
 *
 * Ejecutar (vista previa):  npx ts-node src/scripts/2026-10-06_reprogramadas_a_pausada.ts
 * Aplicar:                  npx ts-node src/scripts/2026-10-06_reprogramadas_a_pausada.ts --aplicar
 * Idempotente: una segunda corrida no encuentra nada (la parada ya no está `completada`).
 */

import { QueryTypes } from 'sequelize';
import { sequelize, RutaODP } from '../models';

const APLICAR = process.argv.includes('--aplicar');

interface Fila {
  historial_id: number;
  numero_odp: string;
  fecha: Date;
  observacion: string;
  ruta_odp_id: number | null;
  ruta_id: number | null;
  motivo_pausa: string | null;
  evidencias: number;
}

async function main() {
  const filas = await sequelize.query<Fila>(
    `SELECT h.id AS historial_id, o.numero_odp, h.fecha, h.observacion,
            ro.id AS ruta_odp_id, ro.ruta_id, ro.motivo_pausa,
            (SELECT count(*)::int FROM evidencias_instalacion e
              WHERE e.odp_id = h.odp_id AND e.fecha BETWEEN h.fecha - interval '1 minute' AND h.fecha + interval '1 minute') AS evidencias
       FROM historial_estados_odp h
       JOIN odp o ON o.id = h.odp_id
       LEFT JOIN ruta_odp ro
              ON ro.odp_id = h.odp_id
             AND ro.estado = 'completada'
             AND ro.fin_instalacion = h.fecha
      WHERE h.observacion LIKE 'Reprogramada desde "Pendientes de cierre"%'
      ORDER BY h.fecha`,
    { type: QueryTypes.SELECT }
  );

  const aCorregir = filas.filter((f) => f.ruta_odp_id && f.evidencias === 0);
  const sinParada = filas.filter((f) => !f.ruta_odp_id);
  const conEvidencia = filas.filter((f) => f.ruta_odp_id && f.evidencias > 0);

  console.log(`\nReprogramaciones en el historial: ${filas.length}`);
  console.log(`  → paradas a corregir (completada → pausada): ${aCorregir.length}`);
  for (const f of aCorregir) {
    console.log(`     parada ${f.ruta_odp_id} · ruta #${f.ruta_id} · ${f.numero_odp} · ${f.fecha.toISOString()} · «${f.observacion}»`);
  }
  console.log(`  → sin parada que coincida (ya corregida, o la ODP no tenía ruta): ${sinParada.length}`);
  for (const f of sinParada) console.log(`     ${f.numero_odp} · ${f.fecha.toISOString()}`);
  if (conEvidencia.length) {
    console.log(`  → NO se tocan porque tienen evidencias en ese mismo minuto (revisar a mano): ${conEvidencia.length}`);
    for (const f of conEvidencia) console.log(`     parada ${f.ruta_odp_id} · ${f.numero_odp}`);
  }

  if (!aCorregir.length) { console.log('Nada que hacer.'); return; }
  if (!APLICAR) { console.log('\nVista previa: no se cambió nada. Corre con --aplicar para corregirlas.'); return; }

  await sequelize.transaction(async (t) => {
    for (const f of aCorregir) {
      const parada = await RutaODP.findByPk(f.ruta_odp_id!, { transaction: t });
      if (!parada || parada.get('estado') !== 'completada') continue;
      await parada.update({
        estado: 'pausada',
        motivo_pausa: (f.motivo_pausa ? `${f.motivo_pausa} · ${f.observacion}` : f.observacion).slice(0, 1000),
      }, { transaction: t });
    }
  });
  console.log(`\nListo: ${aCorregir.length} parada(s) corregidas.`);
}

main()
  .catch((e) => { console.error('Error:', e.message); process.exitCode = 1; })
  .finally(() => sequelize.close());
