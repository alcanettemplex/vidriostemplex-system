/**
 * Crea manualmente el Pedido PV para ODP-24000 (proveedor Vitelsa, 3 cristales)
 * solicitado por el usuario el 2026-09-05, replicando exactamente lo que hace
 * `crearPedido()` en frontend-web/src/features/pedidos-pv/PedidosPVPage.tsx:
 *
 *   1. POST /api/odp/:id/items  → agrega los ODPItem (sin asignar a ningún pedido)
 *   2. POST /api/pedidos-pv     → crea el PedidoPV vacío (los ítems se asignan
 *      después desde "Por Gestionar", igual que en el flujo real)
 *
 * Uso:
 *   ./backend-api/node_modules/.bin/ts-node -r "C:/dev/vidrios-templex-system/backend-api/node_modules/dotenv/config" backend-api/src/scripts/crear_pedido_pv_odp24000_2026-09-05.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: 'backend-api/.env' });

import { ODP, ODPItem, PedidoPV, sequelize } from '../models';
import { UniqueConstraintError } from 'sequelize';

const NUMERO_ODP = 'ODP-24000';
const CREADO_POR = 76; // Alejandro Ardila (admin, puede_gestionar_pv = true)

const ITEMS = [
  { color: 'Incoloro', espesor: '8', ancho_mm: 1104, alto_mm: 2175 },
  { color: 'Incoloro', espesor: '8', ancho_mm: 1128, alto_mm: 2175 },
  { color: 'Incoloro', espesor: '8', ancho_mm: 1190, alto_mm: 2183 },
].map(base => ({
  ...base,
  item: null,
  cantidad: 1,
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
  otros: null,
  mts_pt_a: null,
  mts_pt_h: null,
  prod: 'PV',
  verificacion_prod: false,
}));

const generarNumeroPedido = async (): Promise<{ numero_pedido: string; numero_base: number }> => {
  const ultimo = await PedidoPV.findOne({ order: [['numero_base', 'DESC']], attributes: ['numero_base'] });
  const numero_base = ultimo ? (ultimo.getDataValue('numero_base') as number) + 1 : 6733;
  return { numero_pedido: String(numero_base), numero_base };
};

(async () => {
  const t = await sequelize.transaction();
  try {
    const odp = await ODP.findOne({ where: { numero_odp: NUMERO_ODP }, transaction: t });
    if (!odp) throw new Error(`${NUMERO_ODP} no encontrada`);
    const odp_id = odp.getDataValue('id') as number;

    const estadoActual = odp.getDataValue('estado_produccion') as string;
    if (['INSTALANDO', 'INSTALADA', 'ENTREGADA', 'PAUSADA'].includes(estadoActual)) {
      throw new Error(`ODP en estado ${estadoActual}: agregarItems lo bloquearía para un usuario no admin/gerencia`);
    }

    // 1) Ítems (igual que agregarItems en odp.controller.ts: bulkCreate simple)
    const itemsCreados = await ODPItem.bulkCreate(
      ITEMS.map(it => ({ ...it, odp_id })) as any,
      { transaction: t },
    );
    console.log(`Ítems creados: ${itemsCreados.map(i => i.getDataValue('id')).join(', ')}`);

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
          fecha_entrega_prometida: '2026-09-15',
          metraje_venta: null,
          espesor_vidrio: '8',
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
