import { useCallback, useEffect, useState } from 'react';

import { Cotizacion, CotizacionLigera } from '../../cotizador/types';
import { listarCotizacionesDeOdp, obtenerCotizacion } from './odpCotizador.api';

/** Tope de detalles que se piden al abrir la ficha. Cada detalle trae los blobs
 * de cálculo de la opción elegida (~4,5 KB por ítem): una ODP normal tiene una
 * o dos cotizaciones, así que el tope solo protege el egress de Supabase ante
 * un caso raro. Las que pasen del tope se muestran con el resumen ligero. */
const MAX_DETALLES = 5;

export interface CotizacionesDeOdp {
    /** Listado ligero (sin blobs), más reciente primero. */
    lista: CotizacionLigera[];
    /** Detalle (opción elegida con sus blobs) por id de cotización. */
    detalles: Record<number, Cotizacion | null>;
    cargando: boolean;
    error: string | null;
    recargar: () => void;
}

/**
 * Cotizaciones del Cotizador vinculadas a una ODP (2026-09-27). Las consumen la
 * sección "Cotizaciones (COT)" y el botón "Traer ítems de la cotización" de la
 * pestaña Comercial, y el formato "Hoja de trabajo" de la pestaña Imprimir.
 */
export function useCotizacionesDeOdp(odpId: number | null | undefined, { conDetalle = true }: { conDetalle?: boolean } = {}): CotizacionesDeOdp {
    const [lista, setLista] = useState<CotizacionLigera[]>([]);
    const [detalles, setDetalles] = useState<Record<number, Cotizacion | null>>({});
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [version, setVersion] = useState(0);

    const recargar = useCallback(() => setVersion(v => v + 1), []);

    useEffect(() => {
        if (!odpId) return;
        let vigente = true;
        setCargando(true);
        setError(null);
        listarCotizacionesDeOdp(odpId)
            .then(async ({ data }) => {
                if (!vigente) return;
                setLista(data);
                if (!conDetalle || data.length === 0) { setDetalles({}); return; }
                const pares = await Promise.all(data.slice(0, MAX_DETALLES).map(c =>
                    obtenerCotizacion(c.id)
                        .then(r => [c.id, r.data] as const)
                        .catch(() => [c.id, null] as const)
                ));
                if (vigente) setDetalles(Object.fromEntries(pares));
            })
            .catch(() => {
                if (vigente) setError('No se pudieron cargar las cotizaciones vinculadas a esta ODP.');
            })
            .finally(() => { if (vigente) setCargando(false); });
        return () => { vigente = false; };
    }, [odpId, conDetalle, version]);

    return { lista, detalles, cargando, error, recargar };
}
