// Recalcula el costo de TODOS los productos del Cotizador vinculados a
// Proveedores con la regla nueva (decisión del usuario, 2026-09-28): gana el
// proveedor de costo normalizado MÁS ALTO entre los precios de los últimos 6
// meses (ver `elegirCandidato` en `cotizador/lib/sincronizacionProveedores.ts`).
//
// Hace falta porque:
//   - hasta ese día ganaba el más barato, y el motor sólo recalcula un producto
//     cuando se mueve un precio de su proveedor;
//   - un mapeo NUEVO desde "Por Mapear" nunca disparaba el recálculo (bug
//     corregido en el mismo cambio), así que 19 mapeos de ese día y varios
//     anteriores quedaron sin llegar al Cotizador.
// El usuario aprobó aplicar los 26 cambios de la previsualización, incluidos
// BPB05/BPB10 ($2.200 → $17.000, VITELSA), cuyo mapeo conviene revisar.
//
// Reusa `recalcularCostosDesdeProveedor` (el motor real, deja historial con
// `por = 'sync-proveedores'`). Un override de precio (hoy ES0001) sigue
// ganando en la caché: aquí sólo se mueve la tabla base.
//
// ⚠️ Correrlo DESPUÉS de desplegar el backend con la regla nueva: el backend
// viejo recalcula con "el más barato" cada vez que llega una factura. Es
// idempotente: si se corrió antes, volver a correrlo tras el despliegue corrige
// lo que el backend viejo haya movido.
//
// Por defecto sólo previsualiza; `--aplicar` escribe. NO se ejecuta con
// `npm run dev`. Después, recargar la caché del Cotizador
// (POST /api/cotizador/recargar) o reiniciar el backend:
//   npx ts-node --files src/scripts/2026-09-28_cotizador_recalculo_precio_mas_alto.ts [--aplicar]
import { QueryTypes } from 'sequelize';
import { sequelize } from '../models';
import { precargar } from '../cotizador/cache';
import { recalcularCostosDesdeProveedor } from '../cotizador/lib/sincronizacionProveedores';

const APLICAR = process.argv.includes('--aplicar');
const pct = (antes: number, despues: number) => (antes > 0 ? `${((despues / antes - 1) * 100).toFixed(1)} %` : 'n/d');

async function main() {
  // `recalcularCostosDesdeProveedor` lee la caché (getProducto) para respetar
  // los productos dados de baja.
  await precargar();

  const filas = await sequelize.query<{ id: number }>(
    `SELECT DISTINCT cp.catalogo_producto_id AS id
       FROM cotizador.producto cp
       JOIN proveedor_producto pp ON pp.catalogo_producto_id = cp.catalogo_producto_id
      WHERE pp.activo`,
    { type: QueryTypes.SELECT }
  );
  const ids = filas.map((f) => Number(f.id));

  const resultados = await recalcularCostosDesdeProveedor(ids, { dryRun: !APLICAR });
  const cambios = resultados.flatMap((r) =>
    r.cambios.map((c) => ({
      codigo: c.codigo,
      proveedor: r.proveedorElegido?.nombre ?? '',
      costo_antes: c.antes.costo_unitario,
      costo_despues: c.despues.costo_unitario,
      variacion: pct(c.antes.costo_unitario, c.despues.costo_unitario),
      pa_despues: c.despues.precio_pa,
    }))
  );
  const omitidos = resultados.flatMap((r) => r.omitidos);

  console.log(`Productos del maestro vinculados: ${ids.length} · con cambio de costo: ${cambios.length} · omitidos: ${omitidos.length}`);
  console.table(cambios);
  if (omitidos.length) console.table(omitidos);
  console.log(
    APLICAR
      ? 'Aplicado (historial con por = sync-proveedores). Recargar la caché del Cotizador o reiniciar el backend.'
      : 'Simulación: no se escribió nada. Correr con --aplicar para escribir.'
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => sequelize.close(), 1500));
