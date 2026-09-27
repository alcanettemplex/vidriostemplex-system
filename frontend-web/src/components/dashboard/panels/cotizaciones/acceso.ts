// Quién ve la pestaña Cotizaciones del Dashboard (2026-09-27). ESPEJO de
// `puedeVerPanelCotizaciones` en backend-api/src/services/dashboardCotizaciones.service.ts:
// el backend es quien lo impone (y quien filtra lo del asesor); aquí solo se decide
// si se muestra la pestaña.
import { nivelCotizador } from '../../../../features/cotizador/permisos';

export const puedeVerTableroCotizaciones = (rol: string | null | undefined): boolean =>
  nivelCotizador(rol) === 'total' || String(rol ?? '').toLowerCase() === 'asesor_comercial';
