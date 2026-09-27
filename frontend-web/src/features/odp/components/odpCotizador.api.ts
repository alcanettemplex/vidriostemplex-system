import axios from 'axios';

import API from '../../../services/config';
import { Cotizacion, CotizacionLigera } from '../../cotizador/types';

// ─────────────────────────────────────────────────────────────────────────────
// Llamadas de la ficha ODP al Cotizador y a la SAP (2026-09-27, integración).
//
// Viven aquí y no en `features/cotizador/services/cotizadorApi.ts` porque ese
// archivo es del módulo Cotizador; la ficha solo lo LEE. `FiltrosListado` del
// Cotizador aún no declara `odpId`, así que el listado por ODP se pide aquí con
// sus propios parámetros. Sin headers a mano: `httpInterceptors.ts` adjunta el
// Bearer a toda petición dirigida a `API`.
// ─────────────────────────────────────────────────────────────────────────────

const COTIZADOR = `${API}/api/cotizador`;

/** Cotizaciones del Cotizador vinculadas a una ODP (listado ligero, sin blobs). */
export const listarCotizacionesDeOdp = (odpId: number) =>
    axios.get<CotizacionLigera[]>(`${COTIZADOR}/cotizaciones`, { params: { odpId } });

/** Aprobadas (candidatas a vincular). El filtro "sin ODP" se hace en el cliente. */
export const listarCotizacionesAprobadas = () =>
    axios.get<CotizacionLigera[]>(`${COTIZADOR}/cotizaciones`, { params: { estado: 'APROBADA' } });

/** Detalle con los blobs de la propuesta ELEGIDA (o de `propuestaId`). */
export const obtenerCotizacion = (id: number, propuestaId?: number | null) =>
    axios.get<Cotizacion>(`${COTIZADOR}/cotizaciones/${id}`, {
        params: propuestaId ? { propuesta: propuestaId } : undefined,
    });

/** Vincula una cotización a la ODP (solo escribe `cotizador.cotizacion.odp_id`).
 * El backend exige ser su asesor o tener control total (403 si no). */
export const vincularCotizacionAOdp = (id: number, odpId: number | null) =>
    axios.put<Cotizacion>(`${COTIZADOR}/cotizaciones/${id}`, { odpId }, { params: { respuesta: 'ligera' } });

// ─── SAP: traer ítems de la cotización ──────────────────────────────────────

export type ModoTraerSap = 'agregar' | 'reemplazar';

export interface SolicitudTraerSap {
    odp_id: number;
    cotizacion_id?: number;
    /** id de una SAP de la ODP, o 'nueva'. Ausente = la más reciente (o nueva si no hay). */
    sap_id?: number | 'nueva';
    modo?: ModoTraerSap;
    dry_run?: boolean;
}

export interface FilaTraerSap {
    item: string;
    codigo: string;
    descripcion: string;
    dimension: string;
    cantidad: number;
    und: string;
    observacion: string;
    origen_cotizacion_id: number | null;
    tipo: 'perfil' | 'perfil_sin_cortes' | 'accesorio' | 'acabado';
}

export interface CotizacionAprobadaResumen {
    id: number;
    numero: number;
    cliente: string | null;
}

export interface RespuestaTraerSap {
    dry_run: boolean;
    cotizacion: { id: number; numero: number; cliente: string | null; propuesta: { id: number; etiqueta: string } };
    cotizaciones_aprobadas: CotizacionAprobadaResumen[];
    saps: Array<{ id: number; numero_sap: string; items: number }>;
    destino: { sap_id: number | null; numero_sap: string | null; nueva: boolean; items_existentes: number };
    requiere_modo: boolean;
    modo: ModoTraerSap | null;
    reemplazo: { permitido: boolean; motivos: string[] };
    ya_traida: Array<{ sap_id: number; numero_sap: string; items: number }>;
    filas: FilaTraerSap[];
    advertencias: string[];
    excluidos: Array<{ codigo: string; descripcion: string; motivo: string }>;
}

/** POST /documentos/sap/desde-cotizacion. `dry_run` por defecto TRUE en el
 * backend: sin `dry_run: false` explícito, nunca escribe. */
export const traerItemsCotizacionASap = (datos: SolicitudTraerSap) =>
    axios.post<RespuestaTraerSap>(`${API}/api/documentos/sap/desde-cotizacion`, datos);
