import axios from 'axios';

import API from '../../../services/config';
import {
    AnalisisPieza, Aptitud, CargoEntrada, ComparativaPropuestas, ContrasteCalibracion,
    Cotizacion, CotizacionEntrada, CotizacionLigera, DisenoResumen, EstadoCotizador,
    EstadoSistemaCalibracion, FiltrosListado, HistorialCalibracion, HolguraCalibracion,
    MaterialCalibracion, ModuloMeta, MultiplicadorCategoria, Parametros, PiezaCalibracion,
    Plano, ProductoCatalogo, ResultadoCalculo, ResultadoRecalculoCategoria,
    RespuestaPropuesta, SugerenciaSMO, TipoObraSeleccion,
} from '../types';

const BASE = `${API}/api/cotizador`;

// Sin headers a mano: `httpInterceptors.ts` adjunta el Bearer a toda petición
// dirigida a `API`. Mismo criterio que el resto de features nuevas del ERP.

export const apiEstadoCotizador = () => axios.get<EstadoCotizador>(`${BASE}/estado`);

export const apiGetDisenos = (params: { modulo?: string; todos?: boolean } = {}) =>
    axios.get<DisenoResumen[]>(`${BASE}/disenos`, { params: { modulo: params.modulo, todos: params.todos ? '1' : undefined } });

export const apiGetModulos = () => axios.get<ModuloMeta[]>(`${BASE}/modulos`);

export const apiGetParametros = () => axios.get<Parametros>(`${BASE}/parametros`);

/** GET /catalogo — productos con precio. Siempre con `categoria`: sin filtro son
 * 430 filas y ninguna pantalla las necesita todas. */
export const apiGetCatalogo = (categoria?: string) =>
    axios.get<ProductoCatalogo[]>(`${BASE}/catalogo`, { params: categoria ? { categoria } : undefined });

/** POST /cotizar/:moduloId — calcula UN ítem, sin guardar nada. */
export const apiCotizarItem = (moduloId: string, input: Record<string, unknown>) =>
    axios.post<ResultadoCalculo>(`${BASE}/cotizar/${encodeURIComponent(moduloId)}`, input);

/** GET /plano — previsualización a una medida cualquiera (modo "por diseño"). */
export const apiPrevisualizarPlano = (disenoId: string, anchoCm: number, altoCm: number) =>
    axios.get<Plano>(`${BASE}/plano`, { params: { disenoId, anchoCm, altoCm } });

/**
 * GET /cotizaciones/:id/items/:itemId/plano — plano de un ítem ya guardado.
 *
 * `propuestaId` no es opcional por comodidad: el plano sale del blob
 * `resultado`, y el backend sólo carga los blobs de UNA propuesta. Sin el
 * parámetro, un ítem de la propuesta B devuelve 404 aunque exista.
 */
export const apiPlanoDeItem = (cotizacionId: number, itemId: number, propuestaId?: number | null) =>
    axios.get<Plano>(`${BASE}/cotizaciones/${cotizacionId}/items/${itemId}/plano`, {
        params: propuestaId ? { propuesta: propuestaId } : undefined,
    });

// ─── Cotizaciones guardadas ─────────────────────────────────────────────────

export const apiListarCotizaciones = (filtros: FiltrosListado = {}) =>
    axios.get<CotizacionLigera[]>(`${BASE}/cotizaciones`, { params: filtros });

/**
 * GET /cotizaciones/:id — detalle.
 *
 * Devuelve en `items` los de la propuesta ACTIVA con sus blobs, y en
 * `propuestas[]` todas, con ítems ligeros salvo la activa. Sin `propuestaId` la
 * activa es la elegida y, si no hay ninguna elegida, la primera.
 */
export const apiObtenerCotizacion = (id: number, propuestaId?: number | null) =>
    axios.get<Cotizacion>(`${BASE}/cotizaciones/${id}`, {
        params: propuestaId ? { propuesta: propuestaId } : undefined,
    });

export const apiAptitudCotizacion = (id: number) =>
    axios.get<Aptitud>(`${BASE}/cotizaciones/${id}/aptitud`);

export const apiCrearCotizacion = (datos: CotizacionEntrada) =>
    axios.post<Cotizacion>(`${BASE}/cotizaciones`, datos);

export const apiActualizarCotizacion = (id: number, datos: CotizacionEntrada) =>
    axios.put<Cotizacion>(`${BASE}/cotizaciones/${id}`, datos);

export const apiEliminarCotizacion = (id: number) =>
    axios.delete<void>(`${BASE}/cotizaciones/${id}`);

// ─── Propuestas (A/B/C…) de una cotización ──────────────────────────────────
// Toda respuesta de escritura devuelve la cotización recargada (y las de crear
// y clonar, además, el id de la propuesta nueva): la pantalla nunca recompone
// los totales por su cuenta, los pinta tal como los devolvió el backend.

/** POST /propuestas — vacía, o copia EXACTA de otra con `desdePropuestaId`
 * (mismos ítems, mismos cargos, sin recalcular). La etiqueta A…E la asigna el
 * backend: si la eligiera el cliente, dos pestañas abiertas crearían dos "B". */
export const apiCrearPropuesta = (
    cotizacionId: number,
    datos: { nombre?: string | null; nota?: string | null; descuentoPct?: number; desdePropuestaId?: number } = {}
) => axios.post<RespuestaPropuesta>(`${BASE}/cotizaciones/${cotizacionId}/propuestas`, datos);

/** POST /propuestas/:pid/clonar — la misma obra con otro vidrio: recalcula cada
 * ítem con el motor. No bloquea si algo sale con errores de precio; devuelve
 * `advertencias` para que la pantalla las muestre. */
export const apiClonarPropuesta = (
    cotizacionId: number,
    propuestaId: number,
    datos: {
        nombre?: string | null; nota?: string | null;
        codigoVidrio?: string; pelicula?: boolean; matizado?: boolean | 'total' | 'raya' | 'dibujo';
    }
) => axios.post<RespuestaPropuesta>(`${BASE}/cotizaciones/${cotizacionId}/propuestas/${propuestaId}/clonar`, datos);

export const apiActualizarPropuesta = (
    cotizacionId: number,
    propuestaId: number,
    datos: { nombre?: string | null; nota?: string | null; descuentoPct?: number }
) => axios.patch<Cotizacion>(`${BASE}/cotizaciones/${cotizacionId}/propuestas/${propuestaId}`, datos);

/** PATCH /propuestas/:pid/elegir — la que se le cobra al cliente y la que manda
 * a corte. Con la cotización APROBADA responde 409: pudo salir material a corte
 * con las medidas de la actual. */
export const apiElegirPropuesta = (cotizacionId: number, propuestaId: number) =>
    axios.patch<Cotizacion>(`${BASE}/cotizaciones/${cotizacionId}/propuestas/${propuestaId}/elegir`, {});

/** DELETE /propuestas/:pid — 409 si es la única, o si es la elegida de una
 * cotización aprobada. */
export const apiEliminarPropuesta = (cotizacionId: number, propuestaId: number) =>
    axios.delete<Cotizacion>(`${BASE}/cotizaciones/${cotizacionId}/propuestas/${propuestaId}`);

/** PUT /propuestas/:pid/cargos — reemplaza el juego COMPLETO. Es un PUT y no un
 * PATCH por línea porque el panel es un formulario que se edita entero.
 * Responde 409 sobre una propuesta legada (sus cargos viven dentro de los
 * ítems): en ese caso hay que duplicarla. */
export const apiGuardarCargos = (cotizacionId: number, propuestaId: number, cargos: CargoEntrada[]) =>
    axios.put<Cotizacion>(`${BASE}/cotizaciones/${cotizacionId}/propuestas/${propuestaId}/cargos`, { cargos });

/** GET /comparar — tabla lado a lado. La pantalla que se gira hacia el cliente. */
export const apiCompararPropuestas = (cotizacionId: number) =>
    axios.get<ComparativaPropuestas>(`${BASE}/cotizaciones/${cotizacionId}/comparar`);

/** GET /propuestas/:pid/smo-sugerido — `{ monto, explicacion, tiposObra }`. El
 * monto es una SUGERENCIA: si el vendedor lo cambia, el cargo pasa a MANUAL.
 * `tiposObra` viene con las tarifas vigentes porque son editables desde
 * Configuración y el selector no debe tenerlas cacheadas. */
export const apiSmoSugerido = (cotizacionId: number, propuestaId: number, tipoObra: TipoObraSeleccion) =>
    axios.get<SugerenciaSMO>(`${BASE}/cotizaciones/${cotizacionId}/propuestas/${propuestaId}/smo-sugerido`, {
        params: { tipoObra },
    });

/** POST /smo-sugerido — la misma sugerencia para una cotización que todavía no
 * se ha guardado: no hay ids a los que colgarse, así que el carrito viaja en el
 * cuerpo. Es POST pero no escribe nada. Se usa en Cotizar mientras el vendedor
 * arma el primer borrador; con la cotización ya guardada manda `apiSmoSugerido`. */
export const apiSmoSugeridoBorrador = (
    items: Array<{ moduloId?: string; input?: Record<string, unknown>; resultado?: Record<string, unknown> | null }>,
    tipoObra: TipoObraSeleccion,
) => axios.post<SugerenciaSMO>(`${BASE}/smo-sugerido`, { items, tipoObra });

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
