// Instalación como cargo de la obra (2026-10-11, decisión del usuario).
//
// La casilla vive en la OPCIÓN (panel de cargos), no en cada producto. Para que
// todo lo que ya leía la casilla del producto (PDF, Crear ODP, WhatsApp, Hoja de
// Trabajo, la frase "Suministro e instalación de…") siga funcionando, se SELLA en
// `input.conInstalacion` de cada ítem. El backend hace lo mismo al guardar
// (`sellarItem` en cotizacionStore.ts); esto es solo para que la pantalla no
// espere al guardado.

import type { ResultadoCalculo } from './types';

const CON = 'Suministro e instalación de';
const SIN = 'Suministro de';

/** Cambia el verbo de la frase comercial sin pedirla de nuevo al backend: son las
 * dos únicas formas que produce `descripcionComercial` (ver detalleComercial.ts). */
function conVerbo(frase: string, activa: boolean): string {
    return activa ? frase.replace(SIN, CON) : frase.replace(CON, SIN);
}

/** Sella la casilla en un ítem. Un ítem sin la clave (ítem libre) queda igual. */
export function sellarInstalacion<T extends { input: Record<string, unknown>; resultado: ResultadoCalculo }>(
    item: T,
    activa: boolean,
): T {
    if (!item.input || !('conInstalacion' in item.input) || item.input.conInstalacion === activa) return item;
    const frase = item.resultado?.descripcionComercial;
    return {
        ...item,
        input: { ...item.input, conInstalacion: activa },
        resultado: typeof frase === 'string' ? { ...item.resultado, descripcionComercial: conVerbo(frase, activa) } : item.resultado,
    };
}
