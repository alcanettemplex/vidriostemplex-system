import rateLimit from 'express-rate-limit';

/**
 * Limitador global: máximo 200 peticiones por IP cada 15 minutos.
 * Protege contra abuso general de la API.
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Demasiadas peticiones',
    message: 'Has excedido el límite de peticiones. Intenta de nuevo en unos minutos.',
  },
});

/**
 * Limitador estricto para autenticación: máximo 10 intentos por IP cada 15 minutos.
 * Protege contra ataques de fuerza bruta al login.
 */
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
