import { useEffect, useMemo, useState } from 'react';

import { apiManoObra } from './services/cotizadorApi';
import { LineaManoObra } from './types';

// La cuenta del total en vivo (`calcularTotalesPrevistos`) vive en
// `totalesContrato.ts`, sin React, desde el 2026-10-03: así la prueba
// `totalesContrato.test.ts` del backend la compara contra `calcularTotalesPropuesta()`
// y un desalineo entre pantalla y PDF se detecta antes de desplegar.
// Aquí quedan el tipo del borrador y el hook que pide la mano de obra al backend.
export type { TotalesPrevistos } from './totalesContrato';
export { calcularTotalesPrevistos, totalLineaManoObra } from './totalesContrato';

/** El producto calculado en Cotizar que todavía no se agregó a la propuesta.
 * Entra en el total en vivo del paso 3 para que el vendedor vea cuánto quedaría. */
export interface BorradorCotizar {
    moduloId: string;
    input: Record<string, unknown>;
    subtotalConAiu: number;
    iva: number;
    total: number;
    /** Si se está editando un ítem del carrito, su idTemp: lo reemplaza, no se suma. */
    reemplazaIdTemp: string | null;
}

/**
 * Líneas de mano de obra de un juego de ítems, pedidas al backend (el único
 * sitio donde vive la regla). Se vuelve a pedir solo cuando cambia el módulo o
 * el formulario de algún ítem, con una espera corta para no disparar una
 * petición por tecla. Si la petición falla se conservan las últimas líneas: el
 * total que se ve es una previsualización, y al guardar lo recalcula el backend.
 */
export function useManoObra(items: Array<{ moduloId: string; input: Record<string, unknown> }>): {
    lineas: LineaManoObra[];
    cargando: boolean;
} {
    const clave = useMemo(() => JSON.stringify(items.map((it) => [it.moduloId, it.input])), [items]);
    const [lineas, setLineas] = useState<LineaManoObra[]>([]);
    const [cargando, setCargando] = useState(false);

    useEffect(() => {
        const pedido: Array<[string, Record<string, unknown>]> = JSON.parse(clave);
        if (pedido.length === 0) {
            setLineas([]);
            return;
        }
        let vivo = true;
        setCargando(true);
        const espera = window.setTimeout(() => {
            apiManoObra(pedido.map(([moduloId, input]) => ({ moduloId, input: input ?? {} })))
                .then(({ data }) => { if (vivo) setLineas(Array.isArray(data?.lineas) ? data.lineas : []); })
                .catch(() => { /* se conservan las últimas líneas: ver comentario de la función */ })
                .finally(() => { if (vivo) setCargando(false); });
        }, 300);
        return () => { vivo = false; window.clearTimeout(espera); };
    }, [clave]);

    return { lineas, cargando };
}
