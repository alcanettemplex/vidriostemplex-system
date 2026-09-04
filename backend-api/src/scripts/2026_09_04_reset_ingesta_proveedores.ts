/**
 * Reset total del módulo Proveedores (2026-09-04).
 *
 * Motivo: el parser DIAN dividía el precio unitario entre `cbc:BaseQuantity` siempre
 * que fuera > 1, y los emisores que repiten ahí la cantidad facturada quedaron con el
 * precio dividido entre la cantidad (HI-TECH FILMS FED-3171: $52.184,88 → $23.720,40).
 * No hay forma de detectar a posteriori qué filas están mal, porque el histórico no
 * guarda ni la cantidad ni el total de línea: solo el resultado. Por eso se borra y se
 * recarga desde los .zip originales, ya con el parser corregido.
 *
 * ORDEN OBLIGATORIO: (1) fix del parser desplegado, (2) este script, (3) recarga.
 * Ejecutarlo antes del fix repite el daño.
 *
 * Qué borra:
 *   · proveedor_producto_precio   — todo el histórico de precios
 *   · proveedor_producto          — todas las equivalencias (mapeos)
 *   · proveedor_codigo_pendiente  — la bandeja Por Mapear
 *   · producto_alias              — los sinónimos aprendidos
 *   · factura_proveedor_procesada — la bitácora, que es la que libera los CUFE
 *   · proveedores con origen_registro = 'INGESTA_FE' — los recrea la recarga
 *
 * Qué NO borra:
 *   · catalogo_productos — es el catálogo interno (tab ROOT), no salió de facturas
 *   · proveedores MANUAL / IMPORTACION_WO — tienen contacto y datos tecleados a mano
 *     que ninguna recarga reconstruye.
 *
 * Estado en que quedan los proveedores que sobreviven:
 *   · Los que YA demostraron interés —tienen equivalencias mapeadas a mano, o
 *     facturas suyas que se procesaron sin omitir— quedan en seguir_precios = true.
 *     Esa señal se calcula ANTES del truncate, que es justo lo que la borra: sin
 *     rescatarla, los 972 proveedores de World Office quedarían en el limbo y ni
 *     Vitelsa ni Templacol procesarían un precio hasta aprobarlos uno por uno.
 *   · El resto queda en NULL (sin decidir): entran al flujo de aprobación nuevo.
 *
 * Uso:
 *   npx ts-node backend-api/src/scripts/2026_09_04_reset_ingesta_proveedores.ts
 *      → solo informa (dry-run). No escribe nada.
 *   npx ts-node backend-api/src/scripts/2026_09_04_reset_ingesta_proveedores.ts --ejecutar
 *      → borra. Irreversible. Exige backup previo desde /root → Backup.
 */
import sequelize from '../config/database';

const EJECUTAR = process.argv.includes('--ejecutar');

const TABLAS = [
  'proveedor_producto_precio',
  'proveedor_producto',
  'proveedor_codigo_pendiente',
  'producto_alias',
  'factura_proveedor_procesada',
];

async function contar(sql: string): Promise<number> {
  const [filas]: any = await sequelize.query(sql);
  return Number(filas[0]?.total ?? 0);
}

/**
 * Proveedores que sobreviven al reset conservando `seguir_precios = true`.
 *
 * La única señal admitida es **tener equivalencias mapeadas**: ahí un humano abrió el
 * modal y confirmó que ese código del proveedor es tal producto del catálogo.
 *
 * Se descartó la señal "tiene facturas procesadas" tras verla en el dry-run: como
 * hasta hoy TODO emisor nacía seguido, esa condición rescataba a Éxito, Postobón, la
 * gasolinera y el parqueadero — exactamente el ruido que este cambio busca eliminar.
 * El resto de emisores se decide en la pantalla de carga, con los nombres delante.
 *
 * Los INGESTA_FE quedan fuera porque se borran y los recrea la recarga, ya bajo el
 * flujo de aprobación nuevo.
 */
async function proveedoresDemostrados(): Promise<Array<{ id: number; nombre: string; origen: string; motivo: string }>> {
  const [filas]: any = await sequelize.query(`
    SELECT p.id,
           p.nombre_comercial AS nombre,
           p.origen_registro  AS origen,
           'tiene equivalencias mapeadas' AS motivo
      FROM proveedores p
     WHERE p.origen_registro <> 'INGESTA_FE'
       AND EXISTS (SELECT 1 FROM proveedor_producto pp WHERE pp.proveedor_id = p.id)
     ORDER BY p.nombre_comercial
  `);
  return filas;
}

async function inventario() {
  const conteos: Record<string, number> = {};
  for (const tabla of TABLAS) {
    conteos[tabla] = await contar(`SELECT COUNT(*)::int AS total FROM ${tabla}`);
  }

  const [porOrigen]: any = await sequelize.query(
    `SELECT COALESCE(origen_registro, 'SIN_ORIGEN') AS origen, COUNT(*)::int AS total
       FROM proveedores GROUP BY 1 ORDER BY 2 DESC`
  );

  const preciosPorOrigen = await sequelize.query(
    `SELECT origen, COUNT(*)::int AS total
       FROM proveedor_producto_precio GROUP BY 1 ORDER BY 2 DESC`
  );

  return { conteos, porOrigen, preciosPorOrigen: preciosPorOrigen[0] as any[] };
}

function imprimirInventario(inv: Awaited<ReturnType<typeof inventario>>) {
  console.log('\n── Inventario actual ───────────────────────────────────────────');
  for (const tabla of TABLAS) {
    console.log(`   ${tabla.padEnd(30)} ${String(inv.conteos[tabla]).padStart(7)} fila(s)`);
  }

  console.log('\n── Histórico de precios por origen ─────────────────────────────');
  if (inv.preciosPorOrigen.length === 0) console.log('   (vacío)');
  for (const fila of inv.preciosPorOrigen) {
    console.log(`   ${String(fila.origen).padEnd(30)} ${String(fila.total).padStart(7)}`);
  }

  console.log('\n── Proveedores por origen de registro ──────────────────────────');
  for (const fila of inv.porOrigen) {
    const destino = fila.origen === 'INGESTA_FE' ? 'SE BORRAN (los recrea la recarga)' : 'se conservan → sin decidir';
    console.log(`   ${String(fila.origen).padEnd(20)} ${String(fila.total).padStart(5)}   ${destino}`);
  }

  console.log('\n── Lo que cuesta ───────────────────────────────────────────────');
  console.log(`   Se pierden ${inv.conteos['proveedor_producto']} equivalencia(s) y ${inv.conteos['producto_alias']} alias.`);
  console.log('   Tras recargar, cada código vuelve a la bandeja y hay que vincularlo a mano.');
}

async function main() {
  const antes = await inventario();
  imprimirInventario(antes);

  // Se calcula ANTES de tocar nada: el truncate borra justamente la evidencia.
  const demostrados = await proveedoresDemostrados();

  console.log('\n── Quedan en "siguiendo" (ya demostraron interés) ──────────────');
  if (demostrados.length === 0) {
    console.log('   (ninguno)');
  } else {
    for (const p of demostrados) {
      console.log(`   ${String(p.nombre).slice(0, 44).padEnd(46)} ${p.motivo}`);
    }
  }
  console.log(`\n   Los otros ${antes.porOrigen.reduce((s: number, f: any) => s + (f.origen === 'INGESTA_FE' ? 0 : f.total), 0) - demostrados.length} proveedores quedan "sin decidir".`);

  if (!EJECUTAR) {
    console.log('\n>>> DRY-RUN: no se tocó nada.');
    console.log('>>> Para borrar de verdad, primero baja el backup en /root → Backup y luego corre');
    console.log('>>> este mismo comando agregando  --ejecutar\n');
    await sequelize.close();
    return;
  }

  console.log('\n>>> EJECUTANDO EL BORRADO...\n');

  const t = await sequelize.transaction();
  try {
    // Un solo TRUNCATE con todas las tablas: Postgres exige incluir en la misma
    // sentencia a las que referencian a las truncadas (proveedor_producto_precio
    // apunta a proveedor_producto), y así no hace falta CASCADE.
    await sequelize.query(
      `TRUNCATE TABLE ${TABLAS.join(', ')} RESTART IDENTITY`,
      { transaction: t }
    );

    const [, metaBorrados]: any = await sequelize.query(
      `DELETE FROM proveedores WHERE origen_registro = 'INGESTA_FE'`,
      { transaction: t }
    );

    const idsDemostrados = demostrados.map((p) => p.id);

    const [, metaReset]: any = await sequelize.query(
      idsDemostrados.length > 0
        ? `UPDATE proveedores SET seguir_precios = NULL WHERE id NOT IN (${idsDemostrados.join(',')})`
        : `UPDATE proveedores SET seguir_precios = NULL`,
      { transaction: t }
    );

    let metaSeguidos: any = null;
    if (idsDemostrados.length > 0) {
      [, metaSeguidos] = await sequelize.query(
        `UPDATE proveedores SET seguir_precios = true WHERE id IN (${idsDemostrados.join(',')})`,
        { transaction: t }
      );
    }

    await t.commit();

    console.log(`   Proveedores INGESTA_FE eliminados : ${metaBorrados?.rowCount ?? 0}`);
    console.log(`   Proveedores dejados sin decidir   : ${metaReset?.rowCount ?? 0}`);
    console.log(`   Proveedores conservados siguiendo : ${metaSeguidos?.rowCount ?? 0}`);
  } catch (err) {
    await t.rollback();
    throw err;
  }

  const despues = await inventario();
  console.log('\n── Estado final ────────────────────────────────────────────────');
  for (const tabla of TABLAS) {
    console.log(`   ${tabla.padEnd(30)} ${String(despues.conteos[tabla]).padStart(7)} fila(s)`);
  }

  console.log('\nListo. Ahora vuelve a subir los .zip desde /proveedores → Cargar Facturas.\n');
  await sequelize.close();
}

main().catch(async (err) => {
  console.error('\nFalló el reset:', err);
  await sequelize.close().catch(() => undefined);
  process.exit(1);
});
