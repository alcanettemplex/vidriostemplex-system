// Configuración del multiplicador costo→precio de venta por categoría.
//
// La tabla `cotizador.multiplicador_categoria` existía desde el 2026-09-14 pero
// no tenía NINGÚN endpoint: sólo la leía `sincronizacionProveedores.ts` por
// dentro. Resultado práctico: sólo ACCESORIO quedó sembrado (por script), y el
// sync automático de precios de proveedor se abstenía en silencio de tocar
// PERFILERIA, VIDRIO y ACABADO — el 61% del catálogo del Cotizador (ver
// TECH_DEBT.md 2026-09-14). Esto lo hace configurable desde la pantalla.
//
// AUSENTE ≠ 1.0: una categoría sin fila NO se trata como multiplicador neutro.
// Es la señal deliberada que usa el motor de sync para no inventar un precio de
// venta que nadie verificó. Por eso el listado devuelve `configurado: false` en
// vez de rellenar con ceros o unos.
//
// APLICA HACIA ADELANTE: guardar un multiplicador NO mueve ningún precio ya
// cargado (decisión del usuario, 2026-09-16). Recalcular lo existente es una
// acción aparte y explícita — `POST /:categoria/recalcular` — para que 300+
// precios nunca se muevan como efecto colateral de editar un número.
import { Request, Response } from 'express';
import { z } from 'zod';
import { QueryTypes } from 'sequelize';
import { sequelize, Usuario, CotizadorMultiplicadorCategoria, CotizadorProducto } from '../models';
import { recalcularCostosDesdeProveedor, realinearPreciosAlMultiplicador } from '../cotizador/lib/sincronizacionProveedores';
import { recargarPrecios } from '../cotizador/lib/catalogo';

function responderZod(res: Response, e: unknown): boolean {
  if (e instanceof z.ZodError) {
    res.status(400).json({ error: e.issues[0]?.message ?? 'Datos inválidos.' });
    return true;
  }
  return false;
}

/** Nombre legible del usuario autenticado, para `actualizado_por` (STRING(80)). */
async function actorDesdeRequest(req: Request): Promise<string> {
  const id = req.user?.id;
  if (!id) return 'desconocido';
  const usuario = await Usuario.findByPk(id, { attributes: ['nombre_completo'] });
  return (usuario?.getDataValue('nombre_completo') as string | undefined) || `usuario-${id}`;
}

/**
 * Forma de un cambio de precio tal como lo devuelven las dos fases del motor.
 * Se declara acá (y no se importa) porque `CambioProducto` es interno de
 * `sincronizacionProveedores.ts`: exportarlo sólo para tipar esta respuesta
 * ampliaría su superficie pública sin necesidad.
 */
interface CambioRecalculo {
  codigo: string;
  categoria: string;
  antes: { costo_unitario: number; precio_pa: number; precio_pm: number; precio_pb: number };
  despues: { costo_unitario: number; precio_pa: number; precio_pm: number; precio_pb: number };
}

interface FilaCategoria {
  categoria: string;
  productos: number;
  vinculados: number;
  multiplicador_pa: number | null;
  multiplicador_pm: number | null;
  multiplicador_pb: number | null;
  actualizado_en: Date | null;
  actualizado_por: string | null;
  nota: string | null;
}

/**
 * GET /multiplicadores — una fila por categoría REAL del catálogo del
 * Cotizador (derivadas de `cotizador.producto`, no una lista fija: si mañana
 * aparece una categoría nueva, sale sola en la pantalla).
 *
 * `vinculados` es el dato que decide si el sync automático puede siquiera
 * actuar: un producto sin `catalogo_producto_id` no tiene proveedor del que
 * derivar costo, por mucho multiplicador que tenga su categoría.
 */
export const listarMultiplicadores = async (_req: Request, res: Response) => {
  try {
    const filas = await sequelize.query<FilaCategoria>(
      `SELECT p.categoria,
              COUNT(*)::int AS productos,
              COUNT(*) FILTER (WHERE p.catalogo_producto_id IS NOT NULL)::int AS vinculados,
              m.multiplicador_pa, m.multiplicador_pm, m.multiplicador_pb,
              m.actualizado_en, m.actualizado_por, m.nota
         FROM cotizador.producto p
         LEFT JOIN cotizador.multiplicador_categoria m ON m.categoria = p.categoria
        GROUP BY p.categoria, m.multiplicador_pa, m.multiplicador_pm, m.multiplicador_pb,
                 m.actualizado_en, m.actualizado_por, m.nota
        ORDER BY COUNT(*) DESC`,
      { type: QueryTypes.SELECT }
    );

    res.json(
      filas.map((f) => ({
        categoria: f.categoria,
        productos: f.productos,
        vinculados: f.vinculados,
        // "sin configurar" es un estado propio, no un multiplicador de 1.0.
        configurado: f.multiplicador_pa !== null,
        multiplicadorPa: f.multiplicador_pa,
        multiplicadorPm: f.multiplicador_pm,
        multiplicadorPb: f.multiplicador_pb,
        actualizadoEn: f.actualizado_en,
        actualizadoPor: f.actualizado_por,
        nota: f.nota,
      }))
    );
  } catch (e) {
    console.error('listarMultiplicadores:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudieron leer los multiplicadores por categoría.' });
  }
};

const multiplicadorSchema = z
  .object({
    // Un multiplicador por debajo de 1 significaría vender por debajo del costo:
    // se rechaza aquí y no en la pantalla, que es donde de verdad importa.
    multiplicadorPa: z.number().positive().min(1, 'El multiplicador PA no puede ser menor que 1 (sería vender bajo costo).'),
    multiplicadorPm: z.number().positive().min(1, 'El multiplicador PM no puede ser menor que 1 (sería vender bajo costo).'),
    multiplicadorPb: z.number().positive().min(1, 'El multiplicador PB no puede ser menor que 1 (sería vender bajo costo).'),
    nota: z.string().max(2000).nullable().optional(),
    // `error` (no `min`) para que faltar el campo dé el mismo mensaje legible
    // que mandarlo vacío: en Zod 4 el "expected string, received undefined" se
    // dispara antes de llegar a las validaciones de longitud.
    motivo: z
      .string({ error: 'Hace falta un motivo para cambiar un multiplicador.' })
      .min(1, 'Hace falta un motivo para cambiar un multiplicador.')
      .max(300),
  })
  .strict()
  .superRefine((d, ctx) => {
    // PA ≥ PM ≥ PB es la escala del negocio (A el más caro, B el más barato).
    // Invertirla no rompe ningún cálculo pero sí el significado de los tres
    // segmentos, y nadie se enteraría hasta ver una cotización rara.
    if (d.multiplicadorPa < d.multiplicadorPm || d.multiplicadorPm < d.multiplicadorPb) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Los multiplicadores deben cumplir PA ≥ PM ≥ PB.' });
    }
  });

/**
 * PUT /multiplicadores/:categoria — crea o actualiza el multiplicador.
 *
 * NO recalcula nada de lo ya cargado: el cambio rige para las próximas
 * sincronizaciones de precio de proveedor y para las altas nuevas. Para mover
 * lo existente está `POST /:categoria/recalcular`.
 */
export const guardarMultiplicador = async (req: Request, res: Response) => {
  const { categoria } = req.params;
  try {
    const datos = multiplicadorSchema.parse(req.body ?? {});

    // La categoría tiene que existir de verdad en el catálogo: si no, se estaría
    // configurando un multiplicador que ningún producto va a usar nunca.
    const [{ existe }] = await sequelize.query<{ existe: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM cotizador.producto WHERE categoria = :categoria) AS existe`,
      { replacements: { categoria }, type: QueryTypes.SELECT }
    );
    if (!existe) {
      return res.status(404).json({ error: `Ningún producto del Cotizador tiene la categoría "${categoria}".` });
    }

    const actor = await actorDesdeRequest(req);
    const nota = datos.nota?.trim()
      ? `${datos.nota.trim()} · ${datos.motivo}`
      : datos.motivo;

    const [fila, creada] = await CotizadorMultiplicadorCategoria.findOrCreate({
      where: { categoria },
      defaults: {
        categoria,
        multiplicador_pa: datos.multiplicadorPa,
        multiplicador_pm: datos.multiplicadorPm,
        multiplicador_pb: datos.multiplicadorPb,
        actualizado_en: new Date(),
        actualizado_por: actor,
        nota: nota.slice(0, 2000),
      },
    });
    if (!creada) {
      await fila.update({
        multiplicador_pa: datos.multiplicadorPa,
        multiplicador_pm: datos.multiplicadorPm,
        multiplicador_pb: datos.multiplicadorPb,
        actualizado_en: new Date(),
        actualizado_por: actor,
        nota: nota.slice(0, 2000),
      });
    }
    // La caché lleva los multiplicadores desde el 2026-09-26: el costo manual de
    // los productos con precio a cotizar los usa, y debe ver el valor nuevo ya.
    await recargarPrecios();

    res.json({
      categoria,
      creada,
      multiplicadorPa: datos.multiplicadorPa,
      multiplicadorPm: datos.multiplicadorPm,
      multiplicadorPb: datos.multiplicadorPb,
      actualizadoPor: actor,
      aviso: 'El cambio aplica hacia adelante. Los precios ya cargados no se movieron: usá "Recalcular" si querés aplicarlo a lo existente.',
    });
  } catch (e) {
    if (responderZod(res, e)) return;
    console.error('guardarMultiplicador:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo guardar el multiplicador.' });
  }
};

/**
 * POST /multiplicadores/:categoria/recalcular — aplica el multiplicador vigente
 * a los productos YA cargados de esa categoría.
 *
 * Reutiliza `recalcularCostosDesdeProveedor()`, el mismo motor que corre solo
 * cuando Compras carga una factura: así la pantalla y el automático no pueden
 * divergir en el criterio (proveedor más barato entre los que siguen precios,
 * costo por metro si la compra es por tira, etc.).
 *
 * Se llama UNA vez con todos los ids de la categoría, no una vez por id: la
 * versión por-id costaba ~896 viajes al pooler para PERFILERIA (96,7 s
 * medidos, pegado al corte de 100 s de Cloudflare, que cae DESPUÉS de que el
 * backend ya escribió). Ver TECH_DEBT.md 2026-09-16 (2). Cada fase va en una
 * sola transacción — todo o nada, que para una acción masiva y explícita como
 * ésta es la semántica segura.
 *
 * Corre en DOS FASES (decisión del usuario, 2026-09-17):
 *   1. Los productos con proveedor que sigue precios reciben costo nuevo, y de
 *      ahí su precio de venta.
 *   2. Todos los demás CONSERVAN su costo y sólo se les realinea PA/PM/PB al
 *      multiplicador de la categoría.
 * Así "Recalcular" significa lo que uno espera: al terminar, todo producto de
 * la categoría con costo > 0 está regido por el multiplicador de su categoría.
 * Un producto con costo en 0 se omite: 0 × multiplicador es 0, y escribir un
 * precio de venta en cero es justo lo que este módulo no debe hacer.
 *
 * `dryRun=true` permite ver el impacto ANTES de mover un solo precio.
 */
export const recalcularCategoria = async (req: Request, res: Response) => {
  const { categoria } = req.params;
  const dryRun = String(req.query.dry_run ?? '') === 'true';
  try {
    const multiplicador = await CotizadorMultiplicadorCategoria.findByPk(categoria);
    if (!multiplicador) {
      return res.status(400).json({
        error: `La categoría "${categoria}" no tiene multiplicador configurado. Guardá uno antes de recalcular.`,
      });
    }

    const productos = await CotizadorProducto.findAll({
      where: { categoria },
      attributes: ['codigo', 'catalogo_producto_id'],
    });
    const idsCatalogo = [
      ...new Set(
        productos
          .map((p) => p.getDataValue('catalogo_producto_id') as number | null)
          .filter((id): id is number => id !== null)
      ),
    ];
    const sinVinculo = productos.length - productos.filter((p) => p.getDataValue('catalogo_producto_id') !== null).length;

    // ─── Fase 1: el costo VIENE del proveedor ───────────────────────────────
    const cambios: (CambioRecalculo & { fase: 'proveedor' | 'realineacion' })[] = [];
    const omitidos: { codigo: string; motivo: string }[] = [];
    const movidosPorProveedor = new Set<string>();
    for (const r of await recalcularCostosDesdeProveedor(idsCatalogo, { dryRun })) {
      for (const c of r.cambios) {
        movidosPorProveedor.add(c.codigo);
        cambios.push({ ...c, fase: 'proveedor' });
      }
      omitidos.push(...r.omitidos);
    }

    // ─── Fase 2: el costo SE CONSERVA, sólo se realinea el precio de venta ──
    // Sin esto, un producto con costo cargado pero sin proveedor del que
    // derivarlo se queda para siempre con el multiplicador del día que entró:
    // eran 116 de PERFILERIA atascados en 1,514500. Decisión del usuario
    // (2026-09-17): todo producto de la categoría se rige por el multiplicador
    // de su categoría, tenga proveedor o no. Los que ya movió la fase 1 se
    // excluyen — quedaron alineados por construcción y volver a tocarlos sólo
    // duplicaría líneas de historial.
    const realineacion = await realinearPreciosAlMultiplicador(categoria, {
      dryRun,
      excluirCodigos: movidosPorProveedor,
    });
    for (const c of realineacion.cambios) cambios.push({ ...c, fase: 'realineacion' });
    omitidos.push(...realineacion.omitidos);

    // Una sola recarga al final: las dos fases escriben en la tabla base pero
    // no tocan la caché (eso lo hace la cola coalescida del sync).
    if (!dryRun && cambios.length > 0) await recargarPrecios();

    const nProveedor = movidosPorProveedor.size;
    const nRealineados = realineacion.cambios.length;
    res.json({
      categoria,
      dryRun,
      productosEnCategoria: productos.length,
      sinVinculoACatalogo: sinVinculo,
      porProveedor: nProveedor,
      realineados: nRealineados,
      cambios,
      omitidos,
      resumen:
        `${cambios.length} producto(s) ${dryRun ? 'cambiarían' : 'actualizados'}: ` +
        `${nProveedor} con costo nuevo del proveedor y ${nRealineados} realineado(s) al multiplicador ` +
        `conservando su costo. ${omitidos.length} omitido(s). ` +
        `${sinVinculo} sin vínculo al catálogo maestro (no se les puede derivar costo, pero sí realinear).`,
    });
  } catch (e) {
    console.error('recalcularCategoria:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo recalcular la categoría.' });
  }
};
