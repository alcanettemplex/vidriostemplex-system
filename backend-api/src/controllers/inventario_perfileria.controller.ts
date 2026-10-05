import { Request, Response } from 'express';
import { Op, Transaction } from 'sequelize';
import { z } from 'zod';
import sequelize from '../config/database';
import { InventarioPerfileria, CatalogoProducto } from '../models';
import { hoyBogotaISO } from '../utils/fechas';

export const getInventario = async (req: Request, res: Response) => {
  try {
    const { codigo, ubicacion, search, page = '1', limit = '100' } = req.query as Record<string, string>;
    const where: any = {};
    const include: any[] = [];

    if (codigo) where.codigo = codigo;
    if (ubicacion) where.ubicacion = ubicacion;
    if (search) {
      const conditions: any[] = [
        { codigo: { [Op.iLike]: `%${search}%` } },
        { ubicacion: { [Op.iLike]: `%${search}%` } },
        // La descripción no vive en esta tabla: es catalogo_productos.nombre, cruzado
        // por `codigo`. Se busca contra el catálogo para que el filtro cubra TODO el
        // inventario y no solo la página cargada (la lista está paginada server-side).
        { '$catalogo.nombre$': { [Op.iLike]: `%${search}%` } },
      ];
      const searchNum = parseInt(search, 10);
      if (!isNaN(searchNum)) conditions.push({ consecutivo: searchNum });
      where[Op.or as any] = conditions;

      // JOIN solo cuando hay búsqueda: la carga normal del módulo queda idéntica.
      // attributes: [] → el JOIN filtra pero no trae columnas, así que la respuesta
      // no cambia y el egress se mantiene igual (el frontend ya resuelve la
      // descripción con su caché de catálogo).
      // required: false → LEFT JOIN, para que las piezas con código fuera del
      // catálogo sigan apareciendo al buscar por código o ubicación.
      include.push({ model: CatalogoProducto, as: 'catalogo', attributes: [], required: false });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await InventarioPerfileria.findAndCountAll({
      where,
      include,
      // Necesario para que `$catalogo.nombre$` sea resoluble junto con LIMIT/OFFSET:
      // sin esto Sequelize envuelve en una subconsulta donde el JOIN no es visible
      // desde el WHERE y Postgres responde "missing FROM-clause entry".
      // El conteo no se infla: la asociación es belongsTo y catalogo_productos.codigo
      // es UNIQUE, así que cada pieza cruza con un producto como máximo.
      subQuery: false,
      order: [['consecutivo', 'ASC']],
      limit: parseInt(limit),
      offset,
    });

    const ultimaEntrada = await InventarioPerfileria.max('creado_en');
    res.json({ total: count, items: rows, ultima_entrada: ultimaEntrada });
  } catch (e) {
    res.status(500).json({ error: 'Error al obtener inventario' });
  }
};

export const getInventarioStats = async (_req: Request, res: Response) => {
  try {
    const items = await InventarioPerfileria.findAll({
      attributes: ['codigo', 'ubicacion', 'mm'],
    });

    const stats: Record<string, { total_piezas: number; total_mm: number; ubicaciones: Set<string> }> = {};

    for (const item of items as any[]) {
      const cod = item.codigo || 'SIN CODIGO';
      if (!stats[cod]) stats[cod] = { total_piezas: 0, total_mm: 0, ubicaciones: new Set() };
      stats[cod].total_piezas += 1;
      stats[cod].total_mm += parseFloat(item.mm) || 0;
      if (item.ubicacion) stats[cod].ubicaciones.add(item.ubicacion);
    }

    const result = Object.entries(stats).map(([codigo, s]) => ({
      codigo,
      total_piezas: s.total_piezas,
      total_mm: Math.round(s.total_mm),
      ubicaciones: Array.from(s.ubicaciones).join(', '),
    })).sort((a, b) => a.codigo.localeCompare(b.codigo));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
};

export const updateInventarioItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { ubicacion, mm, codigo } = req.body;

    const item = await InventarioPerfileria.findByPk(id);
    if (!item) return res.status(404).json({ error: 'Perfil no encontrado' });

    const updates: any = {};
    if (ubicacion !== undefined) updates.ubicacion = ubicacion;
    if (mm !== undefined) updates.mm = mm;
    // Sin validación contra catálogo: existen códigos legítimos fuera de él (JAM0201, SIL0204...)
    if (codigo !== undefined) updates.codigo = String(codigo).trim().toUpperCase() || null;

    await item.update(updates);
    res.json(item);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
};

export const bulkInsertPerfileria = async (req: Request, res: Response) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'Se requiere al menos un ítem' });

    const maxConsecutivo = ((await InventarioPerfileria.max('consecutivo')) as number) || 0;
    const hoy = hoyBogotaISO();

    const toInsert = items.map((item: any, idx: number) => ({
      consecutivo: maxConsecutivo + idx + 1,
      codigo: item.codigo || null,
      mm: parseFloat(item.mm) || 0,
      ubicacion: item.ubicacion || null,
      fecha_corte: hoy,
    }));

    const created = await InventarioPerfileria.bulkCreate(toInsert);
    res.status(201).json({ insertados: created.length, items: created });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Error al insertar perfilería' });
  }
};

// ─── Ingreso con consecutivo asignado por el usuario (2026-10-03) ──────────────
//
// El ingreso normal (`bulkInsertPerfileria`) numera solo con MAX + 1. Este permite que el
// usuario ponga el número (el de la etiqueta física de la pieza). Decisiones del usuario:
//   - Un número ocupado NO bloquea el lote: se guardan las filas válidas y las demás
//     vuelven con su motivo para corregirlas.
//   - Los consecutivos que Compras consumió (borrados del inventario, con snapshot en
//     `sap_items.existencia_piezas`) quedan LIBRES. Si se reutilizan y Compras revierte,
//     la reversión responde 409 gracias al índice único (script 2026-10-03).
// La BD es la última barrera: índice único `inventario_perfileria_consecutivo_key`.

const consecutivosSchema = z.object({
  consecutivos: z.array(z.number().int().positive()).max(500),
}).strict();

const itemManualSchema = z.object({
  consecutivo: z.number().int().positive(),
  codigo: z.string().trim().min(1).max(100),
  mm: z.number().positive(),
  ubicacion: z.string().trim().max(255).nullable().optional(),
}).strict();

const bulkManualSchema = z.object({
  items: z.array(itemManualSchema).min(1).max(500),
}).strict();

interface PiezaOcupada { consecutivo: number; codigo: string | null; ubicacion: string | null }

const buscarOcupados = async (consecutivos: number[], transaction?: Transaction): Promise<PiezaOcupada[]> => {
  const filas = await InventarioPerfileria.findAll({
    where: { consecutivo: { [Op.in]: consecutivos } },
    attributes: ['consecutivo', 'codigo', 'ubicacion'],
    transaction,
  });
  return filas.map(f => ({
    consecutivo: f.getDataValue('consecutivo'),
    codigo: f.getDataValue('codigo'),
    ubicacion: f.getDataValue('ubicacion'),
  }));
};

const describirPieza = (p: PiezaOcupada) =>
  `Ya existe: ${p.codigo || 'sin código'}${p.ubicacion ? ` en ${p.ubicacion}` : ''}`;

/** POST /verificar-consecutivos — qué números de la lista ya están en el inventario. */
export const verificarConsecutivos = async (req: Request, res: Response) => {
  const parsed = consecutivosSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Los consecutivos deben ser números enteros mayores que cero.' });
  try {
    const lista = [...new Set(parsed.data.consecutivos)];
    const ocupados = lista.length > 0 ? await buscarOcupados(lista) : [];
    const ultimo = ((await InventarioPerfileria.max('consecutivo')) as number) || 0;
    res.json({ ocupados: ocupados.map(p => ({ ...p, motivo: describirPieza(p) })), ultimo_consecutivo: ultimo });
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron verificar los consecutivos. Intenta de nuevo.' });
  }
};

/** POST /bulk-manual — ingresa el lote con los consecutivos dados; guarda las filas válidas. */
export const bulkInsertManual = async (req: Request, res: Response) => {
  const parsed = bulkManualSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Revisa el lote: cada fila necesita consecutivo (entero mayor que 0), código y longitud mayor que 0.' });
  }
  const { items } = parsed.data;
  const hoy = hoyBogotaISO();

  const rechazados: { consecutivo: number; motivo: string }[] = [];
  const vistos = new Set<number>();
  const candidatos = items.filter(it => {
    if (vistos.has(it.consecutivo)) {
      rechazados.push({ consecutivo: it.consecutivo, motivo: 'Repetido dentro del lote' });
      return false;
    }
    vistos.add(it.consecutivo);
    return true;
  });

  const t = await sequelize.transaction();
  try {
    const ocupados = new Map((await buscarOcupados(candidatos.map(c => c.consecutivo), t)).map(p => [p.consecutivo, p]));
    const aInsertar = candidatos.filter(c => {
      const p = ocupados.get(c.consecutivo);
      if (p) rechazados.push({ consecutivo: c.consecutivo, motivo: describirPieza(p) });
      return !p;
    });

    // Uno por uno, con savepoint: si otro usuario tomó el número entre la verificación y
    // el INSERT, el índice único rechaza solo esa fila y el resto del lote sigue.
    // `create` individual además dispara el hook de auditoría por pieza.
    const creados: unknown[] = [];
    for (const it of aInsertar) {
      try {
        const nuevo = await sequelize.transaction({ transaction: t }, (sp) => InventarioPerfileria.create({
          consecutivo: it.consecutivo,
          codigo: it.codigo.toUpperCase(),
          mm: it.mm,
          ubicacion: it.ubicacion || null,
          fecha_corte: hoy,
        }, { transaction: sp }));
        creados.push(nuevo);
      } catch (e: unknown) {
        if ((e as { name?: string })?.name !== 'SequelizeUniqueConstraintError') throw e;
        rechazados.push({ consecutivo: it.consecutivo, motivo: 'Lo acaba de tomar otro ingreso' });
      }
    }

    await t.commit();
    rechazados.sort((a, b) => a.consecutivo - b.consecutivo);
    res.status(201).json({ insertados: creados.length, items: creados, rechazados });
  } catch (e) {
    await t.rollback();
    res.status(500).json({ error: 'No se pudo guardar el lote. No se guardó ninguna pieza; intenta de nuevo.' });
  }
};

export const exportInventario = async (_req: Request, res: Response) => {
  try {
    const items = await InventarioPerfileria.findAll({
      attributes: ['consecutivo', 'codigo', 'mm', 'ubicacion'],
      order: [['consecutivo', 'ASC']],
      include: [{
        model: CatalogoProducto,
        as: 'catalogo',
        attributes: ['nombre'],
        required: false,
      }],
    });

    const rows = (items as any[]).map(item => ({
      consecutivo: item.consecutivo,
      codigo: item.codigo || '',
      descripcion: item.catalogo?.nombre || '',
      mm: parseFloat(item.mm) || 0,
      ubicacion: item.ubicacion || '',
    }));

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Error al exportar inventario' });
  }
};

export const deleteInventarioItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const item = await InventarioPerfileria.findByPk(id);
    if (!item) return res.status(404).json({ error: 'Perfil no encontrado' });
    await item.destroy();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Error al eliminar perfil' });
  }
};
