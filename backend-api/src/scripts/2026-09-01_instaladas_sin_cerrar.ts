/**
 * Script: 2026-09-01_instaladas_sin_cerrar.ts — SOLO LECTURA
 *
 * Afina el diagnóstico: de las ODPs que quedaron en INSTALADA (= "instalación en curso"
 * según la semántica real del código), ¿cuáles tienen señales de haber terminado de
 * verdad (factura, salida de almacén, evidencias, parada de ruta cerrada)?
 *
 * Sirve para separar:
 *   - las que solo necesitan cierre administrativo (todo lo demás ya ocurrió), de
 *   - las que siguen realmente pendientes de trabajo en obra.
 *
 * Ejecutar: npx ts-node src/scripts/2026-09-01_instaladas_sin_cerrar.ts
 */

import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';

interface Fila {
  numero_odp: string; cliente: string | null; dias: string | null;
  facturada: string; estado_caja: string | null; salida: string;
  evidencias: string; ultima_parada: string | null; total_paradas: string;
}

async function run() {
  console.log('=== ODPs en INSTALADA: ¿solo falta el cierre administrativo? ===\n');

  const filas = await sequelize.query<Fila>(
    `SELECT o.numero_odp,
            c.nombre_razon_social AS cliente,
            (CURRENT_DATE - (h.fecha AT TIME ZONE 'America/Bogota')::date)::text AS dias,
            o.estado_facturacion AS facturada,
            o.estado_caja,
            CASE WHEN sa.id IS NOT NULL THEN 'sí' ELSE 'no' END AS salida,
            COALESCE(ev.n, 0)::text AS evidencias,
            ro.estado AS ultima_parada,
            COALESCE(rc.n, 0)::text AS total_paradas
       FROM odp o
       LEFT JOIN clientes c ON c.id = o.cliente_id
       LEFT JOIN salidas_almacen sa ON sa.odp_id = o.id
       LEFT JOIN LATERAL (
         SELECT fecha FROM historial_estados_odp
          WHERE odp_id = o.id AND estado_nuevo = 'INSTALADA'
          ORDER BY fecha DESC LIMIT 1
       ) h ON TRUE
       LEFT JOIN LATERAL (
         SELECT estado FROM ruta_odp WHERE odp_id = o.id ORDER BY id DESC LIMIT 1
       ) ro ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS n FROM ruta_odp WHERE odp_id = o.id
       ) rc ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS n FROM evidencias_instalacion WHERE odp_id = o.id
       ) ev ON TRUE
      WHERE o.estado_produccion = 'INSTALADA'
      ORDER BY h.fecha NULLS FIRST`,
    { type: QueryTypes.SELECT }
  );

  console.log('  ODP          días  factura     caja        salida  evid  parada       #par  cliente');
  console.log('  ' + '─'.repeat(104));
  for (const f of filas) {
    console.log(
      `  ${String(f.numero_odp).padEnd(12)} ${String(f.dias ?? '?').padStart(4)}  ` +
      `${String(f.facturada ?? '—').padEnd(11)} ${String(f.estado_caja ?? '—').padEnd(11)} ` +
      `${String(f.salida).padEnd(7)} ${String(f.evidencias).padStart(4)}  ` +
      `${String(f.ultima_parada ?? '—').padEnd(12)} ${String(f.total_paradas).padStart(4)}  ` +
      `${(f.cliente ?? '').slice(0, 26)}`
    );
  }

  // Clasificación
  const cerrable = filas.filter(f => f.facturada === 'FACTURADA' && Number(f.evidencias) > 0);
  const facturadaSinEvid = filas.filter(f => f.facturada === 'FACTURADA' && Number(f.evidencias) === 0);
  const sinRuta = filas.filter(f => Number(f.total_paradas) === 0);

  console.log('\n--- Clasificación ---');
  console.log(`  Total en INSTALADA:                            ${filas.length}`);
  console.log(`  Facturadas CON evidencias (cierre pendiente):  ${cerrable.length}`);
  console.log(`  Facturadas SIN evidencias:                     ${facturadaSinEvid.length}`);
  console.log(`  Sin ninguna parada de ruta (nunca fueron a ruta): ${sinRuta.length}`);
  if (sinRuta.length) console.log(`     → ${sinRuta.map(f => f.numero_odp).join(', ')}`);

  await sequelize.close();
  console.log('\n=== Fin (no se modificó nada) ===');
}

run().catch(async (e) => {
  console.error('Error:', e);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
