import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request } from 'express';

function extractUserId(req: Request): string | null {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return null;
    const token = auth.split(' ')[1];
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload?.id ? String(payload.id) : null;
  } catch {
    return null;
  }
}

// ─── Rate limit hits en memoria (últimas 24h) ─────────────────────────────────
interface RateLimitHit { ip: string; timestamp: number; tipo: 'global' | 'auth'; }
const _hits: RateLimitHit[] = [];
const WINDOW_24H = 24 * 60 * 60 * 1000;

const registrarHit = (ip: string, tipo: 'global' | 'auth') => {
  const now = Date.now();
  _hits.push({ ip, timestamp: now, tipo });
  const cutoff = now - WINDOW_24H;
  while (_hits.length > 0 && _hits[0].timestamp < cutoff) _hits.shift();
};

export const getRateLimitStats = () => {
  const now = Date.now();
  const hits = _hits.filter(h => h.timestamp >= now - WINDOW_24H);
  const porIp: Record<string, number> = {};
  hits.forEach(h => { porIp[h.ip] = (porIp[h.ip] || 0) + 1; });
  return {
    total_24h: hits.length,
    auth_hits: hits.filter(h => h.tipo === 'auth').length,
    top_ips: Object.entries(porIp)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ip, count]) => ({ ip, hits: count })),
  };
};

// Usuarios autenticados: cuota individual por userId (600 req / 15 min)
// Usuarios no autenticados: cuota por IP (100 req / 15 min)
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (req: Request) => (extractUserId(req) ? 600 : 100),
  keyGenerator: (req: Request) => extractUserId(req) ?? ipKeyGenerator(req.ip ?? '127.0.0.1'),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Demasiadas peticiones',
    message: 'Has excedido el límite de peticiones. Intenta de nuevo en unos minutos.',
  },
  handler: (req, res, _next, options) => {
    registrarHit(req.ip ?? '127.0.0.1', 'global');
    res.status(options.statusCode).json(options.message);
  },
});

// Login: límite estricto por IP para prevenir fuerza bruta
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Demasiados intentos de login',
    message: 'Has excedido el límite de intentos. Espera 5 minutos antes de intentar de nuevo.',
  },
  handler: (req, res, _next, options) => {
    registrarHit(req.ip ?? '127.0.0.1', 'auth');
    res.status(options.statusCode).json(options.message);
  },
});
