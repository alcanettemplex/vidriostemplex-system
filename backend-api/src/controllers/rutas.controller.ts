import { Request, Response } from 'express';
import { Op, QueryTypes } from 'sequelize';
import {
  ODP, Usuario, Vehiculo, EvidenciaInstalacion, HistorialEstadoODP,
  RutaInstalacion, RutaODP, sequelize,
  ODPItem, SAP, SAPItem, Cotizacion, TomaMedidas, OrdenCompra, ODCItem, Pago
} from '../models';
import Cliente from '../models/cliente.model';
import { notificarCambioEstadoODP } from '../utils/notificaciones';
import { uploadConfig } from '../config/upload';

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Lista: sin SAP/ODC — se usa en getRutas (listado). El detalle por ID usa INCLUDE_RUTA_COMPLETA.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const INCLUDE_RUTA_LISTA = async (): Promise<any[]> => [
  { model: Vehiculo, as: 'vehiculo', attributes: ['id', 'placa', 'tipo'] },
  { model: Usuario, as: 'conductor', attributes: ['id', 'nombre_completo', 'rol'] },
  { model: Usuario, as: 'creador', attributes: ['id', 'nombre_completo'] },
  { model: Usuario, as: 'oficial', attributes: ['id', 'nombre_completo', 'rol'] },
  {
    model: Usuario, as: 'instaladores',
    attributes: ['id', 'nombre_completo', 'rol'],
    through: { attributes: [] },
  },
  {
    model: RutaODP, as: 'ruta_odps',
    separate: true,
    order: [['orden', 'ASC']],
    include: [
      {
        model: ODP, as: 'odp',
        include: [
          { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social', 'telefono'] },
          { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
          { model: ODPItem, as: 'items', separate: true, order: [['id', 'ASC']] },
          { model: Pago, as: 'pagos', attributes: ['id', 'monto', 'metodo_pago', 'fecha', 'observaciones'] },
          { model: Cotizacion, as: 'cotizaciones', attributes: ['id', 'numero_cot', 'valor_total', 'estado', 'fecha_creacion'] },
          { model: TomaMedidas, as: 'tomas_medidas', attributes: ['id', 'numero_tm', 'croquis_url'] },
        ],
      },
    ],
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const INCLUDE_RUTA_COMPLETA = async (): Promise<any[]> => [
  { model: Vehiculo, as: 'vehiculo', attributes: ['id', 'placa', 'tipo'] },
  { model: Usuario, as: 'conductor', attributes: ['id', 'nombre_completo', 'rol'] },
  { model: Usuario, as: 'creador', attributes: ['id', 'nombre_completo'] },
  { model: Usuario, as: 'oficial', attributes: ['id', 'nombre_completo', 'rol'] },
  {
    model: Usuario, as: 'instaladores',
    attributes: ['id', 'nombre_completo', 'rol'],
    through: { attributes: [] },
  },
  {
    model: RutaODP, as: 'ruta_odps',
    separate: true,
    order: [['orden', 'ASC']],
    include: [
      {
        model: ODP, as: 'odp',
        include: [
          { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social', 'telefono'] },
          { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
          { model: ODPItem, as: 'items', separate: true, order: [['id', 'ASC']] },
          { model: Pago, as: 'pagos', attributes: ['id', 'monto', 'metodo_pago', 'fecha', 'observaciones'] },
          { model: Cotizacion, as: 'cotizaciones', attributes: ['id', 'numero_cot', 'valor_total', 'estado', 'fecha_creacion'] },
          { model: TomaMedidas, as: 'tomas_medidas', attributes: ['id', 'numero_tm', 'croquis_url'] },
          {
            model: SAP, as: 'saps',
            include: [
              { model: SAPItem, as: 'items' },
              { 
                model: OrdenCompra, as: 'ordenes_compra',
                include: [{ model: ODCItem, as: 'items' }]
              }
            ]
          },
        ],
      },
    ],
  },
];

// Condición de pago aprobado para instalar (garantías bypass pago siempre)
const PAGO_OK = {
  [Op.or as any]: [
    { estado_caja: { [Op.in]: ['CANCELADO', 'CREDITO_APROBADO'] } },
    { autorizacion_especial_despacho: true },
    { forma_pago: 'credito' },
    { es_garantia: true },
  ],
};

// Solo ODPs que requieren servicio de instalación o acarreo (no "entrega a la mano")
const REQUIERE_SERVICIO = {
  [Op.or as any]: [{ instalacion: true }, { acarreo: true }],
};

const INCLUDE_ODP_BASICO = [
  { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social', 'telefono'] },
  { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
];

// ─── JEFE: ODPs para gestión (3 pestañas) ────────────────────────────────────

export const getODPsParaGestion = async (_req: Request, res: Response) => {
  try {
    // ODPs ya asignadas a rutas activas (excluye también pausadas para evitar doble asignación)
    const enRutaActiva: any[] = await sequelize.query(
      `SELECT ro.odp_id FROM ruta_odp ro
       JOIN rutas_instalacion ri ON ri.id = ro.ruta_id
       WHERE ro.estado IN ('pendiente', 'en_curso', 'pausada')
       AND ri.estado NOT IN ('cancelada', 'completada')`,
      { type: QueryTypes.SELECT }
    );
    const odpIdsEnRuta = enRutaActiva.map((r: any) => r.odp_id);
    const excluirEnRuta = odpIdsEnRuta.length ? { id: { [Op.notIn]: odpIdsEnRuta } } : {};

    const [listos, esperaPago, esperaProduccion] = await Promise.all([
      // Pestaña 1: producción lista + pago OK → puede programarse
      ODP.findAll({
        where: {
          estado_produccion: 'LISTO_INSTALAR',
          ...excluirEnRuta,
          [Op.and as any]: [PAGO_OK, REQUIERE_SERVICIO],
        },
        include: INCLUDE_ODP_BASICO,
        order: [['fecha_entrega', 'ASC']],
      }),
      // Pestaña 2: producción lista pero sin pago (excluye crédito, que ya puede instalarse)
      ODP.findAll({
        where: {
          estado_produccion: 'LISTO_INSTALAR',
          estado_caja: { [Op.in]: ['PENDIENTE', 'ABONADO'] },
          autorizacion_especial_despacho: false,
          forma_pago: { [Op.ne]: 'credito' },
          ...excluirEnRuta,
          ...REQUIERE_SERVICIO,
        },
        include: INCLUDE_ODP_BASICO,
        order: [['fecha_entrega', 'ASC']],
      }),
      // Pestaña 3: pago OK pero producción aún no lista
      ODP.findAll({
        where: {
          estado_produccion: {
            [Op.notIn]: ['LISTO_INSTALAR', 'PROGRAMADA', 'INSTALADA', 'ENTREGADA', 'PAUSADA'],
          },
          [Op.and as any]: [PAGO_OK, REQUIERE_SERVICIO],
        },
        include: INCLUDE_ODP_BASICO,
        order: [['fecha_entrega', 'ASC']],
      }),
    ]);

    res.json({ listos, espera_pago: esperaPago, espera_produccion: esperaProduccion });
  } catch (e: any) {
    console.error('getODPsParaGestion:', e.message);
    res.status(500).json({ error: 'Error al obtener ODPs para gestión' });
  }
};

// ─── JEFE: CRUD de rutas ──────────────────────────────────────────────────────

export const getRutas = async (_req: Request, res: Response) => {
  try {
    const includes = await INCLUDE_RUTA_LISTA();
    const rutas = await RutaInstalacion.findAll({
      where: { estado: { [Op.in]: ['programada', 'en_curso'] } },
      include: includes,
      order: [['creado_en', 'DESC']],
    });
    res.json(rutas);
  } catch (e: any) {
    console.error('getRutas:', e.message);
    res.status(500).json({ error: 'Error al obtener rutas' });
  }
};

export const getRutasHistorial = async (req: Request, res: Response) => {
  try {
    const { desde, hasta } = req.query;

    // Default: semana actual (lunes a domingo)
    const hoy = new Date();
    const diaSemana = hoy.getDay();
    const difLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() + difLunes);
    lunes.setHours(0, 0, 0, 0);

    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);
    domingo.setHours(23, 59, 59, 999);

    const desdeDate = desde ? new Date(`${desde}T00:00:00`) : lunes;
    const hastaDate = hasta ? new Date(`${hasta}T23:59:59`) : domingo;

    const includes = await INCLUDE_RUTA_LISTA();
    const rutas = await RutaInstalacion.findAll({
      where: {
        estado: { [Op.in]: ['completada', 'cancelada'] },
        creado_en: { [Op.between]: [desdeDate, hastaDate] },
      },
      include: includes,
      order: [['creado_en', 'DESC']],
    });
    res.json(rutas);
  } catch (e: any) {
    console.error('getRutasHistorial:', e.message);
    res.status(500).json({ error: 'Error al obtener historial de rutas' });
  }
};

export const getRutasProgramacion = async (req: Request, res: Response) => {
  try {
    const { fecha } = req.query;
    const fechaBusqueda = fecha ? String(fecha) : new Date().toISOString().split('T')[0];

    const rutas = await RutaInstalacion.findAll({
      where: { estado: { [Op.ne]: 'cancelada' } },
      include: [
        { model: Vehiculo, as: 'vehiculo', attributes: ['id', 'placa', 'tipo'] },
        { model: Usuario, as: 'conductor', attributes: ['id', 'nombre_completo'] },
        { model: Usuario, as: 'oficial', attributes: ['id', 'nombre_completo'] },
        {
          model: Usuario, as: 'instaladores',
          attributes: ['id', 'nombre_completo'],
          through: { attributes: [] },
        },
        {
          model: RutaODP, as: 'ruta_odps',
          where: { fecha_programada: fechaBusqueda },
          required: true,
          include: [
            {
              model: ODP, as: 'odp',
              attributes: ['id', 'numero_odp', 'tipo_servicio', 'descripcion_pedido', 'direccion_instalacion'],
              include: [
                { model: Cliente, as: 'cliente', attributes: ['nombre_razon_social'] },
                { model: ODPItem, as: 'items', attributes: ['item', 'tipo_vidrio', 'color', 'espesor', 'ancho_mm', 'alto_mm', 'cantidad', 'prod'], separate: true, order: [['id', 'ASC']] },
              ],
            },
          ],
        },
      ],
      order: [['creado_en', 'ASC']],
    });

    res.json(rutas);
  } catch (e: any) {
    console.error('getRutasProgramacion:', e.message);
    res.status(500).json({ error: 'Error al obtener programación del día' });
  }
};

export const getRuta = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const includes = await INCLUDE_RUTA_COMPLETA();
    const ruta = await RutaInstalacion.findByPk(id, { include: includes });
    if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada' });
    res.json(ruta);
  } catch (e: any) {
    res.status(500).json({ error: 'Error al obtener ruta' });
  }
};

export const createRuta = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const user = req.user!;
    const { vehiculo_id, conductor_id, oficial_id, instaladores = [], observaciones, odps = [] } = req.body;

    if (!odps.length) {
      await t.rollback();
      return res.status(400).json({ error: 'Debe incluir al menos una ODP' });
    }

    // Crear la ruta
    const ruta = await RutaInstalacion.create(
      { vehiculo_id, conductor_id, oficial_id: oficial_id || null, creado_por: user.id, observaciones },
      { transaction: t }
    );
    const rutaId = (ruta as any).id;

    // Asignar instaladores (bulk insert parametrizado para junction table)
    if (instaladores.length) {
      const placeholders = instaladores.map((_: number, i: number) => `(:rid, :iid${i})`).join(',');
      const replacements: Record<string, number> = { rid: rutaId };
      instaladores.forEach((iid: number, i: number) => { replacements[`iid${i}`] = iid; });
      await sequelize.query(
        `INSERT INTO ruta_instaladores (ruta_id, instalador_id) VALUES ${placeholders}`,
        { replacements, transaction: t }
      );
    }

    // Agregar ODPs a la ruta
    const rutaODPs = odps.map((o: any) => ({
      ruta_id: rutaId,
      odp_id: o.odp_id,
      orden: o.orden,
      fecha_programada: o.fecha_programada,
    }));
    await RutaODP.bulkCreate(rutaODPs, { transaction: t });

    // Cambiar ODPs a PROGRAMADA
    const odpIds = odps.map((o: any) => o.odp_id);
    await ODP.update(
      { estado_produccion: 'PROGRAMADA' },
      { where: { id: { [Op.in]: odpIds } }, transaction: t }
    );

    // Historial
    const odpRows = await ODP.findAll({ where: { id: { [Op.in]: odpIds } }, attributes: ['id', 'numero_odp', 'asesor_id'], transaction: t });
    for (const odp of odpRows as any[]) {
      await HistorialEstadoODP.create({
        odp_id: odp.id,
        estado_anterior: 'LISTO_INSTALAR',
        estado_nuevo: 'PROGRAMADA',
        usuario_id: user.id,
        fecha: new Date(),
        observacion: `Programada en ruta de instalación #${rutaId}`,
      }, { transaction: t });
    }

    await t.commit();

    // Notificar (fuera de la transacción)
    for (const odp of odpRows as any[]) {
      notificarCambioEstadoODP({
        numero_odp: odp.numero_odp,
        odp_id: odp.id,
        asesor_id: odp.asesor_id,
        estado_nuevo: 'PROGRAMADA',
        mensaje: `ODP ${odp.numero_odp} programada para instalación`,
      }).catch(() => {});
    }

    const includes = await INCLUDE_RUTA_COMPLETA();
    const rutaCompleta = await RutaInstalacion.findByPk(rutaId, { include: includes });
    res.status(201).json(rutaCompleta);
  } catch (e: any) {
    await t.rollback();
    console.error('createRuta:', e.message);
    res.status(500).json({ error: 'Error al crear ruta', detail: e.message });
  }
};

export const updateRuta = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { vehiculo_id, conductor_id, oficial_id, instaladores, observaciones, odps } = req.body;

    const ruta = await RutaInstalacion.findByPk(id, { transaction: t });
    if (!ruta) { await t.rollback(); return res.status(404).json({ error: 'Ruta no encontrada' }); }

    // Actualizar cabecera
    const upd: any = {};
    if (vehiculo_id !== undefined) upd.vehiculo_id = vehiculo_id;
    if (conductor_id !== undefined) upd.conductor_id = conductor_id;
    if (oficial_id !== undefined) upd.oficial_id = oficial_id || null;
    if (observaciones !== undefined) upd.observaciones = observaciones;
    if (Object.keys(upd).length) await ruta.update(upd, { transaction: t });

    // Reemplazar instaladores
    if (Array.isArray(instaladores)) {
      await sequelize.query(`DELETE FROM ruta_instaladores WHERE ruta_id = :rid`, { replacements: { rid: id }, transaction: t });
      if (instaladores.length) {
        const placeholders = instaladores.map((_: number, i: number) => `(:rid, :iid${i})`).join(',');
        const replacements: Record<string, number> = { rid: Number(id) };
        instaladores.forEach((iid: number, i: number) => { replacements[`iid${i}`] = iid; });
        await sequelize.query(`INSERT INTO ruta_instaladores (ruta_id, instalador_id) VALUES ${placeholders}`, { replacements, transaction: t });
      }
    }

    // Reemplazar ODPs (solo las que siguen en pendiente)
    if (Array.isArray(odps)) {
      // ODPs pendientes actuales → restaurar a LISTO_INSTALAR si se quitan
      const actuales = await RutaODP.findAll({ where: { ruta_id: id, estado: 'pendiente' }, transaction: t }) as any[];
      const nuevosIds = odps.map((o: any) => o.odp_id);
      const quitadas = actuales.filter((ro: any) => !nuevosIds.includes(ro.odp_id)).map((ro: any) => ro.odp_id);

      if (quitadas.length) {
        await ODP.update({ estado_produccion: 'LISTO_INSTALAR' }, { where: { id: { [Op.in]: quitadas } }, transaction: t });
        await RutaODP.destroy({ where: { ruta_id: id, odp_id: { [Op.in]: quitadas } }, transaction: t });
      }

      // Upsert de cada ODP
      for (const o of odps) {
        const existe = actuales.find((ro: any) => ro.odp_id === o.odp_id);
        if (existe) {
          await RutaODP.update(
            { orden: o.orden, fecha_programada: o.fecha_programada },
            { where: { ruta_id: id, odp_id: o.odp_id }, transaction: t }
          );
        } else {
          await RutaODP.create({ ruta_id: Number(id), odp_id: o.odp_id, orden: o.orden, fecha_programada: o.fecha_programada }, { transaction: t });
          await ODP.update({ estado_produccion: 'PROGRAMADA' }, { where: { id: o.odp_id }, transaction: t });
        }
      }
    }

    await t.commit();
    const includes = await INCLUDE_RUTA_COMPLETA();
    const rutaActualizada = await RutaInstalacion.findByPk(id, { include: includes });
    res.json(rutaActualizada);
  } catch (e: any) {
    await t.rollback();
    console.error('updateRuta:', e.message);
    res.status(500).json({ error: 'Error al actualizar ruta', detail: e.message });
  }
};

export const cancelarRuta = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const ruta = await RutaInstalacion.findByPk(id, { transaction: t });
    if (!ruta) { await t.rollback(); return res.status(404).json({ error: 'Ruta no encontrada' }); }

    // No se puede cancelar si hay instalaciones en curso
    const enCurso = await RutaODP.count({ where: { ruta_id: id, estado: 'en_curso' }, transaction: t });
    if (enCurso > 0) {
      await t.rollback();
      return res.status(400).json({ error: 'Hay instalaciones en curso. No se puede cancelar.' });
    }

    // Restaurar ODPs pendientes a LISTO_INSTALAR
    const pendientes = await RutaODP.findAll({ where: { ruta_id: id, estado: 'pendiente' }, transaction: t }) as any[];
    if (pendientes.length) {
      const ids = pendientes.map((ro: any) => ro.odp_id);
      await ODP.update({ estado_produccion: 'LISTO_INSTALAR' }, { where: { id: { [Op.in]: ids } }, transaction: t });
    }

    await ruta.update({ estado: 'cancelada' }, { transaction: t });
    await t.commit();
    res.json({ ok: true, message: 'Ruta cancelada' });
  } catch (e: any) {
    await t.rollback();
    res.status(500).json({ error: 'Error al cancelar ruta' });
  }
};

// ─── Vehículos disponibles ────────────────────────────────────────────────────

export const getVehiculos = async (_req: Request, res: Response) => {
  try {
    const vehiculos = await Vehiculo.findAll({ order: [['tipo', 'ASC'], ['placa', 'ASC']] });
    res.json(vehiculos);
  } catch (e) {
    res.status(500).json({ error: 'Error al obtener vehículos' });
  }
};

export const getInstaladores = async (_req: Request, res: Response) => {
  try {
    const personal = await Usuario.findAll({
      where: { rol: { [Op.in]: ['instalador', 'conductor'] } },
      attributes: ['id', 'nombre_completo', 'rol'],
      order: [['nombre_completo', 'ASC']],
    });
    res.json(personal);
  } catch (e) {
    res.status(500).json({ error: 'Error al obtener personal' });
  }
};

// ─── INSTALADOR: Mi asignación ────────────────────────────────────────────────

export const getMiAsignacion = async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    // Obtener rutas donde está asignado: como ayudante (ruta_instaladores) o como oficial (oficial_id)
    const rutaIds: any[] = await sequelize.query(
      `SELECT ruta_id FROM ruta_instaladores WHERE instalador_id = :uid
       UNION
       SELECT id AS ruta_id FROM rutas_instalacion WHERE oficial_id = :uid`,
      { replacements: { uid: user.id }, type: QueryTypes.SELECT }
    );
    if (!rutaIds.length) return res.json([]);

    const ids = rutaIds.map((r: any) => r.ruta_id);

    // Paso 1 SQL: solo en_curso y pendiente, descarta pausada/con_dano/completada
    const candidatos = await RutaODP.findAll({
      where: {
        ruta_id: { [Op.in]: ids },
        estado: { [Op.in]: ['en_curso', 'pendiente'] },
      },
      include: [
        {
          model: RutaInstalacion, as: 'ruta',
          where: { estado: { [Op.ne]: 'cancelada' } },
          include: [
            { model: Vehiculo, as: 'vehiculo', attributes: ['placa', 'tipo'] },
            { model: Usuario, as: 'instaladores', attributes: ['id', 'nombre_completo'], through: { attributes: [] } },
            { model: Usuario, as: 'conductor', attributes: ['id', 'nombre_completo'] },
            { model: Usuario, as: 'oficial', attributes: ['id', 'nombre_completo'] },
          ],
        },
        {
          model: ODP, as: 'odp',
          include: [
            { model: Cliente, as: 'cliente' },
            { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
            { model: ODPItem, as: 'items', separate: true, order: [['id', 'ASC']] },
            { model: Pago, as: 'pagos' },
            { model: Cotizacion, as: 'cotizaciones' },
            { model: TomaMedidas, as: 'tomas_medidas' },
            {
              model: SAP, as: 'saps',
              include: [
                { model: SAPItem, as: 'items' },
                {
                  model: OrdenCompra, as: 'ordenes_compra',
                  include: [{ model: ODCItem, as: 'items' }]
                }
              ]
            },
          ],
        },
      ],
      order: [
        [sequelize.literal(`CASE WHEN "RutaODP"."estado" = 'en_curso' THEN 0 ELSE 1 END`), 'ASC'],
        ['orden', 'ASC'],
      ],
    });

    // El conductor y el instalador tienen ciclos independientes.
    // La cancelación de la ruta es el único evento que bloquea al instalador (ya filtrado en SQL).
    // Una ruta 'completada' por el conductor no impide que el instalador continúe sus tareas.
    const asignacion = candidatos as any[];

    res.json(asignacion);
  } catch (e: any) {
    console.error('getMiAsignacion FULL ERROR:', e);
    res.status(500).json({ error: 'Error al obtener asignaciones', details: e.message });
  }
};

// ─── INSTALADOR: Iniciar instalación ─────────────────────────────────────────

export const iniciarInstalacion = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params; // ruta_odp.id
    const user = req.user!;

    const rutaODP = await RutaODP.findByPk(id, { transaction: t }) as any;
    if (!rutaODP) { await t.rollback(); return res.status(404).json({ error: 'Entrada de ruta no encontrada' }); }
    if (!['pendiente', 'pausada'].includes(rutaODP.estado)) {
      await t.rollback();
      return res.status(400).json({ error: `Estado actual: ${rutaODP.estado}. Solo se puede iniciar desde 'pendiente' o 'pausada'` });
    }

    // Verificar que el instalador está asignado a esta ruta (ayudante o oficial)
    const [asignado]: any[] = await sequelize.query(
      `SELECT 1 FROM ruta_instaladores WHERE ruta_id = :rid AND instalador_id = :uid
       UNION
       SELECT 1 FROM rutas_instalacion WHERE id = :rid AND oficial_id = :uid`,
      { replacements: { rid: rutaODP.ruta_id, uid: user.id }, type: QueryTypes.SELECT, transaction: t }
    );
    if (!asignado) { await t.rollback(); return res.status(403).json({ error: 'No estás asignado a esta ruta' }); }

    const esReanudacion = rutaODP.estado === 'pausada';
    await rutaODP.update({
      estado: 'en_curso',
      inicio_instalacion: esReanudacion ? rutaODP.inicio_instalacion : new Date(),
      fin_instalacion: null,
    }, { transaction: t });

    // ODP → INSTALADA (desde PROGRAMADA en inicio normal, desde LISTO_INSTALAR en reanudación)
    const odp = await ODP.findByPk(rutaODP.odp_id, { transaction: t }) as any;
    if (odp) {
      const estadoAnteriorODP = odp.getDataValue('estado_produccion');
      await odp.update({ estado_produccion: 'INSTALADA' }, { transaction: t });
      await HistorialEstadoODP.create({
        odp_id: odp.id,
        estado_anterior: estadoAnteriorODP,
        estado_nuevo: 'INSTALADA',
        usuario_id: user.id,
        fecha: new Date(),
      }, { transaction: t });
    }

    // Marcar ruta en_curso si aún no lo estaba
    await RutaInstalacion.update(
      { estado: 'en_curso' },
      { where: { id: rutaODP.ruta_id, estado: 'programada' }, transaction: t }
    );

    await t.commit();

    if (odp) {
      notificarCambioEstadoODP({
        numero_odp: odp.numero_odp,
        odp_id: odp.id,
        asesor_id: odp.asesor_id,
        estado_nuevo: 'INSTALADA',
        mensaje: `Instalación de ${odp.numero_odp} iniciada`,
      }).catch(() => {});
    }

    res.json({ ok: true, inicio_instalacion: new Date() });
  } catch (e: any) {
    await t.rollback();
    console.error('iniciarInstalacion:', e.message);
    res.status(500).json({ error: 'Error al iniciar instalación' });
  }
};

// ─── INSTALADOR: Finalizar instalación ───────────────────────────────────────

export const finalizarInstalacion = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params; // ruta_odp.id
    const user = req.user!;
    const { gps, datos_receptor, firma_receptor } = req.body;

    const rutaODP = await RutaODP.findByPk(id, { transaction: t }) as any;
    if (!rutaODP) { await t.rollback(); return res.status(404).json({ error: 'Entrada de ruta no encontrada' }); }
    if (rutaODP.estado !== 'en_curso') {
      await t.rollback();
      return res.status(400).json({ error: 'La instalación debe estar en curso para finalizar' });
    }

    const fotoUrl = req.file ? (req.file as any).path : null;
    if (!fotoUrl) { await t.rollback(); return res.status(400).json({ error: 'Se requiere foto de evidencia' }); }

    const ahora = new Date();

    // Actualizar ruta_odp
    await rutaODP.update({
      estado: 'completada',
      fin_instalacion: ahora,
      datos_receptor: datos_receptor || null,
      firma_receptor: firma_receptor || null,
      foto_evidencia_url: fotoUrl,
      gps_finalizacion: gps || null,
    }, { transaction: t });

    // Crear evidencia formal
    await EvidenciaInstalacion.create({
      odp_id: rutaODP.odp_id,
      instalador_id: user.id,
      tipo_evidencia: 'foto',
      archivo_url: fotoUrl,
      gps: gps || null,
      datos_firmante: datos_receptor || null,
    }, { transaction: t });

    // ODP → ENTREGADA
    const odp = await ODP.findByPk(rutaODP.odp_id, { transaction: t }) as any;
    if (odp) {
      await odp.update({ estado_produccion: 'ENTREGADA' }, { transaction: t });
      await HistorialEstadoODP.create({
        odp_id: odp.id,
        estado_anterior: 'INSTALADA',
        estado_nuevo: 'ENTREGADA',
        usuario_id: user.id,
        fecha: ahora,
        observacion: `Entregada. Recibió: ${datos_receptor || 'Sin datos'}. GPS: ${gps || 'N/A'}`,
      }, { transaction: t });

      // Si era ODP de reproceso → activar padre
      if (odp.es_no_conformidad && odp.odp_padre_id) {
        const padre = await ODP.findByPk(odp.odp_padre_id, { transaction: t }) as any;
        if (padre && padre.estado_produccion === 'PAUSADA') {
          await padre.update({ estado_produccion: 'INSTALADA' }, { transaction: t });
          await HistorialEstadoODP.create({
            odp_id: padre.id,
            estado_anterior: 'PAUSADA',
            estado_nuevo: 'INSTALADA',
            usuario_id: user.id,
            fecha: ahora,
            observacion: `Reactivada: reproceso ${odp.numero_odp} completado`,
          }, { transaction: t });
        }
      }
    }

    // ¿Todas las ODPs de la ruta completadas? → ruta = completada
    const pendientesEnRuta = await RutaODP.count({
      where: { ruta_id: rutaODP.ruta_id, estado: { [Op.ne]: 'completada' } },
      transaction: t,
    });
    if (pendientesEnRuta === 0) {
      await RutaInstalacion.update({ estado: 'completada' }, { where: { id: rutaODP.ruta_id }, transaction: t });
    }

    await t.commit();

    if (odp) {
      notificarCambioEstadoODP({
        numero_odp: odp.numero_odp,
        odp_id: odp.id,
        asesor_id: odp.asesor_id,
        estado_nuevo: 'ENTREGADA',
        mensaje: `ODP ${odp.numero_odp} entregada exitosamente`,
      }).catch(() => {});
    }

    res.json({ ok: true, fin_instalacion: ahora });
  } catch (e: any) {
    await t.rollback();
    console.error('finalizarInstalacion:', e.message);
    res.status(500).json({ error: 'Error al finalizar instalación', detail: e.message });
  }
};

// ─── INSTALADOR: Reportar daño en instalación ────────────────────────────────

export const reportarDano = async (req: Request, res: Response) => {
  try {
    const { id } = req.params; // ruta_odp.id
    const user = req.user!;
    const { descripcion_dano } = req.body;

    if (!descripcion_dano?.trim()) {
      return res.status(400).json({ error: 'La descripción del daño es obligatoria' });
    }

    const rutaODP = await RutaODP.findByPk(id) as any;
    if (!rutaODP) return res.status(404).json({ error: 'Entrada de ruta no encontrada' });
    if (rutaODP.estado !== 'en_curso') {
      return res.status(400).json({ error: `No se puede reportar daño en estado '${rutaODP.estado}'` });
    }

    // Verificar que el instalador está asignado a esta ruta (ayudante o oficial)
    const [asignado]: any[] = await sequelize.query(
      `SELECT 1 FROM ruta_instaladores WHERE ruta_id = :rid AND instalador_id = :uid
       UNION
       SELECT 1 FROM rutas_instalacion WHERE id = :rid AND oficial_id = :uid`,
      { replacements: { rid: rutaODP.ruta_id, uid: user.id }, type: QueryTypes.SELECT }
    );
    if (!asignado) return res.status(403).json({ error: 'No estás asignado a esta ruta' });

    const fotoUrl = req.file ? (req.file as any).path : null;

    await rutaODP.update({
      estado: 'con_dano',
      descripcion_dano: descripcion_dano.trim(),
      foto_dano_url: fotoUrl,
    });

    const odp = await ODP.findByPk(rutaODP.odp_id) as any;
    if (odp) {
      await odp.update({ tiene_dano_instalacion: true });
    }

    res.json({ ok: true, mensaje: 'Daño registrado correctamente' });
  } catch (e: any) {
    console.error('reportarDano:', e.message);
    res.status(500).json({ error: 'Error al registrar el daño' });
  }
};

// ─── CONDUCTOR: Mi ruta ───────────────────────────────────────────────────────

export const getMiRutaConductor = async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const includes = await INCLUDE_RUTA_COMPLETA();
    const rutas = await RutaInstalacion.findAll({
      where: {
        conductor_id: user.id,
        estado: { [Op.ne]: 'cancelada' },
      },
      include: includes,
      order: [['creado_en', 'DESC']],
    });
    res.json(rutas);
  } catch (e: any) {
    console.error('getMiRutaConductor FULL ERROR:', e);
    res.status(500).json({ error: 'Error al obtener rutas', details: e.message });
  }
};

export const iniciarRutaConductor = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const ruta = await RutaInstalacion.findOne({
      where: { id, conductor_id: user.id },
    }) as any;
    if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada o no asignada' });
    if (ruta.estado !== 'programada') return res.status(400).json({ error: 'La ruta ya fue iniciada' });

    await ruta.update({ estado: 'en_curso', inicio_ruta: new Date() });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Error al iniciar ruta' });
  }
};

export const llegadaConductor = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const rutaODP = await RutaODP.findByPk(id, {
      include: [{ model: RutaInstalacion, as: 'ruta', attributes: ['id', 'conductor_id', 'estado'] }],
    }) as any;

    if (!rutaODP) return res.status(404).json({ error: 'Parada no encontrada' });
    if (rutaODP.ruta?.conductor_id !== user.id) return res.status(403).json({ error: 'No eres el conductor de esta ruta' });
    if (rutaODP.ruta?.estado !== 'en_curso') return res.status(400).json({ error: 'La ruta no está en curso' });
    if (rutaODP.llegada_conductor) return res.status(400).json({ error: 'Ya registraste tu llegada a esta parada' });

    await rutaODP.update({ llegada_conductor: new Date() });
    res.json({ ok: true, llegada_conductor: rutaODP.llegada_conductor });
  } catch (e) {
    res.status(500).json({ error: 'Error al registrar llegada' });
  }
};

// ─── OFICIAL / JEFE: Pausar instalación en curso ─────────────────────────────
// La ODP vuelve a LISTO_INSTALAR para poder ser reasignada a una nueva ruta

export const pausarInstalacion = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const user = req.user!;
    const { motivo_pausa } = req.body;

    if (!motivo_pausa?.trim()) {
      await t.rollback();
      return res.status(400).json({ error: 'El motivo de la pausa es obligatorio' });
    }

    const rutaODP = await RutaODP.findByPk(id, {
      include: [{ model: RutaInstalacion, as: 'ruta', attributes: ['id', 'oficial_id'] }],
      transaction: t,
    }) as any;
    if (!rutaODP) { await t.rollback(); return res.status(404).json({ error: 'Entrada de ruta no encontrada' }); }
    if (rutaODP.estado !== 'en_curso') {
      await t.rollback();
      return res.status(400).json({ error: 'Solo se puede pausar una instalación en curso' });
    }

    const rolesJefe = ['jefe_produccion', 'admin', 'gerencia', 'produccion'];
    const esOficial = rutaODP.ruta?.oficial_id === user.id;
    if (!esOficial && !rolesJefe.includes(user.rol)) {
      await t.rollback();
      return res.status(403).json({ error: 'Solo el oficial de la ruta o el jefe pueden pausar una instalación' });
    }

    const ahora = new Date();
    await rutaODP.update({ estado: 'pausada', fin_instalacion: ahora, motivo_pausa: motivo_pausa.trim() }, { transaction: t });

    const odp = await ODP.findByPk(rutaODP.odp_id, { transaction: t }) as any;
    if (odp) {
      await odp.update({ estado_produccion: 'LISTO_INSTALAR' }, { transaction: t });
      await HistorialEstadoODP.create({
        odp_id: odp.id,
        estado_anterior: 'INSTALADA',
        estado_nuevo: 'LISTO_INSTALAR',
        usuario_id: user.id,
        fecha: ahora,
        observacion: `Pausa: ${motivo_pausa.trim()}`,
      }, { transaction: t });
      notificarCambioEstadoODP({
        numero_odp: odp.numero_odp,
        odp_id: odp.id,
        asesor_id: odp.asesor_id,
        estado_nuevo: 'LISTO_INSTALAR',
        mensaje: `Instalación de ${odp.numero_odp} pausada — pendiente continuar`,
      }).catch(() => {});
    }

    await t.commit();
    res.json({ ok: true });
  } catch (e: any) {
    await t.rollback();
    console.error('pausarInstalacion:', e.message);
    res.status(500).json({ error: 'Error al pausar instalación' });
  }
};

// ─── JEFE: Asignación de un instalador específico ────────────────────────────

export const getAsignacionInstalador = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const rutaIds: any[] = await sequelize.query(
      `SELECT ruta_id FROM ruta_instaladores WHERE instalador_id = :uid
       UNION
       SELECT id AS ruta_id FROM rutas_instalacion WHERE oficial_id = :uid`,
      { replacements: { uid: id }, type: QueryTypes.SELECT }
    );
    if (!rutaIds.length) return res.json([]);

    const ids = rutaIds.map((r: any) => r.ruta_id);

    const asignacion = await RutaODP.findAll({
      where: {
        ruta_id: { [Op.in]: ids },
        estado: { [Op.in]: ['pendiente', 'en_curso', 'pausada', 'con_dano'] },
      },
      include: [
        {
          model: RutaInstalacion, as: 'ruta',
          where: { estado: { [Op.ne]: 'cancelada' } },
          include: [
            { model: Vehiculo, as: 'vehiculo', attributes: ['placa', 'tipo'] },
            { model: Usuario, as: 'instaladores', attributes: ['id', 'nombre_completo'], through: { attributes: [] } },
            { model: Usuario, as: 'conductor', attributes: ['id', 'nombre_completo'] },
            { model: Usuario, as: 'oficial', attributes: ['id', 'nombre_completo'] },
          ],
        },
        {
          model: ODP, as: 'odp',
          include: [
            { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social', 'telefono'] },
            { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
            { model: ODPItem, as: 'items', separate: true, order: [['id', 'ASC']] },
            { model: Pago, as: 'pagos', attributes: ['id', 'monto', 'metodo_pago', 'fecha'] },
          ],
        },
      ],
      order: [
        [sequelize.literal(`CASE WHEN "RutaODP"."estado" = 'en_curso' THEN 0 WHEN "RutaODP"."estado" = 'pausada' THEN 1 WHEN "RutaODP"."estado" = 'con_dano' THEN 2 ELSE 3 END`), 'ASC'],
        ['orden', 'ASC'],
      ],
    });

    res.json(asignacion);
  } catch (e: any) {
    console.error('getAsignacionInstalador:', e);
    res.status(500).json({ error: 'Error al obtener asignación del instalador', details: e.message });
  }
};

export const terminarRutaConductor = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const ruta = await RutaInstalacion.findByPk(id, {
      include: [
        { model: RutaODP, as: 'ruta_odps' },
        { model: Usuario, as: 'instaladores', attributes: ['id', 'nombre_completo'], through: { attributes: [] } },
        { model: Usuario, as: 'conductor', attributes: ['id', 'nombre_completo'] },
      ],
    }) as any;

    if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada' });

    // Solo el conductor puede finalizar la ruta (responsabilidad de transporte)
    // El oficial es independiente: gestiona paradas de instalación, no el cierre de ruta
    if (ruta.conductor_id !== user.id) {
      return res.status(403).json({ error: 'Solo el conductor asignado puede finalizar la ruta' });
    }

    if (ruta.estado !== 'en_curso') return res.status(400).json({ error: 'La ruta no está en curso' });

    // Verificar que el conductor haya marcado llegada a TODAS las paradas
    const paradasSinLlegada = ruta.ruta_odps.filter((p: any) => !p.llegada_conductor);
    if (paradasSinLlegada.length > 0) {
      return res.status(400).json({
        error: `Aún tienes ${paradasSinLlegada.length} paradas sin registrar llegada. Debes marcar llegada en todos los puntos antes de finalizar la ruta.`
      });
    }

    const finRuta = new Date();
    await ruta.update({ estado: 'completada', fin_ruta: finRuta });

    // Auto-cerrar ODPs de acarreo puro (acarreo=true, instalacion=false)
    // El instalador cierra las demás; estas no tienen instalador que las cierre
    const odpIds = ruta.ruta_odps.map((p: any) => p.odp_id).filter(Boolean);
    if (odpIds.length > 0) {
      const odpsAcarreo = await ODP.findAll({
        where: {
          id: { [Op.in]: odpIds },
          acarreo: true,
          instalacion: false,
          estado_produccion: { [Op.in]: ['PROGRAMADA', 'INSTALADA'] },
        },
      }) as any[];

      for (const odp of odpsAcarreo) {
        const estadoAnterior = odp.getDataValue('estado_produccion');
        await odp.update({ estado_produccion: 'ENTREGADA' });
        await HistorialEstadoODP.create({
          odp_id: odp.id,
          estado_anterior: estadoAnterior,
          estado_nuevo: 'ENTREGADA',
          usuario_id: user.id,
          fecha: finRuta,
          observacion: `Acarreo completado automáticamente al cerrar ruta #${ruta.id}`,
        });
        notificarCambioEstadoODP({
          numero_odp: odp.numero_odp,
          odp_id: odp.id,
          asesor_id: odp.asesor_id,
          estado_nuevo: 'ENTREGADA',
          mensaje: `Acarreo ${odp.numero_odp} completado`,
        }).catch(() => {});
      }
    }

    // Notificar al equipo de la ruta (instaladores + conductor + roles de gestión)
    import('../server').then(({ io }) => {
      const instaladoresIds = (ruta.instaladores || []).map((i: any) => i.id);
      const notificados = new Set<number>([...instaladoresIds]);
      if (ruta.conductor_id) notificados.add(ruta.conductor_id);
      if (ruta.oficial_id) notificados.add(ruta.oficial_id);

      const msg = {
        type: 'RUTA_COMPLETADA',
        message: `Ruta de instalación #${ruta.id} completada por ${user.nombre_completo || 'el equipo'}`,
        notificacionPara: ['admin', 'gerencia', 'jefe_produccion'],
        timestamp: finRuta,
      };
      io.emit('notification', msg);
    }).catch(() => {});

    res.json({ ok: true, fin_ruta: finRuta });
  } catch (e: any) {
    console.error('terminarRutaConductor:', e.message);
    res.status(500).json({ error: 'Error al finalizar ruta' });
  }
};
