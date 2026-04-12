import { UniqueConstraintError } from 'sequelize';

/**
 * Ejecuta `fn` y reintenta automáticamente si Sequelize lanza
 * UniqueConstraintError (colisión de número consecutivo).
 *
 * Los UNIQUE constraints ya existen en la BD, así que cada reintento
 * recalcula el siguiente número y vuelve a intentar el INSERT.
 */
export async function withUniqueRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 5,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof UniqueConstraintError && attempt < maxAttempts) {
        console.warn(`[withUniqueRetry] Colisión de número único (intento ${attempt}/${maxAttempts})`);
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
