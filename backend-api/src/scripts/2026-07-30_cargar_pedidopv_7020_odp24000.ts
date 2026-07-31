/**
 * 2026-07-30 — Cargar el Pedido PV 7020 de la ODP-24000 (LABORATORIOS ECAR SA).
 *
 * El pedido se hizo por fuera del sistema (orden de pedido VR03 del 29/07/2026, obra
 * "ODP-24000 — BA") porque el modal "Nuevo Pedido PV" no listaba la ODP: pedía las 200
 * más recientes sin excluir completadas y la ODP-24000 quedaba en la posición 228.
 * Ese modal ya se corrigió; este script reconstruye el pedido que quedó fuera.
 *
 * No se usa el endpoint createPedidoPV porque numera con MAX(numero_base)+1 → daría
 * 7016, y el talonario del proveedor dice 7020. Se crea por Sequelize (instancia, para
 * que dispare la auditoría) dentro de una transacción.
 *
 * Ejecutar una sola vez:
 *   npx ts-node src/scripts/2026-07-30_cargar_pedidopv_7020_odp24000.ts
 */
import { PedidoPV, ODP, ODPItem, sequelize } from '../models';

const ODP_ID = 217;              // ODP-24000
const NUMERO = '7020';
const PROVEEDOR = 'Vitelsa';
const CREADO_POR = 30;           // ROOT — carga administrativa

// Los 4 cristales de la orden VR03. BPB 2/2 → pulidos "2" ancho y "2" alto.
const VIDRIOS = [
  { ancho_mm: 1358, alto_mm: 2270 },
  { ancho_mm: 1130, alto_mm: 2265 },
  { ancho_mm: 1000, alto_mm: 2265 },
  { ancho_mm: 1266, alto_mm: 2270 },
];

const BASE_ITEM = {
  odp_id: ODP_ID,
  color: 'Incoloro',            // "CL" en la orden
  espesor: '8',
  cantidad: 1,
  pulidos: '2',
  pulidos_h: '2',
  perforaciones: 0,
  boquetes: 0,
  pelicula: false,
  matizado: false,
  carton: false,
  huacal: false,
  verificacion_prod: false,
  prod: 'PV',
  estado_compra: 'pendiente',
  observaciones_pv: 'Sello en el canto',
};

(async () => {
  const t = await sequelize.transaction();
  try {
    const odp = (await ODP.findByPk(ODP_ID, { transaction: t })) as any;
    if (!odp) throw new Error(`No existe la ODP con id ${ODP_ID}`);
    console.log(`ODP ${odp.getDataValue('numero_odp')} — estado ${odp.getDataValue('estado_produccion')}`);

    // Idempotencia: no duplicar si el script ya corrió.
    const yaExiste = await PedidoPV.findOne({ where: { numero_base: Number(NUMERO) }, transaction: t });
    if (yaExiste) {
      await t.rollback();
      console.log(`El pedido ${NUMERO} ya existe (id ${yaExiste.getDataValue('id')}). No se hace nada.`);
      return;
    }

    // Metraje total en m² (ancho × alto × cantidad).
    const metraje = VIDRIOS.reduce((s, v) => s + (v.ancho_mm * v.alto_mm) / 1_000_000, 0);

    const pedido = (await PedidoPV.create({
      numero_pedido: NUMERO,
      numero_base: Number(NUMERO),
      sufijo: null,
      odp_id: ODP_ID,
      proveedor: PROVEEDOR,
      creado_por: CREADO_POR,
      estado: 'PENDIENTE',
      origen: 'SISTEMA',
      espesor_vidrio: '8',
      metraje_venta: Number(metraje.toFixed(3)),
      observaciones: 'Orden de pedido VR03 del 29/07/2026. Obra: ODP-24000 — BA. ' +
        'Pedido tramitado por fuera del sistema y cargado a posteriori.',
    } as any, { transaction: t })) as any;

    const pedidoId = pedido.getDataValue('id');
    console.log(`Pedido PV ${NUMERO} creado (id ${pedidoId}) — ${metraje.toFixed(3)} m²`);

    for (const v of VIDRIOS) {
      const item = (await ODPItem.create(
        { ...BASE_ITEM, ...v, pedido_pv_id: pedidoId } as any,
        { transaction: t }
      )) as any;
      console.log(`  ítem id ${item.getDataValue('id')} — ${v.ancho_mm}x${v.alto_mm} mm`);
    }

    await t.commit();
    console.log('\nOK — pedido y 4 ítems creados y vinculados.');

    // Los hooks de auditoría son fire-and-forget: dar margen antes de cerrar.
    await new Promise((r) => setTimeout(r, 3000));
  } catch (e: any) {
    await t.rollback();
    console.error('ERROR (se revirtió todo):', e.message);
  } finally {
    await sequelize.close();
  }
})();
