/**
 * Script: 2026-09-14_cotizador_recosteo_retroactivo_proveedor.ts
 *
 * SOLO INFORME — no aplica ningún cambio. Para los productos del Cotizador
 * que ya quedaron vinculados a catalogo_productos (backfill de
 * 2026-09-14_cotizador_vinculo_catalogo_maestro.ts) y cuyo producto YA tiene
 * un precio de proveedor real capturado, muestra cuánto cambiaría el costo y
 * el precio de venta si se reemplazara el valor puesto a mano por el taller
 * por el costo derivado de Proveedores.
 *
 * Reusa recalcularCostoDesdeProveedor() con { dryRun: true } — no reimplementa
 * el cálculo: la función abre su transacción real, escribe, y hace ROLLBACK en
 * vez de COMMIT, así que el informe es exactamente lo que pasaría si se
 * aplicara, sin dejar rastro en la BD.
 *
 * El usuario pidió explícitamente (2026-09-14) SOLO el informe por ahora — si
 * más adelante decide aplicarlo, agregar el modo --aplicar es una línea de
 * código (quitar el rollback condicional), no un rediseño.
 *
 * Uso:
 *   npx ts-node src/scripts/2026-09-14_cotizador_recosteo_retroactivo_proveedor.ts
 */
import { Op } from 'sequelize';
import { sequelize, CotizadorProducto } from '../models';
import * as cache from '../cotizador/cache';
import { recalcularCostoDesdeProveedor } from '../cotizador/lib/sincronizacionProveedores';

async function main(): Promise<void> {
  await sequelize.authenticate();
  console.log('Conexión OK');

  // recalcularCostoDesdeProveedor() consulta la caché del Cotizador
  // (getProducto) para saber si un código está dado de baja. Fuera del
  // proceso del backend (que la precarga al boot en server.ts) hay que
  // precargarla a mano, mismo patrón que 2026-09-09_verificar_cache_cotizador.ts.
  console.log('Precargando caché del Cotizador...');
  await cache.precargar();
  console.log('Caché lista\n');

  const productos = await CotizadorProducto.findAll({
    where: { catalogo_producto_id: { [Op.ne]: null } },
    attributes: ['codigo', 'catalogo_producto_id'],
  });

  const idsUnicos = [...new Set(productos.map((p) => p.get('catalogo_producto_id') as number))];
  console.log(`${productos.length} producto(s) del Cotizador vinculados a ${idsUnicos.length} catalogo_producto_id distintos\n`);

  let totalCambiarian = 0;
  let totalOmitidos = 0;
  let totalSinProveedor = 0;

  for (const id of idsUnicos) {
    const resultado = await recalcularCostoDesdeProveedor(id, { dryRun: true });
    if (!resultado) continue; // no debería pasar: venimos de productos ya vinculados a este id

    if (!resultado.proveedorElegido) {
      totalSinProveedor += resultado.omitidos.length;
      continue;
    }

    for (const c of resultado.cambios) {
      totalCambiarian++;
      console.log(
        `${c.codigo} [${c.categoria}] costo ${c.antes.costo_unitario} → ${c.despues.costo_unitario} | ` +
          `PA ${c.antes.precio_pa} → ${c.despues.precio_pa} | PM ${c.antes.precio_pm} → ${c.despues.precio_pm} | ` +
          `PB ${c.antes.precio_pb} → ${c.despues.precio_pb} | proveedor: ${resultado.proveedorElegido.nombre} ($${resultado.proveedorElegido.precio})`
      );
    }
    for (const o of resultado.omitidos) {
      totalOmitidos++;
      console.log(`${o.codigo} — SIN CAMBIO (${o.motivo})`);
    }
  }

  console.log('\n--- Resumen ---');
  console.log(`Cambiarían: ${totalCambiarian}`);
  console.log(`Sin cambio (mismo costo, o sin multiplicador de categoría, o dado de baja): ${totalOmitidos}`);
  console.log(`Sin proveedor activo con precio: ${totalSinProveedor}`);
  console.log(`\nEste script NO aplicó ningún cambio — es solo informe (dry-run).`);

  await sequelize.close();
}

main().catch(async (err) => {
  console.error('\nEl script terminó con error:', err);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
