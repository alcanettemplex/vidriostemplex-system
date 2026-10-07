/**
 * Script: 2026-10-07_paradas_ruta_cancelada_a_pausada.ts
 *
 * Propósito: pasar a `pausada` las paradas que quedaron `pendiente` dentro de una ruta
 * `cancelada`, con `motivo_pausa` = "Ruta #N cancelada".
 *
 * Por qué existen: hasta el 2026-10-07, `cancelarRuta` devolvía a la bandeja las ODP
 * PROGRAMADA pero no tocaba la parada. La ficha de la ODP (tab Instalación) la mostraba
 * "Pendiente" aunque la ODP ya estuviera ENTREGADA (ruta #503, ODP-24363). Al 2026-10-07:
 * 38 paradas (27 con la ODP ENTREGADA, 7 LISTO_INSTALAR, 4 PROGRAMADA). Desde ese día
 * cancelar la ruta deja sus paradas pendientes en `pausada` (decisión del usuario).
 *
 * Solo toca la parada; el estado de la ODP no cambia. `fin_instalacion` queda vacío: la
 * instalación no ocurrió. Se actualiza parada por parada para que los hooks de auditoría
 * registren el cambio.
 *
 * Ejecutar (vista previa):  npx ts-node src/scripts/2026-10-07_paradas_ruta_cancelada_a_pausada.ts
 * Aplicar:                  npx ts-node src/scripts/2026-10-07_paradas_ruta_cancelada_a_pausada.ts --aplicar
 * Idempotente: una segunda corrida no encuentra nada.
 */

import { QueryTypes } from 'sequelize';
import { sequelize, RutaODP } from '../models';

const APLICAR = process.argv.includes('--aplicar');

interface Candidata {
  ruta_odp_id: number;
  ruta_id: number;
  numero_odp: string;
  estado_produccion: string;
  fecha_programada: string;
}

async function main() {
  const candidatas = await sequelize.query<Candidata>(
    `SELECT ro.id AS ruta_odp_id, ri.id AS ruta_id, o.numero_odp, o.estado_produccion,
            ro.fecha_programada::text AS fecha_programada
       FROM ruta_odp ro
       JOIN rutas_instalacion ri ON ri.id = ro.ruta_id
       JOIN odp o ON o.id = ro.odp_id
      WHERE ri.estado = 'cancelada'
        AND ro.estado = 'pendiente'
      ORDER BY ri.id, ro.orden`,
    { type: QueryTypes.SELECT }
  );

  console.log(`\nParadas pendientes en rutas canceladas: ${candidatas.length}`);
  for (const c of candidatas) {
    console.log(`  parada ${c.ruta_odp_id} · ruta #${c.ruta_id} · ${c.numero_odp} (${c.estado_produccion}) · ${c.fecha_programada} → pausada`);
  }

  if (!candidatas.length) { console.log('Nada que hacer.'); return; }
  if (!APLICAR) { console.log('\nVista previa: no se cambió nada. Corre con --aplicar para pasarlas a pausada.'); return; }

  await sequelize.transaction(async (t) => {
    for (const c of candidatas) {
      const parada = await RutaODP.findByPk(c.ruta_odp_id, { transaction: t });
      if (!parada) continue;
      await parada.update({ estado: 'pausada', motivo_pausa: `Ruta #${c.ruta_id} cancelada` }, { transaction: t });
    }
  });
  console.log(`\nListo: ${candidatas.length} parada(s) pasadas a pausada.`);
}

main()
  .catch((e) => { console.error('Error:', e.message); process.exitCode = 1; })
  .finally(() => sequelize.close());
