/**
 * Script: 2026-09-30_acvicol_iccc_b8_a_negro.ts
 *
 * Corrige un mapeo de ACVICOL (proveedor 868) detectado al diseñar las reglas de
 * código por proveedor. Decisión del usuario, 2026-09-30.
 *
 *   ICCCB-8 "Inox Chapeta central cuadrada con bloque negro micro texturizado"
 *     estaba en  CCE1101 · CHAPETA CENTRAL 30-35 ACERO  (equivalencia 29)
 *     va a       CCE0601 · CHAPETA CENTRAL 30-35 NEGRO  (equivalencia 111)
 *
 * En ACVICOL el sufijo `-8` significa negro microtexturizado (IBHT-CO acero vs
 * IBHTCO-8 negro, IKDPRIM vs IKDPRIM-8…), e ICCC-8, con la misma descripción, ya
 * apuntaba a CCE0601.
 *
 * El histórico se mueve con el código. Hasta el 2026-09-21 la equivalencia 29 solo
 * tenía un código —ICCCB-8 (origen BACKFILL)—, así que sus dos filas de precio salieron
 * de facturas de ICCCB-8: FE-AC54393 ($20.090, 04-ago) y FE-AC55241 ($17.290, 08-sep).
 * ICCC (acero) se vinculó después de la última aparición registrada en la bandeja
 * (FE-AC55550, 19-sep, $17.290); como coincidía con el vigente, no dejó fila. Se crea
 * esa fila con los datos de la bandeja para que la equivalencia del acero no quede
 * sin histórico.
 *
 * ⚠️ Hallazgo a verificar en papel: ICCCB-8 se facturó a $20.090 (precio del negro) el
 * 04-ago y a $17.290 (precio del acero) el 08-sep. El vigente del negro NO cambia: ICCC-8
 * lo confirmó a $20.090 el 16-sep, después de esa factura. El $17.290 queda como su
 * precio anterior. Si FE-AC55241 en realidad cobró una chapeta de acero, conviene
 * revisarla con ACVICOL.
 *
 * Por defecto solo previsualiza; `--aplicar` escribe (una transacción). Idempotente:
 * si ICCCB-8 ya está en la equivalencia 111 no hace nada.
 *   npx ts-node --files src/scripts/2026-09-30_acvicol_iccc_b8_a_negro.ts [--aplicar]
 * NO se ejecuta con `npm run dev`.
 */
import { QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '../models';
import { precargar } from '../cotizador/cache';
import { recalcularCostosDesdeProveedor } from '../cotizador/lib/sincronizacionProveedores';

const APLICAR = process.argv.includes('--aplicar');
const PROVEEDOR = 868;
const PP_ACERO = 29;   // CCE1101
const PP_NEGRO = 111;  // CCE0601
const CODIGO = 'ICCCB-8';
const DOCS_DE_ICCCB8 = ['FE-AC54393', 'FE-AC55241'];

type Fila = Record<string, any>;
const q = (sql: string, replacements: Fila = {}, transaction?: Transaction) =>
  sequelize.query<Fila>(sql, { replacements, type: QueryTypes.SELECT, transaction });

/**
 * Recalcula actual / anterior_1 / anterior_2 desde el histórico: solo CAMBIOS de precio.
 *
 * `vigenteAntes` es el precio y la fecha que tenía la equivalencia ANTES de mover nada.
 * Hace falta porque una factura que repite el precio solo actualiza la fecha y no deja
 * fila: CCE0601 tenía su $20.090 confirmado el 16-sep sin fila de ese día. Sin sumarla
 * a la serie, el recálculo bajaría el negro a $17.290 (08-sep) aunque la factura más
 * reciente del negro diga $20.090.
 */
async function recalcularDenormalizacion(ppId: number, vigenteAntes: { precio: number; fecha: string } | null, t: Transaction) {
  const filas = await q(
    `SELECT precio::numeric AS precio, fecha_vigencia::date::text AS fecha FROM proveedor_producto_precio
      WHERE proveedor_producto_id = :ppId ORDER BY fecha_vigencia ASC, id ASC`,
    { ppId },
    t
  );
  const serie = filas.map((f) => ({ precio: Number(f.precio), fecha: String(f.fecha) }));
  if (vigenteAntes) serie.push(vigenteAntes);
  serie.sort((a, b) => a.fecha.localeCompare(b.fecha));
  const cambios: Array<{ precio: number; fecha: string }> = [];
  for (const f of serie) {
    if (cambios.length === 0 || cambios[cambios.length - 1].precio !== f.precio) cambios.push(f);
  }
  // El vigente lleva la fecha de su ÚLTIMA confirmación, no la de su primera aparición
  const ultimo = serie[serie.length - 1];
  if (cambios.length && ultimo && ultimo.precio === cambios[cambios.length - 1].precio) {
    cambios[cambios.length - 1] = { ...cambios[cambios.length - 1], fecha: ultimo.fecha };
  }
  const [actual, ant1, ant2] = cambios.slice(-3).reverse();
  await sequelize.query(
    `UPDATE proveedor_producto SET
        precio_actual = :pa, fecha_precio_actual = :fa,
        precio_anterior_1 = :p1, fecha_anterior_1 = :f1,
        precio_anterior_2 = :p2, fecha_anterior_2 = :f2
      WHERE id = :ppId`,
    {
      replacements: {
        ppId,
        pa: actual?.precio ?? null, fa: actual?.fecha ?? null,
        p1: ant1?.precio ?? null, f1: ant1?.fecha ?? null,
        p2: ant2?.precio ?? null, f2: ant2?.fecha ?? null,
      },
      transaction: t,
    }
  );
  return { actual, ant1, ant2 };
}

async function estado(t?: Transaction) {
  const eq = await q(
    `SELECT pp.id, cp.codigo AS producto, pp.codigo_proveedor AS principal, pp.precio_actual, pp.fecha_precio_actual::date AS fecha,
            pp.precio_anterior_1, pp.fecha_anterior_1::date AS fecha_1,
            (SELECT string_agg(codigo_proveedor || CASE WHEN principal THEN '*' ELSE '' END, ', ' ORDER BY id)
               FROM proveedor_producto_codigo WHERE proveedor_producto_id = pp.id) AS codigos
       FROM proveedor_producto pp JOIN catalogo_productos cp ON cp.id = pp.catalogo_producto_id
      WHERE pp.id IN (:a, :b) ORDER BY pp.id`,
    { a: PP_ACERO, b: PP_NEGRO },
    t
  );
  const hist = await q(
    `SELECT proveedor_producto_id AS pp, precio, fecha_vigencia::date AS fecha, documento_ref FROM proveedor_producto_precio
      WHERE proveedor_producto_id IN (:a, :b) ORDER BY proveedor_producto_id, fecha_vigencia, id`,
    { a: PP_ACERO, b: PP_NEGRO },
    t
  );
  console.table(eq);
  console.table(hist);
}

async function main() {
  console.log(`=== ACVICOL · ${CODIGO} de CCE1101 (acero) a CCE0601 (negro) — ${APLICAR ? 'APLICANDO' : 'previsualización'} ===\n`);
  console.log('Antes:');
  await estado();

  const [fila] = await q(
    `SELECT id, proveedor_producto_id FROM proveedor_producto_codigo WHERE proveedor_id = :p AND codigo_proveedor = :c`,
    { p: PROVEEDOR, c: CODIGO }
  );
  if (!fila) throw new Error(`${CODIGO} no está registrado en ACVICOL.`);
  if (Number(fila.proveedor_producto_id) === PP_NEGRO) {
    console.log(`\n${CODIGO} ya está en CCE0601. Nada que hacer.`);
    return;
  }
  if (Number(fila.proveedor_producto_id) !== PP_ACERO) throw new Error(`${CODIGO} está en una equivalencia inesperada (${fila.proveedor_producto_id}).`);

  const historicoAMover = await q(
    `SELECT id, precio, fecha_vigencia::date AS fecha, documento_ref FROM proveedor_producto_precio
      WHERE proveedor_producto_id = :pp AND documento_ref IN (:docs)`,
    { pp: PP_ACERO, docs: DOCS_DE_ICCCB8 }
  );
  const [bandejaIccc] = await q(
    `SELECT precio_detectado, fecha_deteccion::date::text AS fecha, documento_ref, porcentaje_iva_detectado
       FROM proveedor_codigo_pendiente WHERE proveedor_id = :p AND codigo_proveedor = 'ICCC'`,
    { p: PROVEEDOR }
  );
  console.log(`\nFilas de histórico que se mueven a CCE0601: ${historicoAMover.length}`);
  console.table(historicoAMover);
  console.log('Fila nueva para CCE1101 (desde la bandeja de ICCC):', bandejaIccc);

  const vigentes = await q(
    `SELECT id, precio_actual::numeric AS precio, fecha_precio_actual::date::text AS fecha FROM proveedor_producto WHERE id IN (:a, :b)`,
    { a: PP_ACERO, b: PP_NEGRO }
  );
  const vigenteDe = (id: number) => {
    const v = vigentes.find((x) => Number(x.id) === id);
    return v && v.precio !== null && v.fecha ? { precio: Number(v.precio), fecha: String(v.fecha) } : null;
  };

  if (!APLICAR) {
    console.log('\nSimulación: no se escribió nada. Correr con --aplicar.');
    return;
  }

  await sequelize.transaction(async (t) => {
    // 1. El código cambia de equivalencia (no queda como principal: ICCC-8 ya lo es)
    await sequelize.query(
      `UPDATE proveedor_producto_codigo SET proveedor_producto_id = :negro, principal = false WHERE id = :id`,
      { replacements: { negro: PP_NEGRO, id: fila.id }, transaction: t }
    );
    // 2. En el acero, ICCC pasa a ser el principal y la copia de lectura se alinea
    await sequelize.query(
      `UPDATE proveedor_producto_codigo SET principal = (codigo_proveedor = 'ICCC') WHERE proveedor_producto_id = :acero`,
      { replacements: { acero: PP_ACERO }, transaction: t }
    );
    await sequelize.query(
      `UPDATE proveedor_producto SET codigo_proveedor = 'ICCC', descripcion_proveedor = 'Inox Chapeta central cuadrada con bloque'
        WHERE id = :acero`,
      { replacements: { acero: PP_ACERO }, transaction: t }
    );
    // 3. El histórico de ICCCB-8 viaja con el código
    await sequelize.query(
      `UPDATE proveedor_producto_precio SET proveedor_producto_id = :negro
        WHERE proveedor_producto_id = :acero AND documento_ref IN (:docs)`,
      { replacements: { negro: PP_NEGRO, acero: PP_ACERO, docs: DOCS_DE_ICCCB8 }, transaction: t }
    );
    // 4. El acero conserva su precio real, el de ICCC, con su factura de origen
    if (bandejaIccc?.precio_detectado) {
      await sequelize.query(
        `INSERT INTO proveedor_producto_precio
           (proveedor_producto_id, precio, fecha_vigencia, origen, documento_ref, porcentaje_iva, precio_anomalo, retroactivo, lineas_en_factura, fecha_registro)
         VALUES (:acero, :precio, :fecha, 'FACTURA', :doc, :iva, false, false, 1, NOW())`,
        {
          replacements: {
            acero: PP_ACERO,
            precio: bandejaIccc.precio_detectado,
            fecha: bandejaIccc.fecha,
            doc: bandejaIccc.documento_ref,
            iva: bandejaIccc.porcentaje_iva_detectado ?? null,
          },
          transaction: t,
        }
      );
    }
    // 5. Precio vigente y los dos anteriores, recalculados desde el histórico
    // El negro conserva su confirmación del 16-sep. El acero NO hereda la suya: su
    // vigente ($17.290 · 19-sep) ya quedó como fila propia en el paso 4.
    console.log('\nCCE0601 (negro):', await recalcularDenormalizacion(PP_NEGRO, vigenteDe(PP_NEGRO), t));
    console.log('CCE1101 (acero):', await recalcularDenormalizacion(PP_ACERO, null, t));
  });

  console.log('\nDespués:');
  await estado();

  // 6. El costo del Cotizador de ambos productos
  await precargar();
  const ids = (await q(`SELECT catalogo_producto_id AS id FROM proveedor_producto WHERE id IN (:a, :b)`, { a: PP_ACERO, b: PP_NEGRO })).map((f) => Number(f.id));
  const r = await recalcularCostosDesdeProveedor(ids, { dryRun: false });
  console.log('\nCotizador:', JSON.stringify(r.map((x) => ({ cambios: x.cambios.map((c) => ({ codigo: c.codigo, antes: c.antes.costo_unitario, despues: c.despues.costo_unitario })), omitidos: x.omitidos }))));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => sequelize.close(), 2500));
