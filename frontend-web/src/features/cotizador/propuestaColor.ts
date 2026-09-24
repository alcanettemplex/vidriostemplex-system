// ─────────────────────────────────────────────────────────────────────────────
// Color fijo de cada propuesta (2026-09-23).
//
// La propuesta A es siempre índigo, la B verde azulado, la C ámbar… en la barra
// de trabajo, en la franja de destino de Cotizar y en el botón "Agregar a". Es
// reconocimiento en vez de memoria: el vendedor sabe en qué propuesta está por
// el color antes de leer la letra. El color nunca es el único portador del
// dato — la letra va siempre escrita al lado.
//
// Las clases van LITERALES (no se arman con plantillas) porque Tailwind sólo
// genera las que encuentra escritas tal cual en el código.
// ─────────────────────────────────────────────────────────────────────────────

export interface ColorPropuesta {
    /** Pestaña activa de la barra de trabajo. */
    pestanaActiva: string;
    /** Pestaña inactiva: sólo el punto y el borde llevan el color. */
    punto: string;
    /** Franja suave de destino en Cotizar. */
    franja: string;
    /** Texto fuerte sobre la franja. */
    texto: string;
    /** Fondo del botón primario "Agregar a Propuesta X". */
    boton: string;
}

const PALETA: ColorPropuesta[] = [
    {
        pestanaActiva: 'bg-indigo-600 border-indigo-600 text-white',
        punto: 'bg-indigo-500',
        franja: 'bg-indigo-50 border-indigo-200 text-indigo-900',
        texto: 'text-indigo-700',
        boton: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/25',
    },
    {
        pestanaActiva: 'bg-teal-600 border-teal-600 text-white',
        punto: 'bg-teal-500',
        franja: 'bg-teal-50 border-teal-200 text-teal-900',
        texto: 'text-teal-700',
        boton: 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-600/25',
    },
    {
        pestanaActiva: 'bg-amber-500 border-amber-500 text-white',
        punto: 'bg-amber-500',
        franja: 'bg-amber-50 border-amber-200 text-amber-900',
        texto: 'text-amber-700',
        boton: 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/25',
    },
    {
        pestanaActiva: 'bg-rose-600 border-rose-600 text-white',
        punto: 'bg-rose-500',
        franja: 'bg-rose-50 border-rose-200 text-rose-900',
        texto: 'text-rose-700',
        boton: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/25',
    },
    {
        pestanaActiva: 'bg-violet-600 border-violet-600 text-white',
        punto: 'bg-violet-500',
        franja: 'bg-violet-50 border-violet-200 text-violet-900',
        texto: 'text-violet-700',
        boton: 'bg-violet-600 hover:bg-violet-700 text-white shadow-violet-600/25',
    },
];

/** Color de una propuesta por su etiqueta (A…E). Una etiqueta desconocida o
 * nula —cotización todavía sin guardar— cae al de la A, que es la que será. */
export function colorPropuesta(etiqueta: string | null | undefined): ColorPropuesta {
    const i = etiqueta ? etiqueta.toUpperCase().charCodeAt(0) - 65 : 0;
    return PALETA[i >= 0 && i < PALETA.length ? i : 0];
}

/** "Propuesta B · Templado + tablero" — el rótulo con que se nombra en toda la
 * pantalla, para que la barra, la franja, el botón y los avisos digan lo mismo. */
export function rotuloPropuesta(p: { etiqueta: string; nombre: string | null } | null): string {
    if (!p) return 'Propuesta A';
    return `Propuesta ${p.etiqueta}${p.nombre ? ` · ${p.nombre}` : ''}`;
}
