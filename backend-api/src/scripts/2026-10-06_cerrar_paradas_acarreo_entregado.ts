/**
 * Script: 2026-10-06_cerrar_paradas_acarreo_entregado.ts
 *
 * Propósito: cerrar las paradas de ACARREO PURO (acarreo = true, instalacion = false) que
 * quedaron en `pendiente` / `en_curso` dentro de una ruta ya `completada`, aunque su ODP
 * está ENTREGADA.
 *
 * Por qué existen: hasta el 2026-10-06, `terminarRutaConductor` pasaba la ODP de acarreo a
 * ENTREGADA ("Acarreo completado automáticamente al cerrar ruta #N") pero no tocaba la
 * parada. Completados mostraba "Pendiente" en un acarreo ya entregado (ruta #517,
 * ODP-24346) y el panel del instalador las listaba como pendientes. Al 2026-10-06: 27.
 * Desde ese día el cierre de ruta también cierra la parada (decisión del usuario).
 *
 * Cada parada pasa a `completada` con `fin_instalacion` = `fin_ruta` de su ruta.
 * Se actualiza parada por parada para que los hooks de auditoría registren el cambio.
 *
 * Ejecutar (vista previa):  npx ts-node src/scripts/2026-10-06_cerrar_paradas_acarreo_entregado.ts
 * Aplicar:                  npx ts-node src/scripts/2026-10-06_cerrar_paradas_acarreo_entregado.ts --aplicar
 * Idempotente: una segunda corrida no encuentra nada.
 */

import { QueryTypes } from 'sequelize';
import { sequelize, RutaODP } from '../models';

const APLICAR = process.argv.includes('--aplicar');

interface Candidata {
  ruta_odp_id: number;
  ruta_id: number;
  numero_odp: string;
  estado: string;
  fecha_programada: string;
  fin_ruta: Date | null;
}

async function main() {
  const candidatas = await sequelize.query<Candidata>(
    `SELECT ro.id AS ruta_odp_id, ri.id AS ruta_id, o.numero_odp, ro.estado,
            ro.fecha_programada::text AS fecha_programada,
            -- fin_ruta es TIMESTAMP SIN zona y guarda la hora UTC: leído tal cual, un proceso en
            -- hora de Bogotá lo corre 5 h. AT TIME ZONE 'UTC' lo vuelve un instante real.
            ri.fin_ruta AT TIME ZONE 'UTC' AS fin_ruta
       FROM ruta_odp ro
       JOIN rutas_instalacion ri ON ri.id = ro.ruta_id
       JOIN odp o ON o.id = ro.odp_id
      WHERE ri.estado = 'completada'
        AND ro.estado IN ('pendiente', 'en_curso')
        AND o.acarreo = true AND o.instalacion = false
        AND o.estado_produccion = 'ENTREGADA'
      ORDER BY ri.id, ro.orden`,
    { type: QueryTypes.SELECT }
  );

  console.log(`\nParadas de acarreo entregado que siguen abiertas: ${candidatas.length}`);
  for (const c of candidatas) {
    console.log(`  parada ${c.ruta_odp_id} · ruta #${c.ruta_id} · ${c.numero_odp} · ${c.fecha_programada} · ${c.estado} → completada (fin ${c.fin_ruta?.toISOString() ?? 'ahora'})`);
  }

  if (!candidatas.length) { console.log('Nada que hacer.'); return; }
  if (!APLICAR) { console.log('\nVista previa: no se cambió nada. Corre con --aplicar para cerrarlas.'); return; }

  await sequelize.transaction(async (t) => {
    for (const c of candidatas) {
      const parada = await RutaODP.findByPk(c.ruta_odp_id, { transaction: t });
      if (!parada) continue;
      await parada.update({ estado: 'completada', fin_instalacion: c.fin_ruta ?? new Date() }, { transaction: t });
    }
  });
  console.log(`\nListo: ${candidatas.length} parada(s) cerradas.`);
}

main()
  .catch((e) => { console.error('Error:', e.message); process.exitCode = 1; })
  .finally(() => sequelize.close());
