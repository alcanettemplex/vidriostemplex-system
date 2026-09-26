import { ModuloMeta } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Descripción COMERCIAL de cada módulo del cotizador (2026-09-26, Fase 5 del
// sistema visual).
//
// El `meta.descripcion` que manda el backend está escrito para quien mantiene
// el motor ("Por diseño (disenoId)… use sistema 8025 con alasCorredizas=3"):
// es documentación técnica, no una frase para el asesor que está con el
// cliente. Aquí va la versión que se lee en pantalla, en una línea.
//
// Las llaves son los ids reales del registro de módulos
// (`backend-api/src/cotizador/modules/registry.ts`, objeto `MODULOS`). Un
// módulo nuevo que todavía no esté aquí no rompe nada: cae a la descripción
// del backend. Presentación pura — el backend sigue siendo la fuente de verdad
// de qué hace cada módulo.
// ─────────────────────────────────────────────────────────────────────────────

const DESCRIPCIONES_COMERCIALES: Record<string, string> = {
    ventanas:
        'Ventanas de aluminio y vidrio: elige un diseño del catálogo (5020, 744, 8025, 7038) o cotiza a medida libre.',
    proyectantes:
        'Ventanas proyectantes sistema 3831: indica las naves y sus medidas; perfiles y herrajes se calculan solos.',
    'cabinas-corredizas':
        'Cabina de baño en vidrio templado con puertas corredizas, a la medida del espacio.',
    'cabinas-batientes':
        'Cabina de baño en vidrio templado con puerta batiente y panel fijo, a la medida del espacio.',
    tablero:
        'Tablero de vidrio templado de 6 u 8 mm con bordes pulidos, perforaciones y elevadores; matizado y película opcionales.',
    espejo:
        'Espejo de 4 mm con borde pulido brillado o biselado, con soporte tubular opcional.',
    'item-libre':
        'Para lo que no encaja en los demás (fachadas, divisiones, barandas): arma el ítem línea por línea desde el catálogo.',
};

/** Frase comercial del módulo; si su id no está en el mapa, la descripción
 * que manda el backend. */
export function descripcionComercial(modulo: Pick<ModuloMeta, 'id' | 'descripcion'>): string {
    return DESCRIPCIONES_COMERCIALES[modulo.id] ?? modulo.descripcion;
}
