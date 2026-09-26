/**
 * Script: 2026-09-26_cotizador_precios_kits_y_perforaciones.ts
 *
 * Propósito: cerrar el punto 2 de la hoja de ruta del Cotizador ("Productos en
 * $0", ver docs/modulos/cotizador.md) y de paso el 3 (vidrios sobre pedido).
 * Todos los datos son del usuario, 2026-09-26:
 *
 *   1. Costo Templex de 4 accesorios que estaban en $0 — KDE0303 $200.000,
 *      KDE0304 $175.000, SDR0301 $130.000, CM572A $120.000. PA/PM/PB salen del
 *      multiplicador de ACCESORIO, igual que el resto de la categoría. Ninguno
 *      tiene proveedor con precio: cuando se mapee una factura, el sync de
 *      Proveedores los reemplaza solo.
 *   2. `precio_a_cotizar` (columna nueva): el producto no tiene precio de
 *      catálogo, se cotiza aparte con el proveedor y el asesor escribe el COSTO
 *      en la línea (el motor le aplica el multiplicador del segmento). Se
 *      enciende para KVE001 (kit ventanería especial) y los dos vidrios sobre
 *      pedido CL4MM03LM / CL4MM08SP.
 *   3. PERF01/02/03 pasan de `X METRO` a `UND`: son precio por perforación
 *      (el proveedor factura por UNIDAD). No mueve ningún precio: Cabinas
 *      Corredizas ya las contaba por unidad (2 por cabina).
 *   4. Se desvincula la equivalencia de Templados y Laminados para PERF01
 *      (ProveedorProducto #222, $175 — imposible frente a los $5.200 del mismo
 *      proveedor para PERF03). Usa `desvincularEquivalencia`, la misma función
 *      del botón de Proveedores: baja lógica, histórico intacto, el código
 *      PERFORACION001 vuelve a "Por Mapear" para que un humano lo revise.
 *
 * SQL crudo para 1-3 (mismo criterio que el script del 2026-09-25): no depender
 * de la versión compilada del modelo.
 *
 * Ejecutar:  npx ts-node src/scripts/2026-09-26_cotizador_precios_kits_y_perforaciones.ts
 * Revertir:  npx ts-node src/scripts/2026-09-26_cotizador_precios_kits_y_perforaciones.ts --revertir
 *            (revierte 1-3; la columna `precio_a_cotizar` NO se borra porque el
 *            código la lee; la desvinculación de #222 se deshace volviendo a
 *            mapear el código desde Proveedores.)
 * Después:   reiniciar el backend para recargar la caché del Cotizador.
 */

import { QueryTypes, Transaction } from 'sequelize';
import type { Request, Response } from 'express';
import sequelize from '../config/database';
import { desvincularEquivalencia } from '../controllers/proveedor.controller';

const POR = 'script-2026-09-26';

const COSTOS: Record<string, number> = {
  KDE0303: 200000,
  KDE0304: 175000,
  SDR0301: 130000,
  CM572A: 120000,
};
const A_COTIZAR = ['KVE001', 'CL4MM03LM', 'CL4MM08SP'];
const PERFORACIONES = ['PERF01', 'PERF02', 'PERF03'];
const EQUIVALENCIA_175 = { id: 222, catalogoId: 1304, precio: 175 } as const;

type Fila = Record<string, unknown>;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function uno<T = Fila>(sql: string, replacements: Fila = {}, t?: Transaction): Promise<T[]> {
  return sequelize.query(sql, { type: QueryTypes.SELECT, replacements, transaction: t }) as Promise<T[]>;
}

async function ejecutar(sql: string, replacements: Fila = {}, t?: Transaction): Promise<number> {
  const [, meta] = (await sequelize.query(sql, { replacements, transaction: t })) as [unknown, { rowCount?: number }];
  return meta?.rowCount ?? 0;
}

interface ProductoFila {
  codigo: string;
  categoria: string;
  unidad: string | null;
  costo_unitario: number;
  precio_pa: number;
  precio_pm: number;
  precio_pb: number;
}

async function aplicar() {
  console.log('=== Cotizador: precios de kits, precio a cotizar y perforaciones — 2026-09-26 ===\n');

  // ─── Validaciones previas (nada se escribe si alguna falla) ───────────────
  const todos = [...Object.keys(COSTOS), ...A_COTIZAR, ...PERFORACIONES];
  const filas = await uno<ProductoFila>(
    `SELECT codigo, categoria, unidad, costo_unitario, precio_pa, precio_pm, precio_pb
       FROM cotizador.producto WHERE codigo IN (:codigos)`,
    { codigos: todos }
  );
  const porCodigo = new Map(filas.map((f) => [f.codigo, f]));
  const faltan = todos.filter((c) => !porCodigo.has(c));
  if (faltan.length) throw new Error(`No existen en cotizador.producto: ${faltan.join(', ')}.`);

  for (const codigo of Object.keys(COSTOS)) {
    const f = porCodigo.get(codigo)!;
    if (f.categoria !== 'ACCESORIO') throw new Error(`${codigo} es ${f.categoria}, se esperaba ACCESORIO.`);
  }

  const [mult] = await uno<{ multiplicador_pa: number; multiplicador_pm: number; multiplicador_pb: number }>(
    `SELECT multiplicador_pa, multiplicador_pm, multiplicador_pb
       FROM cotizador.multiplicador_categoria WHERE categoria = 'ACCESORIO'`
  );
  if (!mult) throw new Error('ACCESORIO no tiene multiplicador configurado.');

  // Un override activo ganaría sobre la tabla base y el precio nuevo no se vería.
  const overrides = await uno<{ codigo: string }>(
    `SELECT codigo FROM cotizador.precio_override WHERE codigo IN (:codigos)`,
    { codigos: todos }
  );
  if (overrides.length) {
    throw new Error(`Tienen override de precio (revisar a mano): ${overrides.map((o) => o.codigo).join(', ')}.`);
  }

  // ─── Escritura, todo o nada ────────────────────────────────────────────────
  const ahora = new Date();
  await sequelize.transaction(async (t) => {
    await ejecutar(
      `ALTER TABLE cotizador.producto ADD COLUMN IF NOT EXISTS precio_a_cotizar BOOLEAN NOT NULL DEFAULT false`,
      {},
      t
    );
    console.log('  ✔ Columna cotizador.producto.precio_a_cotizar (BOOLEAN NOT NULL DEFAULT false)');

    for (const [codigo, costo] of Object.entries(COSTOS)) {
      const f = porCodigo.get(codigo)!;
      const antes = {
        costo_unitario: f.costo_unitario,
        precio_pa: f.precio_pa,
        precio_pm: f.precio_pm,
        precio_pb: f.precio_pb,
      };
      const despues = {
        costo_unitario: round2(costo),
        precio_pa: round2(costo * Number(mult.multiplicador_pa)),
        precio_pm: round2(costo * Number(mult.multiplicador_pm)),
        precio_pb: round2(costo * Number(mult.multiplicador_pb)),
      };
      await ejecutar(
        `UPDATE cotizador.producto
            SET costo_unitario = :costo_unitario, precio_pa = :precio_pa, precio_pm = :precio_pm, precio_pb = :precio_pb
          WHERE codigo = :codigo`,
        { ...despues, codigo },
        t
      );
      await ejecutar(
        `INSERT INTO cotizador.precio_historial (fecha, accion, codigo, antes, despues, por, motivo)
         VALUES (:ahora, 'editar-precio', :codigo, :antes::jsonb, :despues::jsonb, :por, :motivo)`,
        {
          ahora,
          codigo,
          antes: JSON.stringify(antes),
          despues: JSON.stringify(despues),
          por: POR,
          motivo: `Costo Templex $${costo} dado por el usuario (2026-09-26); PA/PM/PB con el multiplicador de ACCESORIO.`,
        },
        t
      );
      console.log(
        `  ✔ ${codigo} — costo $${despues.costo_unitario} · PA $${despues.precio_pa} · PM $${despues.precio_pm} · PB $${despues.precio_pb}`
      );
    }

    const nCotizar = await ejecutar(
      `UPDATE cotizador.producto SET precio_a_cotizar = true WHERE codigo IN (:codigos)`,
      { codigos: A_COTIZAR },
      t
    );
    if (nCotizar !== A_COTIZAR.length) throw new Error(`precio_a_cotizar: se esperaban ${A_COTIZAR.length} filas, hubo ${nCotizar}.`);
    console.log(`  ✔ precio_a_cotizar = true: ${A_COTIZAR.join(', ')}`);

    const nPerf = await ejecutar(
      `UPDATE cotizador.producto SET unidad = 'UND' WHERE codigo IN (:codigos) AND unidad = 'X METRO'`,
      { codigos: PERFORACIONES },
      t
    );
    console.log(`  ✔ Unidad X METRO → UND: ${nPerf} de ${PERFORACIONES.length} perforaciones`);
  });

  // ─── Equivalencia de $175 (transacción propia, la del controlador) ─────────
  const [pp] = await uno<{ activo: boolean; precio_actual: string; catalogo_producto_id: number }>(
    `SELECT activo, precio_actual, catalogo_producto_id FROM proveedor_producto WHERE id = :id`,
    { id: EQUIVALENCIA_175.id }
  );
  if (!pp) {
    console.log(`  · ProveedorProducto #${EQUIVALENCIA_175.id} no existe: nada que desvincular.`);
  } else if (!pp.activo) {
    console.log(`  · ProveedorProducto #${EQUIVALENCIA_175.id} ya estaba desvinculada.`);
  } else if (pp.catalogo_producto_id !== EQUIVALENCIA_175.catalogoId || Number(pp.precio_actual) !== EQUIVALENCIA_175.precio) {
    throw new Error(
      `ProveedorProducto #${EQUIVALENCIA_175.id} ya no es la de PERF01 a $175 ` +
        `(catálogo ${pp.catalogo_producto_id}, $${pp.precio_actual}): no se toca.`
    );
  } else {
    let status = 200;
    let cuerpo: unknown = null;
    const res = {
      status(s: number) { status = s; return this; },
      json(b: unknown) { cuerpo = b; return this; },
    } as unknown as Response;
    await desvincularEquivalencia({ params: { id: String(EQUIVALENCIA_175.id) } } as unknown as Request, res);
    if (status >= 400) throw new Error(`No se pudo desvincular #${EQUIVALENCIA_175.id}: ${JSON.stringify(cuerpo)}`);
    console.log(`  ✔ Desvinculada ProveedorProducto #${EQUIVALENCIA_175.id} (Templados y Laminados, PERF01 $175)`);
  }

  // Los hooks de auditoría escriben fire-and-forget: darles tiempo antes de cerrar.
  await new Promise((r) => setTimeout(r, 2000));
  console.log('\n⚠ Reinicia el backend para que la caché del Cotizador vea los cambios.');
}

async function revertir() {
  console.log('=== REVERTIR precios de kits, precio a cotizar y perforaciones — 2026-09-26 ===\n');
  const ahora = new Date();
  await sequelize.transaction(async (t) => {
    for (const codigo of Object.keys(COSTOS)) {
      await ejecutar(
        `INSERT INTO cotizador.precio_historial (fecha, accion, codigo, antes, despues, por, motivo)
         SELECT :ahora, 'editar-precio', codigo,
                jsonb_build_object('costo_unitario', costo_unitario, 'precio_pa', precio_pa,
                                   'precio_pm', precio_pm, 'precio_pb', precio_pb),
                '{"costo_unitario":0,"precio_pa":0,"precio_pm":0,"precio_pb":0}'::jsonb,
                :por, 'Reversión del script 2026-09-26 (precios de kits).'
           FROM cotizador.producto WHERE codigo = :codigo`,
        { ahora, codigo, por: POR },
        t
      );
    }
    const nCostos = await ejecutar(
      `UPDATE cotizador.producto SET costo_unitario = 0, precio_pa = 0, precio_pm = 0, precio_pb = 0
        WHERE codigo IN (:codigos)`,
      { codigos: Object.keys(COSTOS) },
      t
    );
    const nCotizar = await ejecutar(
      `UPDATE cotizador.producto SET precio_a_cotizar = false WHERE codigo IN (:codigos)`,
      { codigos: A_COTIZAR },
      t
    );
    const nPerf = await ejecutar(
      `UPDATE cotizador.producto SET unidad = 'X METRO' WHERE codigo IN (:codigos) AND unidad = 'UND'`,
      { codigos: PERFORACIONES },
      t
    );
    console.log(`  ✔ ${nCostos} precios a $0, ${nCotizar} sin precio a cotizar, ${nPerf} perforaciones a X METRO`);
  });
  console.log('\n⚠ Reinicia el backend para que la caché del Cotizador vea los cambios.');
}

(process.argv.includes('--revertir') ? revertir() : aplicar())
  .then(() => sequelize.close())
  .catch(async (e) => {
    console.error('\n✖', e instanceof Error ? e.message : e);
    await sequelize.close();
    process.exit(1);
  });
