import { Request, Response } from 'express';
import { Op, fn, col, literal, QueryTypes } from 'sequelize';
import {
  ODP,
  Cliente,
  Usuario,
  HistorialEstadoODP,
  RutaODP,
  RutaInstalacion,
  Vehiculo,
  EvidenciaInstalacion,
  ODPItem,
  ConfiguracionGlobal,
  MetaUsuarioMensual,
  NoConformidad,
  Prospecto,
  Cotizacion
} from '../models';
import sequelize from '../config/database';

// ─── Helpers de periodo ───────────────────────────────────────────────────────

function parsePeriod(req: Request) {
  const today = new Date();
  const mesInicio  = parseInt(req.query.mes_inicio  as string) || (today.getMonth() + 1);
  const anioInicio = parseInt(req.query.anio_inicio as string) || today.getFullYear();
  const mesFin     = parseInt(req.query.mes_fin     as string) || mesInicio;
  const anioFin    = parseInt(req.query.anio_fin    as string) || anioInicio;

  const firstDay = new Date(anioInicio, mesInicio - 1, 1);
  const lastDay  = new Date(anioFin, mesFin, 0, 23, 59, 59, 999);

  return { firstDay, lastDay, mesInicio, anioInicio, mesFin, anioFin };
}

function generateMonthList(mesInicio: number, anioInicio: number, mesFin: number, anioFin: number) {
  const months: { mes: number; anio: number }[] = [];
  let m = mesInicio, y = anioInicio;
  while (y < anioFin || (y === anioFin && m <= mesFin)) {
    months.push({ mes: m, anio: y });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

// ─── 1. PANEL GENERAL ────────────────────────────────────────────────────────
export const getGeneralData = async (req: Request, res: Response) => {
  try {
    const today = new Date();
    const { firstDay, lastDay, mesInicio, anioInicio, mesFin, anioFin } = parsePeriod(req);

    const config = await ConfiguracionGlobal.findOne({ where: { id: 1 } });
    const diasAlertaCartera = Number((config as any)?.dias_alerta_cartera_vencida) || 60;
    const fechaUmbralCartera = new Date(today.getTime() - diasAlertaCartera * 24 * 3600 * 1000);

    // Meta de facturación: suma de metas individuales del periodo
    const monthList = generateMonthList(mesInicio, anioInicio, mesFin, anioFin);
    const sumaMetasUsuarios = monthList.length > 0
      ? await MetaUsuarioMensual.sum('meta_facturacion', {
          where: { [Op.or]: monthList.map(m => ({ anio: m.anio, mes: m.mes })) }
        })
      : 0;
    const meta_facturacion_actual = sumaMetasUsuarios > 0
      ? sumaMetasUsuarios
      : (config as any)?.meta_facturacion_mensual || 120000000;

    // ODPs activas en el periodo (no ENTREGADAS)
    const odps_activas = await ODP.count({
      where: {
        estado_produccion: { [Op.ne]: 'ENTREGADA' },
        fecha_creacion: { [Op.between]: [firstDay, lastDay] }
      }
    });

    // Delta vs periodo equivalente anterior
    const periodMs = lastDay.getTime() - firstDay.getTime();
    const prevLastDay  = new Date(firstDay.getTime() - 1);
    const prevFirstDay = new Date(prevLastDay.getTime() - periodMs);
    const prev_odps_activas = await ODP.count({
      where: {
        estado_produccion: { [Op.ne]: 'ENTREGADA' },
        fecha_creacion: { [Op.between]: [prevFirstDay, prevLastDay] }
      }
    });
    const odps_activas_delta_pct = prev_odps_activas > 0
      ? Math.round(((odps_activas - prev_odps_activas) / prev_odps_activas) * 100)
      : 0;

    // Facturado en el periodo = suma de valor_total de todas las ODPs/OAs
    const facturado_mes = Number(await ODP.sum('valor_total', { where: { fecha_creacion: { [Op.between]: [firstDay, lastDay] } } }) || 0);
    const abonos        = await ODP.sum('abono', { where: { fecha_creacion: { [Op.between]: [firstDay, lastDay] } } }) || 0;

    // Cartera vencida: SOLO créditos que superaron el umbral de días
    const carteraItems = await ODP.findAll({
      where: {
        forma_pago: 'credito',
        pendiente: { [Op.gt]: 0 },
        fecha_entrega: { [Op.lt]: fechaUmbralCartera },
        estado_caja: { [Op.ne]: 'CANCELADO' },
        fecha_creacion: { [Op.between]: [firstDay, lastDay] }
      }
    });
    const cartera_vencida_total    = carteraItems.reduce((acc, o) => acc + Number(o.getDataValue('pendiente')), 0);
    const cartera_vencida_clientes = new Set(carteraItems.map(o => o.getDataValue('cliente_id'))).size;

    // Tasa de entrega a tiempo (ODPs del periodo que llegaron a INSTALADA/ENTREGADA)
    const entregadasRaw = await ODP.findAll({
      where: {
        estado_produccion: { [Op.in]: ['INSTALADA', 'ENTREGADA'] },
        fecha_creacion: { [Op.between]: [firstDay, lastDay] }
      },
      include: [{
        model: HistorialEstadoODP,
        as: 'historial_estados',
        where: { estado_nuevo: { [Op.in]: ['INSTALADA', 'ENTREGADA'] } },
        order: [['fecha', 'DESC']],
        limit: 1,
        required: false
      }]
    });
    const entregadas_a_tiempo = entregadasRaw.filter(o => {
      const hist = o.get('historial_estados') as any;
      const fechaHist = hist && hist.length > 0 ? hist[0].fecha : null;
      if (!fechaHist || !o.getDataValue('fecha_entrega')) return false;
      return new Date(fechaHist) <= new Date(o.getDataValue('fecha_entrega'));
    }).length;
    const tasa_entrega_tiempo_pct = entregadasRaw.length > 0
      ? Math.round((entregadas_a_tiempo / entregadasRaw.length) * 100)
      : 0;

    // ODPs por estado — snapshot actual (sin filtro de periodo)
    const odps_por_estado_raw = await ODP.findAll({
      attributes: ['estado_produccion', [fn('COUNT', col('id')), 'cantidad']],
      group: ['estado_produccion'],
      raw: true
    }) as unknown as { estado_produccion: string; cantidad: string }[];
    const odps_por_estado = odps_por_estado_raw.map(o => ({
      estado: o.estado_produccion,
      cantidad: parseInt(o.cantidad)
    }));

    // Gráfico mensual: cantidad ODPs, abono, pendiente, cancelado, crédito por mes
    const estadisticasMensualesRaw = await sequelize.query<{
      mes: Date; cantidad_odps: string;
      total_abono: string; total_pendiente: string;
      total_cancelado: string; total_credito: string;
    }>(`
      SELECT
        DATE_TRUNC('month', fecha_creacion) AS mes,
        COUNT(*)::int                        AS cantidad_odps,
        SUM(abono)                           AS total_abono,
        SUM(pendiente)                       AS total_pendiente,
        SUM(CASE WHEN estado_caja = 'CANCELADO'  THEN abono + pendiente ELSE 0 END) AS total_cancelado,
        SUM(CASE WHEN forma_pago  = 'credito'    THEN abono + pendiente ELSE 0 END) AS total_credito
      FROM odp
      WHERE fecha_creacion BETWEEN :firstDay AND :lastDay
      GROUP BY DATE_TRUNC('month', fecha_creacion)
      ORDER BY mes ASC
    `, { replacements: { firstDay, lastDay }, type: QueryTypes.SELECT });

    const estadisticas_mensuales = estadisticasMensualesRaw.map(row => ({
      mes:              new Date(row.mes).toLocaleDateString('es-CO', { month: 'short', year: '2-digit' }),
      cantidad_odps:    Number(row.cantidad_odps)  || 0,
      total_abono:      Number(row.total_abono)    || 0,
      total_pendiente:  Number(row.total_pendiente)|| 0,
      total_cancelado:  Number(row.total_cancelado)|| 0,
      total_credito:    Number(row.total_credito)  || 0,
    }));

    // Embudo de conversión (periodo seleccionado)
    const periodWhere = { fecha_creacion: { [Op.between]: [firstDay, lastDay] } };
    const embudo_conversion = {
      creadas:         await ODP.count({ where: { ...periodWhere } }),
      en_espera:       await ODP.count({ where: { ...periodWhere, estado_produccion: 'EN_ESPERA' } }),
      en_produccion:   await ODP.count({ where: { ...periodWhere, estado_produccion: { [Op.notIn]: ['EN_ESPERA', 'ENTREGADA', 'INSTALADA'] } } }),
      listas_con_pago: await ODP.count({ where: { ...periodWhere, estado_produccion: 'LISTO_INSTALAR', [Op.or]: [{ forma_pago: 'credito' }, { estado_caja: 'CANCELADO' }, { estado_caja: 'CREDITO_APROBADO' }] } }),
      listas_sin_pago: await ODP.count({ where: { ...periodWhere, estado_produccion: 'LISTO_INSTALAR', forma_pago: { [Op.ne]: 'credito' }, estado_caja: { [Op.notIn]: ['CANCELADO', 'CREDITO_APROBADO'] } } }),
      instaladas:      await ODP.count({ where: { ...periodWhere, estado_produccion: 'INSTALADA' } }),
      entregadas:      await ODP.count({ where: { ...periodWhere, estado_produccion: 'ENTREGADA' } }),
    };

    // Distribución de caja (periodo)
    const caja_raw = await ODP.findAll({
      attributes: ['estado_caja', [fn('COUNT', col('id')), 'total']],
      where: periodWhere,
      group: ['estado_caja'],
      raw: true
    }) as unknown as { estado_caja: string; total: string }[];
    const total_caja = caja_raw.reduce((acc, c) => acc + parseInt(c.total), 0);
    const estado_caja_distribucion = caja_raw.map(c => ({
      estado: c.estado_caja,
      pct:    total_caja > 0 ? Math.round((parseInt(c.total) / total_caja) * 100) : 0
    }));

    res.json({
      meta_facturacion_actual: Number(meta_facturacion_actual),
      odps_activas,
      odps_activas_delta_pct,
      facturado_mes: Number(facturado_mes),
      total_abonado: Number(abonos),
      cartera_vencida_total,
      cartera_vencida_clientes,
      tasa_entrega_tiempo_pct,
      meta_entrega_tiempo_pct: 85,
      odps_por_estado,
      estadisticas_mensuales,
      embudo_conversion,
      estado_caja_distribucion
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ─── 2. PANEL VENTAS ─────────────────────────────────────────────────────────
export const getVentasData = async (req: Request, res: Response) => {
  try {
    const today = new Date();
    const { firstDay, lastDay, mesInicio, anioInicio, mesFin, anioFin } = parsePeriod(req);

    const config = await ConfiguracionGlobal.findOne({ where: { id: 1 } });
    const diasAlertaCartera   = Number((config as any)?.dias_alerta_cartera_vencida) || 60;
    const fechaUmbralCartera  = new Date(today.getTime() - diasAlertaCartera * 24 * 3600 * 1000);

    const periodWhere = { fecha_creacion: { [Op.between]: [firstDay, lastDay] } };

    // Totales del periodo
    const total_facturado_mes = Number(await ODP.sum('valor_total', { where: periodWhere }) || 0);
    const totalAbono          = await ODP.sum('abono', { where: periodWhere }) || 0;
    const total_abonado       = Number(totalAbono);
    const total_pendiente     = await ODP.sum('pendiente', {
      where: { ...periodWhere, pendiente: { [Op.gt]: 0 } }
    }) || 0;

    const odps_sin_facturar = await ODP.count({ where: { ...periodWhere, factura_electronica: null } });
    const countPeriod       = await ODP.count({ where: periodWhere });
    const ticket_promedio   = countPeriod > 0 ? Math.round(total_facturado_mes / countPeriod) : 0;

    // Top clientes del periodo
    const top_clientes_raw = await ODP.findAll({
      attributes: [
        'cliente_id',
        [fn('SUM', literal('"ODP".abono + "ODP".pendiente')), 'total'],
        [fn('COUNT', col('ODP.id')), 'odps_count']
      ],
      where: periodWhere,
      include: [{ model: Cliente, as: 'cliente', attributes: ['nombre_razon_social'] }],
      group: ['ODP.cliente_id', 'cliente.id'],
      order: [[literal('total'), 'DESC']],
      limit: 5,
      raw: true,
      nest: true
    }) as unknown as any[];
    const top_clientes = top_clientes_raw.map(tc => ({
      cliente_id: tc.cliente_id,
      nombre:     tc.cliente.nombre_razon_social,
      total:      Number(tc.total),
      odps:       parseInt(tc.odps_count)
    }));

    // Cartera vencida: SOLO créditos que superaron el umbral
    const carteraRaw = await ODP.findAll({
      where: {
        forma_pago:   'credito',
        pendiente:    { [Op.gt]: 0 },
        fecha_entrega:{ [Op.lt]: fechaUmbralCartera },
        estado_caja:  { [Op.ne]: 'CANCELADO' },
        ...periodWhere
      },
      include: [{ model: Cliente, as: 'cliente', attributes: ['nombre_razon_social'] }],
      order: [['fecha_entrega', 'ASC']],
      limit: 10
    });
    const cartera_vencida_detalle = carteraRaw.map(o => {
      const diff = Math.ceil((today.getTime() - new Date(o.getDataValue('fecha_entrega')).getTime()) / (1000 * 3600 * 24));
      return {
        cliente_id:   o.getDataValue('cliente_id'),
        nombre:       (o as any).cliente?.nombre_razon_social || 'Cliente desconocido',
        monto:        Number(o.getDataValue('pendiente')),
        dias_vencido: diff,
        riesgo:       diff > diasAlertaCartera * 2   ? 'critico'
                    : diff > diasAlertaCartera * 1.5  ? 'alerta'
                    : 'normal'
      };
    });
    const cartera_por_antiguedad = [
      { rango: `${diasAlertaCartera}–${Math.round(diasAlertaCartera * 1.5)} días`, total: cartera_vencida_detalle.filter(d => d.riesgo === 'normal').reduce((a, c) => a + c.monto, 0) },
      { rango: `${Math.round(diasAlertaCartera * 1.5)}–${diasAlertaCartera * 2} días`, total: cartera_vencida_detalle.filter(d => d.riesgo === 'alerta').reduce((a, c) => a + c.monto, 0) },
      { rango: `>${diasAlertaCartera * 2} días`, total: cartera_vencida_detalle.filter(d => d.riesgo === 'critico').reduce((a, c) => a + c.monto, 0) }
    ];

    // Ranking asesores — meta financiera (asesor_comercial + gerencia + jefe_produccion)
    const monthList = generateMonthList(mesInicio, anioInicio, mesFin, anioFin);
    const asesores  = await Usuario.findAll({
      where: { rol: { [Op.in]: ['asesor_comercial', 'gerencia', 'jefe_produccion'] } }
    });

    // facturado = suma de valor_total (monto contratado de cada ODP/OA)
    const realByAsesor = await ODP.findAll({
      attributes: ['asesor_id', [fn('SUM', col('valor_total')), 'total']],
      where: { ...periodWhere, asesor_id: { [Op.ne]: null } },
      group: ['asesor_id'],
      raw: true
    }) as unknown as { asesor_id: number; total: string }[];

    // recaudado = suma de abonos efectivamente cobrados
    const recaudadoByAsesor = await ODP.findAll({
      attributes: ['asesor_id', [fn('SUM', col('abono')), 'total']],
      where: { ...periodWhere, asesor_id: { [Op.ne]: null } },
      group: ['asesor_id'],
      raw: true
    }) as unknown as { asesor_id: number; total: string }[];

    const metaByAsesor = monthList.length > 0
      ? await MetaUsuarioMensual.findAll({
          attributes: ['usuario_id', [fn('SUM', col('meta_facturacion')), 'total']],
          where: { [Op.or]: monthList.map(m => ({ anio: m.anio, mes: m.mes })) },
          group: ['usuario_id'],
          raw: true
        }) as unknown as { usuario_id: number; total: string }[]
      : [];

    const meta_vs_real_asesores = asesores.map(u => {
      const uid          = u.getDataValue('id');
      const realRow      = realByAsesor.find(r => Number(r.asesor_id) === uid);
      const recRow       = recaudadoByAsesor.find(r => Number(r.asesor_id) === uid);
      const metaRow      = metaByAsesor.find(m => Number(m.usuario_id) === uid);
      return {
        asesor_id:  uid,
        nombre:     (u as any).nombre_completo,
        rol:        (u as any).rol,
        real:       Number(realRow?.total) || 0,       // facturado = abono + pendiente
        recaudado:  Number(recRow?.total)  || 0,       // solo abono (cobrado)
        meta:       Number(metaRow?.total) || 0,
      };
    });

    const meta_facturacion_actual = monthList.length > 0
      ? await MetaUsuarioMensual.sum('meta_facturacion', {
          where: { [Op.or]: monthList.map(m => ({ anio: m.anio, mes: m.mes })) }
        }) || (config as any)?.meta_facturacion_mensual || 120000000
      : (config as any)?.meta_facturacion_mensual || 120000000;

    // ODPs atrasadas — snapshot (no filtro de periodo)
    const odps_atrasadas = await ODP.count({
      where: {
        fecha_entrega:    { [Op.lt]: today },
        estado_produccion:{ [Op.notIn]: ['ENTREGADA', 'INSTALADA'] },
        estado_caja:      { [Op.ne]: 'CANCELADO' }
      }
    });

    res.json({
      total_abonado:       Number(total_abonado),
      total_facturado_mes: Number(total_facturado_mes),
      total_pendiente:     Number(total_pendiente),
      odps_sin_facturar,
      odps_atrasadas,
      ticket_promedio,
      ticket_promedio_delta_pct: 0,
      top_clientes,
      cartera_vencida_detalle,
      cartera_por_antiguedad,
      meta_vs_real_asesores,
      meta_facturacion_actual: Number(meta_facturacion_actual)
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ─── 3. PANEL PRODUCCIÓN ───────────────────────────────────────────────────
export const getProduccionData = async (req: Request, res: Response) => {
  try {
    const today   = new Date();
    const nextWeek = new Date(today.getTime() + (7 * 24 * 3600 * 1000));
    const { firstDay, lastDay } = parsePeriod(req);

    const odps_en_taller         = await ODP.count({ where: { estado_produccion: { [Op.notIn]: ['ENTREGADA', 'INSTALADA', 'EN_ESPERA'] } } });
    const odps_vencen_esta_semana = await ODP.count({ where: { fecha_entrega: { [Op.between]: [today, nextWeek] }, estado_produccion: { [Op.notIn]: ['ENTREGADA', 'INSTALADA'] } } });

    const entregadasPeriodo = await ODP.findAll({
      where: { estado_produccion: 'ENTREGADA', fecha_creacion: { [Op.between]: [firstDay, lastDay] } },
      include: [{
        model: HistorialEstadoODP,
        as: 'historial_estados',
        where: { estado_nuevo: 'ENTREGADA' },
        limit: 1,
        order: [['fecha', 'DESC']]
      }]
    });
    let sumDias = 0;
    entregadasPeriodo.forEach(o => {
      const created  = new Date(o.getDataValue('fecha_creacion'));
      const finished = (o.get('historial_estados') as any)?.length > 0
        ? new Date((o.get('historial_estados') as any)[0].fecha) : today;
      sumDias += Math.ceil((finished.getTime() - created.getTime()) / (1000 * 3600 * 24));
    });
    const tiempo_ciclo_promedio_dias = entregadasPeriodo.length > 0
      ? Number((sumDias / entregadasPeriodo.length).toFixed(1)) : 0;

    const listasIds   = await ODP.findAll({ where: { estado_produccion: 'LISTO_INSTALAR' }, attributes: ['id'] });
    const programadas = await RutaODP.findAll({ where: { odp_id: { [Op.in]: listasIds.map(o => o.getDataValue('id')) }, estado: { [Op.ne]: 'completada' } }, attributes: ['odp_id'] });
    const odps_listas_sin_programar = listasIds.length - programadas.length;

    const [checksRows] = await sequelize.query(`
      SELECT
        SUM(CASE WHEN chk_medicion   THEN 1 ELSE 0 END)::int AS chk_medicion,
        SUM(CASE WHEN chk_corte      THEN 1 ELSE 0 END)::int AS chk_corte,
        SUM(CASE WHEN chk_vidrio     THEN 1 ELSE 0 END)::int AS chk_vidrio,
        SUM(CASE WHEN chk_accesorios THEN 1 ELSE 0 END)::int AS chk_accesorios,
        SUM(CASE WHEN chk_ensamble   THEN 1 ELSE 0 END)::int AS chk_ensamble,
        SUM(CASE WHEN chk_matizado   THEN 1 ELSE 0 END)::int AS chk_matizado,
        SUM(CASE WHEN chk_pelicula   THEN 1 ELSE 0 END)::int AS chk_pelicula,
        SUM(CASE WHEN chk_huacal     THEN 1 ELSE 0 END)::int AS chk_huacal,
        SUM(CASE WHEN chk_carton     THEN 1 ELSE 0 END)::int AS chk_carton,
        COUNT(*)::int                                         AS total
      FROM odp
      WHERE estado_produccion NOT IN ('EN_ESPERA', 'ENTREGADA', 'PAUSADA')
    `) as [Record<string, string>[], unknown];
    const cr = checksRows[0] || {};
    const totalActivas = Number(cr['total']) || 0;
    const checks_progreso = [
      { campo: 'chk_medicion',   label: 'Medición',        completadas: Number(cr['chk_medicion'])   || 0 },
      { campo: 'chk_corte',      label: 'Corte aluminio',  completadas: Number(cr['chk_corte'])      || 0 },
      { campo: 'chk_vidrio',     label: 'Vidrio recibido', completadas: Number(cr['chk_vidrio'])     || 0 },
      { campo: 'chk_accesorios', label: 'Accesorios',      completadas: Number(cr['chk_accesorios']) || 0 },
      { campo: 'chk_ensamble',   label: 'Ensamble',        completadas: Number(cr['chk_ensamble'])   || 0 },
      { campo: 'chk_matizado',   label: 'Matizado',        completadas: Number(cr['chk_matizado'])   || 0 },
      { campo: 'chk_pelicula',   label: 'Película',        completadas: Number(cr['chk_pelicula'])   || 0 },
      { campo: 'chk_huacal',     label: 'Huacal',          completadas: Number(cr['chk_huacal'])     || 0 },
      { campo: 'chk_carton',     label: 'Cartón',          completadas: Number(cr['chk_carton'])     || 0 },
    ].map(c => ({ ...c, total: totalActivas, pct: totalActivas > 0 ? Math.round((c.completadas / totalActivas) * 100) : 0 }));

    const proximas_vencer_raw = await ODP.findAll({
      where: { fecha_entrega: { [Op.between]: [today, nextWeek] }, estado_produccion: { [Op.notIn]: ['ENTREGADA', 'INSTALADA'] } },
      include: [{ model: Cliente, as: 'cliente', attributes: ['nombre_razon_social'] }],
      order: [['fecha_entrega', 'ASC']],
      limit: 10
    });
    const odps_proximas_vencer = proximas_vencer_raw.map(o => {
      const rest = Math.ceil((new Date(o.getDataValue('fecha_entrega')).getTime() - today.getTime()) / (1000 * 3600 * 24));
      return {
        odp_id:           o.getDataValue('id'),
        numero_odp:       o.getDataValue('numero_odp'),
        cliente:          (o as any).cliente?.nombre_razon_social || 'Desconocido',
        estado_produccion:o.getDataValue('estado_produccion'),
        fecha_entrega:    o.getDataValue('fecha_entrega'),
        dias_restantes:   rest,
        riesgo:           rest <= 2 ? 'alto' : rest <= 5 ? 'medio' : 'bajo'
      };
    });

    const servicios_raw = await ODP.findAll({
      attributes: ['tipo_servicio', [fn('COUNT', col('id')), 'total']],
      where: { fecha_creacion: { [Op.between]: [firstDay, lastDay] } },
      group: ['tipo_servicio'],
      raw: true
    }) as any[];
    const servicios_distribucion = servicios_raw.map(s => ({ tipo_servicio: s.tipo_servicio || 'Otros', cantidad: parseInt(s.total) }));

    const odps_pausadas             = await ODP.count({ where: { estado_produccion: 'PAUSADA' } });
    const no_conformidades_abiertas = await NoConformidad.count({ where: { estado: { [Op.in]: ['ABIERTO', 'EN_PROCESO'] } } });

    const masAntiguas = await ODP.findAll({
      where: { estado_produccion: { [Op.notIn]: ['ENTREGADA', 'INSTALADA', 'EN_ESPERA'] } },
      include: [{ model: Cliente, as: 'cliente', attributes: ['nombre_razon_social'] }],
      order: [['fecha_creacion', 'ASC']],
      limit: 5
    });
    const odps_mas_antiguas = masAntiguas.map(o => {
      const dias = Math.ceil((today.getTime() - new Date(o.getDataValue('fecha_creacion')).getTime()) / (1000 * 3600 * 24));
      return {
        odp_id:           o.getDataValue('id'),
        numero_odp:       o.getDataValue('numero_odp'),
        cliente:          (o as any).cliente?.nombre_razon_social || 'Desconocido',
        estado_produccion:o.getDataValue('estado_produccion'),
        dias_en_sistema:  dias
      };
    });

    res.json({ odps_en_taller, odps_vencen_esta_semana, tiempo_ciclo_promedio_dias, meta_ciclo_dias: 8, odps_listas_sin_programar, checks_progreso, odps_proximas_vencer, servicios_distribucion, odps_pausadas, no_conformidades_abiertas, odps_mas_antiguas });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ─── 4. PANEL EQUIPO ────────────────────────────────────────────────────────
export const getEquipoData = async (req: Request, res: Response) => {
  try {
    const today = new Date();
    const { firstDay, lastDay, mesInicio, anioInicio, mesFin, anioFin } = parsePeriod(req);
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const todayStr        = today.toISOString().split('T')[0];
    const periodWhere     = { fecha_creacion: { [Op.between]: [firstDay, lastDay] } };

    const total_asesores     = await Usuario.count({ where: { rol: 'asesor_comercial' } });
    const total_instaladores = await Usuario.count({ where: { rol: 'instalador' } });
    const total_odps         = await ODP.count({ where: { estado_produccion: { [Op.ne]: 'ENTREGADA' } } });
    const odps_por_asesor_promedio = total_asesores > 0 ? Number((total_odps / total_asesores).toFixed(1)) : 0;
    const items_totales      = await ODPItem.count();
    const items_verificados  = await ODPItem.count({ where: { verificacion_prod: true } });
    const eficiencia_taller_pct = items_totales > 0 ? Math.round((items_verificados / items_totales) * 100) : 0;

    // Ranking asesores — meta financiera del periodo
    const asesores  = await Usuario.findAll({ where: { rol: 'asesor_comercial' } });
    const monthList = generateMonthList(mesInicio, anioInicio, mesFin, anioFin);

    const realByAsesor = await ODP.findAll({
      attributes: ['asesor_id', [fn('SUM', literal('abono + pendiente')), 'total']],
      where: { ...periodWhere, asesor_id: { [Op.ne]: null } },
      group: ['asesor_id'],
      raw: true
    }) as unknown as { asesor_id: number; total: string }[];

    const metaByAsesor = monthList.length > 0
      ? await MetaUsuarioMensual.findAll({
          attributes: ['usuario_id', [fn('SUM', col('meta_facturacion')), 'total']],
          where: { [Op.or]: monthList.map(m => ({ anio: m.anio, mes: m.mes })) },
          group: ['usuario_id'],
          raw: true
        }) as unknown as { usuario_id: number; total: string }[]
      : [];

    const prospectosByAsesor = await Prospecto.findAll({
      attributes: ['asesor_id', [fn('COUNT', col('id')), 'total']],
      where: { odp_id: null, asesor_id: { [Op.ne]: null } },
      group: ['asesor_id'],
      raw: true
    }) as unknown as { asesor_id: number; total: string }[];

    const odpsByAsesor = await ODP.findAll({
      attributes: ['asesor_id', [fn('COUNT', col('id')), 'total']],
      where: { asesor_id: { [Op.ne]: null }, estado_produccion: { [Op.ne]: 'ENTREGADA' } },
      group: ['asesor_id'],
      raw: true
    }) as unknown as { asesor_id: number; total: string }[];

    const ranking_asesores = asesores.map(u => {
      const uid        = u.getDataValue('id');
      const realRow    = realByAsesor.find(r => Number(r.asesor_id) === uid);
      const metaRow    = metaByAsesor.find(m => Number(m.usuario_id) === uid);
      const prospRow   = prospectosByAsesor.find(p => Number(p.asesor_id) === uid);
      const odpRow     = odpsByAsesor.find(o => Number(o.asesor_id) === uid);
      return {
        asesor_id:          uid,
        nombre:             (u as any).nombre_completo,
        real:               Number(realRow?.total) || 0,
        meta:               Number(metaRow?.total) || 0,
        prospectos_activos: Number(prospRow?.total) || 0,
        odps_abiertas:      Number(odpRow?.total) || 0,
      };
    });

    // Carga instaladores
    const instaladores    = await Usuario.findAll({ where: { rol: 'instalador' } });
    const carga_instaladores = await Promise.all(instaladores.map(async (u) => {
      const instas    = await EvidenciaInstalacion.count({ where: { instalador_id: u.getDataValue('id') } });
      const evidencias = await EvidenciaInstalacion.count({ where: { instalador_id: u.getDataValue('id') } });
      return { instalador_id: u.getDataValue('id'), nombre: (u as any).nombre_completo, instalaciones_mes: instas, con_evidencia: evidencias, sin_evidencia: Math.max(0, instas - evidencias) };
    }));

    // Rendimiento instaladores
    const [rendimientoRows] = await sequelize.query(`
      SELECT u.id AS instalador_id, u.nombre_completo AS nombre,
             COUNT(e.id) AS instalaciones_mes,
             ROUND(AVG(EXTRACT(EPOCH FROM (ro.fin_instalacion - ro.inicio_instalacion)) / 60)::numeric, 1) AS avg_minutos_instalacion,
             COUNT(CASE WHEN ro.fin_instalacion::date = CURRENT_DATE THEN 1 END) AS completadas_hoy
      FROM evidencias_instalacion e
      JOIN ruta_odp ro ON ro.odp_id = e.odp_id AND ro.estado = 'completada'
      JOIN usuarios u ON e.instalador_id = u.id
      WHERE e.fecha >= :firstDay AND ro.fin_instalacion IS NOT NULL AND ro.inicio_instalacion IS NOT NULL
      GROUP BY u.id, u.nombre_completo
      ORDER BY instalaciones_mes DESC
    `, { replacements: { firstDay } });

    // Análisis conductores
    const [conductoresRows] = await sequelize.query(`
      SELECT u.id AS conductor_id, u.nombre_completo AS nombre,
             COUNT(ri.id) AS rutas_mes,
             COUNT(CASE WHEN ri.estado = 'completada' THEN 1 END) AS rutas_completadas,
             ROUND(AVG(EXTRACT(EPOCH FROM ((SELECT MAX(ro2.fin_instalacion) FROM ruta_odp ro2 WHERE ro2.ruta_id = ri.id) - ri.inicio_ruta)) / 60)::numeric, 0) AS avg_minutos_ruta,
             ROUND(AVG(EXTRACT(EPOCH FROM (ro.llegada_conductor - (ro.fecha_programada::timestamp))) / 3600)::numeric, 1) AS avg_horas_puntualidad
      FROM rutas_instalacion ri
      JOIN usuarios u ON ri.conductor_id = u.id
      LEFT JOIN ruta_odp ro ON ro.ruta_id = ri.id AND ro.llegada_conductor IS NOT NULL
      WHERE ri.creado_en >= :firstDay AND ri.conductor_id IS NOT NULL
      GROUP BY u.id, u.nombre_completo
      ORDER BY rutas_mes DESC
    `, { replacements: { firstDay } });

    // Operaciones hoy
    const [odpsHoyRows] = await sequelize.query(`
      SELECT COUNT(*) FILTER (WHERE estado = 'pendiente')  AS pendientes,
             COUNT(*) FILTER (WHERE estado = 'en_curso')   AS en_curso,
             COUNT(*) FILTER (WHERE estado = 'completada') AS completadas
      FROM ruta_odp WHERE fecha_programada = :todayStr
    `, { replacements: { todayStr } });

    const rutasActivas = await RutaInstalacion.findAll({
      where: { estado: 'en_curso' },
      include: [
        { model: Vehiculo,  as: 'vehiculo',   attributes: ['placa', 'tipo'] },
        { model: Usuario,   as: 'conductor',  attributes: ['nombre_completo'] },
        { model: RutaODP,   as: 'ruta_odps',  attributes: ['id', 'estado', 'odp_id', 'llegada_conductor', 'inicio_instalacion'] },
      ],
    }) as any[];

    const operaciones_hoy = {
      odps: odpsHoyRows[0] || { pendientes: 0, en_curso: 0, completadas: 0 },
      rutas_activas: rutasActivas.map(r => ({
        id:               r.id,
        conductor:        r.conductor?.nombre_completo || 'Sin conductor',
        vehiculo:         r.vehiculo ? `${r.vehiculo.tipo.toUpperCase()} ${r.vehiculo.placa}` : '—',
        inicio_ruta:      r.inicio_ruta,
        stops_total:      r.ruta_odps?.length || 0,
        stops_completadas:r.ruta_odps?.filter((s: any) => s.estado === 'completada').length || 0,
        stops_en_curso:   r.ruta_odps?.filter((s: any) => s.estado === 'en_curso').length || 0,
      })),
    };

    res.json({
      total_asesores, total_instaladores, odps_por_asesor_promedio, eficiencia_taller_pct,
      ranking_asesores, carga_instaladores,
      rendimiento_instaladores: rendimientoRows,
      analisis_conductores:     conductoresRows,
      operaciones_hoy,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ─── 5. PESTAÑA ALERTAS ─────────────────────────────────────────────────────
export const getAlertas = async (_req: Request, res: Response) => {
  try {
    const alerts: any[] = [];
    const today = new Date();
    const alertThreshold = new Date(today.getTime() + (2 * 24 * 3600 * 1000));

    const config = await ConfiguracionGlobal.findOne({ where: { id: 1 } });
    const diasAlertaCartera  = Number((config as any)?.dias_alerta_cartera_vencida) || 60;
    const fechaUmbralCartera = new Date(today.getTime() - diasAlertaCartera * 24 * 3600 * 1000);

    const proximasSinAvance = await ODP.findAll({
      where: { fecha_entrega: { [Op.lte]: alertThreshold }, estado_produccion: { [Op.notIn]: ['ENTREGADA', 'INSTALADA', 'LISTO_INSTALAR'] } },
      limit: 10
    });
    proximasSinAvance.forEach(o => {
      alerts.push({ tipo: 'critico', categoria: 'produccion', titulo: 'ODP próxima a vencer sin avance', mensaje: `ODP ${o.getDataValue('numero_odp')} vence pronto y sigue en estado ${o.getDataValue('estado_produccion')}.`, odp_id: o.getDataValue('id'), accion: 'Ver ODP' });
    });

    // Cartera crítica — créditos que superaron el umbral configurado
    const carteraCritica = await ODP.findAll({
      where: {
        forma_pago:   'credito',
        pendiente:    { [Op.gt]: 0 },
        fecha_entrega:{ [Op.lt]: fechaUmbralCartera },
        estado_caja:  { [Op.ne]: 'CANCELADO' }
      },
      include: [{ model: Cliente, as: 'cliente' }],
      limit: 5
    });
    carteraCritica.forEach(o => {
      alerts.push({ tipo: 'critico', categoria: 'cartera', titulo: 'Cartera vencida crítica', mensaje: `${(o as any).cliente?.nombre_razon_social} tiene deuda de $${o.getDataValue('pendiente')} a más de ${diasAlertaCartera} días.`, cliente_id: o.getDataValue('cliente_id'), accion: 'Ver cliente' });
    });

    res.json(alerts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ─── 6. PANEL COTIZACIONES ───────────────────────────────────────────────────
export const getCotizacionesData = async (req: Request, res: Response) => {
  try {
    const { firstDay, lastDay } = parsePeriod(req);
    const today = new Date();

    // Resumen del período
    const resumenRows = await sequelize.query<{
      total: string;
      en_seguimiento: string;
      aprobadas: string;
      rechazadas: string;
      valor_aprobadas: string;
    }>(`
      SELECT
        COUNT(*)::int                                                                        AS total,
        COUNT(*) FILTER (WHERE estado = 'enviada')::int                                     AS en_seguimiento,
        COUNT(*) FILTER (WHERE estado IN ('aprobada','convertida'))::int                    AS aprobadas,
        COUNT(*) FILTER (WHERE estado IN ('rechazada','vencida'))::int                      AS rechazadas,
        COALESCE(SUM(valor_total) FILTER (WHERE estado IN ('aprobada','convertida')), 0)   AS valor_aprobadas
      FROM cotizacion
      WHERE fecha_creacion BETWEEN :firstDay AND :lastDay
    `, { replacements: { firstDay, lastDay }, type: QueryTypes.SELECT });

    const r = resumenRows[0] || { total: '0', en_seguimiento: '0', aprobadas: '0', rechazadas: '0', valor_aprobadas: '0' };

    // Desglose mes a mes
    const porMesRaw = await sequelize.query<{
      mes: Date;
      realizadas: string;
      en_seguimiento: string;
      aprobadas: string;
      rechazadas: string;
      valor_aprobadas: string;
    }>(`
      SELECT
        DATE_TRUNC('month', fecha_creacion)                                                  AS mes,
        COUNT(*)::int                                                                        AS realizadas,
        COUNT(*) FILTER (WHERE estado = 'enviada')::int                                     AS en_seguimiento,
        COUNT(*) FILTER (WHERE estado IN ('aprobada','convertida'))::int                    AS aprobadas,
        COUNT(*) FILTER (WHERE estado IN ('rechazada','vencida'))::int                      AS rechazadas,
        COALESCE(SUM(valor_total) FILTER (WHERE estado IN ('aprobada','convertida')), 0)   AS valor_aprobadas
      FROM cotizacion
      WHERE fecha_creacion BETWEEN :firstDay AND :lastDay
      GROUP BY DATE_TRUNC('month', fecha_creacion)
      ORDER BY mes ASC
    `, { replacements: { firstDay, lastDay }, type: QueryTypes.SELECT });

    const por_mes = porMesRaw.map((row) => ({
      mes:             new Date(row.mes).toLocaleDateString('es-CO', { month: 'short', year: '2-digit' }),
      realizadas:      Number(row.realizadas),
      en_seguimiento:  Number(row.en_seguimiento),
      aprobadas:       Number(row.aprobadas),
      rechazadas:      Number(row.rechazadas),
      valor_aprobadas: Number(row.valor_aprobadas),
    }));

    // En seguimiento activo — snapshot actual independiente del período
    const enSeguimientoRaw = await Cotizacion.findAll({
      where: { estado: 'enviada' },
      include: [
        { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] },
        { model: Usuario, as: 'asesor',  attributes: ['id', 'nombre_completo'] },
      ],
      order: [['fecha_creacion', 'ASC']],
    });

    const en_seguimiento_activo = enSeguimientoRaw.map(c => {
      const fechaCreacion = new Date(c.getDataValue('fecha_creacion'));
      const dias = Math.ceil((today.getTime() - fechaCreacion.getTime()) / (1000 * 3600 * 24));
      return {
        id:                 c.getDataValue('id'),
        numero_cot:         c.getDataValue('numero_cot'),
        nombre_proyecto:    c.getDataValue('nombre_proyecto') || '—',
        cliente:            (c as any).cliente?.nombre_razon_social || '—',
        asesor:             (c as any).asesor?.nombre_completo || '—',
        valor_total:        Number(c.getDataValue('valor_total')),
        fecha_creacion:     c.getDataValue('fecha_creacion'),
        dias_transcurridos: dias,
        validez_dias:       Number(c.getDataValue('validez_dias')),
      };
    });

    res.json({
      resumen_periodo: {
        total_realizadas:      Number(r.total),
        total_en_seguimiento:  Number(r.en_seguimiento),
        total_aprobadas:       Number(r.aprobadas),
        total_rechazadas:      Number(r.rechazadas),
        valor_total_aprobadas: Number(r.valor_aprobadas),
      },
      por_mes,
      en_seguimiento_activo,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ─── 7. DASHBOARD TRADICIONAL (COMPATIBILIDAD) ───────────────────────────────
export const getDashboardData = async (_req: Request, res: Response) => {
  try {
    const today           = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const facturadoMes    = await ODP.sum('abono', { where: { fecha_creacion: { [Op.gte]: firstDayOfMonth } } }) || 0;
    const enProduccion    = await ODP.count({ where: { estado_produccion: { [Op.notIn]: ['ENTREGADA', 'INSTALADA', 'EN_ESPERA'] } } });
    const pedidos_atrasados = await ODP.count({ where: { fecha_entrega: { [Op.lt]: today }, estado_produccion: { [Op.notIn]: ['ENTREGADA', 'INSTALADA'] } } });
    res.json({
      ventas_mes: facturadoMes,
      en_produccion: enProduccion,
      pedidos_atrasados,
      total_odps: await ODP.count(),
      total_clientes: await Cliente.count(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
