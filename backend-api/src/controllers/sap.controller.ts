import { Request, Response } from 'express';
import { z } from 'zod';
import { SAP, SAPItem, ODP, Usuario, CatalogoProducto, ODCItem, CotizadorCotizacion, CotizadorProducto, NotaProduccion } from '../models';
import { sapTieneAluminio } from '../utils/sapAluminio';
import sequelize from '../config/database';
import { Op, Transaction } from 'sequelize';
import { withUniqueRetry } from '../utils/withUniqueRetry';
import { recalcularChecksODP } from '../utils/checksAutomaticos';
import * as cotizacionStore from '../cotizador/store/cotizacionStore';
import {
  itemsParaSap,
  indiceDeLetra,
  type EquivalenciaCatalogo,
  type FilaSap,
  type ItemCotizacionParaSap,
} from '../cotizador/lib/itemsParaSap';

// Recalcular tiene_aluminio en ODP según todos sus SAP items
const recalcularAluminioODP = async (odp_id: number): Promise<void> => {
  const saps = await SAP.findAll({
    where: { odp_id },
    include: [{ model: SAPItem, as: 'items', attributes: ['codigo'] }],
  });
  const codigos = saps.flatMap((s: any) => s.items.map((i: any) => i.codigo));
  await ODP.update({ tiene_aluminio: await sapTieneAluminio(codigos) }, { where: { id: odp_id } });
};

// Generar número SAP consecutivo
const generarNumeroSAP = async (): Promise<string> => {
  const last = await SAP.findOne({
    where: { numero_sap: { [Op.like]: 'SAP-%' } },
    order: [['numero_sap', 'DESC']],
    attributes: ['numero_sap'],
  });
  let next = 1;
  if (last) {
    const parts = last.getDataValue('numero_sap').split('-');
    next = parseInt(parts[parts.length - 1]) + 1;
  }
  return `SAP-${String(next).padStart(4, '0')}`;
};

export const getSAPsByODP = async (req: Request, res: Response) => {
  try {
    const { odp_id } = req.params;
    const saps = await SAP.findAll({
      where: { odp_id },
      include: [
        { model: SAPItem, as: 'items' },
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
      ],
      order: [['fecha_creacion', 'DESC']],
    });
    res.json(saps);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener SAPs' });
  }
};

export const createSAP = async (req: Request, res: Response) => {
  try {
    const { odp_id, notas, items } = req.body;
    const userId = req.user?.id;

    const odp = await ODP.findByPk(odp_id);
    if (!odp) return res.status(404).json({ error: 'ODP no encontrada' });

    const sap = await withUniqueRetry(async () => {
      const t = await sequelize.transaction();
      try {
        const numero_sap = await generarNumeroSAP();

        const newSap = await SAP.create({
          numero_sap, odp_id, creado_por: userId, notas, estado: 'borrador',
        }, { transaction: t });

        if (items && Array.isArray(items) && items.length > 0) {
          const sapItems = items.map((item: any) => ({ ...item, sap_id: newSap.getDataValue('id') }));
          await SAPItem.bulkCreate(sapItems, { transaction: t });
        }

        await t.commit();
        return newSap;
      } catch (err) {
        await t.rollback();
        throw err;
      }
    });

    await recalcularAluminioODP(odp_id);

    // Una SAP nueva mete líneas sin cubrir en la ODP: si el check de Herrajes estaba
    // marcado, deja de ser cierto. Una SAP creada sin ítems también bloquea, por
    // diseño: todavía no se sabe qué material hace falta.
    await recalcularChecksODP(odp_id, {
      usuarioId: userId ?? null,
      origen: 'SAP',
      detalle: `SAP ${sap.getDataValue('numero_sap')} creada`,
      herrajes: true,
    });

    const sapWithItems = await SAP.findByPk(sap.getDataValue('id'), {
      include: [{ model: SAPItem, as: 'items' }, { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] }],
    });

    import('../server').then(({ emitirCambio }) => emitirCambio('odp')).catch(() => {});
    res.status(201).json(sapWithItems);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al crear SAP', detail: error.message });
  }
};

export const updateSAP = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { notas, estado, items } = req.body;

    const sap = await SAP.findByPk(id, { transaction: t });
    if (!sap) { await t.rollback(); return res.status(404).json({ error: 'SAP no encontrada' }); }

    await sap.update({ notas, estado }, { transaction: t });

    if (items && Array.isArray(items)) {
      // Cargar items existentes con sus ODCItems para detectar cuáles ya están en una ODC
      const existingItems = await SAPItem.findAll({
        where: { sap_id: id },
        include: [{ model: ODCItem, as: 'odc_items', attributes: ['id'] }],
        transaction: t,
      });

      const existingMap = new Map<number, any>(
        existingItems.map((ei: any) => [ei.getDataValue('id'), ei])
      );
      const incomingIds = new Set<number>(
        items.filter((i: any) => i.id).map((i: any) => Number(i.id))
      );

      // Letra previa de cada ítem: al final del procesamiento se comparan con las nuevas
      // para propagar el re-letrado a los faltantes vinculados (existencia_piezas.faltante_id)
      const letrasAnteriores = new Map<number, string>(
        existingItems.map((ei: any) => [ei.getDataValue('id'), ei.getDataValue('item')])
      );

      // Procesar cada ítem entrante
      for (const item of items) {
        const itemId = item.id ? Number(item.id) : null;

        if (itemId && existingMap.has(itemId)) {
          const existing = existingMap.get(itemId);

          // Los ítems faltantes se gestionan desde Compras (dividir/revertir) y su letra
          // la dicta la herencia del original: se ignoran ediciones llegadas del formulario SAP
          if (existing.getDataValue('es_faltante')) continue;

          const tieneODC = Array.isArray(existing.odc_items) && existing.odc_items.length > 0;

          if (tieneODC) {
            // Ítem ya en ODC: guardar snapshot y marcar como modificado si hubo cambio real
            const datosAnteriores = {
              codigo: existing.getDataValue('codigo'),
              descripcion: existing.getDataValue('descripcion'),
              dimension: existing.getDataValue('dimension'),
              cantidad: existing.getDataValue('cantidad'),
              und: existing.getDataValue('und'),
              observacion: existing.getDataValue('observacion'),
            };
            const hubo_cambio =
              datosAnteriores.codigo !== item.codigo ||
              datosAnteriores.descripcion !== item.descripcion ||
              datosAnteriores.dimension !== item.dimension ||
              String(datosAnteriores.cantidad) !== String(item.cantidad) ||
              datosAnteriores.und !== item.und ||
              datosAnteriores.observacion !== item.observacion;

            await existing.update({
              codigo: item.codigo,
              descripcion: item.descripcion,
              dimension: item.dimension,
              cantidad: item.cantidad,
              und: item.und,
              observacion: item.observacion,
              exist_perf: item.exist_perf,
              // estado_compra se preserva: sigue 'en_odc'
              modificado: hubo_cambio ? true : existing.getDataValue('modificado'),
              datos_anteriores: hubo_cambio
                ? datosAnteriores
                : existing.getDataValue('datos_anteriores'),
            }, { transaction: t });
          } else {
            // Ítem no vinculado a ODC: actualizar normalmente y limpiar flags
            // (es_faltante/existencia_piezas nunca se pisan desde el formulario)
            const { es_faltante: _ef, existencia_piezas: _ep, ...datosEditables } = item;
            await existing.update({
              ...datosEditables,
              sap_id: Number(id),
              modificado: false,
              datos_anteriores: null,
            }, { transaction: t });
          }
        } else {
          // Ítem nuevo: crear
          const { id: _ignore, es_faltante: _ef, existencia_piezas: _ep, ...itemSinId } = item;
          await SAPItem.create({
            ...itemSinId,
            sap_id: Number(id),
            modificado: false,
            datos_anteriores: null,
          }, { transaction: t });
        }
      }

      // Eliminar items que el asesor quitó del formulario (solo si no tienen ODC activa)
      for (const [existingId, existing] of existingMap) {
        if (!incomingIds.has(existingId)) {
          const tieneODC = Array.isArray(existing.odc_items) && existing.odc_items.length > 0;
          const esFaltante = existing.getDataValue('es_faltante') === true;
          if (!tieneODC && !esFaltante) {
            await existing.destroy({ transaction: t });
          }
          // Si tiene ODC activa o es un faltante (gestionado por Compras): se deja intacto
        }
      }

      // Herencia de re-letrado: si la letra de un original cambió, sus faltantes vinculados
      // (existencia_piezas.faltante_id) heredan la nueva letra en cascada, para que el par
      // siga compartiendo letra y fusionándose en el imprimible de la SAP.
      const visitados = new Set<number>();
      for (const [existingId, existing] of existingMap) {
        if (existing.getDataValue('es_faltante')) continue;
        const letraNueva = existing.getDataValue('item');
        if (letrasAnteriores.get(existingId) === letraNueva) continue;
        let faltanteId: number | null = existing.getDataValue('existencia_piezas')?.faltante_id ?? null;
        while (faltanteId && !visitados.has(faltanteId)) {
          visitados.add(faltanteId);
          const faltante = await SAPItem.findOne({ where: { id: faltanteId, sap_id: Number(id) }, transaction: t });
          if (!faltante) break;
          await faltante.update({ item: letraNueva }, { transaction: t });
          faltanteId = faltante.getDataValue('existencia_piezas')?.faltante_id ?? null;
        }
      }
    }

    await t.commit();

    const odp_id = sap.getDataValue('odp_id');
    await recalcularAluminioODP(odp_id);

    // Agregar una línea nueva a la SAP la deja en 'pendiente' y quita la cobertura
    // completa; quitar la última línea sin cubrir la restituye. El motor decide.
    await recalcularChecksODP(odp_id, {
      usuarioId: req.user?.id ?? null,
      origen: 'SAP',
      detalle: `SAP ${sap.getDataValue('numero_sap')} editada`,
      herrajes: true,
    });

    const updated = await SAP.findByPk(id, {
      include: [{ model: SAPItem, as: 'items' }, { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] }],
    });

    res.json(updated);
  } catch (error: any) {
    await t.rollback();
    res.status(500).json({ error: 'Error al actualizar SAP', detail: error.message });
  }
};

export const deleteSAP = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const sap = await SAP.findByPk(id);
    if (!sap) return res.status(404).json({ error: 'SAP no encontrada' });
    const odpId = sap.getDataValue('odp_id');
    await SAPItem.destroy({ where: { sap_id: id } });
    await sap.destroy();

    // Al desaparecer la SAP, Herrajes puede pasar a "no aplica" (si era la única) o
    // quedar completo (si la que se borró era la que tenía líneas sin cubrir).
    await recalcularChecksODP(odpId, {
      usuarioId: req.user?.id ?? null,
      origen: 'SAP',
      detalle: `SAP ${sap.getDataValue('numero_sap')} eliminada`,
      herrajes: true,
    });

    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Error al eliminar SAP', detail: error.message });
  }
};

// ─── Pase a corte de aluminio (2026-10-05) ───────────────────────────────────
//
// Nota del taller por SAP: "la perfilería de esta SAP ya pasó al corte". Se marca
// desde el panel del Control de Taller y deja su nota en la bitácora en la misma
// transacción. NO toca `chk_corte` ("aluminio cortado") ni el motor de checks:
// el usuario lo pidió como nota, no como etapa. Sin condiciones de material ni de
// estado de la SAP; basta con que tenga aluminio.

const paramsPaseCorte = z.object({ id: z.coerce.number().int().positive() }).strict();

/** Carga la SAP con sus códigos y verifica que lleve aluminio. Devuelve un error legible si no. */
const cargarSapParaCorte = async (id: number, t: Transaction) => {
  // El bloqueo va sin includes: FOR UPDATE sobre un LEFT JOIN de hasMany falla en Postgres.
  // Serializa dos clics simultáneos sobre la misma SAP (el segundo ve la marca y recibe 409).
  const sap = await SAP.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
  if (!sap) return { error: { status: 404, mensaje: 'La SAP ya no existe. Recarga el tablero.' } } as const;
  const items = await SAPItem.findAll({ where: { sap_id: id }, attributes: ['codigo'], transaction: t });
  const codigos = items.map((i) => i.getDataValue('codigo') as string | null);
  if (!(await sapTieneAluminio(codigos, t))) {
    return {
      error: {
        status: 409,
        mensaje: `La ${sap.getDataValue('numero_sap')} no tiene perfilería de aluminio: no hay nada que pasar a corte.`,
      },
    } as const;
  }
  return { sap } as const;
};

const responderPaseCorte = async (sap: SAP) => {
  const fresca = await SAP.findByPk(sap.getDataValue('id'), {
    attributes: ['id', 'numero_sap', 'odp_id', 'fecha_pase_corte', 'pase_corte_por_id'],
    include: [{ model: Usuario, as: 'pase_corte_por', attributes: ['id', 'nombre_completo'] }],
  });
  const odpId = Number(sap.getDataValue('odp_id'));
  // El tablero pinta la celda Aluminio con `saps[].fecha_pase_corte`: se reparte a todos.
  import('../utils/notificaciones').then(({ emitirODPPatch }) => emitirODPPatch(odpId, 'update')).catch(() => {});
  return fresca;
};

export const marcarPaseCorte = async (req: Request, res: Response) => {
  const params = paramsPaseCorte.safeParse(req.params);
  if (!params.success) return res.status(400).json({ error: 'SAP inválida.' });
  const usuarioId = req.user!.id;

  const t = await sequelize.transaction();
  try {
    const cargada = await cargarSapParaCorte(params.data.id, t);
    if ('error' in cargada) {
      await t.rollback();
      return res.status(cargada.error!.status).json({ error: cargada.error!.mensaje });
    }
    const { sap } = cargada;
    const numero = sap.getDataValue('numero_sap');

    if (sap.getDataValue('fecha_pase_corte')) {
      const porId = sap.getDataValue('pase_corte_por_id');
      const quien = porId
        ? (await Usuario.findByPk(porId, { attributes: ['nombre_completo'], transaction: t }))?.getDataValue('nombre_completo')
        : null;
      await t.rollback();
      return res.status(409).json({
        error: `La ${numero} ya fue pasada a corte${quien ? ` por ${quien}` : ''}. Recarga el panel para verlo.`,
      });
    }

    await sap.update({ fecha_pase_corte: new Date(), pase_corte_por_id: usuarioId }, { transaction: t });
    const nota = await NotaProduccion.create({
      odp_id: sap.getDataValue('odp_id'),
      usuario_id: usuarioId,
      texto: `${numero} pasada a corte de aluminio.`,
      fecha: new Date(),
    }, { transaction: t });
    await t.commit();

    const notaConUsuario = await NotaProduccion.findByPk(nota.getDataValue('id'), {
      include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombre_completo'] }],
    });
    res.json({ sap: await responderPaseCorte(sap), nota: notaConUsuario });
  } catch (error: any) {
    await t.rollback().catch(() => {});
    console.error('marcarPaseCorte:', error);
    res.status(500).json({ error: 'No se pudo marcar la SAP como pasada a corte. Intenta de nuevo; si persiste, avisa a sistemas.' });
  }
};

export const deshacerPaseCorte = async (req: Request, res: Response) => {
  const params = paramsPaseCorte.safeParse(req.params);
  if (!params.success) return res.status(400).json({ error: 'SAP inválida.' });
  const usuarioId = req.user!.id;

  const t = await sequelize.transaction();
  try {
    // Deshacer no exige que la SAP siga teniendo aluminio: si le quitaron la
    // perfilería después, la marca vieja debe poder limpiarse igual.
    const sap = await SAP.findByPk(params.data.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!sap) {
      await t.rollback();
      return res.status(404).json({ error: 'La SAP ya no existe. Recarga el tablero.' });
    }
    const numero = sap.getDataValue('numero_sap');
    if (!sap.getDataValue('fecha_pase_corte')) {
      await t.rollback();
      return res.status(409).json({ error: `La ${numero} no está marcada como pasada a corte. Recarga el panel.` });
    }

    await sap.update({ fecha_pase_corte: null, pase_corte_por_id: null }, { transaction: t });
    // La bitácora solo se agrega: la nota del pase queda y se deja constancia del deshacer.
    const nota = await NotaProduccion.create({
      odp_id: sap.getDataValue('odp_id'),
      usuario_id: usuarioId,
      texto: `Se deshizo el pase a corte de aluminio de la ${numero}.`,
      fecha: new Date(),
    }, { transaction: t });
    await t.commit();

    const notaConUsuario = await NotaProduccion.findByPk(nota.getDataValue('id'), {
      include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombre_completo'] }],
    });
    res.json({ sap: await responderPaseCorte(sap), nota: notaConUsuario });
  } catch (error: any) {
    await t.rollback().catch(() => {});
    console.error('deshacerPaseCorte:', error);
    res.status(500).json({ error: 'No se pudo deshacer el pase a corte. Intenta de nuevo; si persiste, avisa a sistemas.' });
  }
};

export const buscarCatalogo = async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    if (!q || String(q).length < 2) return res.json([]);
    const term = String(q).toUpperCase();
    const items = await CatalogoProducto.findAll({
      where: {
        [Op.or]: [
          { codigo: { [Op.iLike]: `%${term}%` } },
          { nombre: { [Op.iLike]: `%${q}%` } },
        ],
        activo: true,
      },
      limit: 15,
      order: [['codigo', 'ASC']],
    });
    res.json(items);
  } catch (error: any) {
    res.status(500).json({ error: 'Error en búsqueda' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Traer ítems de la cotización (2026-09-27, integración Cotizador ↔ ERP)
//
// POST /api/documentos/sap/desde-cotizacion
//
// Arma las filas de la SAP desde la propuesta ELEGIDA de la cotización del
// Cotizador APROBADA y vinculada a la ODP (la lógica pura vive en
// `cotizador/lib/itemsParaSap.ts`). `dry_run` (por defecto TRUE) devuelve la
// previsualización sin escribir nada: es lo que abre el diálogo y lo que
// permite probar contra ODP reales sin tocar producción.
//
// Destino:
//   - La ODP no tiene SAP → se crea una en borrador por el MISMO camino que
//     `createSAP` (número con `generarNumeroSAP` + `withUniqueRetry`, estado
//     'borrador', recálculo de aluminio y de Herrajes). No se reutiliza el
//     handler porque escribe su propia respuesta HTTP y no admite transacción
//     externa; crear SAP e ítems en una sola transacción evita dejar una SAP
//     vacía (que además bloquea el check de Herrajes) si falla la inserción.
//   - La ODP tiene SAP → por defecto la más reciente (la que la ficha muestra
//     primero); `sap_id` elige otra, o 'nueva' fuerza una SAP aparte.
//
// Modo (solo si la SAP destino ya tiene ítems):
//   - 'agregar'    → filas nuevas con las letras siguientes a la mayor usada.
//   - 'reemplazar' → borra los ítems de la SAP y trae los de la cotización, SOLO
//     si ninguno está comprometido en el ciclo de compras (ver `motivosCompromiso`).
//
// Doble carga: si algún ítem de esta cotización ya está en una SAP de la ODP
// (`sap_items.origen_cotizacion_id`), se avisa y no se escribe — salvo que el
// modo sea reemplazar sobre la misma SAP que los contiene (los va a borrar).
// ─────────────────────────────────────────────────────────────────────────────

const traerDesdeCotizacionSchema = z
  .object({
    odp_id: z.number().int().positive(),
    cotizacion_id: z.number().int().positive().optional(),
    sap_id: z.union([z.number().int().positive(), z.literal('nueva')]).optional(),
    modo: z.enum(['agregar', 'reemplazar']).optional(),
    dry_run: z.boolean().optional(),
  })
  .strict();

class ErrorTraerSap extends Error {
  constructor(readonly estado: number, mensaje: string, readonly extra: Record<string, unknown> = {}) {
    super(mensaje);
  }
}

/** Ítem de SAP leído con sus `odc_items` (forma plana). */
interface ItemSapExistente {
  id?: number;
  item?: string | null;
  codigo?: string | null;
  estado_compra?: string | null;
  es_faltante?: boolean | null;
  modificado?: boolean | null;
  existencia_piezas?: unknown;
  exist_perf?: string | null;
  origen_cotizacion_id?: number | null;
  odc_items?: unknown[] | null;
}

const planos = (filas: SAPItem[] | undefined | null): ItemSapExistente[] =>
  (filas ?? []).map((f) => f.get({ plain: true }) as ItemSapExistente);

/**
 * Por qué un ítem existente de la SAP no se puede borrar al reemplazar. Mismo
 * criterio que ya usa `updateSAP` para no destruir ítems (ODC activa o
 * faltante), ampliado con todo lo que Compras marca sobre la línea:
 *   - `odc_items` que lo referencian (está pedido en una ODC),
 *   - `estado_compra` distinto de 'pendiente' (en ODC o cubierto por existencia),
 *   - `existencia_piezas` (consumió piezas del inventario de perfilería: borrarlo
 *     perdería el snapshot que permite revertir),
 *   - `es_faltante` (lo generó Compras al dividir una cobertura parcial),
 *   - `modificado` (cambió después de entrar a una ODC: Compras aún no lo concilia),
 *   - `exist_perf` con texto (Compras anotó existencia a mano).
 * El estado de la SAP no cuenta: hoy las 386 SAP están en 'borrador'.
 */
function motivosCompromiso(items: ItemSapExistente[]): string[] {
  const motivos: string[] = [];
  for (const it of items) {
    const razones = new Set<string>();
    if ((Array.isArray(it.odc_items) && it.odc_items.length > 0) || it.estado_compra === 'en_odc') razones.add('está en una orden de compra');
    if (it.estado_compra === 'en_existencia') razones.add('ya se cubrió con existencia');
    if (it.existencia_piezas) razones.add('consumió piezas del inventario');
    if (it.es_faltante) razones.add('es un faltante generado por Compras');
    if (it.modificado) razones.add('tiene cambios pendientes de conciliar en Compras');
    if (it.exist_perf && String(it.exist_perf).trim()) razones.add('Compras anotó existencia');
    if (razones.size > 0) motivos.push(`Ítem ${it.item || '?'} (${it.codigo || 'sin código'}): ${[...razones].join(', ')}`);
  }
  return motivos;
}

/** Código del Cotizador → código y nombre en `catalogo_productos` (el catálogo
 * que usan la SAP y Compras). Primero por el vínculo explícito
 * `cotizador.producto.catalogo_producto_id` (105 productos tienen código propio
 * en el Cotizador, p. ej. PRV700MATE ↔ CAB0103); si no lo hay, por código idéntico. */
async function equivalenciasDeCatalogo(codigos: string[]): Promise<Map<string, EquivalenciaCatalogo>> {
  const mapa = new Map<string, EquivalenciaCatalogo>();
  if (codigos.length === 0) return mapa;
  const productos = await CotizadorProducto.findAll({
    where: { codigo: codigos },
    attributes: ['codigo', 'catalogo_producto_id'],
    include: [{ model: CatalogoProducto, as: 'catalogoProducto', attributes: ['codigo', 'nombre'], required: true }],
  });
  for (const p of productos) {
    const cat = p.get('catalogoProducto') as CatalogoProducto | null;
    const codigo = cat?.getDataValue('codigo') as string | undefined;
    if (cat && codigo) mapa.set(String(p.getDataValue('codigo')), { codigo, descripcion: String(cat.getDataValue('nombre') ?? '') });
  }
  const faltan = codigos.filter((c) => !mapa.has(c));
  if (faltan.length > 0) {
    const directos = await CatalogoProducto.findAll({ where: { codigo: faltan }, attributes: ['codigo', 'nombre'] });
    for (const c of directos) {
      const codigo = String(c.getDataValue('codigo'));
      mapa.set(codigo, { codigo, descripcion: String(c.getDataValue('nombre') ?? '') });
    }
  }
  return mapa;
}

function codigosDeItems(items: ItemCotizacionParaSap[]): string[] {
  const codigos = new Set<string>();
  for (const it of items) {
    for (const l of it.resultado?.items ?? []) if (l.codigo) codigos.add(String(l.codigo));
    for (const c of it.resultado?.cortes?.perfiles ?? []) if (c.codigo) codigos.add(String(c.codigo));
  }
  return [...codigos];
}

/** Toda la lectura y validación, compartida por la previsualización y la escritura. */
async function prepararTraerDesdeCotizacion(datos: z.infer<typeof traerDesdeCotizacionSchema>) {
  const odp = await ODP.findByPk(datos.odp_id, { attributes: ['id', 'numero_odp', 'estado_produccion'] });
  if (!odp) throw new ErrorTraerSap(404, 'No se encontró la ODP.');

  // Cotizaciones del Cotizador vinculadas a la ODP y aprobadas.
  const aprobadas = await CotizadorCotizacion.findAll({
    where: { odp_id: datos.odp_id, estado: 'APROBADA' },
    attributes: ['id', 'numero', 'cliente_nombre'],
    order: [['numero', 'DESC']],
  });
  const cotizacionesAprobadas = aprobadas.map((c) => ({
    id: Number(c.getDataValue('id')),
    numero: Number(c.getDataValue('numero')),
    cliente: (c.getDataValue('cliente_nombre') as string | null) || null,
  }));
  if (cotizacionesAprobadas.length === 0) {
    throw new ErrorTraerSap(409, 'Esta ODP no tiene una cotización APROBADA vinculada. Vincúlala en la sección Cotizaciones y apruébala en el Cotizador.');
  }
  let cotizacionId = datos.cotizacion_id;
  if (cotizacionId === undefined) {
    if (cotizacionesAprobadas.length > 1) {
      throw new ErrorTraerSap(409, 'La ODP tiene varias cotizaciones aprobadas: elige de cuál traer los ítems.', { cotizaciones_aprobadas: cotizacionesAprobadas });
    }
    cotizacionId = cotizacionesAprobadas[0].id;
  } else if (!cotizacionesAprobadas.some((c) => c.id === cotizacionId)) {
    throw new ErrorTraerSap(409, 'Esa cotización no está aprobada o no está vinculada a esta ODP.', { cotizaciones_aprobadas: cotizacionesAprobadas });
  }

  // Sin `propuesta`, `obtener` trae los blobs de la ELEGIDA.
  const cot = await cotizacionStore.obtener(cotizacionId);
  if (!cot) throw new ErrorTraerSap(404, 'No se encontró la cotización.');
  const elegida = ((cot.propuestas ?? []) as Array<{ id: number; etiqueta: string; elegida?: boolean }>).find((p) => p.elegida);
  if (!elegida) throw new ErrorTraerSap(409, `La cotización N.° ${cot.numero} no tiene una opción elegida: elígela en el Cotizador.`);
  const items = (cot.items ?? []) as ItemCotizacionParaSap[];

  // SAP de la ODP con sus ítems y lo que los compromete.
  const saps = await SAP.findAll({
    where: { odp_id: datos.odp_id },
    include: [{
      model: SAPItem, as: 'items',
      attributes: ['id', 'item', 'codigo', 'estado_compra', 'es_faltante', 'modificado', 'existencia_piezas', 'exist_perf', 'origen_cotizacion_id'],
      include: [{ model: ODCItem, as: 'odc_items', attributes: ['id'] }],
    }],
    order: [['fecha_creacion', 'DESC'], ['id', 'DESC']],
  });
  const itemsDe = (s: SAP) => planos(s.get('items') as SAPItem[] | undefined);
  const resumenSaps = saps.map((s) => ({
    id: Number(s.getDataValue('id')),
    numero_sap: String(s.getDataValue('numero_sap')),
    items: itemsDe(s).length,
  }));

  let destino: SAP | null = null;
  if (datos.sap_id === 'nueva') destino = null;
  else if (datos.sap_id !== undefined) {
    destino = saps.find((s) => s.getDataValue('id') === datos.sap_id) ?? null;
    if (!destino) throw new ErrorTraerSap(404, 'Esa SAP no pertenece a esta ODP.');
  } else destino = saps[0] ?? null;

  const itemsDestino = destino ? itemsDe(destino) : [];
  const motivosReemplazo = motivosCompromiso(itemsDestino);
  const requiereModo = itemsDestino.length > 0;
  const modo = requiereModo ? (datos.modo ?? null) : null;

  // Doble carga: ítems de esta cotización ya presentes en alguna SAP de la ODP.
  // Si se va a reemplazar la SAP destino, sus ítems no cuentan (se borran).
  const yaTraida = saps
    .map((s) => ({
      sap_id: Number(s.getDataValue('id')),
      numero_sap: String(s.getDataValue('numero_sap')),
      items: itemsDe(s).filter((it) => it.origen_cotizacion_id === cotizacionId).length,
    }))
    .filter((s) => s.items > 0);
  const destinoId = destino ? Number(destino.getDataValue('id')) : null;
  const yaTraidaBloquea = yaTraida.filter((s) => !(modo === 'reemplazar' && s.sap_id === destinoId));

  // Agregar debajo: la siguiente a la MAYOR letra usada (no rellena huecos: una
  // letra borrada puede seguir impresa en papel o citada en una ODC).
  const indiceInicial = modo === 'agregar'
    ? Math.max(-1, ...itemsDestino.map((it) => indiceDeLetra(it.item))) + 1
    : 0;

  const equivalencias = await equivalenciasDeCatalogo(codigosDeItems(items));
  const armado = itemsParaSap(items, { equivalencias, indiceInicial, origenCotizacionId: cotizacionId });

  return {
    odp, cotizacionId, cot, elegida, cotizacionesAprobadas, resumenSaps, destino, destinoId,
    itemsDestino, requiereModo, modo, motivosReemplazo, yaTraida, yaTraidaBloquea, armado,
  };
}

export const traerItemsDeCotizacion = async (req: Request, res: Response) => {
  const parsed = traerDesdeCotizacionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Solicitud inválida para traer ítems de la cotización.',
      detalles: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  }
  const datos = parsed.data;
  const dryRun = datos.dry_run !== false;

  try {
    const p = await prepararTraerDesdeCotizacion(datos);
    const destinoResumen = p.destino
      ? { sap_id: p.destinoId, numero_sap: String(p.destino.getDataValue('numero_sap')), nueva: false, items_existentes: p.itemsDestino.length }
      : { sap_id: null as number | null, numero_sap: null as string | null, nueva: true, items_existentes: 0 };
    const respuesta = {
      dry_run: dryRun,
      cotizacion: {
        id: p.cotizacionId,
        numero: p.cot.numero,
        cliente: p.cot.cliente?.nombre || null,
        propuesta: { id: p.elegida.id, etiqueta: p.elegida.etiqueta },
      },
      cotizaciones_aprobadas: p.cotizacionesAprobadas,
      saps: p.resumenSaps,
      destino: destinoResumen,
      requiere_modo: p.requiereModo,
      modo: p.modo,
      reemplazo: { permitido: p.motivosReemplazo.length === 0, motivos: p.motivosReemplazo },
      ya_traida: p.yaTraida,
      filas: p.armado.filas,
      advertencias: p.armado.advertencias,
      excluidos: p.armado.excluidos,
    };
    if (dryRun) return res.json(respuesta);

    // ── Escritura ─────────────────────────────────────────────────────────
    if (p.odp.getDataValue('estado_produccion') === 'ANULADA') {
      throw new ErrorTraerSap(409, 'La ODP está anulada: no se le pueden agregar ítems a la SAP.');
    }
    if (p.armado.filas.length === 0) {
      throw new ErrorTraerSap(409, 'La opción elegida de la cotización no tiene perfilería, accesorios ni película para traer.');
    }
    if (p.requiereModo && !p.modo) {
      throw new ErrorTraerSap(409, `La ${destinoResumen.numero_sap} ya tiene ítems: elige "Agregar debajo" o "Reemplazar".`);
    }
    if (p.yaTraidaBloquea.length > 0) {
      const donde = p.yaTraidaBloquea.map((s) => s.numero_sap).join(', ');
      throw new ErrorTraerSap(409, `Los ítems de la cotización N.° ${p.cot.numero} ya se trajeron a ${donde}. Para volver a traerlos usa "Reemplazar" sobre esa SAP, o edítalos allí.`);
    }
    if (p.modo === 'reemplazar' && p.motivosReemplazo.length > 0) {
      throw new ErrorTraerSap(409, 'No se puede reemplazar: hay ítems de esta SAP que ya están en el proceso de compras. Usa "Agregar debajo" o gestiona esos ítems desde Compras.', { motivos: p.motivosReemplazo });
    }

    const userId = req.user!.id;
    const odpId = datos.odp_id;
    const filas: FilaSap[] = p.armado.filas;
    const aInsertar = (sapId: number) => filas.map((f) => ({
      sap_id: sapId,
      item: f.item,
      codigo: f.codigo,
      descripcion: f.descripcion,
      dimension: f.dimension,
      cantidad: f.cantidad,
      und: f.und,
      observacion: f.observacion,
      origen_cotizacion_id: f.origen_cotizacion_id,
      estado_compra: 'pendiente',
      modificado: false,
      es_faltante: false,
      datos_anteriores: null,
    }));

    const sapId = await withUniqueRetry(async () => {
      const t: Transaction = await sequelize.transaction();
      try {
        let id: number;
        if (p.destino && p.destinoId) {
          id = p.destinoId;
          if (p.modo === 'reemplazar') {
            // Se vuelve a comprobar DENTRO de la transacción y con bloqueo: entre
            // la lectura y aquí, Compras pudo haber tomado una línea.
            const actuales = await SAPItem.findAll({ where: { sap_id: id }, transaction: t, lock: t.LOCK.UPDATE });
            const conOdc = await ODCItem.findAll({
              where: { sap_item_id: actuales.map((a) => a.getDataValue('id')) },
              attributes: ['sap_item_id'],
              transaction: t,
            });
            const idsConOdc = new Set(conOdc.map((o) => o.getDataValue('sap_item_id')));
            const motivos = motivosCompromiso(actuales.map((a) => ({
              ...(a.get({ plain: true }) as ItemSapExistente),
              odc_items: idsConOdc.has(a.getDataValue('id')) ? [1] : [],
            })));
            if (motivos.length > 0) {
              throw new ErrorTraerSap(409, 'No se puede reemplazar: un ítem de esta SAP entró al proceso de compras mientras preparabas el cambio.', { motivos });
            }
            // individualHooks: sin él, el borrado masivo no deja rastro en auditoria_log.
            await SAPItem.destroy({ where: { sap_id: id }, individualHooks: true, transaction: t });
          }
        } else {
          const numero_sap = await generarNumeroSAP();
          const nueva = await SAP.create({
            numero_sap, odp_id: odpId, creado_por: userId, estado: 'borrador',
            notas: `Ítems traídos de la cotización N.° ${p.cot.numero} (opción ${p.elegida.etiqueta}).`,
          }, { transaction: t });
          id = Number(nueva.getDataValue('id'));
        }
        await SAPItem.bulkCreate(aInsertar(id), { individualHooks: true, transaction: t });
        await t.commit();
        return id;
      } catch (err) {
        await t.rollback();
        throw err;
      }
    });

    await recalcularAluminioODP(odpId);
    const sap = await SAP.findByPk(sapId, {
      include: [{ model: SAPItem, as: 'items' }, { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] }],
    });
    // Líneas nuevas en 'pendiente': Herrajes deja de estar cubierto. El motor decide.
    await recalcularChecksODP(odpId, {
      usuarioId: userId ?? null,
      origen: 'SAP',
      detalle: `SAP ${sap?.getDataValue('numero_sap') ?? ''}: ítems traídos de la cotización N.° ${p.cot.numero}`,
      herrajes: true,
    });
    import('../utils/notificaciones').then(({ emitirODPPatch }) => emitirODPPatch(odpId, 'update')).catch(() => {});
    import('../server').then(({ emitirCambio }) => emitirCambio('compras')).catch(() => {});

    return res.status(p.destino ? 200 : 201).json({
      ...respuesta,
      dry_run: false,
      destino: { ...destinoResumen, sap_id: sapId, numero_sap: sap?.getDataValue('numero_sap') ?? null },
      sap,
    });
  } catch (error) {
    if (error instanceof ErrorTraerSap) {
      return res.status(error.estado).json({ error: error.message, ...error.extra });
    }
    console.error('traerItemsDeCotizacion:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'No se pudieron traer los ítems de la cotización. Intenta de nuevo; si persiste, avisa a soporte.' });
  }
};
