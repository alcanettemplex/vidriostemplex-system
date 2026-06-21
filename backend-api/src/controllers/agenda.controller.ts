import { Request, Response } from 'express';
import { Op, QueryTypes } from 'sequelize';
import { z } from 'zod';
import { AgendaInstalacion, ODP, Cliente, sequelize } from '../models';

// ─── Elegibilidad ─────────────────────────────────────────────────────────────
// Una ODP solo puede agendarse si está LISTO_INSTALAR, requiere servicio
// (instalación/acarreo), tiene pago y factura OK, y no está ya en una ruta activa.
// Replica la lógica de la pestaña "Listo para instalar" de rutas.controller.

const cumplePago = (o: any) =>
  ['CANCELADO', 'CREDITO_APROBADO'].includes(o.estado_caja) ||
  o.autorizacion_especial_despacho === true ||
  o.forma_pago === 'credito' ||
  o.es_garantia === true;

const cumpleFactura = (o: any) =>
  o.estado_facturacion === 'FACTURADA' ||
  o.es_garantia === true ||
  o.es_no_conformidad === true ||
  o.forma_pago === 'credito';

const requiereServicio = (o: any) => o.instalacion === true || o.acarreo === true;

// Verifica que la ODP no esté tomada por una ruta activa (no cancelada/completada).
const estaEnRutaActiva = async (odpId: number): Promise<boolean> => {
  const filas: any[] = await sequelize.query(
    `SELECT 1 FROM ruta_odp ro
     JOIN rutas_instalacion ri ON ri.id = ro.ruta_id
     WHERE ro.odp_id = :oid
       AND ro.estado IN ('pendiente', 'en_curso', 'pausada')
       AND ri.estado NOT IN ('cancelada', 'completada')
     LIMIT 1`,
    { replacements: { oid: odpId }, type: QueryTypes.SELECT }
  );
  return filas.length > 0;
};

// Carga la ODP y valida elegibilidad. Devuelve { ok, motivo }.
const validarElegible = async (odpId: number): Promise<{ ok: boolean; motivo?: string }> => {
  const odp = (await ODP.findByPk(odpId, {
    attributes: [
      'id', 'numero_odp', 'estado_produccion', 'estado_caja', 'estado_facturacion',
      'autorizacion_especial_despacho', 'forma_pago', 'es_garantia', 'es_no_conformidad',
      'instalacion', 'acarreo',
    ],
  })) as any;
  if (!odp) return { ok: false, motivo: 'La ODP no existe' };
  if (odp.estado_produccion !== 'LISTO_INSTALAR') return { ok: false, motivo: 'La ODP no está lista para instalar' };
  if (!requiereServicio(odp)) return { ok: false, motivo: 'La ODP no requiere instalación ni acarreo' };
  if (!cumplePago(odp)) return { ok: false, motivo: 'La ODP no tiene el pago aprobado' };
  if (!cumpleFactura(odp)) return { ok: false, motivo: 'La ODP no tiene factura electrónica' };
  if (await estaEnRutaActiva(odpId)) return { ok: false, motivo: 'La ODP ya está asignada a una ruta' };
  return { ok: true };
};

// ODP que se devuelve junto a cada entrada de agenda (attributes selectivos → egress).
const INCLUDE_ODP_AGENDA = [
  {
    model: ODP, as: 'odp',
    attributes: [
      'id', 'numero_odp', 'cliente_id', 'direccion_instalacion', 'estado_produccion',
      'instalacion', 'acarreo', 'es_garantia', 'estado_caja', 'autorizacion_especial_despacho',
    ],
    include: [{ model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] }],
  },
];

// Siguiente "orden" disponible dentro de un día.
const siguienteOrden = async (fecha: string): Promise<number> => {
  const max = await AgendaInstalacion.max('orden', { where: { fecha_tentativa: fecha } });
  return (typeof max === 'number' ? max : 0) + 1;
};

// ─── GET: agenda de un rango (con auto-limpieza de huérfanas) ─────────────────

export const getAgenda = async (req: Request, res: Response) => {
  try {
    const { desde, hasta } = req.query;

    // "Hoy" en zona horaria de Colombia (robusto aunque el server corra en UTC, p. ej. Docker).
    // toISOString() devolvería UTC y de noche adelantaría el día, borrando agendas de hoy.
    const hoyStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    const base = new Date(`${hoyStr}T12:00:00Z`);
    const finDefecto = new Date(base);
    finDefecto.setUTCDate(base.getUTCDate() + 6);
    const desdeStr = desde ? String(desde) : hoyStr;
    const hastaStr = hasta ? String(hasta) : finDefecto.toISOString().split('T')[0];

    // Limpieza de vencidas (global): toda entrada con fecha anterior a hoy que NO se
    // convirtió en ruta vuelve a "sin agendar". Se cuentan las que siguen LISTO_INSTALAR
    // (las que realmente reaparecen en la bandeja) para avisar al jefe.
    const vencidas = (await AgendaInstalacion.findAll({
      where: { fecha_tentativa: { [Op.lt]: hoyStr } },
      include: [{ model: ODP, as: 'odp', attributes: ['id', 'estado_produccion'] }],
    })) as any[];
    let vencidasReagendadas = 0;
    if (vencidas.length) {
      vencidasReagendadas = vencidas.filter((v) => v.odp && v.odp.estado_produccion === 'LISTO_INSTALAR').length;
      await AgendaInstalacion.destroy({ where: { id: { [Op.in]: vencidas.map((v) => v.id) } } });
    }

    const filas = (await AgendaInstalacion.findAll({
      where: { fecha_tentativa: { [Op.between]: [desdeStr, hastaStr] } },
      include: INCLUDE_ODP_AGENDA,
      order: [['fecha_tentativa', 'ASC'], ['orden', 'ASC']],
    })) as any[];

    // Auto-limpieza de huérfanas: ODP que ya no está LISTO_INSTALAR (entró a ruta, etc.)
    const huerfanas = filas.filter((f) => !f.odp || f.odp.estado_produccion !== 'LISTO_INSTALAR');
    if (huerfanas.length) {
      await AgendaInstalacion.destroy({ where: { id: { [Op.in]: huerfanas.map((f) => f.id) } } });
    }

    const validas = filas.filter((f) => f.odp && f.odp.estado_produccion === 'LISTO_INSTALAR');
    res.json({ agenda: validas, vencidas_reagendadas: vencidasReagendadas });
  } catch (e: any) {
    console.error('getAgenda:', e.message);
    res.status(500).json({ error: 'Error al obtener la agenda' });
  }
};

// ─── POST: colocar (o mover) una ODP en un día ────────────────────────────────

const colocarSchema = z.object({
  odp_id: z.number().int().positive(),
  fecha_tentativa: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  nota: z.string().max(300).optional().nullable(),
}).strict();

export const colocarEnAgenda = async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { odp_id, fecha_tentativa, nota } = colocarSchema.parse(req.body);

    const elegible = await validarElegible(odp_id);
    if (!elegible.ok) return res.status(400).json({ error: elegible.motivo });

    // Una ODP = un día: si ya estaba agendada, se mueve al nuevo día.
    const existente = (await AgendaInstalacion.findOne({ where: { odp_id } })) as any;
    const orden = await siguienteOrden(fecha_tentativa);

    let entrada;
    if (existente) {
      await existente.update({ fecha_tentativa, orden, nota: nota ?? existente.nota });
      entrada = existente;
    } else {
      entrada = await AgendaInstalacion.create({
        odp_id, fecha_tentativa, orden, nota: nota ?? null, creado_por: user.id,
      });
    }

    const completa = await AgendaInstalacion.findByPk((entrada as any).id, { include: INCLUDE_ODP_AGENDA });
    res.status(existente ? 200 : 201).json(completa);
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Datos inválidos', detalles: e.issues });
    console.error('colocarEnAgenda:', e.message);
    res.status(500).json({ error: 'Error al colocar la ODP en la agenda' });
  }
};

// ─── PUT: mover de día / editar nota ──────────────────────────────────────────

const actualizarSchema = z.object({
  fecha_tentativa: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)').optional(),
  nota: z.string().max(300).optional().nullable(),
}).strict();

export const actualizarAgenda = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = actualizarSchema.parse(req.body);

    const entrada = (await AgendaInstalacion.findByPk(id)) as any;
    if (!entrada) return res.status(404).json({ error: 'Entrada de agenda no encontrada' });

    const upd: any = {};
    if (data.nota !== undefined) upd.nota = data.nota;
    // Al cambiar de día, recalcular el orden (va al final del nuevo día).
    if (data.fecha_tentativa !== undefined && data.fecha_tentativa !== entrada.fecha_tentativa) {
      upd.fecha_tentativa = data.fecha_tentativa;
      upd.orden = await siguienteOrden(data.fecha_tentativa);
    }
    if (Object.keys(upd).length) await entrada.update(upd);

    const completa = await AgendaInstalacion.findByPk(id, { include: INCLUDE_ODP_AGENDA });
    res.json(completa);
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Datos inválidos', detalles: e.issues });
    console.error('actualizarAgenda:', e.message);
    res.status(500).json({ error: 'Error al actualizar la entrada de agenda' });
  }
};

// ─── POST /reordenar: guardar el orden de un día ──────────────────────────────

const reordenarSchema = z.object({
  items: z.array(z.object({ id: z.number().int().positive(), orden: z.number().int() })).min(1),
}).strict();

export const reordenarAgenda = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { items } = reordenarSchema.parse(req.body);
    for (const it of items) {
      await AgendaInstalacion.update({ orden: it.orden }, { where: { id: it.id }, transaction: t });
    }
    await t.commit();
    res.json({ ok: true });
  } catch (e: any) {
    await t.rollback();
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Datos inválidos', detalles: e.issues });
    console.error('reordenarAgenda:', e.message);
    res.status(500).json({ error: 'Error al reordenar la agenda' });
  }
};

// ─── DELETE: desagendar (vuelve a "sin agendar") ──────────────────────────────

export const quitarDeAgenda = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const entrada = (await AgendaInstalacion.findByPk(id)) as any;
    if (!entrada) return res.status(404).json({ error: 'Entrada de agenda no encontrada' });
    await entrada.destroy();
    res.json({ ok: true });
  } catch (e: any) {
    console.error('quitarDeAgenda:', e.message);
    res.status(500).json({ error: 'Error al quitar la ODP de la agenda' });
  }
};
