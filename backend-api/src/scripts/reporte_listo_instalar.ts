import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';

const run = async () => {
  await sequelize.authenticate();

  // Traer todas las ODPs en LISTO_INSTALAR con sus conteos de requerimientos
  const rows: any[] = await sequelize.query(`
    SELECT
      o.id,
      o.numero_odp,
      o.estado_produccion,
      o.sin_items,
      o.tiene_aluminio,
      o.matizado,
      o.pelicula,
      o.huacal,
      o.carton,
      o.chk_medicion,
      o.chk_corte,
      o.chk_vidrio,
      o.chk_accesorios,
      o.chk_ensamble,
      o.chk_matizado,
      o.chk_pelicula,
      o.chk_huacal,
      o.chk_carton,
      o.instalacion,
      o.acarreo,
      o.forma_pago,
      o.estado_caja,
      c.nombre_razon_social AS cliente,
      u.nombre_completo    AS asesor,
      (SELECT COUNT(*) FROM toma_medidas tm WHERE tm.odp_id = o.id) AS tm_count,
      (SELECT COUNT(*) FROM sap s WHERE s.odp_id = o.id)             AS sap_count,
      (SELECT COUNT(*) FROM odp_items oi WHERE oi.odp_id = o.id)    AS item_count
    FROM odp o
    JOIN clientes  c ON c.id = o.cliente_id
    JOIN usuarios  u ON u.id = o.asesor_id
    WHERE o.estado_produccion = 'LISTO_INSTALAR'
    ORDER BY o.numero_odp
  `, { type: QueryTypes.SELECT });

  console.log(`\n${'─'.repeat(90)}`);
  console.log(`  REPORTE — ODPs en LISTO_INSTALAR  (total: ${rows.length})`);
  console.log(`${'─'.repeat(90)}\n`);

  let correctas = 0;
  let inconsistentes = 0;

  for (const o of rows) {
    const tmCount   = Number(o.tm_count);
    const sapCount  = Number(o.sap_count);
    const itemCount = Number(o.item_count);

    // Requerimientos que aplican
    const req: { label: string; necesita: boolean; hecho: boolean }[] = [
      { label: 'Medición',   necesita: tmCount > 0,            hecho: !!o.chk_medicion },
      { label: 'Corte',      necesita: !!o.tiene_aluminio,     hecho: !!o.chk_corte },
      { label: 'Vidrio',     necesita: itemCount > 0,          hecho: !!o.chk_vidrio },
      { label: 'Accesorios', necesita: sapCount > 0,           hecho: !!o.chk_accesorios },
      { label: 'Ensamble',   necesita: !!o.tiene_aluminio,     hecho: !!o.chk_ensamble },
      { label: 'Matizado',   necesita: !!o.matizado,           hecho: !!o.chk_matizado },
      { label: 'Película',   necesita: !!o.pelicula,           hecho: !!o.chk_pelicula },
      { label: 'Huacal',     necesita: !!o.huacal,             hecho: !!o.chk_huacal },
      { label: 'Cartón',     necesita: !!o.carton,             hecho: !!o.chk_carton },
    ];

    const aplicables  = req.filter(r => r.necesita);
    const pendientes  = aplicables.filter(r => !r.hecho);
    const sinReqs     = aplicables.length === 0;
    const tieneProblema = pendientes.length > 0 || sinReqs;

    if (tieneProblema) {
      inconsistentes++;
      console.log(`⚠️  ${o.numero_odp.padEnd(12)} | ${o.cliente.slice(0,30).padEnd(30)} | Asesor: ${o.asesor.slice(0,20)}`);
      if (sinReqs) {
        console.log(`   ↳ SIN REQUERIMIENTOS — llegó a LISTO_INSTALAR sin ningún chk aplicable`);
        console.log(`     sin_items=${o.sin_items} | instalacion=${o.instalacion} | acarreo=${o.acarreo}`);
      } else {
        console.log(`   ↳ Requerimientos PENDIENTES: ${pendientes.map(r => r.label).join(', ')}`);
        console.log(`     TMs=${tmCount} | Items=${itemCount} | SAPs=${sapCount} | aluminio=${o.tiene_aluminio}`);
      }
      console.log(`     Pago: ${o.forma_pago || '-'} | Caja: ${o.estado_caja}`);
      console.log('');
    } else {
      correctas++;
    }
  }

  console.log(`${'─'.repeat(90)}`);
  console.log(`  ✅ Correctas (todos los chk completados):  ${correctas}`);
  console.log(`  ⚠️  Inconsistentes (chk pendientes o sin reqs): ${inconsistentes}`);
  console.log(`${'─'.repeat(90)}\n`);

  await sequelize.close();
};

run().catch(e => { console.error(e); process.exit(1); });
