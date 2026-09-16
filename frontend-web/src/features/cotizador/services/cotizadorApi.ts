import axios from 'axios';

import API from '../../../services/config';
import {
    AnalisisPieza, Aptitud, ContrasteCalibracion, Cotizacion, CotizacionEntrada,
    CotizacionLigera, DisenoResumen, EstadoCotizador, EstadoSistemaCalibracion,
    FiltrosListado, HistorialCalibracion, HolguraCalibracion, MaterialCalibracion,
    ModuloMeta, MultiplicadorCategoria, Parametros, PiezaCalibracion, Plano,
    ResultadoCalculo, ResultadoRecalculoCategoria,
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

// ─── Calibración ─────────────────────────────────────────────────────────────

export const apiListarEstadoSistemas = () =>
    axios.get<EstadoSistemaCalibracion[]>(`${BASE}/calibracion/sistemas`);

export const apiActualizarEstadoSistema = (sistema: string, datos: { pausado?: boolean; firmaMaestro?: boolean }) =>
    axios.patch<{ ok: true }>(`${BASE}/calibracion/sistemas/${encodeURIComponent(sistema)}`, datos);

export const apiListarPiezasDeSistema = (sistema: string) =>
    axios.get<PiezaCalibracion[]>(`${BASE}/calibracion/piezas/${encodeURIComponent(sistema)}`);

export const apiListarContrastes = (sistema: string, ref: string) =>
    axios.get<ContrasteCalibracion[]>(`${BASE}/calibracion/contrastes`, { params: { sistema, ref } });

export const apiRegistrarContraste = (datos: {
    sistema: string; ref: string; material: MaterialCalibracion;
    medidaSistemaBrutaMm: number; medidaMaestroMm: number;
    anchoVanoMm?: number | null; altoVanoMm?: number | null; nota?: string | null;
}) => axios.post<ContrasteCalibracion>(`${BASE}/calibracion/contrastes`, datos);

export const apiAnularContraste = (id: number, motivo: string) =>
    axios.patch<ContrasteCalibracion>(`${BASE}/calibracion/contrastes/${id}/anular`, { motivo });

export const apiAnalizarPieza = (sistema: string, ref: string) =>
    axios.get<AnalisisPieza>(`${BASE}/calibracion/analisis`, { params: { sistema, ref } });

export const apiAprobarMargen = (datos: {
    ambito: 'global' | 'sistema' | 'material' | 'pieza';
    sistema?: string; material?: MaterialCalibracion; ref?: string;
    margenMm: number; evidencia?: Record<string, unknown> | null;
}) => axios.post(`${BASE}/calibracion/margenes`, datos);

export const apiAnularMargen = (id: number) =>
    axios.patch<{ ok: true }>(`${BASE}/calibracion/margenes/${id}/anular`);

export const apiListarHolguras = () =>
    axios.get<HolguraCalibracion[]>(`${BASE}/calibracion/holguras`);

export const apiFijarHolgura = (datos: { ambito: 'global' | 'sistema'; sistema?: string; anchoMm: number; altoMm: number; nota?: string | null }) =>
    axios.post<HolguraCalibracion>(`${BASE}/calibracion/holguras`, datos);

export const apiAnularHolgura = (id: number) =>
    axios.patch<{ ok: true }>(`${BASE}/calibracion/holguras/${id}/anular`);

export const apiListarHistorialCalibracion = (params: { sistema?: string; limit?: number } = {}) =>
    axios.get<HistorialCalibracion[]>(`${BASE}/calibracion/historial`, { params });

// ─── Configuración ───────────────────────────────────────────────────────────

export const apiListarMultiplicadores = () =>
    axios.get<MultiplicadorCategoria[]>(`${BASE}/multiplicadores`);

export const apiGuardarMultiplicador = (
    categoria: string,
    datos: { multiplicadorPa: number; multiplicadorPm: number; multiplicadorPb: number; nota?: string | null; motivo: string }
) => axios.put(`${BASE}/multiplicadores/${encodeURIComponent(categoria)}`, datos);

/** `dryRun` muestra el impacto sin mover ningún precio. */
export const apiRecalcularCategoria = (categoria: string, dryRun = false) =>
    axios.post<ResultadoRecalculoCategoria>(
        `${BASE}/multiplicadores/${encodeURIComponent(categoria)}/recalcular`,
        {},
        { params: dryRun ? { dry_run: 'true' } : undefined }
    );

/** PUT /parametros — sólo parámetros de negocio; exige motivo. */
export const apiEditarParametros = (datos: {
    aiu?: number; iva?: number; flete_fijo?: number; alquiler_andamio?: number; huacal?: number;
    smo?: Partial<Parametros['smo']>; motivo: string; por?: string;
}) => axios.put<Parametros>(`${BASE}/parametros`, datos);
