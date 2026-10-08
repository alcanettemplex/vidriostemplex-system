import { Request, Response, NextFunction } from 'express';

/**
 * Caché de respuestas en memoria del proceso — para endpoints de KPIs del dashboard
 * (sums/counts por período) que se piden muchísimo y no requieren precisión al segundo.
 *
 * Estrategia: middleware que intercepta `res.json`. La clave es método + URL completa
 * (incluye los query params de período), SIN usuario: estos paneles son globales por
 * período, así que varios usuarios que miran el mismo mes comparten la misma foto y se
 * multiplica el ahorro de egress. Solo se cachean respuestas 200.
 *
 * Frescura: TTL (30 min en el dashboard) + invalidación por escritura en los puntos que
 * mueven sus cifras (`invalidarCacheDashboard`, 2026-10-08).
 *
 * Alcance: caché por instancia (si se escala a varios contenedores, cada uno tiene la
 * suya; con TTL corto es irrelevante). No cachea datos por-usuario ni operaciones.
 */

interface Entry { data: unknown; exp: number; }

const store = new Map<string, Entry>();
const MAX_ENTRADAS = 300;

/** Purga perezosa: al crecer, elimina entradas expiradas para no acumular claves viejas. */
function purgarSiHaceFalta(): void {
  if (store.size < MAX_ENTRADAS) return;
  const ahora = Date.now();
  for (const [k, v] of store) {
    if (v.exp <= ahora) store.delete(k);
  }
}

/**
 * `claveExtra` (opcional, 2026-09-27): segmento que se suma a la clave para los
 * endpoints cuya respuesta depende de QUIÉN pregunta (p. ej. la pestaña Cotizaciones,
 * donde un asesor solo ve lo suyo). Sin él, la clave es solo método + URL, como siempre.
 */
export function cacheRespuesta(ttlMs: number, opciones: { claveExtra?: (req: Request) => string } = {}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const extra = opciones.claveExtra ? `|${opciones.claveExtra(req)}` : '';
    const key = `${req.method}:${req.originalUrl}${extra}`;
    const hit = store.get(key);
    if (hit && hit.exp > Date.now()) {
      res.setHeader('X-Cache', 'HIT');
      res.json(hit.data);
      return;
    }
    res.setHeader('X-Cache', 'MISS');
    const originalJson = res.json.bind(res);
    res.json = (body: unknown): Response => {
      if (res.statusCode === 200) {
        purgarSiHaceFalta();
        store.set(key, { data: body, exp: Date.now() + ttlMs });
      }
      return originalJson(body);
    };
    next();
  };
}

/** Invalida entradas cuya clave contenga el prefijo (o todas si se omite). */
export function invalidarCacheRespuesta(prefijo?: string): void {
  if (!prefijo) { store.clear(); return; }
  for (const k of Array.from(store.keys())) {
    if (k.includes(prefijo)) store.delete(k);
  }
}

/**
 * Invalida toda la caché del dashboard (2026-10-08). Se llama después de escrituras que
 * cambian sus cifras: facturar, cambiar `valor_total`, crear una ODP (cualquier vía),
 * guardar metas o la configuración global. Llamarla SIEMPRE después del commit de la
 * transacción: antes, una petición concurrente puede volver a cachear el dato viejo.
 */
export const invalidarCacheDashboard = (): void => invalidarCacheRespuesta('/api/dashboard');
