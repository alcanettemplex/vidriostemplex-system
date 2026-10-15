/**
 * Script: 2026-10-15_cotizador_portaborradores.ts
 *
 * Propósito: traer al Cotizador los dos portaborradores del catálogo del ERP,
 * para poder agregarlos como línea de un Ítem libre junto a un tablero. Hasta
 * hoy existían sólo en `catalogo_productos`, y el buscador del Ítem libre lee
 * únicamente `cotizador.producto`: escribir SPB0101 daba "Sin coincidencias".
 *
 *   - SPB0101 PORTABORRADOR LAMINA DE ACERO INOX (catalogo_productos 959).
 *     Costo del proveedor seguido (hoy AVQ S.A.S, $52.000 por UNIDAD). Queda
 *     vinculado: la sincronización con Proveedores lo moverá sola.
 *   - SPB1106 PORTABORRADOR ACERO INOX NEGRO (catalogo_productos 960). Ningún
 *     proveedor tiene precio: costo manual = costo del SPB0101 + 15 % (dato del
 *     usuario, 2026-10-15). Es un número FIJO, no sigue al SPB0101; lo
 *     reemplazará la sincronización cuando se mapee una factura con este código.
 *
 * Ambos: categoría ACCESORIO, unidad UND, origen ALTA, mismo multiplicador que
 * el resto de accesorios. Replica `POST /catalogo-general/importar` (fila +
 * `dar-de-alta` en `cotizador.precio_historial`), en SQL crudo como el script
 * del 2026-09-25, para no depender de la caché del Cotizador.
 *
 * Ejecutar:  npx ts-node src/scripts/2026-10-15_cotizador_portaborradores.ts            (solo muestra)
 *            npx ts-node src/scripts/2026-10-15_cotizador_portaborradores.ts --aplicar  (escribe)
 * Revertir:  npx ts-node src/scripts/2026-10-15_cotizador_portaborradores.ts --revertir
 * Después:   reiniciar el backend (Render) para recargar la caché del Cotizador.
 */

import { QueryTypes, Transaction } from 'sequelize';
import sequelize from '../config/database';

const POR = 'script-2026-10-15-portaborradores';
const CATEGORIA = 'ACCESORIO';
const UNIDAD = 'UND';
const RECARGO_NEGRO = 0.15;

const INOX = { codigo: 'SPB0101', catalogoId: 959 } as const;
const NEGRO = { codigo: 'SPB1106', catalogoId: 960 } as const;
const CODIGOS = [INOX.codigo, NEGRO.codigo];
const IDS = [INOX.catalogoId, NEGRO.catalogoId];

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

async function aplicar(escribir: boolean) {
  console.log(`=== Cotizador: portaborradores SPB0101 / SPB1106 — 2026-10-15 ${escribir ? '' : '(SIMULACIÓN)'} ===\n`);

  // ─── Validaciones previas (nada se escribe si alguna falla) ───────────────
  const catalogo = await uno<{ id: number; codigo: string; nombre: string; activo: boolean }>(
    `SELECT id, codigo, nombre, activo FROM catalogo_productos WHERE id IN (:ids)`,
    { ids: IDS }
  );
  for (const esperado of [INOX, NEGRO]) {
    const fila = catalogo.find((c) => c.id === esperado.catalogoId);
    if (!fila || fila.codigo !== esperado.codigo || !fila.activo) {
      throw new Error(`catalogo_productos ${esperado.catalogoId} no es ${esperado.codigo} activo.`);
    }
  }

  const yaEstan = await uno<{ codigo: string }>(
    `SELECT codigo FROM cotizador.producto WHERE codigo IN (:codigos) OR catalogo_producto_id IN (:ids)`,
    { codigos: CODIGOS, ids: IDS }
  );
  if (yaEstan.length) throw new Error(`Ya están en el Cotizador: ${yaEstan.map((f) => f.codigo).join(', ')}.`);

  const [mult] = await uno<{ multiplicador_pa: number; multiplicador_pm: number; multiplicador_pb: number }>(
    `SELECT multiplicador_pa, multiplicador_pm, multiplicador_pb
       FROM cotizador.multiplicador_categoria WHERE categoria = :categoria`,
    { categoria: CATEGORIA }
  );
  if (!mult) throw new Error(`${CATEGORIA} no tiene multiplicador configurado.`);

  // Mismo filtro que sincronizacionProveedores.ts: equivalencia activa con
  // precio, proveedor activo y con seguir_precios = true. Con varios, manda el
  // más alto (regla del usuario 2026-09-28). Hoy hay uno solo.
  const proveedoresInox = await uno<{ precio_actual: string; unidad_compra: string; nombre_comercial: string }>(
    `SELECT pp.precio_actual, pp.unidad_compra, p.nombre_comercial
       FROM proveedor_producto pp JOIN proveedores p ON p.id = pp.proveedor_id
      WHERE pp.catalogo_producto_id = :id AND pp.activo AND pp.precio_actual IS NOT NULL
        AND p.activo AND p.seguir_precios = true
      ORDER BY pp.precio_actual DESC`,
    { id: INOX.catalogoId }
  );
  const inoxProv = proveedoresInox[0];
  if (!inoxProv || inoxProv.unidad_compra !== 'UNIDAD') {
    throw new Error('SPB0101 no tiene un proveedor seguido con precio por UNIDAD: revisar antes de continuar.');
  }
  const costoInox = Number(inoxProv.precio_actual);
  const costoNegro = costoInox * (1 + RECARGO_NEGRO);

  const altas = [
    {
      ...INOX,
      costo: costoInox,
      motivo:
        `Traído del catálogo general (id ${INOX.catalogoId}). Costo de "${inoxProv.nombre_comercial}" ` +
        `por unidad. Portaborrador para ítem libre de tablero.`,
    },
    {
      ...NEGRO,
      costo: costoNegro,
      motivo:
        `Traído del catálogo general (id ${NEGRO.catalogoId}) con costo manual: SPB0101 ($${costoInox}) ` +
        `+ ${RECARGO_NEGRO * 100} %, dato del usuario 2026-10-15. Sin proveedor con precio.`,
    },
  ].map((a) => ({
    ...a,
    descripcion: catalogo.find((c) => c.id === a.catalogoId)!.nombre.slice(0, 120),
    precios: {
      costo_unitario: round2(a.costo),
      precio_pa: round2(a.costo * Number(mult.multiplicador_pa)),
      precio_pm: round2(a.costo * Number(mult.multiplicador_pm)),
      precio_pb: round2(a.costo * Number(mult.multiplicador_pb)),
    },
  }));

  for (const a of altas) {
    console.log(
      `  ${escribir ? '✔ Alta' : '· Daría de alta'} ${a.codigo} ${a.descripcion} (${CATEGORIA}, ${UNIDAD}) — ` +
        `costo $${a.precios.costo_unitario}, PA $${a.precios.precio_pa} · PM $${a.precios.precio_pm} · PB $${a.precios.precio_pb}`
    );
  }
  if (!escribir) {
    console.log('\nNada se escribió. Para aplicar: agregar --aplicar.');
    return;
  }

  // ─── Escritura, todo o nada ────────────────────────────────────────────────
  const ahora = new Date();
  await sequelize.transaction(async (t) => {
    for (const a of altas) {
      await ejecutar(
        `INSERT INTO cotizador.producto
           (codigo, descripcion, categoria, unidad, costo_unitario, precio_pa, precio_pm, precio_pb,
            origen, provisional, fuente, catalogo_producto_id, creado_en, creado_por)
         VALUES (:codigo, :descripcion, :categoria, :unidad, :costo_unitario, :precio_pa, :precio_pm, :precio_pb,
            'ALTA', false, 'catálogo general', :catalogoId, :ahora, :por)`,
        { ...a.precios, codigo: a.codigo, descripcion: a.descripcion, categoria: CATEGORIA, unidad: UNIDAD,
          catalogoId: a.catalogoId, ahora, por: POR },
        t
      );
      await ejecutar(
        `INSERT INTO cotizador.precio_historial (fecha, accion, codigo, antes, despues, por, motivo)
         VALUES (:ahora, 'dar-de-alta', :codigo, NULL, :despues::jsonb, :por, :motivo)`,
        { ahora, codigo: a.codigo, despues: JSON.stringify({ ...a.precios, activo: true }), por: POR,
          motivo: a.motivo.slice(0, 300) },
        t
      );
    }
  });
  console.log('\n⚠ Reinicia el backend para que la caché del Cotizador vea los cambios.');
}

async function revertir() {
  console.log('=== REVERTIR portaborradores SPB0101 / SPB1106 — 2026-10-15 ===\n');

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
    for (const codigo of CODIGOS) {
      await ejecutar(
        `INSERT INTO cotizador.precio_historial (fecha, accion, codigo, antes, despues, por, motivo)
         SELECT :ahora, 'dar-de-baja', codigo,
                jsonb_build_object('costo_unitario', costo_unitario, 'precio_pa', precio_pa,
                                   'precio_pm', precio_pm, 'precio_pb', precio_pb, 'activo', true),
                NULL, :por, 'Reversión del script 2026-10-15 (portaborradores).'
           FROM cotizador.producto WHERE codigo = :codigo`,
        { ahora, codigo, por: POR },
        t
      );
    }
    const n = await ejecutar(`DELETE FROM cotizador.producto WHERE codigo IN (:codigos)`, { codigos: CODIGOS }, t);
    console.log(`  ✔ ${n} productos borrados`);
  });
  console.log('\n⚠ Reinicia el backend para que la caché del Cotizador vea los cambios.');
}

(process.argv.includes('--revertir') ? revertir() : aplicar(process.argv.includes('--aplicar')))
  .then(() => sequelize.close())
  .catch(async (e) => {
    console.error('\n✖', e instanceof Error ? e.message : e);
    await sequelize.close();
    process.exit(1);
  });
