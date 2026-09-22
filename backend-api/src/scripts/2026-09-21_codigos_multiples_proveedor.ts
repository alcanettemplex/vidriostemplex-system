/**
 * Script: 2026-09-21_codigos_multiples_proveedor.ts
 *
 * Propósito: permitir que UN proveedor facture el mismo producto interno con
 *            VARIOS códigos distintos, de modo que cargar cualquiera de ellos
 *            actualice el precio y ninguno vuelva a caer en "Por Mapear".
 *
 * Origen (2026-09-21): GRUPO ROLDAN factura el sillar 7038 como `GRE701NG` en
 * septiembre y como `GRP701NG` en agosto. Al vincular el segundo, el
 * `findOrCreate` de `vincularPendiente` encontraba la fila ya existente y
 * descartaba el código nuevo en silencio (solo lo escribía si el campo estaba
 * vacío). El pendiente quedaba MAPEADO, la equivalencia conservaba el código
 * viejo y la siguiente factura con el código nuevo volvía a la bandeja: un
 * bucle de mapeo sin señal de error. Medidos en producción: 5 casos en ROLDAN
 * y 15 mapeos huérfanos repartidos en otros 5 proveedores.
 *
 *   1. Tabla `proveedor_producto_codigo` — N códigos por equivalencia.
 *   2. Backfill: un código principal por cada equivalencia que hoy tiene uno.
 *   3. Rescate: los MAPEADO sin equivalencia que los declare vuelven a PENDIENTE.
 *
 * `proveedor_producto.codigo_proveedor` NO se elimina: queda como copia de
 * lectura del código principal (lo consultan los dos buscadores, el comparador,
 * tres listados y el frontend). La tabla nueva es la fuente de verdad.
 *
 * Ejecutar: npx ts-node src/scripts/2026-09-21_codigos_multiples_proveedor.ts
 * Idempotente: usa IF NOT EXISTS / ON CONFLICT DO NOTHING. Puede repetirse.
 */

import sequelize from '../config/database';

async function run() {
  console.log('=== Códigos múltiples por proveedor — 2026-09-21 ===\n');

  // ─── 1. Tabla ───────────────────────────────────────────────────────────────
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS proveedor_producto_codigo (
      id                    SERIAL PRIMARY KEY,
      proveedor_producto_id INTEGER      NOT NULL REFERENCES proveedor_producto(id) ON DELETE CASCADE,
      proveedor_id          INTEGER      NOT NULL REFERENCES proveedores(id),
      codigo_proveedor      VARCHAR(100) NOT NULL,
      descripcion_proveedor TEXT,
      principal             BOOLEAN      NOT NULL DEFAULT false,
      origen                VARCHAR(20)  NOT NULL DEFAULT 'MANUAL',
      fecha_alta            TIMESTAMPTZ  DEFAULT NOW(),
      CONSTRAINT uq_ppc_codigo UNIQUE (proveedor_producto_id, codigo_proveedor)
    );
  `);
  console.log('  ✔ Tabla proveedor_producto_codigo');

  // La UNIQUE es por equivalencia y NO por (proveedor, código): el proveedor 1029
  // factura `3`, `11` y `32` en dos modalidades del mismo producto (UNIDAD y M2),
  // que son dos filas distintas de proveedor_producto. Que un código apunte a dos
  // PRODUCTOS distintos sí es un error, pero se valida en aplicación para poder
  // explicarlo con un mensaje legible en vez de reventar con un 500 de constraint.
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_ppc_lookup
      ON proveedor_producto_codigo (proveedor_id, codigo_proveedor);
  `);
  console.log('  ✔ Índice idx_ppc_lookup (consulta caliente de la ingesta)\n');

  // ─── 2. Backfill ────────────────────────────────────────────────────────────
  const [pendientesBackfill]: any = await sequelize.query(`
    SELECT COUNT(*)::int AS n
    FROM proveedor_producto pp
    WHERE pp.codigo_proveedor IS NOT NULL AND TRIM(pp.codigo_proveedor) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM proveedor_producto_codigo c WHERE c.proveedor_producto_id = pp.id
      );
  `);
  console.log(`  Equivalencias con código y sin fila en la tabla nueva: ${pendientesBackfill[0].n}`);

  await sequelize.query(`
    INSERT INTO proveedor_producto_codigo
      (proveedor_producto_id, proveedor_id, codigo_proveedor, descripcion_proveedor, principal, origen)
    SELECT pp.id, pp.proveedor_id, UPPER(TRIM(pp.codigo_proveedor)), pp.descripcion_proveedor, true, 'BACKFILL'
    FROM proveedor_producto pp
    WHERE pp.codigo_proveedor IS NOT NULL AND TRIM(pp.codigo_proveedor) <> ''
    ON CONFLICT (proveedor_producto_id, codigo_proveedor) DO NOTHING;
  `);

  const [resumen]: any = await sequelize.query(`
    SELECT
      (SELECT COUNT(*)::int FROM proveedor_producto_codigo) AS codigos,
      (SELECT COUNT(*)::int FROM proveedor_producto_codigo WHERE principal) AS principales,
      (SELECT COUNT(DISTINCT proveedor_producto_id)::int FROM proveedor_producto_codigo) AS equivalencias,
      (SELECT COUNT(*)::int FROM proveedor_producto
         WHERE codigo_proveedor IS NOT NULL AND TRIM(codigo_proveedor) <> '') AS pp_con_codigo;
  `);
  const r = resumen[0];
  console.log(`  ✔ Backfill: ${r.codigos} código(s) sobre ${r.equivalencias} equivalencia(s)`);
  console.log(`    Principales: ${r.principales} · Equivalencias con código en pp: ${r.pp_con_codigo}`);
  if (r.principales !== r.equivalencias) {
    console.log('    ⚠️  Hay equivalencias sin principal — revisar antes de continuar');
  }

  // Normalizar la copia de lectura: el backfill guarda en mayúsculas y sin espacios,
  // y las dos columnas tienen que decir exactamente lo mismo o el lookup y el
  // listado mostrarán cosas distintas para la misma fila.
  const [, metaNorm]: any = await sequelize.query(`
    UPDATE proveedor_producto pp
    SET codigo_proveedor = c.codigo_proveedor
    FROM proveedor_producto_codigo c
    WHERE c.proveedor_producto_id = pp.id AND c.principal
      AND pp.codigo_proveedor IS DISTINCT FROM c.codigo_proveedor;
  `);
  console.log(`  ✔ Código principal sincronizado en proveedor_producto (${metaNorm?.rowCount ?? 0} fila(s))\n`);

  // ─── 3. Rescate de mapeos huérfanos ─────────────────────────────────────────
  // Códigos marcados MAPEADO que ninguna equivalencia activa declara: son las
  // víctimas del bug (y de desvinculaciones antiguas). La bandeja no guarda a qué
  // producto se vincularon, así que no se pueden reparar solos — vuelven a
  // PENDIENTE para que un humano los re-mapee. Ahora el re-mapeo sí agrega el
  // código en vez de descartarlo.
  const [huerfanos]: any = await sequelize.query(`
    SELECT cpd.id, cpd.codigo_proveedor, cpd.descripcion_proveedor, p.nombre_comercial
    FROM proveedor_codigo_pendiente cpd
    JOIN proveedores p ON p.id = cpd.proveedor_id
    WHERE cpd.estado = 'MAPEADO'
      AND NOT EXISTS (
        SELECT 1
        FROM proveedor_producto_codigo c
        JOIN proveedor_producto pp ON pp.id = c.proveedor_producto_id AND pp.activo
        WHERE c.proveedor_id = cpd.proveedor_id
          AND c.codigo_proveedor = UPPER(TRIM(cpd.codigo_proveedor))
      )
    ORDER BY p.nombre_comercial, cpd.codigo_proveedor;
  `);

  console.log(`  Mapeos huérfanos detectados: ${huerfanos.length}`);
  for (const h of huerfanos) {
    console.log(`    · ${h.codigo_proveedor} — ${h.descripcion_proveedor ?? 's/d'} (${h.nombre_comercial})`);
  }

  if (huerfanos.length > 0) {
    await sequelize.query(
      `UPDATE proveedor_codigo_pendiente SET estado = 'PENDIENTE' WHERE id IN (:ids)`,
      { replacements: { ids: huerfanos.map((h: any) => h.id) } }
    );
    console.log(`  ✔ ${huerfanos.length} código(s) devuelto(s) a PENDIENTE para re-mapear\n`);
  } else {
    console.log('  ✔ Sin huérfanos que rescatar\n');
  }

  // ─── 4. Verificación ────────────────────────────────────────────────────────
  const [sinPrincipal]: any = await sequelize.query(`
    SELECT COUNT(*)::int AS n FROM (
      SELECT proveedor_producto_id
      FROM proveedor_producto_codigo
      GROUP BY proveedor_producto_id
      HAVING COUNT(*) FILTER (WHERE principal) <> 1
    ) x;
  `);
  const [desalineados]: any = await sequelize.query(`
    SELECT COUNT(*)::int AS n
    FROM proveedor_producto pp
    JOIN proveedor_producto_codigo c ON c.proveedor_producto_id = pp.id AND c.principal
    WHERE pp.codigo_proveedor IS DISTINCT FROM c.codigo_proveedor;
  `);
  console.log('=== Verificación ===');
  console.log(`  Equivalencias sin exactamente un principal: ${sinPrincipal[0].n} (debe ser 0)`);
  console.log(`  Copias de lectura desalineadas: ${desalineados[0].n} (debe ser 0)`);

  console.log('\n=== Listo ===');
}

run()
  .then(async () => {
    // Los hooks de auditoría son fire-and-forget: cerrar la conexión de inmediato
    // puede cortar su INSERT a medias.
    await new Promise((r) => setTimeout(r, 1500));
    await sequelize.close();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('\n❌ Error:', err.message);
    await sequelize.close();
    process.exit(1);
  });
