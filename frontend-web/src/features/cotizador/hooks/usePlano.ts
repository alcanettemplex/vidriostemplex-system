import { useEffect, useRef, useState } from 'react';

import { apiPrevisualizarPlano } from '../services/cotizadorApi';
import { Plano } from '../types';

const DEBOUNCE_MS = 350;

/**
 * Previsualización del plano de un producto mientras el vendedor teclea las
 * medidas (modo "por diseño" de TabCotizar). No llama al backend hasta tener
 * disenoId + ancho + alto válidos, y debounce de 350ms porque cada tecla
 * dispara un cambio de anchoCm/altoCm.
 *
 * Condición de carrera: si el usuario cambia de medida antes de que vuelva la
 * respuesta anterior, esa respuesta llega igual pero ya está obsoleta — un
 * contador de petición (`idPeticionRef`) descarta cualquier respuesta que no
 * sea la de la última petición disparada.
 */
export function usePlanoPrevisualizacion(
    disenoId: string | undefined,
    anchoCm: number | undefined,
    altoCm: number | undefined,
): { plano: Plano | null; cargando: boolean; error: string | null } {
    const [plano, setPlano] = useState<Plano | null>(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const idPeticionRef = useRef(0);

    const esValido = Boolean(disenoId)
        && typeof anchoCm === 'number' && Number.isFinite(anchoCm) && anchoCm > 0
        && typeof altoCm === 'number' && Number.isFinite(altoCm) && altoCm > 0;

    useEffect(() => {
        if (!esValido) {
            // Invalida cualquier petición en vuelo: si llega tarde, se descarta.
            idPeticionRef.current++;
            setPlano(null);
            setCargando(false);
            setError(null);
            return;
        }

        const miId = ++idPeticionRef.current;
        setCargando(true);
        setError(null);

        const timer = setTimeout(() => {
            apiPrevisualizarPlano(disenoId as string, anchoCm as number, altoCm as number)
                .then(res => {
                    if (idPeticionRef.current !== miId) return; // ya hay una petición más nueva
                    setPlano(res.data);
                    setCargando(false);
                })
                .catch(e => {
                    if (idPeticionRef.current !== miId) return;
                    setError(e?.response?.data?.error || 'No se pudo cargar el plano del producto.');
                    setPlano(null);
                    setCargando(false);
                });
        }, DEBOUNCE_MS);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [disenoId, anchoCm, altoCm, esValido]);

    return { plano, cargando, error };
}
