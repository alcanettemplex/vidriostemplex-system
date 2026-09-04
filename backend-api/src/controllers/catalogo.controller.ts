import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { CatalogoProducto, ProductoAlias } from '../models';
import { z } from 'zod';

const catalogoSchema = z.object({
  categoria: z.string().min(1),
  nombre: z.string().min(1),
  descripcion: z.string().optional(),
  activo: z.boolean().optional().default(true),
  // `codigo` es NOT NULL UNIQUE en la tabla: sin él ninguna creación llegaba a
  // insertarse. Se acepta desde el cliente y, si no viene, se genera uno libre.
  codigo: z.string().trim().max(50).optional(),
  es_aluminio: z.boolean().optional(),
  unidad_medida: z.string().trim().max(30).optional().nullable(),
  porcentaje_iva: z.coerce.number().min(0).max(100).optional(),
});

/** Genera un código correlativo libre con prefijo PROD- para productos sin código propio */
async function generarCodigoLibre(): Promise<string> {
  const ultimo = await CatalogoProducto.findOne({
    where: { codigo: { [Op.iLike]: 'PROD-%' } },
    order: [['codigo', 'DESC']],
    attributes: ['codigo'],
  });
  const actual = ultimo ? parseInt(String(ultimo.getDataValue('codigo')).replace(/\D/g, ''), 10) : 0;
  return `PROD-${String((Number.isFinite(actual) ? actual : 0) + 1).padStart(4, '0')}`;
}

export const getCatalogo = async (req: Request, res: Response) => {
  try {
    const where: any = { activo: true };
    if (req.query.es_aluminio === 'true') where.es_aluminio = true;

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    if (q) {
      const palabras = q.split(/\s+/).filter(Boolean);
      const condiciones = palabras.map((p) => ({
        [Op.or]: [
          { codigo: { [Op.iLike]: `%${p}%` } },
          { nombre: { [Op.iLike]: `%${p}%` } },
          { descripcion: { [Op.iLike]: `%${p}%` } },
        ],
      }));

      where[Op.and] = condiciones;

      const limite = req.query.limit ? parseInt(String(req.query.limit)) : 50;

      const items = await CatalogoProducto.findAll({
        where,
        order: [
          ['codigo', 'ASC'],
          ['nombre', 'ASC'],
        ],
        limit: limite,
      });

      const resultado: any[] = items.map((i) => i.toJSON());

      /**
       * Segunda pasada por el diccionario de sinónimos (`producto_alias`).
       *
       * Es lo que cierra el mecanismo descrito en `compras.md §3.4`: al mapear
       * "CIERRAPUERTAS HIDRAULICO" de un proveedor, esa descripción queda como alias
       * del producto interno; cuando otro proveedor factura "CIERRA PUERTA 100KG",
       * el buscador debe reconocerlo aunque no comparta ni código ni nombre con el
       * catálogo. Sin esta consulta los alias se acumulaban sin que nada los leyera,
       * y el segundo proveedor costaba lo mismo que el primero.
       *
       * Va como complemento, nunca como reemplazo: los aciertos por código o nombre
       * conservan su orden y encabezan la lista; los que llegan por sinónimo se
       * anexan al final marcados, para que el humano vea por qué se le proponen.
       */
      if (resultado.length < limite) {
        const condicionesAlias = palabras.map((p) => ({ alias: { [Op.iLike]: `%${p}%` } }));
        const coincidencias = await ProductoAlias.findAll({
          where: { [Op.and]: condicionesAlias },
          attributes: ['catalogo_producto_id', 'alias'],
          limit: limite * 2,
        });

        const yaListados = new Set(resultado.map((i) => i.id));
        const aliasPorProducto = new Map<number, string>();
        for (const a of coincidencias) {
          const idProd = Number(a.getDataValue('catalogo_producto_id'));
          if (!yaListados.has(idProd) && !aliasPorProducto.has(idProd)) {
            aliasPorProducto.set(idProd, String(a.getDataValue('alias')));
          }
        }

        if (aliasPorProducto.size > 0) {
          // Where propio: el de arriba lleva las condiciones de texto, que aquí
          // estorban — el filtro ya lo hizo el alias.
          const whereAlias: any = { activo: true, id: { [Op.in]: Array.from(aliasPorProducto.keys()) } };
          if (req.query.es_aluminio === 'true') whereAlias.es_aluminio = true;

          const porAlias = await CatalogoProducto.findAll({
            where: whereAlias,
            order: [['codigo', 'ASC']],
            limit: limite - resultado.length,
          });

          for (const p of porAlias) {
            resultado.push({
              ...p.toJSON(),
              coincide_por_alias: aliasPorProducto.get(Number(p.getDataValue('id'))) ?? null,
            });
          }
        }
      }

      return res.json(resultado);
    }

    const items = await CatalogoProducto.findAll({
      where,
      order: [['categoria', 'ASC'], ['nombre', 'ASC']],
    });
    res.json(items);
  } catch (e: any) {
    res.status(500).json({ error: 'Error al obtener catálogo', detalle: e.message });
  }
};

export const getCatalogoAll = async (_req: Request, res: Response) => {
  try {
    const items = await CatalogoProducto.findAll({
      order: [['categoria', 'ASC'], ['nombre', 'ASC']],
    });
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: 'Error al obtener catálogo' });
  }
};

export const createCatalogo = async (req: Request, res: Response) => {
  try {
    const data = catalogoSchema.parse(req.body);
    const codigo = data.codigo?.toUpperCase() || (await generarCodigoLibre());

    const duplicado = await CatalogoProducto.findOne({ where: { codigo }, attributes: ['id', 'nombre'] });
    if (duplicado) {
      return res.status(409).json({
        error: `El código ${codigo} ya está en uso por "${duplicado.getDataValue('nombre')}". Usa otro código.`,
      });
    }

    const item = await CatalogoProducto.create({ ...data, codigo } as any);
    res.status(201).json(item);
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      const primero = e.issues[0];
      return res.status(400).json({
        error: `Revisa el campo "${primero?.path?.join('.') || 'dato'}": ${primero?.message ?? 'valor inválido'}.`,
      });
    }
    console.error('[catalogo] createCatalogo:', e?.message ?? e);
    res.status(500).json({ error: 'No se pudo crear el producto. Vuelve a intentarlo.' });
  }
};

export const updateCatalogo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = catalogoSchema.partial().parse(req.body);
    const item = await CatalogoProducto.findByPk(id);
    if (!item) return res.status(404).json({ error: 'No encontrado' });
    await item.update(data);
    res.json(item);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
};

export const deleteCatalogo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const item = await CatalogoProducto.findByPk(id);
    if (!item) return res.status(404).json({ error: 'No encontrado' });
    await item.update({ activo: false });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Error al eliminar' });
  }
};
