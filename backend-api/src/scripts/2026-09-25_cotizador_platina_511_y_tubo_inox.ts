/**
 * Script: 2026-09-25_cotizador_platina_511_y_tubo_inox.ts
 *
 * Propósito: volver cotizables 13 de los 18 diseños bloqueados del Cotizador
 * (ver docs/modulos/cotizador.md → "Los 18 diseños que no se pueden cotizar").
 * Los 18 tenían un perfil con `codigos_por_color = {}`: el motor no sabía qué
 * código Templex cobrar.
 *
 *   - `511` "Retícula de Aluminio" (16 renglones, 8 diseños de ventanas 5020 /
 *     744 / 8025) = PLATINA P-30 1 x 1 1/2 — dato del usuario, 2026-09-25:
 *     MATE P300101 · CRUDO P300301 · NEGRO P300601. Los otros tres colores no
 *     existen: el motor cae a otro acabado y lo avisa (comportamiento vigente).
 *     Sin proveedor con precio: costo manual $80.000 por barra de 6 m
 *     (= $13.333,33/m), el mismo en los tres colores. Proveedores lo
 *     reemplazará solo cuando se mapee una factura.
 *   - `ROD1PULG` "Tubo Redondo 1 Pulgada" (6 renglones, 5 diseños de cabina) =
 *     TUB0316, tubo inox de 1.800 mm — dato del usuario, 2026-09-23. Se cobra
 *     por TUBO ENTERO (`largo_pieza_mm = 1800`, ver motorDespiece.ts); el costo
 *     sale de ACVICOL (modalidad UNIDAD = precio por tubo). Mismo código en los
 *     seis colores: el inox no tiene acabado.
 *
 * Quedan fuera los 5 diseños de Cabina Deslizante Torino (`REC30X10`): falta el
 * código del usuario.
 *
 * `cotizable` es un flag GRABADO en la siembra, no se recalcula: por eso este
 * script lo escribe en la misma transacción que los códigos.
 *
 * SQL crudo a propósito: el modelo `CotizadorProducto` gana `largo_pieza_mm` en
 * el mismo cambio, y el script no debe depender de qué versión del modelo esté
 * compilada. Las altas dejan su fila `dar-de-alta` en `cotizador.precio_historial`,
 * igual que `POST /catalogo-general/importar`.
 *
 * Ejecutar:  npx ts-node src/scripts/2026-09-25_cotizador_platina_511_y_tubo_inox.ts
 * Revertir:  npx ts-node src/scripts/2026-09-25_cotizador_platina_511_y_tubo_inox.ts --revertir
 *            (la columna `largo_pieza_mm` NO se borra: el código la lee.)
 * Después:   reiniciar el backend para recargar la caché del Cotizador.
 */

import { QueryTypes, Transaction } from 'sequelize';
import sequelize from '../config/database';

const POR = 'script-2026-09-25';
const COSTO_BARRA_PLATINA = 80000;
const METROS_BARRA = 6;

const PLATINAS = [
  { codigo: 'P300101', catalogoId: 782, color: 'MATE' },
  { codigo: 'P300301', catalogoId: 783, color: 'CRUDO' },
  { codigo: 'P300601', catalogoId: 784, color: 'NEGRO' },
] as const;

const TUBO = { codigo: 'TUB0316', catalogoId: 1114, largoPiezaMm: 1800 } as const;
const COLORES = ['MATE', 'CRUDO', 'NEGRO', 'BLANCO', 'BRONCE', 'GRISPLATA'] as const;

const RENGLONES_ESPERADOS = { '511': 16, ROD1PULG: 6 } as const;
const DISENOS_ESPERADOS = 13;
const CODIGOS = [...PLATINAS.map((p) => p.codigo), TUBO.codigo];

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

async function aplicar() {
  console.log('=== Cotizador: platina 511 y tubo inox ROD1PULG — 2026-09-25 ===\n');

  // ─── Validaciones previas (nada se escribe si alguna falla) ───────────────
  const catalogo = await uno<{ id: number; codigo: string; nombre: string; activo: boolean }>(
    `SELECT id, codigo, nombre, activo FROM catalogo_productos WHERE id IN (:ids)`,
    { ids: [...PLATINAS.map((p) => p.catalogoId), TUBO.catalogoId] }
  );
  for (const esperado of [...PLATINAS, TUBO]) {
    const fila = catalogo.find((c) => c.id === esperado.catalogoId);
    if (!fila || fila.codigo !== esperado.codigo || !fila.activo) {
      throw new Error(`catalogo_productos ${esperado.catalogoId} no es ${esperado.codigo} activo.`);
    }
  }

  const yaEstan = await uno<{ codigo: string }>(
    `SELECT codigo FROM cotizador.producto WHERE codigo IN (:codigos) OR catalogo_producto_id IN (:ids)`,
    { codigos: CODIGOS, ids: [...PLATINAS.map((p) => p.catalogoId), TUBO.catalogoId] }
  );
  if (yaEstan.length) throw new Error(`Ya están en el Cotizador: ${yaEstan.map((f) => f.codigo).join(', ')}.`);

  const [mult] = await uno<{ multiplicador_pa: number; multiplicador_pm: number; multiplicador_pb: number }>(
    `SELECT multiplicador_pa, multiplicador_pm, multiplicador_pb
       FROM cotizador.multiplicador_categoria WHERE categoria = 'PERFILERIA'`
  );
  if (!mult) throw new Error('PERFILERIA no tiene multiplicador configurado.');

  // Mismo filtro que sincronizacionProveedores.ts: equivalencia activa con
  // precio, proveedor activo y con seguir_precios = true. Modalidad UNIDAD =
  // precio por tubo, que es justo lo que se cobra.
  const proveedoresTubo = await uno<{ precio_actual: string; unidad_compra: string; nombre_comercial: string }>(
    `SELECT pp.precio_actual, pp.unidad_compra, p.nombre_comercial
       FROM proveedor_producto pp JOIN proveedores p ON p.id = pp.proveedor_id
      WHERE pp.catalogo_producto_id = :id AND pp.activo AND pp.precio_actual IS NOT NULL
        AND p.activo AND p.seguir_precios = true
      ORDER BY pp.precio_actual ASC`,
    { id: TUBO.catalogoId }
  );
  const tuboProv = proveedoresTubo[0];
  if (!tuboProv || tuboProv.unidad_compra !== 'UNIDAD') {
    throw new Error('TUB0316 no tiene un proveedor seguido con precio por UNIDAD: revisar antes de continuar.');
  }
  const costoTubo = Number(tuboProv.precio_actual);

  for (const [ref, n] of Object.entries(RENGLONES_ESPERADOS)) {
    const [fila] = await uno<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM cotizador.diseno_perfil
        WHERE ref = :ref AND codigos_por_color = '{}'::jsonb`,
      { ref }
    );
    if (fila.n !== n) throw new Error(`Se esperaban ${n} renglones vacíos de ${ref} y hay ${fila.n}.`);
  }

  // ─── Escritura, todo o nada ────────────────────────────────────────────────
  const costoPlatina = COSTO_BARRA_PLATINA / METROS_BARRA;
  const ahora = new Date();

  await sequelize.transaction(async (t) => {
    await ejecutar(`ALTER TABLE cotizador.producto ADD COLUMN IF NOT EXISTS largo_pieza_mm DOUBLE PRECISION`, {}, t);
    await ejecutar(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'producto_largo_pieza_mm_check') THEN
           ALTER TABLE cotizador.producto ADD CONSTRAINT producto_largo_pieza_mm_check
             CHECK (largo_pieza_mm IS NULL OR largo_pieza_mm > 0);
         END IF;
       END $$;`,
      {},
      t
    );
    console.log('  ✔ Columna cotizador.producto.largo_pieza_mm (+ CHECK > 0)');

    const altas = [
      ...PLATINAS.map((p) => ({
        codigo: p.codigo,
        catalogoId: p.catalogoId,
        unidad: 'X METRO',
        costo: costoPlatina,
        largo: null as number | null,
        motivo:
          `Traído del catálogo general (id ${p.catalogoId}) con costo manual: $${COSTO_BARRA_PLATINA} ` +
          `por barra de ${METROS_BARRA} m, dato del usuario 2026-09-25. Retícula 511.`,
      })),
      {
        codigo: TUBO.codigo,
        catalogoId: TUBO.catalogoId,
        unidad: 'UND',
        costo: costoTubo,
        largo: TUBO.largoPiezaMm as number | null,
        motivo:
          `Traído del catálogo general (id ${TUBO.catalogoId}). Costo de "${tuboProv.nombre_comercial}" ` +
          `por tubo de ${TUBO.largoPiezaMm} mm; se cobra por pieza entera. Tubo 1" ROD1PULG.`,
      },
    ];

    for (const a of altas) {
      const nombre = catalogo.find((c) => c.id === a.catalogoId)!.nombre;
      const precios = {
        costo_unitario: round2(a.costo),
        precio_pa: round2(a.costo * Number(mult.multiplicador_pa)),
        precio_pm: round2(a.costo * Number(mult.multiplicador_pm)),
        precio_pb: round2(a.costo * Number(mult.multiplicador_pb)),
      };
      await ejecutar(
        `INSERT INTO cotizador.producto
           (codigo, descripcion, categoria, unidad, costo_unitario, precio_pa, precio_pm, precio_pb,
            origen, provisional, fuente, catalogo_producto_id, largo_pieza_mm, creado_en, creado_por)
         VALUES (:codigo, :descripcion, 'PERFILERIA', :unidad, :costo_unitario, :precio_pa, :precio_pm, :precio_pb,
            'ALTA', false, 'catálogo general', :catalogoId, :largo, :ahora, :por)`,
        { ...precios, codigo: a.codigo, descripcion: nombre.slice(0, 120), unidad: a.unidad,
          catalogoId: a.catalogoId, largo: a.largo, ahora, por: POR },
        t
      );
      await ejecutar(
        `INSERT INTO cotizador.precio_historial (fecha, accion, codigo, antes, despues, por, motivo)
         VALUES (:ahora, 'dar-de-alta', :codigo, NULL, :despues::jsonb, :por, :motivo)`,
        { ahora, codigo: a.codigo, despues: JSON.stringify({ ...precios, activo: true }), por: POR,
          motivo: a.motivo.slice(0, 300) },
        t
      );
      console.log(
        `  ✔ Alta ${a.codigo} (${a.unidad}${a.largo ? `, pieza ${a.largo} mm` : ''}) — costo $${precios.costo_unitario}, ` +
          `PA $${precios.precio_pa} · PM $${precios.precio_pm} · PB $${precios.precio_pb}`
      );
    }

    const colores511 = Object.fromEntries(PLATINAS.map((p) => [p.color, p.codigo]));
    const coloresTubo = Object.fromEntries(COLORES.map((c) => [c, TUBO.codigo]));
    const n511 = await ejecutar(
      `UPDATE cotizador.diseno_perfil SET codigos_por_color = :colores::jsonb
        WHERE ref = '511' AND codigos_por_color = '{}'::jsonb`,
      { colores: JSON.stringify(colores511) },
      t
    );
    const nTubo = await ejecutar(
      `UPDATE cotizador.diseno_perfil SET codigos_por_color = :colores::jsonb
        WHERE ref = 'ROD1PULG' AND codigos_por_color = '{}'::jsonb`,
      { colores: JSON.stringify(coloresTubo) },
      t
    );
    if (n511 !== RENGLONES_ESPERADOS['511'] || nTubo !== RENGLONES_ESPERADOS.ROD1PULG) {
      throw new Error(`Renglones actualizados inesperados: 511=${n511}, ROD1PULG=${nTubo}.`);
    }
    console.log(`  ✔ codigos_por_color: ${n511} renglones de 511, ${nTubo} de ROD1PULG`);

    const nDisenos = await ejecutar(
      `UPDATE cotizador.diseno SET cotizable = true, refs_sin_precio = '[]'::jsonb
        WHERE cotizable = false
          AND (refs_sin_precio = '["511"]'::jsonb OR refs_sin_precio = '["ROD1PULG"]'::jsonb)`,
      {},
      t
    );
    if (nDisenos !== DISENOS_ESPERADOS) {
      throw new Error(`Se esperaban ${DISENOS_ESPERADOS} diseños y se habilitarían ${nDisenos}.`);
    }
    console.log(`  ✔ ${nDisenos} diseños marcados cotizables`);
  });

  const resumen = await uno<{ cotizable: boolean; n: number }>(
    `SELECT cotizable, COUNT(*)::int AS n FROM cotizador.diseno GROUP BY 1 ORDER BY 1`
  );
  console.log('\nDiseños:', resumen.map((r) => `${r.cotizable ? 'cotizables' : 'bloqueados'} ${r.n}`).join(' · '));
  console.log('\n⚠ Reinicia el backend para que la caché del Cotizador vea los cambios.');
}

async function revertir() {
  console.log('=== REVERTIR platina 511 y tubo inox ROD1PULG — 2026-09-25 ===\n');

  // Si alguna cotización ya usó estos códigos, borrarlos dejaría ítems
  // guardados apuntando a productos que no existen. Mejor frenar.
  const usados = await uno<{ id: number }>(
    `SELECT id FROM cotizador.cotizacion_item
      WHERE resultado::text ~ :patron OR input::text ~ :patron LIMIT 5`,
    { patron: CODIGOS.join('|') }
  );
  if (usados.length) {
    throw new Error(`Hay ítems de cotización que ya usan estos códigos (ids ${usados.map((u) => u.id).join(', ')}): no se revierte.`);
  }

  const ahora = new Date();
  await sequelize.transaction(async (t) => {
    const nDisenos = await ejecutar(
      `UPDATE cotizador.diseno d SET cotizable = false, refs_sin_precio = to_jsonb(ARRAY[x.ref])
         FROM (SELECT DISTINCT diseno_id, ref FROM cotizador.diseno_perfil WHERE ref IN ('511', 'ROD1PULG')) x
        WHERE d.id = x.diseno_id`,
      {},
      t
    );
    const nPerfiles = await ejecutar(
      `UPDATE cotizador.diseno_perfil SET codigos_por_color = '{}'::jsonb WHERE ref IN ('511', 'ROD1PULG')`,
      {},
      t
    );
    for (const codigo of CODIGOS) {
      await ejecutar(
        `INSERT INTO cotizador.precio_historial (fecha, accion, codigo, antes, despues, por, motivo)
         SELECT :ahora, 'dar-de-baja', codigo,
                jsonb_build_object('costo_unitario', costo_unitario, 'precio_pa', precio_pa,
                                   'precio_pm', precio_pm, 'precio_pb', precio_pb, 'activo', true),
                NULL, :por, 'Reversión del script 2026-09-25 (platina 511 / tubo inox).'
           FROM cotizador.producto WHERE codigo = :codigo`,
        { ahora, codigo, por: POR },
        t
      );
    }
    const nProductos = await ejecutar(`DELETE FROM cotizador.producto WHERE codigo IN (:codigos)`, { codigos: CODIGOS }, t);
    console.log(`  ✔ ${nDisenos} diseños bloqueados de nuevo, ${nPerfiles} renglones vaciados, ${nProductos} productos borrados`);
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
