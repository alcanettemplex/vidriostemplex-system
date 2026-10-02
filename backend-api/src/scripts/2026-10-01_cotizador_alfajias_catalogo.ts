/**
 * Script: 2026-10-01_cotizador_alfajias_catalogo.ts
 *
 * Propósito: que el asesor pueda ELEGIR la alfajía de la ventana (antes un sí/no
 * que solo cobraba el sillar alfajía 581 en 5020 mate). Da de alta en el
 * Cotizador las alfajías del catálogo general del ERP que todavía no están
 * (`catalogo_productos.nombre ILIKE '%ALFAJIA%'`, con color legible en el
 * nombre — ver `analizarAlfajia` en lib/alfajias.ts), VINCULADAS, en
 * PERFILERIA y por `X METRO`.
 *
 * Costo de cada alta (decisiones del usuario, 2026-10-01), en este orden:
 *   1. Con precio de proveedor seguido: el de la sincronización con
 *      Proveedores (`recalcularCostosDesdeProveedor`, el más alto de 6 meses).
 *   2. Sin precio pero con la MISMA referencia en otro color con precio: toma
 *      ese costo (el más alto si hay varios). Cuentan los precios de proveedor
 *      y los 5 costos escritos a mano que ya tenía el Cotizador.
 *   3. Si no: $70.000 de proveedor POR TIRA de 6 m → $11.666,67 el metro.
 * El precio heredado o provisional se FIJA al darla de alta: cuando Proveedores
 * cargue su precio real (factura o lista), la sincronización lo reemplaza sola.
 * Las 5 alfajías que ya estaban, con costo escrito a mano, NO se tocan.
 *
 * Ejecutar:  npx ts-node src/scripts/2026-10-01_cotizador_alfajias_catalogo.ts [--dry-run]
 * Revertir:  npx ts-node src/scripts/2026-10-01_cotizador_alfajias_catalogo.ts --revertir
 *            (borra las altas de este script si ningún ítem guardado las usa.)
 * Después:   reiniciar el backend para recargar la caché del Cotizador.
 */

import { QueryTypes, Transaction } from 'sequelize';
import sequelize from '../config/database';
import * as cache from '../cotizador/cache';
import { recalcularCostosDesdeProveedor } from '../cotizador/lib/sincronizacionProveedores';
import { analizarAlfajia, DatosAlfajia } from '../cotizador/lib/alfajias';

const POR = 'script-2026-10-01-alfajias';
const DRY_RUN = process.argv.includes('--dry-run');
const PRECIO_TIRA_PROVISIONAL = 70000;
const METROS_TIRA = 6;
const COSTO_PROVISIONAL_METRO = Math.round((PRECIO_TIRA_PROVISIONAL / METROS_TIRA) * 100) / 100;

type Fila = Record<string, unknown>;

async function consultar<T = Fila>(sql: string, replacements: Fila = {}, t?: Transaction): Promise<T[]> {
  return sequelize.query(sql, { type: QueryTypes.SELECT, replacements, transaction: t }) as Promise<T[]>;
}

async function ejecutar(sql: string, replacements: Fila = {}, t?: Transaction): Promise<number> {
  const [, meta] = (await sequelize.query(sql, { replacements, transaction: t })) as [unknown, { rowCount?: number }];
  return meta?.rowCount ?? 0;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

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
  datos: DatosAlfajia;
}

const claveRef = (d: DatosAlfajia) => `${d.tipo}|${d.ref}`;

async function aplicar() {
  console.log(`=== Cotizador: alfajías del catálogo — 2026-10-01${DRY_RUN ? ' (DRY RUN)' : ''} ===\n`);

  const [mult] = await consultar<{ pa: number; pm: number; pb: number }>(
    `SELECT multiplicador_pa AS pa, multiplicador_pm AS pm, multiplicador_pb AS pb
       FROM cotizador.multiplicador_categoria WHERE categoria = 'PERFILERIA'`
  );
  if (!mult) throw new Error('PERFILERIA no tiene multiplicador configurado.');
  const precios = (costo: number) => ({
    costo_unitario: r2(costo),
    precio_pa: r2(costo * Number(mult.pa)),
    precio_pm: r2(costo * Number(mult.pm)),
    precio_pb: r2(costo * Number(mult.pb)),
  });

  const filasErp = await consultar<{ id: number; codigo: string; nombre: string }>(
    `SELECT cp.id, UPPER(TRIM(cp.codigo)) AS codigo, cp.nombre
       FROM public.catalogo_productos cp
      WHERE cp.activo AND cp.codigo IS NOT NULL AND cp.nombre ILIKE '%ALFAJIA%'
        AND NOT EXISTS (
          SELECT 1 FROM cotizador.producto p
           WHERE p.catalogo_producto_id = cp.id OR UPPER(p.codigo) = UPPER(TRIM(cp.codigo)))
      ORDER BY cp.codigo`
  );
  const candidatas: Candidata[] = [];
  const sinColor: string[] = [];
  for (const f of filasErp) {
    const datos = analizarAlfajia(f.nombre);
    if (datos) candidatas.push({ ...f, datos });
    else sinColor.push(`${f.codigo} ${f.nombre}`);
  }
  const largas = candidatas.filter((c) => c.codigo.length > 20);
  if (largas.length) throw new Error(`Códigos de más de 20 caracteres: ${largas.map((c) => c.codigo).join(', ')}.`);

  const conProveedor = new Set(
    candidatas.length
      ? (await consultar<{ catalogo_producto_id: number }>(SQL_CON_PROVEEDOR, { ids: candidatas.map((c) => c.id) })).map(
          (f) => Number(f.catalogo_producto_id)
        )
      : []
  );

  // Fuentes de precio para heredar: las que ya estaban en el Cotizador con
  // costo (las 5 escritas a mano) — las de proveedor se suman tras sincronizar.
  const existentes = await consultar<{ codigo: string; descripcion: string; costo_unitario: number }>(
    `SELECT codigo, descripcion, costo_unitario FROM cotizador.producto
      WHERE descripcion ILIKE '%ALFAJIA%' AND COALESCE(costo_unitario, 0) > 0`
  );

  console.log(`Altas: ${candidatas.length} alfajías`);
  for (const c of candidatas) {
    console.log(`  ${conProveedor.has(Number(c.id)) ? '$ ' : '· '}${c.codigo.padEnd(10)} ${c.nombre}`);
  }
  console.log('  ($ = con precio de proveedor · · = heredado o provisional)');
  if (sinColor.length) console.log(`\nSin color en el nombre (no se ofrecen, no se dan de alta): ${sinColor.join(' · ')}`);
  console.log(`\nYa estaban (no se tocan): ${existentes.map((e) => `${e.codigo} $${r2(Number(e.costo_unitario))}/m`).join(' · ')}`);

  if (DRY_RUN) {
    console.log('\n(dry run: no se escribió nada)');
    return;
  }

  // ─── 1. Altas con el costo provisional (nunca en cero: AUSENTE ≠ CERO) ──────
  const ahora = new Date();
  const provisional = precios(COSTO_PROVISIONAL_METRO);
  await sequelize.transaction(async (t) => {
    for (const c of candidatas) {
      await ejecutar(
        `INSERT INTO cotizador.producto
           (codigo, descripcion, categoria, unidad, costo_unitario, precio_pa, precio_pm, precio_pb,
            origen, provisional, fuente, catalogo_producto_id, creado_en, creado_por)
         VALUES (:codigo, :descripcion, 'PERFILERIA', 'X METRO', :costo, :pa, :pm, :pb,
            'ALTA', false, 'catálogo general', :id, :ahora, :por)`,
        {
          codigo: c.codigo, descripcion: String(c.nombre).slice(0, 120), id: c.id, ahora, por: POR,
          costo: provisional.costo_unitario, pa: provisional.precio_pa, pm: provisional.precio_pm, pb: provisional.precio_pb,
        },
        t
      );
      await ejecutar(
        `INSERT INTO cotizador.precio_historial (fecha, accion, codigo, antes, despues, por, motivo)
         VALUES (:ahora, 'dar-de-alta', :codigo, NULL, :despues::jsonb, :por, :motivo)`,
        {
          ahora,
          codigo: c.codigo,
          despues: JSON.stringify({ ...provisional, categoria: 'PERFILERIA', unidad: 'X METRO', activo: true }),
          por: POR,
          motivo: `Alfajía traída del catálogo general (id ${c.id}) para elegirla en ventanas, con costo provisional de $${PRECIO_TIRA_PROVISIONAL} la tira.`,
        },
        t
      );
    }
  });
  console.log(`\n  ✔ ${candidatas.length} altas con costo provisional $${COSTO_PROVISIONAL_METRO}/m`);

  // ─── 2. Las que tienen proveedor: la sincronización de siempre ─────────────
  await cache.precargar();
  const idsProv = candidatas.filter((c) => conProveedor.has(Number(c.id))).map((c) => Number(c.id));
  const resultados = await recalcularCostosDesdeProveedor(idsProv);
  const sincronizadas = new Set<string>();
  for (const r of resultados) {
    for (const c of r.cambios) {
      sincronizadas.add(c.codigo);
      console.log(`  $ ${c.codigo} — proveedor: costo $${c.despues.costo_unitario}/m · PA $${c.despues.precio_pa}`);
    }
    for (const o of r.omitidos) console.log(`  ⚠ ${o.codigo}: ${o.motivo}`);
  }

  // ─── 3. Herencia de la misma referencia en otro color ──────────────────────
  const costoActual = await consultar<{ codigo: string; costo_unitario: number }>(
    `SELECT codigo, costo_unitario FROM cotizador.producto WHERE codigo IN (:codigos)`,
    { codigos: [...sincronizadas, '__ninguno__'] }
  );
  const fuentes: Array<{ codigo: string; datos: DatosAlfajia; costo: number }> = [];
  for (const e of existentes) {
    const datos = analizarAlfajia(e.descripcion);
    if (datos) fuentes.push({ codigo: e.codigo, datos, costo: Number(e.costo_unitario) });
  }
  for (const f of costoActual) {
    const c = candidatas.find((x) => x.codigo === f.codigo);
    if (c) fuentes.push({ codigo: f.codigo, datos: c.datos, costo: Number(f.costo_unitario) });
  }

  let heredadas = 0;
  let provisionales = 0;
  await sequelize.transaction(async (t) => {
    for (const c of candidatas) {
      if (sincronizadas.has(c.codigo)) continue;
      const hermanas = fuentes
        .filter((f) => claveRef(f.datos) === claveRef(c.datos) && f.datos.color !== c.datos.color && f.costo > 0)
        .sort((a, b) => b.costo - a.costo);
      const fuente = hermanas[0];
      if (!fuente) {
        provisionales++;
        console.log(`  · ${c.codigo} — provisional $${COSTO_PROVISIONAL_METRO}/m ($${PRECIO_TIRA_PROVISIONAL} la tira)`);
        continue;
      }
      const nuevos = precios(fuente.costo);
      await ejecutar(
        `UPDATE cotizador.producto SET costo_unitario = :costo, precio_pa = :pa, precio_pm = :pm, precio_pb = :pb
          WHERE codigo = :codigo`,
        { codigo: c.codigo, costo: nuevos.costo_unitario, pa: nuevos.precio_pa, pm: nuevos.precio_pm, pb: nuevos.precio_pb },
        t
      );
      await ejecutar(
        `INSERT INTO cotizador.precio_historial (fecha, accion, codigo, antes, despues, por, motivo)
         VALUES (:ahora, 'editar-precio', :codigo, :antes::jsonb, :despues::jsonb, :por, :motivo)`,
        {
          ahora,
          codigo: c.codigo,
          antes: JSON.stringify(provisional),
          despues: JSON.stringify(nuevos),
          por: POR,
          motivo: `Precio heredado de ${fuente.codigo} (misma referencia ${c.datos.refVisible}, color ${fuente.datos.color}). Proveedores lo reemplaza al cargar el suyo.`,
        },
        t
      );
      heredadas++;
      console.log(`  ↳ ${c.codigo} — heredado de ${fuente.codigo}: $${nuevos.costo_unitario}/m · PA $${nuevos.precio_pa}`);
    }
  });

  console.log(`\nResumen: ${sincronizadas.size} con proveedor · ${heredadas} heredadas · ${provisionales} provisionales.`);
  console.log('⚠ Reinicia el backend para que la caché del Cotizador vea los cambios.');
}

async function revertir() {
  console.log('=== Revertir alfajías del catálogo — 2026-10-01 ===\n');
  const altas = await consultar<{ codigo: string }>(`SELECT codigo FROM cotizador.producto WHERE creado_por = :por`, { por: POR });
  const codigos = altas.map((a) => a.codigo);
  if (codigos.length === 0) {
    console.log('No hay altas de este script.');
    return;
  }
  const usadas = await consultar<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM cotizador.cotizacion_item WHERE input->>'alfajiaCodigo' IN (:codigos)`,
    { codigos }
  );
  if (Number(usadas[0]?.n) > 0) {
    throw new Error(`${usadas[0].n} ítem(s) guardados usan una de estas alfajías: revísalos antes de revertir.`);
  }
  const n = await ejecutar(`DELETE FROM cotizador.producto WHERE creado_por = :por`, { por: POR });
  console.log(`  ✔ ${n} altas borradas (el historial de precios se conserva).`);
  console.log('⚠ Reinicia el backend para que la caché del Cotizador vea los cambios.');
}

(process.argv.includes('--revertir') ? revertir() : aplicar())
  .then(() => sequelize.close())
  .catch(async (e) => {
    console.error('\n✖', e instanceof Error ? e.message : e);
    await sequelize.close();
    process.exit(1);
  });
