import { Request, Response } from 'express';
import { Op, fn, col, QueryTypes } from 'sequelize';
import {
  ODP, Cliente, Usuario, HistorialEstadoODP,
  RutaODP, NoConformidad, Prospecto, Pago, MetaUsuarioMensual
} from '../models';
import sequelize from '../config/database';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDates(req: Request) {
  const today = new Date();
  const hastaStr = req.query.hasta as string;
  const desdeStr = req.query.desde as string;
  const hasta = hastaStr
    ? new Date(hastaStr + 'T23:59:59')
    : new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
  const desde = desdeStr
    ? new Date(desdeStr + 'T00:00:00')
    : new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6, 0, 0, 0);
  return { desde, hasta };
}

function prevPeriod(desde: Date, hasta: Date) {
  const ms = hasta.getTime() - desde.getTime();
  const prevHasta = new Date(desde.getTime() - 1);
  const prevDesde = new Date(prevHasta.getTime() - ms);
  return { prevDesde, prevHasta };
}

function deltaP(current: number, prev: number) {
  if (prev === 0) return null;
  return Math.round(((current - prev) / prev) * 100);
}

function buildBuscadorWhere(busqueda?: string) {
  if (!busqueda) return {};
  return { numero_odp: { [Op.iLike]: `%${busqueda}%` } };
}

function mesesEntre(desde: Date, hasta: Date) {
  const meses: { anio: number; mes: number }[] = [];
  let d = new Date(desde.getFullYear(), desde.getMonth(), 1);
  const fin = new Date(hasta.getFullYear(), hasta.getMonth(), 1);
  while (d <= fin) {
    meses.push({ anio: d.getFullYear(), mes: d.getMonth() + 1 });
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }
  return meses;
}

// ─── 1. RESUMEN EJECUTIVO ─────────────────────────────────────────────────────
export const getResumen = async (req: Request, res: Response) => {
  try {
    const { desde, hasta } = parseDates(req);
    const { prevDesde, prevHasta } = prevPeriod(desde, hasta);
    const today = new Date();
    const asesorId = req.query.asesor_id ? Number(req.query.asesor_id) : null;
    const asesorFiltro = asesorId ? { asesor_id: asesorId } : {};

    const rangoFecha = { fecha_creacion: { [Op.between]: [desde, hasta] } };
    const prevRango  = { fecha_creacion: { [Op.between]: [prevDesde, prevHasta] } };

    const [
      odps_creadas, prev_odps_creadas,
      odps_facturadas,
      prospectos_nuevos, prospectos_convertidos,
      nc_abiertas, odps_pausadas,
    ] = await Promise.all([
      ODP.count({ where: { ...rangoFecha, ...asesorFiltro } }),
      ODP.count({ where: { ...prevRango, ...asesorFiltro } }),
      ODP.count({ where: { fecha_factura: { [Op.between]: [desde, hasta] }, estado_facturacion: 'FACTURADA', ...asesorFiltro } }),
      Prospecto.count({ where: { fecha_creacion: { [Op.between]: [desde, hasta] }, ...asesorFiltro } }),
      Prospecto.count({ where: { fecha_creacion: { [Op.between]: [desde, hasta] }, odp_id: { [Op.ne]: null }, ...asesorFiltro } }),
      NoConformidad.count({ where: { estado: { [Op.in]: ['ABIERTO', 'EN_PROCESO'] } } }),
      ODP.count({ where: { estado_produccion: 'PAUSADA', ...asesorFiltro } }),
    ]);

    // ODPs entregadas (transición en el período usando historial)
    const [entRows] = await sequelize.query<{ total: string }>(`
      SELECT COUNT(DISTINCT h.odp_id)::text AS total
      FROM historial_estados_odp h
      JOIN odp o ON o.id = h.odp_id
      WHERE h.estado_nuevo = 'ENTREGADA'
        AND h.fecha BETWEEN :desde AND :hasta
        ${asesorId ? 'AND o.asesor_id = :asesorId' : ''}
    `, { replacements: { desde, hasta, asesorId }, type: QueryTypes.SELECT });
    const odps_entregadas = Number((entRows as unknown as { total: string }).total) || 0;

    const [ventasRow] = await sequelize.query<{ vv: string; cr: string; pr: string }>(`
      SELECT
        COALESCE(SUM(valor_total), 0)                        AS vv,
        COALESCE(SUM(LEAST(valor_total, abono)), 0)          AS cr,
        COALESCE(SUM(GREATEST(0, valor_total - abono)), 0)   AS pr
      FROM odp
      WHERE fecha_creacion BETWEEN :desde AND :hasta
        AND valor_total > 0
        ${asesorId ? 'AND asesor_id = :asesorId' : ''}
    `, { replacements: { desde, hasta, asesorId }, type: QueryTypes.SELECT });

    const valor_vendido      = Number((ventasRow as any).vv || 0);
    const cobros_recibidos   = Number((ventasRow as any).cr || 0);
    const total_pendiente    = Number((ventasRow as any).pr || 0);

    const odps_atrasadas = await ODP.count({
      where: {
        fecha_entrega: { [Op.lt]: today },
        estado_produccion: { [Op.notIn]: ['ENTREGADA', 'INSTALADA', 'PAUSADA', 'LISTO_INSTALAR'] },
        estado_caja: { [Op.ne]: 'CANCELADO' },
        ...asesorFiltro
      }
    });

    const odps_listas_sin_programar = await ODP.count({
      where: { estado_produccion: 'LISTO_INSTALAR', ...asesorFiltro }
    });

    // Semáforo de salud
    const tasa_conversion = prospectos_nuevos > 0 ? Math.round((prospectos_convertidos / prospectos_nuevos) * 100) : 0;
    const semaforo = {
      comercial:  tasa_conversion >= 40 ? 'verde' : tasa_conversion >= 20 ? 'amarillo' : 'rojo',
      produccion: odps_atrasadas === 0 ? 'verde' : odps_atrasadas <= 3 ? 'amarillo' : 'rojo',
      finanzas:   valor_vendido > 0 && (total_pendiente / valor_vendido) < 0.3 ? 'verde'
                : valor_vendido > 0 && (total_pendiente / valor_vendido) < 0.6 ? 'amarillo' : 'rojo',
      calidad:    nc_abiertas === 0 ? 'verde' : nc_abiertas <= 3 ? 'amarillo' : 'rojo',
    };

    // KPIs por día (ODPs creadas por día en el período)
    const porDia = await sequelize.query<Record<string, unknown>>(`
      SELECT DATE(fecha_creacion)::text AS dia, COUNT(*)::int AS total
      FROM odp
      WHERE fecha_creacion BETWEEN :desde AND :hasta
        ${asesorId ? 'AND asesor_id = :asesorId' : ''}
      GROUP BY DATE(fecha_creacion)
      ORDER BY dia ASC
    `, { replacements: { desde, hasta, asesorId }, type: QueryTypes.SELECT });

    res.json({
      odps_creadas, odps_entregadas, odps_facturadas, odps_pausadas, odps_atrasadas,
      odps_listas_sin_programar,
      valor_vendido, cobros_recibidos, total_pendiente,
      prospectos_nuevos, prospectos_convertidos, tasa_conversion,
      nc_abiertas,
      delta_odps_creadas: deltaP(odps_creadas, prev_odps_creadas),
      semaforo,
      odps_por_dia: porDia,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[informe-ejecutivo/resumen]', msg);
    res.status(500).json({ error: msg });
  }
};

// ─── 2. ASESORES Y METAS ─────────────────────────────────────────────────────
export const getAsesores = async (req: Request, res: Response) => {
  try {
    const { desde, hasta } = parseDates(req);
    const asesorId = req.query.asesor_id ? Number(req.query.asesor_id) : null;
    const meses = mesesEntre(desde, hasta);
    const rangoFecha = { fecha_creacion: { [Op.between]: [desde, hasta] } };

    const asesores = await Usuario.findAll({
      where: { rol: { [Op.in]: ['asesor_comercial', 'gerencia', 'jefe_produccion'] } },
      attributes: ['id', 'nombre_completo', 'rol'],
    });

    const filtroAsesores = asesorId
      ? asesores.filter(a => a.getDataValue('id') === asesorId)
      : asesores;

    const ids = filtroAsesores.map(a => a.getDataValue('id'));

    const [realRows, recaudadoRows, pendienteRows, metaRows, prospNuevosRows, prospConvRows] = await Promise.all([
      ODP.findAll({
        attributes: ['asesor_id', [fn('SUM', col('valor_total')), 'total']],
        where: { ...rangoFecha, asesor_id: { [Op.in]: ids } },
        group: ['asesor_id'], raw: true,
      }) as unknown as Promise<{ asesor_id: number; total: string }[]>,

      ODP.findAll({
        attributes: ['asesor_id', [fn('SUM', col('abono')), 'total']],
        where: { ...rangoFecha, asesor_id: { [Op.in]: ids } },
        group: ['asesor_id'], raw: true,
      }) as unknown as Promise<{ asesor_id: number; total: string }[]>,

      ODP.findAll({
        attributes: ['asesor_id', [fn('SUM', col('pendiente')), 'total']],
        where: { asesor_id: { [Op.in]: ids }, estado_produccion: { [Op.ne]: 'ENTREGADA' }, estado_caja: { [Op.ne]: 'CANCELADO' } },
        group: ['asesor_id'], raw: true,
      }) as unknown as Promise<{ asesor_id: number; total: string }[]>,

      meses.length > 0
        ? MetaUsuarioMensual.findAll({
            attributes: ['usuario_id', [fn('SUM', col('meta_facturacion')), 'total']],
            where: { usuario_id: { [Op.in]: ids }, [Op.or]: meses.map(m => ({ anio: m.anio, mes: m.mes })) },
            group: ['usuario_id'], raw: true,
          }) as unknown as Promise<{ usuario_id: number; total: string }[]>
        : Promise.resolve([] as { usuario_id: number; total: string }[]),

      Prospecto.findAll({
        attributes: ['asesor_id', [fn('COUNT', col('id')), 'total']],
        where: { fecha_creacion: { [Op.between]: [desde, hasta] }, asesor_id: { [Op.in]: ids } },
        group: ['asesor_id'], raw: true,
      }) as unknown as Promise<{ asesor_id: number; total: string }[]>,

      Prospecto.findAll({
        attributes: ['asesor_id', [fn('COUNT', col('id')), 'total']],
        where: { fecha_creacion: { [Op.between]: [desde, hasta] }, asesor_id: { [Op.in]: ids }, odp_id: { [Op.ne]: null } },
        group: ['asesor_id'], raw: true,
      }) as unknown as Promise<{ asesor_id: number; total: string }[]>,
    ]);

    // ODPs del período por asesor
    const odpsPorAsesor = await ODP.findAll({
      attributes: ['asesor_id', [fn('COUNT', col('id')), 'total']],
      where: { ...rangoFecha, asesor_id: { [Op.in]: ids } },
      group: ['asesor_id'], raw: true,
    }) as unknown as { asesor_id: number; total: string }[];

    const asesoresData = filtroAsesores.map(a => {
      const uid = a.getDataValue('id') as number;
      const real      = Number(realRows.find(r => Number(r.asesor_id) === uid)?.total)      || 0;
      const recaudado = Number(recaudadoRows.find(r => Number(r.asesor_id) === uid)?.total) || 0;
      const pendiente = Number(pendienteRows.find(r => Number(r.asesor_id) === uid)?.total) || 0;
      const meta      = Number(metaRows.find(r => Number(r.usuario_id) === uid)?.total)     || 0;
      const prospectos_nuevos    = Number(prospNuevosRows.find(r => Number(r.asesor_id) === uid)?.total) || 0;
      const prospectos_convertidos = Number(prospConvRows.find(r => Number(r.asesor_id) === uid)?.total) || 0;
      const odps_periodo = Number(odpsPorAsesor.find(r => Number(r.asesor_id) === uid)?.total) || 0;
      const tasa_conversion = prospectos_nuevos > 0 ? Math.round((prospectos_convertidos / prospectos_nuevos) * 100) : 0;
      const pct_meta = meta > 0 ? Math.round((real / meta) * 100) : null;

      return {
        asesor_id: uid,
        nombre: a.getDataValue('nombre_completo'),
        rol: a.getDataValue('rol'),
        meta, real, recaudado, pendiente,
        pct_meta,
        odps_periodo,
        prospectos_nuevos, prospectos_convertidos, tasa_conversion,
      };
    }).sort((a, b) => b.real - a.real);

    res.json({ asesores: asesoresData });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[informe-ejecutivo/asesores]', msg);
    res.status(500).json({ error: msg });
  }
};

// ─── 3. PRODUCCIÓN CRÍTICA ────────────────────────────────────────────────────
export const getProduccionCritica = async (req: Request, res: Response) => {
  try {
    const { desde, hasta } = parseDates(req);
    const today = new Date();
    const asesorId = req.query.asesor_id ? Number(req.query.asesor_id) : null;
    const busqueda = req.query.busqueda as string | undefined;
    const asesorFiltro = asesorId ? { asesor_id: asesorId } : {};
    const buscadorFiltro = buildBuscadorWhere(busqueda);

    const includeBase = [
      { model: Cliente, as: 'cliente', attributes: ['nombre_razon_social'] },
      { model: Usuario, as: 'asesor',  attributes: ['nombre_completo'] },
    ];

    // A) Material listo que sigue en producción (fecha_listo_instalar ya pasó pero no avanzó)
    const material_en_produccion = await ODP.findAll({
      where: {
        fecha_listo_instalar: { [Op.lt]: today, [Op.ne]: null },
        estado_produccion: { [Op.notIn]: ['LISTO_INSTALAR', 'PROGRAMADA', 'INSTALADA', 'ENTREGADA', 'PAUSADA'] },
        estado_caja: { [Op.ne]: 'CANCELADO' },
        ...asesorFiltro, ...buscadorFiltro,
      },
      include: includeBase,
      attributes: [
        'id', 'numero_odp', 'estado_produccion', 'fecha_listo_instalar',
        'fecha_entrega', 'valor_total', 'pendiente',
        'chk_medicion', 'chk_corte', 'chk_vidrio', 'chk_accesorios',
        'chk_ensamble', 'chk_matizado', 'chk_pelicula', 'chk_huacal', 'chk_carton',
      ],
      order: [['fecha_listo_instalar', 'ASC']],
    });

    const materialListoData = material_en_produccion.map(o => {
      const fli = new Date(o.getDataValue('fecha_listo_instalar'));
      const diasRetraso = Math.ceil((today.getTime() - fli.getTime()) / (1000 * 3600 * 24));
      return {
        id:                 o.getDataValue('id'),
        numero_odp:         o.getDataValue('numero_odp'),
        cliente:            (o as unknown as { cliente?: { nombre_razon_social: string } }).cliente?.nombre_razon_social || '',
        asesor:             (o as unknown as { asesor?: { nombre_completo: string } }).asesor?.nombre_completo || '',
        estado_produccion:  o.getDataValue('estado_produccion'),
        fecha_listo_instalar: o.getDataValue('fecha_listo_instalar'),
        fecha_entrega:      o.getDataValue('fecha_entrega'),
        valor_total:        Number(o.getDataValue('valor_total')),
        pendiente:          Number(o.getDataValue('pendiente')),
        dias_retraso:       diasRetraso,
        checkboxes: {
          chk_medicion:   o.getDataValue('chk_medicion'),
          chk_corte:      o.getDataValue('chk_corte'),
          chk_vidrio:     o.getDataValue('chk_vidrio'),
          chk_accesorios: o.getDataValue('chk_accesorios'),
          chk_ensamble:   o.getDataValue('chk_ensamble'),
          chk_matizado:   o.getDataValue('chk_matizado'),
          chk_pelicula:   o.getDataValue('chk_pelicula'),
          chk_huacal:     o.getDataValue('chk_huacal'),
          chk_carton:     o.getDataValue('chk_carton'),
        },
      };
    });

    // B) Listas sin programar (LISTO_INSTALAR no asignadas a ruta activa)
    const listasIds = await ODP.findAll({
      where: { estado_produccion: 'LISTO_INSTALAR', ...asesorFiltro, ...buscadorFiltro },
      attributes: ['id'],
    });
    const listasIdArr = listasIds.map(o => o.getDataValue('id') as number);
    const programadasIds = listasIdArr.length > 0
      ? (await RutaODP.findAll({
          where: { odp_id: { [Op.in]: listasIdArr }, estado: { [Op.ne]: 'completada' } },
          attributes: ['odp_id'],
        })).map(r => r.getDataValue('odp_id') as number)
      : [];
    const noProgramadasIds = listasIdArr.filter(id => !programadasIds.includes(id));

    const listas_sin_programar = noProgramadasIds.length > 0
      ? await ODP.findAll({
          where: { id: { [Op.in]: noProgramadasIds } },
          include: includeBase,
          attributes: ['id', 'numero_odp', 'estado_produccion', 'fecha_entrega', 'valor_total', 'pendiente', 'fecha_listo_instalar'],
          order: [['fecha_listo_instalar', 'ASC']],
        })
      : [];

    const listasSinProgramarData = listas_sin_programar.map(o => {
      const fli = o.getDataValue('fecha_listo_instalar');
      const diasLista = fli ? Math.ceil((today.getTime() - new Date(fli).getTime()) / (1000 * 3600 * 24)) : null;
      return {
        id:               o.getDataValue('id'),
        numero_odp:       o.getDataValue('numero_odp'),
        cliente:          (o as unknown as { cliente?: { nombre_razon_social: string } }).cliente?.nombre_razon_social || '',
        asesor:           (o as unknown as { asesor?: { nombre_completo: string } }).asesor?.nombre_completo || '',
        fecha_entrega:    o.getDataValue('fecha_entrega'),
        fecha_listo_instalar: fli,
        valor_total:      Number(o.getDataValue('valor_total')),
        pendiente:        Number(o.getDataValue('pendiente')),
        dias_lista:       diasLista,
      };
    });

    // C) Atrasadas (fecha_entrega vencida, no entregadas)
    const atrasadas_raw = await ODP.findAll({
      where: {
        fecha_entrega: { [Op.lt]: today },
        estado_produccion: { [Op.notIn]: ['ENTREGADA', 'INSTALADA', 'PAUSADA', 'LISTO_INSTALAR'] },
        estado_caja: { [Op.ne]: 'CANCELADO' },
        ...asesorFiltro, ...buscadorFiltro,
      },
      include: includeBase,
      attributes: ['id', 'numero_odp', 'estado_produccion', 'fecha_entrega', 'valor_total', 'pendiente'],
      order: [['fecha_entrega', 'ASC']],
    });

    const atrasadasData = atrasadas_raw.map(o => {
      const dias = Math.ceil((today.getTime() - new Date(o.getDataValue('fecha_entrega')).getTime()) / (1000 * 3600 * 24));
      return {
        id:               o.getDataValue('id'),
        numero_odp:       o.getDataValue('numero_odp'),
        cliente:          (o as unknown as { cliente?: { nombre_razon_social: string } }).cliente?.nombre_razon_social || '',
        asesor:           (o as unknown as { asesor?: { nombre_completo: string } }).asesor?.nombre_completo || '',
        estado_produccion:o.getDataValue('estado_produccion'),
        fecha_entrega:    o.getDataValue('fecha_entrega'),
        valor_total:      Number(o.getDataValue('valor_total')),
        pendiente:        Number(o.getDataValue('pendiente')),
        dias_retraso:     dias,
      };
    });

    // D) ODPs pausadas
    const pausadas_raw = await ODP.findAll({
      where: { estado_produccion: 'PAUSADA', ...asesorFiltro, ...buscadorFiltro },
      include: includeBase,
      attributes: ['id', 'numero_odp', 'fecha_creacion', 'valor_total', 'pendiente', 'observaciones'],
      order: [['fecha_creacion', 'ASC']],
    });
    const pausadasData = pausadas_raw.map(o => ({
      id:           o.getDataValue('id'),
      numero_odp:   o.getDataValue('numero_odp'),
      cliente:      (o as unknown as { cliente?: { nombre_razon_social: string } }).cliente?.nombre_razon_social || '',
      asesor:       (o as unknown as { asesor?: { nombre_completo: string } }).asesor?.nombre_completo || '',
      fecha_creacion: o.getDataValue('fecha_creacion'),
      valor_total:  Number(o.getDataValue('valor_total')),
      pendiente:    Number(o.getDataValue('pendiente')),
    }));

    // E) Embudo: ODPs activas por estado
    const embudoRaw = await ODP.findAll({
      attributes: ['estado_produccion', [fn('COUNT', col('id')), 'total']],
      where: { estado_produccion: { [Op.notIn]: ['ENTREGADA'] }, estado_caja: { [Op.ne]: 'CANCELADO' }, ...asesorFiltro },
      group: ['estado_produccion'],
      raw: true,
    }) as unknown as { estado_produccion: string; total: string }[];

    const ORDEN_ESTADOS = [
      'EN_ESPERA','VISITA_TECNICA','MEDICION','PEDIDO_PROVEEDOR','ALUMINIO_CORTADO',
      'VIDRIO_RECIBIDO','ACCESORIOS_SEPARADOS','LISTO_INSTALAR','PROGRAMADA','INSTALADA','PAUSADA',
    ];
    const embudo = ORDEN_ESTADOS.map(e => ({
      estado: e,
      total: Number(embudoRaw.find(r => r.estado_produccion === e)?.total) || 0,
    }));

    res.json({
      material_en_produccion: materialListoData,
      listas_sin_programar: listasSinProgramarData,
      atrasadas: atrasadasData,
      pausadas: pausadasData,
      embudo,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[informe-ejecutivo/produccion-critica]', msg);
    res.status(500).json({ error: msg });
  }
};

// ─── 4. FINANCIERO Y CARTERA ──────────────────────────────────────────────────
export const getFinanciero = async (req: Request, res: Response) => {
  try {
    const { desde, hasta } = parseDates(req);
    const asesorId = req.query.asesor_id ? Number(req.query.asesor_id) : null;
    const busqueda = req.query.busqueda as string | undefined;
    const asesorFiltro  = asesorId ? { asesor_id: asesorId } : {};
    const buscadorFiltro = buildBuscadorWhere(busqueda);
    const meses = mesesEntre(desde, hasta);

    const [
      valor_facturado, cobros_recibidos,
      total_pendiente_activo,
      proyeccion_valor,
    ] = await Promise.all([
      ODP.sum('valor_total', { where: { fecha_factura: { [Op.between]: [desde, hasta] }, estado_facturacion: 'FACTURADA', ...asesorFiltro } }),
      Pago.sum('monto',      { where: { fecha: { [Op.between]: [desde, hasta] } } }),
      ODP.sum('pendiente',   { where: { estado_produccion: { [Op.notIn]: ['ENTREGADA'] }, estado_caja: { [Op.ne]: 'CANCELADO' }, pendiente: { [Op.gt]: 0 }, ...asesorFiltro } }),
      ODP.sum('valor_total', { where: { estado_produccion: { [Op.in]: ['LISTO_INSTALAR', 'PROGRAMADA'] }, estado_caja: { [Op.ne]: 'CANCELADO' }, ...asesorFiltro } }),
    ]);

    // Meta empresa del período (suma de metas de todos los usuarios)
    const meta_empresa = meses.length > 0
      ? Number(await MetaUsuarioMensual.sum('meta_facturacion', {
          where: { [Op.or]: meses.map(m => ({ anio: m.anio, mes: m.mes })) }
        }) || 0)
      : 0;

    // ODPs con material listo sin haber pagado
    const mat_listo_sin_pagar = await ODP.findAll({
      where: {
        fecha_listo_instalar: { [Op.ne]: null },
        pendiente: { [Op.gt]: 0 },
        estado_produccion: { [Op.notIn]: ['ENTREGADA'] },
        estado_caja: { [Op.ne]: 'CANCELADO' },
        ...asesorFiltro, ...buscadorFiltro,
      },
      include: [
        { model: Cliente, as: 'cliente', attributes: ['nombre_razon_social'] },
        { model: Usuario, as: 'asesor',  attributes: ['nombre_completo'] },
      ],
      attributes: ['id', 'numero_odp', 'valor_total', 'pendiente', 'abono', 'forma_pago', 'fecha_listo_instalar'],
      order: [['pendiente', 'DESC']],
    });

    const matListoData = mat_listo_sin_pagar.map(o => ({
      id:           o.getDataValue('id'),
      numero_odp:   o.getDataValue('numero_odp'),
      cliente:      (o as unknown as { cliente?: { nombre_razon_social: string } }).cliente?.nombre_razon_social || '',
      asesor:       (o as unknown as { asesor?: { nombre_completo: string } }).asesor?.nombre_completo || '',
      valor_total:  Number(o.getDataValue('valor_total')),
      abono:        Number(o.getDataValue('abono')),
      pendiente:    Number(o.getDataValue('pendiente')),
      forma_pago:   o.getDataValue('forma_pago'),
      fecha_listo_instalar: o.getDataValue('fecha_listo_instalar'),
    }));

    // Cartera por cliente (top 15)
    const carteraRows = await sequelize.query<Record<string, unknown>>(`
      SELECT c.nombre_razon_social AS cliente, SUM(o.pendiente)::numeric AS total
      FROM odp o
      JOIN clientes c ON c.id = o.cliente_id
      WHERE o.pendiente > 0
        AND o.estado_produccion <> 'ENTREGADA'
        AND o.estado_caja <> 'CANCELADO'
        ${asesorId ? 'AND o.asesor_id = :asesorId' : ''}
      GROUP BY c.nombre_razon_social
      ORDER BY total DESC
      LIMIT 15
    `, { replacements: { asesorId }, type: QueryTypes.SELECT });

    // Distribución por forma de pago
    const distribucionRaw = await ODP.findAll({
      attributes: ['forma_pago', [fn('COUNT', col('id')), 'total'], [fn('SUM', col('valor_total')), 'valor']],
      where: { fecha_creacion: { [Op.between]: [desde, hasta] }, ...asesorFiltro },
      group: ['forma_pago'],
      raw: true,
    }) as unknown as { forma_pago: string; total: string; valor: string }[];

    // ODPs crédito aprobado pendientes
    const credito_aprobado_raw = await ODP.findAll({
      where: { estado_caja: 'CREDITO_APROBADO', estado_produccion: { [Op.notIn]: ['ENTREGADA'] }, ...asesorFiltro, ...buscadorFiltro },
      include: [
        { model: Cliente, as: 'cliente', attributes: ['nombre_razon_social'] },
        { model: Usuario, as: 'asesor',  attributes: ['nombre_completo'] },
      ],
      attributes: ['id', 'numero_odp', 'valor_total', 'pendiente', 'estado_produccion'],
      order: [['pendiente', 'DESC']],
    });
    const creditoAprobadoData = credito_aprobado_raw.map(o => ({
      id:               o.getDataValue('id'),
      numero_odp:       o.getDataValue('numero_odp'),
      cliente:          (o as unknown as { cliente?: { nombre_razon_social: string } }).cliente?.nombre_razon_social || '',
      asesor:           (o as unknown as { asesor?: { nombre_completo: string } }).asesor?.nombre_completo || '',
      valor_total:      Number(o.getDataValue('valor_total')),
      pendiente:        Number(o.getDataValue('pendiente')),
      estado_produccion:o.getDataValue('estado_produccion'),
    }));

    res.json({
      valor_facturado:        Number(valor_facturado || 0),
      cobros_recibidos:       Number(cobros_recibidos || 0),
      total_pendiente_activo: Number(total_pendiente_activo || 0),
      proyeccion_valor:       Number(proyeccion_valor || 0),
      meta_empresa,
      mat_listo_sin_pagar:    matListoData,
      cartera_por_cliente:    carteraRows,
      distribucion_forma_pago: distribucionRaw,
      credito_aprobado:       creditoAprobadoData,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[informe-ejecutivo/financiero]', msg);
    res.status(500).json({ error: msg });
  }
};

// ─── 5. CALIDAD Y NO CONFORMIDADES ───────────────────────────────────────────
export const getCalidad = async (req: Request, res: Response) => {
  try {
    const { desde, hasta } = parseDates(req);
    const busqueda = req.query.busqueda as string | undefined;

    const rangoNC = { creado_en: { [Op.between]: [desde, hasta] } };

    const [total_nc, cerradas_nc] = await Promise.all([
      NoConformidad.count({ where: rangoNC }),
      NoConformidad.count({ where: { ...rangoNC, estado: 'CERRADO' } }),
    ]);
    const tasa_cierre = total_nc > 0 ? Math.round((cerradas_nc / total_nc) * 100) : 0;

    // Por estado
    const por_estado_raw = await NoConformidad.findAll({
      attributes: ['estado', [fn('COUNT', col('id')), 'total']],
      where: rangoNC,
      group: ['estado'], raw: true,
    }) as unknown as { estado: string; total: string }[];

    // Por tipo de error
    const por_tipo_raw = await NoConformidad.findAll({
      attributes: ['tipo_error', [fn('COUNT', col('id')), 'total'], [fn('SUM', col('costo_total')), 'costo']],
      where: rangoNC,
      group: ['tipo_error'], raw: true,
    }) as unknown as { tipo_error: string; total: string; costo: string }[];

    // Por área
    const por_area_raw = await NoConformidad.findAll({
      attributes: ['area_error', [fn('COUNT', col('id')), 'total']],
      where: { ...rangoNC, area_error: { [Op.ne]: null } },
      group: ['area_error'], order: [[fn('COUNT', col('id')), 'DESC']], raw: true,
    }) as unknown as { area_error: string; total: string }[];

    const costo_total = Number(await NoConformidad.sum('costo_total', { where: rangoNC }) || 0);

    const nc_con_odp_hija = await NoConformidad.count({
      where: { ...rangoNC, nueva_odp_id: { [Op.ne]: null } },
    });

    // Top responsables
    const top_responsables_raw = await NoConformidad.findAll({
      attributes: ['responsable', [fn('COUNT', col('id')), 'total']],
      where: { ...rangoNC, responsable: { [Op.ne]: null } },
      group: ['responsable'], order: [[fn('COUNT', col('id')), 'DESC']], limit: 8, raw: true,
    }) as unknown as { responsable: string; total: string }[];

    // Detalle NC con buscador
    const ncDetalle = await NoConformidad.findAll({
      where: {
        ...rangoNC,
        ...(busqueda ? { numero_reporte: { [Op.iLike]: `%${busqueda}%` } } : {}),
      },
      include: [
        { model: ODP, as: 'odp', attributes: ['numero_odp'] },
      ],
      attributes: ['id', 'numero_reporte', 'tipo_error', 'area_error', 'responsable', 'costo_total', 'estado', 'creado_en'],
      order: [['creado_en', 'DESC']],
      limit: 50,
    });

    // ODPs con daño en instalación del período
    const odps_con_dano = await ODP.count({
      where: { tiene_dano_instalacion: true, fecha_creacion: { [Op.between]: [desde, hasta] } },
    });

    res.json({
      total_nc, cerradas_nc, tasa_cierre,
      costo_total, nc_con_odp_hija, odps_con_dano,
      por_estado:  por_estado_raw.map(r => ({ estado: r.estado, total: Number(r.total) })),
      por_tipo:    por_tipo_raw.map(r => ({ tipo: r.tipo_error, total: Number(r.total), costo: Number(r.costo || 0) })),
      por_area:    por_area_raw.map(r => ({ area: r.area_error || 'Sin área', total: Number(r.total) })),
      top_responsables: top_responsables_raw.map(r => ({ responsable: r.responsable, total: Number(r.total) })),
      nc_detalle: ncDetalle.map(n => ({
        id:             n.getDataValue('id'),
        numero_reporte: n.getDataValue('numero_reporte'),
        tipo_error:     n.getDataValue('tipo_error'),
        area_error:     n.getDataValue('area_error'),
        responsable:    n.getDataValue('responsable'),
        costo_total:    Number(n.getDataValue('costo_total')),
        estado:         n.getDataValue('estado'),
        fecha:          n.getDataValue('creado_en'),
        odp:            (n as unknown as { odp?: { numero_odp: string } }).odp?.numero_odp || null,
      })),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[informe-ejecutivo/calidad]', msg);
    res.status(500).json({ error: msg });
  }
};

// ─── 6. RECOMENDACIONES AUTOMÁTICAS ──────────────────────────────────────────
export const getRecomendaciones = async (req: Request, res: Response) => {
  try {
    const { desde, hasta } = parseDates(req);
    const today = new Date();
    const alertas: {
      nivel: 'critico' | 'moderado' | 'atencion';
      area:  'produccion' | 'comercial' | 'finanzas' | 'calidad';
      titulo: string;
      descripcion: string;
      accion: string;
    }[] = [];

    // ── PRODUCCIÓN ────────────────────────────────────────────
    const atrasadas_count = await ODP.count({
      where: {
        fecha_entrega: { [Op.lt]: today },
        estado_produccion: { [Op.notIn]: ['ENTREGADA', 'INSTALADA', 'PAUSADA', 'LISTO_INSTALAR'] },
        estado_caja: { [Op.ne]: 'CANCELADO' },
      },
    });
    if (atrasadas_count > 0) {
      alertas.push({
        nivel: atrasadas_count >= 5 ? 'critico' : 'moderado',
        area: 'produccion',
        titulo: `${atrasadas_count} ODPs con fecha de entrega vencida`,
        descripcion: `Hay ${atrasadas_count} orden${atrasadas_count > 1 ? 'es' : ''} cuya fecha de entrega ya pasó y aún no han sido entregadas.`,
        accion: 'Revisar el estado de producción de cada ODP atrasada y definir nuevo compromiso con el cliente.',
      });
    }

    const listas_count = await ODP.count({ where: { estado_produccion: 'LISTO_INSTALAR' } });
    if (listas_count > 0) {
      alertas.push({
        nivel: listas_count >= 4 ? 'moderado' : 'atencion',
        area: 'produccion',
        titulo: `${listas_count} ODPs listas para instalar sin programar`,
        descripcion: `Hay ${listas_count} ODP${listas_count > 1 ? 's' : ''} en estado LISTO_INSTALAR que no han sido asignadas a ninguna ruta de instalación.`,
        accion: 'Coordinar con logística para programar las instalaciones pendientes esta semana.',
      });
    }

    const mat_listo_produccion = await ODP.count({
      where: {
        fecha_listo_instalar: { [Op.lt]: today, [Op.ne]: null },
        estado_produccion: { [Op.notIn]: ['LISTO_INSTALAR', 'PROGRAMADA', 'INSTALADA', 'ENTREGADA', 'PAUSADA'] },
        estado_caja: { [Op.ne]: 'CANCELADO' },
      },
    });
    if (mat_listo_produccion > 0) {
      alertas.push({
        nivel: 'moderado',
        area: 'produccion',
        titulo: `${mat_listo_produccion} ODPs pasaron su fecha de material listo`,
        descripcion: `La fecha de listo de material ya venció en ${mat_listo_produccion} ODP${mat_listo_produccion > 1 ? 's' : ''} que aún no completan producción.`,
        accion: 'Verificar checkboxes de producción y liberar cuellos de botella en planta.',
      });
    }

    const pausadas_count = await ODP.count({ where: { estado_produccion: 'PAUSADA' } });
    if (pausadas_count > 0) {
      alertas.push({
        nivel: 'atencion',
        area: 'produccion',
        titulo: `${pausadas_count} ODPs en estado PAUSADA`,
        descripcion: `Hay ${pausadas_count} ODP${pausadas_count > 1 ? 's' : ''} pausadas. Revisar si alguna puede reactivarse.`,
        accion: 'Evaluar cada ODP pausada y determinar si el motivo de pausa ya fue resuelto.',
      });
    }

    // ── COMERCIAL ────────────────────────────────────────────
    const prosp_nuevos = await Prospecto.count({ where: { fecha_creacion: { [Op.between]: [desde, hasta] } } });
    const prosp_conv   = await Prospecto.count({ where: { fecha_creacion: { [Op.between]: [desde, hasta] }, odp_id: { [Op.ne]: null } } });
    const tasa = prosp_nuevos > 0 ? Math.round((prosp_conv / prosp_nuevos) * 100) : 0;
    if (prosp_nuevos > 0 && tasa < 30) {
      alertas.push({
        nivel: tasa < 15 ? 'critico' : 'moderado',
        area: 'comercial',
        titulo: `Tasa de conversión baja: ${tasa}%`,
        descripcion: `Solo ${prosp_conv} de ${prosp_nuevos} prospectos se convirtieron en ODP en el período seleccionado.`,
        accion: 'Analizar por asesor cuáles prospectos quedaron sin seguimiento y definir acciones de recuperación.',
      });
    }

    // Asesores bajo meta
    const meses = mesesEntre(desde, hasta);
    const asesoresConMeta = meses.length > 0
      ? await MetaUsuarioMensual.findAll({
          where: { [Op.or]: meses.map(m => ({ anio: m.anio, mes: m.mes })) },
          attributes: ['usuario_id', [fn('SUM', col('meta_facturacion')), 'meta_total']],
          group: ['usuario_id'], raw: true,
        }) as unknown as { usuario_id: number; meta_total: string }[]
      : [];

    const bajoMetaCount = await Promise.all(
      asesoresConMeta.map(async m => {
        const real = Number(await ODP.sum('valor_total', {
          where: { asesor_id: m.usuario_id, fecha_creacion: { [Op.between]: [desde, hasta] } },
        }) || 0);
        return real < Number(m.meta_total) * 0.7;
      })
    );
    const aAsesoresBajoMeta = bajoMetaCount.filter(Boolean).length;
    if (aAsesoresBajoMeta > 0) {
      alertas.push({
        nivel: 'moderado',
        area: 'comercial',
        titulo: `${aAsesoresBajoMeta} asesor${aAsesoresBajoMeta > 1 ? 'es' : ''} por debajo del 70% de su meta`,
        descripcion: `Estos asesores no alcanzaron el 70% de su meta de facturación en el período.`,
        accion: 'Revisar pipeline de cada asesor y definir acciones de cierre de negocios.',
      });
    }

    // ── FINANZAS ────────────────────────────────────────────
    const total_pendiente = Number(await ODP.sum('pendiente', {
      where: { estado_produccion: { [Op.notIn]: ['ENTREGADA'] }, estado_caja: { [Op.ne]: 'CANCELADO' }, pendiente: { [Op.gt]: 0 } },
    }) || 0);
    if (total_pendiente > 0) {
      alertas.push({
        nivel: total_pendiente > 50000000 ? 'critico' : 'moderado',
        area: 'finanzas',
        titulo: `$${total_pendiente.toLocaleString('es-CO')} pendiente por recoger`,
        descripcion: `La cartera activa total asciende a $${total_pendiente.toLocaleString('es-CO')} en ODPs que aún no han sido cobradas completamente.`,
        accion: 'Priorizar gestión de cobro comenzando por los clientes con mayor saldo pendiente.',
      });
    }

    const mat_sin_pagar_count = await ODP.count({
      where: {
        fecha_listo_instalar: { [Op.ne]: null },
        pendiente: { [Op.gt]: 0 },
        estado_produccion: { [Op.notIn]: ['ENTREGADA'] },
        estado_caja: { [Op.ne]: 'CANCELADO' },
      },
    });
    if (mat_sin_pagar_count > 0) {
      alertas.push({
        nivel: 'moderado',
        area: 'finanzas',
        titulo: `${mat_sin_pagar_count} ODPs con material listo sin pago completo`,
        descripcion: `Hay ODPs cuyo material ya está listo pero el cliente no ha pagado el saldo pendiente.`,
        accion: 'Contactar a los clientes para gestionar el pago antes de coordinar la instalación.',
      });
    }

    // ── CALIDAD ────────────────────────────────────────────
    const nc_abiertas = await NoConformidad.count({ where: { estado: { [Op.in]: ['ABIERTO', 'EN_PROCESO'] } } });
    if (nc_abiertas > 0) {
      alertas.push({
        nivel: nc_abiertas >= 5 ? 'critico' : nc_abiertas >= 3 ? 'moderado' : 'atencion',
        area: 'calidad',
        titulo: `${nc_abiertas} No Conformidades abiertas`,
        descripcion: `Hay ${nc_abiertas} NC en estado ABIERTO o EN_PROCESO que requieren seguimiento.`,
        accion: 'Asignar responsables y fechas de cierre para cada NC abierta.',
      });
    }

    const nc_periodo = await NoConformidad.count({ where: { creado_en: { [Op.between]: [desde, hasta] } } });
    const nc_rep = await NoConformidad.count({ where: { creado_en: { [Op.between]: [desde, hasta] }, tipo_error: 'REPROCESO' } });
    if (nc_rep > 0 && nc_periodo > 0) {
      const pct_rep = Math.round((nc_rep / nc_periodo) * 100);
      if (pct_rep >= 40) {
        alertas.push({
          nivel: 'moderado',
          area: 'calidad',
          titulo: `${pct_rep}% de las NC son Reprocesamientos`,
          descripcion: `Los reprocesamientos representan ${pct_rep}% de las no conformidades del período.`,
          accion: 'Revisar el proceso de producción para identificar la causa raíz de los reprocesamientos.',
        });
      }
    }

    // Ordenar: críticos primero
    const orden = { critico: 0, moderado: 1, atencion: 2 };
    alertas.sort((a, b) => orden[a.nivel] - orden[b.nivel]);

    res.json({ alertas, total: alertas.length });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[informe-ejecutivo/recomendaciones]', msg);
    res.status(500).json({ error: msg });
  }
};
