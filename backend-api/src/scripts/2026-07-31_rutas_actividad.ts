/**
 * ¿El pico del 2026-07-31 coincide con actividad de RUTAS? — SOLO LECTURA.
 *
 * `INCLUDE_RUTA_COMPLETA` (rutas.controller.ts:52) devuelve `firma_receptor`
 * (12,6 KB/fila) multiplicado por un producto cartesiano de includes sin `separate`
 * (pagos × cotizaciones × tomas_medidas × saps × sap_items × ordenes_compra × odc_items).
 * Lo usan getRuta/:id, crearRuta, actualizarRuta y getMiRutaConductor.
 *
 * crearRuta y actualizarRuta ESCRIBEN, así que sí dejan rastro fechado en auditoria_log:
 * eso permite fechar el consumo aunque pg_stat_statements no tenga eje temporal.
 */
import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';

const fmt = (n: any) => Math.round(Number(n)).toLocaleString('es-CO');

const run = async () => {
  await sequelize.authenticate();

  // 1) Escrituras de rutas por día — cada una devuelve una respuesta INCLUDE_RUTA_COMPLETA
  console.log(`\n${'═'.repeat(96)}`);
  console.log('  ESCRITURAS EN RUTAS POR DÍA (cada una responde con INCLUDE_RUTA_COMPLETA)');
  console.log(`${'═'.repeat(96)}\n`);

  const porDia: any[] = await sequelize.query(
    `SELECT to_char(fecha AT TIME ZONE 'America/Bogota','YYYY-MM-DD') AS dia,
            tabla, count(*)::int AS n
       FROM auditoria_log
      WHERE fecha >= now() - interval '12 days'
        AND tabla IN ('ruta_odp','rutas_instalacion','ruta_instaladores')
      GROUP BY 1,2 ORDER BY 1,2`,
    { type: QueryTypes.SELECT }
  );
  const dias = [...new Set(porDia.map((r) => r.dia))];
  console.log(`    ${'DÍA'.padEnd(13)} ${'ruta_odp'.padStart(9)} ${'rutas_inst'.padStart(11)} ${'TOTAL'.padStart(7)}   GRÁFICO`);
  const totales: Record<string, number> = {};
  dias.forEach((d) => {
    const ro = porDia.find((r) => r.dia === d && r.tabla === 'ruta_odp')?.n ?? 0;
    const ri = porDia.find((r) => r.dia === d && r.tabla === 'rutas_instalacion')?.n ?? 0;
    totales[d] = ro + ri;
  });
  const maxT = Math.max(...Object.values(totales), 1);
  dias.forEach((d) => {
    const ro = porDia.find((r) => r.dia === d && r.tabla === 'ruta_odp')?.n ?? 0;
    const ri = porDia.find((r) => r.dia === d && r.tabla === 'rutas_instalacion')?.n ?? 0;
    const barra = '█'.repeat(Math.max(1, Math.round((totales[d] / maxT) * 42)));
    console.log(`    ${d.padEnd(13)} ${fmt(ro).padStart(9)} ${fmt(ri).padStart(11)} ${fmt(totales[d]).padStart(7)}   ${barra}`);
  });

  // 2) Tamaño real del cartesiano: filas que devuelve el JOIN para las rutas vivas
  console.log(`\n${'═'.repeat(96)}`);
  console.log('  FACTOR DE MULTIPLICACIÓN DEL JOIN (por qué 333 filas devuelven miles)');
  console.log(`${'═'.repeat(96)}\n`);

  const cart: any[] = await sequelize.query(
    `SELECT ri.id AS ruta,
            count(*)::int AS filas_join,
            count(DISTINCT ro.id)::int AS ruta_odps_reales,
            sum(CASE WHEN ro.firma_receptor IS NOT NULL THEN 1 ELSE 0 END)::int AS con_firma,
            pg_size_pretty(sum(COALESCE(pg_column_size(ro.firma_receptor),0))::bigint) AS bytes_firma
       FROM rutas_instalacion ri
       JOIN ruta_odp ro          ON ro.ruta_id = ri.id
       JOIN odp o                ON o.id = ro.odp_id
       LEFT JOIN pagos p         ON p.odp_id = o.id
       LEFT JOIN cotizacion c    ON c.odp_id = o.id
       LEFT JOIN toma_medidas tm ON tm.odp_id = o.id
       LEFT JOIN sap s           ON s.odp_id = o.id
       LEFT JOIN sap_items si    ON si.sap_id = s.id
       LEFT JOIN ordenes_compra oc ON oc.sap_id = s.id
       LEFT JOIN odc_items oi    ON oi.odc_id = oc.id
      GROUP BY ri.id
      ORDER BY filas_join DESC
      LIMIT 8`,
    { type: QueryTypes.SELECT }
  );
  console.log(`    ${'RUTA'.padStart(6)} ${'FILAS JOIN'.padStart(11)} ${'ODPs REALES'.padStart(12)} ${'FACTOR'.padStart(7)} ${'C/FIRMA'.padStart(8)} ${'PESO FIRMAS'.padStart(12)}`);
  cart.forEach((r) => {
    const factor = (r.filas_join / Math.max(1, r.ruta_odps_reales)).toFixed(0) + '×';
    console.log(`    ${String(r.ruta).padStart(6)} ${fmt(r.filas_join).padStart(11)} ${fmt(r.ruta_odps_reales).padStart(12)} ${factor.padStart(7)} ${fmt(r.con_firma).padStart(8)} ${String(r.bytes_firma).padStart(12)}`);
  });

  // 3) Peso total que viaja al pedir el detalle de una ruta pesada
  const peso: any[] = await sequelize.query(
    `SELECT count(*)::int AS filas,
            pg_size_pretty(sum(COALESCE(pg_column_size(ro.firma_receptor),0))::bigint) AS egress_firmas
       FROM ruta_odp ro
       JOIN odp o                ON o.id = ro.odp_id
       LEFT JOIN pagos p         ON p.odp_id = o.id
       LEFT JOIN cotizacion c    ON c.odp_id = o.id
       LEFT JOIN toma_medidas tm ON tm.odp_id = o.id
       LEFT JOIN sap s           ON s.odp_id = o.id
       LEFT JOIN sap_items si    ON si.sap_id = s.id
       LEFT JOIN ordenes_compra oc ON oc.sap_id = s.id
       LEFT JOIN odc_items oi    ON oi.odc_id = oc.id`,
    { type: QueryTypes.SELECT }
  );
  console.log(`\n    Si algo recorre TODAS las ruta_odp con ese JOIN: ${fmt(peso[0].filas)} filas, ` +
              `solo en firmas = ${peso[0].egress_firmas}`);

  // 4) Estado de las firmas
  const firmas: any[] = await sequelize.query(
    `SELECT count(*)::int AS total,
            sum(CASE WHEN firma_receptor IS NOT NULL THEN 1 ELSE 0 END)::int AS con_firma,
            pg_size_pretty(sum(COALESCE(pg_column_size(firma_receptor),0))::bigint) AS peso_total,
            pg_size_pretty(max(pg_column_size(firma_receptor))::bigint) AS mayor
       FROM ruta_odp`,
    { type: QueryTypes.SELECT }
  );
  console.log(`\n    ruta_odp: ${fmt(firmas[0].total)} filas · ${fmt(firmas[0].con_firma)} con firma · ` +
              `peso firmas ${firmas[0].peso_total} · firma mayor ${firmas[0].mayor}`);

  await sequelize.close();
};

run().catch((e) => { console.error('❌ Error:', e); process.exit(1); });
