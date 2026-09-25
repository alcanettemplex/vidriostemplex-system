/**
 * Script: 2026-09-25_cotizador_tubular_torino_kik0301.ts
 *
 * Propósito: volver cotizables los 5 diseños de Cabina Deslizante Torino, los
 * últimos bloqueados de los 18 (ver docs/modulos/cotizador.md → "Los 18 diseños
 * que no se podían cotizar").
 *
 *   - `REC30X10` "Tubular 30mm x 10mm" (6 renglones, 5 diseños) = `KIK0301`
 *     "KIT TUBO RECTANGULAR" — dato del usuario, 2026-09-25. Es un kit "todo en
 *     uno" (trae las rodachinas): se cobra **1 kit por tubo, cualquier ancho**
 *     (OXXO_TORINO lleva dos). Eso lo resuelve el motor porque `KIK0301` es
 *     `UND` sin `largo_pieza_mm` — ver "Perfiles por pieza entera" en
 *     cotizador.md. Mismo código en los seis colores: el kit no tiene acabado.
 *   - Costo de `KIK0301`: $210.000 (el sembrado) → **$150.550**, dato del
 *     usuario. Sin proveedor: ninguna sincronización lo pisa. Precios con el
 *     multiplicador de ACCESORIO, que es su categoría.
 *
 * SQL crudo, mismo criterio que 2026-09-25_cotizador_platina_511_y_tubo_inox.ts.
 *
 * Ejecutar:  npx ts-node src/scripts/2026-09-25_cotizador_tubular_torino_kik0301.ts
 * Revertir:  npx ts-node src/scripts/2026-09-25_cotizador_tubular_torino_kik0301.ts --revertir
 *            (restaura el costo anterior leído del historial que deja este script)
 * Después:   reiniciar el backend para recargar la caché del Cotizador.
 */

import { QueryTypes, Transaction } from 'sequelize';
import sequelize from '../config/database';

const POR = 'script-2026-09-25-torino';
const CODIGO = 'KIK0301';
const COSTO_NUEVO = 150550;
const COLORES = ['MATE', 'CRUDO', 'NEGRO', 'BLANCO', 'BRONCE', 'GRISPLATA'] as const;
const RENGLONES_ESPERADOS = 6;
const DISENOS_ESPERADOS = 5;
const MOTIVO = `Costo del usuario 2026-09-25: $${COSTO_NUEVO}. Kit del tubular REC30X10 de Cabina Torino.`;

type Fila = Record<string, unknown>;
interface Precios { costo_unitario: number; precio_pa: number; precio_pm: number; precio_pb: number }

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

async function preciosActuales(t?: Transaction): Promise<Precios & { categoria: string; unidad: string; largo_pieza_mm: number | null }> {
  const [p] = await uno<Precios & { categoria: string; unidad: string; largo_pieza_mm: number | null }>(
    `SELECT costo_unitario, precio_pa, precio_pm, precio_pb, categoria, unidad, largo_pieza_mm
       FROM cotizador.producto WHERE codigo = :codigo`,
    { codigo: CODIGO },
    t
  );
  if (!p) throw new Error(`${CODIGO} no está en cotizador.producto.`);
  return p;
}

async function escribirPrecios(antes: Precios, despues: Precios, motivo: string, t: Transaction) {
  await ejecutar(
    `UPDATE cotizador.producto
        SET costo_unitario = :costo_unitario, precio_pa = :precio_pa, precio_pm = :precio_pm, precio_pb = :precio_pb
      WHERE codigo = :codigo`,
    { ...despues, codigo: CODIGO },
    t
  );
  const pick = (p: Precios) => ({
    costo_unitario: p.costo_unitario, precio_pa: p.precio_pa, precio_pm: p.precio_pm, precio_pb: p.precio_pb,
  });
  await ejecutar(
    `INSERT INTO cotizador.precio_historial (fecha, accion, codigo, antes, despues, por, motivo)
     VALUES (:ahora, 'editar-precio', :codigo, :antes::jsonb, :despues::jsonb, :por, :motivo)`,
    { ahora: new Date(), codigo: CODIGO, antes: JSON.stringify(pick(antes)), despues: JSON.stringify(pick(despues)),
      por: POR, motivo: motivo.slice(0, 300) },
    t
  );
}

async function aplicar() {
  console.log('=== Cotizador: tubular Torino = KIK0301 — 2026-09-25 ===\n');

  // ─── Validaciones previas ──────────────────────────────────────────────────
  const actual = await preciosActuales();
  if (actual.categoria !== 'ACCESORIO' || actual.unidad !== 'UND' || actual.largo_pieza_mm != null) {
    throw new Error(
      `${CODIGO} debería ser ACCESORIO / UND sin largo de pieza (es ${actual.categoria} / ${actual.unidad} / ` +
        `${actual.largo_pieza_mm}): el conteo "1 kit por tubo" depende de eso.`
    );
  }
  const [override] = await uno(`SELECT 1 FROM cotizador.precio_override WHERE codigo = :codigo`, { codigo: CODIGO });
  if (override) throw new Error(`${CODIGO} tiene un override de precio: taparía el costo nuevo. Revisar antes.`);

  const [mult] = await uno<{ multiplicador_pa: number; multiplicador_pm: number; multiplicador_pb: number }>(
    `SELECT multiplicador_pa, multiplicador_pm, multiplicador_pb
       FROM cotizador.multiplicador_categoria WHERE categoria = 'ACCESORIO'`
  );
  if (!mult) throw new Error('ACCESORIO no tiene multiplicador configurado.');

  const [vacios] = await uno<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM cotizador.diseno_perfil WHERE ref = 'REC30X10' AND codigos_por_color = '{}'::jsonb`
  );
  if (vacios.n !== RENGLONES_ESPERADOS) {
    throw new Error(`Se esperaban ${RENGLONES_ESPERADOS} renglones vacíos de REC30X10 y hay ${vacios.n}.`);
  }

  // ─── Escritura, todo o nada ────────────────────────────────────────────────
  const despues: Precios = {
    costo_unitario: round2(COSTO_NUEVO),
    precio_pa: round2(COSTO_NUEVO * Number(mult.multiplicador_pa)),
    precio_pm: round2(COSTO_NUEVO * Number(mult.multiplicador_pm)),
    precio_pb: round2(COSTO_NUEVO * Number(mult.multiplicador_pb)),
  };

  await sequelize.transaction(async (t) => {
    await escribirPrecios(actual, despues, MOTIVO, t);
    console.log(
      `  ✔ ${CODIGO}: costo $${actual.costo_unitario} → $${despues.costo_unitario} · ` +
        `PA $${round2(actual.precio_pa)} → $${despues.precio_pa} · PM $${despues.precio_pm} · PB $${despues.precio_pb}`
    );

    const n = await ejecutar(
      `UPDATE cotizador.diseno_perfil SET codigos_por_color = :colores::jsonb
        WHERE ref = 'REC30X10' AND codigos_por_color = '{}'::jsonb`,
      { colores: JSON.stringify(Object.fromEntries(COLORES.map((c) => [c, CODIGO]))) },
      t
    );
    if (n !== RENGLONES_ESPERADOS) throw new Error(`Renglones actualizados inesperados: ${n}.`);
    console.log(`  ✔ codigos_por_color: ${n} renglones de REC30X10 → ${CODIGO}`);

    const nDisenos = await ejecutar(
      `UPDATE cotizador.diseno SET cotizable = true, refs_sin_precio = '[]'::jsonb
        WHERE cotizable = false AND refs_sin_precio = '["REC30X10"]'::jsonb`,
      {},
      t
    );
    if (nDisenos !== DISENOS_ESPERADOS) {
      throw new Error(`Se esperaban ${DISENOS_ESPERADOS} diseños y se habilitarían ${nDisenos}.`);
    }
    console.log(`  ✔ ${nDisenos} diseños Torino marcados cotizables`);
  });

  const resumen = await uno<{ cotizable: boolean; n: number }>(
    `SELECT cotizable, COUNT(*)::int AS n FROM cotizador.diseno GROUP BY 1 ORDER BY 1`
  );
  console.log('\nDiseños:', resumen.map((r) => `${r.cotizable ? 'cotizables' : 'bloqueados'} ${r.n}`).join(' · '));
  console.log('\n⚠ Reinicia el backend para que la caché del Cotizador vea los cambios.');
}

async function revertir() {
  console.log('=== REVERTIR tubular Torino = KIK0301 — 2026-09-25 ===\n');

  const [previo] = await uno<{ antes: Precios }>(
    `SELECT antes FROM cotizador.precio_historial
      WHERE codigo = :codigo AND por = :por AND accion = 'editar-precio'
      ORDER BY fecha DESC LIMIT 1`,
    { codigo: CODIGO, por: POR }
  );
  if (!previo?.antes) throw new Error('No hay historial de este script para restaurar el costo.');

  await sequelize.transaction(async (t) => {
    const actual = await preciosActuales(t);
    await escribirPrecios(actual, previo.antes, 'Reversión del script 2026-09-25 (tubular Torino).', t);
    const nDisenos = await ejecutar(
      `UPDATE cotizador.diseno d SET cotizable = false, refs_sin_precio = '["REC30X10"]'::jsonb
        WHERE d.id IN (SELECT DISTINCT diseno_id FROM cotizador.diseno_perfil WHERE ref = 'REC30X10')`,
      {},
      t
    );
    const nPerfiles = await ejecutar(
      `UPDATE cotizador.diseno_perfil SET codigos_por_color = '{}'::jsonb WHERE ref = 'REC30X10'`,
      {},
      t
    );
    console.log(
      `  ✔ ${CODIGO} vuelve a costo $${previo.antes.costo_unitario}; ${nDisenos} diseños bloqueados, ` +
        `${nPerfiles} renglones vaciados`
    );
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
