import { Request, Response } from 'express';
import { QueryTypes } from 'sequelize';
import https from 'https';
import http from 'http';
import sequelize from '../config/database';
import AuditoriaLog from '../models/auditoria_log.model';
import { Op } from 'sequelize';
import { ConfiguracionGlobal } from '../models';
import { hoyBogotaISO, HOY_BOGOTA_SQL } from '../utils/fechas';
import { getContext } from '../utils/requestContext';
import { consultarCarteraVencida } from '../utils/carteraVencida';
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
};
/**
 * Tope real de conexiones: el pool del pooler de Supabase (15), no `max_connections` de
 * Postgres (60). Las conexiones que cuenta `pg_stat_activity` son las del pooler: con 15
 * el pool ya está lleno aunque Postgres admita 60 (2026-10-23). Configurable si cambia el plan.
 */
const POOL_SUPABASE = Number(process.env.SUPABASE_POOL_SIZE) || 15;

/** Días para considerar estancada una ODP: `configuracion_global.dias_alerta_odp_estancada` (la BD manda). */
async function diasOdpEstancada(): Promise<number> {
  const cfg = await ConfiguracionGlobal.findByPk(1, { attributes: ['dias_alerta_odp_estancada'] });
  return Number(cfg?.getDataValue('dias_alerta_odp_estancada')) || 5;
}

/**
 * Usuarios ACTIVOS sin ninguna operación propia en la auditoría en 90 días. Una sola regla para
 * Seguridad y Mantenimiento (2026-10-23): antes se miraba a quién le habían editado la ficha de
 * usuario (`tabla = 'usuarios'`), no quién usaba el sistema, y salían 16 en vez de 2.
 */
async function usuariosSinActividad90d() {
  return sequelize.query<Record<string, unknown>>(`
    SELECT u.id, u.nombre_completo, u.username, u.rol, u.creado_en,
           (SELECT MAX(a.fecha) FROM auditoria_log a WHERE a.usuario_id = u.id) AS ultima_actividad
    FROM usuarios u
    WHERE u.activo = true
      AND NOT EXISTS (
        SELECT 1 FROM auditoria_log a
        WHERE a.usuario_id = u.id AND a.fecha > NOW() - INTERVAL '90 days'
      )
    ORDER BY u.nombre_completo`, { type: QueryTypes.SELECT });
}
const CLOUDINARY_FREE = {
  storage_gb: 25,
  bandwidth_gb: 25,
  transformations: 25000,
};

// Fuente de verdad de los schemas propios de la aplicación: las métricas, el conteo de
// tablas y sobre todo el respaldo recorren esta lista y no `public` a secas. Filtrar por
// un solo schema no falla, simplemente deja fuera del .sql las tablas de los demás (hoy
// las 21 del Cotizador) sin ningún error visible: el archivo se descarga "completo" y la
// pérdida solo se descubre al restaurar. Al crear un schema nuevo, agregarlo aquí.
const SCHEMAS_RESPALDADOS = ['public', 'cotizador'];

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
       WHERE schemaname IN (:schemas)
       ORDER BY size_bytes DESC`,
      { type: QueryTypes.SELECT, replacements: { schemas: SCHEMAS_RESPALDADOS } }
    );

    // Conexiones activas — resumen
    const [connections]: any[] = await sequelize.query(
      // `pool` = las conexiones de la aplicación, que entran por el pooler (application_name
      // 'Supavisor'). El resto son procesos internos de Supabase (PostgREST, pg_cron, exporter…):
      // contarlas contra el pool daba más del 100 % (22 de 15 el 2026-10-23, 13 eran del pooler).
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE state = 'active') AS active,
              COUNT(*) FILTER (WHERE state = 'idle') AS idle,
              COUNT(*) FILTER (WHERE application_name = 'Supavisor') AS pool
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
      `SELECT COUNT(*) AS total FROM pg_tables WHERE schemaname IN (:schemas)`,
      { type: QueryTypes.SELECT, replacements: { schemas: SCHEMAS_RESPALDADOS } }
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
        del_pool: Number(connections.pool),
        limite: POOL_SUPABASE,
        pct: Math.round((Number(connections.pool) / POOL_SUPABASE) * 100),
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
      // El plan Free de Cloudinary se mide en créditos combinados (storage + ancho de banda +
      // transformaciones), no en 25 GB por concepto: si la API los informa, ese es el tope real.
      creditos: data.credits
        ? {
            usados: Math.round(Number(data.credits.usage || 0) * 100) / 100,
            limite: Number(data.credits.limit || 0),
            pct: Math.round(Number(data.credits.used_percent ?? (data.credits.limit ? (data.credits.usage / data.credits.limit) * 100 : 0))),
          }
        : null,
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

    // Solo una parte de las filas guarda `usuario_nombre` (31 de 2.670 en una semana, medido el
    // 2026-10-23): se completa con el nombre actual del usuario para no mostrar un id suelto.
    const sinNombre = Array.from(new Set(
      rows.filter((r) => !r.getDataValue('usuario_nombre') && r.getDataValue('usuario_id')).map((r) => r.getDataValue('usuario_id') as number),
    ));
    const nombres = new Map<number, string>();
    if (sinNombre.length) {
      const us = await sequelize.query<{ id: number; nombre_completo: string }>(
        `SELECT id, nombre_completo FROM usuarios WHERE id IN (:ids)`,
        { type: QueryTypes.SELECT, replacements: { ids: sinNombre } },
      );
      for (const u of us) nombres.set(u.id, u.nombre_completo);
    }

    res.json({
      total: count,
      page: pageNum,
      pages: Math.ceil(count / limitNum),
      registros: rows.map((r) => {
        const j = r.toJSON() as Record<string, unknown>;
        return { ...j, usuario_nombre: j.usuario_nombre || nombres.get(j.usuario_id as number) || null };
      }),
    });
  } catch (error) {
    console.error('Error auditoría:', error);
    res.status(500).json({ error: 'Error al obtener log de auditoría' });
  }
};

const TABLAS_AUDITABLES = new Set([
  'odp', 'odp_items', 'clientes', 'usuarios',
  'toma_medidas', 'saps', 'sap_items', 'ordenes_compra', 'odc_items', 'pagos',
  'evidencias_instalacion', 'no_conformidades', 'notas_produccion',
  'historial_estados_odp', 'vehiculos', 'rutas_instalacion', 'ruta_odps',
  'prospectos', 'catalogo_productos', 'inventario_perfileria', 'metas_mensuales',
  'configuracion_global', 'pedido_pv', 'salidas_almacen',
  'leads', 'lead_eventos', 'lead_imagenes', 'facturas_adicionales_odp',
  'supervision_lineamientos', 'supervision_lineamiento_items',
  // Módulo Proveedores — agregados 2026-08-23
  'proveedores', 'proveedor_producto', 'proveedor_producto_precio',
  'proveedor_codigo_pendiente', 'producto_alias',
  // Agregada 2026-09-21: varios códigos del proveedor por producto interno
  'proveedor_producto_codigo',
  // Agregada 2026-08-30 con la corrección de idempotencia de la ingesta
  'factura_proveedor_procesada',
  // Módulo Cotizador — viven en el schema `cotizador`, así que van calificados
  // schema.tabla, igual que los graba `auditoria_log`. El punto lo separa
  // `identificadorSql()` al construir el SQL: entrecomillar la cadena entera
  // daría un identificador único llamado "cotizador.producto", no schema+tabla.
  // Los nombres son los reales (singular). Las entradas 'cotizaciones'/
  // 'cotizacion_items' del COTModal viejo (que además no coincidían con las
  // tablas reales y hacían fallar el revertir) salieron el 2026-10-03 con el
  // modelo — ver TECH_DEBT.md 2026-07-10.
  'cotizador.producto', 'cotizador.precio_override',
  'cotizador.cotizacion', 'cotizador.cotizacion_item', 'cotizador.parametro',
  // Propuestas y cargos de obra — agregadas 2026-09-20 con la Fase 1
  'cotizador.propuesta', 'cotizador.propuesta_cargo',
]);

/**
 * Etiqueta de `auditoria_log.tabla` → tabla real, donde no coinciden. Los hooks de
 * models/index.ts graban `saps` y `ruta_odps`, pero las tablas son `sap` y `ruta_odp`: el
 * revertir armaba `UPDATE "saps"` y fallaba siempre con 500 (TECH_DEBT.md 2026-07-10, cerrado
 * el 2026-10-23). Se conservan las etiquetas para no partir el historial.
 */
const TABLA_REAL: Record<string, string> = { saps: 'sap', ruta_odps: 'ruta_odp' };
/** Clave primaria distinta de `id` (las mismas que declara `MODELOS_AUDITADOS`). */
const PK_TABLA: Record<string, string> = { 'cotizador.producto': 'codigo', 'cotizador.precio_override': 'codigo' };

/** Convierte el nombre guardado en `auditoria_log.tabla` en el identificador SQL de la tabla
 * real. Un nombre calificado se parte por el punto y se entrecomilla segmento a segmento.
 * La entrada ya pasó por el allow-list `TABLAS_AUDITABLES`. */
function identificadorSql(tabla: string): string {
  return (TABLA_REAL[tabla] ?? tabla).split('.').map((parte) => `"${parte}"`).join('.');
}

/**
 * Revierte una fila de la auditoría (reescrito el 2026-10-23):
 * - En una transacción, y deja su propia fila `REVERT` con el estado previo, quién y desde
 *   dónde. Antes escribía con SQL directo, sin pasar por los hooks: el revertir no quedaba
 *   registrado en ninguna parte.
 * - Si el registro cambió después de esa fila, responde 409 con cuántos cambios hay, salvo
 *   `?forzar=true`. Antes pisaba en silencio los cambios posteriores.
 */
export const revertirAuditoria = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const entry = await AuditoriaLog.findByPk(id);
    if (!entry) return res.status(404).json({ error: 'Registro de auditoría no encontrado' });

    const tabla = entry.getDataValue('tabla') as string;
    if (!TABLAS_AUDITABLES.has(tabla)) {
      return res.status(400).json({ error: 'Esta tabla no se puede revertir desde el panel.' });
    }
    const operacion = entry.getDataValue('operacion') as string;
    const registroId = entry.getDataValue('registro_id') as string;
    const datosAnteriores = entry.getDataValue('datos_anteriores') as Record<string, unknown> | null;
    if (!['INSERT', 'UPDATE', 'DELETE'].includes(operacion)) {
      return res.status(400).json({ error: `Una operación ${operacion} no se revierte.` });
    }
    if (operacion !== 'INSERT' && !datosAnteriores) {
      return res.status(400).json({ error: 'No se puede revertir: la auditoría no guardó cómo estaba el registro antes.' });
    }

    const posteriores = await AuditoriaLog.count({
      where: {
        tabla,
        registro_id: registroId,
        id: { [Op.gt]: entry.getDataValue('id') },
        operacion: { [Op.in]: ['INSERT', 'UPDATE', 'DELETE', 'REVERT'] },
      },
    });
    if (posteriores > 0 && req.query.forzar !== 'true') {
      return res.status(409).json({
        error: `El registro tuvo ${posteriores} cambio(s) después de esta operación; revertirla los sobrescribe.`,
        posteriores,
      });
    }

    const tablaSql = identificadorSql(tabla);
    const pk = PK_TABLA[tabla] ?? 'id';
    const [actual] = await sequelize.query<Record<string, unknown>>(`SELECT * FROM ${tablaSql} WHERE "${pk}" = :__pk`, {
      replacements: { __pk: registroId },
      type: QueryTypes.SELECT,
    });

    await sequelize.transaction(async (t) => {
      if (operacion === 'INSERT') {
        await sequelize.query(`DELETE FROM ${tablaSql} WHERE "${pk}" = :__pk`, { replacements: { __pk: registroId }, transaction: t });
      } else if (operacion === 'UPDATE') {
        const cols = Object.keys(datosAnteriores!).filter((k) => k !== pk).map((k) => `"${k}" = :${k}`).join(', ');
        await sequelize.query(`UPDATE ${tablaSql} SET ${cols} WHERE "${pk}" = :__pk`, {
          replacements: { ...datosAnteriores, __pk: registroId },
          transaction: t,
        });
      } else {
        const claves = Object.keys(datosAnteriores!);
        await sequelize.query(
          `INSERT INTO ${tablaSql} (${claves.map((k) => `"${k}"`).join(', ')}) VALUES (${claves.map((k) => `:${k}`).join(', ')})`,
          { replacements: datosAnteriores!, transaction: t },
        );
      }
      const ctx = getContext();
      await AuditoriaLog.create({
        tabla,
        operacion: 'REVERT',
        registro_id: registroId,
        datos_anteriores: actual ?? null,
        datos_nuevos: { revierte_auditoria_id: Number(id), operacion_revertida: operacion, cambios_posteriores_sobrescritos: posteriores },
        usuario_id: ctx.userId,
        usuario_nombre: ctx.userName,
        ip_address: ctx.ip,
      }, { transaction: t });
    });

    res.json({ ok: true, mensaje: 'Operación revertida. Quedó registrada en la auditoría.' });
  } catch (error) {
    console.error('Error revertir auditoría:', error);
    res.status(500).json({ error: 'No se pudo revertir: el registro cambió de forma incompatible con los datos guardados. No se modificó nada.' });
  }
};

// La pestaña Alertas (umbrales de `alertas_umbral`) se retiró el 2026-10-23: se editaban
// pero ningún código los leía. La tabla queda en la BD sin uso (TECH_DEBT.md 2026-10-23).

// ─── BACKUP ──────────────────────────────────────────────────────────────────
export const descargarBackup = async (req: Request, res: Response) => {
  try {
    // `auditoria_log` es bitácora, no datos de negocio reconstruibles, y es la tabla más pesada
    // (59 MB de 95 MB el 2026-10-23; los datos de negocio suman ~9 MB): incluirla multiplica la
    // descarga desde Supabase. Se excluye por defecto y se pide con ?incluir_auditoria=true.
    const incluirAuditoria = req.query.incluir_auditoria === 'true';
    const TABLAS_EXCLUIDAS_POR_DEFECTO = ['auditoria_log'];

    const tablas: any[] = await sequelize.query(
      `SELECT schemaname, tablename FROM pg_tables
       WHERE schemaname IN (:schemas)
       ORDER BY schemaname, tablename`,
      { type: QueryTypes.SELECT, replacements: { schemas: SCHEMAS_RESPALDADOS } }
    );

    let sql = `-- Backup Vidrios Templex — ${new Date().toISOString()}\n`;
    sql += `-- Generado automáticamente. Restaurar en PostgreSQL compatible.\n`;
    sql += incluirAuditoria
      ? `-- Incluye la bitácora de auditoría (backup completo).\n\n`
      : `-- Sin la bitácora de auditoría. Para incluirla: ?incluir_auditoria=true\n\n`;
    sql += `SET client_encoding = 'UTF8';\nBEGIN;\n\n`;

    const schemasExtra = [...new Set(tablas.map((t) => String(t.schemaname)))].filter((s) => s !== 'public');
    if (schemasExtra.length > 0) {
      for (const schema of schemasExtra) {
        sql += `CREATE SCHEMA IF NOT EXISTS "${schema}";\n`;
      }
      sql += '\n';
    }

    for (const { schemaname, tablename } of tablas) {
      if (!incluirAuditoria && TABLAS_EXCLUIDAS_POR_DEFECTO.includes(tablename)) {
        sql += `-- Tabla ${schemaname}.${tablename} omitida (bitácora). Usa ?incluir_auditoria=true para incluirla.\n\n`;
        continue;
      }
      const tablaCalificada = `"${schemaname}"."${tablename}"`;
      try {
        const rows: any[] = await sequelize.query(
          `SELECT * FROM ${tablaCalificada}`,
          { type: QueryTypes.SELECT }
        );
        if (rows.length === 0) continue;

        sql += `-- Tabla: ${schemaname}.${tablename}\n`;
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
          sql += `INSERT INTO ${tablaCalificada} (${cols}) VALUES (${vals}) ON CONFLICT DO NOTHING;\n`;
        }
        sql += '\n';
      } catch {
        sql += `-- ERROR al exportar tabla ${schemaname}.${tablename}\n\n`;
      }
    }

    sql += `COMMIT;\n`;

    const fecha = hoyBogotaISO();
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="backup_templex_${fecha}.sql"`);
    res.send(sql);
  } catch (error) {
    console.error('Error backup:', error);
    res.status(500).json({ error: 'Error al generar el backup' });
  }
};

// Restaurar desde el panel se retiró el 2026-10-23 (decisión del usuario): partía el SQL por «;»
// (rompía cualquier texto con punto y coma), insertaba en orden alfabético y no por dependencias,
// no reajustaba las secuencias (incidente del 2026-07-02), con ON CONFLICT DO NOTHING no cambiaba
// nada sobre una BD con datos y el archivo supera el límite de 10 MB del body. Para restaurar:
// respaldos de Supabase o pg_restore.

// ─── MANTENIMIENTO ───────────────────────────────────────────────────────────
/** Tareas que borran datos: solo por POST y con `confirmar: true` en el cuerpo (2026-10-23). */
const TAREAS_DESTRUCTIVAS = new Set(['limpiar_auditoria']);

export const ejecutarMantenimiento = async (req: Request, res: Response) => {
  const { tarea } = req.params;

  // Antes la ruta GET también ejecutaba la limpieza: un enlace, una recarga o un prefetch
  // podían borrar historial sin que nadie lo pidiera.
  if (TAREAS_DESTRUCTIVAS.has(tarea) && (req.method !== 'POST' || req.body?.confirmar !== true)) {
    return res.status(400).json({ error: 'Esta tarea borra datos: ejecútala desde el panel y confirma la acción.' });
  }

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
        const rows = await usuariosSinActividad90d();
        resultado = { descripcion: 'Usuarios activos sin ninguna operación en los últimos 90 días', cantidad: rows.length, registros: rows };
        break;
      }

      case 'limpiar_auditoria': {
        // Nunca menos de 30 días, aunque el cuerpo pida otra cosa.
        const dias = Math.max(30, Number(req.body?.dias) || 180);
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

      case 'integridad_compras': {
        // 1. ODCItems de tipo vidrio sin odp_item_id (patrón legacy roto)
        const odcItemsRotos: any[] = await sequelize.query(
          `SELECT oi.id, oi.descripcion, oi.recibido, oi.odp_id,
                  oc.numero_odc, oc.estado AS odc_estado
           FROM odc_items oi
           JOIN ordenes_compra oc ON oc.id = oi.odc_id
           WHERE oc.tipo = 'vidrio' AND oi.odp_item_id IS NULL AND oi.odp_id IS NOT NULL
           ORDER BY oc.numero_odc`,
          { type: QueryTypes.SELECT }
        );

        // 2. ODPItems en 'pendiente' que ya tienen un ODCItem apuntándoles (estado desincronizado)
        const odpItemsDesincronizados: any[] = await sequelize.query(
          `SELECT od.id, od.estado_compra, od.color, od.ancho_mm, od.alto_mm,
                  od.odp_id, oi.id AS odc_item_id, oc.numero_odc
           FROM odp_items od
           JOIN odc_items oi ON oi.odp_item_id = od.id
           JOIN ordenes_compra oc ON oc.id = oi.odc_id
           WHERE od.estado_compra = 'pendiente'
           ORDER BY oc.numero_odc`,
          { type: QueryTypes.SELECT }
        );

        // 3. ODPItems en 'en_odc' sin ningún ODCItem activo (huérfanos)
        const odpItemsHuerfanos: any[] = await sequelize.query(
          `SELECT od.id, od.estado_compra, od.color, od.ancho_mm, od.alto_mm,
                  od.odp_id, o.numero_odp, o.estado_produccion
           FROM odp_items od
           JOIN odp o ON o.id = od.odp_id
           WHERE od.estado_compra = 'en_odc'
             AND NOT EXISTS (SELECT 1 FROM odc_items oi WHERE oi.odp_item_id = od.id)
           ORDER BY o.estado_produccion, o.numero_odp`,
          { type: QueryTypes.SELECT }
        );

        resultado = {
          descripcion: 'Integridad del módulo de Compras (vidrios)',
          ok: odcItemsRotos.length === 0 && odpItemsDesincronizados.length === 0,
          odc_items_sin_odp_item_id: { cantidad: odcItemsRotos.length, registros: odcItemsRotos },
          odp_items_pendiente_con_odc: { cantidad: odpItemsDesincronizados.length, registros: odpItemsDesincronizados },
          odp_items_en_odc_sin_odc: { cantidad: odpItemsHuerfanos.length, registros: odpItemsHuerfanos },
        };
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
    const dias = await diasOdpEstancada();
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

      // Q4 — EN_ESPERA sin cambio hace más de `dias_alerta_odp_estancada` días (ADVERTENCIA).
      // El título decía «> 30 días» y la consulta usaba 7: ahora los dos salen de Configuración.
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
          ) < NOW() - make_interval(days => :dias)
        ORDER BY dias_sin_cambio DESC LIMIT 100
      `, { type: QueryTypes.SELECT, replacements: { dias } }),

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
      dias_estancada: dias,
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

      // Q4 — Créditos vencidos: un crédito vencido es un COBRO pendiente. Antes se filtraba por
      // «no facturada» y las ODP facturadas sin pagar desaparecían (0 en vez de 4, 2026-10-23).
      sequelize.query<any>(`
        SELECT o.id, o.numero_odp, c.nombre_razon_social AS cliente,
               u.nombre_completo AS asesor,
               o.fecha_vencimiento_credito, o.valor_total, o.pendiente,
               ${HOY_BOGOTA_SQL} - o.fecha_vencimiento_credito AS dias_vencido
        FROM odp o
        JOIN clientes c ON c.id = o.cliente_id
        JOIN usuarios u ON u.id = o.asesor_id
        WHERE o.fecha_vencimiento_credito IS NOT NULL
          AND o.fecha_vencimiento_credito < ${HOY_BOGOTA_SQL}
          AND o.estado_caja <> 'CANCELADO'
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

      // Q4 — Usuarios activos sin actividad propia en 90 días (regla compartida con Mantenimiento)
      usuariosSinActividad90d(),
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
// «SAPs sin ODC» e «Inventario < 5 piezas» salieron el 2026-10-23 (decisión del usuario): la
// primera marcaba 428 de 439 SAP porque `ordenes_compra.sap_id` es un vínculo heredado que las ODC
// nuevas ya no usan; la segunda, 247 de 276 códigos de un inventario de sobrantes donde casi cada
// código tiene 1 a 3 piezas. Ninguna de las dos permitía decidir nada.
export const getMonitoreo = async (_req: Request, res: Response) => {
  try {
    const dias = await diasOdpEstancada();
    const [
      odpsAtascadas,
      pedidoPvEstados,
      cotizacionesPendientes,
      odpsSinEvidencias,
      tablasGrandes,
      auditoriaStatsRows,
      actividad24h,
      cartera,
      prospectosSinGestion,
      loginFallidos24h,
    ] = await Promise.all([

      // 1. ODPs activas sin cambio de estado hace más de `dias_alerta_odp_estancada` días
      //    (Configuración). Las ANULADAS no cuentan: no hay nada que mover.
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
        WHERE o.estado_produccion NOT IN ('ENTREGADA','EN_ESPERA','PAUSADA','ANULADA')
          AND EXTRACT(DAY FROM NOW() - COALESCE(
            (SELECT MAX(h.fecha) FROM historial_estados_odp h WHERE h.odp_id = o.id),
            o.fecha_creacion
          )) > :dias
        ORDER BY dias_sin_cambio DESC
        LIMIT 200
      `, { type: QueryTypes.SELECT, replacements: { dias } }),

      // 2. PedidoPV activos agrupados por estado
      sequelize.query<any>(`
        SELECT estado, COUNT(*) AS total,
               EXTRACT(DAY FROM NOW() - MIN(creado_en))::int AS dias_mas_antiguo
        FROM pedido_pv
        WHERE estado NOT IN ('VERIFICADO','ENTREGADO')
        GROUP BY estado
        ORDER BY total DESC
      `, { type: QueryTypes.SELECT }),

      // 3. Cotizaciones sin respuesta > 30 días — del Cotizador (2026-10-03).
      // Antes leía la tabla del COTModal viejo (public.cotizacion, 0 filas
      // siempre): la alerta nunca pudo dispararse. Misma forma de respuesta.
      sequelize.query<any>(`
        SELECT ct.id, 'COT-' || ct.numero AS numero_cot, ct.estado,
               ct.total_total AS valor_total, ct.creada_en AS fecha_creacion,
               COALESCE(NULLIF(ct.cliente_nombre, ''), '—') AS cliente,
               u.nombre_completo AS creado_por_nombre,
               EXTRACT(DAY FROM NOW() - ct.creada_en)::int AS dias_pendiente
        FROM cotizador.cotizacion ct
        LEFT JOIN usuarios u ON u.id = ct.asesor_usuario_id
        WHERE ct.estado = 'PENDIENTE'
          AND ct.creada_en < NOW() - INTERVAL '30 days'
        ORDER BY dias_pendiente DESC
        LIMIT 200
      `, { type: QueryTypes.SELECT }),

      // 4. ODPs INSTALADA/ENTREGADA sin evidencia fotográfica que llegaron a ese estado en los
      //    últimos 30 días (2026-10-23): sin el corte salían 192 de 593, casi todas históricas.
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
          AND COALESCE(
            (SELECT MAX(h.fecha) FROM historial_estados_odp h WHERE h.odp_id = o.id),
            o.fecha_creacion
          ) >= NOW() - INTERVAL '30 days'
        ORDER BY o.fecha_listo_instalar ASC NULLS LAST
        LIMIT 200
      `, { type: QueryTypes.SELECT }),

      // 5. Top 10 tablas más grandes
      sequelize.query<any>(`
        SELECT t.schemaname, t.tablename,
               COALESCE(c.reltuples::bigint, 0) AS filas_estimadas,
               pg_size_pretty(pg_total_relation_size(quote_ident(t.schemaname) || '.' || quote_ident(t.tablename))) AS size_pretty,
               pg_total_relation_size(quote_ident(t.schemaname) || '.' || quote_ident(t.tablename)) AS size_bytes
        FROM pg_tables t
        LEFT JOIN pg_namespace n ON n.nspname = t.schemaname
        LEFT JOIN pg_class c ON c.relname = t.tablename
                             AND c.relnamespace = n.oid
        WHERE t.schemaname IN (:schemas)
        ORDER BY size_bytes DESC
        LIMIT 10
      `, { type: QueryTypes.SELECT, replacements: { schemas: SCHEMAS_RESPALDADOS } }),

      // 6. Estadísticas de crecimiento de auditoria_log
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

      // 7. Usuarios más activos en las últimas 24h
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

      // 8. Cartera vencida: la regla ÚNICA del Dashboard (FE + `fecha_factura` + días de
      //    Configuración). Antes el panel usaba la fecha de entrega y 30 días fijos.
      consultarCarteraVencida(),

      // 9. Prospectos en gestión sin actividad > 15 días
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

      // 10. Login fallidos en las últimas 24h
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

    // Misma forma de fila que antes para la card (numero_odp, cliente, pendiente, dias_sin_cobrar).
    const carteraVencida = cartera.items.map((i) => ({
      id: i.id,
      numero_odp: i.numero_odp,
      cliente: i.cliente_nombre,
      factura_electronica: i.factura_electronica,
      valor_total: i.valor_total,
      pendiente: i.pendiente,
      dias_sin_cobrar: i.dias_vencido,
      riesgo: i.riesgo,
    }));

    res.json({
      odps_atascadas:          { count: odpsAtascadas.length,          registros: odpsAtascadas, dias },
      pedido_pv_estados:       pedidoPvEstados,
      cotizaciones_pendientes: { count: cotizacionesPendientes.length, registros: cotizacionesPendientes },
      odps_sin_evidencias:     { count: odpsSinEvidencias.length,      registros: odpsSinEvidencias },
      tablas_grandes:          tablasGrandes,
      auditoria_stats:         auditoriaStatsRows[0] ?? null,
      actividad_24h:           actividad24h,
      cartera_vencida:         { count: carteraVencida.length, registros: carteraVencida, umbral_dias: cartera.umbral_dias, total: cartera.total },
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
