/**
 * Capacidad del formulario físico de cada proveedor de vidrio y reparto de ítems.
 *
 * Vive fuera de los controladores a propósito: `pedido_pv.controller` importa
 * `../server` de forma estática, y server → app → routes → controller cierra un ciclo.
 * Si `odp.controller` (o un script) importara estas funciones desde el controlador,
 * entraría en ese ciclo y, según el punto de entrada, los handlers de las rutas
 * quedarían sin definir. Este módulo solo depende de los modelos, que no importan
 * controladores, así que es seguro consumirlo desde cualquier lado.
 */
import { Op } from 'sequelize';
import { PedidoPV, ODPItem, sequelize } from '../models';

// El formato de Templacol tiene 29 filas de ítem (B16:B44); el de Vitelsa, 12.
// De este tope dependen tanto el troquelado en extensiones (-1, -2…) como el número
// de filas que llena el generador de Excel.
export const esTemplacol = (proveedor?: string | null): boolean =>
  String(proveedor ?? '').trim().toLowerCase() === 'templacol';

export const maxItemsPorPedido = (proveedor?: string | null): number =>
  (esTemplacol(proveedor) ? 29 : 12);

// Reparte una lista de ítems en bloques del tamaño que admita el formulario.
export const bloquesPorProveedor = <T>(items: T[], proveedor?: string | null): T[][] => {
  const tope = maxItemsPorPedido(proveedor);
  const bloques: T[][] = [];
  for (let i = 0; i < items.length; i += tope) bloques.push(items.slice(i, i + tope));
  return bloques;
};

/**
 * Redistribuye los ítems ya asignados de una ODP entre el pedido principal y sus
 * extensiones, según el tope del formulario del proveedor indicado.
 *
 * Se usa al cambiar el proveedor de una ODP: si el formato nuevo admite menos ítems
 * que el anterior (Templacol 29 → Vitelsa 12), los que se pasan del tope no cabrían
 * en el papel y hay que abrir extensiones.
 *
 * Solo actúa sobre los grupos que efectivamente exceden el tope. Rehacer un grupo
 * elimina y recrea sus extensiones —perdiendo su estado y sus fechas—, así que no se
 * toca nada cuando todo cabe como está (caso Vitelsa 12 → Templacol 29).
 *
 * @returns cuántos grupos (numero_base) hubo que rehacer
 */
export const reparticionarPedidosPV = async (
  odpId: number,
  proveedor: string,
  usuarioId: number | null,
): Promise<number> => {
  const tope = maxItemsPorPedido(proveedor);

  const pedidos = await PedidoPV.findAll({
    where: { odp_id: odpId },
    attributes: ['id', 'numero_base', 'sufijo', 'creado_por'],
    order: [['numero_base', 'ASC'], ['sufijo', 'ASC']],
  });
  if (pedidos.length === 0) return 0;

  // Una ODP puede tener varios grupos si se crearon pedidos manuales adicionales;
  // cada numero_base es un pedido con sus propias extensiones.
  const grupos = new Map<number, typeof pedidos>();
  for (const p of pedidos) {
    const base = p.getDataValue('numero_base') as number;
    if (!grupos.has(base)) grupos.set(base, [] as unknown as typeof pedidos);
    grupos.get(base)!.push(p);
  }

  let gruposRehechos = 0;

  for (const [numero_base, delGrupo] of grupos) {
    const idsGrupo = delGrupo.map(p => p.getDataValue('id') as number);
    const items = await ODPItem.findAll({
      where: { pedido_pv_id: idsGrupo },
      attributes: ['id', 'pedido_pv_id'],
      order: [['id', 'ASC']],
    });
    if (items.length === 0) continue;

    const porPedido = new Map<number, number>();
    for (const it of items) {
      const pid = it.getDataValue('pedido_pv_id') as number;
      porPedido.set(pid, (porPedido.get(pid) || 0) + 1);
    }
    if (!Array.from(porPedido.values()).some(n => n > tope)) continue;

    const principal = delGrupo.find(p => !p.getDataValue('sufijo')) || delGrupo[0];
    const bloques = bloquesPorProveedor(items.map(i => i.getDataValue('id') as number), proveedor);

    const t = await sequelize.transaction();
    try {
      await ODPItem.update({ pedido_pv_id: null }, { where: { pedido_pv_id: idsGrupo }, transaction: t });
      // individualHooks: los hooks de MODELOS_AUDITADOS no disparan en operaciones bulk.
      await PedidoPV.destroy({
        where: { numero_base, odp_id: odpId, sufijo: { [Op.ne]: null } },
        transaction: t,
        individualHooks: true,
      });

      await ODPItem.update(
        { pedido_pv_id: principal.getDataValue('id') },
        { where: { id: bloques[0] }, transaction: t }
      );

      for (let i = 1; i < bloques.length; i++) {
        const sufijo = String(i);
        const extension = await PedidoPV.create({
          odp_id: odpId,
          proveedor,
          numero_pedido: `${numero_base}-${sufijo}`,
          numero_base,
          sufijo,
          estado: 'PENDIENTE',
          origen: 'SISTEMA',
          creado_por: principal.getDataValue('creado_por') || usuarioId,
        }, { transaction: t });

        await ODPItem.update(
          { pedido_pv_id: extension.getDataValue('id') },
          { where: { id: bloques[i] }, transaction: t }
        );
      }

      await t.commit();
      gruposRehechos++;
      console.log(`🔀 Pedido PV ${numero_base} de la ODP ${odpId} repartido en ${bloques.length} formulario(s) (tope ${tope}).`);
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  return gruposRehechos;
};
