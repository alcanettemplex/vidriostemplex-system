/**
 * Script: 2026-09-27_cotizador_cabina_glasvit.ts
 *
 * Cabinas Glasvit (antes "Cabina Deslizante Primavera") y holgura de cabinas.
 * Todos los datos son del usuario, 2026-09-27:
 *
 *   1. Alta en el Cotizador de los kits Glasvit que faltaban (existen en el
 *      catálogo del ERP pero no tenían precio en el Cotizador):
 *        KDG0305  kit 1,50 a 2,20        costo $105.000 (dado por el usuario;
 *                                        no tiene proveedor con precio)
 *        KDG0302  kit en L 2F 1C         costo $386.555 (precio de proveedor
 *                                        vigente; el usuario confirmó que ya
 *                                        contempla los dos lados)
 *        KDG0308  kit en L 2F 2C         costo $115.000 (precio de proveedor)
 *      PA/PM/PB con el multiplicador de ACCESORIO, como el resto de la
 *      categoría. Cuando Proveedores actualice el precio, el sync los mueve.
 *   2. El sistema "Cabina Deslizante Primavera" se muestra como "Cabina
 *      Glasvit". Solo cambia `cotizador.diseno.sistema`: los ids de los 4
 *      diseños ("Cabina Deslizante Primavera::OX_PRIMAVERA"…) NO cambian,
 *      porque los referencian ítems guardados, perfiles, vidrios y accesorios.
 *   3. Holgura de TODAS las cabinas: 3 mm en el ancho, 0 en el alto (la global
 *      sigue en 3 × 3 para el resto de sistemas). Una fila por sistema en
 *      `cotizador.calibracion_holgura`, igual que "Fijar holgura" de
 *      Calibración, con su entrada en el historial.
 *
 * Idempotente. SQL crudo (mismo criterio que los scripts del 2026-09-25/26).
 *
 * Ejecutar:  npx ts-node --files src/scripts/2026-09-27_cotizador_cabina_glasvit.ts
 * Revertir:  npx ts-node --files src/scripts/2026-09-27_cotizador_cabina_glasvit.ts --revertir
 * Después:   reiniciar el backend (o "Recargar" en el Cotizador) para la caché.
 */

import { QueryTypes, Transaction } from 'sequelize';
import sequelize from '../config/database';

const POR = 'script-2026-09-27';
const SISTEMA_VIEJO = 'Cabina Deslizante Primavera';
const SISTEMA_NUEVO = 'Cabina Glasvit';

const KITS: Array<{ codigo: string; costo: number; motivo: string }> = [
  { codigo: 'KDG0305', costo: 105000, motivo: 'Kit Glasvit 1,50–2,20: costo $105.000 dado por el usuario (2026-09-27).' },
  { codigo: 'KDG0302', costo: 386555, motivo: 'Kit Glasvit en L 2F1C: costo del proveedor vigente, confirmado por el usuario (2026-09-27).' },
  { codigo: 'KDG0308', costo: 115000, motivo: 'Kit Glasvit en L 2F2C: costo del proveedor vigente (2026-09-27).' },
];

/** Sistemas de cabina (con el nombre NUEVO de Glasvit). */
const SISTEMAS_CABINA = ['Cabina Corrediza', 'Cabina Batiente', 'Cabina Deslizante Torino', SISTEMA_NUEVO];
const HOLGURA = { anchoMm: 3, altoMm: 0 };
const NOTA_HOLGURA = '2026-09-27: en cabinas el descuento de 3 mm aplica solo al ancho, no al alto (usuario).';

type Fila = Record<string, unknown>;
const round2 = (n: number) => Math.round(n * 100) / 100;

async function select<T = Fila>(sql: string, replacements: Fila = {}, t?: Transaction): Promise<T[]> {
  return sequelize.query(sql, { type: QueryTypes.SELECT, replacements, transaction: t }) as Promise<T[]>;
}
async function ejecutar(sql: string, replacements: Fila = {}, t?: Transaction): Promise<number> {
  const [, meta] = (await sequelize.query(sql, { replacements, transaction: t })) as [unknown, { rowCount?: number }];
  return meta?.rowCount ?? 0;
}

async function aplicar() {
  console.log('=== Cotizador: cabina Glasvit y holgura de cabinas — 2026-09-27 ===\n');

  // ─── Validaciones previas ─────────────────────────────────────────────────
  const catalogo = await select<{ id: number; codigo: string; nombre: string }>(
    `SELECT id, codigo, nombre FROM public.catalogo_productos WHERE codigo IN (:codigos)`,
    { codigos: KITS.map((k) => k.codigo) }
  );
  const porCodigo = new Map(catalogo.map((c) => [c.codigo, c]));
  const faltan = KITS.filter((k) => !porCodigo.has(k.codigo)).map((k) => k.codigo);
  if (faltan.length) throw new Error(`No existen en el catálogo del ERP: ${faltan.join(', ')}.`);

  const [mult] = await select<{ multiplicador_pa: number; multiplicador_pm: number; multiplicador_pb: number }>(
    `SELECT multiplicador_pa, multiplicador_pm, multiplicador_pb FROM cotizador.multiplicador_categoria WHERE categoria = 'ACCESORIO'`
  );
  if (!mult) throw new Error('ACCESORIO no tiene multiplicador configurado.');

  const overrides = await select<{ codigo: string }>(
    `SELECT codigo FROM cotizador.precio_override WHERE codigo IN (:codigos)`,
    { codigos: KITS.map((k) => k.codigo) }
  );
  if (overrides.length) throw new Error(`Tienen override de precio (revisar a mano): ${overrides.map((o) => o.codigo).join(', ')}.`);

  const ahora = new Date();
  await sequelize.transaction(async (t) => {
    // 1. Kits
    for (const k of KITS) {
      const precios = {
        costo_unitario: round2(k.costo),
        precio_pa: round2(k.costo * Number(mult.multiplicador_pa)),
        precio_pm: round2(k.costo * Number(mult.multiplicador_pm)),
        precio_pb: round2(k.costo * Number(mult.multiplicador_pb)),
      };
      const [existente] = await select<Fila>(
        `SELECT codigo, costo_unitario, precio_pa, precio_pm, precio_pb FROM cotizador.producto WHERE codigo = :codigo`,
        { codigo: k.codigo },
        t
      );
      if (existente) {
        await ejecutar(
          `UPDATE cotizador.producto SET costo_unitario = :costo_unitario, precio_pa = :precio_pa,
                  precio_pm = :precio_pm, precio_pb = :precio_pb WHERE codigo = :codigo`,
          { ...precios, codigo: k.codigo },
          t
        );
        await ejecutar(
          `INSERT INTO cotizador.precio_historial (fecha, accion, codigo, antes, despues, por, motivo)
           VALUES (:ahora, 'editar-precio', :codigo, :antes::jsonb, :despues::jsonb, :por, :motivo)`,
          { ahora, codigo: k.codigo, antes: JSON.stringify(existente), despues: JSON.stringify(precios), por: POR, motivo: k.motivo },
          t
        );
        console.log(`  ✔ ${k.codigo} actualizado — costo $${precios.costo_unitario} · PA $${precios.precio_pa}`);
        continue;
      }
      const cat = porCodigo.get(k.codigo)!;
      await ejecutar(
        `INSERT INTO cotizador.producto
           (codigo, descripcion, categoria, unidad, costo_unitario, precio_pa, precio_pm, precio_pb,
            origen, provisional, fuente, catalogo_producto_id, creado_en, creado_por)
         VALUES (:codigo, :descripcion, 'ACCESORIO', 'UND', :costo_unitario, :precio_pa, :precio_pm, :precio_pb,
            'ALTA', false, 'catálogo general', :catalogoId, :ahora, :por)`,
        { ...precios, codigo: k.codigo, descripcion: String(cat.nombre ?? k.codigo).slice(0, 120), catalogoId: cat.id, ahora, por: POR },
        t
      );
      await ejecutar(
        `INSERT INTO cotizador.precio_historial (fecha, accion, codigo, antes, despues, por, motivo)
         VALUES (:ahora, 'dar-de-alta', :codigo, NULL, :despues::jsonb, :por, :motivo)`,
        { ahora, codigo: k.codigo, despues: JSON.stringify({ ...precios, activo: true }), por: POR, motivo: k.motivo },
        t
      );
      console.log(
        `  ✔ Alta ${k.codigo} (${cat.nombre}) — costo $${precios.costo_unitario} · PA $${precios.precio_pa} · PM $${precios.precio_pm} · PB $${precios.precio_pb}`
      );
    }

    // 2. Nombre del sistema
    const nSistema = await ejecutar(
      `UPDATE cotizador.diseno SET sistema = :nuevo WHERE sistema = :viejo`,
      { nuevo: SISTEMA_NUEVO, viejo: SISTEMA_VIEJO },
      t
    );
    console.log(`  ✔ Sistema "${SISTEMA_VIEJO}" → "${SISTEMA_NUEVO}": ${nSistema} diseños`);

    // 3. Holgura por sistema de cabina
    for (const sistema of SISTEMAS_CABINA) {
      const [vigente] = await select<{ ancho_mm: number; alto_mm: number }>(
        `SELECT ancho_mm, alto_mm FROM cotizador.calibracion_holgura
          WHERE ambito = 'sistema' AND sistema = :sistema AND vigente = true`,
        { sistema },
        t
      );
      if (vigente && Number(vigente.ancho_mm) === HOLGURA.anchoMm && Number(vigente.alto_mm) === HOLGURA.altoMm) {
        console.log(`  · Holgura de ${sistema} ya era ${HOLGURA.anchoMm} × ${HOLGURA.altoMm} mm`);
        continue;
      }
      await ejecutar(
        `UPDATE cotizador.calibracion_holgura SET vigente = false WHERE ambito = 'sistema' AND sistema = :sistema AND vigente = true`,
        { sistema },
        t
      );
      await ejecutar(
        `INSERT INTO cotizador.calibracion_holgura (ambito, sistema, ancho_mm, alto_mm, nota, definido_por, definido_en, vigente)
         VALUES ('sistema', :sistema, :ancho, :alto, :nota, :por, :ahora, true)`,
        { sistema, ancho: HOLGURA.anchoMm, alto: HOLGURA.altoMm, nota: NOTA_HOLGURA, por: POR, ahora },
        t
      );
      await ejecutar(
        `INSERT INTO cotizador.calibracion_historial (fecha, accion, payload)
         VALUES (:ahora, 'fijar-holgura', :payload::jsonb)`,
        { ahora, payload: JSON.stringify({ ambito: 'sistema', sistema, anchoMm: HOLGURA.anchoMm, altoMm: HOLGURA.altoMm, por: POR }) },
        t
      );
      console.log(`  ✔ Holgura de ${sistema}: ${HOLGURA.anchoMm} mm ancho × ${HOLGURA.altoMm} mm alto`);
    }
  });
  console.log('\n⚠ Reinicia el backend (o "Recargar" en el Cotizador) para que la caché vea los cambios.');
}

async function revertir() {
  console.log('=== REVERTIR cabina Glasvit y holgura de cabinas — 2026-09-27 ===\n');
  await sequelize.transaction(async (t) => {
    const nSistema = await ejecutar(
      `UPDATE cotizador.diseno SET sistema = :viejo WHERE sistema = :nuevo`,
      { nuevo: SISTEMA_NUEVO, viejo: SISTEMA_VIEJO },
      t
    );
    const nHolgura = await ejecutar(
      `UPDATE cotizador.calibracion_holgura SET vigente = false WHERE ambito = 'sistema' AND definido_por = :por AND vigente = true`,
      { por: POR },
      t
    );
    const nKits = await ejecutar(
      `DELETE FROM cotizador.producto WHERE codigo IN (:codigos) AND creado_por = :por`,
      { codigos: KITS.map((k) => k.codigo), por: POR },
      t
    );
    console.log(`  ✔ ${nSistema} diseños con su nombre anterior, ${nHolgura} holguras retiradas, ${nKits} kits dados de baja`);
    console.log('  (La holgura de sistema retirada deja a esas cabinas con la global, 3 × 3 mm.)');
  });
}

(process.argv.includes('--revertir') ? revertir() : aplicar())
  .then(() => sequelize.close())
  .catch(async (e) => {
    console.error('\n✖', e instanceof Error ? e.message : e);
    await sequelize.close();
    process.exit(1);
  });
