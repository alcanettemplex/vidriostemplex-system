/**
 * 2026-10-26_medidas_odp24466.ts
 *
 * Corrige el ancho de los vidrios de la ODP-24466 (id 731, GRUPO INTEGRA J.S S.A.S,
 * puerta vidriera 8025 de 3 rieles) a pedido del usuario: 952 → 828 mm.
 *   A (#2191): 2 × 952 × 1892 → 2 × 828 × 1892
 *   B (#2192): 1 × 952 × 1900 → 1 × 828 × 1900
 *
 * Los dos vidrios están en el Pedido PV 7196 (Vitelsa, CONFIRMADO_PROVEEDOR). `updateODP`
 * protege los vidrios comprometidos y Pedidos PV no edita medidas: de ahí este one-off.
 * Vitelsa ya aceptó el cambio (dicho por el usuario); el pedido conserva su estado.
 *
 * QUÉ HACE
 *   odp_items 2191 y 2192: ancho_mm → 828 (alto, cantidad, vínculo PV y observación intactos)
 *   pedido_pv 705 (7196): observaciones ← nota del cambio
 *   odp 731: fecha_impresion_op / impresa_por_id → NULL (vuelve a "Por Imprimir": la OP
 *            impresa el 2026-10-26 10:27 decía 952)
 *
 * QUÉ NO TOCA: SAP-8091 (perfilería por vano 3000 × 2000, no por ancho de vidrio),
 * cotización 17025, valor_total, descripción, estado del pedido PV.
 * El Excel y el impreso del PV leen las medidas de odp_items: salen corregidos solos.
 *
 * AUDITORÍA: se esperan las 4 filas antes de cerrar la conexión (TECH_DEBT.md 2026-10-26).
 *
 * EJECUCIÓN (one-off, ya ejecutado el 2026-10-26):
 *   backend-api/node_modules/.bin/ts-node --project backend-api/tsconfig.json \
 *     backend-api/src/scripts/2026-10-26_medidas_odp24466.ts
 */
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { Op } from 'sequelize';
import sequelize from '../config/database';
import { ODP, ODPItem, PedidoPV, AuditoriaLog } from '../models';
import { requestContext } from '../utils/requestContext';

const ODP_ID = 731;
const PEDIDO_PV_ID = 705;
const CAMBIOS = [
  { id: 2191, cantidad: 2, alto: 1892, anchoAntes: 952, anchoNuevo: 828 },
  { id: 2192, cantidad: 1, alto: 1900, anchoAntes: 952, anchoNuevo: 828 },
];
const NOTA_PV = '26-oct-2026: ancho corregido 952 → 828 mm en A (2 × 828 × 1892) y B (1 × 828 × 1900). Vitelsa aceptó el cambio; se reenvía el formulario corregido.';
const ACTOR = 'SCRIPT 2026-10-26_medidas_odp24466';

(async () => {
  try {
    await sequelize.authenticate();

    const odp = await ODP.findByPk(ODP_ID);
    const pedido = await PedidoPV.findByPk(PEDIDO_PV_ID);
    if (!odp || odp.getDataValue('numero_odp') !== 'ODP-24466') throw new Error('la ODP no es ODP-24466');
    if (!pedido || pedido.getDataValue('numero_pedido') !== '7196') throw new Error('el pedido no es el 7196');
    if (['LLEGADO', 'VERIFICADO', 'ENTREGADO'].includes(pedido.getDataValue('estado'))) {
      throw new Error(`el pedido ya está en ${pedido.getDataValue('estado')}: el vidrio ya llegó`);
    }

    const items: { it: InstanceType<typeof ODPItem>; cambio: typeof CAMBIOS[number] }[] = [];
    for (const cambio of CAMBIOS) {
      const it = await ODPItem.findByPk(cambio.id);
      if (!it || it.getDataValue('odp_id') !== ODP_ID || it.getDataValue('pedido_pv_id') !== PEDIDO_PV_ID) {
        throw new Error(`el vidrio #${cambio.id} no es de la ODP / pedido esperados`);
      }
      if (it.getDataValue('ancho_mm') !== cambio.anchoAntes || it.getDataValue('alto_mm') !== cambio.alto
          || it.getDataValue('cantidad') !== cambio.cantidad) {
        throw new Error(`el vidrio #${cambio.id} ya no tiene las medidas esperadas`);
      }
      items.push({ it, cambio });
    }

    const obsAnterior = (pedido.getDataValue('observaciones') as string | null)?.trim();
    const inicio = new Date();
    await requestContext.run(
      { userId: 30, userName: ACTOR, ip: null },
      () => sequelize.transaction(async (t) => {
        for (const { it, cambio } of items) await it.update({ ancho_mm: cambio.anchoNuevo }, { transaction: t });
        await pedido.update({ observaciones: obsAnterior ? `${obsAnterior}\n${NOTA_PV}` : NOTA_PV }, { transaction: t });
        await odp.update({ fecha_impresion_op: null, impresa_por_id: null }, { transaction: t });
      }),
    );

    const esperadas = items.length + 2;
    let auditadas = 0;
    for (let i = 0; i < 30; i++) {
      auditadas = await AuditoriaLog.count({ where: { usuario_nombre: ACTOR, fecha: { [Op.gte]: inicio } } });
      if (auditadas >= esperadas) break;
      await new Promise(r => setTimeout(r, 500));
    }

    for (const { cambio } of items) console.log(`OK: vidrio #${cambio.id} → ${cambio.cantidad} × ${cambio.anchoNuevo} × ${cambio.alto}`);
    console.log('OK: nota en el Pedido PV 7196; OP de vuelta en "Por Imprimir".');
    console.log(`Auditoría: ${auditadas}/${esperadas} filas.`);
    await sequelize.close();
    if (auditadas < esperadas) process.exit(2);
  } catch (err: any) {
    console.error('ABORTA:', err.message ?? err);
    process.exit(1);
  }
})();
