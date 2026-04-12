import { Request, Response } from 'express';
import { QueryTypes } from 'sequelize';
import https from 'https';
import http from 'http';
import sequelize from '../config/database';
import AuditoriaLog from '../models/auditoria_log.model';
import AlertasUmbral from '../models/alertas_umbral.model';
import { Op } from 'sequelize';
import jwt from 'jsonwebtoken';

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

    // Conexiones activas
    const [connections]: any[] = await sequelize.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE state = 'active') AS active,
              COUNT(*) FILTER (WHERE state = 'idle') AS idle
       FROM pg_stat_activity
       WHERE datname = current_database()`,
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
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

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
    { name: 'Backend (API)', url: `${req.protocol}://${req.get('host')}/health` },
    { name: 'Frontend (Netlify)', url: FRONTEND_URL },
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

export const revertirAuditoria = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const entry = await AuditoriaLog.findByPk(id);
    if (!entry) return res.status(404).json({ error: 'Registro de auditoría no encontrado' });

    const tabla = entry.getDataValue('tabla');
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
              OR (estado_caja = 'CANCELADO' AND estado_produccion NOT IN ('INSTALADA','ENTREGADA'))
           ORDER BY id`,
          { type: QueryTypes.SELECT }
        );
        resultado = { descripcion: 'ODPs con estados inconsistentes', cantidad: rows.length, registros: rows };
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
          `SELECT id, nombre_completo, username, rol, activo
           FROM usuarios
           WHERE activo = true
             AND id NOT IN (
               SELECT DISTINCT (datos_nuevos->>'id')::int
               FROM auditoria_log
               WHERE tabla = 'usuarios' AND fecha > NOW() - INTERVAL '90 days'
             )
           ORDER BY nombre_completo`,
          { type: QueryTypes.SELECT }
        );
        resultado = { descripcion: 'Usuarios activos sin actividad reciente (>90 días)', cantidad: rows.length, registros: rows };
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

      case 'resumen_inconsistencias': {
        const [totalOdp]: any[] = await sequelize.query(`SELECT COUNT(*) AS c FROM odp`, { type: QueryTypes.SELECT });
        const [sinCliente]: any[] = await sequelize.query(
          `SELECT COUNT(*) AS c FROM odp WHERE cliente_id NOT IN (SELECT id FROM clientes)`,
          { type: QueryTypes.SELECT }
        );
        const [sapSinOdp]: any[] = await sequelize.query(
          `SELECT COUNT(*) AS c FROM saps WHERE odp_id NOT IN (SELECT id FROM odp)`,
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
