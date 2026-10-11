import { useEffect, useMemo, useState } from 'react';

import { apiManoObra } from './services/cotizadorApi';
import { LineaManoObra, OpcionInstalacion } from './types';

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
export function useManoObra(
    items: Array<{ moduloId: string; input: Record<string, unknown> }>,
    /** Casilla de Instalación de la opción (2026-10-11). Ausente = opción
     * anterior: manda la casilla de cada producto. */
    instalacion?: OpcionInstalacion,
): {
    lineas: LineaManoObra[];
    cargando: boolean;
    /** Instalación automática por tarifas (con AIU): el "Calculado" del panel. */
    instalacionCalculada: number | null;
} {
    const clave = useMemo(
        () => JSON.stringify({ items: items.map((it) => [it.moduloId, it.input]), instalacion: instalacion ?? null }),
        [items, instalacion]
    );
    const [lineas, setLineas] = useState<LineaManoObra[]>([]);
    const [instalacionCalculada, setInstalacionCalculada] = useState<number | null>(null);
    const [cargando, setCargando] = useState(false);

    useEffect(() => {
        const { items: pedido, instalacion: inst } = JSON.parse(clave) as {
            items: Array<[string, Record<string, unknown>]>;
            instalacion: OpcionInstalacion | null;
        };
        if (pedido.length === 0) {
            setLineas([]);
            setInstalacionCalculada(0);
            return;
        }
        let vivo = true;
        setCargando(true);
        const espera = window.setTimeout(() => {
            apiManoObra(pedido.map(([moduloId, input]) => ({ moduloId, input: input ?? {} })), inst ?? undefined)
                .then(({ data }) => {
                    if (!vivo) return;
                    setLineas(Array.isArray(data?.lineas) ? data.lineas : []);
                    setInstalacionCalculada(Number.isFinite(Number(data?.instalacionCalculada)) ? Number(data.instalacionCalculada) : null);
                })
                .catch(() => { /* se conservan las últimas líneas: ver comentario de la función */ })
                .finally(() => { if (vivo) setCargando(false); });
        }, 300);
        return () => { vivo = false; window.clearTimeout(espera); };
    }, [clave]);

    return { lineas, cargando, instalacionCalculada };
}
