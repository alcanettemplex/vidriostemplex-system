import { CampoMeta, OpcionCampo } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Selector de alfajía en ventanas (2026-10-01). Espejo de las reglas de
// `backend-api/src/cotizador/lib/alfajias.ts` — quien las impone es el backend;
// aquí solo se arma la lista que ve el asesor:
//   · solo alfajías del COLOR de la perfilería (no se elige otro color);
//   · un sillar alfajía solo aparece en su sistema (el 581, en el 5020);
//   · la recomendada del sistema va primero y se marca.
// ─────────────────────────────────────────────────────────────────────────────

const normalizarColor = (c: unknown) => {
    const v = String(c ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    return v === 'grisplata' || v === 'gris-plata' ? 'gris plata' : v;
};

const sistemaCorto = (v: unknown) => /(5020|744|8025|7038|3831)/.exec(String(v ?? ''))?.[1] ?? '';

export interface ListaAlfajias {
    opciones: OpcionCampo[];
    recomendada: string | null;
}

/** Opciones del selector para esta ventana, con la recomendada primero. */
export function opcionesAlfajia(campo: CampoMeta, sistemaValor: unknown, colorValor: unknown): ListaAlfajias {
    const color = normalizarColor(colorValor) || 'mate';
    const sistema = sistemaCorto(sistemaValor);
    const refRecomendada = campo.recomendadaPorSistema?.[sistema] ?? null;
    const propias = (campo.opciones ?? [])
        .filter((o): o is OpcionCampo => typeof o === 'object' && o !== null && Boolean(o.value))
        .filter(o => o.color === color && (o.tipoAlfajia !== 'sillar' || o.sistemaAlfajia === sistema));
    const recomendada = propias.find(o => o.tipoAlfajia === 'alfajia' && o.ref === refRecomendada) ?? null;
    if (propias.length === 0) {
        return { opciones: [{ value: '', label: `No hay alfajía en color ${color}` }], recomendada: null };
    }
    const resto = propias.filter(o => o !== recomendada);
    return {
        opciones: recomendada
            ? [{ ...recomendada, label: `${recomendada.label} · recomendada para ${sistema}` }, ...resto]
            : resto,
        recomendada: recomendada ? String(recomendada.value) : null,
    };
}

/**
 * Qué alfajía queda elegida cuando cambia el sistema o el color: la actual si
 * sigue en la lista; si no, la misma referencia en el color nuevo; si no, la
 * recomendada; si no, la primera disponible.
 */
export function ajustarAlfajia(actual: unknown, campo: CampoMeta, lista: ListaAlfajias): string {
    const valores = lista.opciones.map(o => String(o.value)).filter(Boolean);
    const cod = typeof actual === 'string' ? actual : '';
    if (cod && valores.includes(cod)) return cod;
    const anterior = (campo.opciones ?? []).find(o => typeof o === 'object' && o !== null && String(o.value) === cod) as OpcionCampo | undefined;
    if (anterior?.ref) {
        const mismaRef = lista.opciones.find(o => o.ref === anterior.ref && o.tipoAlfajia === anterior.tipoAlfajia);
        if (mismaRef) return String(mismaRef.value);
    }
    return lista.recomendada ?? valores[0] ?? '';
}
