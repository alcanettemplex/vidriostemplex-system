/**
 * Script: 2026-09-17_cotizador_multiplicadores_y_unidades.ts
 *
 * Consolida el motor de precios del Cotizador. Tres pasos, en este orden:
 *
 *   1. CORRIGE `proveedor_producto.unidad_compra` en 3 filas donde el dato es
 *      demostrablemente falso (la propia descripción del proveedor lo delata):
 *        · TSL0101 "TIRADERA SERIE LAGUNA" — el proveedor la describe como
 *          "Inox Manija redonda 48mm x 57mm pasante". Una manija no se vende en
 *          barras de 6 m: TIRA_6M -> UNIDAD. El motor dividía entre 6 y sacaba
 *          $5.282 en vez de $31.690 — era el origen del "-73 %" que se detectó
 *          el 2026-09-16 y quedó sin explicar.
 *        · ZSE0104 "ZOCALO 9CM" — registrado a $91.680,67 por METRO, pero
 *          91.680,67 / 6 = 15.280 ≈ el costo actual (16.333). Es el precio de
 *          una tira de 6 m puesto como metro: METRO -> TIRA_6M.
 *        · BPB04 "BORDE PULIDO BRILLADO" — un borde se cobra por metro lineal,
 *          no por m²: M2 -> METRO. ⚠️ Esta corrección NO cambia el costo: el
 *          motor sólo divide cuando la unidad es TIRA_6M, y METRO y M2 pasan
 *          igual. Es higiene del dato; el +100 % de este producto es una
 *          diferencia de precio real, pendiente de revisar con el proveedor.
 *
 *   2. SIEMBRA los 4 multiplicadores costo->precio de venta, a los 6 decimales
 *      OBSERVADOS en los productos ya cargados — no a los 3 de la tabla que
 *      pasó el usuario, que son el mismo número redondeado. Usar 3 decimales
 *      reescribiría 49 precios de ACCESORIO (hasta $200,72 de diferencia) por
 *      puro ruido de redondeo. Cobertura del valor observado: ACABADO 12/14,
 *      VIDRIO 35/37, ACCESORIO 166/169, PERFILERIA 221/363.
 *
 *   3. RECALCULA los productos costeables de las 4 categorías, EXCLUYENDO dos
 *      que no se pueden costear hoy:
 *        · TEN0101 "TENSORES" (catalogo_producto_id 989) — el Cotizador vende
 *          un tensor por unidad; el proveedor vende varilla roscada por metro.
 *          Las dos unidades son correctas: falta el factor de consumo (cuántos
 *          metros lleva un tensor), que es lista de materiales, no unidad.
 *        · BOQN03 (catalogo_producto_id 1308) — Cotizador "BOQUETE TAQUILLA",
 *          maestro "BOQUETE ESPECIAL PERIMETRAL", proveedor "BOQUETE MICKEY
 *          MOUSE". Son tres cosas distintas: el mapeo está mal, y no está claro
 *          de qué lado (si el vínculo del Cotizador al maestro, o la fila del
 *          proveedor). Decisión pendiente del usuario.
 *      ⚠️ La exclusión es SÓLO de esta corrida. Ninguno de los dos queda
 *      marcado en la BD, así que la sincronización automática puede moverlos
 *      en la próxima factura que cargue Compras. Resolver el mapeo sigue
 *      pendiente.
 *
 * Decisiones del usuario que este script materializa (2026-09-17):
 *   - 6 decimales observados en vez de los 3 de la tabla.
 *   - PERFILERIA se unifica a 1,561841: 126 productos estaban en 1,514500
 *     (72 de ellos vinculados a catálogo, los únicos que pueden moverse).
 *   - Corregir las 3 unidades con evidencia y excluir los 2 sin criterio.
 *
 * Idempotente: las unidades sólo se tocan si están en el valor viejo esperado,
 * el seed usa ON CONFLICT DO UPDATE y el recálculo no escribe si el precio ya
 * coincide (el motor se detiene solo cuando nada cambia).
 *
 * Reversión de precios: no hay --revertir para el paso 3. Cada cambio queda en
 * `cotizador.precio_historial` con su `antes` completo, que es la vía de vuelta.
 * Los pasos 1 y 2 sí se revierten con --revertir.
 *
 * Uso:
 *   npx ts-node src/scripts/2026-09-17_cotizador_multiplicadores_y_unidades.ts --dry-run
 *   npx ts-node src/scripts/2026-09-17_cotizador_multiplicadores_y_unidades.ts
 *   npx ts-node src/scripts/2026-09-17_cotizador_multiplicadores_y_unidades.ts --revertir
 */
import sequelize from '../config/database';
import { Op, QueryTypes } from 'sequelize';
import { CotizadorProducto, CotizadorMultiplicadorCategoria } from '../models';
import * as cache from '../cotizador/cache';
import { recalcularCostosDesdeProveedor } from '../cotizador/lib/sincronizacionProveedores';
import { recargarPrecios } from '../cotizador/lib/catalogo';

const DRY_RUN = process.argv.includes('--dry-run');
const REVERTIR = process.argv.includes('--revertir');
// Los pasos 1 y 2 no mueven ningún precio (sembrar un multiplicador "aplica
// hacia adelante" por diseño), pero el paso 3 depende de ellos: con --dry-run
// puro, el recálculo todavía ve las unidades viejas y ninguna fila de
// multiplicador, así que informa 0 cambios para las categorías nuevas y
// mantiene el error de TSL0101. Por eso existe --sin-recalculo: aplica 1 y 2 de
// verdad y deja el 3 para una corrida aparte, donde --dry-run ya previsualiza
// lo que de verdad va a pasar.
const SIN_RECALCULO = process.argv.includes('--sin-recalculo');
const ACTOR = 'migracion-2026-09-17';

/** Correcciones de unidad: [codigo del Cotizador, unidad vieja, unidad nueva]. */
const UNIDADES: { codigo: string; de: string; a: string; porque: string }[] = [
  { codigo: 'TSL0101', de: 'TIRA_6M', a: 'UNIDAD', porque: 'el proveedor la describe como manija redonda de 48x57mm' },
  { codigo: 'ZSE0104', de: 'METRO', a: 'TIRA_6M', porque: 'precio/6 coincide con el costo actual: es una tira puesta como metro' },
  { codigo: 'BPB04', de: 'M2', a: 'METRO', porque: 'un borde pulido se cobra por metro lineal (no cambia el costo)' },
];

/** Multiplicadores observados a 6 decimales, con su cobertura en datos reales. */
const MULTIPLICADORES: { categoria: string; pa: number; pm: number; pb: number; nota: string }[] = [
  { categoria: 'ACABADO', pa: 1.534301, pm: 1.412297, pb: 1.290293, nota: 'Observado en 12 de 14 productos con costo > 0 (2026-09-17). El usuario lo aportó como 1,534/1,412/1,290.' },
  { categoria: 'VIDRIO', pa: 1.672800, pm: 1.586582, pb: 1.500364, nota: 'Observado en 35 de 37 productos con costo > 0 (2026-09-17). El usuario lo aportó como 1,673/1,587/1,500.' },
  { categoria: 'ACCESORIO', pa: 1.550628, pm: 1.440712, pb: 1.330796, nota: 'Verificado el 2026-09-14 contra 18+ productos; reconfirmado el 2026-09-17 en 166 de 169. El usuario lo aportó como 1,551/1,441/1,331.' },
  { categoria: 'PERFILERIA', pa: 1.561841, pm: 1.474123, pb: 1.386405, nota: 'Observado en 221 de 363 productos (2026-09-17). Unifica los 126 que estaban en 1,514500 por decisión del usuario. El usuario lo aportó como 1,562/1,474/1,386.' },
];

/** Productos que quedan fuera del recálculo de esta corrida. */
const EXCLUIDOS = ['TEN0101', 'BOQN03'];

const CATEGORIAS = ['ACABADO', 'VIDRIO', 'ACCESORIO', 'PERFILERIA'];

function titulo(t: string): void {
  console.log(`\n${'─'.repeat(78)}\n${t}\n${'─'.repeat(78)}`);
}

/** Resuelve el `proveedor_producto` activo de un código del Cotizador. */
async function filaProveedor(codigo: string): Promise<{ id: number; unidad_compra: string; precio_actual: string } | null> {
  const filas = await sequelize.query<any>(
    `SELECT pp.id, pp.unidad_compra, pp.precio_actual
       FROM cotizador.producto cp
       JOIN proveedor_producto pp ON pp.catalogo_producto_id = cp.catalogo_producto_id AND pp.activo = true
      WHERE cp.codigo = :codigo`,
    { replacements: { codigo }, type: QueryTypes.SELECT }
  );
  return filas[0] ?? null;
}

async function paso1Unidades(): Promise<void> {
  titulo(REVERTIR ? '1. REVERTIR unidades de compra' : '1. Corregir unidades de compra');
  for (const u of UNIDADES) {
    const desde = REVERTIR ? u.a : u.de;
    const hacia = REVERTIR ? u.de : u.a;
    const fila = await filaProveedor(u.codigo);
    if (!fila) { console.log(`  ${u.codigo.padEnd(9)} SIN FILA de proveedor activa — se omite`); continue; }
    if (fila.unidad_compra !== desde) {
      console.log(`  ${u.codigo.padEnd(9)} ya está en "${fila.unidad_compra}" (esperaba "${desde}") — nada que hacer`);
      continue;
    }
    console.log(`  ${u.codigo.padEnd(9)} pp_id=${fila.id}  ${desde} -> ${hacia}   [${u.porque}]`);
    if (!DRY_RUN) {
      await sequelize.query(`UPDATE proveedor_producto SET unidad_compra = :u WHERE id = :id`, {
        replacements: { u: hacia, id: fila.id },
        type: QueryTypes.UPDATE,
      });
    }
  }
}

async function paso2Multiplicadores(): Promise<void> {
  titulo(REVERTIR ? '2. REVERTIR multiplicadores (deja sólo ACCESORIO, como antes)' : '2. Sembrar multiplicadores por categoría');

  if (REVERTIR) {
    for (const m of MULTIPLICADORES) {
      if (m.categoria === 'ACCESORIO') { console.log('  ACCESORIO   se conserva (existía desde el 2026-09-14)'); continue; }
      console.log(`  ${m.categoria.padEnd(11)} se elimina la fila`);
      if (!DRY_RUN) await CotizadorMultiplicadorCategoria.destroy({ where: { categoria: m.categoria } });
    }
    return;
  }

  for (const m of MULTIPLICADORES) {
    const actual = await CotizadorMultiplicadorCategoria.findByPk(m.categoria);
    const antes = actual
      ? `${actual.get('multiplicador_pa')}/${actual.get('multiplicador_pm')}/${actual.get('multiplicador_pb')}`
      : 'SIN FILA';
    const despues = `${m.pa}/${m.pm}/${m.pb}`;
    console.log(`  ${m.categoria.padEnd(11)} ${antes.padEnd(34)} -> ${despues}${antes === despues ? '   (sin cambio)' : ''}`);
    if (!DRY_RUN) {
      await sequelize.query(
        `INSERT INTO cotizador.multiplicador_categoria
           (categoria, multiplicador_pa, multiplicador_pm, multiplicador_pb, actualizado_en, actualizado_por, nota)
         VALUES (:categoria, :pa, :pm, :pb, NOW(), :actor, :nota)
         ON CONFLICT (categoria) DO UPDATE SET
           multiplicador_pa = EXCLUDED.multiplicador_pa,
           multiplicador_pm = EXCLUDED.multiplicador_pm,
           multiplicador_pb = EXCLUDED.multiplicador_pb,
           actualizado_en = EXCLUDED.actualizado_en,
           actualizado_por = EXCLUDED.actualizado_por,
           nota = EXCLUDED.nota`,
        { replacements: { categoria: m.categoria, pa: m.pa, pm: m.pm, pb: m.pb, actor: ACTOR, nota: m.nota }, type: QueryTypes.INSERT }
      );
    }
  }
}

async function paso3Recalculo(): Promise<void> {
  titulo('3. Recálculo de precios (excluye TEN0101 y BOQN03)');
  if (REVERTIR) {
    console.log('  --revertir NO deshace precios. Cada cambio quedó en cotizador.precio_historial con su `antes`.');
    return;
  }

  const excluidos = await CotizadorProducto.findAll({
    where: { codigo: { [Op.in]: EXCLUIDOS } },
    attributes: ['codigo', 'catalogo_producto_id'],
  });
  const idsExcluidos = new Set(excluidos.map((e) => e.get('catalogo_producto_id') as number));
  console.log(`  Excluidos: ${excluidos.map((e) => `${e.get('codigo')} (id ${e.get('catalogo_producto_id')})`).join(', ')}\n`);

  let totalCambios = 0;
  for (const categoria of CATEGORIAS) {
    const productos = await CotizadorProducto.findAll({
      where: { categoria, catalogo_producto_id: { [Op.ne]: null } },
      attributes: ['codigo', 'catalogo_producto_id'],
    });
    const ids = [...new Set(productos.map((p) => p.get('catalogo_producto_id') as number))].filter((id) => !idsExcluidos.has(id));

    const t0 = Date.now();
    const res = await recalcularCostosDesdeProveedor(ids, { dryRun: DRY_RUN });
    const ms = Date.now() - t0;
    const cambios = res.flatMap((r) => r.cambios);
    totalCambios += cambios.length;

    console.log(`  ${categoria.padEnd(11)} ids=${String(ids.length).padStart(3)}  ${DRY_RUN ? 'cambiarían' : 'actualizados'}=${String(cambios.length).padStart(3)}  (${(ms / 1000).toFixed(2)} s)`);
    for (const c of cambios) {
      const pct = c.antes.precio_pa > 0 ? ((c.despues.precio_pa - c.antes.precio_pa) / c.antes.precio_pa) * 100 : 0;
      if (Math.abs(pct) >= 20) {
        console.log(`      ${c.codigo.padEnd(11)} PA ${c.antes.precio_pa.toFixed(0)} -> ${c.despues.precio_pa.toFixed(0)}  (${pct >= 0 ? '+' : ''}${pct.toFixed(1)} %)`);
      }
    }
  }

  if (!DRY_RUN && totalCambios > 0) {
    await recargarPrecios();
    console.log('\n  Caché de precios del proceso recargada.');
    console.log('  ⚠️ El backend en ejecución tiene su PROPIA caché: reiniciarlo para que sirva los precios nuevos.');
  }
}

async function main(): Promise<void> {
  await sequelize.authenticate();
  await cache.precargar();
  console.log(`\nModo: ${REVERTIR ? 'REVERTIR' : DRY_RUN ? 'DRY-RUN (no escribe nada)' : 'APLICAR'}`);

  await paso1Unidades();
  await paso2Multiplicadores();
  if (SIN_RECALCULO) {
    titulo('3. Recálculo — OMITIDO (--sin-recalculo)');
    console.log('  Ningún precio se movió. Previsualizá el recálculo con --dry-run y aplicalo sin flags.');
  } else {
    await paso3Recalculo();
  }

  console.log('\nListo.\n');
  await sequelize.close();
}

main().catch(async (e) => { console.error(e); await sequelize.close(); process.exit(1); });
