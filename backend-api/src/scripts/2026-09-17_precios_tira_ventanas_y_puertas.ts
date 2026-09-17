/**
 * Script: 2026-09-17_precios_tira_ventanas_y_puertas.ts
 *
 * Carga el precio POR PERFIL (tira de 6 m) de los 13 perfiles de PERFILERIA que
 * hasta hoy sólo tenían precio por metro con Ventanas y Puertas S.A.S (id 829),
 * y actualiza el precio por metro del empaque `EMPA8025`.
 *
 * POR QUÉ IMPORTA
 *   El motor del Cotizador prefiere la modalidad TIRA_6M para PERFILERIA desde
 *   el 2026-09-17 (ver `MODALIDAD_PREFERIDA` en
 *   `cotizador/lib/sincronizacionProveedores.ts`), con caída a las otras
 *   modalidades cuando el producto no tiene ninguna fila de perfil. Estos 13
 *   caían al precio por metro por no tener alternativa. Con el precio de tira
 *   cargado, el motor lo prefiere solo.
 *
 * DATO APORTADO POR EL USUARIO (2026-09-17), confirmado SIN IVA.
 *   La confirmación no es un detalle: `proveedor_producto.precio_actual` guarda
 *   precio sin IVA, y cargar precios con IVA incluido inflaría todo costo un
 *   19 % y se propagaría a cada cotización nueva. La evidencia respalda la
 *   respuesta: comparados sin IVA, 9 de los 13 caen dentro del ±2 % del precio
 *   por metro que ya estaba cargado (tira÷6 ≈ metro); con IVA incluido, los 13
 *   quedarían uniformemente 15,8 % por debajo.
 *
 * ⚠️ `SIL0606` (3831 SILLAR CABEZAL 173 NEGRO) va a $43.000 por decisión
 *    explícita del usuario, tras señalarle que el mismo perfil en CRUDO
 *    (`SIL0301`) cuesta $76.000 y que hoy su precio por metro (14.957,98) es
 *    MAYOR que el del crudo (12.521,01) — es decir, el negro saldría 43 % más
 *    barato que el crudo, al revés que en todo el resto de la lista
 *    (`JAM0302` crudo 66.000 vs `JAM0605` negro 97.000). El usuario reafirmó el
 *    valor. Su costo baja 52 % y el precio de venta con él. Queda en
 *    `proveedor_producto_precio` y en `cotizador.precio_historial` para poder
 *    revertirlo si resulta ser un tecleo.
 *
 * DECISIONES DEL USUARIO QUE ESTE SCRIPT MATERIALIZA
 *   · Precios sin IVA, se cargan tal cual.
 *   · Las filas METRO existentes **se conservan activas**: son registro real de
 *     lo que se compró (3 de ellas son compras de RETAL, la única prueba de esa
 *     compra) y el motor ya no las elige para perfilería. Siguen apareciendo en
 *     el comparador del módulo Proveedores, que es correcto: son dos
 *     modalidades reales del mismo producto.
 *   · `EMPA8025` no es un perfil sino un empaque en rollo de 100 m ("E. SISTEMA
 *     8025-5020-744 6MM 100 MT"): nunca va a tener precio por tira, así que se
 *     queda en METRO y sólo se le actualiza el precio.
 *
 * `codigo_proveedor` queda en NULL en las filas nuevas, igual que en
 * `2026-09-16_alta_16_codigos_precio_manual.ts`: el código que traerá la
 * factura de la tira no se conoce (las 3 filas de retal usan códigos con
 * sufijo `MT` —`144PNMT`, `387ECMT`, `194PNMT`— que son los de metro, y
 * derivar el de tira quitando el sufijo sería inventarlo). La ingesta
 * encuentra la fila por `(proveedor_id, catalogo_producto_id, unidad_compra)`;
 * si no la reconoce por código, la línea cae en la bandeja de mapeo, que es el
 * comportamiento seguro.
 *
 * Idempotente: no crea una fila TIRA_6M que ya exista, y no reescribe un precio
 * idéntico al vigente (mismo criterio que `actualizarPrecio()`).
 *
 * Uso:
 *   npx ts-node src/scripts/2026-09-17_precios_tira_ventanas_y_puertas.ts --dry-run
 *   npx ts-node src/scripts/2026-09-17_precios_tira_ventanas_y_puertas.ts
 *   npx ts-node src/scripts/2026-09-17_precios_tira_ventanas_y_puertas.ts --revertir
 */
import sequelize from '../config/database';
import { Op, QueryTypes, Transaction } from 'sequelize';
import { CotizadorProducto, ProveedorProducto, ProveedorProductoPrecio } from '../models';
import * as cache from '../cotizador/cache';
import { recalcularCostosDesdeProveedor, realinearPreciosAlMultiplicador } from '../cotizador/lib/sincronizacionProveedores';
import { recargarPrecios } from '../cotizador/lib/catalogo';

const DRY_RUN = process.argv.includes('--dry-run');
const REVERTIR = process.argv.includes('--revertir');
const SIN_RECALCULO = process.argv.includes('--sin-recalculo');

const PROVEEDOR_ID = 829; // VENTANAS Y PUERTAS S.A.S
const USUARIO_ROOT = 30;
const HOY = new Date().toISOString().slice(0, 10);

/** Precio por perfil (tira de 6 m), sin IVA. Aportado por el usuario el 2026-09-17. */
const PRECIOS_TIRA: { codigo: string; precio: number }[] = [
  { codigo: 'CAB0606', precio: 98000 },
  { codigo: 'ENG0607', precio: 87500 },
  { codigo: 'HOI0302', precio: 95000 },
  { codigo: 'HOR0603', precio: 96000 },
  { codigo: 'HOS0302', precio: 73000 },
  { codigo: 'JAM0302', precio: 66000 },
  { codigo: 'JAM0605', precio: 97000 },
  { codigo: 'SIL0101', precio: 70000 },
  { codigo: 'SIL0301', precio: 76000 },
  { codigo: 'SIL0304', precio: 101000 },
  { codigo: 'SIL0603', precio: 101000 },
  { codigo: 'SIL0606', precio: 43000 }, // ⚠️ ver cabecera: confirmado por el usuario pese a la anomalía
  { codigo: 'TRA0604', precio: 80000 },
];

/** El empaque sigue por metro: no existe "tira" de un rollo de 100 m. */
const PRECIO_METRO = { codigo: 'EMPA8025', precio: 2176 };

/** Excluidos del recálculo, igual que en la migración anterior (TECH_DEBT 2026-09-17). */
const EXCLUIDOS_RECALCULO = ['TEN0101', 'BOQN03'];

const CATEGORIAS = ['ACABADO', 'VIDRIO', 'ACCESORIO', 'PERFILERIA'];

function titulo(t: string): void {
  console.log(`\n${'─'.repeat(78)}\n${t}\n${'─'.repeat(78)}`);
}

async function catalogoIdDe(codigo: string, t?: Transaction): Promise<number> {
  const p = await CotizadorProducto.findByPk(codigo, { transaction: t });
  if (!p) throw new Error(`${codigo} no existe en cotizador.producto — abortando.`);
  const id = p.getDataValue('catalogo_producto_id') as number | null;
  if (id === null) throw new Error(`${codigo} no está vinculado al catálogo maestro — abortando.`);
  return id;
}

async function paso1Tiras(): Promise<void> {
  titulo(REVERTIR ? '1. REVERTIR filas TIRA_6M creadas' : '1. Crear filas TIRA_6M (precio por perfil)');

  for (const item of PRECIOS_TIRA) {
    const catalogoProductoId = await catalogoIdDe(item.codigo);
    const existente = await ProveedorProducto.findOne({
      where: { proveedor_id: PROVEEDOR_ID, catalogo_producto_id: catalogoProductoId, unidad_compra: 'TIRA_6M' },
    });

    if (REVERTIR) {
      if (!existente) { console.log(`  ${item.codigo.padEnd(9)} sin fila TIRA_6M — nada que revertir`); continue; }
      console.log(`  ${item.codigo.padEnd(9)} elimina pp_id=${existente.getDataValue('id')} y su histórico`);
      if (!DRY_RUN) {
        const t = await sequelize.transaction();
        try {
          await ProveedorProductoPrecio.destroy({ where: { proveedor_producto_id: existente.getDataValue('id') }, transaction: t });
          await existente.destroy({ transaction: t });
          await t.commit();
        } catch (e) { await t.rollback(); throw e; }
      }
      continue;
    }

    if (existente) {
      console.log(`  ${item.codigo.padEnd(9)} ya tiene fila TIRA_6M (pp_id=${existente.getDataValue('id')}) — se omite`);
      continue;
    }

    // Referencia informativa: qué costo por metro tenía y cuál tendrá.
    const metro = await ProveedorProducto.findOne({
      where: { proveedor_id: PROVEEDOR_ID, catalogo_producto_id: catalogoProductoId, unidad_compra: 'METRO', activo: true },
    });
    const antesMetro = metro ? Number(metro.getDataValue('precio_actual')) : null;
    const nuevoPorMetro = item.precio / 6;
    const delta = antesMetro && antesMetro > 0 ? ((nuevoPorMetro - antesMetro) / antesMetro) * 100 : null;
    console.log(
      `  ${item.codigo.padEnd(9)} tira $${String(item.precio).padStart(7)} → $/m ${nuevoPorMetro.toFixed(2).padStart(9)}` +
      (antesMetro ? `  (antes por metro ${antesMetro.toFixed(2)}, ${delta! >= 0 ? '+' : ''}${delta!.toFixed(1)} %)` : '  (sin fila METRO previa)')
    );

    if (DRY_RUN) continue;
    const t = await sequelize.transaction();
    try {
      const pp = await ProveedorProducto.create(
        {
          proveedor_id: PROVEEDOR_ID,
          catalogo_producto_id: catalogoProductoId,
          unidad_compra: 'TIRA_6M',
          metros_por_unidad: 6,
          precio_actual: item.precio,
          fecha_precio_actual: HOY,
          activo: true,
        },
        { transaction: t }
      );
      await ProveedorProductoPrecio.create(
        {
          proveedor_producto_id: pp.getDataValue('id'),
          precio: item.precio,
          fecha_vigencia: HOY,
          origen: 'MANUAL',
          registrado_por: USUARIO_ROOT,
          lineas_en_factura: 1,
          retroactivo: false,
        },
        { transaction: t }
      );
      await t.commit();
    } catch (e) { await t.rollback(); throw e; }
  }
}

async function paso2Empaque(): Promise<void> {
  titulo(REVERTIR ? '2. REVERTIR precio por metro de EMPA8025' : '2. Actualizar precio por metro de EMPA8025');
  const catalogoProductoId = await catalogoIdDe(PRECIO_METRO.codigo);
  const pp = await ProveedorProducto.findOne({
    where: { proveedor_id: PROVEEDOR_ID, catalogo_producto_id: catalogoProductoId, unidad_compra: 'METRO', activo: true },
  });
  if (!pp) { console.log(`  ${PRECIO_METRO.codigo} sin fila METRO activa — se omite`); return; }

  const vigente = Number(pp.getDataValue('precio_actual'));
  const anterior1 = pp.getDataValue('precio_anterior_1');

  if (REVERTIR) {
    if (anterior1 === null || anterior1 === undefined) {
      console.log(`  ${PRECIO_METRO.codigo} sin precio anterior registrado — no se puede revertir automáticamente`);
      return;
    }
    console.log(`  ${PRECIO_METRO.codigo} ${vigente} → ${anterior1} (restaura el anterior)`);
    if (!DRY_RUN) {
      const t = await sequelize.transaction();
      try {
        await ProveedorProductoPrecio.destroy({
          where: { proveedor_producto_id: pp.getDataValue('id'), precio: PRECIO_METRO.precio, fecha_vigencia: HOY },
          transaction: t,
        });
        await pp.update(
          {
            precio_actual: anterior1,
            fecha_precio_actual: pp.getDataValue('fecha_anterior_1'),
            precio_anterior_1: pp.getDataValue('precio_anterior_2'),
            fecha_anterior_1: pp.getDataValue('fecha_anterior_2'),
            precio_anterior_2: null,
            fecha_anterior_2: null,
          },
          { transaction: t }
        );
        await t.commit();
      } catch (e) { await t.rollback(); throw e; }
    }
    return;
  }

  if (vigente === PRECIO_METRO.precio) {
    console.log(`  ${PRECIO_METRO.codigo} ya está en ${vigente} — no se ensucia el histórico`);
    return;
  }
  const variacion = ((PRECIO_METRO.precio - vigente) / vigente) * 100;
  console.log(`  ${PRECIO_METRO.codigo} ${vigente} → ${PRECIO_METRO.precio} (${variacion >= 0 ? '+' : ''}${variacion.toFixed(2)} %)`);

  if (DRY_RUN) return;
  // Réplica deliberada de `actualizarPrecio()` (privada en proveedor.controller,
  // no exportable; importar ese controlador desde un script arrastra el ciclo
  // server → app → routes → controller). Mismo cascadeo actual → anterior_1 →
  // anterior_2 y misma línea de histórico.
  const t = await sequelize.transaction();
  try {
    await pp.update(
      {
        precio_anterior_2: pp.getDataValue('precio_anterior_1'),
        fecha_anterior_2: pp.getDataValue('fecha_anterior_1'),
        precio_anterior_1: pp.getDataValue('precio_actual'),
        fecha_anterior_1: pp.getDataValue('fecha_precio_actual'),
        precio_actual: PRECIO_METRO.precio,
        fecha_precio_actual: HOY,
      },
      { transaction: t }
    );
    await ProveedorProductoPrecio.create(
      {
        proveedor_producto_id: pp.getDataValue('id'),
        precio: PRECIO_METRO.precio,
        fecha_vigencia: HOY,
        origen: 'MANUAL',
        registrado_por: USUARIO_ROOT,
        lineas_en_factura: 1,
        retroactivo: false,
        variacion_pct: variacion,
      },
      { transaction: t }
    );
    await t.commit();
  } catch (e) { await t.rollback(); throw e; }
}

async function paso3Recalculo(): Promise<void> {
  titulo('3. Recálculo en dos fases (excluye TEN0101 y BOQN03 de la fase 1)');
  if (REVERTIR) {
    console.log('  --revertir NO deshace precios del Cotizador. Cada cambio quedó en cotizador.precio_historial con su `antes`.');
    return;
  }

  const excluidos = await CotizadorProducto.findAll({
    where: { codigo: { [Op.in]: EXCLUIDOS_RECALCULO } },
    attributes: ['codigo', 'catalogo_producto_id'],
  });
  const idsExcluidos = new Set(excluidos.map((e) => e.getDataValue('catalogo_producto_id') as number));

  let totalF1 = 0;
  let totalF2 = 0;
  for (const categoria of CATEGORIAS) {
    const productos = await CotizadorProducto.findAll({
      where: { categoria, catalogo_producto_id: { [Op.ne]: null } },
      attributes: ['codigo', 'catalogo_producto_id'],
    });
    const ids = [...new Set(productos.map((p) => p.getDataValue('catalogo_producto_id') as number))].filter((id) => !idsExcluidos.has(id));

    const fase1 = await recalcularCostosDesdeProveedor(ids, { dryRun: DRY_RUN });
    const movidos = new Set(fase1.flatMap((r) => r.cambios.map((c) => c.codigo)));
    const cambiosF1 = fase1.flatMap((r) => r.cambios);

    const fase2 = await realinearPreciosAlMultiplicador(categoria, { dryRun: DRY_RUN, excluirCodigos: movidos });

    totalF1 += movidos.size;
    totalF2 += fase2.cambios.length;
    console.log(
      `\n  ${categoria}: fase1(proveedor)=${movidos.size}  fase2(realineación)=${fase2.cambios.length}` +
      `  omitidos_costo_cero=${fase2.omitidos.filter((o) => o.motivo.includes('costo en cero')).length}`
    );
    for (const c of [...cambiosF1, ...fase2.cambios]) {
      const pct = c.antes.precio_pa > 0 ? ((c.despues.precio_pa - c.antes.precio_pa) / c.antes.precio_pa) * 100 : 0;
      if (Math.abs(pct) >= 15) {
        console.log(`      ${c.codigo.padEnd(12)} PA ${c.antes.precio_pa.toFixed(0).padStart(8)} → ${c.despues.precio_pa.toFixed(0).padStart(8)}  (${pct >= 0 ? '+' : ''}${pct.toFixed(1)} %)`);
      }
    }
  }

  console.log(`\n  TOTAL fase1=${totalF1}  fase2=${totalF2}  →  ${totalF1 + totalF2} producto(s) ${DRY_RUN ? 'cambiarían' : 'actualizados'}`);
  if (!DRY_RUN && totalF1 + totalF2 > 0) {
    await recargarPrecios();
    console.log('\n  Caché de precios del proceso recargada.');
    console.log('  ⚠️ El backend en ejecución tiene su PROPIA caché: reiniciarlo para que sirva los precios nuevos.');
  }
}

async function main(): Promise<void> {
  await sequelize.authenticate();
  await cache.precargar();
  console.log(`\nModo: ${REVERTIR ? 'REVERTIR' : DRY_RUN ? 'DRY-RUN (no escribe nada)' : 'APLICAR'}`);

  await paso1Tiras();
  await paso2Empaque();
  if (SIN_RECALCULO) {
    titulo('3. Recálculo — OMITIDO (--sin-recalculo)');
    console.log('  Ningún precio del Cotizador se movió. Previsualizá con --dry-run y aplicá sin flags.');
  } else {
    await paso3Recalculo();
  }

  // Sanity check: ninguna fila TIRA_6M debe quedar sin precio.
  const huerfanas = await sequelize.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM proveedor_producto
      WHERE proveedor_id = :p AND unidad_compra = 'TIRA_6M' AND activo = true AND precio_actual IS NULL`,
    { replacements: { p: PROVEEDOR_ID }, type: QueryTypes.SELECT }
  );
  console.log(`\nFilas TIRA_6M activas sin precio: ${huerfanas[0]?.n ?? '?'} (debe ser 0)`);

  console.log('\nListo.\n');
  await sequelize.close();
}

main().catch(async (e) => { console.error(e); await sequelize.close(); process.exit(1); });
