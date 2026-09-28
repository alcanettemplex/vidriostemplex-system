/**
 * Script: 2026-09-27_cotizador_peliculas_catalogo.ts
 *
 * Propósito: que el asesor pueda ELEGIR la película del vidrio (antes un sí/no
 * que siempre cobraba PELI31). Decisiones del usuario, 2026-09-27:
 *
 *   1. Dar de alta en el Cotizador todas las películas del catálogo general
 *      del ERP (`catalogo_productos.nombre ILIKE 'PELICULA%'`) que todavía no
 *      estén, VINCULADAS (`catalogo_producto_id`), en la categoría ACABADO y
 *      por `X METRO` (igual que PELI31; los proveedores la venden por metro).
 *      - Con proveedor seguido y con precio: el costo lo pone la
 *        sincronización con Proveedores (el mismo camino de siempre).
 *      - Sin precio: `precio_a_cotizar = true` — el asesor escribe el costo y
 *        la línea sale con advertencia; sin costo, sale en error (nunca $0).
 *   2. TODAS las películas en ACABADO: PELI0101 y PELI0102 (estaban en
 *      ACCESORIO) y PEL0107 (en VIDRIO) cambian de categoría, y su precio de
 *      venta se recalcula con el multiplicador de ACABADO.
 *
 * Quedan fuera PELI031 ("SUMINISTRO E INSTALACIÓN DE PELICULAS") e INS001:
 * son servicios, no películas, y su nombre no empieza por "PELICULA".
 *
 * SQL crudo para las escrituras (mismo criterio que los scripts del
 * 2026-09-25/26): no depender de la versión compilada del modelo. El recálculo
 * de costos reutiliza `recalcularCostosDesdeProveedor`, que deja historial.
 *
 * Ejecutar:  npx ts-node src/scripts/2026-09-27_cotizador_peliculas_catalogo.ts [--dry-run]
 * Revertir:  npx ts-node src/scripts/2026-09-27_cotizador_peliculas_catalogo.ts --revertir
 *            (borra las altas de este script —si ninguna cotización las usa— y
 *            devuelve las 3 películas a su categoría anterior; el precio de
 *            esas 3 se recalcula con el multiplicador de su categoría original.)
 * Después:   reiniciar el backend para recargar la caché del Cotizador.
 */

import { QueryTypes, Transaction } from 'sequelize';
import sequelize from '../config/database';
import * as cache from '../cotizador/cache';
import { recalcularCostosDesdeProveedor } from '../cotizador/lib/sincronizacionProveedores';

const POR = 'script-2026-09-27-peliculas';
const DRY_RUN = process.argv.includes('--dry-run');

/** Categoría anterior de las películas que ya estaban, para poder revertir. */
const RECATEGORIZAR: Record<string, string> = {
  PELI0101: 'ACCESORIO',
  PELI0102: 'ACCESORIO',
  PEL0107: 'VIDRIO',
};

type Fila = Record<string, unknown>;

async function consultar<T = Fila>(sql: string, replacements: Fila = {}, t?: Transaction): Promise<T[]> {
  return sequelize.query(sql, { type: QueryTypes.SELECT, replacements, transaction: t }) as Promise<T[]>;
}

async function ejecutar(sql: string, replacements: Fila = {}, t?: Transaction): Promise<number> {
  const [, meta] = (await sequelize.query(sql, { replacements, transaction: t })) as [unknown, { rowCount?: number }];
  return meta?.rowCount ?? 0;
}

/** Mejor proveedor con precio, mismo filtro que la sincronización. */
const SQL_CON_PROVEEDOR = `
  SELECT DISTINCT pp.catalogo_producto_id
    FROM public.proveedor_producto pp
    JOIN public.proveedores pr ON pr.id = pp.proveedor_id
   WHERE pp.activo AND pp.precio_actual IS NOT NULL AND pr.activo AND pr.seguir_precios = true
     AND pp.catalogo_producto_id IN (:ids)`;

interface Candidata {
  id: number;
  codigo: string;
  nombre: string;
}

async function aplicar() {
  console.log(`=== Cotizador: películas del catálogo — 2026-09-27${DRY_RUN ? ' (DRY RUN)' : ''} ===\n`);

  // ─── Validaciones previas ─────────────────────────────────────────────────
  const [mult] = await consultar(`SELECT 1 FROM cotizador.multiplicador_categoria WHERE categoria = 'ACABADO'`);
  if (!mult) throw new Error('ACABADO no tiene multiplicador configurado.');

  const candidatas = await consultar<Candidata>(
    `SELECT cp.id, UPPER(TRIM(cp.codigo)) AS codigo, cp.nombre
       FROM public.catalogo_productos cp
      WHERE cp.activo AND cp.codigo IS NOT NULL AND cp.nombre ILIKE 'PELICULA%'
        AND NOT EXISTS (
          SELECT 1 FROM cotizador.producto p
           WHERE p.catalogo_producto_id = cp.id OR UPPER(p.codigo) = UPPER(TRIM(cp.codigo)))
      ORDER BY cp.codigo`
  );
  const largas = candidatas.filter((c) => c.codigo.length > 20);
  if (largas.length) throw new Error(`Códigos de más de 20 caracteres: ${largas.map((c) => c.codigo).join(', ')}.`);

  const recat = await consultar<{ codigo: string; categoria: string; catalogo_producto_id: number | null }>(
    `SELECT codigo, categoria, catalogo_producto_id FROM cotizador.producto WHERE codigo IN (:codigos)`,
    { codigos: Object.keys(RECATEGORIZAR) }
  );
  if (recat.length !== Object.keys(RECATEGORIZAR).length) {
    throw new Error('No están las 3 películas a recategorizar (PELI0101, PELI0102, PEL0107).');
  }

  const conProveedor = new Set(
    candidatas.length
      ? (await consultar<{ catalogo_producto_id: number }>(SQL_CON_PROVEEDOR, { ids: candidatas.map((c) => c.id) })).map(
          (f) => Number(f.catalogo_producto_id)
        )
      : []
  );

  console.log(`Altas: ${candidatas.length} películas`);
  for (const c of candidatas) {
    console.log(`  ${conProveedor.has(Number(c.id)) ? '$ ' : '? '}${c.codigo.padEnd(10)} ${c.nombre}`);
  }
  console.log('  ($ = precio del proveedor · ? = precio a cotizar por el asesor)\n');
  console.log('Recategorizar a ACABADO:');
  for (const r of recat) console.log(`  ${r.codigo.padEnd(10)} ${r.categoria} → ACABADO`);

  if (DRY_RUN) {
    console.log('\n(dry run: no se escribió nada)');
    return;
  }

  // ─── Escritura, todo o nada ────────────────────────────────────────────────
  const ahora = new Date();
  await sequelize.transaction(async (t) => {
    for (const c of candidatas) {
      const aCotizar = !conProveedor.has(Number(c.id));
      await ejecutar(
        `INSERT INTO cotizador.producto
           (codigo, descripcion, categoria, unidad, costo_unitario, precio_pa, precio_pm, precio_pb,
            origen, provisional, fuente, catalogo_producto_id, creado_en, creado_por, precio_a_cotizar)
         VALUES (:codigo, :descripcion, 'ACABADO', 'X METRO', 0, 0, 0, 0,
            'ALTA', false, 'catálogo general', :id, :ahora, :por, :aCotizar)`,
        { codigo: c.codigo, descripcion: String(c.nombre).slice(0, 120), id: c.id, ahora, por: POR, aCotizar },
        t
      );
      await ejecutar(
        `INSERT INTO cotizador.precio_historial (fecha, accion, codigo, antes, despues, por, motivo)
         VALUES (:ahora, 'dar-de-alta', :codigo, NULL, :despues::jsonb, :por, :motivo)`,
        {
          ahora,
          codigo: c.codigo,
          despues: JSON.stringify({ categoria: 'ACABADO', unidad: 'X METRO', precio_a_cotizar: aCotizar, activo: true }),
          por: POR,
          motivo: `Película traída del catálogo general (id ${c.id}) para elegirla en el Cotizador${
            aCotizar ? ', sin precio: se cotiza aparte' : ''
          }.`,
        },
        t
      );
    }

    for (const r of recat) {
      await ejecutar(`UPDATE cotizador.producto SET categoria = 'ACABADO' WHERE codigo = :codigo`, { codigo: r.codigo }, t);
      await ejecutar(
        `INSERT INTO cotizador.precio_historial (fecha, accion, codigo, antes, despues, por, motivo)
         VALUES (:ahora, 'editar-precio', :codigo, :antes::jsonb, :despues::jsonb, :por, :motivo)`,
        {
          ahora,
          codigo: r.codigo,
          antes: JSON.stringify({ categoria: r.categoria }),
          despues: JSON.stringify({ categoria: 'ACABADO' }),
          por: POR,
          motivo: 'Todas las películas en ACABADO (decisión del usuario, 2026-09-27).',
        },
        t
      );
    }
  });
  console.log(`\n  ✔ ${candidatas.length} altas y ${recat.length} recategorizadas`);

  // ─── Costos desde Proveedores (fuera de la transacción: el motor escribe
  // con su propia transacción y deja historial) ─────────────────────────────
  const ids = [
    ...candidatas.filter((c) => conProveedor.has(Number(c.id))).map((c) => Number(c.id)),
    ...recat.map((r) => r.catalogo_producto_id).filter((id): id is number => id != null),
  ].map(Number);
  await cache.precargar();
  const resultados = await recalcularCostosDesdeProveedor(ids);
  for (const r of resultados) {
    for (const c of r.cambios) {
      const d = c.despues;
      console.log(`  ✔ ${c.codigo} — costo $${d.costo_unitario} · PA $${d.precio_pa} · PM $${d.precio_pm} · PB $${d.precio_pb}`);
    }
    for (const o of r.omitidos) console.log(`  ⚠ ${o.codigo}: ${o.motivo}`);
  }
  console.log('\n⚠ Reinicia el backend para que la caché del Cotizador vea los cambios.');
}

async function revertir() {
  console.log('=== Revertir películas del catálogo — 2026-09-27 ===\n');
  const altas = await consultar<{ codigo: string }>(`SELECT codigo FROM cotizador.producto WHERE creado_por = :por`, {
    por: POR,
  });
  const codigos = altas.map((a) => a.codigo);
  if (codigos.length) {
    // Un ítem guardado que la use quedaría con una línea de error al recalcular.
    const usadas = await consultar<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM cotizador.cotizacion_item WHERE input->>'pelicula' IN (:codigos)`,
      { codigos }
    );
    if (Number(usadas[0]?.n) > 0) {
      throw new Error(`${usadas[0].n} ítem(s) guardados usan una de estas películas: revísalos antes de revertir.`);
    }
  }
  await sequelize.transaction(async (t) => {
    const n = codigos.length
      ? await ejecutar(`DELETE FROM cotizador.producto WHERE codigo IN (:codigos) AND creado_por = :por`, { codigos, por: POR }, t)
      : 0;
    for (const [codigo, categoria] of Object.entries(RECATEGORIZAR)) {
      await ejecutar(`UPDATE cotizador.producto SET categoria = :categoria WHERE codigo = :codigo`, { codigo, categoria }, t);
    }
    console.log(`  ✔ ${n} altas borradas y ${Object.keys(RECATEGORIZAR).length} devueltas a su categoría`);
  });
  const ids = (
    await consultar<{ catalogo_producto_id: number | null }>(
      `SELECT catalogo_producto_id FROM cotizador.producto WHERE codigo IN (:codigos)`,
      { codigos: Object.keys(RECATEGORIZAR) }
    )
  )
    .map((f) => f.catalogo_producto_id)
    .filter((id): id is number => id != null);
  await cache.precargar();
  await recalcularCostosDesdeProveedor(ids.map(Number));
  console.log('\n⚠ Reinicia el backend para que la caché del Cotizador vea los cambios.');
}

(process.argv.includes('--revertir') ? revertir() : aplicar())
  .then(() => sequelize.close())
  .catch(async (e) => {
    console.error('\n✖', e instanceof Error ? e.message : e);
    await sequelize.close();
    process.exit(1);
  });
