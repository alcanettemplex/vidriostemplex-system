import { Request, Response } from 'express';
import { QueryTypes } from 'sequelize';
import https from 'https';
import http from 'http';
import sequelize from '../config/database';
import AuditoriaLog from '../models/auditoria_log.model';
import AlertasUmbral from '../models/alertas_umbral.model';
import { Op } from 'sequelize';
import jwt from 'jsonwebtoken';
import { cronPVStatus, getWSCount } from '../server';
import { getRateLimitStats } from '../middlewares/rateLimiter';

const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF || '';
const SUPABASE_MANAGEMENT_TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN || '';
const CLOUDINARY_CLOUD = process.env.CLOUDINARY_CLOUD_NAME || '';
const CLOUDINARY_KEY = process.env.CLOUDINARY_API_KEY || '';
const CLOUDINARY_SECRET = process.env.CLOUDINARY_API_SECRET || '';

// ─── Límites del plan free ────────────────────────────────────────────────────
const SUPABASE_FREE = {
  db_mb: 500,
  bandwidth_gb: 5,
  storage_gb: 1,
  max_connections: 60,
};
const CLOUDINARY_FREE = {
  storage_gb: 25,
  bandwidth_gb: 25,
  transformations: 25000,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function httpGet(url: string, headers: Record<string, string> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function pingService(name: string, url: string): Promise<{ name: string; url: string; status: 'online' | 'offline' | 'slow'; responseMs: number }> {
  const start = Date.now();
  try {
    const res = await httpGet(url);
    const ms = Date.now() - start;
    const ok = res.status && res.status >= 200 && res.status < 400;
    return { name, url, status: ok ? (ms > 2000 ? 'slow' : 'online') : 'offline', responseMs: ms };
  } catch {
    return { name, url, status: 'offline', responseMs: Date.now() - start };
  }
}

// ─── MÉTRICAS SUPABASE ───────────────────────────────────────────────────────
export const getMetricasSupabase = async (_req: Request, res: Response) => {
  try {
    // Tamaño total de la base de datos
    const [dbSize]: any[] = await sequelize.query(
      `SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size,
              pg_database_size(current_database()) AS db_bytes`,
      { type: QueryTypes.SELECT }
    );

    // Tamaño por tabla
    const tableSizes: any[] = await sequelize.query(
      `SELECT
         schemaname,
         tablename,
         pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size_pretty,
         pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes,
         (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_schema = t.schemaname AND table_name = t.tablename) AS column_count
       FROM pg_tables t
       WHERE schemaname = 'public'
       ORDER BY size_bytes DESC`,
      { type: QueryTypes.SELECT }
    );

    // Conexiones activas — resumen
    const [connections]: any[] = await sequelize.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE state = 'active') AS active,
              COUNT(*) FILTER (WHERE state = 'idle') AS idle
       FROM pg_stat_activity
       WHERE datname = current_database()`,
      { type: QueryTypes.SELECT }
    );

    // Detalle de cada conexión
    const conexionesDetalle: any[] = await sequelize.query(
      `SELECT
         pid,
         COALESCE(application_name, '—') AS application_name,
         COALESCE(state, '—') AS state,
         COALESCE(client_addr::text, 'local') AS client_addr,
         COALESCE(usename, '—') AS usename,
         COALESCE(to_char(query_start, 'HH24:MI:SS'), '—') AS query_start,
         COALESCE(left(query, 100), '—') AS ultima_query
       FROM pg_stat_activity
       WHERE datname = current_database()
         AND pid <> pg_backend_pid()
       ORDER BY state, query_start DESC NULLS LAST`,
      { type: QueryTypes.SELECT }
    );

    // Conteo de tablas
    const [tableCount]: any[] = await sequelize.query(
      `SELECT COUNT(*) AS total FROM pg_tables WHERE schemaname = 'public'`,
      { type: QueryTypes.SELECT }
    );

    const dbMb = Math.round(Number(dbSize.db_bytes) / 1024 / 1024);
    const dbPct = Math.round((dbMb / SUPABASE_FREE.db_mb) * 100);

    res.json({
      db_size: dbSize.db_size,
      db_mb: dbMb,
      db_pct: dbPct,
      limite_mb: SUPABASE_FREE.db_mb,
      conexiones: {
        total: Number(connections.total),
        activas: Number(connections.active),
        inactivas: Number(connections.idle),
        limite: SUPABASE_FREE.max_connections,
        pct: Math.round((Number(connections.total) / SUPABASE_FREE.max_connections) * 100),
        detalle: conexionesDetalle,
      },
      tabla_count: Number(tableCount.total),
      tablas: tableSizes,
      plan: 'Free',
      limites: SUPABASE_FREE,
    });
  } catch (error) {
    console.error('Error métricas Supabase:', error);
    res.status(500).json({ error: 'Error al obtener métricas de base de datos' });
  }
};

// ─── MÉTRICAS CLOUDINARY ─────────────────────────────────────────────────────
export const getMetricasCloudinary = async (_req: Request, res: Response) => {
  try {
    const auth = Buffer.from(`${CLOUDINARY_KEY}:${CLOUDINARY_SECRET}`).toString('base64');
    const result = await httpGet(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/usage`,
      { Authorization: `Basic ${auth}` }
    );

    if (result.status !== 200) {
      return res.status(500).json({ error: 'Error al obtener métricas de Cloudinary' });
    }

    const data = result.body;
    const storageUsedGb = (data.storage?.usage || 0) / 1024 / 1024 / 1024;
    const bandwidthUsedGb = (data.bandwidth?.usage || 0) / 1024 / 1024 / 1024;

    res.json({
      storage: {
        usado_gb: Math.round(storageUsedGb * 100) / 100,
        limite_gb: CLOUDINARY_FREE.storage_gb,
        pct: Math.round((storageUsedGb / CLOUDINARY_FREE.storage_gb) * 100),
        creditos: data.storage?.credits_usage || 0,
      },
      bandwidth: {
        usado_gb: Math.round(bandwidthUsedGb * 100) / 100,
        limite_gb: CLOUDINARY_FREE.bandwidth_gb,
        pct: Math.round((bandwidthUsedGb / CLOUDINARY_FREE.bandwidth_gb) * 100),
      },
      transformaciones: {
        usadas: data.transformations?.usage || 0,
        limite: CLOUDINARY_FREE.transformations,
        pct: Math.round(((data.transformations?.usage || 0) / CLOUDINARY_FREE.transformations) * 100),
      },
      recursos: {
        imagenes: data.resources || 0,
        videos: data.video_count || 0,
        total_archivos: (data.resources || 0) + (data.video_count || 0),
      },
      plan: data.plan || 'Free',
      ultimo_reset: data.last_updated,
    });
  } catch (error) {
    console.error('Error métricas Cloudinary:', error);
    res.status(500).json({ error: 'Error al obtener métricas de Cloudinary' });
  }
};

// ─── HEALTH CHECKS ───────────────────────────────────────────────────────────
export const getHealthServicios = async (req: Request, res: Response) => {
  const FRONTEND_URL = process.env.FRONTEND_URL || 'https://vidriostemplex-system.pages.dev';
  const BACKEND_URL = process.env.BACKEND_URL || 'https://vidriostemplex-system.onrender.com';

  // Verificar Supabase via query directa a la BD (más confiable que HTTP ping)
  let supabaseStatus: 'online' | 'offline' | 'slow' = 'offline';
  let supabaseMs = 0;
  try {
    const t0 = Date.now();
    await sequelize.query('SELECT 1');
    supabaseMs = Date.now() - t0;
    supabaseStatus = supabaseMs > 2000 ? 'slow' : 'online';
  } catch { supabaseStatus = 'offline'; }

  // Verificar Cloudinary via su página de status pública
  const cloudinaryPing = await pingService(
    'Cloudinary',
    'https://status.cloudinary.com/api/v2/status.json'
  );

  const servicios = [
    { name: 'Backend (API)', url: `${BACKEND_URL}/health` },
    { name: 'Frontend (Cloudflare)', url: FRONTEND_URL },
    { name: 'Supabase (BD)', url: `https://${SUPABASE_PROJECT_REF}.supabase.co` },
    { name: 'Cloudinary', url: 'https://status.cloudinary.com/api/v2/status.json' },
    { name: 'GitHub Status', url: 'https://www.githubstatus.com/api/v2/status.json' },
    { name: 'Render Status', url: 'https://status.render.com/api/v2/status.json' },
  ];

  const [backendResult, frontendResult, , , githubResult, renderResult] =
    await Promise.all(servicios.map((s) => pingService(s.name, s.url)));

  const results = [
    backendResult,
    frontendResult,
    { name: 'Supabase (BD)', url: `https://${SUPABASE_PROJECT_REF}.supabase.co`, status: supabaseStatus, responseMs: supabaseMs },
    { ...cloudinaryPing, name: 'Cloudinary' },
    githubResult,
    renderResult,
  ];

  res.json({ servicios: results, timestamp: new Date().toISOString() });
};

// ─── AUDITORÍA ───────────────────────────────────────────────────────────────
export const getAuditoria = async (req: Request, res: Response) => {
  try {
    const {
      tabla,
      operacion,
      usuario_id,
      desde,
      hasta,
      page = '1',
      limit = '50',
    } = req.query as Record<string, string>;

    const where: any = {};
    if (tabla) where.tabla = tabla;
    if (operacion) where.operacion = operacion;
    if (usuario_id) where.usuario_id = Number(usuario_id);
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha[Op.gte] = new Date(desde);
      if (hasta) where.fecha[Op.lte] = new Date(hasta);
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, parseInt(limit));
    const offset = (pageNum - 1) * limitNum;

    const { count, rows } = await AuditoriaLog.findAndCountAll({
      where,
      order: [['fecha', 'DESC']],
      limit: limitNum,
      offset,
    });

    res.json({
      total: count,
      page: pageNum,
      pages: Math.ceil(count / limitNum),
      registros: rows,
    });
  } catch (error) {
    console.error('Error auditoría:', error);
    res.status(500).json({ error: 'Error al obtener log de auditoría' });
  }
};

const TABLAS_AUDITABLES = new Set([
  'odp', 'odp_items', 'clientes', 'usuarios', 'cotizaciones', 'cotizacion_items',
  'toma_medidas', 'saps', 'sap_items', 'ordenes_compra', 'odc_items', 'pagos',
  'evidencias_instalacion', 'no_conformidades', 'notas_produccion',
  'historial_estados_odp', 'vehiculos', 'rutas_instalacion', 'ruta_odps',
  'prospectos', 'catalogo_productos', 'inventario_perfileria', 'metas_mensuales',
  'configuracion_global', 'pedido_pv', 'salidas_almacen',
  'leads', 'lead_eventos', 'lead_imagenes',
]);

export const revertirAuditoria = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const entry = await AuditoriaLog.findByPk(id);
    if (!entry) return res.status(404).json({ error: 'Registro de auditoría no encontrado' });

    const tabla = entry.getDataValue('tabla');

    if (!TABLAS_AUDITABLES.has(tabla)) {
      return res.status(400).json({ error: 'Tabla no permitida para revertir' });
    }
    const operacion = entry.getDataValue('operacion');
    const registroId = entry.getDataValue('registro_id');
    const datosAnteriores = entry.getDataValue('datos_anteriores');

    if (operacion === 'INSERT') {
      // Revertir INSERT = DELETE del registro
      await sequelize.query(`DELETE FROM "${tabla}" WHERE id = :id`, {
        replacements: { id: registroId },
        type: QueryTypes.DELETE,
      });
    } else if (operacion === 'UPDATE' && datosAnteriores) {
      // Revertir UPDATE = restaurar valores anteriores
      const cols = Object.keys(datosAnteriores)
        .filter((k) => k !== 'id')
        .map((k) => `"${k}" = :${k}`)
        .join(', ');
      await sequelize.query(`UPDATE "${tabla}" SET ${cols} WHERE id = :id`, {
        replacements: { ...datosAnteriores, id: registroId },
        type: QueryTypes.UPDATE,
      });
    } else if (operacion === 'DELETE' && datosAnteriores) {
      // Revertir DELETE = re-INSERT
      const cols = Object.keys(datosAnteriores).map((k) => `"${k}"`).join(', ');
      const vals = Object.keys(datosAnteriores).map((k) => `:${k}`).join(', ');
      await sequelize.query(`INSERT INTO "${tabla}" (${cols}) VALUES (${vals})`, {
        replacements: datosAnteriores,
        type: QueryTypes.INSERT,
      });
    } else {
      return res.status(400).json({ error: 'No se puede revertir este registro (sin datos anteriores)' });
    }

    res.json({ ok: true, mensaje: 'Operación revertida exitosamente' });
  } catch (error) {
    console.error('Error revertir auditoría:', error);
    res.status(500).json({ error: 'Error al revertir la operación' });
  }
};

// ─── ALERTAS / UMBRALES ──────────────────────────────────────────────────────
export const getAlertas = async (_req: Request, res: Response) => {
  const alertas = await AlertasUmbral.findAll({ order: [['clave', 'ASC']] });
  res.json(alertas);
};

export const updateAlerta = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { valor, activo } = req.body;
    const alerta = await AlertasUmbral.findByPk(id);
    if (!alerta) return res.status(404).json({ error: 'Umbral no encontrado' });
    await alerta.update({ valor, activo });
    res.json(alerta);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar umbral' });
  }
};

// ─── BACKUP ──────────────────────────────────────────────────────────────────
export const descargarBackup = async (_req: Request, res: Response) => {
  try {
    const tablas: any[] = await sequelize.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
      { type: QueryTypes.SELECT }
    );

    let sql = `-- Backup Vidrios Templex — ${new Date().toISOString()}\n`;
    sql += `-- Generado automáticamente. Restaurar en PostgreSQL compatible.\n\n`;
    sql += `SET client_encoding = 'UTF8';\nBEGIN;\n\n`;

    for (const { tablename } of tablas) {
      try {
        const rows: any[] = await sequelize.query(
          `SELECT * FROM "${tablename}"`,
          { type: QueryTypes.SELECT }
        );
        if (rows.length === 0) continue;

        sql += `-- Tabla: ${tablename}\n`;
        const cols = Object.keys(rows[0]).map((c) => `"${c}"`).join(', ');

        for (const row of rows) {
          const vals = Object.values(row)
            .map((v) => {
              if (v === null || v === undefined) return 'NULL';
              if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
              if (typeof v === 'number') return String(v);
              if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
              return `'${String(v).replace(/'/g, "''")}'`;
            })
            .join(', ');
          sql += `INSERT INTO "${tablename}" (${cols}) VALUES (${vals}) ON CONFLICT DO NOTHING;\n`;
        }
        sql += '\n';
      } catch {
        sql += `-- ERROR al exportar tabla ${tablename}\n\n`;
      }
    }

    sql += `COMMIT;\n`;

    const fecha = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="backup_templex_${fecha}.sql"`);
    res.send(sql);
  } catch (error) {
    console.error('Error backup:', error);
    res.status(500).json({ error: 'Error al generar el backup' });
  }
};

export const restaurarBackup = async (req: Request, res: Response) => {
  try {
    const { sql } = req.body as { sql: string };
    if (!sql || typeof sql !== 'string') {
      return res.status(400).json({ error: 'Se requiere el contenido SQL en el cuerpo' });
    }

    // Ejecutar en una transacción para poder hacer rollback si algo falla
    const t = await sequelize.transaction();
    try {
      // Dividir por statements y ejecutar uno a uno
      const statements = sql
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('--') && !s.startsWith('SET') && s !== 'BEGIN' && s !== 'COMMIT');

      for (const stmt of statements) {
        await sequelize.query(stmt + ';', { transaction: t });
      }
      await t.commit();
      res.json({ ok: true, mensaje: 'Backup restaurado exitosamente', statements: statements.length });
    } catch (err: any) {
      await t.rollback();
      res.status(400).json({ error: `Error en el SQL: ${err.message}` });
    }
  } catch (error) {
    console.error('Error restaurar backup:', error);
    res.status(500).json({ error: 'Error interno al restaurar backup' });
  }
};

// ─── MANTENIMIENTO ───────────────────────────────────────────────────────────
export const ejecutarMantenimiento = async (req: Request, res: Response) => {
  const { tarea } = req.params;

  try {
    let resultado: any = {};

    switch (tarea) {
      case 'odps_inconsistentes': {
        const rows: any[] = await sequelize.query(
          `SELECT id, numero_odp, estado_produccion, estado_facturacion, estado_caja
           FROM odp
           WHERE (estado_produccion = 'ENTREGADA' AND estado_facturacion = 'PENDIENTE')
           ORDER BY id`,
          { type: QueryTypes.SELECT }
        );
        resultado = {
          descripcion: 'ODPs entregadas sin facturar (estado_produccion=ENTREGADA y estado_facturacion=PENDIENTE)',
          cantidad: rows.length,
          registros: rows,
        };
        break;
      }

      case 'pagos_huerfanos': {
        const rows: any[] = await sequelize.query(
          `SELECT p.id, p.monto, p.fecha_pago, p.odp_id
           FROM pagos p
           LEFT JOIN odp o ON o.id = p.odp_id
           WHERE o.id IS NULL`,
          { type: QueryTypes.SELECT }
        );
        resultado = { descripcion: 'Pagos sin ODP asociada', cantidad: rows.length, registros: rows };
        break;
      }

      case 'integridad_referencial': {
        const checks: any[] = [];

        const [orphanItems]: any[] = await sequelize.query(
          `SELECT COUNT(*) AS c FROM odp_items WHERE odp_id NOT IN (SELECT id FROM odp)`,
          { type: QueryTypes.SELECT }
        );
        checks.push({ tabla: 'odp_items → odp', huerfanos: Number(orphanItems.c) });

        const [orphanPagos]: any[] = await sequelize.query(
          `SELECT COUNT(*) AS c FROM pagos WHERE odp_id NOT IN (SELECT id FROM odp)`,
          { type: QueryTypes.SELECT }
        );
        checks.push({ tabla: 'pagos → odp', huerfanos: Number(orphanPagos.c) });

        const [orphanEvidencias]: any[] = await sequelize.query(
          `SELECT COUNT(*) AS c FROM evidencias_instalacion WHERE odp_id NOT IN (SELECT id FROM odp)`,
          { type: QueryTypes.SELECT }
        );
        checks.push({ tabla: 'evidencias_instalacion → odp', huerfanos: Number(orphanEvidencias.c) });

        resultado = { descripcion: 'Verificación de integridad referencial', checks };
        break;
      }

      case 'usuarios_inactivos': {
        const rows: any[] = await sequelize.query(
          `SELECT id, nombre_completo, username, rol, creado_en
           FROM usuarios
           WHERE id NOT IN (
               SELECT DISTINCT (datos_nuevos->>'id')::int
               FROM auditoria_log
               WHERE tabla = 'usuarios' AND fecha > NOW() - INTERVAL '90 days'
             )
           ORDER BY nombre_completo`,
          { type: QueryTypes.SELECT }
        );
        resultado = { descripcion: 'Usuarios sin actividad reciente (>90 días)', cantidad: rows.length, registros: rows };
        break;
      }

      case 'limpiar_auditoria': {
        const { dias = 180 } = req.body;
        const result = await AuditoriaLog.destroy({
          where: { fecha: { [Op.lt]: new Date(Date.now() - Number(dias) * 24 * 60 * 60 * 1000) } },
        });
        resultado = { descripcion: `Registros de auditoría eliminados (>${dias} días)`, eliminados: result };
        break;
      }

      case 'tm_inconsistencias': {
        const rows: any[] = await sequelize.query(`
          SELECT
            tm.id          AS tm_id,
            tm.numero_tm,
            tm.estado      AS tm_estado,
            tm.odp_id      AS tm_odp_id,
            o.numero_odp,
            pr.id          AS prospecto_id,
            pr.numero_prospecto,
            pr.estado      AS pr_estado,
            pr.odp_id      AS pr_odp_id,
            c.nombre_razon_social AS cliente
          FROM toma_medidas tm
          LEFT JOIN prospectos pr ON pr.id = tm.prospecto_id
          LEFT JOIN odp o        ON o.id  = tm.odp_id
          LEFT JOIN clientes c   ON c.id  = pr.cliente_id
          WHERE tm.prospecto_id IS NOT NULL
            AND tm.odp_id IS NOT NULL
            AND (pr.odp_id IS NULL OR pr.odp_id != tm.odp_id)
          ORDER BY tm.numero_tm
        `, { type: QueryTypes.SELECT });

        resultado = {
          descripcion: 'TMs vinculadas a ODP cuyo Prospecto no tiene la misma ODP asignada',
          total: rows.length,
          registros: rows,
        };
        break;
      }

      case 'odc_huerfanas': {
        const rows: any[] = await sequelize.query(
          `SELECT oc.id, oc.numero_odc, oc.tipo, oc.proveedor, oc.estado,
                  oc.fecha_creacion,
                  u.nombre_completo AS creado_por
           FROM ordenes_compra oc
           LEFT JOIN usuarios u ON u.id = oc.creado_por
           WHERE NOT EXISTS (SELECT 1 FROM odc_items oi WHERE oi.odc_id = oc.id)
           ORDER BY oc.fecha_creacion DESC`,
          { type: QueryTypes.SELECT }
        );
        resultado = {
          descripcion: 'ODCs sin ítems asociados (posible pérdida de datos)',
          cantidad: rows.length,
          registros: rows,
        };
        break;
      }

      case 'resumen_inconsistencias': {
        const [totalOdp]: any[] = await sequelize.query(`SELECT COUNT(*) AS c FROM odp`, { type: QueryTypes.SELECT });
        const [sinCliente]: any[] = await sequelize.query(
          `SELECT COUNT(*) AS c FROM odp WHERE cliente_id NOT IN (SELECT id FROM clientes)`,
          { type: QueryTypes.SELECT }
        );
        const [sapSinOdp]: any[] = await sequelize.query(
          `SELECT COUNT(*) AS c FROM sap WHERE odp_id NOT IN (SELECT id FROM odp)`,
          { type: QueryTypes.SELECT }
        );
        const [itemsSinOdp]: any[] = await sequelize.query(
          `SELECT COUNT(*) AS c FROM odp_items WHERE odp_id NOT IN (SELECT id FROM odp)`,
          { type: QueryTypes.SELECT }
        );
        resultado = {
          descripcion: 'Resumen global de inconsistencias',
          total_odps: Number(totalOdp.c),
          odps_sin_cliente: Number(sinCliente.c),
          saps_sin_odp: Number(sapSinOdp.c),
          items_sin_odp: Number(itemsSinOdp.c),
        };
        break;
      }

      case 'sesiones_activas': {
        // Listar sesiones activas no es trivial sin una tabla de sesiones.
        // Aquí retornamos stats de conexiones a PG como aproximación.
        const rows: any[] = await sequelize.query(
          `SELECT usename, application_name, state, query_start, state_change
           FROM pg_stat_activity
           WHERE datname = current_database() AND pid <> pg_backend_pid()
           ORDER BY query_start DESC NULLS LAST
           LIMIT 30`,
          { type: QueryTypes.SELECT }
        );
        resultado = { descripcion: 'Conexiones activas a la base de datos', conexiones: rows };
        break;
      }

      default:
        return res.status(400).json({ error: `Tarea '${tarea}' no reconocida` });
    }

    res.json({ ok: true, tarea, ...resultado });
  } catch (error: any) {
    console.error('Error mantenimiento:', error);
    res.status(500).json({ error: error.message || 'Error al ejecutar mantenimiento' });
  }
};

// ─── DIAGNÓSTICO ODP ─────────────────────────────────────────────────────────
export const getDiagnosticoODP = async (_req: Request, res: Response) => {
  try {
    const [
      listoSinRequisitos,
      listoChkPendiente,
      visitaTmRealizada,
      enEsperaStale,
      sinItemsPendiente,
    ] = await Promise.all([
      // Q1 — LISTO_INSTALAR sin ningún requisito (CRÍTICO)
      sequelize.query<any>(`
        SELECT o.id, o.numero_odp, c.nombre_razon_social AS cliente,
               u.nombre_completo AS asesor,
               o.fecha_listo_instalar, o.fecha_creacion
        FROM odp o
        JOIN clientes c ON c.id = o.cliente_id
        JOIN usuarios u ON u.id = o.asesor_id
        WHERE o.estado_produccion = 'LISTO_INSTALAR'
          AND o.sin_items = false
          AND NOT EXISTS (SELECT 1 FROM toma_medidas WHERE odp_id = o.id)
          AND NOT EXISTS (SELECT 1 FROM odp_items WHERE odp_id = o.id)
          AND NOT EXISTS (SELECT 1 FROM sap WHERE odp_id = o.id)
          AND o.tiene_aluminio = false AND o.matizado = false AND o.pelicula = false
          AND o.huacal = false AND o.carton = false
        ORDER BY o.fecha_listo_instalar DESC NULLS LAST LIMIT 100
      `, { type: QueryTypes.SELECT }),

      // Q2 — LISTO_INSTALAR con chk requerido en false (CRÍTICO)
      sequelize.query<any>(`
        SELECT o.id, o.numero_odp, c.nombre_razon_social AS cliente,
               u.nombre_completo AS asesor,
               o.tiene_aluminio, o.matizado, o.pelicula, o.huacal, o.carton,
               o.chk_medicion, o.chk_corte, o.chk_vidrio, o.chk_accesorios, o.chk_ensamble,
               o.chk_matizado, o.chk_pelicula, o.chk_huacal, o.chk_carton,
               (SELECT COUNT(*) FROM toma_medidas WHERE odp_id = o.id) AS tiene_tm,
               (SELECT COUNT(*) FROM odp_items WHERE odp_id = o.id) AS tiene_items,
               (SELECT COUNT(*) FROM sap WHERE odp_id = o.id) AS tiene_sap
        FROM odp o
        JOIN clientes c ON c.id = o.cliente_id
        JOIN usuarios u ON u.id = o.asesor_id
        WHERE o.estado_produccion = 'LISTO_INSTALAR' AND o.sin_items = false
          AND (
            (EXISTS (SELECT 1 FROM toma_medidas WHERE odp_id = o.id) AND o.chk_medicion = false)
            OR (EXISTS (SELECT 1 FROM odp_items WHERE odp_id = o.id) AND o.chk_vidrio = false)
            OR (EXISTS (SELECT 1 FROM sap WHERE odp_id = o.id) AND o.chk_accesorios = false)
            OR (o.tiene_aluminio = true AND (o.chk_corte = false OR o.chk_ensamble = false))
            OR (o.matizado = true AND o.chk_matizado = false)
            OR (o.pelicula = true AND o.chk_pelicula = false)
            OR (o.huacal = true AND o.chk_huacal = false)
            OR (o.carton = true AND o.chk_carton = false)
          )
        ORDER BY o.fecha_listo_instalar DESC NULLS LAST LIMIT 100
      `, { type: QueryTypes.SELECT }),

      // Q3 — VISITA_TECNICA con TM realizada (ADVERTENCIA)
      sequelize.query<any>(`
        SELECT o.id, o.numero_odp, c.nombre_razon_social AS cliente,
               u.nombre_completo AS asesor,
               tm.estado AS estado_tm, tm.numero_tm, tm.fecha_visita
        FROM odp o
        JOIN clientes c ON c.id = o.cliente_id
        JOIN usuarios u ON u.id = o.asesor_id
        JOIN toma_medidas tm ON tm.odp_id = o.id
        WHERE o.estado_produccion = 'VISITA_TECNICA' AND tm.estado = 'realizada'
        ORDER BY tm.fecha_visita ASC NULLS LAST LIMIT 100
      `, { type: QueryTypes.SELECT }),

      // Q4 — EN_ESPERA > 30 días sin cambio (ADVERTENCIA)
      sequelize.query<any>(`
        SELECT o.id, o.numero_odp, c.nombre_razon_social AS cliente,
               u.nombre_completo AS asesor, o.fecha_creacion,
               EXTRACT(DAY FROM NOW() - COALESCE(
                 (SELECT MAX(h.fecha) FROM historial_estados_odp h WHERE h.odp_id = o.id),
                 o.fecha_creacion
               ))::int AS dias_sin_cambio,
               (SELECT MAX(h.fecha) FROM historial_estados_odp h WHERE h.odp_id = o.id) AS ultimo_cambio
        FROM odp o
        JOIN clientes c ON c.id = o.cliente_id
        JOIN usuarios u ON u.id = o.asesor_id
        WHERE o.estado_produccion = 'EN_ESPERA'
          AND COALESCE(
            (SELECT MAX(h.fecha) FROM historial_estados_odp h WHERE h.odp_id = o.id),
            o.fecha_creacion
          ) < NOW() - INTERVAL '7 days'
        ORDER BY dias_sin_cambio DESC LIMIT 100
      `, { type: QueryTypes.SELECT }),

      // Q5 — ODPs sin_items pendientes (INFO)
      sequelize.query<any>(`
        SELECT o.id, o.numero_odp, c.nombre_razon_social AS cliente,
               u.nombre_completo AS asesor, o.fecha_creacion,
               EXTRACT(DAY FROM NOW() - o.fecha_creacion)::int AS dias_esperando
        FROM odp o
        JOIN clientes c ON c.id = o.cliente_id
        JOIN usuarios u ON u.id = o.asesor_id
        WHERE o.sin_items = true
        ORDER BY o.fecha_creacion ASC LIMIT 100
      `, { type: QueryTypes.SELECT }),
    ]);

    const criticos = listoSinRequisitos.length + listoChkPendiente.length;
    const advertencias = visitaTmRealizada.length + enEsperaStale.length;
    const info = sinItemsPendiente.length;

    res.json({
      listo_sin_requisitos: listoSinRequisitos,
      listo_chk_pendiente: listoChkPendiente,
      visita_tm_realizada: visitaTmRealizada,
      en_espera_stale: enEsperaStale,
      sin_items_pendiente: sinItemsPendiente,
      resumen: { criticos, advertencias, info, total: criticos + advertencias + info },
    });
  } catch (error: any) {
    console.error('Error diagnóstico ODP:', error);
    res.status(500).json({ error: error.message || 'Error al ejecutar diagnóstico' });
  }
};

// ─── RESUMEN OPERATIVO ───────────────────────────────────────────────────────
export const getOperativoResumen = async (_req: Request, res: Response) => {
  try {
    const [
      noConformidades,
      pedidosProblema,
      entregadasSinFacturar,
      creditosVencidos,
      rutasEnCurso,
    ] = await Promise.all([
      // Q1 — No Conformidades abiertas
      sequelize.query<any>(`
        SELECT nc.id, nc.numero_reporte, nc.tipo_error, nc.estado,
               o.numero_odp, c.nombre_razon_social AS cliente,
               nc.costo_total, nc.creado_en
        FROM no_conformidades nc
        JOIN odp o ON o.id = nc.odp_id
        JOIN clientes c ON c.id = o.cliente_id
        WHERE nc.estado IN ('ABIERTO', 'EN_PROCESO')
        ORDER BY nc.creado_en DESC LIMIT 50
      `, { type: QueryTypes.SELECT }),

      // Q2 — Pedidos PV en PROBLEMA
      sequelize.query<any>(`
        SELECT pv.id, pv.numero_pedido, pv.proveedor, pv.tipo_problema, pv.estado_reposicion,
               o.numero_odp, c.nombre_razon_social AS cliente, pv.creado_en
        FROM pedido_pv pv
        LEFT JOIN odp o ON o.id = pv.odp_id
        LEFT JOIN clientes c ON c.id = o.cliente_id
        WHERE pv.estado = 'PROBLEMA'
        ORDER BY pv.creado_en DESC LIMIT 50
      `, { type: QueryTypes.SELECT }),

      // Q3 — ODPs ENTREGADA sin facturar
      sequelize.query<any>(`
        SELECT o.id, o.numero_odp, c.nombre_razon_social AS cliente,
               u.nombre_completo AS asesor, o.valor_total, o.fecha_entrega
        FROM odp o
        JOIN clientes c ON c.id = o.cliente_id
        JOIN usuarios u ON u.id = o.asesor_id
        WHERE o.estado_produccion = 'ENTREGADA' AND o.estado_facturacion = 'PENDIENTE'
        ORDER BY o.fecha_entrega ASC NULLS LAST LIMIT 50
      `, { type: QueryTypes.SELECT }),

      // Q4 — Créditos vencidos
      sequelize.query<any>(`
        SELECT o.id, o.numero_odp, c.nombre_razon_social AS cliente,
               u.nombre_completo AS asesor,
               o.fecha_vencimiento_credito, o.valor_total, o.pendiente,
               CURRENT_DATE - o.fecha_vencimiento_credito AS dias_vencido
        FROM odp o
        JOIN clientes c ON c.id = o.cliente_id
        JOIN usuarios u ON u.id = o.asesor_id
        WHERE o.fecha_vencimiento_credito IS NOT NULL
          AND o.fecha_vencimiento_credito < CURRENT_DATE
          AND o.estado_facturacion = 'PENDIENTE'
        ORDER BY dias_vencido DESC LIMIT 50
      `, { type: QueryTypes.SELECT }),

      // Q5 — Rutas en_curso sin cerrar
      sequelize.query<any>(`
        SELECT r.id, r.estado, r.inicio_ruta, r.creado_en,
               EXTRACT(HOUR FROM NOW() - r.inicio_ruta)::int AS horas_abiertas,
               uc.nombre_completo AS creado_por, ux.nombre_completo AS conductor
        FROM rutas_instalacion r
        LEFT JOIN usuarios uc ON uc.id = r.creado_por
        LEFT JOIN usuarios ux ON ux.id = r.conductor_id
        WHERE r.estado = 'en_curso' AND r.fin_ruta IS NULL
        ORDER BY r.inicio_ruta ASC NULLS LAST LIMIT 50
      `, { type: QueryTypes.SELECT }),
    ]);

    const criticos = noConformidades.length + pedidosProblema.length + creditosVencidos.length;
    const advertencias = entregadasSinFacturar.length + rutasEnCurso.length;

    res.json({
      no_conformidades_abiertas: { count: noConformidades.length, registros: noConformidades },
      pedidos_problema:          { count: pedidosProblema.length, registros: pedidosProblema },
      entregadas_sin_facturar:   { count: entregadasSinFacturar.length, registros: entregadasSinFacturar },
      creditos_vencidos:         { count: creditosVencidos.length, registros: creditosVencidos },
      rutas_en_curso:            { count: rutasEnCurso.length, registros: rutasEnCurso },
      resumen: { criticos, advertencias, total_issues: criticos + advertencias },
    });
  } catch (error: any) {
    console.error('Error resumen operativo:', error);
    res.status(500).json({ error: error.message || 'Error al obtener resumen operativo' });
  }
};

// ─── SEGURIDAD / ACTIVIDAD ───────────────────────────────────────────────────
export const getSeguridadActividad = async (_req: Request, res: Response) => {
  try {
    const [
      actividadUsuarios,
      ipsUnicas,
      deletesRecientes,
      usuariosInactivos,
    ] = await Promise.all([
      // Q1 — Actividad usuarios 24h (agrupa por usuario_id + JOIN para obtener nombre)
      sequelize.query<any>(`
        SELECT al.usuario_id,
               u.nombre_completo AS usuario_nombre,
               u.rol,
               COUNT(*) AS cant_operaciones,
               COUNT(DISTINCT al.tabla) AS tablas_distintas,
               array_agg(DISTINCT al.tabla ORDER BY al.tabla) AS tablas_tocadas,
               COUNT(CASE WHEN al.operacion='INSERT' THEN 1 END) AS inserts,
               COUNT(CASE WHEN al.operacion='UPDATE' THEN 1 END) AS updates,
               COUNT(CASE WHEN al.operacion='DELETE' THEN 1 END) AS deletes,
               COUNT(DISTINCT al.ip_address) AS ips_distintas,
               array_agg(DISTINCT al.ip_address) AS ips,
               MAX(al.fecha) AS ultima_actividad
        FROM auditoria_log al
        JOIN usuarios u ON u.id = al.usuario_id
        WHERE al.fecha >= NOW() - INTERVAL '7 days'
          AND al.usuario_id IS NOT NULL
        GROUP BY al.usuario_id, u.nombre_completo, u.rol
        ORDER BY cant_operaciones DESC LIMIT 50
      `, { type: QueryTypes.SELECT }),

      // Q2 — IPs únicas 24h con nombres de usuario via JOIN
      sequelize.query<any>(`
        SELECT al.ip_address,
               COUNT(*) AS cant_requests,
               COUNT(DISTINCT al.usuario_id) AS cant_usuarios,
               array_agg(DISTINCT u.nombre_completo ORDER BY u.nombre_completo) AS usuarios,
               MIN(al.fecha) AS primera_actividad,
               MAX(al.fecha) AS ultima_actividad
        FROM auditoria_log al
        LEFT JOIN usuarios u ON u.id = al.usuario_id
        WHERE al.fecha >= NOW() - INTERVAL '7 days' AND al.ip_address IS NOT NULL
        GROUP BY al.ip_address
        ORDER BY cant_requests DESC LIMIT 30
      `, { type: QueryTypes.SELECT }),

      // Q3 — DELETEs últimas 48h con nombre de usuario via JOIN
      sequelize.query<any>(`
        SELECT al.id, al.tabla, al.registro_id,
               al.usuario_id,
               COALESCE(u.nombre_completo, 'Usuario ' || al.usuario_id::text) AS usuario_nombre,
               u.rol AS usuario_rol,
               al.ip_address, al.fecha, al.datos_anteriores
        FROM auditoria_log al
        LEFT JOIN usuarios u ON u.id = al.usuario_id
        WHERE al.operacion = 'DELETE' AND al.fecha >= NOW() - INTERVAL '7 days'
        ORDER BY al.fecha DESC LIMIT 100
      `, { type: QueryTypes.SELECT }),

      // Q4 — Usuarios inactivos > 90 días (sin campo activo en la tabla)
      sequelize.query<any>(`
        SELECT id, nombre_completo, username, rol, creado_en
        FROM usuarios
        WHERE id NOT IN (
            SELECT DISTINCT (datos_nuevos->>'id')::int
            FROM auditoria_log
            WHERE tabla = 'usuarios' AND fecha > NOW() - INTERVAL '90 days'
          )
        ORDER BY nombre_completo
      `, { type: QueryTypes.SELECT }),
    ]);

    res.json({
      actividad_usuarios_7d: actividadUsuarios,
      ips_unicas_7d: ipsUnicas,
      deletes_recientes_7d: deletesRecientes,
      usuarios_inactivos_90d: usuariosInactivos,
      generado_en: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error seguridad actividad:', error);
    res.status(500).json({ error: error.message || 'Error al obtener actividad de seguridad' });
  }
};

// ─── SEGURIDAD / DETALLE POR USUARIO ────────────────────────────────────────
export const getDetalleUsuario = async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) return res.status(400).json({ error: 'userId inválido' });

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const LIMIT = 50;
    const offset = (page - 1) * LIMIT;
    const operacion = req.query.operacion as string | undefined;
    const opValidas = ['INSERT', 'UPDATE', 'DELETE'];
    const opClause = operacion && opValidas.includes(operacion) ? 'AND al.operacion = :operacion' : '';
    const replacements: Record<string, unknown> = { userId, limit: LIMIT, offset };
    if (operacion && opValidas.includes(operacion)) replacements.operacion = operacion;

    const [countRows, rows] = await Promise.all([
      sequelize.query<{ total: string }>(`
        SELECT COUNT(*)::int AS total
        FROM auditoria_log al
        WHERE al.usuario_id = :userId
          AND al.fecha >= NOW() - INTERVAL '7 days'
          ${opClause}
      `, { type: QueryTypes.SELECT, replacements }),

      sequelize.query<any>(`
        SELECT al.id, al.fecha, al.tabla, al.operacion, al.registro_id,
               al.datos_anteriores, al.datos_nuevos, al.ip_address
        FROM auditoria_log al
        WHERE al.usuario_id = :userId
          AND al.fecha >= NOW() - INTERVAL '7 days'
          ${opClause}
        ORDER BY al.fecha DESC
        LIMIT :limit OFFSET :offset
      `, { type: QueryTypes.SELECT, replacements }),
    ]);

    const total = Number(countRows[0]?.total ?? 0);
    res.json({ data: rows, total, page, pages: Math.ceil(total / LIMIT) });
  } catch (error: any) {
    console.error('Error detalle usuario:', error);
    res.status(500).json({ error: error.message || 'Error al obtener detalle de usuario' });
  }
};

// ─── MONITOREO INTEGRAL ───────────────────────────────────────────────────────
export const getMonitoreo = async (_req: Request, res: Response) => {
  try {
    const [
      odpsAtascadas,
      sapsSinOdc,
      pedidoPvEstados,
      inventarioBajo,
      cotizacionesPendientes,
      odpsSinEvidencias,
      tablasGrandes,
      auditoriaStatsRows,
      actividad24h,
      carteraVencida,
      prospectosSinGestion,
      loginFallidos24h,
    ] = await Promise.all([

      // 1. ODPs con > 7 días sin cambio de estado (estados activos)
      sequelize.query<any>(`
        SELECT o.id, o.numero_odp, o.estado_produccion,
               c.nombre_razon_social AS cliente,
               u.nombre_completo AS asesor,
               EXTRACT(DAY FROM NOW() - COALESCE(
                 (SELECT MAX(h.fecha) FROM historial_estados_odp h WHERE h.odp_id = o.id),
                 o.fecha_creacion
               ))::int AS dias_sin_cambio,
               COALESCE(
                 (SELECT MAX(h.fecha) FROM historial_estados_odp h WHERE h.odp_id = o.id),
                 o.fecha_creacion
               ) AS ultimo_cambio
        FROM odp o
        JOIN clientes c ON c.id = o.cliente_id
        JOIN usuarios u ON u.id = o.asesor_id
        WHERE o.estado_produccion NOT IN ('ENTREGADA','EN_ESPERA','PAUSADA')
          AND EXTRACT(DAY FROM NOW() - COALESCE(
            (SELECT MAX(h.fecha) FROM historial_estados_odp h WHERE h.odp_id = o.id),
            o.fecha_creacion
          )) > 7
        ORDER BY dias_sin_cambio DESC
        LIMIT 200
      `, { type: QueryTypes.SELECT }),

      // 2. SAPs sin ODC generada (> 3 días)
      sequelize.query<any>(`
        SELECT s.id, s.numero_sap, s.fecha_creacion,
               o.numero_odp, c.nombre_razon_social AS cliente,
               EXTRACT(DAY FROM NOW() - s.fecha_creacion)::int AS dias_sin_odc
        FROM sap s
        JOIN odp o ON o.id = s.odp_id
        JOIN clientes c ON c.id = o.cliente_id
        WHERE NOT EXISTS (SELECT 1 FROM ordenes_compra oc WHERE oc.sap_id = s.id)
          AND s.fecha_creacion < NOW() - INTERVAL '3 days'
        ORDER BY dias_sin_odc DESC
        LIMIT 200
      `, { type: QueryTypes.SELECT }),

      // 3. PedidoPV activos agrupados por estado
      sequelize.query<any>(`
        SELECT estado, COUNT(*) AS total,
               EXTRACT(DAY FROM NOW() - MIN(creado_en))::int AS dias_mas_antiguo
        FROM pedido_pv
        WHERE estado NOT IN ('VERIFICADO','ENTREGADO')
        GROUP BY estado
        ORDER BY total DESC
      `, { type: QueryTypes.SELECT }),

      // 4. Códigos de perfilería con pocas piezas en inventario (< 5)
      sequelize.query<any>(`
        SELECT codigo, COUNT(*) AS piezas
        FROM inventario_perfileria
        WHERE codigo IS NOT NULL
        GROUP BY codigo
        HAVING COUNT(*) < 5
        ORDER BY piezas ASC
        LIMIT 200
      `, { type: QueryTypes.SELECT }),

      // 5. Cotizaciones sin respuesta > 30 días (borrador o enviada)
      sequelize.query<any>(`
        SELECT ct.id, ct.numero_cot, ct.estado, ct.valor_total, ct.fecha_creacion,
               COALESCE(cl.nombre_razon_social, p.nombre_contacto, '—') AS cliente,
               u.nombre_completo AS creado_por_nombre,
               EXTRACT(DAY FROM NOW() - ct.fecha_creacion)::int AS dias_pendiente
        FROM cotizacion ct
        LEFT JOIN clientes cl ON cl.id = ct.cliente_id
        LEFT JOIN prospectos p ON p.id = ct.prospecto_id
        LEFT JOIN usuarios u ON u.id = ct.creado_por
        WHERE ct.estado IN ('borrador','enviada')
          AND ct.fecha_creacion < NOW() - INTERVAL '30 days'
        ORDER BY dias_pendiente DESC
        LIMIT 200
      `, { type: QueryTypes.SELECT }),

      // 6. ODPs INSTALADA/ENTREGADA sin ninguna evidencia fotográfica
      sequelize.query<any>(`
        SELECT o.id, o.numero_odp, o.estado_produccion,
               c.nombre_razon_social AS cliente,
               u.nombre_completo AS asesor,
               o.fecha_listo_instalar
        FROM odp o
        JOIN clientes c ON c.id = o.cliente_id
        JOIN usuarios u ON u.id = o.asesor_id
        WHERE o.estado_produccion IN ('INSTALADA','ENTREGADA')
          AND NOT EXISTS (SELECT 1 FROM evidencias_instalacion ei WHERE ei.odp_id = o.id)
        ORDER BY o.fecha_listo_instalar ASC NULLS LAST
        LIMIT 200
      `, { type: QueryTypes.SELECT }),

      // 7. Top 10 tablas más grandes
      sequelize.query<any>(`
        SELECT t.tablename,
               COALESCE(c.reltuples::bigint, 0) AS filas_estimadas,
               pg_size_pretty(pg_total_relation_size('public.' || t.tablename)) AS size_pretty,
               pg_total_relation_size('public.' || t.tablename) AS size_bytes
        FROM pg_tables t
        LEFT JOIN pg_class c ON c.relname = t.tablename
                             AND c.relnamespace = 'public'::regnamespace
        WHERE t.schemaname = 'public'
        ORDER BY size_bytes DESC
        LIMIT 10
      `, { type: QueryTypes.SELECT }),

      // 8. Estadísticas de crecimiento de auditoria_log
      sequelize.query<any>(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE fecha >= NOW() - INTERVAL '24 hours') AS ultimas_24h,
          COUNT(*) FILTER (WHERE fecha >= NOW() - INTERVAL '7 days')   AS ultimos_7d,
          COUNT(*) FILTER (WHERE operacion = 'INSERT')    AS inserts,
          COUNT(*) FILTER (WHERE operacion = 'UPDATE')    AS updates,
          COUNT(*) FILTER (WHERE operacion = 'DELETE')    AS deletes,
          COUNT(*) FILTER (WHERE operacion = 'LOGIN_FAIL') AS login_fallidos_total,
          MAX(fecha) AS ultima_entrada
        FROM auditoria_log
      `, { type: QueryTypes.SELECT }),

      // 9. Usuarios más activos en las últimas 24h
      sequelize.query<any>(`
        SELECT al.usuario_id, u.nombre_completo, u.rol,
               COUNT(*) AS operaciones,
               MAX(al.fecha) AS ultima_actividad
        FROM auditoria_log al
        JOIN usuarios u ON u.id = al.usuario_id
        WHERE al.fecha >= NOW() - INTERVAL '24 hours'
          AND al.usuario_id IS NOT NULL
        GROUP BY al.usuario_id, u.nombre_completo, u.rol
        ORDER BY operaciones DESC
        LIMIT 100
      `, { type: QueryTypes.SELECT }),

      // 10. Cartera vencida (ENTREGADA con caja PENDIENTE/ABONADO > 30 días)
      sequelize.query<any>(`
        SELECT o.id, o.numero_odp, c.nombre_razon_social AS cliente,
               u.nombre_completo AS asesor,
               o.valor_total, o.pendiente, o.estado_caja,
               o.fecha_entrega,
               EXTRACT(DAY FROM NOW() - o.fecha_entrega)::int AS dias_sin_cobrar
        FROM odp o
        JOIN clientes c ON c.id = o.cliente_id
        JOIN usuarios u ON u.id = o.asesor_id
        WHERE o.estado_produccion = 'ENTREGADA'
          AND o.estado_caja IN ('PENDIENTE','ABONADO')
          AND o.fecha_entrega IS NOT NULL
          AND o.fecha_entrega < NOW() - INTERVAL '30 days'
        ORDER BY dias_sin_cobrar DESC
        LIMIT 200
      `, { type: QueryTypes.SELECT }),

      // 11. Prospectos en gestión sin actividad > 15 días
      sequelize.query<any>(`
        SELECT p.id, p.numero_prospecto, p.nombre_contacto, p.estado,
               u.nombre_completo AS asesor,
               p.fecha_creacion, p.fecha_gestion,
               EXTRACT(DAY FROM NOW() - COALESCE(p.fecha_gestion, p.fecha_creacion))::int AS dias_sin_actividad
        FROM prospectos p
        JOIN usuarios u ON u.id = p.asesor_id
        WHERE p.estado = 'en_gestion'
          AND p.odp_id IS NULL
          AND COALESCE(p.fecha_gestion, p.fecha_creacion) < NOW() - INTERVAL '15 days'
        ORDER BY dias_sin_actividad DESC
        LIMIT 200
      `, { type: QueryTypes.SELECT }),

      // 12. Login fallidos en las últimas 24h
      sequelize.query<any>(`
        SELECT
          COALESCE(ip_address, 'desconocida') AS ip,
          datos_nuevos->>'username'            AS username_intentado,
          datos_nuevos->>'razon'               AS razon,
          COUNT(*)                             AS intentos,
          MAX(fecha)                           AS ultimo_intento
        FROM auditoria_log
        WHERE operacion = 'LOGIN_FAIL'
          AND fecha >= NOW() - INTERVAL '24 hours'
        GROUP BY ip_address, datos_nuevos->>'username', datos_nuevos->>'razon'
        ORDER BY intentos DESC
        LIMIT 200
      `, { type: QueryTypes.SELECT }),
    ]);

    res.json({
      odps_atascadas:          { count: odpsAtascadas.length,          registros: odpsAtascadas },
      saps_sin_odc:            { count: sapsSinOdc.length,             registros: sapsSinOdc },
      pedido_pv_estados:       pedidoPvEstados,
      inventario_bajo:         { count: inventarioBajo.length,         registros: inventarioBajo },
      cotizaciones_pendientes: { count: cotizacionesPendientes.length, registros: cotizacionesPendientes },
      odps_sin_evidencias:     { count: odpsSinEvidencias.length,      registros: odpsSinEvidencias },
      tablas_grandes:          tablasGrandes,
      auditoria_stats:         auditoriaStatsRows[0] ?? null,
      actividad_24h:           actividad24h,
      cartera_vencida:         { count: carteraVencida.length,         registros: carteraVencida },
      prospectos_sin_gestion:  { count: prospectosSinGestion.length,   registros: prospectosSinGestion },
      login_fallidos_24h:      { count: loginFallidos24h.length,       registros: loginFallidos24h },
      cron_pv:                 cronPVStatus,
      ws_activos:              getWSCount(),
      rate_limit:              getRateLimitStats(),
      generado_en:             new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error monitoreo:', error);
    res.status(500).json({ error: error.message || 'Error al obtener datos de monitoreo' });
  }
};
