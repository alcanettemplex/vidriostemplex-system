const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const hoy = new Date();
const hace7dias = new Date(); hace7dias.setDate(hoy.getDate() - 7);
const hace30dias = new Date(); hace30dias.setDate(hoy.getDate() - 30);
const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

function fmt(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function money(n) {
  if (!n) return '$0';
  return '$' + Number(n).toLocaleString('es-CO');
}
function dias(fecha) {
  if (!fecha) return '—';
  const d = Math.floor((hoy - new Date(fecha)) / 86400000);
  return d + ' días';
}

async function run() {
  await client.connect();
  console.log('\n========================================================');
  console.log('   REPORTE SEMANAL — VIDRIOS TEMPLEX');
  console.log(`   Generado: ${hoy.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
  console.log('========================================================\n');

  // ─── 1. RESUMEN GENERAL ───────────────────────────────────────────────────
  console.log('════════════════════════════════════════════════════════');
  console.log('  1. RESUMEN GENERAL');
  console.log('════════════════════════════════════════════════════════');

  const { rows: resumen } = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE estado_produccion NOT IN ('ENTREGADA','PAUSADA')) AS activas,
      COUNT(*) FILTER (WHERE estado_produccion = 'LISTO_INSTALAR') AS listas_instalar,
      COUNT(*) FILTER (WHERE estado_produccion = 'INSTALADA') AS instaladas,
      COUNT(*) FILTER (WHERE estado_produccion = 'ENTREGADA' AND fecha_creacion >= $1) AS entregadas_mes,
      COUNT(*) FILTER (WHERE estado_facturacion = 'FACTURADA' AND fecha_creacion >= $1) AS facturadas_mes,
      COUNT(*) FILTER (WHERE es_no_conformidad = true AND estado_produccion NOT IN ('ENTREGADA','PAUSADA')) AS nc_abiertas,
      COUNT(*) FILTER (WHERE es_garantia = true AND estado_produccion NOT IN ('ENTREGADA','PAUSADA')) AS garantias_activas,
      COUNT(*) FILTER (WHERE estado_caja = 'PENDIENTE' AND estado_produccion NOT IN ('ENTREGADA','PAUSADA')) AS caja_pendiente
    FROM odp
  `, [primerDiaMes]);

  const r = resumen[0];
  console.log(`  ODPs activas en el sistema:        ${r.activas}`);
  console.log(`  Listas para instalar:              ${r.listas_instalar}`);
  console.log(`  Instaladas (en curso):             ${r.instaladas}`);
  console.log(`  Entregadas este mes:               ${r.entregadas_mes}`);
  console.log(`  Facturadas este mes:               ${r.facturadas_mes}`);
  console.log(`  NC abiertas:                       ${r.nc_abiertas}`);
  console.log(`  Garantías activas:                 ${r.garantias_activas}`);
  console.log(`  Pendientes de pago (caja):         ${r.caja_pendiente}`);
  console.log();

  // ─── 2. ODPs VENCIDAS (fecha_entrega < hoy, no entregadas) ───────────────
  console.log('════════════════════════════════════════════════════════');
  console.log('  2. ODPs VENCIDAS (fecha de entrega superada)');
  console.log('════════════════════════════════════════════════════════');

  const { rows: vencidas } = await client.query(`
    SELECT o.numero_odp, o.estado_produccion, o.estado_caja, o.fecha_entrega,
           c.nombre_razon_social AS cliente,
           u.nombre_completo AS asesor
    FROM odp o
    LEFT JOIN clientes c ON c.id = o.cliente_id
    LEFT JOIN usuarios u ON u.id = o.asesor_id
    WHERE o.fecha_entrega < CURRENT_DATE
      AND o.estado_produccion NOT IN ('ENTREGADA','PAUSADA')
    ORDER BY o.fecha_entrega ASC
  `);

  if (vencidas.length === 0) {
    console.log('  Sin ODPs vencidas.\n');
  } else {
    console.log(`  Total: ${vencidas.length} ODPs\n`);
    vencidas.forEach(o => {
      const diasVenc = Math.floor((hoy - new Date(o.fecha_entrega)) / 86400000);
      console.log(`  • ${o.numero_odp} | ${o.cliente}`);
      console.log(`    Asesor: ${o.asesor || '—'} | Estado prod: ${o.estado_produccion} | Caja: ${o.estado_caja}`);
      console.log(`    Fecha entrega: ${fmt(o.fecha_entrega)} (vencida hace ${diasVenc} días)`);
    });
    console.log();
  }

  // ─── 3. EN ESPERA DE PAGO ────────────────────────────────────────────────
  console.log('════════════════════════════════════════════════════════');
  console.log('  3. EN ESPERA DE PAGO (bloquean despacho)');
  console.log('════════════════════════════════════════════════════════');

  const { rows: esperaPago } = await client.query(`
    SELECT o.numero_odp, o.fecha_entrega, o.forma_pago, o.valor_total, o.abono,
           c.nombre_razon_social AS cliente,
           u.nombre_completo AS asesor
    FROM odp o
    LEFT JOIN clientes c ON c.id = o.cliente_id
    LEFT JOIN usuarios u ON u.id = o.asesor_id
    WHERE o.estado_produccion = 'LISTO_INSTALAR'
      AND o.estado_caja = 'PENDIENTE'
      AND o.es_garantia = false
      AND o.autorizacion_especial_despacho = false
    ORDER BY o.fecha_entrega ASC NULLS LAST
  `);

  if (esperaPago.length === 0) {
    console.log('  Sin ODPs en espera de pago.\n');
  } else {
    console.log(`  Total: ${esperaPago.length} ODPs\n`);
    esperaPago.forEach(o => {
      const saldo = (Number(o.valor_total) || 0) - (Number(o.abono) || 0);
      console.log(`  • ${o.numero_odp} | ${o.cliente}`);
      console.log(`    Asesor: ${o.asesor || '—'} | Forma pago: ${o.forma_pago || '—'}`);
      console.log(`    Valor: ${money(o.valor_total)} | Abono: ${money(o.abono)} | Saldo: ${money(saldo)}`);
      console.log(`    Fecha entrega: ${fmt(o.fecha_entrega)}`);
    });
    console.log();
  }

  // ─── 4. EN ESPERA DE PROGRAMACIÓN (pago OK, sin ruta) ───────────────────
  console.log('════════════════════════════════════════════════════════');
  console.log('  4. EN ESPERA DE PROGRAMACIÓN (pago OK, sin ruta)');
  console.log('════════════════════════════════════════════════════════');

  const { rows: esperaProg } = await client.query(`
    SELECT o.numero_odp, o.fecha_entrega, o.estado_caja, o.es_garantia,
           c.nombre_razon_social AS cliente,
           u.nombre_completo AS asesor
    FROM odp o
    LEFT JOIN clientes c ON c.id = o.cliente_id
    LEFT JOIN usuarios u ON u.id = o.asesor_id
    WHERE o.estado_produccion = 'LISTO_INSTALAR'
      AND (
        o.estado_caja IN ('CANCELADO','CREDITO_APROBADO')
        OR o.es_garantia = true
        OR o.autorizacion_especial_despacho = true
      )
      AND NOT EXISTS (
        SELECT 1 FROM ruta_odp ro
        JOIN rutas_instalacion ri ON ri.id = ro.ruta_id
        WHERE ro.odp_id = o.id AND ri.estado NOT IN ('completada','cancelada')
      )
    ORDER BY o.fecha_entrega ASC NULLS LAST
  `);

  if (esperaProg.length === 0) {
    console.log('  Sin ODPs esperando programación.\n');
  } else {
    console.log(`  Total: ${esperaProg.length} ODPs\n`);
    esperaProg.forEach(o => {
      console.log(`  • ${o.numero_odp} | ${o.cliente}`);
      console.log(`    Asesor: ${o.asesor || '—'} | Caja: ${o.estado_caja}${o.es_garantia ? ' | GARANTÍA' : ''}`);
      console.log(`    Fecha entrega: ${fmt(o.fecha_entrega)}`);
    });
    console.log();
  }

  // ─── 5. PRODUCCIÓN CRÍTICA ────────────────────────────────────────────────
  console.log('════════════════════════════════════════════════════════');
  console.log('  5. PRODUCCIÓN CRÍTICA (entrega ≤ 10 días, aún en producción)');
  console.log('════════════════════════════════════════════════════════');

  const { rows: critica } = await client.query(`
    SELECT o.numero_odp, o.estado_produccion, o.fecha_entrega,
           c.nombre_razon_social AS cliente,
           u.nombre_completo AS asesor
    FROM odp o
    LEFT JOIN clientes c ON c.id = o.cliente_id
    LEFT JOIN usuarios u ON u.id = o.asesor_id
    WHERE o.fecha_entrega BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '10 days'
      AND o.estado_produccion NOT IN ('LISTO_INSTALAR','PROGRAMADA','INSTALADA','ENTREGADA','PAUSADA','PAUSADA')
    ORDER BY o.fecha_entrega ASC
  `);

  if (critica.length === 0) {
    console.log('  Sin ODPs en producción crítica.\n');
  } else {
    console.log(`  Total: ${critica.length} ODPs\n`);
    critica.forEach(o => {
      const diasRestantes = Math.ceil((new Date(o.fecha_entrega) - hoy) / 86400000);
      console.log(`  • ${o.numero_odp} | ${o.cliente}`);
      console.log(`    Estado: ${o.estado_produccion} | Asesor: ${o.asesor || '—'}`);
      console.log(`    Entrega: ${fmt(o.fecha_entrega)} (en ${diasRestantes} día(s))`);
    });
    console.log();
  }

  // ─── 6. ÓRDENES SIN CULMINAR (por estado) ────────────────────────────────
  console.log('════════════════════════════════════════════════════════');
  console.log('  6. ÓRDENES SIN CULMINAR — Por estado de producción');
  console.log('════════════════════════════════════════════════════════');

  const { rows: porEstado } = await client.query(`
    SELECT estado_produccion, COUNT(*) AS total
    FROM odp
    WHERE estado_produccion NOT IN ('ENTREGADA','PAUSADA')
    GROUP BY estado_produccion
    ORDER BY total DESC
  `);

  porEstado.forEach(e => {
    console.log(`  ${e.estado_produccion.padEnd(30)} ${e.total} ODPs`);
  });
  console.log();

  // ─── 7. NO CONFORMIDADES ABIERTAS ────────────────────────────────────────
  console.log('════════════════════════════════════════════════════════');
  console.log('  7. NO CONFORMIDADES ABIERTAS');
  console.log('════════════════════════════════════════════════════════');

  const { rows: ncs } = await client.query(`
    SELECT nc.causa, nc.tipo_error, nc.fecha,
           o.numero_odp,
           c.nombre_razon_social AS cliente,
           u.nombre_completo AS reportado_por,
           odp_hija.numero_odp AS odp_nc
    FROM no_conformidades nc
    JOIN odp o ON o.id = nc.odp_id
    LEFT JOIN clientes c ON c.id = o.cliente_id
    LEFT JOIN usuarios u ON u.id = nc.usuario_reporta_id
    LEFT JOIN odp odp_hija ON nc.nueva_odp_id = odp_hija.id
    WHERE o.estado_produccion NOT IN ('ENTREGADA','PAUSADA')
    ORDER BY nc.fecha DESC
  `);

  if (ncs.length === 0) {
    console.log('  Sin NC abiertas.\n');
  } else {
    console.log(`  Total: ${ncs.length} NC\n`);
    ncs.forEach(n => {
      console.log(`  • ODP: ${n.numero_odp} | ${n.cliente}`);
      console.log(`    Tipo: ${n.tipo_defecto || '—'} | Reportada: ${fmt(n.fecha_reporte)} | Por: ${n.reportado_por || '—'}`);
      console.log(`    Descripción: ${n.descripcion || '—'}`);
      if (n.odp_nc) console.log(`    ODP NC generada: ${n.odp_nc}`);
    });
    console.log();
  }

  // ─── 8. GARANTÍAS ACTIVAS ─────────────────────────────────────────────────
  console.log('════════════════════════════════════════════════════════');
  console.log('  8. GARANTÍAS ACTIVAS');
  console.log('════════════════════════════════════════════════════════');

  const { rows: garantias } = await client.query(`
    SELECT o.numero_odp, o.estado_produccion, o.fecha_creacion, o.descripcion_pedido,
           c.nombre_razon_social AS cliente,
           u.nombre_completo AS asesor
    FROM odp o
    LEFT JOIN clientes c ON c.id = o.cliente_id
    LEFT JOIN usuarios u ON u.id = o.asesor_id
    WHERE o.es_garantia = true
      AND o.estado_produccion NOT IN ('ENTREGADA','PAUSADA')
    ORDER BY o.fecha_creacion DESC
  `);

  if (garantias.length === 0) {
    console.log('  Sin garantías activas.\n');
  } else {
    console.log(`  Total: ${garantias.length} garantías\n`);
    garantias.forEach(g => {
      console.log(`  • ${g.numero_odp} | ${g.cliente}`);
      console.log(`    Estado: ${g.estado_produccion} | Asesor: ${g.asesor || '—'}`);
      console.log(`    Fecha creación: ${fmt(g.fecha_creacion)}`);
      if (g.descripcion_pedido) console.log(`    Descripción: ${g.descripcion_pedido}`);
    });
    console.log();
  }

  // ─── 9. ASESORES Y METAS ─────────────────────────────────────────────────
  console.log('════════════════════════════════════════════════════════');
  console.log('  9. ASESORES Y METAS (mes en curso)');
  console.log('════════════════════════════════════════════════════════');

  const { rows: metas } = await client.query(`
    SELECT
      u.nombre_completo,
      COALESCE(mm.meta_valor, 0) AS meta,
      COUNT(o.id) FILTER (WHERE o.fecha_creacion >= $1) AS odps_creadas,
      COUNT(o.id) FILTER (WHERE o.estado_facturacion = 'FACTURADA' AND o.fecha_creacion >= $1) AS facturadas,
      COALESCE(SUM(o.valor_total) FILTER (WHERE o.estado_facturacion = 'FACTURADA' AND o.fecha_creacion >= $1), 0) AS valor_facturado
    FROM usuarios u
    LEFT JOIN odp o ON o.asesor_id = u.id
    LEFT JOIN metas_mensuales mm ON mm.usuario_id = u.id
      AND mm.mes = EXTRACT(MONTH FROM CURRENT_DATE)
      AND mm.año = EXTRACT(YEAR FROM CURRENT_DATE)
    WHERE u.rol IN ('asesor_comercial','admin','gerencia')
      AND u.activo = true
    GROUP BY u.id, u.nombre_completo, mm.meta_valor
    ORDER BY valor_facturado DESC
  `, [primerDiaMes]);

  if (metas.length === 0) {
    console.log('  Sin datos de asesores.\n');
  } else {
    metas.forEach(a => {
      const pct = a.meta > 0 ? Math.round((a.valor_facturado / a.meta) * 100) : 0;
      const barra = '█'.repeat(Math.min(Math.floor(pct/10), 10)) + '░'.repeat(Math.max(10 - Math.floor(pct/10), 0));
      console.log(`  ${a.nombre_completo}`);
      console.log(`    Meta: ${money(a.meta)} | Facturado: ${money(a.valor_facturado)} | Cumplimiento: ${pct}%`);
      console.log(`    [${barra}] | ODPs creadas: ${a.odps_creadas} | Facturadas: ${a.facturadas}`);
    });
    console.log();
  }

  // ─── 10. PARTE FINANCIERA ─────────────────────────────────────────────────
  console.log('════════════════════════════════════════════════════════');
  console.log('  10. PARTE FINANCIERA (mes en curso)');
  console.log('════════════════════════════════════════════════════════');

  const { rows: fin } = await client.query(`
    SELECT
      COALESCE(SUM(o.valor_total) FILTER (WHERE o.estado_facturacion = 'FACTURADA' AND o.fecha_creacion >= $1), 0) AS total_facturado,
      COALESCE(SUM(o.abono) FILTER (WHERE o.estado_caja IN ('ABONADO','CANCELADO') AND o.fecha_creacion >= $1), 0) AS total_cobrado,
      COALESCE(SUM(o.valor_total - COALESCE(o.abono,0)) FILTER (WHERE o.estado_caja = 'PENDIENTE' AND o.estado_produccion NOT IN ('ENTREGADA','PAUSADA')), 0) AS por_cobrar,
      COUNT(*) FILTER (WHERE o.estado_facturacion = 'FACTURADA' AND o.fecha_creacion >= $1) AS odps_facturadas,
      COUNT(*) FILTER (WHERE o.estado_caja = 'PENDIENTE' AND o.estado_produccion NOT IN ('ENTREGADA','PAUSADA')) AS odps_pendiente_caja
    FROM odp o
  `, [primerDiaMes]);

  const f = fin[0];
  console.log(`  Facturado este mes:                ${money(f.total_facturado)}`);
  console.log(`  Cobrado este mes:                  ${money(f.total_cobrado)}`);
  console.log(`  Por cobrar (cartera activa):       ${money(f.por_cobrar)}`);
  console.log(`  ODPs facturadas este mes:          ${f.odps_facturadas}`);
  console.log(`  ODPs pendientes de cobro:          ${f.odps_pendiente_caja}`);
  console.log();

  // pagos recientes
  const { rows: pagosRec } = await client.query(`
    SELECT p.monto, p.fecha_pago, p.concepto,
           o.numero_odp, c.nombre_razon_social AS cliente
    FROM pagos p
    JOIN odp o ON o.id = p.odp_id
    LEFT JOIN clientes c ON c.id = o.cliente_id
    WHERE p.fecha_pago >= $1
    ORDER BY p.fecha_pago DESC
    LIMIT 20
  `, [hace7dias]);

  if (pagosRec.length > 0) {
    console.log(`  Pagos recibidos últimos 7 días (${pagosRec.length}):`);
    pagosRec.forEach(p => {
      console.log(`    • ${p.numero_odp} | ${p.cliente} — ${money(p.monto)} — ${fmt(p.fecha_pago)}${p.concepto ? ' | ' + p.concepto : ''}`);
    });
    console.log();
  }

  // ─── 11. COMPRAS ─────────────────────────────────────────────────────────
  console.log('════════════════════════════════════════════════════════');
  console.log('  11. COMPRAS — SAPs sin ODC y ODCs pendientes de recepción');
  console.log('════════════════════════════════════════════════════════');

  const { rows: sapsSinOdc } = await client.query(`
    SELECT s.numero_sap, s.fecha_creacion,
           o.numero_odp, c.nombre_razon_social AS cliente
    FROM saps s
    JOIN odp o ON o.id = s.odp_id
    LEFT JOIN clientes c ON c.id = o.cliente_id
    WHERE NOT EXISTS (
      SELECT 1 FROM ordenes_compra oc WHERE oc.sap_id = s.id
    )
    ORDER BY s.fecha_creacion ASC
  `);

  if (sapsSinOdc.length > 0) {
    console.log(`  SAPs sin ODC generada: ${sapsSinOdc.length}`);
    sapsSinOdc.forEach(s => {
      console.log(`    • ${s.numero_sap} | ODP: ${s.numero_odp} | ${s.cliente} | Creado: ${fmt(s.fecha_creacion)}`);
    });
    console.log();
  } else {
    console.log('  Todos los SAPs tienen ODC generada.\n');
  }

  const { rows: odcsPend } = await client.query(`
    SELECT oc.numero_odc, oc.fecha_creacion, oc.proveedor, oc.tipo,
           COUNT(oi.id) FILTER (WHERE oi.recibido = false) AS items_pendientes
    FROM ordenes_compra oc
    LEFT JOIN odc_items oi ON oi.odc_id = oc.id
    WHERE oc.estado NOT IN ('recibida','cancelada')
    GROUP BY oc.id, oc.numero_odc, oc.fecha_creacion, oc.proveedor, oc.tipo
    HAVING COUNT(oi.id) FILTER (WHERE oi.recibido = false) > 0
    ORDER BY oc.fecha_creacion ASC
  `);

  if (odcsPend.length > 0) {
    console.log(`  ODCs pendientes de recepción: ${odcsPend.length}`);
    odcsPend.forEach(o => {
      console.log(`    • ${o.numero_odc} | ${o.proveedor || '—'} | Tipo: ${o.tipo} | Ítems pendientes: ${o.items_pendientes} | Emitida: ${fmt(o.fecha_creacion)}`);
    });
    console.log();
  } else {
    console.log('  Sin ODCs pendientes de recepción.\n');
  }

  console.log('════════════════════════════════════════════════════════');
  console.log('  FIN DEL REPORTE');
  console.log('════════════════════════════════════════════════════════\n');

  await client.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
