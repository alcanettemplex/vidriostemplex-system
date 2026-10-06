import { NextFunction, Request, Response } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { Op, QueryTypes, Transaction } from 'sequelize';
import { z } from 'zod';
import {
  ODP, Usuario, Vehiculo, EvidenciaInstalacion, HistorialEstadoODP,
  RutaInstalacion, RutaODP, AgendaInstalacion, sequelize,
  ODPItem, SAP, SAPItem, TomaMedidas, OrdenCompra, ODCItem, Pago
} from '../models';
import Cliente from '../models/cliente.model';
import { notificarCambioEstadoODP, emitirODPPatch, emitirCambioRutas } from '../utils/notificaciones';
import { hoyBogotaISO, sumarDiasISO, rangoDiasBogota, HOY_BOGOTA_SQL, horaBogotaSQL } from '../utils/fechas';
import { uploadConfig } from '../config/upload';

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Estados de parada (ruta_odp) que todavía "ocupan" la ruta: mientras quede una, la ruta
// sigue viva y la ODP sigue tomada por ella. `pausada` NO está desde el 2026-10-05:
// pausar saca la ODP de la ruta (vuelve a su bandeja para programarse en una ruta nueva)
// y la parada queda solo como registro de lo que pasó. `completada` es el cierre normal.
const PARADAS_VIVAS = ['pendiente', 'en_curso', 'con_dano'];

// Cierra la ruta padre cuando ya no le queda ninguna parada viva. La usan
// finalizarInstalacion, pausarInstalacion y las dos acciones del panel
// "Pendientes de cierre" (entregarAtascada, reprogramarAtascada).
// El where con estado IN (programada, en_curso) evita resucitar una ruta ya
// cancelada: cancelarRuta nunca toca ruta_odp.estado, así que una parada
// "pendiente" de una ruta cancelada puede llegar intacta hasta acá.
const cerrarRutaSiSinPendientes = async (rutaId: number, fin: Date, t: Transaction) => {
  const vivas = await RutaODP.count({
    where: { ruta_id: rutaId, estado: { [Op.in]: PARADAS_VIVAS } },
    transaction: t,
  });
  if (vivas === 0) {
    await RutaInstalacion.update(
      { estado: 'completada', fin_ruta: fin },
      { where: { id: rutaId, estado: { [Op.in]: ['programada', 'en_curso'] } }, transaction: t }
    );
  }
};

// Payload de crear/editar ruta. Mismas claves que envía ProgramarRutaModal.
const FECHA_ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Cada parada necesita una fecha válida (AAAA-MM-DD).');
const idOpcional = z.number().int().positive().nullable().optional();
const paradaSchema = z.object({
  odp_id: z.number().int().positive(),
  orden: z.number().int().min(1),
  fecha_programada: FECHA_ISO,
}).strict();
const sinODPsRepetidas = (odps: { odp_id: number }[]) =>
  new Set(odps.map((o) => o.odp_id)).size === odps.length;

const crearRutaSchema = z.object({
  vehiculo_id: idOpcional,
  conductor_id: idOpcional,
  oficial_id: idOpcional,
  instaladores: z.array(z.number().int().positive()).optional().default([]),
  observaciones: z.string().max(2000).nullable().optional(),
  odps: z.array(paradaSchema)
    .min(1, 'La ruta debe incluir al menos una ODP.')
    .refine(sinODPsRepetidas, 'Una ODP aparece dos veces en la ruta.'),
}).strict();

const editarRutaSchema = z.object({
  vehiculo_id: idOpcional,
  conductor_id: idOpcional,
  oficial_id: idOpcional,
  instaladores: z.array(z.number().int().positive()).optional(),
  observaciones: z.string().max(2000).nullable().optional(),
  odps: z.array(paradaSchema)
    .refine(sinODPsRepetidas, 'Una ODP aparece dos veces en la ruta.')
    .optional(),
}).strict();

// Inserta el equipo de la ruta en la tabla puente (bulk parametrizado). Sin repetidos:
// la PK (ruta_id, instalador_id) rechazaría el INSERT entero si llega dos veces el mismo id.
const insertarInstaladores = async (rutaId: number, ids: number[], t: Transaction) => {
  const unicos = [...new Set(ids)];
  if (!unicos.length) return;
  const placeholders = unicos.map((_, i) => `(:rid, :iid${i})`).join(',');
  const replacements: Record<string, number> = { rid: rutaId };
  unicos.forEach((iid, i) => { replacements[`iid${i}`] = iid; });
  await sequelize.query(
    `INSERT INTO ruta_instaladores (ruta_id, instalador_id) VALUES ${placeholders}`,
    { replacements, transaction: t }
  );
};

const mensajeZod = (e: z.ZodError): string =>
  e.issues[0]?.message ?? 'Los datos de la ruta no son válidos.';

// Las ODPs que se agregan a una ruta deben estar listas y libres: en LISTO_INSTALAR y sin
// parada viva en otra ruta activa. Sin esto, dos jefes programando a la vez podían dejar
// la misma ODP en dos rutas. Devuelve un mensaje legible o null si todo está bien.
const validarODPsLibres = async (
  odpIds: number[],
  rutaIdExcluida: number | null,
  t: Transaction
): Promise<string | null> => {
  if (!odpIds.length) return null;
  const odps = (await ODP.findAll({
    where: { id: { [Op.in]: odpIds } },
    attributes: ['id', 'numero_odp', 'estado_produccion'],
    transaction: t,
  })) as any[];
  if (odps.length !== odpIds.length) return 'Una de las ODPs ya no existe. Recarga la pantalla e intenta de nuevo.';
  const noListas = odps.filter((o) => o.estado_produccion !== 'LISTO_INSTALAR');
  if (noListas.length) {
    return `Estas ODPs ya no están en "Listo para instalar": ${noListas.map((o) => `${o.numero_odp} (${o.estado_produccion})`).join(', ')}. Recarga la pantalla.`;
  }
  const ocupadas: { numero_odp: string; ruta_id: number }[] = await sequelize.query(
    `SELECT o.numero_odp, ro.ruta_id
       FROM ruta_odp ro
       JOIN rutas_instalacion ri ON ri.id = ro.ruta_id
       JOIN odp o ON o.id = ro.odp_id
      WHERE ro.odp_id IN (:ids)
        AND ro.estado IN (:vivas)
        AND ri.estado IN ('programada', 'en_curso')
        ${rutaIdExcluida ? 'AND ro.ruta_id <> :rutaId' : ''}`,
    {
      replacements: { ids: odpIds, vivas: PARADAS_VIVAS, rutaId: rutaIdExcluida },
      type: QueryTypes.SELECT,
      transaction: t,
    }
  );
  if (ocupadas.length) {
    return `Ya están en otra ruta activa: ${ocupadas.map((o) => `${o.numero_odp} (Ruta #${o.ruta_id})`).join(', ')}.`;
  }
  return null;
};

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
    // Listado: NO trae firma_receptor (TEXT base64 ~13KB), fotos ni datos_receptor —
    // esos campos solo se muestran en ODPFichaModal (detalle que re-fetcha). Reduce egress.
    attributes: ['id', 'ruta_id', 'odp_id', 'orden', 'fecha_programada', 'estado',
      'motivo_pausa', 'descripcion_dano', 'llegada_conductor',
      'inicio_instalacion', 'fin_instalacion'],
    include: [
      {
        model: ODP, as: 'odp',
        // Solo los campos que usan las tarjetas de ruta, las etiquetas de pago/factura
        // (utils/estadoInstalacion.ts del frontend, espejo de PAGO_OK/FACTURA_OK) y la
        // Hoja de Ruta impresa (contacto en obra y descripción).
        attributes: ['id', 'numero_odp', 'cliente_id', 'asesor_id', 'direccion_instalacion',
          'instalacion', 'acarreo', 'es_garantia', 'es_no_conformidad', 'estado_caja',
          'autorizacion_especial_despacho', 'forma_pago', 'estado_facturacion',
          'nombre_recibe', 'telefono_recibe', 'descripcion_pedido'],
        include: [
          { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social', 'telefono'] },
          { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
        ],
      },
    ],
  },
];

// Detalle: trae los documentos de la ODP (items, SAP, ODC) porque el conductor y el
// instalador imprimen la Orden de Producción, el Detalle Técnico y la SAP desde aquí.
//
// Dos decisiones de egress, medidas el 2026-08-01 (ver SESSION_LOG):
//
// 1) `separate: true` en TODAS las colecciones anidadas bajo la ODP. Sin él, Sequelize
//    resuelve pagos × cotizaciones × tomas_medidas × saps × sap_items × ordenes_compra ×
//    odc_items en un ÚNICO JOIN: un producto cartesiano que devolvía 28 filas de
//    `ruta_odp` para una ruta de 4 paradas (7×), y cada fila repetida arrastraba la
//    firma. El JSON resultante es idéntico —Sequelize ya deduplicaba en memoria—, así
//    que esto no cambia la respuesta, solo deja de pedirle filas repetidas a Postgres.
//    Requisito: los includes con `attributes` explícitos deben incluir su FK (`odp_id`,
//    `sap_id`, `odc_id`), porque con `separate` Sequelize agrupa los hijos por esa clave.
//
// 2) `firma_receptor` excluida: es el 98% del peso de `ruta_odp` (2.790 kB de 2.843 kB,
//    TEXT base64 de ~13 KB por firma) y NINGÚN consumidor de estos endpoints la muestra.
//    La única pantalla que la pinta es ODPTabInstalacion, que se alimenta de
//    `GET /api/odp/:id` — ese endpoint la incluye por su cuenta (odp.controller.ts) y no
//    se toca aquí.
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
    attributes: { exclude: ['firma_receptor'] },
    include: [
      {
        model: ODP, as: 'odp',
        include: [
          { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social', 'telefono'] },
          { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
          // El `order: id ASC` es obligatorio aquí, no cosmético: sin ORDER BY, el orden
          // de estas colecciones lo decidía el plan del optimizador y cambia al pasar de
          // un JOIN a una subconsulta. Declararlo mantiene los documentos impresos
          // (PrintableSAP lista estos ítems) estables entre cargas, algo que el JOIN
          // anterior tampoco garantizaba. Verificado: mismo contenido, orden determinista.
          { model: ODPItem, as: 'items', separate: true, order: [['id', 'ASC']] },
          { model: Pago, as: 'pagos', separate: true, order: [['id', 'ASC']], attributes: ['id', 'odp_id', 'monto', 'metodo_pago', 'fecha', 'observaciones'] },
          { model: TomaMedidas, as: 'tomas_medidas', separate: true, order: [['id', 'ASC']], attributes: ['id', 'odp_id', 'numero_tm', 'croquis_url'] },
          {
            model: SAP, as: 'saps',
            separate: true,
            order: [['id', 'ASC']],
            include: [
              { model: SAPItem, as: 'items', separate: true, order: [['id', 'ASC']] },
              {
                model: OrdenCompra, as: 'ordenes_compra',
                separate: true,
                order: [['id', 'ASC']],
                include: [{ model: ODCItem, as: 'items', separate: true, order: [['id', 'ASC']] }]
              }
            ]
          },
        ],
      },
    ],
  },
];

// Historial del conductor: tarjetas de "Rutas Realizadas". No imprime documentos
// (`abrirDocumento` llega undefined en ese tab), así que no necesita items/SAP/ODC/pagos.
// Campos verificados uno a uno contra RutaCard y StopItem de ConductorView.tsx.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const INCLUDE_RUTA_CONDUCTOR_HISTORIAL = (): any[] => [
  { model: Vehiculo, as: 'vehiculo', attributes: ['id', 'placa'] },
  {
    model: Usuario, as: 'instaladores',
    attributes: ['id'],
    through: { attributes: [] },
  },
  {
    model: RutaODP, as: 'ruta_odps',
    separate: true,
    order: [['orden', 'ASC']],
    attributes: ['id', 'ruta_id', 'odp_id', 'orden', 'estado', 'llegada_conductor'],
    include: [
      {
        model: ODP, as: 'odp',
        attributes: ['id', 'numero_odp', 'cliente_id', 'direccion_instalacion', 'descripcion_pedido'],
        include: [
          { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] },
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

// Condición de factura electrónica para instalar (garantías, NC y crédito están exentas)
const FACTURA_OK = {
  [Op.or as any]: [
    { estado_facturacion: 'FACTURADA' },
    { es_garantia: true },
    { es_no_conformidad: true },
    { forma_pago: 'credito' },
  ],
};

// Validación defensiva: las ODPs deben cumplir pago y facturación para poder programarse.
// Devuelve los numero_odp que incumplen cada condición (createRuta y ODPs nuevas en updateRuta).
const validarElegibilidadProgramacion = async (
  odpIds: number[],
  t: Transaction
): Promise<{ sinPago: string[]; sinFactura: string[] }> => {
  if (!odpIds.length) return { sinPago: [], sinFactura: [] };
  const filas = (await ODP.findAll({
    where: { id: { [Op.in]: odpIds } },
    attributes: [
      'id', 'numero_odp', 'estado_caja', 'autorizacion_especial_despacho',
      'forma_pago', 'es_garantia', 'es_no_conformidad', 'estado_facturacion',
    ],
    transaction: t,
  })) as any[];

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

  return {
    sinPago: filas.filter((o) => !cumplePago(o)).map((o) => o.numero_odp as string),
    sinFactura: filas.filter((o) => !cumpleFactura(o)).map((o) => o.numero_odp as string),
  };
};

const INCLUDE_ODP_BASICO = [
  { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social', 'telefono'] },
  { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
];

// ─── JEFE: ODPs para gestión (3 pestañas) ────────────────────────────────────

export const getODPsParaGestion = async (_req: Request, res: Response) => {
  try {
    // ODPs ya tomadas por una ruta activa. Una parada pausada ya no la toma (2026-10-05):
    // pausar saca la ODP de la ruta, y aquí debe reaparecer para programarse de nuevo.
    const enRutaActiva: any[] = await sequelize.query(
      `SELECT ro.odp_id FROM ruta_odp ro
       JOIN rutas_instalacion ri ON ri.id = ro.ruta_id
       WHERE ro.estado IN (:vivas)
       AND ri.estado NOT IN ('cancelada', 'completada')`,
      { replacements: { vivas: PARADAS_VIVAS }, type: QueryTypes.SELECT }
    );
    const odpIdsEnRuta = enRutaActiva.map((r: any) => r.odp_id);
    const excluirEnRuta = odpIdsEnRuta.length ? { id: { [Op.notIn]: odpIdsEnRuta } } : {};

    const [listos, esperaPago, esperaProduccion, esperaFactura] = await Promise.all([
      // Pestaña 1: producción lista + pago OK + factura OK → puede programarse.
      // Incluye su entrada de agenda (si está agendada) para pintar el badge "Agendada: X".
      ODP.findAll({
        where: {
          estado_produccion: 'LISTO_INSTALAR',
          ...excluirEnRuta,
          [Op.and as any]: [PAGO_OK, REQUIERE_SERVICIO, FACTURA_OK],
        },
        include: [
          ...INCLUDE_ODP_BASICO,
          { model: AgendaInstalacion, as: 'agenda', attributes: ['id', 'fecha_tentativa', 'orden'], required: false },
        ],
        order: [['fecha_entrega', 'ASC']],
      }),
      // Pestaña 2: producción lista pero sin pago (excluye crédito, que ya puede instalarse).
      // Las garantías quedan fuera: no se cobran al cliente, así que PAGO_OK las da por
      // aprobadas y su lugar es "Listo para instalar" — sin esta exclusión aparecían en
      // ambas pestañas a la vez e inflaban los dos contadores.
      // Incluye su entrada de agenda para que la bandeja no la muestre dos veces.
      ODP.findAll({
        where: {
          estado_produccion: 'LISTO_INSTALAR',
          estado_caja: { [Op.in]: ['PENDIENTE', 'ABONADO'] },
          autorizacion_especial_despacho: false,
          forma_pago: { [Op.ne]: 'credito' },
          es_garantia: { [Op.or]: [{ [Op.ne]: true }, { [Op.is]: null }] },
          ...excluirEnRuta,
          ...REQUIERE_SERVICIO,
        },
        include: [
          ...INCLUDE_ODP_BASICO,
          { model: AgendaInstalacion, as: 'agenda', attributes: ['id', 'fecha_tentativa', 'orden'], required: false },
        ],
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
      // Pestaña 4: producción lista + pago OK pero SIN factura electrónica (excluye garantía/NC/crédito)
      ODP.findAll({
        where: {
          estado_produccion: 'LISTO_INSTALAR',
          es_garantia: { [Op.not]: true },
          es_no_conformidad: { [Op.not]: true },
          forma_pago: { [Op.or]: [{ [Op.ne]: 'credito' }, { [Op.is]: null }] },
          estado_facturacion: { [Op.or]: [{ [Op.ne]: 'FACTURADA' }, { [Op.is]: null }] },
          ...excluirEnRuta,
          [Op.and as any]: [PAGO_OK, REQUIERE_SERVICIO],
        },
        // Incluye su entrada de agenda para que la bandeja no la muestre dos veces.
        include: [
          ...INCLUDE_ODP_BASICO,
          { model: AgendaInstalacion, as: 'agenda', attributes: ['id', 'fecha_tentativa', 'orden'], required: false },
        ],
        order: [['fecha_entrega', 'ASC']],
      }),
    ]);

    // Pausa pendiente de retomar: si la última parada de la ODP quedó pausada, se adjunta
    // para que la bandeja muestre "Pausada en Ruta #X: motivo" y el jefe sepa que es un
    // trabajo a medias, no una instalación nueva. Solo la ÚLTIMA parada cuenta: una pausa
    // vieja ya retomada en otra ruta no debe aparecer.
    const idsBandeja = [...listos, ...esperaPago, ...esperaFactura].map((o: any) => o.id);
    const pausas: any[] = idsBandeja.length
      ? await sequelize.query(
          `SELECT * FROM (
             SELECT DISTINCT ON (ro.odp_id)
                    ro.odp_id, ro.ruta_id, ro.estado, ro.motivo_pausa, ro.fin_instalacion
               FROM ruta_odp ro
               JOIN rutas_instalacion ri ON ri.id = ro.ruta_id
              WHERE ro.odp_id IN (:ids) AND ri.estado <> 'cancelada'
              ORDER BY ro.odp_id, ro.id DESC
           ) u WHERE u.estado = 'pausada'`,
          { replacements: { ids: idsBandeja }, type: QueryTypes.SELECT }
        )
      : [];
    const pausaPorODP = new Map(pausas.map((p) => [p.odp_id, {
      ruta_id: p.ruta_id, motivo_pausa: p.motivo_pausa, fecha: p.fin_instalacion,
    }]));
    const conPausa = (lista: any[]) => lista.map((o: any) => ({
      ...o.toJSON(),
      ultima_pausa: pausaPorODP.get(o.id) ?? null,
    }));

    res.json({
      listos: conPausa(listos),
      espera_pago: conPausa(esperaPago),
      espera_produccion: esperaProduccion,
      espera_factura: conPausa(esperaFactura),
    });
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
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    // Búsqueda (buscador global de la vista de jefe): ignora el período y busca en todo el
    // historial por N° ODP o cliente. Primero los IDs por SQL y luego el findAll de siempre:
    // un where dentro de ruta_odps (separate: true) no descarta la ruta, solo le quita
    // paradas, y la tarjeta saldría incompleta. Tope de 50 rutas para cuidar el egress.
    if (q.length >= 3) {
      const patron = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const filas = await sequelize.query<{ id: number }>(
        `SELECT r.id
           FROM rutas_instalacion r
          WHERE r.estado IN ('completada', 'cancelada')
            AND EXISTS (
              SELECT 1
                FROM ruta_odp ro
                JOIN odp o ON o.id = ro.odp_id
                LEFT JOIN clientes c ON c.id = o.cliente_id
               WHERE ro.ruta_id = r.id
                 AND (o.numero_odp ILIKE :patron OR c.nombre_razon_social ILIKE :patron)
            )
          ORDER BY r.creado_en DESC
          LIMIT 50`,
        { replacements: { patron }, type: QueryTypes.SELECT }
      );
      if (!filas.length) { res.json([]); return; }
      const includes = await INCLUDE_RUTA_LISTA();
      const rutas = await RutaInstalacion.findAll({
        where: { id: { [Op.in]: filas.map(f => f.id) } },
        include: includes,
        order: [['creado_en', 'DESC']],
      });
      res.json(rutas);
      return;
    }

    // Default: semana actual de Bogotá (lunes a domingo). Los días se cortan a medianoche
    // de Bogotá: `creado_en` es un momento y el proceso corre en UTC en Render.
    const hoy = hoyBogotaISO();
    const diaSemana = new Date(`${hoy}T00:00:00Z`).getUTCDay();
    const lunesISO = sumarDiasISO(hoy, diaSemana === 0 ? -6 : 1 - diaSemana);
    const domingoISO = sumarDiasISO(lunesISO, 6);

    const { inicio: desdeDate, fin: hastaDate } = rangoDiasBogota(
      desde ? String(desde) : lunesISO,
      hasta ? String(hasta) : domingoISO,
    );

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

// Informe del día para WhatsApp (InformeRutasModal, en Instalaciones y en Producción).
// Trae las paradas de un día de calendario de toda ruta no cancelada, en cualquier
// estado: un día pasado se informa con el resultado de cada parada. Sin vehículo ni
// conductor (decisión del usuario, 2026-10-06) y sin firma, fotos ni ítems: solo lo que
// el texto muestra, para cuidar el egress.
const informeDiaSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha del informe no es válida (AAAA-MM-DD).').optional(),
}).strict();

export const getRutasProgramacion = async (req: Request, res: Response) => {
  try {
    const parsed = informeDiaSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: mensajeZod(parsed.error) });
    const fechaBusqueda = parsed.data.fecha ?? hoyBogotaISO();

    const rutas = await RutaInstalacion.findAll({
      where: { estado: { [Op.ne]: 'cancelada' } },
      attributes: ['id', 'estado'],
      include: [
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
          attributes: ['id', 'orden', 'estado'],
          include: [
            {
              model: ODP, as: 'odp',
              attributes: ['id', 'numero_odp', 'descripcion_pedido', 'direccion_instalacion', 'es_garantia', 'es_no_conformidad'],
              include: [{ model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] }],
            },
          ],
        },
      ],
      // Mismo orden que la vista "Por equipo" de Programados (rutas más recientes primero).
      order: [['creado_en', 'DESC']],
    });

    res.json(rutas);
  } catch (e: any) {
    console.error('getRutasProgramacion:', e.message);
    res.status(500).json({ error: 'No se pudo armar el informe del día. Intenta de nuevo en un momento.' });
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
    const parsed = crearRutaSchema.safeParse(req.body);
    if (!parsed.success) {
      await t.rollback();
      return res.status(400).json({ error: mensajeZod(parsed.error) });
    }
    const { vehiculo_id, conductor_id, oficial_id, instaladores, observaciones, odps } = parsed.data;

    const errorLibres = await validarODPsLibres(odps.map((o) => o.odp_id), null, t);
    if (errorLibres) {
      await t.rollback();
      return res.status(409).json({ error: errorLibres });
    }

    // Validación defensiva: pago y factura aprobados antes de programar
    const { sinPago, sinFactura } = await validarElegibilidadProgramacion(
      odps.map((o) => o.odp_id),
      t
    );
    if (sinPago.length) {
      await t.rollback();
      return res.status(400).json({ error: `Pago no aprobado en: ${sinPago.join(', ')}` });
    }
    if (sinFactura.length) {
      await t.rollback();
      return res.status(400).json({ error: `Sin factura electrónica en: ${sinFactura.join(', ')}` });
    }

    // Crear la ruta
    const ruta = await RutaInstalacion.create(
      {
        vehiculo_id: vehiculo_id ?? null,
        conductor_id: conductor_id ?? null,
        oficial_id: oficial_id ?? null,
        creado_por: user.id,
        observaciones: observaciones ?? null,
      },
      { transaction: t }
    );
    const rutaId = (ruta as any).id;

    await insertarInstaladores(rutaId, instaladores, t);

    // Agregar ODPs a la ruta
    const rutaODPs = odps.map((o) => ({
      ruta_id: rutaId,
      odp_id: o.odp_id,
      orden: o.orden,
      fecha_programada: o.fecha_programada,
    }));
    await RutaODP.bulkCreate(rutaODPs, { transaction: t });

    // Cambiar ODPs a PROGRAMADA
    const odpIds = odps.map((o) => o.odp_id);
    await ODP.update(
      { estado_produccion: 'PROGRAMADA' },
      { where: { id: { [Op.in]: odpIds } }, transaction: t }
    );

    // Salen de la agenda tentativa: ya quedaron materializadas en una ruta real
    await AgendaInstalacion.destroy({ where: { odp_id: { [Op.in]: odpIds } }, transaction: t });

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
    emitirCambioRutas();

    // Payload de listado, no de detalle: ProgramarRutaModal descarta esta respuesta
    // (hace `await axios.post(...)` sin leer `.data` y llama a onSaved()), y ningún otro
    // cliente la consume — verificado en frontend-web y mobile-app. Devolver el include
    // completo costaba ~21 MB por creación de ruta para nada. Se conserva un objeto ruta
    // válido —con vehículo, personal y paradas— por si algún consumidor futuro lo lee.
    const includes = await INCLUDE_RUTA_LISTA();
    const rutaCompleta = await RutaInstalacion.findByPk(rutaId, { include: includes });
    res.status(201).json(rutaCompleta);
  } catch (e: any) {
    await t.rollback();
    console.error('createRuta:', e.message);
    res.status(500).json({ error: 'No se pudo crear la ruta. Ningún cambio quedó guardado; intenta de nuevo y, si se repite, avisa a soporte.' });
  }
};

// Estados de ruta en los que el jefe todavía puede editarla, cancelarla o recibir paradas.
const RUTA_ABIERTA = ['programada', 'en_curso'];

const ESTADO_RUTA_TEXTO: Record<string, string> = {
  completada: 'completada',
  cancelada: 'cancelada',
};

// ODP que cambió de estado por una acción del jefe sobre la ruta; se notifica tras el commit.
type CambioODP = { id: number; numero_odp: string; asesor_id: number; estado_nuevo: string; mensaje: string };

const notificarCambios = (cambios: CambioODP[]) => {
  for (const c of cambios) {
    notificarCambioEstadoODP({
      numero_odp: c.numero_odp,
      odp_id: c.id,
      asesor_id: c.asesor_id,
      estado_nuevo: c.estado_nuevo,
      mensaje: c.mensaje,
    }).catch(() => {});
  }
};

// Devuelve a "Listo para instalar" las ODPs de paradas pendientes que salen de una ruta
// (quitadas al editar, o la ruta entera al cancelar). Solo las que siguen en PROGRAMADA:
// una ODP que ya se movió a otro estado —p. ej. una pausa reprogramada en otra ruta— no
// se pisa. Registra el historial de cada una y devuelve los cambios para notificar.
const liberarODPsDeRuta = async (
  odpIds: number[],
  motivo: string,
  usuarioId: number,
  t: Transaction
): Promise<CambioODP[]> => {
  if (!odpIds.length) return [];
  const odps = (await ODP.findAll({
    where: { id: { [Op.in]: odpIds }, estado_produccion: 'PROGRAMADA' },
    attributes: ['id', 'numero_odp', 'asesor_id'],
    transaction: t,
  })) as any[];
  if (!odps.length) return [];
  await ODP.update(
    { estado_produccion: 'LISTO_INSTALAR' },
    { where: { id: { [Op.in]: odps.map((o) => o.id) } }, transaction: t }
  );
  const ahora = new Date();
  for (const o of odps) {
    await HistorialEstadoODP.create({
      odp_id: o.id,
      estado_anterior: 'PROGRAMADA',
      estado_nuevo: 'LISTO_INSTALAR',
      usuario_id: usuarioId,
      fecha: ahora,
      observacion: motivo,
    }, { transaction: t });
  }
  return odps.map((o) => ({
    id: o.id, numero_odp: o.numero_odp, asesor_id: o.asesor_id,
    estado_nuevo: 'LISTO_INSTALAR', mensaje: `${o.numero_odp} volvió a "Listo para instalar" (${motivo.toLowerCase()})`,
  }));
};

export const updateRuta = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const rutaId = Number(req.params.id);
    const user = req.user!;
    const parsed = editarRutaSchema.safeParse(req.body);
    if (!parsed.success) {
      await t.rollback();
      return res.status(400).json({ error: mensajeZod(parsed.error) });
    }
    const { vehiculo_id, conductor_id, oficial_id, instaladores, observaciones, odps } = parsed.data;

    const ruta = await RutaInstalacion.findByPk(rutaId, { transaction: t, lock: t.LOCK.UPDATE }) as any;
    if (!ruta) { await t.rollback(); return res.status(404).json({ error: 'La ruta ya no existe. Recarga la pantalla.' }); }
    if (!RUTA_ABIERTA.includes(ruta.estado)) {
      await t.rollback();
      return res.status(400).json({ error: `La ruta #${rutaId} ya está ${ESTADO_RUTA_TEXTO[ruta.estado] ?? ruta.estado} y no se puede editar. Recarga la pantalla.` });
    }

    // Actualizar cabecera
    const upd: Record<string, unknown> = {};
    if (vehiculo_id !== undefined) upd.vehiculo_id = vehiculo_id;
    if (conductor_id !== undefined) upd.conductor_id = conductor_id;
    if (oficial_id !== undefined) upd.oficial_id = oficial_id;
    if (observaciones !== undefined) upd.observaciones = observaciones;
    if (Object.keys(upd).length) await ruta.update(upd, { transaction: t });

    // Reemplazar instaladores
    if (Array.isArray(instaladores)) {
      await sequelize.query(`DELETE FROM ruta_instaladores WHERE ruta_id = :rid`, { replacements: { rid: rutaId }, transaction: t });
      await insertarInstaladores(rutaId, instaladores, t);
    }

    const cambios: CambioODP[] = [];

    // Reemplazar ODPs (solo las paradas pendientes son editables)
    if (odps) {
      const actuales = await RutaODP.findAll({ where: { ruta_id: rutaId, estado: 'pendiente' }, transaction: t }) as any[];
      const nuevosIds = odps.map((o) => o.odp_id);
      const idsActuales = actuales.map((ro) => ro.odp_id as number);
      const quitadas = idsActuales.filter((oid) => !nuevosIds.includes(oid));
      const idsNuevas = nuevosIds.filter((oid) => !idsActuales.includes(oid));

      // Quitar todas las paradas de una ruta sin empezar la dejaría vacía: eso es cancelarla.
      if (!nuevosIds.length) {
        const otras = await RutaODP.count({ where: { ruta_id: rutaId, estado: { [Op.ne]: 'pendiente' } }, transaction: t });
        if (!otras) {
          await t.rollback();
          return res.status(400).json({ error: 'La ruta quedaría sin ODPs. Si ya no va, usa "Cancelar ruta".' });
        }
      }

      const errorLibres = await validarODPsLibres(idsNuevas, null, t);
      if (errorLibres) {
        await t.rollback();
        return res.status(409).json({ error: errorLibres });
      }
      const { sinPago, sinFactura } = await validarElegibilidadProgramacion(idsNuevas, t);
      if (sinPago.length) {
        await t.rollback();
        return res.status(400).json({ error: `Pago no aprobado en: ${sinPago.join(', ')}` });
      }
      if (sinFactura.length) {
        await t.rollback();
        return res.status(400).json({ error: `Sin factura electrónica en: ${sinFactura.join(', ')}` });
      }

      if (quitadas.length) {
        cambios.push(...await liberarODPsDeRuta(quitadas, `Quitada de la ruta de instalación #${rutaId}`, user.id, t));
        await RutaODP.destroy({ where: { ruta_id: rutaId, odp_id: { [Op.in]: quitadas }, estado: 'pendiente' }, transaction: t });
      }

      // Upsert de cada ODP
      for (const o of odps) {
        if (idsActuales.includes(o.odp_id)) {
          await RutaODP.update(
            { orden: o.orden, fecha_programada: o.fecha_programada },
            { where: { ruta_id: rutaId, odp_id: o.odp_id, estado: 'pendiente' }, transaction: t }
          );
        } else {
          await RutaODP.create({ ruta_id: rutaId, odp_id: o.odp_id, orden: o.orden, fecha_programada: o.fecha_programada }, { transaction: t });
        }
      }

      if (idsNuevas.length) {
        await ODP.update({ estado_produccion: 'PROGRAMADA' }, { where: { id: { [Op.in]: idsNuevas } }, transaction: t });
        const agregadas = await ODP.findAll({ where: { id: { [Op.in]: idsNuevas } }, attributes: ['id', 'numero_odp', 'asesor_id'], transaction: t }) as any[];
        const ahora = new Date();
        for (const o of agregadas) {
          await HistorialEstadoODP.create({
            odp_id: o.id,
            estado_anterior: 'LISTO_INSTALAR',
            estado_nuevo: 'PROGRAMADA',
            usuario_id: user.id,
            fecha: ahora,
            observacion: `Programada en ruta de instalación #${rutaId}`,
          }, { transaction: t });
          cambios.push({ id: o.id, numero_odp: o.numero_odp, asesor_id: o.asesor_id, estado_nuevo: 'PROGRAMADA', mensaje: `ODP ${o.numero_odp} programada para instalación` });
        }
      }

      // Las ODPs que quedaron en esta ruta salen de la agenda tentativa
      if (nuevosIds.length) {
        await AgendaInstalacion.destroy({ where: { odp_id: { [Op.in]: nuevosIds } }, transaction: t });
      }

      // Si se quitaron todas las pendientes y lo que queda ya terminó, la ruta se cierra.
      await cerrarRutaSiSinPendientes(rutaId, new Date(), t);
    }

    await t.commit();
    notificarCambios(cambios);
    emitirCambioRutas();

    // Igual que en createRuta: el modal descarta esta respuesta. Ver nota allí.
    const includes = await INCLUDE_RUTA_LISTA();
    const rutaActualizada = await RutaInstalacion.findByPk(rutaId, { include: includes });
    res.json(rutaActualizada);
  } catch (e: any) {
    await t.rollback();
    console.error('updateRuta:', e.message);
    res.status(500).json({ error: 'No se pudo guardar la ruta. Ningún cambio quedó guardado; intenta de nuevo.' });
  }
};

export const cancelarRuta = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const rutaId = Number(req.params.id);
    const user = req.user!;
    const ruta = await RutaInstalacion.findByPk(rutaId, { transaction: t, lock: t.LOCK.UPDATE }) as any;
    if (!ruta) { await t.rollback(); return res.status(404).json({ error: 'La ruta ya no existe. Recarga la pantalla.' }); }
    if (!RUTA_ABIERTA.includes(ruta.estado)) {
      await t.rollback();
      return res.status(400).json({ error: `La ruta #${rutaId} ya está ${ESTADO_RUTA_TEXTO[ruta.estado] ?? ruta.estado}; no hay nada que cancelar.` });
    }

    // No se puede cancelar si hay instalaciones en curso
    const enCurso = await RutaODP.count({ where: { ruta_id: rutaId, estado: 'en_curso' }, transaction: t });
    if (enCurso > 0) {
      await t.rollback();
      return res.status(400).json({ error: 'Hay una instalación en curso en esta ruta. Pídele al oficial que la finalice o la pause antes de cancelar.' });
    }

    // Solo vuelven a la bandeja las ODPs de paradas pendientes. Una parada pausada ya soltó
    // su ODP al pausar; una con daño deja la ODP en INSTALANDO y se resuelve desde
    // "Pendientes de cierre" — devolverla a LISTO_INSTALAR escondería el daño.
    const pendientes = await RutaODP.findAll({ where: { ruta_id: rutaId, estado: 'pendiente' }, attributes: ['odp_id'], transaction: t }) as any[];
    const cambios = await liberarODPsDeRuta(
      pendientes.map((ro) => ro.odp_id as number),
      `Ruta de instalación #${rutaId} cancelada`,
      user.id,
      t
    );

    await ruta.update({ estado: 'cancelada' }, { transaction: t });
    await t.commit();
    notificarCambios(cambios);
    emitirCambioRutas();
    res.json({ ok: true, message: 'Ruta cancelada' });
  } catch (e: any) {
    await t.rollback();
    console.error('cancelarRuta:', e.message);
    res.status(500).json({ error: 'No se pudo cancelar la ruta. Intenta de nuevo.' });
  }
};

// ─── JEFE: unir dos rutas del mismo día ───────────────────────────────────────
// El equipo suele crear una ruta por ODP (474 de 515 rutas tienen una sola parada al
// 2026-10-05), y el mismo oficial termina con varias rutas el mismo día. Unir mueve las
// paradas de la ruta origen al final de la destino, suma su personal y cancela la origen.
// Las ODPs no cambian de estado (siguen PROGRAMADA): solo cambian de ruta.
const unirSchema = z.object({ origen_id: z.number().int().positive() }).strict();

export const unirRutas = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const destinoId = Number(req.params.id);
    const user = req.user!;
    const parsed = unirSchema.safeParse(req.body);
    if (!parsed.success) { await t.rollback(); return res.status(400).json({ error: 'Indica la ruta que se va a unir.' }); }
    const origenId = parsed.data.origen_id;
    if (origenId === destinoId) { await t.rollback(); return res.status(400).json({ error: 'No se puede unir una ruta consigo misma.' }); }

    // Bloqueo en orden de id para que dos uniones cruzadas no se bloqueen entre sí.
    const rutas = await RutaInstalacion.findAll({
      where: { id: { [Op.in]: [origenId, destinoId] } },
      order: [['id', 'ASC']],
      transaction: t,
      lock: t.LOCK.UPDATE,
    }) as any[];
    const origen = rutas.find((r) => r.id === origenId);
    const destino = rutas.find((r) => r.id === destinoId);
    if (!origen || !destino) { await t.rollback(); return res.status(404).json({ error: 'Una de las rutas ya no existe. Recarga la pantalla.' }); }
    if (!RUTA_ABIERTA.includes(destino.estado)) {
      await t.rollback();
      return res.status(400).json({ error: `La ruta #${destinoId} ya está ${ESTADO_RUTA_TEXTO[destino.estado] ?? destino.estado}; no puede recibir paradas.` });
    }

    const paradas = await RutaODP.findAll({ where: { ruta_id: origenId }, order: [['orden', 'ASC']], transaction: t }) as any[];
    if (origen.estado !== 'programada' || !paradas.length || paradas.some((p) => p.estado !== 'pendiente')) {
      await t.rollback();
      return res.status(400).json({ error: `La ruta #${origenId} ya empezó o no tiene paradas pendientes. Solo se unen rutas que aún no han salido.` });
    }

    const maxOrden = (await RutaODP.max('orden', { where: { ruta_id: destinoId }, transaction: t })) as number | null;
    let orden = maxOrden ?? 0;
    for (const p of paradas) {
      orden += 1;
      await p.update({ ruta_id: destinoId, orden }, { transaction: t });
    }

    // Personal: la destino conserva el suyo y suma el de la origen. Si la origen tenía otro
    // oficial, entra como instalador: así sigue viendo esas paradas en su app.
    const equipoOrigen: { instalador_id: number }[] = await sequelize.query(
      `SELECT instalador_id FROM ruta_instaladores WHERE ruta_id = :rid`,
      { replacements: { rid: origenId }, type: QueryTypes.SELECT, transaction: t }
    );
    const equipoDestino: { instalador_id: number }[] = await sequelize.query(
      `SELECT instalador_id FROM ruta_instaladores WHERE ruta_id = :rid`,
      { replacements: { rid: destinoId }, type: QueryTypes.SELECT, transaction: t }
    );
    const yaEnDestino = new Set<number>([...equipoDestino.map((e) => e.instalador_id), ...(destino.oficial_id ? [destino.oficial_id] : [])]);
    const sumar = equipoOrigen.map((e) => e.instalador_id);
    if (origen.oficial_id && destino.oficial_id && origen.oficial_id !== destino.oficial_id) sumar.push(origen.oficial_id);
    await insertarInstaladores(destinoId, sumar.filter((id) => !yaEnDestino.has(id)), t);

    const updDestino: Record<string, unknown> = {};
    if (!destino.oficial_id && origen.oficial_id) updDestino.oficial_id = origen.oficial_id;
    if (!destino.conductor_id && origen.conductor_id) updDestino.conductor_id = origen.conductor_id;
    if (!destino.vehiculo_id && origen.vehiculo_id) updDestino.vehiculo_id = origen.vehiculo_id;
    if (origen.observaciones) {
      updDestino.observaciones = [destino.observaciones, origen.observaciones].filter(Boolean).join('\n');
    }
    if (Object.keys(updDestino).length) await destino.update(updDestino, { transaction: t });

    await origen.update({
      estado: 'cancelada',
      observaciones: [origen.observaciones, `Unida a la ruta #${destinoId}`].filter(Boolean).join('\n'),
    }, { transaction: t });

    const ahora = new Date();
    for (const p of paradas) {
      await HistorialEstadoODP.create({
        odp_id: p.odp_id,
        estado_anterior: 'PROGRAMADA',
        estado_nuevo: 'PROGRAMADA',
        usuario_id: user.id,
        fecha: ahora,
        observacion: `Movida de la ruta #${origenId} a la ruta #${destinoId} (rutas unidas)`,
      }, { transaction: t });
    }

    await t.commit();
    emitirCambioRutas();
    res.json({ ok: true, destino_id: destinoId, paradas_movidas: paradas.length });
  } catch (e: any) {
    await t.rollback();
    console.error('unirRutas:', e.message);
    res.status(500).json({ error: 'No se pudieron unir las rutas. Ningún cambio quedó guardado; intenta de nuevo.' });
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
      where: { rol: { [Op.in]: ['instalador', 'conductor'] }, activo: true },
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
    // `separate: true` y la exclusión de `firma_receptor` responden al mismo defecto que
    // INCLUDE_RUTA_COMPLETA (ver la nota extensa allí): sin separate, las colecciones de
    // la ODP se resolvían en un único JOIN cartesiano. El instalador imprime los mismos
    // documentos que el conductor, así que los datos que llegan son idénticos.
    const candidatos = await RutaODP.findAll({
      where: {
        ruta_id: { [Op.in]: ids },
        estado: { [Op.in]: ['en_curso', 'pendiente'] },
      },
      attributes: { exclude: ['firma_receptor'] },
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
            // `order` explícito por el mismo motivo que en INCLUDE_RUTA_COMPLETA:
            // el instalador imprime la SAP y sus ítems deben salir siempre igual.
            { model: ODPItem, as: 'items', separate: true, order: [['id', 'ASC']] },
            { model: Pago, as: 'pagos', separate: true, order: [['id', 'ASC']] },
            { model: TomaMedidas, as: 'tomas_medidas', separate: true, order: [['id', 'ASC']] },
            {
              model: SAP, as: 'saps',
              separate: true,
              order: [['id', 'ASC']],
              include: [
                { model: SAPItem, as: 'items', separate: true, order: [['id', 'ASC']] },
                {
                  model: OrdenCompra, as: 'ordenes_compra',
                  separate: true,
                  order: [['id', 'ASC']],
                  include: [{ model: ODCItem, as: 'items', separate: true, order: [['id', 'ASC']] }]
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
    // Solo desde 'pendiente'. Una parada pausada ya soltó su ODP (2026-10-05): retomar el
    // trabajo es programarla en una ruta nueva, que crea una parada pendiente nueva.
    if (rutaODP.estado !== 'pendiente') {
      await t.rollback();
      const msg = rutaODP.estado === 'pausada'
        ? 'Esta instalación se pausó y salió de la ruta. El jefe debe programarla en una ruta nueva para retomarla.'
        : `Esta parada ya está ${String(rutaODP.estado).replace('_', ' ')}; no se puede iniciar de nuevo.`;
      return res.status(400).json({ error: msg });
    }

    // Verificar que el instalador está asignado a esta ruta (ayudante o oficial)
    if (!(await estaAsignado(rutaODP.ruta_id, user.id, t))) { await t.rollback(); return res.status(403).json({ error: 'No estás asignado a esta ruta' }); }

    await rutaODP.update({
      estado: 'en_curso',
      inicio_instalacion: new Date(),
      fin_instalacion: null,
    }, { transaction: t });

    // ODP → INSTALANDO: el instalador está en obra, el trabajo aún no culmina.
    const odp = await ODP.findByPk(rutaODP.odp_id, { transaction: t }) as any;
    if (odp) {
      const estadoAnteriorODP = odp.getDataValue('estado_produccion');
      await odp.update({ estado_produccion: 'INSTALANDO' }, { transaction: t });
      await HistorialEstadoODP.create({
        odp_id: odp.id,
        estado_anterior: estadoAnteriorODP,
        estado_nuevo: 'INSTALANDO',
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
        estado_nuevo: 'INSTALANDO',
        mensaje: `Instalación de ${odp.numero_odp} iniciada`,
      }).catch(() => {});
    }
    emitirCambioRutas();

    res.json({ ok: true, inicio_instalacion: new Date() });
  } catch (e: any) {
    await t.rollback();
    console.error('iniciarInstalacion:', e.message);
    res.status(500).json({ error: 'Error al iniciar instalación' });
  }
};

// ─── INSTALADOR: Finalizar instalación ───────────────────────────────────────
//
// Incidente del 2026-10-06 (Javier, ODP-24322): la entrega se guardó a las 8:54, pero la
// respuesta no le llegó al celular y la app se quedó "Subiendo…" sin límite. Reintentó 6
// veces: cada intento subía las fotos a Cloudinary (multer corre ANTES del controlador) y
// recibía un 400 que no entendía. De ahí las tres piezas de abajo:
//   1. `prevalidarFinalizacion` corre antes de multer: un intento inválido no sube nada.
//   2. Una parada ya completada responde 200 `ya_registrada`: reintentar es inofensivo.
//   3. Si algo falla DESPUÉS de subir, las fotos se borran de Cloudinary.

// Pueden finalizar cualquier parada sin estar en la ruta (cierre desde la oficina).
const ROLES_FINALIZAN_DESDE_OFICINA = new Set(['root', 'admin', 'gerencia', 'jefe_produccion', 'produccion']);

const horaBogota = (d: Date): string =>
  d.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit' });

const respuestaYaRegistrada = (fin: Date | null) => {
  // es-CO escribe "8:54 a. m.": el punto final ya viene en la hora.
  const hora = fin ? horaBogota(new Date(fin)) : '';
  return {
    ok: true,
    ya_registrada: true,
    fin_instalacion: fin,
    mensaje: hora ? `Esta entrega ya quedó registrada a las ${hora}${hora.endsWith('.') ? '' : '.'}` : 'Esta entrega ya quedó registrada.',
  };
};

const motivoNoFinalizable = (estado: string): string => {
  if (estado === 'pendiente') return 'Primero pulsa "Iniciar" en esta instalación y luego repórtala como entregada.';
  if (estado === 'pausada') return 'Esta instalación se pausó y salió de la ruta. El jefe debe programarla en una ruta nueva.';
  if (estado === 'con_dano') return 'Esta instalación tiene un daño reportado. El jefe de producción debe resolverlo antes de cerrarla.';
  return `Esta instalación está ${estado.replace('_', ' ')} y no se puede reportar como entregada.`;
};

const estaAsignado = async (rutaId: number, usuarioId: number, t?: Transaction): Promise<boolean> => {
  const filas = await sequelize.query(
    `SELECT 1 FROM ruta_instaladores WHERE ruta_id = :rid AND instalador_id = :uid
     UNION
     SELECT 1 FROM rutas_instalacion WHERE id = :rid AND oficial_id = :uid`,
    { replacements: { rid: rutaId, uid: usuarioId }, type: QueryTypes.SELECT, transaction: t }
  );
  return filas.length > 0;
};

/** Borra de Cloudinary las fotos de una entrega que no se registró. Sin esperar: el
 * instalador no tiene por qué aguardar la limpieza, y un fallo aquí solo deja un huérfano. */
const descartarFotosSubidas = (files: unknown): void => {
  for (const f of (Array.isArray(files) ? files : []) as Array<{ filename?: string }>) {
    if (f?.filename) cloudinary.uploader.destroy(f.filename).catch(() => { /* huérfano, sin impacto */ });
  }
};

/** Antes de multer: la parada existe, está en curso y el instalador va en la ruta. */
export const prevalidarFinalizacion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const rutaODP = await RutaODP.findByPk(req.params.id, { attributes: ['id', 'ruta_id', 'estado', 'fin_instalacion'] });
    if (!rutaODP) return res.status(404).json({ error: 'No se encontró esta instalación en la ruta. Recarga la pantalla.' });
    const estado = String(rutaODP.get('estado'));
    if (estado === 'completada') return res.json(respuestaYaRegistrada(rutaODP.get('fin_instalacion') as Date | null));
    if (estado !== 'en_curso') return res.status(400).json({ error: motivoNoFinalizable(estado) });
    if (!ROLES_FINALIZAN_DESDE_OFICINA.has(String(user.rol)) && !(await estaAsignado(Number(rutaODP.get('ruta_id')), user.id))) {
      return res.status(403).json({ error: 'No estás asignado a esta ruta.' });
    }
    next();
  } catch (e: any) {
    console.error('prevalidarFinalizacion:', e.message);
    res.status(500).json({ error: 'No se pudo verificar la instalación. Intenta de nuevo en un momento.' });
  }
};

/** multer con errores legibles: sin esto, una foto de 12 MB o un HEIC devolvían la
 * página HTML de error de Express y la app mostraba un mensaje genérico. */
export const subirFotosEntrega = (req: Request, res: Response, next: NextFunction) => {
  uploadConfig.array('fotos', 10)(req, res, (err: any) => {
    if (!err) return next();
    descartarFotosSubidas(req.files);
    const mensaje = err.code === 'LIMIT_FILE_SIZE'
      ? 'Una de las fotos pesa más de 10 MB. Tómala de nuevo o elige otra.'
      : err.code === 'LIMIT_UNEXPECTED_FILE'
        ? 'Se admiten máximo 10 fotos por entrega.'
        : /format/i.test(String(err.message))
          ? 'Formato de foto no admitido. Usa fotos JPG o PNG.'
          : 'No se pudieron subir las fotos. Revisa tu señal e intenta de nuevo.';
    console.error('subirFotosEntrega:', err.code ?? '', err.message);
    res.status(400).json({ error: mensaje });
  });
};

/** Estado de una parada, liviano: lo consulta la app cuando se pierde la respuesta de
 * "finalizar" para saber si la entrega sí quedó. */
export const getEstadoParada = async (req: Request, res: Response) => {
  try {
    const rutaODP = await RutaODP.findByPk(req.params.id, { attributes: ['id', 'estado', 'fin_instalacion'] });
    if (!rutaODP) return res.status(404).json({ error: 'No se encontró esta instalación.' });
    res.json(rutaODP);
  } catch (e: any) {
    console.error('getEstadoParada:', e.message);
    res.status(500).json({ error: 'No se pudo consultar la instalación.' });
  }
};

export const finalizarInstalacion = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params; // ruta_odp.id
    const user = req.user!;
    const { gps, datos_receptor, firma_receptor } = req.body;

    // Revalidado dentro de la transacción: dos envíos simultáneos pasan los dos la
    // prevalidación, pero solo el primero encuentra la parada en curso.
    const rutaODP = await RutaODP.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE }) as any;
    if (!rutaODP) {
      await t.rollback(); descartarFotosSubidas(req.files);
      return res.status(404).json({ error: 'No se encontró esta instalación en la ruta. Recarga la pantalla.' });
    }
    if (rutaODP.estado === 'completada') {
      await t.rollback(); descartarFotosSubidas(req.files);
      return res.json(respuestaYaRegistrada(rutaODP.fin_instalacion));
    }
    if (rutaODP.estado !== 'en_curso') {
      await t.rollback(); descartarFotosSubidas(req.files);
      return res.status(400).json({ error: motivoNoFinalizable(rutaODP.estado) });
    }

    const fotos = req.files as Express.Multer.File[];
    if (!fotos || fotos.length === 0) { await t.rollback(); return res.status(400).json({ error: 'Se requiere al menos una foto de evidencia' }); }

    const ahora = new Date();

    // Actualizar ruta_odp
    await rutaODP.update({
      estado: 'completada',
      fin_instalacion: ahora,
      datos_receptor: datos_receptor || null,
      firma_receptor: firma_receptor || null,
      gps_finalizacion: gps || null,
    }, { transaction: t });

    // Crear N evidencias formales (una por foto)
    for (const file of fotos) {
      await EvidenciaInstalacion.create({
        odp_id: rutaODP.odp_id,
        instalador_id: user.id,
        tipo_evidencia: 'foto',
        archivo_url: (file as any).path,
        gps: gps || null,
        datos_firmante: datos_receptor || null,
      }, { transaction: t });
    }

    // ODP → ENTREGADA
    const odp = await ODP.findByPk(rutaODP.odp_id, { transaction: t }) as any;
    if (odp) {
      await odp.update({ estado_produccion: 'ENTREGADA' }, { transaction: t });
      await HistorialEstadoODP.create({
        odp_id: odp.id,
        estado_anterior: 'INSTALANDO',
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
    await cerrarRutaSiSinPendientes(rutaODP.ruta_id, ahora, t);

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
    emitirCambioRutas();

    res.json({ ok: true, fin_instalacion: ahora });
  } catch (e: any) {
    await t.rollback();
    descartarFotosSubidas(req.files);
    console.error('finalizarInstalacion:', e.message);
    res.status(500).json({ error: 'No se pudo registrar la entrega. Intenta de nuevo; las fotos no quedaron guardadas.' });
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
    if (!(await estaAsignado(rutaODP.ruta_id, user.id))) return res.status(403).json({ error: 'No estás asignado a esta ruta' });

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
    emitirCambioRutas();

    res.json({ ok: true, mensaje: 'Daño registrado correctamente' });
  } catch (e: any) {
    console.error('reportarDano:', e.message);
    res.status(500).json({ error: 'Error al registrar el daño' });
  }
};

// ─── CONDUCTOR: Mi ruta ───────────────────────────────────────────────────────

// Devuelve SOLO las rutas activas + las métricas ya agregadas en SQL.
//
// Antes traía todo el histórico con el include completo: medido el 2026-08-01, un
// conductor con 161 rutas completadas y CERO activas descargaba 2.523 KB en 5.870 ms
// para pintar un tab "Asignación Activa" vacío. Y `ConductorView` reengancha esta carga
// a `useDataChangedSocket('compras')`, así que cada movimiento en Compras la repetía.
//
// El filtro es por ESTADO, no por `fecha_programada = hoy`: `rutas_instalacion` no tiene
// fecha propia (vive en `ruta_odp.fecha_programada`), y filtrar por fecha estricta haría
// desaparecer una ruta de ayer que quedó sin cerrar, dejando al conductor sin forma de
// finalizarla. Por estado el ahorro es el mismo —7 rutas activas en todo el sistema— sin
// ese riesgo operativo.
//
// Las métricas se calculan con COUNT en el servidor en vez de contar 161 rutas en el
// navegador; el histórico se pide aparte, al abrir su tab (getMiHistorialConductor).
export const getMiRutaConductor = async (req: Request, res: Response) => {
  try {
    const user = req.user!;

    const includes = await INCLUDE_RUTA_COMPLETA();
    const activas = await RutaInstalacion.findAll({
      where: {
        conductor_id: user.id,
        estado: { [Op.notIn]: ['cancelada', 'completada'] },
      },
      include: includes,
      order: [['creado_en', 'DESC']],
    });

    // Mismos números que calculaba el frontend sobre el array completo:
    // totalRutas/rutasTerminadas excluyen canceladas; efectividad = paradas con llegada
    // registrada sobre el total de paradas; rutasMes usa el mes calendario en curso.
    const [m]: any[] = await sequelize.query(
      `SELECT
         count(DISTINCT r.id)::int                                             AS total_rutas,
         count(DISTINCT r.id) FILTER (WHERE r.estado = 'completada')::int      AS rutas_terminadas,
         count(DISTINCT r.id) FILTER (
           WHERE date_trunc('month', ${horaBogotaSQL('r.creado_en')}) = date_trunc('month', ${HOY_BOGOTA_SQL})
         )::int                                                                AS rutas_mes,
         count(ro.id)::int                                                     AS total_paradas,
         count(ro.id) FILTER (WHERE ro.llegada_conductor IS NOT NULL)::int     AS paradas_llegadas
       FROM rutas_instalacion r
       LEFT JOIN ruta_odp ro ON ro.ruta_id = r.id
       WHERE r.conductor_id = :uid AND r.estado <> 'cancelada'`,
      { replacements: { uid: user.id }, type: QueryTypes.SELECT }
    );

    res.json({
      activas,
      metricas: {
        totalRutas: m.total_rutas,
        rutasTerminadas: m.rutas_terminadas,
        rutasMes: m.rutas_mes,
        totalParadas: m.total_paradas,
        paradasLlegadas: m.paradas_llegadas,
      },
    });
  } catch (e: any) {
    console.error('getMiRutaConductor FULL ERROR:', e);
    res.status(500).json({ error: 'Error al obtener rutas', details: e.message });
  }
};

// Tab "Rutas Realizadas" del conductor: carga diferida y con payload ligero.
// Se pide solo al abrir el tab, no en el arranque de la pantalla.
export const getMiHistorialConductor = async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const rutas = await RutaInstalacion.findAll({
      where: { conductor_id: user.id, estado: 'completada' },
      include: INCLUDE_RUTA_CONDUCTOR_HISTORIAL(),
      order: [['creado_en', 'DESC']],
      limit,
      offset,
    });
    res.json(rutas);
  } catch (e: any) {
    console.error('getMiHistorialConductor:', e.message);
    res.status(500).json({ error: 'Error al obtener el historial de rutas' });
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
    emitirCambioRutas();
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
    emitirCambioRutas();
    res.json({ ok: true, llegada_conductor: rutaODP.llegada_conductor });
  } catch (e) {
    res.status(500).json({ error: 'Error al registrar llegada' });
  }
};

// ─── OFICIAL / JEFE: Pausar instalación en curso ─────────────────────────────
// Pausar SACA la ODP de la ruta (decisión del 2026-10-05): la ODP vuelve a LISTO_INSTALAR
// y reaparece en su bandeja para programarse en una ruta nueva; la parada queda en
// 'pausada' solo como registro (motivo y horas). Si era la última parada viva, la ruta
// se cierra. Antes la parada pausada seguía "ocupando" la ruta: la ODP no salía en
// ninguna bandeja y la ruta quedaba en curso para siempre (rutas #393 y #505).

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
        estado_anterior: 'INSTALANDO',
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
        mensaje: `Instalación de ${odp.numero_odp} pausada — vuelve a la bandeja para reprogramar`,
      }).catch(() => {});
    }

    await cerrarRutaSiSinPendientes(rutaODP.ruta_id, ahora, t);

    await t.commit();
    emitirCambioRutas();
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

    // Las pausadas son registro histórico desde el 2026-10-05: solo se muestran mientras su
    // ODP sigue esperando reprogramarse (LISTO_INSTALAR). Sin este filtro la sección
    // "Pausadas" acumularía todas las pausas viejas del instalador.
    const asignacion = await RutaODP.findAll({
      where: {
        ruta_id: { [Op.in]: ids },
        [Op.or]: [
          { estado: { [Op.in]: ['pendiente', 'en_curso', 'con_dano'] } },
          { estado: 'pausada', '$odp.estado_produccion$': 'LISTO_INSTALAR' },
        ],
      },
      // Vista de gestión del jefe: no muestra la firma del receptor. Ver nota en
      // INCLUDE_RUTA_COMPLETA sobre por qué se excluye y sobre `separate`.
      attributes: { exclude: ['firma_receptor'] },
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
            { model: Pago, as: 'pagos', separate: true, order: [['id', 'ASC']], attributes: ['id', 'odp_id', 'monto', 'metodo_pago', 'fecha'] },
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
          estado_produccion: { [Op.in]: ['PROGRAMADA', 'INSTALANDO', 'INSTALADA'] },
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

        // Si era ODP de reproceso → reactivar el padre pausado (igual que finalizarInstalacion
        // y entregarAtascada). Sin esto, un acarreo de reproceso deja al padre huérfano en
        // PAUSADA para siempre — mismo bug que ODP-23925/NC-0005.
        if (odp.es_no_conformidad && odp.odp_padre_id) {
          const padre = await ODP.findByPk(odp.odp_padre_id) as any;
          if (padre && padre.estado_produccion === 'PAUSADA') {
            await padre.update({ estado_produccion: 'INSTALADA' });
            await HistorialEstadoODP.create({
              odp_id: padre.id,
              estado_anterior: 'PAUSADA',
              estado_nuevo: 'INSTALADA',
              usuario_id: user.id,
              fecha: finRuta,
              observacion: `Reactivada: reproceso ${odp.numero_odp} completado (acarreo)`,
            });
          }
        }

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
    emitirCambioRutas();

    res.json({ ok: true, fin_ruta: finRuta });
  } catch (e: any) {
    console.error('terminarRutaConductor:', e.message);
    res.status(500).json({ error: 'Error al finalizar ruta' });
  }
};

// ─── JEFE: instalaciones sin cerrar ──────────────────────────────────────────
// Desde la separación de estados (2026-09-02) hay dos situaciones distintas que dejan
// una instalación "viva" y que este panel rescata:
//
//   a) La ODP no ha terminado.  INSTALANDO (el instalador entró a la obra y nunca
//      finalizó) o PROGRAMADA con la fecha ya vencida. La orden sigue abierta.
//
//   b) La ODP terminó pero su ruta quedó mal cerrada.  Está en INSTALADA —trabajo
//      culminado— y aun así arrastra una parada de ruta abierta: un daño sin resolver
//      o una parada que quedó pendiente. (Una parada 'pausada' ya no cuenta como abierta
//      desde el 2026-10-05: pausar saca la ODP de la ruta.) El trabajo está
//      hecho, pero el historial de instalaciones queda sucio.
//
// Una ODP en INSTALADA sin ninguna parada abierta NO entra: es una instalación marcada
// como terminada (a mano, o por la reactivación de un reproceso) y no le falta nada.
// ENTREGADA tampoco entra nunca: es el cierre definitivo.

export const getODPsAtascadas = async (_req: Request, res: Response) => {
  try {
    const filas = await sequelize.query(
      // Una sola parada por ODP: la "viva" manda sobre las cerradas, y entre iguales la
      // más reciente. Sin esto, una ODP con 5 paradas aparecería 5 veces.
      `WITH parada AS (
         SELECT DISTINCT ON (ro.odp_id)
                ro.odp_id, ro.id AS ruta_odp_id, ro.estado AS estado_parada,
                ro.fecha_programada, ro.motivo_pausa, ro.descripcion_dano,
                ri.id AS ruta_id, ri.estado AS estado_ruta, ri.fin_ruta
           FROM ruta_odp ro
           JOIN rutas_instalacion ri ON ri.id = ro.ruta_id
          ORDER BY ro.odp_id,
                   CASE ro.estado
                     WHEN 'en_curso'  THEN 1
                     WHEN 'con_dano'  THEN 2
                     WHEN 'pendiente' THEN 3
                     ELSE 4
                   END,
                   ro.id DESC
       )
       SELECT o.id AS odp_id, o.numero_odp, o.estado_produccion,
              o.instalacion, o.acarreo, o.es_no_conformidad, o.direccion_instalacion,
              o.estado_facturacion, o.estado_caja,
              c.nombre_razon_social AS cliente,
              u.nombre_completo AS asesor,
              p.ruta_odp_id, p.estado_parada, p.ruta_id, p.estado_ruta,
              p.fecha_programada, p.motivo_pausa, p.descripcion_dano,
              (${HOY_BOGOTA_SQL} - p.fecha_programada) AS dias_vencida,
              CASE
                WHEN o.estado_produccion = 'INSTALANDO'                 THEN 'INICIADA_SIN_FINALIZAR'
                WHEN p.estado_parada = 'con_dano'                       THEN 'DANO_SIN_RESOLVER'
                WHEN p.estado_parada = 'pendiente'
                     AND p.estado_ruta = 'completada'                   THEN 'RUTA_CERRADA_SIN_INSTALAR'
                WHEN p.estado_parada = 'pendiente'                      THEN 'PARADA_VENCIDA'
                WHEN p.ruta_odp_id IS NULL                              THEN 'SIN_RUTA'
                ELSE 'PARADA_VENCIDA'
              END AS motivo
         FROM odp o
         LEFT JOIN parada p ON p.odp_id = o.id
         LEFT JOIN clientes c ON c.id = o.cliente_id
         LEFT JOIN usuarios u ON u.id = o.asesor_id
        WHERE (
                -- (a) La orden no ha terminado
                o.estado_produccion = 'INSTALANDO'
             OR (o.estado_produccion = 'PROGRAMADA'
                 AND (p.ruta_odp_id IS NULL
                   OR p.estado_ruta = 'cancelada'
                   OR p.fecha_programada < ${HOY_BOGOTA_SQL}))
                -- (b) Terminó, pero dejó una parada de ruta abierta
             OR (o.estado_produccion = 'INSTALADA'
                 AND p.estado_parada IN ('pendiente', 'en_curso', 'con_dano'))
          )
        ORDER BY p.fecha_programada ASC NULLS FIRST, o.numero_odp`,
      { type: QueryTypes.SELECT }
    );
    res.json(filas);
  } catch (e: any) {
    console.error('getODPsAtascadas:', e.message);
    res.status(500).json({ error: 'Error al obtener instalaciones sin cerrar' });
  }
};

// Estados desde los que el panel puede actuar sobre una ODP.
// INSTALADA entra porque una orden ya terminada puede seguir arrastrando una parada de
// ruta abierta; cerrarla desde aquí la lleva a ENTREGADA y limpia esa parada.
const ESTADOS_RESCATABLES = ['PROGRAMADA', 'INSTALANDO', 'INSTALADA'];

/**
 * Localiza la parada que estaría bloqueando el cierre de una ODP, si existe.
 * Devuelve null cuando la ODP no tiene ruta (12 de los casos históricos llegaron a
 * INSTALADA sin pasar nunca por una), y por eso ambas acciones operan por odp_id: la
 * parada es opcional, la ODP no.
 */
const buscarParadaActiva = async (odpId: number, t: Transaction) => {
  const filas: any[] = await sequelize.query(
    `SELECT ro.id
       FROM ruta_odp ro
       JOIN rutas_instalacion ri ON ri.id = ro.ruta_id
      WHERE ro.odp_id = :odpId
        AND ro.estado IN ('pendiente', 'en_curso', 'con_dano')
      ORDER BY CASE ro.estado
                 WHEN 'en_curso'  THEN 1
                 WHEN 'con_dano'  THEN 2
                 ELSE 3
               END,
               ro.id DESC
      LIMIT 1`,
    { replacements: { odpId }, type: QueryTypes.SELECT, transaction: t }
  );
  if (!filas.length) return null;
  return await RutaODP.findByPk(filas[0].id, { transaction: t }) as any;
};

// JEFE: reprogramar una instalación sin cerrar → vuelve a LISTO_INSTALAR para rearmar ruta.
// Cierra la parada que la bloqueaba (si la hay) para que no reaparezca en el panel.
export const reprogramarAtascada = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { odpId } = req.params;
    const user = req.user!;
    const motivo: string | undefined = req.body?.motivo?.trim() || undefined;

    const odp = await ODP.findByPk(odpId, { transaction: t }) as any;
    if (!odp) { await t.rollback(); return res.status(404).json({ error: 'ODP no encontrada' }); }

    const estadoAnterior = odp.getDataValue('estado_produccion');
    // Revalidado dentro de la transacción: si otro jefe la movió mientras tanto, no la pisamos.
    if (!ESTADOS_RESCATABLES.includes(estadoAnterior)) {
      await t.rollback();
      return res.status(400).json({
        error: `Esta ODP ya no está pendiente de cierre (ahora está en ${estadoAnterior}). Actualiza la lista.`,
      });
    }

    const ahora = new Date();
    const parada = await buscarParadaActiva(Number(odpId), t);
    if (parada) {
      await parada.update({ estado: 'completada', fin_instalacion: ahora }, { transaction: t });
      await cerrarRutaSiSinPendientes(parada.ruta_id, ahora, t);
    }

    await odp.update({ estado_produccion: 'LISTO_INSTALAR' }, { transaction: t });
    await HistorialEstadoODP.create({
      odp_id: odp.id,
      estado_anterior: estadoAnterior,
      estado_nuevo: 'LISTO_INSTALAR',
      usuario_id: user.id,
      fecha: ahora,
      observacion: motivo
        ? `Reprogramada desde "Pendientes de cierre": ${motivo}`
        : `Reprogramada desde "Pendientes de cierre"${parada ? ` (ruta #${parada.ruta_id} no la cerró)` : ' (no tenía ruta asociada)'}`,
    }, { transaction: t });

    await t.commit();

    notificarCambioEstadoODP({
      numero_odp: odp.numero_odp,
      odp_id: odp.id,
      asesor_id: odp.asesor_id,
      estado_nuevo: 'LISTO_INSTALAR',
      mensaje: `${odp.numero_odp} reprogramada — lista para nueva ruta`,
    }).catch(() => {});
    emitirODPPatch(Number(odpId), 'update').catch(() => {});
    emitirCambioRutas();

    res.json({ ok: true });
  } catch (e: any) {
    await t.rollback();
    console.error('reprogramarAtascada:', e.message);
    res.status(500).json({ error: 'Error al reprogramar ODP' });
  }
};

// JEFE: cerrar administrativamente una instalación sin registrar (sí se instaló, pero el
// instalador nunca la finalizó en la app). Replica el cierre de finalizarInstalacion sin
// exigir evidencia fotográfica, a cambio de un motivo obligatorio que queda en el historial.
export const entregarAtascada = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { odpId } = req.params;
    const user = req.user!;
    const motivo: string = (req.body?.motivo ?? '').trim();

    // El motivo es la única trazabilidad de un cierre sin foto ni firma: sin él no se cierra.
    if (motivo.length < 5) {
      await t.rollback();
      return res.status(400).json({
        error: 'Indica el motivo del cierre (mínimo 5 caracteres). Queda registrado en el historial de la ODP.',
      });
    }

    const odp = await ODP.findByPk(odpId, { transaction: t }) as any;
    if (!odp) { await t.rollback(); return res.status(404).json({ error: 'ODP no encontrada' }); }

    const estadoAnterior = odp.getDataValue('estado_produccion');
    // Revalidado dentro de la transacción: evita que dos jefes la cierren a la vez.
    if (!ESTADOS_RESCATABLES.includes(estadoAnterior)) {
      await t.rollback();
      return res.status(400).json({
        error: `Esta ODP ya no está pendiente de cierre (ahora está en ${estadoAnterior}). Actualiza la lista.`,
      });
    }

    const ahora = new Date();
    const parada = await buscarParadaActiva(Number(odpId), t);
    if (parada) {
      await parada.update({ estado: 'completada', fin_instalacion: ahora }, { transaction: t });
      await cerrarRutaSiSinPendientes(parada.ruta_id, ahora, t);
    }

    await odp.update({ estado_produccion: 'ENTREGADA' }, { transaction: t });
    await HistorialEstadoODP.create({
      odp_id: odp.id,
      estado_anterior: estadoAnterior,
      estado_nuevo: 'ENTREGADA',
      usuario_id: user.id,
      fecha: ahora,
      observacion: `Cierre administrativo desde "Pendientes de cierre"${parada ? ` (ruta #${parada.ruta_id})` : ' (sin ruta asociada)'}: ${motivo}`,
    }, { transaction: t });

    // Si era ODP de reproceso → reactivar el padre pausado (igual que finalizarInstalacion)
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
          observacion: `Reactivada: reproceso ${odp.numero_odp} entregado`,
        }, { transaction: t });
      }
    }

    await t.commit();

    notificarCambioEstadoODP({
      numero_odp: odp.numero_odp,
      odp_id: odp.id,
      asesor_id: odp.asesor_id,
      estado_nuevo: 'ENTREGADA',
      mensaje: `${odp.numero_odp} marcada como entregada`,
    }).catch(() => {});
    emitirODPPatch(Number(odpId), 'update').catch(() => {});
    if (odp.odp_padre_id) emitirODPPatch(Number(odp.odp_padre_id), 'update').catch(() => {});
    emitirCambioRutas();

    res.json({ ok: true });
  } catch (e: any) {
    await t.rollback();
    console.error('entregarAtascada:', e.message);
    res.status(500).json({ error: 'Error al marcar entregada' });
  }
};
