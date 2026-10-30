/**
 * Crea manualmente el Pedido PV para ODP-24455 (proveedor Vitelsa, 33 vidrios laminados
 * crudos 5+5 PVB 0,76 y 3+3 PVB 0,38), solicitado por el usuario el 2026-10-30.
 * Mismo patrón que crear_pedido_pv_odp24000_2026-09-05.ts, que replica `crearPedido()`
 * de frontend-web/src/features/pedidos-pv/PedidosPVPage.tsx:
 *
 *   1. POST /api/odp/:id/items  → agrega los ODPItem (sin asignar a ningún pedido)
 *   2. POST /api/pedidos-pv     → crea el PedidoPV vacío; los ítems se asignan después
 *      desde "Por Gestionar" (allí se parte en 3 formularios de 12 para Vitelsa)
 *
 * El texto "LAMINADO… PVB…" va en `otros` porque el formulario de Vitelsa no imprime
 * `tipo_vidrio`: solo llega al proveedor por "Especificaciones especiales".
 *
 * Uso (desde la raíz del repo):
 *   ./backend-api/node_modules/.bin/ts-node backend-api/src/scripts/2026-10-30_crear_pedido_pv_odp24455.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: 'backend-api/.env' });

import { ODP, ODPItem, PedidoPV, sequelize } from '../models';
import { UniqueConstraintError } from 'sequelize';

const NUMERO_ODP = 'ODP-24455';
const CREADO_POR = 1; // Luis Alcala (admin, puede_gestionar_pv = true)

const L55 = { espesor: '5+5', otros: 'LAMINADO INCOLORO 5+5 PVB 0,76' };
const L33 = { espesor: '3+3', otros: 'LAMINADO INCOLORO 3+3 PVB 0,38' };

// [cantidad, ancho, alto, tipo] en el orden de la tabla del usuario.
const FILAS: [number, number, number, typeof L55][] = [
  [2, 1525, 1827, L55], [2, 2318, 2849, L55], [1, 3184, 840, L55],
  [1, 1427, 1482, L33], [1, 755, 1482, L33], [1, 2315, 840, L33],
  [1, 1433, 1480, L33], [1, 755, 1480, L33], [1, 2321, 840, L33],
  [1, 782, 1587, L55], [2, 1029, 1498, L55], [1, 767, 1585, L55],
  [2, 1006, 1516, L55], [2, 1001, 1498, L55], [2, 395, 1403, L55],
  [1, 1272, 1403, L55], [2, 1525, 2347, L55], [2, 2318, 3369, L55],
  [1, 3184, 840, L55], [1, 954, 1515, L55], [1, 1134, 1515, L55],
  [2, 1133, 1529, L55], [1, 969, 1509, L55], [1, 1133, 1509, L55],
  [2, 1136, 1516, L55], [2, 2318, 840, L55], [1, 1330, 1837, L55],
  [1, 855, 1837, L55], [2, 2318, 840, L55], [1, 1330, 1833, L55],
  [1, 855, 1833, L55], [1, 1104, 2359, L55], [1, 1574, 2517, L55],
];

const ITEMS = FILAS.map(([cantidad, ancho_mm, alto_mm, tipo]) => ({
  item: null,
  cantidad,
  ancho_mm,
  alto_mm,
  color: 'Incoloro',
  espesor: tipo.espesor,
  tipo_vidrio: null,
  pelicula: null,
  matizado: null,
  carton: null,
  huacal: null,
  accesorios: null,
  pulidos: '2',
  pulidos_h: '2',
  perforaciones: 0,
  boquetes: 0,
  descuentos: null,
  otros: tipo.otros,
  mts_pt_a: null,
  mts_pt_h: null,
  prod: 'CR-LAM',
  verificacion_prod: false,
}));

const generarNumeroPedido = async (): Promise<{ numero_pedido: string; numero_base: number }> => {
  const ultimo = await PedidoPV.findOne({ order: [['numero_base', 'DESC']], attributes: ['numero_base'] });
  const numero_base = ultimo ? (ultimo.getDataValue('numero_base') as number) + 1 : 6733;
  return { numero_pedido: String(numero_base), numero_base };
};

(async () => {
  if (ITEMS.length !== 33 || ITEMS.reduce((s, it) => s + it.cantidad, 0) !== 45) {
    throw new Error('La lista no cuadra con la tabla aprobada (33 filas, 45 piezas)');
  }
  const t = await sequelize.transaction();
  try {
    const odp = await ODP.findOne({ where: { numero_odp: NUMERO_ODP }, transaction: t });
    if (!odp) throw new Error(`${NUMERO_ODP} no encontrada`);
    const odp_id = odp.getDataValue('id') as number;

    const estadoActual = odp.getDataValue('estado_produccion') as string;
    if (['INSTALANDO', 'INSTALADA', 'ENTREGADA', 'PAUSADA', 'ANULADA'].includes(estadoActual)) {
      throw new Error(`ODP en estado ${estadoActual}: agregarItems lo bloquearía para un usuario no admin/gerencia`);
    }

    // 1) Ítems (igual que agregarItems en odp.controller.ts: bulkCreate simple)
    const itemsCreados = await ODPItem.bulkCreate(
      ITEMS.map(it => ({ ...it, odp_id })) as any,
      { transaction: t },
    );
    console.log(`Ítems creados (${itemsCreados.length}): ${itemsCreados.map(i => i.getDataValue('id')).join(', ')}`);

    // 2) Pedido PV (igual que createPedidoPV, con reintento ante colisión de numero_pedido)
    let pedido;
    let intentos = 0;
    for (;;) {
      intentos++;
      try {
        const { numero_pedido, numero_base } = await generarNumeroPedido();
        pedido = await PedidoPV.create({
          odp_id,
          proveedor: 'Vitelsa',
          sufijo: null,
          fecha_entrega_prometida: null,
          metraje_venta: null,
          espesor_vidrio: '5+5 / 3+3',
          observaciones: null,
          numero_pedido,
          numero_base,
          creado_por: CREADO_POR,
          estado: 'PENDIENTE',
          origen: 'SISTEMA',
        }, { transaction: t });
        break;
      } catch (err) {
        if (err instanceof UniqueConstraintError && intentos < 5) continue;
        throw err;
      }
    }

    await t.commit();
    console.log('Pedido PV creado:', pedido!.getDataValue('numero_pedido'), '(id', pedido!.getDataValue('id'), ')');
  } catch (e) {
    await t.rollback();
    console.error('ERROR — no se creó nada:', e);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
