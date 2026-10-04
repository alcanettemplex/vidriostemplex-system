/**
 * Script: 2026-10-04_proveedores_perfil_f_tira.ts
 *
 * Problema (confirmado por el usuario el 2026-10-04): el perfil F (`PER0301`,
 * código de VENTANAS Y PUERTAS `F463M`) quedó en el Cotizador a $193.721/m PA,
 * que es el precio de la TIRA de 6 m.
 *
 * Causa: la equivalencia #216 (proveedor 829, producto 805) solo existe en la
 * modalidad METRO. La factura FE-FE209611 (17-sep) trajo $26.974,79 por metro;
 * la FE-FE210939 (29-sep) trajo 1 unidad a $124.033,61 —la tira— y, como era la
 * única equivalencia, la ingesta la registró como precio por METRO (regla 3 de
 * Proveedores: un unitCode genérico vale si hay una sola equivalencia). Quedó
 * marcada `precio_anomalo` (+360 %) y el sync la llevó al Cotizador.
 *
 * Corrección (decisión del usuario):
 *   1. Nueva equivalencia TIRA_6M para F463M (mismo proveedor y producto), con
 *      el código como principal.
 *   2. La fila de histórico de la FE-FE210939 pasa a la equivalencia nueva (es su
 *      primer precio: sin variación ni anomalía).
 *   3. La equivalencia METRO vuelve a su precio real: $26.974,79 del 17-sep.
 *   4. Recalcula el Cotizador con la regla de siempre (`recalcularCostosDesdeProveedor`):
 *      con tira disponible manda la tira ÷ 6.
 * Con dos modalidades, una factura futura de F463M con unidad genérica ya no se
 * aplica sola: va a "Por Mapear" para que alguien elija.
 *
 * Usa los modelos (no SQL suelto) para que cada cambio quede en auditoria_log.
 *
 * Simular:  npx ts-node --files src/scripts/2026-10-04_proveedores_perfil_f_tira.ts
 * Aplicar:  npx ts-node --files src/scripts/2026-10-04_proveedores_perfil_f_tira.ts --aplicar
 * Revertir: npx ts-node --files src/scripts/2026-10-04_proveedores_perfil_f_tira.ts --revertir --aplicar
 * Después:  reiniciar el backend (o esperar: el sync ya recarga la caché del Cotizador en este proceso,
 *           no en el del servidor).
 */

import {
  sequelize,
  ProveedorProducto,
  ProveedorProductoPrecio,
  ProveedorProductoCodigo,
} from '../models';
import * as cache from '../cotizador/cache';
import { recalcularCostosDesdeProveedor } from '../cotizador/lib/sincronizacionProveedores';

const APLICAR = process.argv.includes('--aplicar');
const REVERTIR = process.argv.includes('--revertir');

const EQUIV_METRO = 216;
const FILA_TIRA = 383; // histórico de la FE-FE210939
const CATALOGO = 805; // PER0301
const PRECIO_METRO = 26974.79;
const FECHA_METRO = '2026-09-17';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Inst = any;

async function aplicar() {
  console.log(`=== Perfil F (F463M): precio de tira a su modalidad — 2026-10-04${APLICAR ? '' : ' (SIMULACIÓN)'} ===\n`);
  const metro: Inst = await ProveedorProducto.findByPk(EQUIV_METRO);
  const fila: Inst = await ProveedorProductoPrecio.findByPk(FILA_TIRA);
  if (!metro || !fila) throw new Error('No se encontró la equivalencia #216 o la fila #383.');
  if (metro.get('unidad_compra') !== 'METRO' || Number(metro.get('catalogo_producto_id')) !== CATALOGO) {
    throw new Error('La equivalencia #216 ya no es METRO del producto 805: revisa antes de seguir.');
  }
  const yaTira: Inst = await ProveedorProducto.findOne({
    where: { proveedor_id: metro.get('proveedor_id'), catalogo_producto_id: CATALOGO, unidad_compra: 'TIRA_6M' },
  });
  if (yaTira && Number(fila.get('proveedor_producto_id')) === Number(yaTira.get('id'))) {
    console.log('Ya estaba corregido (la fila #383 cuelga de la equivalencia TIRA_6M). Nada que hacer.');
    return;
  }
  const precioTira = Number(fila.get('precio'));
  const fechaTira = fila.get('fecha_vigencia');
  console.log(`  METRO #216: precio actual $${metro.get('precio_actual')} → $${PRECIO_METRO} (${FECHA_METRO})`);
  console.log(`  + TIRA_6M nueva: $${precioTira} (FE-FE210939), código F463M principal`);
  console.log(`  ~ fila #383 → equivalencia TIRA_6M, sin anomalía`);
  console.log(`  Cotizador PER0301: costo esperado $${(precioTira / 6).toFixed(2)}/m`);
  if (!APLICAR) {
    console.log('\nSimulación: no se escribió nada. Corre con --aplicar.');
    return;
  }

  await sequelize.transaction(async (t) => {
    const tira: Inst =
      yaTira ??
      (await ProveedorProducto.create(
        {
          proveedor_id: metro.get('proveedor_id'),
          catalogo_producto_id: CATALOGO,
          codigo_proveedor: metro.get('codigo_proveedor'),
          descripcion_proveedor: metro.get('descripcion_proveedor'),
          unidad_compra: 'TIRA_6M',
          metros_por_unidad: 6,
          precio_actual: precioTira,
          fecha_precio_actual: fechaTira,
          activo: true,
        } as any,
        { transaction: t }
      ));
    await ProveedorProductoCodigo.create(
      {
        proveedor_producto_id: tira.get('id'),
        proveedor_id: metro.get('proveedor_id'),
        codigo_proveedor: metro.get('codigo_proveedor'),
        descripcion_proveedor: metro.get('descripcion_proveedor'),
        principal: true,
        origen: 'MANUAL',
      } as any,
      { transaction: t }
    );
    await fila.update({ proveedor_producto_id: tira.get('id'), precio_anomalo: false, variacion_pct: null }, { transaction: t });
    await metro.update(
      {
        precio_actual: PRECIO_METRO,
        fecha_precio_actual: FECHA_METRO,
        precio_anterior_1: null,
        fecha_anterior_1: null,
        precio_anterior_2: null,
        fecha_anterior_2: null,
      },
      { transaction: t }
    );
  });
  console.log('\n  ✔ Proveedores corregido.');

  await cache.precargar();
  for (const r of await recalcularCostosDesdeProveedor([CATALOGO])) {
    for (const c of r.cambios) console.log(`  $ ${c.codigo}: costo $${c.despues.costo_unitario}/m · PA $${c.despues.precio_pa}`);
    for (const o of r.omitidos) console.log(`  ⚠ ${o.codigo}: ${o.motivo}`);
  }
  console.log('\n⚠ Reinicia el backend para que su caché del Cotizador vea el costo nuevo.');
}

async function revertir() {
  console.log(`=== Revertir perfil F (F463M) — 2026-10-04${APLICAR ? '' : ' (SIMULACIÓN)'} ===\n`);
  const metro: Inst = await ProveedorProducto.findByPk(EQUIV_METRO);
  const fila: Inst = await ProveedorProductoPrecio.findByPk(FILA_TIRA);
  const tira: Inst = await ProveedorProducto.findOne({
    where: { proveedor_id: metro.get('proveedor_id'), catalogo_producto_id: CATALOGO, unidad_compra: 'TIRA_6M' },
  });
  if (!tira) {
    console.log('No hay equivalencia TIRA_6M que revertir.');
    return;
  }
  if (!APLICAR) {
    console.log('Simulación: la fila #383 volvería a la #216, que retomaría $124.033,61, y se borraría la TIRA_6M.');
    return;
  }
  await sequelize.transaction(async (t) => {
    await fila.update({ proveedor_producto_id: EQUIV_METRO, precio_anomalo: true, variacion_pct: 359.81 }, { transaction: t });
    await metro.update(
      {
        precio_actual: fila.get('precio'),
        fecha_precio_actual: fila.get('fecha_vigencia'),
        precio_anterior_1: PRECIO_METRO,
        fecha_anterior_1: FECHA_METRO,
      },
      { transaction: t }
    );
    const codigos: Inst[] = await ProveedorProductoCodigo.findAll({ where: { proveedor_producto_id: tira.get('id') }, transaction: t });
    for (const c of codigos) await c.destroy({ transaction: t });
    await tira.destroy({ transaction: t });
  });
  await cache.precargar();
  await recalcularCostosDesdeProveedor([CATALOGO]);
  console.log('  ✔ Revertido. Reinicia el backend.');
}

(REVERTIR ? revertir() : aplicar())
  .then(() => sequelize.close())
  .catch(async (e) => {
    console.error('\n✖', e instanceof Error ? e.message : e);
    await sequelize.close();
    process.exit(1);
  });
