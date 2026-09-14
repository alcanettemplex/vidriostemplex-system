// Motor de sincronización automática: cuando el módulo Proveedores actualiza
// el precio vigente de un producto (`actualizarPrecio()` en
// proveedor.controller.ts), este archivo recalcula el costo/precio de venta
// de los productos del Cotizador vinculados a ese mismo producto del catálogo
// maestro (`cotizador.producto.catalogo_producto_id`).
//
// Nombre deliberadamente distinto de `cotizador/lib/precios/proveedorSequelize.ts`
// (que pese a su nombre es el adaptador de LECTURA interno del propio
// Cotizador, sin relación con el módulo Proveedores real) para no arrastrar
// esa ambigüedad — ver plan de integración de la sesión 2026-09-14.
//
// Decisión de arquitectura: escribe en `cotizador.producto` (la tabla BASE),
// nunca en `CotizadorPrecioOverride`. El comentario del propio modelo de
// override dice que esa capa "gana siempre" porque es edición humana
// deliberada — si el sync escribiera ahí, competiría por la misma fila que un
// humano edita desde la pantalla de precios sin ninguna precedencia clara. Un
// override activo sigue ganando en la caché tal cual funciona hoy; el sync
// sólo mueve el costo de mercado por defecto.
//
// Requiere la caché del Cotizador precargada (getProducto la exige): dentro
// del proceso del backend ya lo está desde el boot (server.ts); un script
// one-off que importe este módulo aparte debe llamar a
// `cotizador/cache.ts` → `precargar()` primero (ver
// 2026-09-14_cotizador_recosteo_retroactivo_proveedor.ts).
import { Op, Transaction } from 'sequelize';
import { sequelize, CotizadorProducto, CotizadorPrecioHistorial, CotizadorMultiplicadorCategoria, ProveedorProducto, Proveedor } from '../../models';
import { siguePrecios } from '../../utils/proveedorReglas';
import { getProducto, recargarPrecios } from './catalogo';
import { round2 } from './motorCalculo';

interface CambioProducto {
  codigo: string;
  categoria: string;
  antes: { costo_unitario: number; precio_pa: number; precio_pm: number; precio_pb: number };
  despues: { costo_unitario: number; precio_pa: number; precio_pm: number; precio_pb: number };
}

interface Omitido {
  codigo: string;
  motivo: string;
}

export interface ResultadoRecalculo {
  catalogoProductoId: number;
  proveedorElegido: { id: number; nombre: string; precio: number } | null;
  cambios: CambioProducto[];
  omitidos: Omitido[];
}

/**
 * Recalcula costo_unitario/precio_pa/pm/pb de todos los productos del
 * Cotizador vinculados a `catalogoProductoId`, a partir del proveedor más
 * barato entre los que pasan `siguePrecios` (activo=true Y seguir_precios=true).
 *
 * `null` cuando ningún producto del Cotizador está vinculado a ese
 * `catalogoProductoId` — es el no-op barato para la mayoría de los productos
 * de Proveedores (que hoy no tienen ningún equivalente en el Cotizador):
 * un solo `findAll` indexado, sin abrir transacción ni tocar nada más.
 */
export async function recalcularCostoDesdeProveedor(
  catalogoProductoId: number,
  opts: { dryRun?: boolean } = {}
): Promise<ResultadoRecalculo | null> {
  const productos = await CotizadorProducto.findAll({ where: { catalogo_producto_id: catalogoProductoId } });
  if (productos.length === 0) return null;

  const candidatos = await ProveedorProducto.findAll({
    where: { catalogo_producto_id: catalogoProductoId, activo: true, precio_actual: { [Op.ne]: null } },
    include: [{ model: Proveedor, as: 'proveedor', attributes: ['id', 'nombre_comercial', 'activo', 'seguir_precios'] }],
    order: [['precio_actual', 'ASC']],
  });
  const elegido = candidatos.find((pp: any) => siguePrecios(pp.get('proveedor')));

  const omitidos: Omitido[] = [];
  const cambios: CambioProducto[] = [];

  if (!elegido) {
    for (const p of productos) omitidos.push({ codigo: p.get('codigo') as string, motivo: 'sin proveedor activo (seguir_precios=true) con precio para este producto' });
    return { catalogoProductoId, proveedorElegido: null, cambios, omitidos };
  }

  const unidadCompra = elegido.get('unidad_compra') as string;
  const precioActual = Number(elegido.get('precio_actual'));
  const metrosPorUnidad = Number(elegido.get('metros_por_unidad') ?? 6);
  const costoBase = unidadCompra === 'TIRA_6M' && metrosPorUnidad > 0 ? precioActual / metrosPorUnidad : precioActual;
  const proveedorInstancia: any = elegido.get('proveedor');
  const proveedorElegido = {
    id: proveedorInstancia.get('id') as number,
    nombre: proveedorInstancia.get('nombre_comercial') as string,
    precio: precioActual,
  };

  for (const producto of productos) {
    const codigo = producto.get('codigo') as string;
    const categoria = producto.get('categoria') as string;

    // Estado resuelto (incluye override) — un producto dado de baja no se toca.
    const resuelto = getProducto(codigo);
    if (resuelto && resuelto.activo === false) {
      omitidos.push({ codigo, motivo: 'producto dado de baja en el Cotizador (activo=false)' });
      continue;
    }

    const multiplicador = await CotizadorMultiplicadorCategoria.findByPk(categoria);
    if (!multiplicador) {
      omitidos.push({ codigo, motivo: `sin multiplicador verificado para la categoría "${categoria}"` });
      continue;
    }

    const antes = {
      costo_unitario: producto.get('costo_unitario') as number,
      precio_pa: producto.get('precio_pa') as number,
      precio_pm: producto.get('precio_pm') as number,
      precio_pb: producto.get('precio_pb') as number,
    };
    const despues = {
      costo_unitario: round2(costoBase),
      precio_pa: round2(costoBase * (multiplicador.get('multiplicador_pa') as number)),
      precio_pm: round2(costoBase * (multiplicador.get('multiplicador_pm') as number)),
      precio_pb: round2(costoBase * (multiplicador.get('multiplicador_pb') as number)),
    };

    if (
      antes.costo_unitario === despues.costo_unitario &&
      antes.precio_pa === despues.precio_pa &&
      antes.precio_pm === despues.precio_pm &&
      antes.precio_pb === despues.precio_pb
    ) {
      continue; // Sin cambio real: no ensuciar el histórico, mismo criterio que actualizarPrecio().
    }

    const t: Transaction = await sequelize.transaction();
    try {
      await producto.update(despues, { transaction: t });

      let motivo = `Sync automático — proveedor "${proveedorElegido.nombre}" (ProveedorProducto #${elegido.get('id')}) ` +
        `tiene precio vigente $${precioActual}. Costo derivado: $${despues.costo_unitario}.`;
      if (resuelto?.ultimoCambio) {
        motivo += ' (⚠ el producto tiene un override activo; este cambio en la tabla base no se ve reflejado hasta que se quite)';
      }
      await CotizadorPrecioHistorial.create(
        { fecha: new Date(), accion: 'editar-precio', codigo, antes, despues, por: 'sync-proveedores', motivo: motivo.slice(0, 300) },
        { transaction: t }
      );

      if (opts.dryRun) await t.rollback();
      else await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }

    cambios.push({ codigo, categoria, antes, despues });
  }

  return { catalogoProductoId, proveedorElegido, cambios, omitidos };
}

// ─── Cola coalescida ────────────────────────────────────────────────────────
// Un lote de facturas (cargarFacturasLote) puede actualizar decenas de precios
// en una sola transacción de Proveedores; sin coalescer, cada uno dispararía
// su propia recarga completa de la caché del Cotizador (563 filas) en cadena.
// Cada producto sigue escribiendo/comprometiendo su propia transacción de
// inmediato (ver arriba) — sólo se difiere y coalesce el recargarPrecios()
// final, así un error en un producto no bloquea a los demás.
const pendientes = new Set<number>();
let vuelta: NodeJS.Immediate | null = null;

export function programarRecalculo(catalogoProductoId: number): void {
  pendientes.add(catalogoProductoId);
  if (vuelta) return;
  vuelta = setImmediate(async () => {
    vuelta = null;
    const ids = [...pendientes];
    pendientes.clear();
    let huboCambios = false;
    for (const id of ids) {
      try {
        const r = await recalcularCostoDesdeProveedor(id);
        if (r && r.cambios.length > 0) huboCambios = true;
      } catch (e) {
        console.error('[sync-proveedores] recalculo falló para catalogo_producto_id', id, e);
      }
    }
    if (huboCambios) await recargarPrecios();
  });
}
