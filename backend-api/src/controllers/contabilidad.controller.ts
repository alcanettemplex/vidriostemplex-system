import { Request, Response } from 'express';
import { z } from 'zod';
import { Op } from 'sequelize';
import { ODP, Cliente, Usuario, Pago, FacturaAdicionalODP, sequelize } from '../models';

// Helper: recalcula abono/pendiente/estado_caja de una ODP a partir de sus pagos actuales
const recalcularFinanciero = async (odp_id: number, t: any) => {
  const odp = await ODP.findByPk(odp_id, { transaction: t });
  if (!odp) throw new Error('ODP no encontrada');

  const pagos = await Pago.findAll({ where: { odp_id }, transaction: t, attributes: ['monto'] });
  const nuevoAbono = (pagos as any[]).reduce((s, p) => s + Number(p.getDataValue('monto') || 0), 0);
  const valorTotal = Number(odp.getDataValue('valor_total')) || 0;
  const nuevoPendiente = Math.max(0, valorTotal - nuevoAbono);
  const estadoActual: string = odp.getDataValue('estado_caja');

  let nuevoEstadoCaja = estadoActual;
  if (estadoActual !== 'CREDITO_APROBADO') {
    if (nuevoPendiente <= 0) nuevoEstadoCaja = 'CANCELADO';
    else if (nuevoAbono > 0) nuevoEstadoCaja = 'ABONADO';
    else nuevoEstadoCaja = 'PENDIENTE';
  } else {
    if (nuevoPendiente <= 0) nuevoEstadoCaja = 'CANCELADO';
  }

  await odp.update({ abono: nuevoAbono, pendiente: nuevoPendiente, estado_caja: nuevoEstadoCaja }, { transaction: t });
  return { abono: nuevoAbono, pendiente: nuevoPendiente, estado_caja: nuevoEstadoCaja };
};

const pagoSchema = z.object({
  odp_id: z.number().int().positive('ODP requerida'),
  monto: z.number().positive('El monto debe ser mayor a 0'),
  diferencia: z.number().min(0).optional().default(0), // Descuento adicional que reduce pendiente pero no cuenta en abono
  metodo_pago: z.string().min(1, 'El método de pago es requerido'),
  referencia_pago: z.string().optional(),
  observaciones: z.string().optional(),
  fecha: z.string().optional(), // ISO date string YYYY-MM-DD; si no se envía usa NOW
});

// ─── Búsqueda ────────────────────────────────────────────────────────────────
// La BD no tiene la extensión `unaccent`: `translate()` es nativo de Postgres y quita las
// tildes sin migración. El término llega ya normalizado igual desde normalizarTermino().
const sinTildes = (expr: string) =>
  `translate(lower(coalesce(${expr}, '')), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc')`;

const normalizarTermino = (q: string) =>
  q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Patrón LIKE seguro: escapa los comodines con '!' y lo pasa por sequelize.escape (no se
// concatena texto del usuario sin escapar).
const patronLike = (termino: string) =>
  sequelize.escape(`%${termino.replace(/[!%_]/g, (c) => `!${c}`)}%`);

/**
 * Condición SQL "esta ODP coincide con el término": número de ODP, FE principal y
 * adicionales, cliente (nombre y NIT, también sin puntos ni guiones) y asesor.
 * Es la única fuente de la regla de búsqueda: la usan /odps (sobre "ODP"."id") y
 * /pagos (sobre "Pago"."odp_id"), para que ambas encuentren exactamente lo mismo.
 */
const condicionBusquedaODP = (odpIdExpr: string, q: string): string => {
  const termino = normalizarTermino(q);
  const like = patronLike(termino);
  const digitos = q.replace(/\D/g, '');
  const porNitSinFormato = digitos.length >= 3
    ? `OR regexp_replace(coalesce(c.numero_documento, ''), '\\D', '', 'g') LIKE ${patronLike(digitos)} ESCAPE '!'`
    : '';
  return `EXISTS (
    SELECT 1 FROM odp o
    LEFT JOIN clientes c ON c.id = o.cliente_id
    LEFT JOIN usuarios u ON u.id = o.asesor_id
    WHERE o.id = ${odpIdExpr} AND (
      ${sinTildes('o.numero_odp')} LIKE ${like} ESCAPE '!'
      OR ${sinTildes('o.factura_electronica')} LIKE ${like} ESCAPE '!'
      OR ${sinTildes('c.nombre_razon_social')} LIKE ${like} ESCAPE '!'
      OR ${sinTildes('c.numero_documento')} LIKE ${like} ESCAPE '!'
      ${porNitSinFormato}
      OR ${sinTildes('u.nombre_completo')} LIKE ${like} ESCAPE '!'
      OR EXISTS (
        SELECT 1 FROM facturas_adicionales_odp f
        WHERE f.odp_id = o.id AND ${sinTildes('f.numero_fe')} LIKE ${like} ESCAPE '!'
      )
    )
  )`;
};

// Proceso Completado = ODP (no OA) con FE registrada y caja CANCELADO. Misma regla que
// pestanaDeODP() en el frontend (features/contabilidad/components/contabilidad.utils.ts).
const SQL_COMPLETADA = `("ODP"."tipo_odp" <> 'OA' AND coalesce("ODP"."factura_electronica", '') <> '' AND "ODP"."estado_caja" = 'CANCELADO')`;

const terminoSchema = z.string().trim().min(2, 'Escribe al menos 2 caracteres para buscar').max(100);

const odpsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  page: z.coerce.number().int().min(1).optional(),
  estado_caja: z.string().max(30).optional(),
  estado_facturacion: z.string().max(30).optional(),
  tipo_odp: z.string().max(10).optional(),
  q: terminoSchema.optional(),
  // operativa: todo lo que NO es Proceso Completado (Estado Caja + OA) — es el listado
  // de trabajo y cabe completo. completado: la pestaña paginada del histórico.
  vista: z.enum(['operativa', 'completado']).optional(),
  orden: z.enum(['numero_odp', 'fecha_creacion', 'cliente', 'asesor', 'estado_produccion', 'factura_electronica', 'monto_total', 'abono', 'pendiente']).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
}).strict();

const pagosQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  page: z.coerce.number().int().min(1).optional(),
  q: terminoSchema.optional(),
}).strict();

const mensajeQueryInvalida = (error: z.ZodError) =>
  error.issues[0]?.message || 'Los filtros de búsqueda no son válidos.';

/**
 * Resumen financiero global para el módulo de contabilidad.
 */
export const getResumenFinanciero = async (_req: Request, res: Response) => {
  try {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Totales generales
    const totalAbonado = (await ODP.sum('abono')) || 0;

    // Pendiente real
    const odpsActivas = await ODP.findAll({
      where: { estado_caja: { [Op.notIn]: ['CANCELADO'] } },
      attributes: ['valor_total', 'abono'],
    });
    const totalPendiente = odpsActivas.reduce((sum, o) => {
      return sum + Math.max(0, Number(o.getDataValue('valor_total') || 0) - Number(o.getDataValue('abono') || 0));
    }, 0);

    const totalFacturadas = await ODP.count({
      where: {
        tipo_odp: 'ODP',
        [Op.or]: [
          { estado_facturacion: 'FACTURADA' },
          { factura_electronica: { [Op.ne]: null } },
        ],
      },
    });
    const totalPendFactura = await ODP.count({
      where: {
        tipo_odp: 'ODP',
        estado_facturacion: 'PENDIENTE',
        factura_electronica: null,
        es_no_conformidad: false,
        es_garantia: false,
      },
    });

    const abonoMes = (await ODP.sum('abono', { where: { fecha_creacion: { [Op.gte]: firstDayOfMonth } } })) || 0;
    const pendienteMes = (await ODP.sum('pendiente', { where: { fecha_creacion: { [Op.gte]: firstDayOfMonth } } })) || 0;

    const fmtCurrency = (n: number) =>
      new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

    // Cartera vencida
    const carteraVencidaRecords = await ODP.findAll({
      where: {
        pendiente: { [Op.gt]: 0 },
        estado_caja: { [Op.notIn]: ['CANCELADO'] },
        [Op.or]: [
          { fecha_entrega: { [Op.lt]: today }, estado_caja: { [Op.notIn]: ['CANCELADO', 'CREDITO_APROBADO'] } },
          { estado_caja: 'CREDITO_APROBADO', fecha_vencimiento_credito: { [Op.lt]: today, [Op.ne]: null } },
        ],
      },
      // Sin límite de filas, así que solo las columnas que usa el detalle (egress).
      attributes: ['id', 'numero_odp', 'pendiente', 'estado_caja', 'fecha_entrega', 'fecha_vencimiento_credito', 'fecha_creacion', 'factura_electronica'],
      include: [
        { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social', 'numero_documento'] },
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
      ],
      // Sin límite: con el antiguo `limit: 15` la pestaña mostraba 15 ODPs mientras el total
      // en rojo (totalCarteraVencida, sin límite) sumaba todas — 28 el 2026-10-03.
      order: [['fecha_entrega', 'ASC']],
    });

    const totalCarteraVencida = await ODP.sum('pendiente', {
      where: {
        pendiente: { [Op.gt]: 0 },
        estado_caja: { [Op.notIn]: ['CANCELADO'] },
        [Op.or]: [
          { fecha_entrega: { [Op.lt]: today }, estado_caja: { [Op.notIn]: ['CANCELADO', 'CREDITO_APROBADO'] } },
          { estado_caja: 'CREDITO_APROBADO', fecha_vencimiento_credito: { [Op.lt]: today, [Op.ne]: null } },
        ],
      },
    });

    const carteraDetalle = carteraVencidaRecords.map((odp: any) => {
      const esCreditoVencido = odp.estado_caja === 'CREDITO_APROBADO';
      const fechaRefStr = esCreditoVencido ? odp.fecha_vencimiento_credito : odp.fecha_entrega;
      const todayTime = new Date().setHours(0,0,0,0);
      const fechaRef = fechaRefStr ? new Date(fechaRefStr) : new Date(todayTime);
      fechaRef.setHours(0,0,0,0);
      
      const diffTime = todayTime - fechaRef.getTime();
      const diffDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

      return {
        id: odp.id,
        odp: odp.numero_odp,
        cliente: odp.cliente?.nombre_razon_social || 'Sin cliente',
        nit: odp.cliente?.numero_documento || null,
        factura_electronica: odp.factura_electronica || null,
        asesor: odp.asesor?.nombre_completo || '—',
        pendiente: fmtCurrency(Number(odp.pendiente) || 0),
        dias_vencido: diffDays,
        tipo_vencimiento: esCreditoVencido ? 'credito' : 'entrega',
        fecha_creacion: odp.fecha_creacion,
      };
    }).sort((a, b) => b.dias_vencido - a.dias_vencido); // las más vencidas primero

    const pagosRecientes = await Pago.findAll({
      include: [
        { 
          model: ODP, 
          as: 'odp', 
          attributes: ['id', 'numero_odp', 'fecha_creacion', 'cliente_id', 'asesor_id'],
          include: [
            { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] },
            { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] }
          ]
        },
        { model: Usuario, as: 'registrador', attributes: ['id', 'nombre_completo'] },
      ],
      order: [['fecha', 'DESC']],
      limit: 10,
    });

    res.json({
      total_abonado: fmtCurrency(Number(totalAbonado) || 0),
      total_pendiente: fmtCurrency(Number(totalPendiente) || 0),
      total_facturadas: totalFacturadas,
      pendientes_factura: totalPendFactura,
      abono_mes: fmtCurrency(Number(abonoMes) || 0),
      pendiente_mes: fmtCurrency(Number(pendienteMes) || 0),
      cartera_vencida: fmtCurrency(Number(totalCarteraVencida) || 0),
      cartera_detalle: carteraDetalle,
      pagos_recientes: pagosRecientes,
    });
  } catch (error) {
    console.error('Error en resumen financiero:', error);
    res.status(500).json({ error: 'Error al calcular resumen financiero' });
  }
};

/**
 * Lista ODPs para el módulo de contabilidad.
 *
 * - `vista=operativa`: todo lo que no es Proceso Completado (Estado Caja + Órdenes Azules).
 *   Es el listado de trabajo; cabe completo en una página (155 filas el 2026-10-03).
 * - `vista=completado`: el histórico de Proceso Completado, paginado y ordenado en el
 *   servidor — crece con cada ODP cerrada y ya no cabía en el corte de 500 (89 ODPs de
 *   abril 2026 quedaban fuera, 2026-10-03).
 * - `q`: búsqueda en toda la BD (ODP, FE, cliente, NIT, asesor), ver condicionBusquedaODP().
 * Sin `vista` devuelve todas, como antes (lo usa el buscador maestro junto con `q`).
 */
export const getContabilidadODPs = async (req: Request, res: Response) => {
  const parsed = odpsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: mensajeQueryInvalida(parsed.error) });
  }
  const { estado_caja, estado_facturacion, tipo_odp, q, vista, orden, dir } = parsed.data;
  const limit = parsed.data.limit ?? 200;
  const page = parsed.data.page ?? 1;
  const offset = (page - 1) * limit;

  try {
    const where: any = {};
    if (estado_caja) where.estado_caja = estado_caja;
    if (estado_facturacion) where.estado_facturacion = estado_facturacion;
    if (tipo_odp) where.tipo_odp = tipo_odp;

    const condiciones: any[] = [];
    if (vista === 'completado') condiciones.push(sequelize.literal(SQL_COMPLETADA));
    if (vista === 'operativa') condiciones.push(sequelize.literal(`NOT ${SQL_COMPLETADA}`));
    if (q) condiciones.push(sequelize.literal(condicionBusquedaODP('"ODP"."id"', q)));
    if (condiciones.length) where[Op.and] = condiciones;

    const sentido = dir === 'desc' ? 'DESC' : 'ASC';
    const ordenPorColumna: Record<string, any> = {
      numero_odp: ['numero_odp', sentido],
      fecha_creacion: ['fecha_creacion', sentido],
      cliente: [{ model: Cliente, as: 'cliente' }, 'nombre_razon_social', sentido],
      asesor: [{ model: Usuario, as: 'asesor' }, 'nombre_completo', sentido],
      estado_produccion: ['estado_produccion', sentido],
      factura_electronica: ['factura_electronica', sentido],
      monto_total: ['valor_total', sentido],
      abono: ['abono', sentido],
      pendiente: ['pendiente', sentido],
    };
    const order: any[] = orden
      ? [ordenPorColumna[orden], ['id', 'DESC']]
      // Las no CANCELADO van siempre primero para que ninguna con saldo abierto quede
      // fuera del corte por antigüedad (caso ODP-23859, 2026-09-16).
      : [
          [sequelize.literal(`CASE WHEN "ODP"."estado_caja" = 'CANCELADO' THEN 1 ELSE 0 END`), 'ASC'],
          ['fecha_creacion', 'DESC'],
          ['id', 'DESC'],
        ];

    const { count, rows } = await ODP.findAndCountAll({
      where,
      attributes: ['id', 'numero_odp', 'cliente_id', 'asesor_id', 'valor_total', 'monto_factura_principal', 'abono', 'pendiente', 'estado_caja', 'estado_facturacion', 'factura_electronica', 'fecha_factura', 'fecha_creacion', 'tipo_odp', 'fecha_vencimiento_credito', 'estado_produccion', 'es_no_conformidad', 'es_garantia'],
      include: [
        { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social', 'numero_documento'] },
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
        { model: FacturaAdicionalODP, as: 'facturas_adicionales', attributes: ['id', 'numero_fe', 'fecha_factura', 'monto'], separate: true },
      ],
      order,
      limit,
      offset,
      distinct: true,
    });

    res.json({ rows, count, page, totalPages: Math.max(1, Math.ceil(count / limit)) });
  } catch (error) {
    console.error('Error al obtener ODPs de contabilidad:', error);
    res.status(500).json({ error: 'No se pudo cargar el listado de ODPs de Contabilidad. Recarga la página; si persiste, avisa a soporte.' });
  }
};

/**
 * Lista los pagos registrados, paginados. `q` busca por la ODP del pago (número, FE,
 * cliente, NIT, asesor — misma regla que /odps) y por el recibo o las observaciones.
 */
export const getPagos = async (req: Request, res: Response) => {
  const parsed = pagosQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: mensajeQueryInvalida(parsed.error) });
  }
  const { q } = parsed.data;
  const limit = parsed.data.limit ?? 100;
  const pagina = parsed.data.page ?? 1;
  const offset = (pagina - 1) * limit;

  try {
    const where: any = {};
    if (q) {
      const like = patronLike(normalizarTermino(q));
      where[Op.and] = [sequelize.literal(`(
        ${condicionBusquedaODP('"Pago"."odp_id"', q)}
        OR ${sinTildes('"Pago"."referencia_pago"')} LIKE ${like} ESCAPE '!'
        OR ${sinTildes('"Pago"."observaciones"')} LIKE ${like} ESCAPE '!'
      )`)];
    }

    const { count, rows: pagos } = await Pago.findAndCountAll({
      where,
      include: [
        {
          model: ODP,
          as: 'odp',
          attributes: ['id', 'numero_odp', 'fecha_creacion', 'cliente_id', 'asesor_id', 'factura_electronica'],
          include: [
            { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social', 'numero_documento'] },
            { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
          ],
        },
        { model: Usuario, as: 'registrador', attributes: ['id', 'nombre_completo'] },
      ],
      order: [['fecha', 'DESC'], ['id', 'DESC']],
      limit,
      offset,
    });

    res.json({ pagos, total: count, pagina, totalPaginas: Math.max(1, Math.ceil(count / limit)) });
  } catch (error) {
    console.error('Error al obtener pagos:', error);
    res.status(500).json({ error: 'No se pudo cargar el listado de pagos. Recarga la página; si persiste, avisa a soporte.' });
  }
};

/**
 * Lista los pagos de una ODP específica.
 */
export const getPagosPorODP = async (req: Request, res: Response) => {
  try {
    const { odp_id } = req.params;
    const pagos = await Pago.findAll({
      where: { odp_id: Number(odp_id) },
      include: [{ model: Usuario, as: 'registrador', attributes: ['id', 'nombre_completo'] }],
      order: [['fecha', 'ASC']],
    });
    res.json(pagos);
  } catch (error) {
    console.error('Error al obtener pagos por ODP:', error);
    res.status(500).json({ error: 'Error al obtener pagos de la ODP' });
  }
};

/**
 * Registra un pago y actualiza automáticamente el abono y pendiente de la ODP.
 * Cambia el estado_caja a ABONADO o CANCELADO según corresponda.
 */
export const registrarPago = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const data = pagoSchema.parse(req.body);
    const userId = req.user?.id;
    if (!userId) {
      await t.rollback();
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    // Verificar ODP
    const odp = await ODP.findByPk(data.odp_id, { transaction: t });
    if (!odp) {
      await t.rollback();
      return res.status(404).json({ error: 'ODP no encontrada' });
    }

    // Asistente administrativo solo puede registrar pagos en Órdenes Azules
    if (req.user?.rol === 'asistente_administrativo' && odp.getDataValue('tipo_odp') !== 'OA') {
      await t.rollback();
      return res.status(403).json({ error: 'El rol asistente_administrativo solo puede registrar pagos en Órdenes Azules (OA)' });
    }

    // Crear pago — usar T12:00:00Z para evitar offset de zona horaria al mostrar en Bogotá
    const fechaPago = data.fecha ? new Date(data.fecha + 'T12:00:00.000Z') : new Date();
    const pago = await Pago.create(
      {
        ...data,
        fecha: fechaPago,
        registrado_por: userId,
      } as any,
      { transaction: t },
    );

    // Actualizar financiero de la ODP
    // monto: se suma al abono (aparece en stats)
    // diferencia: reduce el pendiente adicional sin contar en abono (descuento o ajuste)
    const valorTotal = Number(odp.getDataValue('valor_total')) || 0;
    const abonoActual = Number(odp.getDataValue('abono')) || 0;
    const nuevoAbono = abonoActual + data.monto; // stats solo usan monto
    const pendienteActual = Math.max(0, valorTotal - abonoActual);
    const nuevoPendiente = Math.max(0, pendienteActual - data.monto - (data.diferencia || 0));

    // Determinar nuevo estado de caja
    let nuevoEstadoCaja = 'ABONADO';
    if (nuevoPendiente <= 0) {
      nuevoEstadoCaja = 'CANCELADO';
    }

    await odp.update(
      {
        abono: nuevoAbono,
        pendiente: nuevoPendiente,
        estado_caja: nuevoEstadoCaja,
      },
      { transaction: t },
    );

    await t.commit();

    // Patch de la ODP: actualiza tablas en vivo (Contabilidad, listados) y limpia la cache
    // Redux de la ficha para que refleje el nuevo abono/pendiente/estado_caja.
    import('../utils/notificaciones').then(({ emitirODPPatch }) => emitirODPPatch(Number(data.odp_id), 'update')).catch(() => {});

    // Notificación por socket
    import('../server')
      .then(({ io }) => {
        io.emit('notification', {
          type: 'PAGO_REGISTRADO',
          message: `Pago de ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(data.monto)} registrado en ${odp.getDataValue('numero_odp')}`,
          notificacionPara: ['admin', 'gerencia', 'contabilidad'],
          timestamp: new Date(),
        });
      })
      .catch((err) => console.error('Error emitiendo socket de pago:', err));

    res.status(201).json({
      message: 'Pago registrado correctamente',
      pago,
      odp_actualizada: {
        abono: nuevoAbono,
        pendiente: nuevoPendiente,
        estado_caja: nuevoEstadoCaja,
      },
    });
  } catch (error: any) {
    try {
      await t.rollback();
    } catch (_) {
      /* ya hicimos commit/rollback */
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos', detalles: (error as any).errors });
    }
    console.error('Error al registrar pago:', error);
    res.status(500).json({ error: error.message || 'Error al registrar pago' });
  }
};

const pagoEditSchema = z.object({
  monto: z.number().positive('El monto debe ser mayor a 0').optional(),
  metodo_pago: z.string().min(1).optional(),
  referencia_pago: z.string().optional().nullable(),
  observaciones: z.string().optional().nullable(),
  fecha: z.string().optional().nullable(), // ISO date string YYYY-MM-DD
});

/**
 * Edita un pago existente y recalcula el financiero de la ODP automáticamente.
 */
export const editarPago = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const data = pagoEditSchema.parse(req.body);

    const pago = await Pago.findByPk(id, { transaction: t });
    if (!pago) {
      await t.rollback();
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    const updateData: any = { ...data };
    if (data.fecha) updateData.fecha = new Date(data.fecha + 'T12:00:00.000Z');
    await pago.update(updateData, { transaction: t });
    const odp_id = Number(pago.getDataValue('odp_id'));
    const financiero = await recalcularFinanciero(odp_id, t);

    await t.commit();
    // emitirCambio refresca la tab "Pagos Recientes"; emitirODPPatch actualiza la fila de la
    // ODP y la ficha sin refetch de lista. Ambos son necesarios: cubren superficies distintas.
    import('../server').then(({ emitirCambio }) => emitirCambio('contabilidad')).catch(() => {});
    import('../utils/notificaciones').then(({ emitirODPPatch }) => emitirODPPatch(odp_id, 'update')).catch(() => {});
    res.json({ message: 'Pago actualizado', pago, odp_actualizada: financiero });
  } catch (error: any) {
    try { await t.rollback(); } catch (_) { /* ya hecho */ }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos', detalles: error.issues });
    }
    console.error('Error al editar pago:', error);
    res.status(500).json({ error: error.message || 'Error al editar pago' });
  }
};

/**
 * Elimina un pago y recalcula el financiero de la ODP automáticamente.
 * El estado_caja se revierte a PENDIENTE/ABONADO si corresponde.
 */
export const eliminarPago = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;

    const pago = await Pago.findByPk(id, { transaction: t });
    if (!pago) {
      await t.rollback();
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    const odp_id = Number(pago.getDataValue('odp_id'));
    await pago.destroy({ transaction: t });
    const financiero = await recalcularFinanciero(odp_id, t);

    await t.commit();
    import('../server').then(({ emitirCambio }) => emitirCambio('contabilidad')).catch(() => {});
    import('../utils/notificaciones').then(({ emitirODPPatch }) => emitirODPPatch(odp_id, 'update')).catch(() => {});
    res.json({ message: 'Pago eliminado', odp_actualizada: financiero });
  } catch (error: any) {
    try { await t.rollback(); } catch (_) { /* ya hecho */ }
    console.error('Error al eliminar pago:', error);
    res.status(500).json({ error: error.message || 'Error al eliminar pago' });
  }
};
