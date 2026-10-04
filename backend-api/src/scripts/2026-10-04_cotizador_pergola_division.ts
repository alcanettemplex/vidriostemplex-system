/**
 * Script: 2026-10-04_cotizador_pergola_division.ts
 *
 * Propósito: dejar la base lista para los productos nuevos del Cotizador,
 * Pérgola y División / Fachada (decisiones del usuario, 2026-10-04):
 *
 *   1. Dos tarifas nuevas de mano de obra en `cotizador.parametro` (tabla de una
 *      fila, una columna por tarifa), antes de AIU e IVA y editables después en
 *      Configuración → Parámetros:
 *        mo_instalacion_pergola_m2   = 120.000
 *        mo_instalacion_division_m2  = 120.000
 *   2. Alta en el Cotizador de 4 accesorios que están en el catálogo general con
 *      precio de proveedor (ACCESORIO, UND, vinculados): bisagras omega BAO0101
 *      (mate), BAO0301 (bronce), BAO0602 (negra) y la Yale mini CHE0101. El costo
 *      lo fija la sincronización con Proveedores (el más alto de 6 meses).
 *   3. EMP1301 (empaque antirretráctil 3831): rótulo `UND` → `X METRO`. Ya se
 *      cobra por metro de perímetro en proyectantes y en los diseños 3831, y su
 *      costo ($588) es por metro: el rótulo estaba mal. No mueve ningún precio.
 *
 * ⚠️ ORDEN: correr ANTES de desplegar el backend con los módulos nuevos. El
 * modelo `CotizadorParametro` declara las dos columnas y la caché las lee al
 * arrancar: sin ellas, el Cotizador no carga.
 *
 * Simular:  npx ts-node --files src/scripts/2026-10-04_cotizador_pergola_division.ts
 * Aplicar:  npx ts-node --files src/scripts/2026-10-04_cotizador_pergola_division.ts --aplicar
 * Revertir: npx ts-node --files src/scripts/2026-10-04_cotizador_pergola_division.ts --revertir
 *           (borra las altas si ningún ítem guardado las usa, devuelve EMP1301 a
 *           UND y quita las columnas — hacerlo solo con el backend anterior.)
 * Después:  reiniciar el backend para recargar la caché del Cotizador.
 */

import { QueryTypes, Transaction } from 'sequelize';
import sequelize from '../config/database';

const POR = 'script-2026-10-04-pergola-division';
const APLICAR = process.argv.includes('--aplicar');
const REVERTIR = process.argv.includes('--revertir');

const TARIFAS = [
  { columna: 'mo_instalacion_pergola_m2', valor: 120000 },
  { columna: 'mo_instalacion_division_m2', valor: 120000 },
];
const ALTAS = ['BAO0101', 'BAO0301', 'BAO0602', 'CHE0101'];
const DESCRIPCION_ALTA: Record<string, string> = {
  BAO0101: 'BISAGRA OMEGA ALUMINIO 4X2 MATE',
  BAO0301: 'BISAGRA OMEGA ALUMINIO 4X2 BRONCE',
  BAO0602: 'BISAGRA OMEGA ALUMINIO 4X2 NEGRA',
  CHE0101: 'CHAPA YALE MINI DE INCRUSTAR LLAVE-MARIPOSA',
};

type Fila = Record<string, unknown>;
const r2 = (n: number) => Math.round(n * 100) / 100;

async function consultar<T = Fila>(sql: string, replacements: Fila = {}, t?: Transaction): Promise<T[]> {
  return sequelize.query(sql, { type: QueryTypes.SELECT, replacements, transaction: t }) as Promise<T[]>;
}
async function ejecutar(sql: string, replacements: Fila = {}, t?: Transaction): Promise<void> {
  await sequelize.query(sql, { replacements, transaction: t });
}

async function columnasExistentes(): Promise<Set<string>> {
  const filas = await consultar<{ c: string }>(
    `SELECT column_name AS c FROM information_schema.columns
      WHERE table_schema = 'cotizador' AND table_name = 'parametro' AND column_name IN (:cols)`,
    { cols: TARIFAS.map((x) => x.columna) }
  );
  return new Set(filas.map((f) => f.c));
}

async function aplicar() {
  console.log(`=== Cotizador: Pérgola y División / Fachada — 2026-10-04${APLICAR ? '' : ' (SIMULACIÓN)'} ===\n`);

  // ─── 1. Tarifas ──────────────────────────────────────────────────────────
  const yaEstan = await columnasExistentes();
  for (const t of TARIFAS) console.log(`  ${yaEstan.has(t.columna) ? '= ya existe' : '+ agregar  '} ${t.columna} = ${t.valor}`);

  // ─── 2. Altas ────────────────────────────────────────────────────────────
  const [mult] = await consultar<{ pa: number; pm: number; pb: number }>(
    `SELECT multiplicador_pa AS pa, multiplicador_pm AS pm, multiplicador_pb AS pb
       FROM cotizador.multiplicador_categoria WHERE categoria = 'ACCESORIO'`
  );
  if (!mult) throw new Error('ACCESORIO no tiene multiplicador configurado.');
  const candidatas = await consultar<{ id: number; codigo: string; costo: number | null; existe: boolean }>(
    `SELECT cp.id, UPPER(TRIM(cp.codigo)) AS codigo,
            (SELECT MAX(pp.precio_actual) FROM public.proveedor_producto pp
               JOIN public.proveedores pr ON pr.id = pp.proveedor_id
              WHERE pp.catalogo_producto_id = cp.id AND pp.activo AND pr.activo AND pr.seguir_precios = true) AS costo,
            EXISTS (SELECT 1 FROM cotizador.producto p
                     WHERE p.catalogo_producto_id = cp.id OR UPPER(p.codigo) = UPPER(TRIM(cp.codigo))) AS existe
       FROM public.catalogo_productos cp
      WHERE UPPER(TRIM(cp.codigo)) IN (:codigos)
      ORDER BY 2`,
    { codigos: ALTAS }
  );
  const faltan = ALTAS.filter((c) => !candidatas.some((x) => x.codigo === c));
  if (faltan.length) throw new Error(`No están en el catálogo general: ${faltan.join(', ')}.`);
  const sinCosto = candidatas.filter((c) => !c.existe && !(Number(c.costo) > 0));
  if (sinCosto.length) throw new Error(`Sin precio de proveedor seguido: ${sinCosto.map((c) => c.codigo).join(', ')}.`);
  for (const c of candidatas) {
    console.log(`  ${c.existe ? '= ya está  ' : '+ alta     '} ${c.codigo.padEnd(8)} costo proveedor $${r2(Number(c.costo))} → PA $${r2(Number(c.costo) * Number(mult.pa))}`);
  }

  // ─── 3. EMP1301 ──────────────────────────────────────────────────────────
  const [emp] = await consultar<{ unidad: string }>(`SELECT unidad FROM cotizador.producto WHERE codigo = 'EMP1301'`);
  if (!emp) throw new Error('EMP1301 no está en el Cotizador.');
  console.log(`  ${emp.unidad === 'X METRO' ? '= ya está  ' : '~ corregir '} EMP1301 unidad ${emp.unidad} → X METRO`);

  if (!APLICAR) {
    console.log('\nSimulación: no se escribió nada. Corre con --aplicar para escribir.');
    return;
  }

  const ahora = new Date();
  await sequelize.transaction(async (t) => {
    for (const x of TARIFAS) {
      if (yaEstan.has(x.columna)) continue;
      await ejecutar(
        `ALTER TABLE cotizador.parametro ADD COLUMN ${x.columna} DOUBLE PRECISION NOT NULL DEFAULT ${Number(x.valor)}`,
        {},
        t
      );
    }
    for (const c of candidatas) {
      if (c.existe) continue;
      const costo = r2(Number(c.costo));
      const precios = {
        costo_unitario: costo,
        precio_pa: r2(costo * Number(mult.pa)),
        precio_pm: r2(costo * Number(mult.pm)),
        precio_pb: r2(costo * Number(mult.pb)),
      };
      await ejecutar(
        `INSERT INTO cotizador.producto
           (codigo, descripcion, categoria, unidad, costo_unitario, precio_pa, precio_pm, precio_pb,
            origen, provisional, fuente, catalogo_producto_id, creado_en, creado_por)
         VALUES (:codigo, :descripcion, 'ACCESORIO', 'UND', :costo, :pa, :pm, :pb,
            'ALTA', false, 'catálogo general', :id, :ahora, :por)`,
        {
          codigo: c.codigo, descripcion: DESCRIPCION_ALTA[c.codigo], id: c.id, ahora, por: POR,
          costo: precios.costo_unitario, pa: precios.precio_pa, pm: precios.precio_pm, pb: precios.precio_pb,
        },
        t
      );
      await ejecutar(
        `INSERT INTO cotizador.precio_historial (fecha, accion, codigo, antes, despues, por, motivo)
         VALUES (:ahora, 'dar-de-alta', :codigo, NULL, :despues::jsonb, :por, :motivo)`,
        {
          ahora, codigo: c.codigo, por: POR,
          despues: JSON.stringify({ ...precios, categoria: 'ACCESORIO', unidad: 'UND', activo: true }),
          motivo: `Traído del catálogo general (id ${c.id}) para División / Fachada enmarcada, con el precio de proveedor más alto.`,
        },
        t
      );
    }
    if (emp.unidad !== 'X METRO') {
      await ejecutar(`UPDATE cotizador.producto SET unidad = 'X METRO' WHERE codigo = 'EMP1301'`, {}, t);
      await ejecutar(
        `INSERT INTO cotizador.precio_historial (fecha, accion, codigo, antes, despues, por, motivo)
         VALUES (:ahora, 'editar-precio', 'EMP1301', :antes::jsonb, :despues::jsonb, :por, :motivo)`,
        {
          ahora, por: POR,
          antes: JSON.stringify({ unidad: emp.unidad }),
          despues: JSON.stringify({ unidad: 'X METRO' }),
          motivo: 'El empaque antirretráctil se cobra por metro de perímetro y su costo es por metro: el rótulo UND estaba mal. No cambia ningún precio.',
        },
        t
      );
    }
  });
  console.log('\n  ✔ Aplicado. Reinicia el backend para recargar la caché del Cotizador.');
}

async function revertir() {
  console.log('=== Revertir Pérgola y División / Fachada — 2026-10-04 ===\n');
  const altas = (await consultar<{ codigo: string }>(`SELECT codigo FROM cotizador.producto WHERE creado_por = :por`, { por: POR }))
    .map((a) => a.codigo);
  if (altas.length) {
    const [{ n }] = await consultar<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM cotizador.cotizacion_item WHERE resultado::text ~ :patron`,
      { patron: altas.join('|') }
    );
    if (Number(n) > 0) throw new Error(`${n} ítem(s) guardados usan estos accesorios: revísalos antes de revertir.`);
  }
  if (!APLICAR) {
    console.log(`Simulación: se borrarían ${altas.length} altas, EMP1301 volvería a UND y se quitarían las 2 columnas. Usa --revertir --aplicar.`);
    return;
  }
  await sequelize.transaction(async (t) => {
    await ejecutar(`DELETE FROM cotizador.producto WHERE creado_por = :por`, { por: POR }, t);
    await ejecutar(`UPDATE cotizador.producto SET unidad = 'UND' WHERE codigo = 'EMP1301'`, {}, t);
    for (const x of TARIFAS) await ejecutar(`ALTER TABLE cotizador.parametro DROP COLUMN IF EXISTS ${x.columna}`, {}, t);
  });
  console.log('  ✔ Revertido (el historial de precios se conserva). Reinicia el backend.');
}

(REVERTIR ? revertir() : aplicar())
  .then(() => sequelize.close())
  .catch(async (e) => {
    console.error('\n✖', e instanceof Error ? e.message : e);
    await sequelize.close();
    process.exit(1);
  });
