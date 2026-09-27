// Permisos del Cotizador en pantalla (2026-09-27). ESPEJO de
// `backend-api/src/cotizador/lib/permisos.ts`: el backend es quien los impone;
// aquí solo se ocultan o se explican los controles. Si cambia una lista allá,
// cambiarla aquí.
//
//   total    root, admin, gerencia, gerente, jefe_produccion
//   propias  asesor_comercial, asistente_administrativo
//   lectura  el resto
import { useSelector } from 'react-redux';

export type NivelCotizador = 'total' | 'propias' | 'lectura';

const CONTROL_TOTAL = new Set(['root', 'admin', 'gerencia', 'gerente', 'jefe_produccion']);
const EDITAN_PROPIAS = new Set(['asesor_comercial', 'asistente_administrativo']);

export function nivelCotizador(rol: string | null | undefined): NivelCotizador {
    const r = String(rol ?? '').toLowerCase();
    if (CONTROL_TOTAL.has(r)) return 'total';
    if (EDITAN_PROPIAS.has(r)) return 'propias';
    return 'lectura';
}

export interface PermisosCotizador {
    nivel: NivelCotizador;
    usuarioId: number | null;
    usuarioNombre: string;
    /** Configuración, Calibración, precios, catálogo general. */
    administra: boolean;
    puedeCrear: boolean;
    /** ¿Puede modificar una cotización cuyo asesor asignado es `asesorUsuarioId`? */
    puedeEditar: (asesorUsuarioId: number | null | undefined) => boolean;
    /** Por qué no puede modificarla (null = sí puede). */
    motivoNoEditar: (asesorUsuarioId: number | null | undefined, asesorNombre?: string | null) => string | null;
}

export function usePermisosCotizador(): PermisosCotizador {
    const user = useSelector((s: any) => s.auth?.user) as { id?: number; rol?: string; nombre_completo?: string; nombre?: string } | null;
    const nivel = nivelCotizador(user?.rol);
    const usuarioId = Number(user?.id) || null;
    const puedeEditar = (asesorUsuarioId: number | null | undefined) =>
        nivel === 'total' || (nivel === 'propias' && asesorUsuarioId != null && asesorUsuarioId === usuarioId);
    return {
        nivel,
        usuarioId,
        usuarioNombre: user?.nombre_completo ?? user?.nombre ?? '',
        administra: nivel === 'total',
        puedeCrear: nivel !== 'lectura',
        puedeEditar,
        motivoNoEditar: (asesorUsuarioId, asesorNombre) => {
            if (puedeEditar(asesorUsuarioId)) return null;
            if (nivel === 'lectura') return 'Tu rol puede ver las cotizaciones, pero no modificarlas.';
            return `Esta cotización es de ${asesorNombre?.trim() || 'otro asesor'}: solo su asesor o un administrador pueden modificarla.`;
        },
    };
}
