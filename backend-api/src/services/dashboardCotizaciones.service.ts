// Pestaña "Cotizaciones" del Dashboard gerencial (rediseño 2026-09-27).
//
// Lee el Cotizador NUEVO (schema `cotizador`), no la tabla vieja `public.cotizacion`
// (0 filas, por eso el panel anterior mostraba todo en cero).
//
// Reglas de este servicio:
//
// 1. EGRESS. Todo se agrega en SQL y solo viajan cifras y filas cortas. El panel
//    NUNCA lee los JSONB `input`/`resultado` de `cotizacion_item`: usa las columnas
//    espejo (`modulo_id`, `sistema`, `cantidad_piezas`, `total`). La única lectura de
//    JSONB es la hoja "Detalle de productos" del Excel —descarga puntual, solo de
//    las cotizaciones filtradas y solo de la opción elegida—, y aun ahí se trae
//    `resultado->'diseno'` (lo único que usa `descripcionComercial`), no el blob
//    entero (~4,5 KB por ítem).
//
// 2. ALCANCE. Quien no es de control total solo ve SUS cotizaciones
//    (`asesor_usuario_id = su id`). Se impone aquí, con el usuario del JWT; el filtro
//    de asesor que mande la pantalla se ignora para esos roles.
//
// 3. BASE. Las CANCELADAS son cotizaciones anuladas (pruebas, duplicados): se
//    excluyen de todas las métricas salvo que se filtre explícitamente por ese estado.
//    Se informan aparte, en el conteo `canceladas`.
//
// 4. FECHAS. `creada_en` es TIMESTAMPTZ y la sesión de Supabase está en UTC: el
//    rango se compara contra la fecha de BOGOTÁ (`AT TIME ZONE 'America/Bogota'`),
//    o una cotización hecha un martes a las 8 p. m. caería en el miércoles.
//
// 5. VALIDEZ. La oferta vale `cotizador.empresa.validez_oferta_dias` días HÁBILES
//    (lunes a viernes; los festivos no se descuentan). Vencerse NO cambia el estado
//    (decisión del usuario): es solo una señal visual.
import { QueryTypes } from 'sequelize';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import sequelize from '../config/database';
import { nivelCotizador, ROLES_CONTROL_TOTAL, ROLES_EDITAN_PROPIAS } from '../cotizador/lib/permisos';
import { descripcionComercial } from '../cotizador/lib/detalleComercial';
import { HABILES_POR_VENCER, habilesTranscurridosSql, validezOfertaDias } from '../cotizador/lib/validezOferta';

// ─── Catálogos ────────────────────────────────────────────────────────────────

export const ESTADOS_COTIZACION = ['PENDIENTE', 'APROBADA', 'PERDIDO', 'CANCELADO'] as const;
export const SEGMENTOS = ['PA', 'PM', 'PB'] as const;
export const MODULOS_COTIZADOR = [
  'ventanas',
  'proyectantes',
  'cabinas-corredizas',
  'cabinas-batientes',
  'tablero',
  'espejo',
  'item-libre',
] as const;

export const NOMBRE_MODULO: Record<string, string> = {
  ventanas: 'Ventanas',
  proyectantes: 'Proyectantes',
  'cabinas-corredizas': 'Cabinas corredizas',
  'cabinas-batientes': 'Cabinas batientes',
  tablero: 'Tableros',
  espejo: 'Espejos',
  'item-libre': 'Ítems libres',
};

const NOMBRE_ESTADO: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  APROBADA: 'Aprobada',
  PERDIDO: 'Perdida',
  CANCELADO: 'Cancelada',
};

const NOMBRE_MOTIVO: Record<string, string> = {
  PRECIO: 'Precio',
  TIEMPO_ENTREGA: 'Tiempo de entrega',
  COMPETENCIA: 'Competencia',
  NO_RESPONDIO: 'No respondió',
  DESISTIO: 'Desistió',
  OTRO: 'Otro',
  SIN_MOTIVO: 'Sin motivo registrado',
};

const NOMBRE_SEGMENTO: Record<string, string> = {
  PA: 'PA · precio alto',
  PM: 'PM · precio medio',
  PB: 'PB · precio bajo',
};

/** Roles que ven la pestaña: control total del Cotizador + asesores comerciales. */
export function puedeVerPanelCotizaciones(rol: string | undefined | null): boolean {
  return nivelCotizador(rol) === 'total' || String(rol ?? '').toLowerCase() === 'asesor_comercial';
}

// ─── Filtros ──────────────────────────────────────────────────────────────────

/** Un query param vacío ("") cuenta como ausente. */
const opcional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' || v === undefined || v === null ? undefined : v), schema.optional());

const fechaIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener el formato AAAA-MM-DD.' })
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), { message: 'La fecha no es válida.' });

export const filtrosSchema = z
  .object({
    desde: opcional(fechaIso),
    hasta: opcional(fechaIso),
    asesor_id: opcional(z.coerce.number().int().positive()),
    cliente: opcional(z.string().trim().max(100)),
    estado: opcional(z.enum(ESTADOS_COTIZACION, { message: 'El estado no es válido.' })),
    monto_min: opcional(z.coerce.number().min(0, { message: 'El monto mínimo no puede ser negativo.' })),
    monto_max: opcional(z.coerce.number().min(0, { message: 'El monto máximo no puede ser negativo.' })),
    segmento: opcional(z.enum(SEGMENTOS, { message: 'El segmento debe ser PA, PM o PB.' })),
    producto: opcional(z.enum(MODULOS_COTIZADOR, { message: 'El producto no es válido.' })),
  })
  .strict()
  .refine((f) => !f.desde || !f.hasta || f.desde <= f.hasta, {
    message: 'La fecha "desde" no puede ser posterior a la fecha "hasta".',
  })
  .refine((f) => f.monto_min === undefined || f.monto_max === undefined || f.monto_min <= f.monto_max, {
    message: 'El monto mínimo no puede ser mayor que el máximo.',
  });

export type FiltrosEntrada = z.infer<typeof filtrosSchema>;

export interface UsuarioSolicitante {
  id: number;
  rol: string;
}

/** Filtros ya resueltos: fechas con valor por defecto y el alcance del usuario impuesto. */
export interface FiltrosResueltos {
  desde: string;
  hasta: string;
  asesorId: number | null;
  cliente: string | null;
  estado: (typeof ESTADOS_COTIZACION)[number] | null;
  montoMin: number | null;
  montoMax: number | null;
  segmento: (typeof SEGMENTOS)[number] | null;
  producto: (typeof MODULOS_COTIZADOR)[number] | null;
  /** 'total' ve todo; 'propias' queda atado a su usuario. */
  alcance: 'total' | 'propias';
}

const hoyBogota = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

export function resolverFiltros(f: FiltrosEntrada, usuario: UsuarioSolicitante): FiltrosResueltos {
  const hoy = hoyBogota();
  const alcance = nivelCotizador(usuario.rol) === 'total' ? 'total' : 'propias';
  return {
    // Por defecto: el año en curso, para que la evolución mensual tenga meses que mostrar.
    desde: f.desde ?? `${hoy.slice(0, 4)}-01-01`,
    hasta: f.hasta ?? hoy,
    asesorId: alcance === 'propias' ? usuario.id : f.asesor_id ?? null,
    cliente: f.cliente ? f.cliente : null,
    estado: f.estado ?? null,
    montoMin: f.monto_min ?? null,
    montoMax: f.monto_max ?? null,
    segmento: f.segmento ?? null,
    producto: f.producto ?? null,
    alcance,
  };
}

/** Clave de caché: el alcance manda (control total comparte la foto; cada asesor la suya). */
export function claveAlcanceCache(usuario: UsuarioSolicitante | undefined): string {
  if (!usuario) return 'anon';
  return nivelCotizador(usuario.rol) === 'total' ? 'total' : `u${usuario.id}`;
}

// ─── SQL base ─────────────────────────────────────────────────────────────────

const FECHA_BOGOTA = `(c.creada_en AT TIME ZONE 'America/Bogota')::date`;
const HOY_BOGOTA = `(now() AT TIME ZONE 'America/Bogota')::date`;
const CLIENTE_MOSTRAR = `COALESCE(NULLIF(TRIM(c.cliente_nombre), ''), l.nombre, pr.nombre_contacto, cl.nombre_razon_social, 'Sin nombre')`;

/**
 * CTE `base` (cotizaciones que cumplen los filtros) y `vig` (base sin canceladas,
 * salvo que se haya filtrado por CANCELADO). Todo parámetro va por `replacements`:
 * nada del usuario se interpola en el texto SQL.
 */
function cteBase(f: FiltrosResueltos): { sql: string; replacements: Record<string, unknown> } {
  const condiciones: string[] = [`${FECHA_BOGOTA} BETWEEN :desde AND :hasta`];
  const replacements: Record<string, unknown> = { desde: f.desde, hasta: f.hasta };

  if (f.asesorId !== null) {
    condiciones.push('c.asesor_usuario_id = :asesorId');
    replacements.asesorId = f.asesorId;
  }
  if (f.estado) {
    condiciones.push('c.estado::text = :estado');
    replacements.estado = f.estado;
  }
  if (f.segmento) {
    condiciones.push('c.segmento_cliente::text = :segmento');
    replacements.segmento = f.segmento;
  }
  if (f.montoMin !== null) {
    condiciones.push('c.total_total >= :montoMin');
    replacements.montoMin = f.montoMin;
  }
  if (f.montoMax !== null) {
    condiciones.push('c.total_total <= :montoMax');
    replacements.montoMax = f.montoMax;
  }
  if (f.cliente) {
    // Se escapan los comodines de LIKE: "50%" busca el texto literal.
    condiciones.push(`(${CLIENTE_MOSTRAR} ILIKE :cliente ESCAPE '\\' OR c.cliente_obra ILIKE :cliente ESCAPE '\\' OR c.numero::text = :clienteExacto)`);
    replacements.cliente = `%${f.cliente.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    replacements.clienteExacto = f.cliente;
  }
  if (f.producto) {
    // "Cotizaciones que incluyen este producto" en su opción ELEGIDA (la que se cobra).
    condiciones.push(`EXISTS (
      SELECT 1 FROM cotizador.cotizacion_item fi
      JOIN cotizador.propuesta fp ON fp.id = fi.propuesta_id AND fp.elegida
      WHERE fi.cotizacion_id = c.id AND fi.modulo_id = :producto)`);
    replacements.producto = f.producto;
  }
  replacements.soloCanceladas = f.estado === 'CANCELADO';

  const sql = `
    WITH base AS (
      SELECT
        c.id, c.numero, c.estado::text AS estado, c.creada_en, c.aprobada_en, c.perdida_en,
        ${FECHA_BOGOTA} AS fecha,
        c.segmento_cliente::text AS segmento,
        c.asesor_usuario_id,
        COALESCE(u.nombre_completo, NULLIF(TRIM(c.asesor), ''), 'Sin asesor asignado') AS asesor_nombre,
        ${CLIENTE_MOSTRAR} AS cliente,
        c.cliente_obra AS obra,
        c.lead_id, c.prospecto_id, c.cliente_id, c.odp_id,
        c.motivo_perdida, c.total_subtotal AS subtotal, c.total_iva AS iva, c.total_total AS total
      FROM cotizador.cotizacion c
      LEFT JOIN public.usuarios u    ON u.id  = c.asesor_usuario_id
      LEFT JOIN public.leads l       ON l.id  = c.lead_id
      LEFT JOIN public.prospectos pr ON pr.id = c.prospecto_id
      LEFT JOIN public.clientes cl   ON cl.id = c.cliente_id
      WHERE ${condiciones.join('\n        AND ')}
    ),
    vig AS (SELECT * FROM base WHERE estado <> 'CANCELADO' OR :soloCanceladas)`;
  return { sql, replacements };
}

async function consultar<T extends object>(f: FiltrosResueltos, cuerpo: string, extra: Record<string, unknown> = {}): Promise<T[]> {
  const { sql, replacements } = cteBase(f);
  return sequelize.query<T>(`${sql}\n${cuerpo}`, {
    replacements: { ...replacements, ...extra },
    type: QueryTypes.SELECT,
  });
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const redondear = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;


// ─── Bloques del panel ───────────────────────────────────────────────────────

interface FilaAgregada {
  cantidad: string;
  valor: string;
  aprobadas: string;
  valor_aprobado: string;
  pendientes: string;
  valor_pendiente: string;
  perdidas: string;
  valor_perdido: string;
  con_odp: string;
  valor_con_odp: string;
  dias_aprobar: string | null;
}

/** Columnas agregadas comunes a KPIs, asesor, segmento y mes. */
const AGREGADOS = `
  COUNT(*)::int                                                   AS cantidad,
  COALESCE(SUM(total), 0)                                         AS valor,
  COUNT(*) FILTER (WHERE estado = 'APROBADA')::int                AS aprobadas,
  COALESCE(SUM(total) FILTER (WHERE estado = 'APROBADA'), 0)      AS valor_aprobado,
  COUNT(*) FILTER (WHERE estado = 'PENDIENTE')::int               AS pendientes,
  COALESCE(SUM(total) FILTER (WHERE estado = 'PENDIENTE'), 0)     AS valor_pendiente,
  COUNT(*) FILTER (WHERE estado = 'PERDIDO')::int                 AS perdidas,
  COALESCE(SUM(total) FILTER (WHERE estado = 'PERDIDO'), 0)       AS valor_perdido,
  COUNT(*) FILTER (WHERE odp_id IS NOT NULL)::int                 AS con_odp,
  COALESCE(SUM(total) FILTER (WHERE odp_id IS NOT NULL), 0)       AS valor_con_odp,
  AVG(EXTRACT(EPOCH FROM (aprobada_en - creada_en)) / 86400.0)
    FILTER (WHERE estado = 'APROBADA' AND aprobada_en IS NOT NULL) AS dias_aprobar`;

export interface Agregado {
  cantidad: number;
  valor: number;
  aprobadas: number;
  valor_aprobado: number;
  pendientes: number;
  valor_pendiente: number;
  perdidas: number;
  valor_perdido: number;
  con_odp: number;
  valor_con_odp: number;
  /** % de cotizaciones aprobadas sobre las cotizadas (0–100). */
  conversion_pct: number;
  /** % del valor aprobado sobre el valor cotizado (0–100). */
  conversion_valor_pct: number;
  /** Valor aprobado / aprobadas. */
  ticket_aprobado: number;
  /** Valor cotizado / cotizadas. */
  ticket_cotizado: number;
  /** Días promedio entre creación y aprobación; null si no hay aprobadas con fecha. */
  dias_aprobar: number | null;
}

function aAgregado(r: FilaAgregada | undefined): Agregado {
  const cantidad = num(r?.cantidad);
  const valor = num(r?.valor);
  const aprobadas = num(r?.aprobadas);
  const valorAprobado = num(r?.valor_aprobado);
  return {
    cantidad,
    valor,
    aprobadas,
    valor_aprobado: valorAprobado,
    pendientes: num(r?.pendientes),
    valor_pendiente: num(r?.valor_pendiente),
    perdidas: num(r?.perdidas),
    valor_perdido: num(r?.valor_perdido),
    con_odp: num(r?.con_odp),
    valor_con_odp: num(r?.valor_con_odp),
    conversion_pct: cantidad ? redondear((aprobadas / cantidad) * 100) : 0,
    conversion_valor_pct: valor ? redondear((valorAprobado / valor) * 100) : 0,
    ticket_aprobado: aprobadas ? Math.round(valorAprobado / aprobadas) : 0,
    ticket_cotizado: cantidad ? Math.round(valor / cantidad) : 0,
    dias_aprobar: r?.dias_aprobar === null || r?.dias_aprobar === undefined ? null : redondear(num(r.dias_aprobar)),
  };
}

export interface FilaAsesor extends Agregado {
  asesor_id: number | null;
  asesor: string;
}

async function porAsesor(f: FiltrosResueltos): Promise<FilaAsesor[]> {
  const filas = await consultar<FilaAgregada & { asesor_id: number | null; asesor: string }>(
    f,
    `SELECT asesor_usuario_id AS asesor_id, asesor_nombre AS asesor, ${AGREGADOS}
     FROM vig GROUP BY asesor_usuario_id, asesor_nombre
     ORDER BY valor_aprobado DESC, valor DESC, asesor`
  );
  return filas.map((r) => ({ ...aAgregado(r), asesor_id: r.asesor_id ?? null, asesor: r.asesor }));
}

export interface DatosPanelCotizaciones {
  generado_en: string;
  validez_oferta_dias: number;
  filtros: FiltrosResueltos;
  alcance: { nivel: 'total' | 'propias'; asesor_id: number | null };
  kpis: Agregado & { canceladas: number; sin_valor: number };
  mensual: Array<{ mes: string; cantidad: number; valor: number; aprobadas: number; valor_aprobado: number; conversion_pct: number }>;
  por_asesor: FilaAsesor[];
  por_segmento: Array<Agregado & { segmento: string }>;
  por_producto: Array<{
    modulo_id: string;
    nombre: string;
    cotizaciones: number;
    aprobadas: number;
    piezas: number;
    piezas_aprobadas: number;
    valor: number;
    valor_aprobado: number;
  }>;
  por_sistema: Array<{ modulo_id: string; sistema: string; piezas: number; valor: number; piezas_aprobadas: number; valor_aprobado: number }>;
  seguimiento: {
    antiguedad: Array<{ tramo: string; cantidad: number; valor: number }>;
    resumen_validez: { vigentes: number; por_vencer: number; vencidas: number; valor_por_vencer: number; valor_vencidas: number };
    pendientes: Array<{
      id: number;
      numero: number;
      cliente: string;
      asesor: string;
      total: number;
      fecha: string;
      dias: number;
      habiles_restantes: number;
      validez: 'VIGENTE' | 'POR_VENCER' | 'VENCIDA';
    }>;
    perdidas_por_motivo: Array<{ motivo: string; nombre: string; cantidad: number; valor: number }>;
    perdidas_recientes: Array<{
      id: number;
      numero: number;
      cliente: string;
      asesor: string;
      total: number;
      motivo: string;
      detalle: string | null;
      fecha: string | null;
    }>;
  };
  /** Solo para control total: opciones del filtro de asesor. */
  asesores: Array<{ id: number; nombre: string }>;
}

/** Días hábiles (lun–vie) transcurridos desde el día siguiente a la creación
 * hasta hoy. La regla vive en `cotizador/lib/validezOferta.ts`, compartida con
 * la pestaña Cotizaciones del Cotizador. */
const HABILES_TRANSCURRIDOS = habilesTranscurridosSql('fecha');

export async function datosPanel(f: FiltrosResueltos): Promise<DatosPanelCotizaciones> {
  const validez = await validezOfertaDias();

  const [kpisRows, mensualRows, asesores, segmentoRows, productoRows, sistemaRows, antiguedadRows, pendientesRows, validezRows, motivoRows, perdidasRows, opcionesAsesor] =
    await Promise.all([
      consultar<FilaAgregada & { canceladas: string; sin_valor: string }>(
        f,
        `SELECT ${AGREGADOS},
           (SELECT COUNT(*)::int FROM base WHERE estado = 'CANCELADO') AS canceladas,
           COUNT(*) FILTER (WHERE total = 0)::int AS sin_valor
         FROM vig`
      ),
      consultar<{ mes: string; cantidad: string; valor: string; aprobadas: string; valor_aprobado: string }>(
        f,
        `SELECT to_char(date_trunc('month', fecha), 'YYYY-MM') AS mes,
           COUNT(*)::int AS cantidad, COALESCE(SUM(total), 0) AS valor,
           COUNT(*) FILTER (WHERE estado = 'APROBADA')::int AS aprobadas,
           COALESCE(SUM(total) FILTER (WHERE estado = 'APROBADA'), 0) AS valor_aprobado
         FROM vig GROUP BY 1 ORDER BY 1`
      ),
      porAsesor(f),
      consultar<FilaAgregada & { segmento: string }>(f, `SELECT segmento, ${AGREGADOS} FROM vig GROUP BY segmento ORDER BY segmento`),
      // Productos: SOLO columnas espejo del ítem, de la opción ELEGIDA. Nada de JSONB.
      consultar<{ modulo_id: string; cotizaciones: string; aprobadas: string; piezas: string; piezas_aprobadas: string; valor: string; valor_aprobado: string }>(
        f,
        `SELECT i.modulo_id,
           COUNT(DISTINCT v.id)::int AS cotizaciones,
           COUNT(DISTINCT v.id) FILTER (WHERE v.estado = 'APROBADA')::int AS aprobadas,
           COALESCE(SUM(i.cantidad_piezas), 0)::int AS piezas,
           COALESCE(SUM(i.cantidad_piezas) FILTER (WHERE v.estado = 'APROBADA'), 0)::int AS piezas_aprobadas,
           COALESCE(SUM(i.total), 0) AS valor,
           COALESCE(SUM(i.total) FILTER (WHERE v.estado = 'APROBADA'), 0) AS valor_aprobado
         FROM vig v
         JOIN cotizador.propuesta p        ON p.cotizacion_id = v.id AND p.elegida
         JOIN cotizador.cotizacion_item i  ON i.propuesta_id = p.id
         GROUP BY i.modulo_id ORDER BY valor DESC`
      ),
      consultar<{ modulo_id: string; sistema: string; piezas: string; valor: string; piezas_aprobadas: string; valor_aprobado: string }>(
        f,
        `SELECT i.modulo_id, i.sistema,
           COALESCE(SUM(i.cantidad_piezas), 0)::int AS piezas,
           COALESCE(SUM(i.total), 0) AS valor,
           COALESCE(SUM(i.cantidad_piezas) FILTER (WHERE v.estado = 'APROBADA'), 0)::int AS piezas_aprobadas,
           COALESCE(SUM(i.total) FILTER (WHERE v.estado = 'APROBADA'), 0) AS valor_aprobado
         FROM vig v
         JOIN cotizador.propuesta p        ON p.cotizacion_id = v.id AND p.elegida
         JOIN cotizador.cotizacion_item i  ON i.propuesta_id = p.id
         WHERE NULLIF(TRIM(i.sistema), '') IS NOT NULL
         GROUP BY i.modulo_id, i.sistema ORDER BY valor DESC LIMIT 12`
      ),
      consultar<{ tramo: string; orden: number; cantidad: string; valor: string }>(
        f,
        `SELECT tramo, orden, COUNT(*)::int AS cantidad, COALESCE(SUM(total), 0) AS valor FROM (
           SELECT total, ${HOY_BOGOTA} - fecha AS dias FROM vig WHERE estado = 'PENDIENTE'
         ) x
         CROSS JOIN LATERAL (SELECT CASE
           WHEN dias <= 7  THEN '0 a 7 días'
           WHEN dias <= 15 THEN '8 a 15 días'
           WHEN dias <= 30 THEN '16 a 30 días'
           ELSE 'Más de 30 días' END AS tramo,
           CASE WHEN dias <= 7 THEN 1 WHEN dias <= 15 THEN 2 WHEN dias <= 30 THEN 3 ELSE 4 END AS orden) t
         GROUP BY tramo, orden ORDER BY orden`
      ),
      // Pendientes con su validez: las 30 más urgentes de cada grupo (por vencer y
      // vencidas). Los conteos completos van en la consulta siguiente.
      consultar<{ id: number; numero: number; cliente: string; asesor: string; total: string; fecha: string; dias: number; habiles_restantes: number; validez: 'VIGENTE' | 'POR_VENCER' | 'VENCIDA' }>(
        f,
        `, pend AS (
           SELECT id, numero, cliente, asesor_nombre AS asesor, total, to_char(fecha, 'YYYY-MM-DD') AS fecha,
             (${HOY_BOGOTA} - fecha)::int AS dias,
             :validez - ${HABILES_TRANSCURRIDOS} AS habiles_restantes
           FROM vig WHERE estado = 'PENDIENTE'
         ), clas AS (
           SELECT *, CASE WHEN habiles_restantes < 0 THEN 'VENCIDA'
                          WHEN habiles_restantes <= ${HABILES_POR_VENCER} THEN 'POR_VENCER'
                          ELSE 'VIGENTE' END AS validez
           FROM pend
         )
         SELECT * FROM (
           SELECT clas.*, ROW_NUMBER() OVER (
             PARTITION BY validez
             ORDER BY CASE WHEN validez = 'VENCIDA' THEN -habiles_restantes ELSE habiles_restantes END, total DESC) AS rn
           FROM clas
         ) r WHERE rn <= 30
         ORDER BY habiles_restantes, total DESC`,
        { validez }
      ),
      consultar<{ vigentes: string; por_vencer: string; vencidas: string; valor_por_vencer: string; valor_vencidas: string }>(
        f,
        `, pend AS (
           SELECT total, :validez - ${HABILES_TRANSCURRIDOS} AS r FROM vig WHERE estado = 'PENDIENTE'
         )
         SELECT COUNT(*) FILTER (WHERE r > 2)::int AS vigentes,
           COUNT(*) FILTER (WHERE r BETWEEN 0 AND 2)::int AS por_vencer,
           COUNT(*) FILTER (WHERE r < 0)::int AS vencidas,
           COALESCE(SUM(total) FILTER (WHERE r BETWEEN 0 AND 2), 0) AS valor_por_vencer,
           COALESCE(SUM(total) FILTER (WHERE r < 0), 0) AS valor_vencidas
         FROM pend`,
        { validez }
      ),
      consultar<{ motivo: string; cantidad: string; valor: string }>(
        f,
        `SELECT COALESCE(motivo_perdida, 'SIN_MOTIVO') AS motivo, COUNT(*)::int AS cantidad, COALESCE(SUM(total), 0) AS valor
         FROM vig WHERE estado = 'PERDIDO' GROUP BY 1 ORDER BY cantidad DESC, valor DESC`
      ),
      consultar<{ id: number; numero: number; cliente: string; asesor: string; total: string; motivo: string | null; detalle: string | null; fecha: string | null }>(
        f,
        `SELECT v.id, v.numero, v.cliente, v.asesor_nombre AS asesor, v.total,
           COALESCE(v.motivo_perdida, 'SIN_MOTIVO') AS motivo,
           LEFT(c.motivo_perdida_detalle, 160) AS detalle,
           to_char((COALESCE(v.perdida_en, v.creada_en) AT TIME ZONE 'America/Bogota')::date, 'YYYY-MM-DD') AS fecha
         FROM vig v JOIN cotizador.cotizacion c ON c.id = v.id
         WHERE v.estado = 'PERDIDO'
         ORDER BY COALESCE(v.perdida_en, v.creada_en) DESC LIMIT 10`
      ),
      f.alcance === 'total'
        ? // Filtro "Asesor" (2026-09-27): todos los que pueden cotizar (activos) y
          // quien tenga alguna cotización aunque ya no esté activo. Nunca root ni
          // admin: son cuentas de sistema (sus cotizaciones siguen en "Todos").
          sequelize.query<{ id: number; nombre: string }>(
            `SELECT u.id, u.nombre_completo AS nombre FROM public.usuarios u
             WHERE u.rol::text NOT IN ('root', 'admin')
               AND (u.id IN (SELECT DISTINCT asesor_usuario_id FROM cotizador.cotizacion WHERE asesor_usuario_id IS NOT NULL)
                    OR (u.rol::text IN (:roles) AND u.activo))
             ORDER BY u.nombre_completo`,
            { type: QueryTypes.SELECT, replacements: { roles: [...ROLES_CONTROL_TOTAL, ...ROLES_EDITAN_PROPIAS] } }
          )
        : Promise.resolve([] as Array<{ id: number; nombre: string }>),
    ]);

  const k = kpisRows[0];
  const v = validezRows[0];

  return {
    generado_en: new Date().toISOString(),
    validez_oferta_dias: validez,
    filtros: f,
    alcance: { nivel: f.alcance, asesor_id: f.alcance === 'propias' ? f.asesorId : null },
    kpis: { ...aAgregado(k), canceladas: num(k?.canceladas), sin_valor: num(k?.sin_valor) },
    mensual: mensualRows.map((r) => {
      const cantidad = num(r.cantidad);
      const aprobadas = num(r.aprobadas);
      return {
        mes: r.mes,
        cantidad,
        valor: num(r.valor),
        aprobadas,
        valor_aprobado: num(r.valor_aprobado),
        conversion_pct: cantidad ? redondear((aprobadas / cantidad) * 100) : 0,
      };
    }),
    por_asesor: asesores,
    por_segmento: segmentoRows.map((r) => ({ ...aAgregado(r), segmento: r.segmento })),
    por_producto: productoRows.map((r) => ({
      modulo_id: r.modulo_id,
      nombre: NOMBRE_MODULO[r.modulo_id] ?? r.modulo_id,
      cotizaciones: num(r.cotizaciones),
      aprobadas: num(r.aprobadas),
      piezas: num(r.piezas),
      piezas_aprobadas: num(r.piezas_aprobadas),
      valor: num(r.valor),
      valor_aprobado: num(r.valor_aprobado),
    })),
    por_sistema: sistemaRows.map((r) => ({
      modulo_id: r.modulo_id,
      sistema: r.sistema,
      piezas: num(r.piezas),
      valor: num(r.valor),
      piezas_aprobadas: num(r.piezas_aprobadas),
      valor_aprobado: num(r.valor_aprobado),
    })),
    seguimiento: {
      antiguedad: antiguedadRows.map((r) => ({ tramo: r.tramo, cantidad: num(r.cantidad), valor: num(r.valor) })),
      resumen_validez: {
        vigentes: num(v?.vigentes),
        por_vencer: num(v?.por_vencer),
        vencidas: num(v?.vencidas),
        valor_por_vencer: num(v?.valor_por_vencer),
        valor_vencidas: num(v?.valor_vencidas),
      },
      pendientes: pendientesRows.map((r) => ({
        id: r.id,
        numero: r.numero,
        cliente: r.cliente,
        asesor: r.asesor,
        total: num(r.total),
        fecha: r.fecha,
        dias: num(r.dias),
        habiles_restantes: num(r.habiles_restantes),
        validez: r.validez,
      })),
      perdidas_por_motivo: motivoRows.map((r) => ({
        motivo: r.motivo,
        nombre: NOMBRE_MOTIVO[r.motivo] ?? r.motivo,
        cantidad: num(r.cantidad),
        valor: num(r.valor),
      })),
      perdidas_recientes: perdidasRows.map((r) => ({
        id: r.id,
        numero: r.numero,
        cliente: r.cliente,
        asesor: r.asesor,
        total: num(r.total),
        motivo: NOMBRE_MOTIVO[r.motivo ?? 'SIN_MOTIVO'] ?? String(r.motivo),
        detalle: r.detalle,
        fecha: r.fecha,
      })),
    },
    asesores: opcionesAsesor,
  };
}

// ─── Excel ────────────────────────────────────────────────────────────────────

const AZUL = 'FF1F5AD6';
const AZUL_NOCHE = 'FF142247';
const GRIS_FILA = 'FFF6F7F9';
const FORMATO_COP = '"$"#,##0;[Red]-"$"#,##0';
const FORMATO_FECHA = 'dd/mm/yyyy';
const FORMATO_PCT = '0.0%';

interface ColumnaHoja {
  titulo: string;
  clave: string;
  ancho: number;
  formato?: string;
  alinear?: 'left' | 'center' | 'right';
}

/** Hoja tabular con encabezado de marca, filtros automáticos y encabezado congelado. */
function hojaTabla(
  wb: ExcelJS.Workbook,
  nombre: string,
  titulo: string,
  columnas: ColumnaHoja[],
  filas: Array<Record<string, unknown>>,
  opciones: { total?: Record<string, unknown> } = {}
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(nombre, {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  ws.columns = columnas.map((c) => ({ key: c.clave, width: c.ancho }));

  // Fila 1: título de la hoja sobre azul noche.
  ws.mergeCells(1, 1, 1, columnas.length);
  const t = ws.getCell(1, 1);
  t.value = titulo;
  t.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_NOCHE } };
  t.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 26;

  // Fila 3: encabezados (la 2 queda de respiro).
  const enc = ws.getRow(3);
  columnas.forEach((c, i) => {
    const cell = enc.getCell(i + 1);
    cell.value = c.titulo;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    cell.alignment = { vertical: 'middle', horizontal: c.alinear ?? 'left', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: AZUL_NOCHE } } };
  });
  enc.height = 30;

  filas.forEach((f, idx) => {
    const row = ws.addRow(columnas.map((c) => f[c.clave] ?? null));
    columnas.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      if (c.formato) cell.numFmt = c.formato;
      cell.alignment = { vertical: 'top', horizontal: c.alinear ?? 'left', wrapText: c.ancho >= 40 };
      if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS_FILA } };
    });
  });

  if (filas.length > 0) {
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + filas.length, column: columnas.length } };
  } else {
    const r = ws.addRow(['Sin registros para los filtros aplicados.']);
    r.getCell(1).font = { italic: true, color: { argb: 'FF555F71' } };
  }

  if (opciones.total) {
    const row = ws.addRow(columnas.map((c) => opciones.total![c.clave] ?? null));
    columnas.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      if (c.formato) cell.numFmt = c.formato;
      cell.font = { bold: true };
      cell.alignment = { horizontal: c.alinear ?? 'left' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E8FF' } };
      cell.border = { top: { style: 'medium', color: { argb: AZUL } } };
    });
  }
  return ws;
}

/** "Sistema7038-Interior" → "7038 Interior" (igual que la descripción comercial). */
const nombreSistema = (s: string) =>
  s.replace(/^Sistema/, '').replace(/-/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim();

const aFecha = (s: string | null | undefined): Date | null => (s ? new Date(`${s}T12:00:00`) : null);

export async function generarExcel(f: FiltrosResueltos, usuario: { id: number; rol: string }): Promise<Buffer> {
  const [empresaRows, usuarioRows, listado, asesores, detalle] = await Promise.all([
    sequelize.query<{ nombre: string | null; nit: string | null }>(
      'SELECT COALESCE(nombre_comercial, razon_social) AS nombre, nit FROM cotizador.empresa WHERE id = 1',
      { type: QueryTypes.SELECT }
    ),
    sequelize.query<{ nombre: string }>('SELECT nombre_completo AS nombre FROM public.usuarios WHERE id = :id', {
      replacements: { id: usuario.id },
      type: QueryTypes.SELECT,
    }),
    consultar<{
      numero: number; fecha: string; cliente: string; obra: string | null; vinculo: string; asesor: string; segmento: string;
      estado: string; opciones: number; elegida: string | null; subtotal: string; iva: string; total: string;
      odp: string | null; aprobada: string | null; motivo: string | null; fuente: string;
    }>(
      f,
      `SELECT v.numero, to_char(v.fecha, 'YYYY-MM-DD') AS fecha, v.cliente, v.obra,
         CASE
           WHEN v.lead_id IS NOT NULL      THEN 'Lead · ' || COALESCE(l.nombre, '#' || v.lead_id)
           WHEN v.prospecto_id IS NOT NULL THEN 'Prospecto · ' || COALESCE(NULLIF(TRIM(COALESCE(pr.numero_prospecto::text, '') || ' ' || COALESCE(pr.nombre_contacto, '')), ''), '#' || v.prospecto_id)
           WHEN v.cliente_id IS NOT NULL   THEN 'Cliente · ' || COALESCE(cl.nombre_razon_social, '#' || v.cliente_id)
           WHEN v.odp_id IS NOT NULL       THEN 'ODP'
           ELSE 'Sin vínculo' END AS vinculo,
         v.asesor_nombre AS asesor, v.segmento, v.estado,
         (SELECT COUNT(*)::int FROM cotizador.propuesta p WHERE p.cotizacion_id = v.id) AS opciones,
         (SELECT p.etiqueta FROM cotizador.propuesta p WHERE p.cotizacion_id = v.id AND p.elegida LIMIT 1) AS elegida,
         v.subtotal, v.iva, v.total, o.numero_odp AS odp,
         to_char((v.aprobada_en AT TIME ZONE 'America/Bogota')::date, 'YYYY-MM-DD') AS aprobada,
         v.motivo_perdida AS motivo,
         -- Fuente (2026-09-27, pedido del usuario): cómo llegó el cliente. Manda el
         -- lead de la cotización; si no, la del cliente (directo, del prospecto o
         -- de la ODP); si no, la del lead de origen del prospecto o de la ODP. Los
         -- prospectos no guardan fuente propia.
         COALESCE(
           l.fuente_lead::text,
           NULLIF(TRIM(cl.fuente), ''),
           NULLIF(TRIM(clpr.fuente), ''),
           NULLIF(TRIM(clo.fuente), ''),
           (SELECT lx.fuente_lead::text FROM public.leads lx
             WHERE (v.prospecto_id IS NOT NULL AND lx.prospecto_id = v.prospecto_id)
                OR (v.odp_id IS NOT NULL AND lx.odp_id = v.odp_id)
             ORDER BY lx.id LIMIT 1),
           'Sin registrar'
         ) AS fuente
       FROM vig v
       LEFT JOIN public.leads l       ON l.id  = v.lead_id
       LEFT JOIN public.prospectos pr ON pr.id = v.prospecto_id
       LEFT JOIN public.clientes cl   ON cl.id = v.cliente_id
       LEFT JOIN public.clientes clpr ON clpr.id = pr.cliente_id
       LEFT JOIN public.odp o         ON o.id  = v.odp_id
       LEFT JOIN public.clientes clo  ON clo.id = o.cliente_id
       ORDER BY v.creada_en DESC`
    ),
    porAsesor(f),
    // Descarga puntual: `input` + solo el `diseno` de `resultado` (no el blob entero).
    consultar<{
      numero: number; estado: string; cliente: string; orden: number; modulo_id: string; sistema: string | null;
      piezas: number; subtotal: string; iva: string; total: string;
      input: Record<string, unknown> | null; diseno: Record<string, unknown> | null;
    }>(
      f,
      `SELECT v.numero, v.estado, v.cliente, i.orden, i.modulo_id, i.sistema, i.cantidad_piezas AS piezas,
         i.subtotal_con_aiu AS subtotal, i.iva, i.total, i.input, i.resultado -> 'diseno' AS diseno
       FROM vig v
       JOIN cotizador.propuesta p       ON p.cotizacion_id = v.id AND p.elegida
       JOIN cotizador.cotizacion_item i ON i.propuesta_id = p.id
       ORDER BY v.numero DESC, i.orden`
    ),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'ERP Vidrios Templex';
  wb.created = new Date();

  // ── Portada ──
  const empresa = empresaRows[0]?.nombre || 'Vidrios Templex';
  const portada = wb.addWorksheet('Portada', { views: [{ showGridLines: false }] });
  portada.columns = [{ width: 4 }, { width: 30 }, { width: 70 }];
  portada.mergeCells('B2:C2');
  const tit = portada.getCell('B2');
  tit.value = `${empresa} — Informe de cotizaciones`;
  tit.font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
  tit.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_NOCHE } };
  tit.alignment = { vertical: 'middle', indent: 1 };
  portada.getRow(2).height = 38;
  portada.mergeCells('B3:C3');
  const sub = portada.getCell('B3');
  sub.value = 'Dashboard gerencial · pestaña Cotizaciones';
  sub.font = { size: 11, color: { argb: 'FFFFFFFF' } };
  sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  sub.alignment = { indent: 1 };

  const generado = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long', timeStyle: 'short' }).format(new Date());
  const nombreAsesor = f.asesorId !== null ? asesores.find((a) => a.asesor_id === f.asesorId)?.asesor ?? `Usuario #${f.asesorId}` : 'Todos';
  const fmtMonto = (n: number | null) => (n === null ? null : `$${n.toLocaleString('es-CO')}`);
  const datosPortada: Array<[string, string]> = [
    ['Empresa', `${empresa}${empresaRows[0]?.nit ? ` · NIT ${empresaRows[0].nit}` : ''}`],
    ['Generado', generado],
    ['Generado por', usuarioRows[0]?.nombre ?? `Usuario #${usuario.id}`],
    ['Alcance', f.alcance === 'total' ? 'Todas las cotizaciones' : 'Solo las cotizaciones del asesor que descarga'],
    ['', ''],
    ['FILTROS APLICADOS', ''],
    ['Fecha de creación', `${f.desde.split('-').reverse().join('/')} a ${f.hasta.split('-').reverse().join('/')}`],
    ['Asesor', nombreAsesor],
    ['Cliente', f.cliente ?? 'Todos'],
    ['Estado', f.estado ? NOMBRE_ESTADO[f.estado] : 'Todos (sin canceladas)'],
    ['Monto', f.montoMin === null && f.montoMax === null ? 'Cualquiera' : `${fmtMonto(f.montoMin) ?? 'sin mínimo'} a ${fmtMonto(f.montoMax) ?? 'sin máximo'}`],
    ['Segmento', f.segmento ? NOMBRE_SEGMENTO[f.segmento] : 'Todos'],
    ['Producto', f.producto ? NOMBRE_MODULO[f.producto] : 'Todos'],
    ['', ''],
    ['CONTENIDO', ''],
    ['Listado de cotizaciones', `${listado.length} cotizaci${listado.length === 1 ? 'ón' : 'ones'}, una por fila`],
    ['Resumen por asesor', `${asesores.length} asesor${asesores.length === 1 ? '' : 'es'}, con fila de total`],
    ['Detalle de productos', `${detalle.length} productos de la opción elegida de cada cotización`],
    ['', ''],
    ['Notas', 'Los valores son los de la opción ELEGIDA de cada cotización, con IVA. Una cotización sin opción elegida suma $0. ' +
      'Las cotizaciones canceladas (anuladas) no se incluyen salvo que se filtre por ese estado.'],
  ];
  datosPortada.forEach(([k, val], i) => {
    const r = portada.getRow(5 + i);
    r.getCell(2).value = k;
    r.getCell(3).value = val;
    const seccion = k === k.toUpperCase() && k !== '';
    r.getCell(2).font = { bold: true, color: { argb: seccion ? AZUL : 'FF111620' } };
    r.getCell(3).alignment = { wrapText: true, vertical: 'top' };
    r.getCell(2).alignment = { vertical: 'top' };
    if (seccion) r.getCell(2).border = { bottom: { style: 'thin', color: { argb: AZUL } } };
  });

  // ── Listado ──
  hojaTabla(
    wb,
    'Listado de cotizaciones',
    `Listado de cotizaciones · ${listado.length} registros`,
    [
      { titulo: 'N.°', clave: 'numero', ancho: 8, alinear: 'center' },
      { titulo: 'Fecha', clave: 'fecha', ancho: 12, formato: FORMATO_FECHA, alinear: 'center' },
      { titulo: 'Cliente', clave: 'cliente', ancho: 32 },
      { titulo: 'Obra', clave: 'obra', ancho: 24 },
      { titulo: 'Vínculo', clave: 'vinculo', ancho: 30 },
      { titulo: 'Fuente', clave: 'fuente', ancho: 16 },
      { titulo: 'Asesor', clave: 'asesor', ancho: 24 },
      { titulo: 'Segmento', clave: 'segmento', ancho: 10, alinear: 'center' },
      { titulo: 'Estado', clave: 'estado', ancho: 12, alinear: 'center' },
      { titulo: 'Opciones', clave: 'opciones', ancho: 10, alinear: 'center' },
      { titulo: 'Opción elegida', clave: 'elegida', ancho: 10, alinear: 'center' },
      { titulo: 'Subtotal', clave: 'subtotal', ancho: 16, formato: FORMATO_COP, alinear: 'right' },
      { titulo: 'IVA', clave: 'iva', ancho: 14, formato: FORMATO_COP, alinear: 'right' },
      { titulo: 'Total', clave: 'total', ancho: 16, formato: FORMATO_COP, alinear: 'right' },
      { titulo: 'ODP', clave: 'odp', ancho: 12, alinear: 'center' },
      { titulo: 'Aprobada el', clave: 'aprobada', ancho: 12, formato: FORMATO_FECHA, alinear: 'center' },
      { titulo: 'Motivo de pérdida', clave: 'motivo', ancho: 20 },
    ],
    listado.map((r) => ({
      ...r,
      fecha: aFecha(r.fecha),
      aprobada: aFecha(r.aprobada),
      estado: NOMBRE_ESTADO[r.estado] ?? r.estado,
      motivo: r.motivo ? NOMBRE_MOTIVO[r.motivo] ?? r.motivo : null,
      subtotal: num(r.subtotal),
      iva: num(r.iva),
      total: num(r.total),
    })),
    {
      total: {
        cliente: 'TOTAL',
        subtotal: listado.reduce((s, r) => s + num(r.subtotal), 0),
        iva: listado.reduce((s, r) => s + num(r.iva), 0),
        total: listado.reduce((s, r) => s + num(r.total), 0),
      },
    }
  );

  // ── Resumen por asesor ──
  const tot = asesores.reduce(
    (a, r) => ({
      cantidad: a.cantidad + r.cantidad,
      valor: a.valor + r.valor,
      aprobadas: a.aprobadas + r.aprobadas,
      valor_aprobado: a.valor_aprobado + r.valor_aprobado,
      pendientes: a.pendientes + r.pendientes,
      perdidas: a.perdidas + r.perdidas,
    }),
    { cantidad: 0, valor: 0, aprobadas: 0, valor_aprobado: 0, pendientes: 0, perdidas: 0 }
  );
  hojaTabla(
    wb,
    'Resumen por asesor',
    'Resumen por asesor',
    [
      { titulo: 'Asesor', clave: 'asesor', ancho: 30 },
      { titulo: 'Cotizaciones', clave: 'cantidad', ancho: 13, alinear: 'center' },
      { titulo: 'Valor cotizado', clave: 'valor', ancho: 18, formato: FORMATO_COP, alinear: 'right' },
      { titulo: 'Aprobadas', clave: 'aprobadas', ancho: 12, alinear: 'center' },
      { titulo: 'Valor aprobado', clave: 'valor_aprobado', ancho: 18, formato: FORMATO_COP, alinear: 'right' },
      { titulo: 'Conversión (#)', clave: 'conv', ancho: 14, formato: FORMATO_PCT, alinear: 'center' },
      { titulo: 'Conversión ($)', clave: 'conv_valor', ancho: 14, formato: FORMATO_PCT, alinear: 'center' },
      { titulo: 'Ticket promedio aprobado', clave: 'ticket', ancho: 18, formato: FORMATO_COP, alinear: 'right' },
      { titulo: 'Pendientes', clave: 'pendientes', ancho: 12, alinear: 'center' },
      { titulo: 'Perdidas', clave: 'perdidas', ancho: 11, alinear: 'center' },
      { titulo: 'Días promedio hasta aprobar', clave: 'dias', ancho: 16, formato: '0.0', alinear: 'center' },
    ],
    asesores.map((r) => ({
      ...r,
      conv: r.conversion_pct / 100,
      conv_valor: r.conversion_valor_pct / 100,
      ticket: r.ticket_aprobado,
      dias: r.dias_aprobar,
    })),
    {
      total: {
        asesor: 'TOTAL',
        ...tot,
        conv: tot.cantidad ? tot.aprobadas / tot.cantidad : 0,
        conv_valor: tot.valor ? tot.valor_aprobado / tot.valor : 0,
        ticket: tot.aprobadas ? Math.round(tot.valor_aprobado / tot.aprobadas) : 0,
      },
    }
  );

  // ── Detalle de productos ──
  hojaTabla(
    wb,
    'Detalle de productos',
    'Detalle de productos · opción elegida de cada cotización',
    [
      { titulo: 'Cotización', clave: 'numero', ancho: 11, alinear: 'center' },
      { titulo: 'Cliente', clave: 'cliente', ancho: 28 },
      { titulo: 'Estado', clave: 'estado', ancho: 12, alinear: 'center' },
      { titulo: 'Producto', clave: 'producto', ancho: 18 },
      { titulo: 'Sistema', clave: 'sistema', ancho: 18 },
      { titulo: 'Descripción comercial', clave: 'descripcion', ancho: 70 },
      { titulo: 'Cantidad', clave: 'piezas', ancho: 10, alinear: 'center' },
      { titulo: 'Subtotal', clave: 'subtotal', ancho: 16, formato: FORMATO_COP, alinear: 'right' },
      { titulo: 'IVA', clave: 'iva', ancho: 14, formato: FORMATO_COP, alinear: 'right' },
      { titulo: 'Valor', clave: 'total', ancho: 16, formato: FORMATO_COP, alinear: 'right' },
    ],
    detalle.map((r) => {
      let descripcion: string;
      try {
        descripcion = descripcionComercial(r.modulo_id, r.input, { diseno: (r.diseno ?? null) as { sistema?: string } | null });
      } catch {
        descripcion = NOMBRE_MODULO[r.modulo_id] ?? r.modulo_id;
      }
      return {
        numero: r.numero,
        cliente: r.cliente,
        estado: NOMBRE_ESTADO[r.estado] ?? r.estado,
        producto: NOMBRE_MODULO[r.modulo_id] ?? r.modulo_id,
        sistema: r.sistema ? nombreSistema(r.sistema) : null,
        descripcion,
        piezas: r.piezas,
        subtotal: num(r.subtotal),
        iva: num(r.iva),
        total: num(r.total),
      };
    }),
    {
      total: {
        descripcion: 'TOTAL',
        piezas: detalle.reduce((s, r) => s + num(r.piezas), 0),
        subtotal: detalle.reduce((s, r) => s + num(r.subtotal), 0),
        iva: detalle.reduce((s, r) => s + num(r.iva), 0),
        total: detalle.reduce((s, r) => s + num(r.total), 0),
      },
    }
  );

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}
