/**
 * Script: 2026-09-01_diagnostico_instalaciones_limbo.ts — SOLO LECTURA
 *
 * Propósito: medir cuántas ODPs están hoy "colgadas" en el módulo de instalaciones,
 *            separando las que el panel "Atascadas" del jefe SÍ rescata de las que
 *            quedan invisibles.
 *
 * Semántica real de los estados (verificada en rutas.controller.ts):
 *   iniciarInstalacion()  → ruta_odp='en_curso'   + ODP='INSTALADA'   (instalación EN CURSO)
 *   finalizarInstalacion()→ ruta_odp='completada' + ODP='ENTREGADA'   (instalación TERMINADA)
 *   Es decir: INSTALADA = trabajo en curso, no trabajo terminado.
 *
 * El panel "Atascadas" (getODPsAtascadas) solo cubre:
 *   ruta='completada' AND parada='pendiente' AND ODP='PROGRAMADA'
 * Todo lo demás queda fuera de esa vista.
 *
 * Ejecutar: npx ts-node src/scripts/2026-09-01_diagnostico_instalaciones_limbo.ts
 */

import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';

interface Fila {
  ruta_odp_id: number; numero_odp: string; estado_produccion: string;
  estado_parada: string; estado_ruta: string; fecha_programada: string;
  dias: string; cliente: string | null; inicio: Date | null;
}

const tabla = (filas: Fila[]) => {
  if (filas.length === 0) { console.log('     (ninguna)'); return; }
  for (const f of filas) {
    console.log(
      `     · ${String(f.numero_odp).padEnd(11)} ${String(f.estado_produccion).padEnd(14)}` +
      `parada=${String(f.estado_parada).padEnd(11)} ruta=${String(f.estado_ruta).padEnd(11)}` +
      `prog=${f.fecha_programada}  ${String(f.dias).padStart(4)}d  ${(f.cliente ?? '').slice(0, 28)}`
    );
  }
};

async function run() {
  console.log('=== Instalaciones: ODPs colgadas en el flujo ===\n');
  console.log('Recordatorio de semántica: INSTALADA = en curso · ENTREGADA = terminada\n');

  const BASE = `
    FROM ruta_odp ro
    JOIN rutas_instalacion ri ON ri.id = ro.ruta_id
    JOIN odp o ON o.id = ro.odp_id
    LEFT JOIN clientes c ON c.id = o.cliente_id`;
  const COLS = `
    SELECT ro.id AS ruta_odp_id, o.numero_odp, o.estado_produccion,
           ro.estado AS estado_parada, ri.estado AS estado_ruta,
           ro.fecha_programada::text AS fecha_programada,
           (CURRENT_DATE - ro.fecha_programada)::text AS dias,
           c.nombre_razon_social AS cliente, ro.inicio_instalacion AS inicio`;

  // --- A. Lo que el panel "Atascadas" YA rescata ------------------------------
  const cubiertas = await sequelize.query<Fila>(
    `${COLS} ${BASE}
      WHERE ri.estado = 'completada' AND ro.estado = 'pendiente'
        AND o.estado_produccion = 'PROGRAMADA'
      ORDER BY ro.fecha_programada`,
    { type: QueryTypes.SELECT }
  );
  console.log(`--- A. CUBIERTAS por el panel "Atascadas": ${cubiertas.length} ---`);
  tabla(cubiertas);
  console.log();

  // --- B. Instalador INICIÓ y nunca finalizó (el caso que preguntas) ----------
  const enCurso = await sequelize.query<Fila>(
    `${COLS} ${BASE}
      WHERE ro.estado = 'en_curso'
      ORDER BY ro.fecha_programada`,
    { type: QueryTypes.SELECT }
  );
  console.log(`--- B. NO cubiertas · parada 'en_curso' (inició, nunca finalizó): ${enCurso.length} ---`);
  tabla(enCurso);
  console.log();

  // --- C. Pausadas y olvidadas ----------------------------------------------
  const pausadas = await sequelize.query<Fila>(
    `${COLS} ${BASE}
      WHERE ro.estado = 'pausada'
      ORDER BY ro.fecha_programada`,
    { type: QueryTypes.SELECT }
  );
  console.log(`--- C. NO cubiertas · parada 'pausada': ${pausadas.length} ---`);
  tabla(pausadas);
  console.log();

  // --- D. Parada con daño reportado, sin resolver ----------------------------
  const conDano = await sequelize.query<Fila>(
    `${COLS} ${BASE}
      WHERE ro.estado = 'con_dano'
      ORDER BY ro.fecha_programada`,
    { type: QueryTypes.SELECT }
  );
  console.log(`--- D. NO cubiertas · parada 'con_dano': ${conDano.length} ---`);
  tabla(conDano);
  console.log();

  // --- E. Parada pendiente en ruta NO cerrada, ya vencida --------------------
  const rutaAbierta = await sequelize.query<Fila>(
    `${COLS} ${BASE}
      WHERE ro.estado = 'pendiente'
        AND ri.estado <> 'completada' AND ri.estado <> 'cancelada'
        AND ro.fecha_programada < CURRENT_DATE
      ORDER BY ro.fecha_programada`,
    { type: QueryTypes.SELECT }
  );
  console.log(`--- E. NO cubiertas · parada pendiente, ruta abierta y fecha vencida: ${rutaAbierta.length} ---`);
  tabla(rutaAbierta);
  console.log();

  // --- F. El síntoma: ODPs en INSTALADA desde hace mucho ---------------------
  const instaladasViejas = await sequelize.query<{
    numero_odp: string; dias: string; fecha: Date; cliente: string | null;
    estado_parada: string | null; ruta_id: number | null;
  }>(
    `SELECT o.numero_odp,
            (CURRENT_DATE - (h.fecha AT TIME ZONE 'America/Bogota')::date)::text AS dias,
            h.fecha, c.nombre_razon_social AS cliente,
            ro.estado AS estado_parada, ro.ruta_id
       FROM odp o
       LEFT JOIN clientes c ON c.id = o.cliente_id
       LEFT JOIN LATERAL (
         SELECT fecha FROM historial_estados_odp
          WHERE odp_id = o.id AND estado_nuevo = 'INSTALADA'
          ORDER BY fecha DESC LIMIT 1
       ) h ON TRUE
       LEFT JOIN LATERAL (
         SELECT estado, ruta_id FROM ruta_odp WHERE odp_id = o.id ORDER BY id DESC LIMIT 1
       ) ro ON TRUE
      WHERE o.estado_produccion = 'INSTALADA'
      ORDER BY h.fecha NULLS FIRST`,
    { type: QueryTypes.SELECT }
  );
  console.log(`--- F. ODPs hoy en estado INSTALADA (= "en curso"): ${instaladasViejas.length} ---`);
  for (const r of instaladasViejas) {
    const f = r.fecha ? new Date(r.fecha).toLocaleDateString('es-CO') : 'sin historial';
    console.log(`     · ${String(r.numero_odp).padEnd(11)} desde ${String(f).padEnd(12)} ${String(r.dias ?? '?').padStart(4)}d  parada=${r.estado_parada ?? '—'}  ${(r.cliente ?? '').slice(0, 28)}`);
  }
  console.log();

  // --- G. PROGRAMADA sin ninguna parada viva (ruta cancelada o sin ruta) -----
  const programadaHuerfana = await sequelize.query<{
    numero_odp: string; cliente: string | null; paradas: string;
  }>(
    `SELECT o.numero_odp, c.nombre_razon_social AS cliente,
            COALESCE(string_agg(ro.estado || '/' || ri.estado, ', '), 'SIN PARADA') AS paradas
       FROM odp o
       LEFT JOIN clientes c ON c.id = o.cliente_id
       LEFT JOIN ruta_odp ro ON ro.odp_id = o.id
       LEFT JOIN rutas_instalacion ri ON ri.id = ro.ruta_id
      WHERE o.estado_produccion = 'PROGRAMADA'
      GROUP BY o.id, o.numero_odp, c.nombre_razon_social
     HAVING COUNT(*) FILTER (
              WHERE ro.estado IN ('pendiente','en_curso','pausada')
                AND ri.estado NOT IN ('cancelada')
            ) = 0
      ORDER BY o.numero_odp`,
    { type: QueryTypes.SELECT }
  );
  console.log(`--- G. ODPs en PROGRAMADA sin ninguna parada activa: ${programadaHuerfana.length} ---`);
  for (const r of programadaHuerfana) {
    console.log(`     · ${String(r.numero_odp).padEnd(11)} paradas=[${r.paradas}]  ${(r.cliente ?? '').slice(0, 28)}`);
  }

  // --- H. Resumen ------------------------------------------------------------
  const fuera = enCurso.length + pausadas.length + conDano.length + rutaAbierta.length + programadaHuerfana.length;
  console.log('\n--- RESUMEN ---');
  console.log(`  Rescatables hoy desde el panel "Atascadas": ${cubiertas.length}`);
  console.log(`  Colgadas SIN vía en la UI del jefe:         ${fuera}`);
  console.log(`     B en_curso ${enCurso.length} · C pausada ${pausadas.length} · D con_dano ${conDano.length} · E ruta abierta ${rutaAbierta.length} · G sin parada ${programadaHuerfana.length}`);

  await sequelize.close();
  console.log('\n=== Fin (no se modificó nada) ===');
}

run().catch(async (e) => {
  console.error('Error:', e);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
