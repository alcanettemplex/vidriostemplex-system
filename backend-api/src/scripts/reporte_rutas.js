/**
 * Reporte de Incumplimiento: Rutas e Instalaciones Pendientes
 *
 * Uso: node backend-api/src/scripts/reporte_rutas.js
 *
 * Variables de entorno necesarias:
 *   DATABASE_URL=postgresql://...
 *
 * Instalar dependencia si falta: npm install pg
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Client } = require('pg');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('ERROR: DATABASE_URL no definida en .env');
  process.exit(1);
}

const client = new Client({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
});

const SEP  = '─'.repeat(100);
const SEP2 = '═'.repeat(100);

function pad(str, len) {
  const s = String(str ?? '—');
  return s.length > len ? s.slice(0, len - 1) + '…' : s.padEnd(len);
}

function rpad(str, len) {
  const s = String(str ?? '0');
  return s.padStart(len);
}

async function run() {
  await client.connect();
  console.log('\n' + SEP2);
  console.log('  REPORTE DE INCUMPLIMIENTO — RUTAS E INSTALACIONES PENDIENTES');
  console.log(`  Generado: ${new Date().toLocaleString('es-MX')}`);
  console.log(SEP2);

  // ── PARTE 1: Ranking por instalador oficial ──────────────────────────────
  const { rows: ranking } = await client.query(`
    SELECT
      COALESCE(oficial.nombre_completo, '(sin oficial)') AS oficial,
      COUNT(DISTINCT r.id)::int                          AS rutas,
      COUNT(ro.id)::int                                  AS pendientes,
      COUNT(ro.id) FILTER (
        WHERE ro.estado = 'pendiente'
        AND ro.fecha_programada::date < CURRENT_DATE
      )::int                                             AS vencidas,
      COUNT(ro.id) FILTER (WHERE ro.estado = 'pausada')::int  AS pausadas,
      COUNT(ro.id) FILTER (WHERE ro.estado = 'con_dano')::int AS con_dano,
      MAX(GREATEST(0, CURRENT_DATE - r.inicio_ruta::date))::int AS max_dias_atraso
    FROM rutas_instalacion r
    LEFT JOIN usuarios oficial ON oficial.id = r.oficial_id
    JOIN ruta_odp ro ON ro.ruta_id = r.id
    WHERE r.estado IN ('programada', 'en_curso')
      AND ro.estado NOT IN ('completada')
    GROUP BY oficial.nombre_completo
    ORDER BY pendientes DESC, max_dias_atraso DESC
  `);

  console.log('\n📊  RANKING DE INCUMPLIMIENTO POR INSTALADOR OFICIAL\n');
  console.log(
    pad('Instalador oficial', 32),
    rpad('Rutas', 6),
    rpad('Pendientes', 11),
    rpad('Vencidas', 9),
    rpad('Pausadas', 9),
    rpad('c/Daño', 7),
    rpad('Días atraso', 12)
  );
  console.log(SEP);
  for (const r of ranking) {
    console.log(
      pad(r.oficial, 32),
      rpad(r.rutas, 6),
      rpad(r.pendientes, 11),
      rpad(r.vencidas, 9),
      rpad(r.pausadas, 9),
      rpad(r.con_dano, 7),
      rpad(r.max_dias_atraso, 12)
    );
  }

  // ── PARTE 2: Resumen por ruta ────────────────────────────────────────────
  const { rows: rutas } = await client.query(`
    WITH ayudantes AS (
      SELECT ri.ruta_id,
             STRING_AGG(u.nombre_completo, ', ' ORDER BY u.nombre_completo) AS ayudantes
      FROM ruta_instaladores ri
      JOIN usuarios u ON u.id = ri.instalador_id
      GROUP BY ri.ruta_id
    ),
    cp AS (
      SELECT ruta_id,
             COUNT(*)::int                                        AS total,
             COUNT(*) FILTER (WHERE estado='completada')::int    AS completadas,
             COUNT(*) FILTER (WHERE estado='pendiente')::int     AS pendientes,
             COUNT(*) FILTER (WHERE estado='en_curso')::int      AS en_curso,
             COUNT(*) FILTER (WHERE estado='pausada')::int       AS pausadas,
             COUNT(*) FILTER (WHERE estado='con_dano')::int      AS con_dano
      FROM ruta_odp GROUP BY ruta_id
    )
    SELECT
      r.id                                                  AS ruta_id,
      r.estado                                              AS estado_ruta,
      r.inicio_ruta::date                                   AS fecha_ruta,
      GREATEST(0, CURRENT_DATE - r.inicio_ruta::date)::int AS dias_atraso,
      v.placa                                               AS vehiculo,
      v.tipo                                                AS tipo_vehiculo,
      conductor.nombre_completo                             AS conductor,
      oficial.nombre_completo                               AS oficial,
      COALESCE(a.ayudantes, '(sin ayudantes)')              AS ayudantes,
      cp.total, cp.completadas, cp.pendientes,
      cp.en_curso, cp.pausadas, cp.con_dano,
      (cp.total - cp.completadas)                           AS sin_completar
    FROM rutas_instalacion r
    LEFT JOIN vehiculos v       ON v.id         = r.vehiculo_id
    LEFT JOIN usuarios conductor ON conductor.id = r.conductor_id
    LEFT JOIN usuarios oficial   ON oficial.id   = r.oficial_id
    LEFT JOIN ayudantes a        ON a.ruta_id    = r.id
    LEFT JOIN cp                 ON cp.ruta_id   = r.id
    WHERE r.estado IN ('programada', 'en_curso')
      AND (cp.total - COALESCE(cp.completadas, 0)) > 0
    ORDER BY
      CASE r.estado WHEN 'en_curso' THEN 1 WHEN 'programada' THEN 2 END,
      dias_atraso DESC, r.inicio_ruta ASC
  `);

  console.log('\n\n🚛  DETALLE DE RUTAS ABIERTAS\n');

  for (const r of rutas) {
    const atraso = r.dias_atraso > 0 ? `  ⚠ ${r.dias_atraso} DÍA(S) DE ATRASO` : '';
    console.log(SEP2);
    console.log(`  RUTA #${r.ruta_id}  [${r.estado_ruta.toUpperCase()}]  Fecha: ${r.fecha_ruta}${atraso}`);
    console.log(SEP);
    console.log(`  Vehículo   : ${r.vehiculo ?? '—'} (${r.tipo_vehiculo ?? '—'})`);
    console.log(`  Conductor  : ${r.conductor ?? '—'}`);
    console.log(`  Oficial    : ${r.oficial ?? '—'}`);
    console.log(`  Ayudantes  : ${r.ayudantes}`);
    console.log(`  Paradas    : ${r.total} total | ✅ ${r.completadas} completadas | ⏳ ${r.pendientes} pendientes | 🔄 ${r.en_curso} en curso | ⏸ ${r.pausadas} pausadas | 🔴 ${r.con_dano} con daño`);

    // Detalle de paradas sin completar
    const { rows: paradas } = await client.query(`
      SELECT
        ro.orden,
        ro.fecha_programada::date    AS fecha_parada,
        ro.estado                    AS estado_parada,
        ro.motivo_pausa,
        ro.descripcion_dano,
        odp.numero_odp,
        odp.descripcion_pedido,
        odp.direccion_instalacion,
        odp.estado_produccion,
        odp.forma_pago,
        c.nombre_razon_social        AS cliente,
        c.telefono
      FROM ruta_odp ro
      JOIN odp       ON odp.id = ro.odp_id
      LEFT JOIN clientes c ON c.id = odp.cliente_id
      WHERE ro.ruta_id = $1
        AND ro.estado NOT IN ('completada')
      ORDER BY ro.orden
    `, [r.ruta_id]);

    for (const p of paradas) {
      const estadoIcon = {
        pendiente: '⏳',
        en_curso:  '🔄',
        pausada:   '⏸',
        con_dano:  '🔴',
      }[p.estado_parada] ?? '?';

      console.log('');
      console.log(`    ${estadoIcon} Parada ${p.orden ?? '?'}  — ODP: ${p.numero_odp}  (${p.fecha_parada ?? '—'})`);
      console.log(`       Cliente  : ${p.cliente ?? '—'}  ${p.telefono ? `(Tel: ${p.telefono})` : ''}`);
      console.log(`       Trabajo  : ${p.descripcion_pedido ?? '—'}`);
      console.log(`       Dirección: ${p.direccion_instalacion ?? '—'}`);
      console.log(`       Estado   : ${p.estado_parada.toUpperCase()}  |  Pago: ${p.forma_pago ?? '—'}  |  Prod: ${p.estado_produccion}`);
      if (p.motivo_pausa)    console.log(`       Motivo pausa : ${p.motivo_pausa}`);
      if (p.descripcion_dano) console.log(`       Daño         : ${p.descripcion_dano}`);
    }
    console.log('');
  }

  if (rutas.length === 0) {
    console.log('\n  ✅  No hay rutas pendientes.\n');
  }

  // ── PARTE 3: Resumen final ───────────────────────────────────────────────
  const { rows: [totales] } = await client.query(`
    SELECT
      COUNT(DISTINCT r.id)::int                                          AS total_rutas_abiertas,
      COUNT(ro.id)::int                                                  AS total_paradas_pendientes,
      COUNT(ro.id) FILTER (WHERE ro.estado='pendiente'
        AND ro.fecha_programada::date < CURRENT_DATE)::int              AS vencidas_sin_iniciar,
      COUNT(ro.id) FILTER (WHERE ro.estado='pausada')::int              AS pausadas,
      COUNT(ro.id) FILTER (WHERE ro.estado='con_dano')::int             AS con_dano,
      COUNT(ro.id) FILTER (WHERE r.estado='programada'
        AND r.inicio_ruta::date < CURRENT_DATE)::int                    AS rutas_nunca_iniciadas
    FROM rutas_instalacion r
    JOIN ruta_odp ro ON ro.ruta_id = r.id
    WHERE r.estado IN ('programada', 'en_curso')
      AND ro.estado NOT IN ('completada')
  `);

  console.log(SEP2);
  console.log('  TOTALES GENERALES');
  console.log(SEP2);
  console.log(`  Rutas abiertas         : ${totales.total_rutas_abiertas}`);
  console.log(`  Paradas sin completar  : ${totales.total_paradas_pendientes}`);
  console.log(`  Vencidas sin iniciar   : ${totales.vencidas_sin_iniciar}  ⚠`);
  console.log(`  Pausadas               : ${totales.pausadas}`);
  console.log(`  Con daño               : ${totales.con_dano}`);
  console.log(`  Rutas nunca iniciadas  : ${totales.rutas_nunca_iniciadas}  ⚠`);
  console.log(SEP2 + '\n');

  await client.end();
}

run().catch(err => {
  console.error('Error al generar el reporte:', err.message);
  process.exit(1);
});
