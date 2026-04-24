import rateLimit from 'express-rate-limit';
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

// Usuarios autenticados: cuota individual por userId (600 req / 15 min)
// Usuarios no autenticados: cuota por IP (100 req / 15 min)
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (req: Request) => (extractUserId(req) ? 600 : 100),
  keyGenerator: (req: Request) => extractUserId(req) ?? (req.ip || 'unknown'),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Demasiadas peticiones',
    message: 'Has excedido el límite de peticiones. Intenta de nuevo en unos minutos.',
  },
});

// Login: límite estricto por IP para prevenir fuerza bruta
export const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Demasiados intentos de login',
    message: 'Has excedido el límite de intentos. Espera 5 minutos antes de intentar de nuevo.',
  },
});
