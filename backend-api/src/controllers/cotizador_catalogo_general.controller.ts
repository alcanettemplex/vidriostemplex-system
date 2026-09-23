// Traer al Cotizador productos del CATÁLOGO GENERAL del ERP (2026-09-23).
//
// El Cotizador tiene su propio catálogo (`cotizador.producto`, ~600 filas) y el
// ERP el suyo (`public.catalogo_productos`, ~1.270). Un producto que sólo existe
// en el segundo —caso real: VMINIBOR, vidrio miniboreal— no se podía cotizar de
// ninguna forma. Esto lo busca y lo da de alta en el Cotizador VINCULADO
// (`catalogo_producto_id`), de modo que su precio sale solo del módulo
// Proveedores con el multiplicador de su categoría, igual que el resto, y se
// mueve cada vez que Proveedores registra un precio nuevo.
//
// El catálogo general casi nunca trae categoría ni unidad (1.205 de 1.271 sin
// categoría y ninguno con unidad, medido el 2026-09-23), así que quien importa
// las elige; aquí sólo se SUGIEREN a partir de la unidad de compra del
// proveedor.
import { Request, Response } from 'express';
import { Op, QueryTypes } from 'sequelize';
import { z } from 'zod';
import {
  sequelize,
  CatalogoProducto,
  CotizadorProducto,
  CotizadorPrecioHistorial,
  CotizadorMultiplicadorCategoria,
  Usuario,
} from '../models';
import { getProducto, recargarPrecios } from '../cotizador/lib/catalogo';
import { recalcularCostoDesdeProveedor } from '../cotizador/lib/sincronizacionProveedores';
import { claseDeUnidad } from '../cotizador/modules/itemLibre';
import { round2 } from '../cotizador/lib/motorCalculo';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fila = Record<string, any>;

export const CATEGORIAS_COTIZADOR = ['VIDRIO', 'ACCESORIO', 'PERFILERIA', 'ACABADO'] as const;
export const UNIDADES_COTIZADOR = ['X M2', 'X METRO', 'UND'] as const;

/** Sugerencia de categoría y unidad a partir de la unidad de compra del
 * proveedor. Es sólo un punto de partida: quien importa confirma. */
function sugerir(unidadCompra: string | null): { categoria: string | null; unidad: string | null } {
  const u = String(unidadCompra ?? '').toUpperCase();
  if (u === 'M2') return { categoria: 'VIDRIO', unidad: 'X M2' };
  if (u === 'TIRA_6M') return { categoria: 'PERFILERIA', unidad: 'X METRO' };
  if (u === 'METRO' || u === 'ML') return { categoria: null, unidad: 'X METRO' };
  if (u === 'UNIDAD' || u === 'UND') return { categoria: 'ACCESORIO', unidad: 'UND' };
  return { categoria: null, unidad: null };
}

/** Clase de la unidad de compra, para avisar si no calza con la unidad elegida. */
function claseCompra(unidadCompra: string | null): 'area' | 'lineal' | 'unidad' | null {
  const u = String(unidadCompra ?? '').toUpperCase();
  if (u === 'M2') return 'area';
  if (u === 'TIRA_6M' || u === 'METRO' || u === 'ML') return 'lineal';
  if (u === 'UNIDAD' || u === 'UND') return 'unidad';
  return null;
}

/** Mejor proveedor de un producto del catálogo general, con el mismo filtro
 * que la sincronización (proveedor activo y con seguimiento de precios) y el
 * costo normalizado por metro cuando se compra la tira de 6 m. */
const SQL_MEJOR_PROVEEDOR = `
  SELECT DISTINCT ON (pp.catalogo_producto_id)
         pp.catalogo_producto_id, pr.nombre_comercial AS proveedor, pp.unidad_compra, pp.precio_actual,
         pp.fecha_precio_actual,
         CASE WHEN pp.unidad_compra = 'TIRA_6M' AND COALESCE(pp.metros_por_unidad, 6) > 0
              THEN pp.precio_actual / COALESCE(pp.metros_por_unidad, 6)
              ELSE pp.precio_actual END AS costo_normalizado
  FROM public.proveedor_producto pp
  JOIN public.proveedores pr ON pr.id = pp.proveedor_id
  WHERE pp.activo AND pp.precio_actual IS NOT NULL AND pr.activo AND pr.seguir_precios = true
    AND pp.catalogo_producto_id IN (:ids)
  ORDER BY pp.catalogo_producto_id, costo_normalizado ASC`;

async function mejoresProveedores(ids: number[]): Promise<Map<number, Fila>> {
  if (ids.length === 0) return new Map();
  const filas = (await sequelize.query(SQL_MEJOR_PROVEEDOR, {
    type: QueryTypes.SELECT,
    replacements: { ids },
  })) as Fila[];
  return new Map(filas.map((f) => [Number(f.catalogo_producto_id), f]));
}

async function actorDesdeRequest(req: Request): Promise<string> {
  const id = req.user?.id;
  if (!id) return 'desconocido';
  const usuario = await Usuario.findByPk(id, { attributes: ['nombre_completo'] });
  return (usuario?.getDataValue('nombre_completo') as string | undefined) || `usuario-${id}`;
}

/**
 * GET /catalogo-general?q= — productos del catálogo general que TODAVÍA no
 * están en el Cotizador (ni por código ni por vínculo), con su mejor precio de
 * proveedor y la categoría/unidad sugeridas. Mínimo 2 caracteres, 30 filas.
 */
export const buscarCatalogoGeneral = async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) return res.json([]);
  try {
    const filas = (await sequelize.query(
      `SELECT cp.id, cp.codigo, cp.nombre
       FROM public.catalogo_productos cp
       WHERE cp.activo
         AND (cp.codigo ILIKE :patron OR cp.nombre ILIKE :patron)
         AND NOT EXISTS (
           SELECT 1 FROM cotizador.producto p
           WHERE p.catalogo_producto_id = cp.id OR UPPER(p.codigo) = UPPER(cp.codigo))
       ORDER BY (UPPER(cp.codigo) = UPPER(:q)) DESC, cp.nombre ASC
       LIMIT 30`,
      { type: QueryTypes.SELECT, replacements: { patron: `%${q}%`, q } }
    )) as Fila[];

    const proveedores = await mejoresProveedores(filas.map((f) => Number(f.id)));
    res.json(
      filas.map((f) => {
        const p = proveedores.get(Number(f.id)) ?? null;
        return {
          id: Number(f.id),
          codigo: f.codigo,
          nombre: f.nombre,
          proveedor: p
            ? {
                nombre: p.proveedor,
                unidadCompra: p.unidad_compra,
                precio: Number(p.precio_actual),
                costoNormalizado: round2(Number(p.costo_normalizado)),
                fecha: p.fecha_precio_actual,
              }
            : null,
          sugerido: sugerir(p?.unidad_compra ?? null),
        };
      })
    );
  } catch (e) {
    console.error('buscarCatalogoGeneral:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo buscar en el catálogo general.' });
  }
};

const importarSchema = z
  .object({
    catalogoProductoId: z.number().int().positive(),
    categoria: z.enum(CATEGORIAS_COTIZADOR, { message: 'Elige la categoría: vidrio, accesorio, perfilería o acabado.' }),
    unidad: z.enum(UNIDADES_COTIZADOR, { message: 'Elige cómo se cobra: por m², por metro o por unidad.' }),
    /** Sólo si el producto no tiene precio de proveedor. */
    costoManual: z.number().positive('El costo debe ser mayor a 0.').optional(),
  })
  .strict();

/**
 * POST /catalogo-general/importar — da de alta el producto en el Cotizador,
 * vinculado. El precio sale del proveedor (costo × multiplicador de la
 * categoría) vía la misma sincronización que usa Proveedores; si no hay
 * proveedor con precio, hace falta `costoManual`, y cuando Proveedores registre
 * uno, lo reemplazará solo.
 */
export const importarDesdeCatalogoGeneral = async (req: Request, res: Response) => {
  let datos: z.infer<typeof importarSchema>;
  try {
    datos = importarSchema.parse(req.body ?? {});
  } catch (e) {
    const issue = e instanceof z.ZodError ? e.issues[0] : null;
    return res.status(400).json({ error: issue?.message ?? 'Datos inválidos.' });
  }

  try {
    const cp = (await CatalogoProducto.findByPk(datos.catalogoProductoId)) as Fila | null;
    if (!cp) return res.status(404).json({ error: 'Ese producto no existe en el catálogo general.' });
    if (!cp.activo) return res.status(409).json({ error: 'Ese producto está inactivo en el catálogo general.' });

    const codigo = String(cp.codigo).trim().toUpperCase();
    if (codigo.length > 20) {
      return res.status(400).json({
        error: `El código ${codigo} tiene más de 20 caracteres y el catálogo del Cotizador no lo admite.`,
      });
    }
    const yaEsta = (await CotizadorProducto.findOne({
      where: { [Op.or]: [{ codigo }, { catalogo_producto_id: cp.id }] },
    })) as Fila | null;
    if (yaEsta) {
      return res.status(409).json({ error: `Ese producto ya está en el Cotizador como ${yaEsta.codigo}.` });
    }

    const multiplicador = (await CotizadorMultiplicadorCategoria.findByPk(datos.categoria)) as Fila | null;
    if (!multiplicador) {
      return res.status(409).json({
        error: `La categoría ${datos.categoria} no tiene multiplicador configurado: configúralo en Cotizador → Configuración.`,
      });
    }

    const proveedor = (await mejoresProveedores([Number(cp.id)])).get(Number(cp.id)) ?? null;
    if (!proveedor && !datos.costoManual) {
      return res.status(400).json({
        error: 'Este producto no tiene precio de ningún proveedor activo. Escribe un costo para darlo de alta.',
      });
    }

    const advertencias: string[] = [];
    const clase = claseDeUnidad(datos.unidad);
    const claseProv = claseCompra(proveedor?.unidad_compra ?? null);
    if (proveedor && claseProv && claseProv !== clase) {
      advertencias.push(
        `El proveedor lo vende por ${proveedor.unidad_compra} y lo estás dando de alta como ${datos.unidad}: ` +
          'revisa que el costo por unidad tenga sentido.'
      );
    }

    // Con proveedor, el costo lo pone la sincronización; sin él, el manual.
    const costo = proveedor ? 0 : Number(datos.costoManual);
    const ahora = new Date();
    const por = await actorDesdeRequest(req);
    const nuevo: Fila = {
      codigo,
      descripcion: String(cp.nombre ?? codigo).slice(0, 120),
      categoria: datos.categoria,
      unidad: datos.unidad,
      costo_unitario: round2(costo),
      precio_pa: round2(costo * Number(multiplicador.multiplicador_pa)),
      precio_pm: round2(costo * Number(multiplicador.multiplicador_pm)),
      precio_pb: round2(costo * Number(multiplicador.multiplicador_pb)),
      origen: 'ALTA',
      provisional: false,
      fuente: 'catálogo general',
      catalogo_producto_id: cp.id,
      creado_en: ahora,
      creado_por: por,
    };

    const t = await sequelize.transaction();
    try {
      await CotizadorProducto.create(nuevo, { transaction: t });
      await CotizadorPrecioHistorial.create(
        {
          fecha: ahora,
          accion: 'dar-de-alta',
          codigo,
          antes: null,
          despues: {
            precio_pa: nuevo.precio_pa, precio_pm: nuevo.precio_pm, precio_pb: nuevo.precio_pb,
            costo_unitario: nuevo.costo_unitario, activo: true,
          },
          por,
          motivo: `Traído del catálogo general (id ${cp.id})${proveedor ? '' : ' con costo manual'}.`,
        } as Fila,
        { transaction: t }
      );
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }

    if (proveedor) {
      const r = await recalcularCostoDesdeProveedor(Number(cp.id));
      for (const o of r?.omitidos ?? []) advertencias.push(`No se pudo tomar el precio del proveedor: ${o.motivo}.`);
    }
    await recargarPrecios();

    res.status(201).json({ producto: getProducto(codigo), advertencias });
  } catch (e) {
    console.error('importarDesdeCatalogoGeneral:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo traer el producto al Cotizador.' });
  }
};
