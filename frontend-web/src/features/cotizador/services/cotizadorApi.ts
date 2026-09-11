import axios from 'axios';

import API from '../../../services/config';
import {
    Aptitud, Cotizacion, CotizacionEntrada, CotizacionLigera, DisenoResumen,
    EstadoCotizador, FiltrosListado, ModuloMeta, Parametros, Plano, ResultadoCalculo,
} from '../types';

const BASE = `${API}/api/cotizador`;

// Sin headers a mano: `httpInterceptors.ts` adjunta el Bearer a toda petición
// dirigida a `API`. Mismo criterio que el resto de features nuevas del ERP.

export const apiEstadoCotizador = () => axios.get<EstadoCotizador>(`${BASE}/estado`);

export const apiGetDisenos = (params: { modulo?: string; todos?: boolean } = {}) =>
    axios.get<DisenoResumen[]>(`${BASE}/disenos`, { params: { modulo: params.modulo, todos: params.todos ? '1' : undefined } });

export const apiGetModulos = () => axios.get<ModuloMeta[]>(`${BASE}/modulos`);

export const apiGetParametros = () => axios.get<Parametros>(`${BASE}/parametros`);

/** POST /cotizar/:moduloId — calcula UN ítem, sin guardar nada. */
export const apiCotizarItem = (moduloId: string, input: Record<string, unknown>) =>
    axios.post<ResultadoCalculo>(`${BASE}/cotizar/${encodeURIComponent(moduloId)}`, input);

/** GET /plano — previsualización a una medida cualquiera (modo "por diseño"). */
export const apiPrevisualizarPlano = (disenoId: string, anchoCm: number, altoCm: number) =>
    axios.get<Plano>(`${BASE}/plano`, { params: { disenoId, anchoCm, altoCm } });

/** GET /cotizaciones/:id/items/:itemId/plano — plano de un ítem ya guardado. */
export const apiPlanoDeItem = (cotizacionId: number, itemId: number) =>
    axios.get<Plano>(`${BASE}/cotizaciones/${cotizacionId}/items/${itemId}/plano`);

// ─── Cotizaciones guardadas ─────────────────────────────────────────────────

export const apiListarCotizaciones = (filtros: FiltrosListado = {}) =>
    axios.get<CotizacionLigera[]>(`${BASE}/cotizaciones`, { params: filtros });

export const apiObtenerCotizacion = (id: number) =>
    axios.get<Cotizacion>(`${BASE}/cotizaciones/${id}`);

export const apiAptitudCotizacion = (id: number) =>
    axios.get<Aptitud>(`${BASE}/cotizaciones/${id}/aptitud`);

export const apiCrearCotizacion = (datos: CotizacionEntrada) =>
    axios.post<Cotizacion>(`${BASE}/cotizaciones`, datos);

export const apiActualizarCotizacion = (id: number, datos: CotizacionEntrada) =>
    axios.put<Cotizacion>(`${BASE}/cotizaciones/${id}`, datos);

export const apiEliminarCotizacion = (id: number) =>
    axios.delete<void>(`${BASE}/cotizaciones/${id}`);
