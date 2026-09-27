// Permisos del Cotizador (2026-09-27, integración con el ERP — decisión del usuario).
//
//   total    root, admin, gerencia, gerente, jefe_produccion: ven y editan todo,
//            y acceden a Configuración y Calibración.
//   propias  asesor_comercial, asistente_administrativo: ven todas las
//            cotizaciones, crean, y editan SOLO las suyas (las que tienen como
//            asesor asignado). Sin Configuración ni Calibración.
//   lectura  el resto de roles (produccion, compras, instalador…): solo ven.
//            produccion y compras pasaron aquí el 2026-09-27 (decisión del
//            usuario: crean los asesores, jefe de producción, asistente
//            administrativo, admin, root, gerencia y gerente).
//
// Nadie cotiza a nombre de otro: la cotización nace con el usuario que la crea
// como asesor (`store.crear`). Reasignarla después sigue siendo de control total.
//
// Espejo en el frontend: `frontend-web/src/features/cotizador/permisos.ts`. Si
// cambia una lista aquí, cambiarla allá.
import type { NextFunction, Request, Response } from 'express';
import * as store from '../store/cotizacionStore';

export type NivelCotizador = 'total' | 'propias' | 'lectura';

export const ROLES_CONTROL_TOTAL: ReadonlySet<string> = new Set(['root', 'admin', 'gerencia', 'gerente', 'jefe_produccion']);
export const ROLES_EDITAN_PROPIAS: ReadonlySet<string> = new Set(['asesor_comercial', 'asistente_administrativo']);

export function nivelCotizador(rol: string | undefined | null): NivelCotizador {
  const r = String(rol ?? '').toLowerCase();
  if (ROLES_CONTROL_TOTAL.has(r)) return 'total';
  if (ROLES_EDITAN_PROPIAS.has(r)) return 'propias';
  return 'lectura';
}

const nivelDe = (req: Request) => nivelCotizador((req as Request & { user?: { rol?: string } }).user?.rol);
const usuarioId = (req: Request) => Number((req as Request & { user?: { id?: number } }).user?.id) || null;

/** Configuración, Calibración, precios y costos: solo control total. */
export function soloControlTotal(req: Request, res: Response, next: NextFunction) {
  if (nivelDe(req) === 'total') return next();
  return res.status(403).json({
    error: 'Esta parte del Cotizador (configuración, calibración y precios) es solo para administración.',
  });
}

/** Crear cotizaciones: control total y los roles que editan las suyas. */
export function puedeCrear(req: Request, res: Response, next: NextFunction) {
  if (nivelDe(req) !== 'lectura') return next();
  return res.status(403).json({ error: 'Tu rol puede ver las cotizaciones, pero no crearlas ni modificarlas.' });
}

/**
 * Cualquier escritura sobre `/cotizaciones/:id/...`: control total siempre; los
 * de "propias" solo si son el asesor asignado. Una cotización sin dueño
 * (anterior al 2026-09-27) solo la toca control total. Las lecturas pasan.
 */
export async function exigirDuenoParaEscribir(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const nivel = nivelDe(req);
  if (nivel === 'total') return next();
  if (nivel === 'lectura') {
    return res.status(403).json({ error: 'Tu rol puede ver las cotizaciones, pero no modificarlas.' });
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return next(); // el controlador responde el 400
  try {
    const { existe, asesorUsuarioId } = await store.duenoDe(id);
    if (!existe) return next(); // el controlador responde el 404
    if (asesorUsuarioId !== null && asesorUsuarioId === usuarioId(req)) return next();
    return res.status(403).json({
      error: 'Esta cotización es de otro asesor: solo su asesor o un administrador pueden modificarla.',
    });
  } catch (e) {
    console.error('exigirDuenoParaEscribir:', e instanceof Error ? e.message : e);
    return res.status(500).json({ error: 'No se pudo comprobar el permiso sobre la cotización.' });
  }
}
