require('dotenv').config();
const { Sequelize } = require('sequelize');
const db = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { rejectUnauthorized: false } },
  logging: false
});

(async () => {
  const t = await db.transaction();
  try {
    await db.authenticate();

    // 1. Recuperar datos completos del audit log (solo el DELETE más reciente por consecutivo)
    const [auditRows] = await db.query(`
      SELECT DISTINCT ON ((datos_anteriores->>'consecutivo')::int)
             datos_anteriores, fecha
      FROM auditoria_log
      WHERE tabla = 'inventario_perfileria'
        AND operacion = 'DELETE'
        AND (datos_anteriores->>'consecutivo')::int IN (10600,10559,10497,10521,10472,10566,10635,10509,10343,10548)
      ORDER BY (datos_anteriores->>'consecutivo')::int, fecha DESC
    `, { transaction: t });

    console.log('Registros a restaurar: ' + auditRows.length);

    // 2. Insertar de vuelta en inventario_perfileria
    for (const row of auditRows) {
      const d = row.datos_anteriores;
      await db.query(`
        INSERT INTO inventario_perfileria (consecutivo, codigo, mm, ubicacion, fecha_corte, creado_en)
        VALUES (:consecutivo, :codigo, :mm, :ubicacion, :fecha_corte, NOW())
      `, {
        replacements: {
          consecutivo: d.consecutivo,
          codigo: d.codigo,
          mm: parseFloat(d.mm),
          ubicacion: d.ubicacion,
          fecha_corte: d.fecha_corte
        },
        transaction: t
      });
      console.log('  Restaurado #' + d.consecutivo + ' | ' + d.codigo + ' | ' + d.mm + 'mm | ' + d.ubicacion);
    }

    // 3. Limpiar exist_perf en los sap_items afectados
    const [update] = await db.query(`
      UPDATE sap_items
      SET exist_perf = NULL
      WHERE sap_id IN (149, 157, 165, 166, 162)
        AND exist_perf IS NOT NULL
    `, { transaction: t });
    console.log('\n  sap_items limpiados (exist_perf = NULL): ' + update.rowCount + ' filas');

    await t.commit();
    console.log('\nTransaccion confirmada.');

    // Verificacion
    const [invCheck] = await db.query(`
      SELECT consecutivo, codigo, mm, ubicacion, fecha_corte
      FROM inventario_perfileria
      WHERE consecutivo IN (10600,10559,10497,10521,10472,10566,10635,10509,10343,10548)
      ORDER BY consecutivo
    `);
    console.log('\nVerificacion inventario (' + invCheck.length + '/10):');
    invCheck.forEach(i => console.log('  #' + i.consecutivo + ' | ' + i.codigo + ' | ' + i.mm + 'mm | ' + i.ubicacion));

    const [sapCheck] = await db.query(`
      SELECT si.id, si.item, si.exist_perf, o.numero_odp
      FROM sap_items si
      JOIN sap s ON s.id = si.sap_id
      JOIN odp o ON o.id = s.odp_id
      WHERE si.sap_id IN (149, 157, 165, 166, 162)
        AND si.exist_perf IS NOT NULL
    `);
    console.log('\nsap_items con exist_perf aun != NULL: ' + sapCheck.length + ' (esperado: 0)');

  } catch(e) {
    await t.rollback();
    console.error('ROLLBACK:', e.message);
  } finally {
    await db.close();
  }
})();
