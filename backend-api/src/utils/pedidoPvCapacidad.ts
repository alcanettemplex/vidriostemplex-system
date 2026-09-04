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

// Los proveedores llegan de un <select> del formulario, pero también de datos viejos
// y de scripts: se comparan siempre normalizados para que ' Templacol ' o 'templacol'
// no cuenten como un proveedor distinto.
export const normalizarProveedor = (proveedor?: string | null): string =>
  String(proveedor ?? '').trim();

export const mismoProveedor = (a?: string | null, b?: string | null): boolean =>
  normalizarProveedor(a).toLowerCase() === normalizarProveedor(b).toLowerCase();

// El formato de Templacol tiene 29 filas de ítem (B16:B44); el de Vitelsa, 12.
// De este tope dependen tanto el troquelado en extensiones (-1, -2…) como el número
// de filas que llena el generador de Excel.
export const esTemplacol = (proveedor?: string | null): boolean =>
  normalizarProveedor(proveedor).toLowerCase() === 'templacol';

/**
 * Proveedor con el que se debe imprimir / exportar un pedido.
 *
 * En condiciones normales `pedido.proveedor` ya viene alineado con la ODP, porque
 * `updateODP` propaga el cambio. Esto es la red de seguridad para las filas que se
 * desalinearon por fuera de ese camino —edición directa en Supabase, `PATCH
 * /api/pedidos-pv/:id`, o pedidos anteriores a que existiera la propagación—: el
 * papel que sale hacia el proveedor es irreversible, así que ahí manda la ODP.
 *
 * Solo aplica a los pedidos que nacieron de la ODP (`origen = 'SISTEMA'`). Un pedido
 * MANUAL puede apuntar a propósito a otro proveedor que el de la ODP y no se toca.
 */
export const proveedorParaFormato = (
  proveedorPedido?: string | null,
  proveedorOdp?: string | null,
  origen?: string | null,
): string => {
  const delPedido = normalizarProveedor(proveedorPedido);
  const deLaOdp = normalizarProveedor(proveedorOdp);
  if (origen !== 'SISTEMA' || !deLaOdp) return delPedido;
  return deLaOdp;
};

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

/**
 * Alinea el proveedor de todos los Pedidos PV de una ODP con el de la ODP.
 *
 * La ODP es la fuente de verdad: el formulario que se le manda al proveedor (Excel e
 * impreso) se elige por `pedido_pv.proveedor`, así que un cambio en la ODP que no se
 * propague hace que el módulo Pedidos PV siga generando el formato del proveedor viejo.
 *
 * Se propaga en cualquier estado del pedido —incluidos ENVIADO y CONFIRMADO_PROVEEDOR—
 * por decisión operativa; el cambio queda en `auditoria_log` con autor y valor anterior.
 *
 * Vive aquí y no en `pedido_pv.controller` por el ciclo de imports descrito arriba:
 * así lo pueden consumir `odp.controller` y los scripts de mantenimiento por igual.
 *
 * @returns cuántos pedidos se tocaron (0 si la ODP no tiene pedidos o ya estaban alineados)
 */
export const propagarProveedorAPedidosPV = async (
  odpId: number,
  proveedor: string,
  usuarioId: number | null,
): Promise<number> => {
  const destino = normalizarProveedor(proveedor);
  if (!destino) return 0;

  // findAll + update por INSTANCIA: un update masivo no dispara los hooks de
  // MODELOS_AUDITADOS y el cambio quedaría sin registro en auditoria_log.
  const pedidos = await PedidoPV.findAll({ where: { odp_id: odpId } });
  let tocados = 0;

  for (const pv of pedidos) {
    if (mismoProveedor(pv.getDataValue('proveedor'), destino)) continue;
    await pv.update({ proveedor: destino });
    tocados++;
  }

  // Si el formulario del proveedor nuevo admite menos ítems que el anterior
  // (Templacol 29 → Vitelsa 12), los que se pasen del tope van a extensiones.
  if (tocados > 0) await reparticionarPedidosPV(odpId, destino, usuarioId);

  return tocados;
};
