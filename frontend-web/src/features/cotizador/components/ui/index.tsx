import React from 'react';
import { Loader2 } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Primitivas visuales del módulo Cotizador (2026-09-20).
//
// Existen para que las dos mitades de la pantalla —configuración y resultado—
// no acaben con dos lenguajes distintos: antes del rediseño había seis formas
// de pintar una tarjeta blanca con borde, cada una con su radio y su padding.
// Aquí están una sola vez.
//
// Son presentación pura: ni estado, ni llamadas, ni reglas de negocio. Si una
// de estas piezas necesitara saber algo del dominio, el sitio correcto es el
// componente que la usa, no esto.
//
// Convenciones que imponen (ver la guía del rediseño):
//   · tarjetas blancas con `border-slate-200` y `rounded-xl`, sin sombra;
//   · títulos de sección en mayúsculas pequeñas con icono de 14px;
//   · TODO número o importe va en `font-cotizador-head` (Space Grotesk) con
//     `tabular-nums`: dígitos de ancho fijo, que es lo que alinea de verdad una
//     columna de pesos. Se prefirió eso a cargar una tipografía monoespaciada
//     aparte — mismo efecto en las cifras, 0 KB de red.
// ─────────────────────────────────────────────────────────────────────────────

type Tono = 'indigo' | 'esmeralda' | 'ambar' | 'rosa' | 'neutro';

const TONO_CHIP: Record<Tono, string> = {
    indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    esmeralda: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    ambar: 'bg-amber-50 text-amber-800 ring-amber-200',
    rosa: 'bg-rose-50 text-rose-700 ring-rose-200',
    neutro: 'bg-slate-100 text-slate-600 ring-slate-200',
};

/** Píldora pequeña para estados y metadatos (nivel de corte, "Legada",
 * "Estimado", "Provisional"…). El tono nunca es el único portador del
 * significado: el texto dice qué pasa. */
export const Chip: React.FC<{
    tono?: Tono;
    children: React.ReactNode;
    title?: string;
    className?: string;
}> = ({ tono = 'neutro', children, title, className = '' }) => (
    <span
        title={title}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ring-1 text-[10.5px] font-extrabold font-cotizador-head tabular-nums whitespace-nowrap ${TONO_CHIP[tono]} ${className}`}
    >
        {children}
    </span>
);

/** Rótulo de sección: mayúsculas pequeñas + icono. Es el patrón que ya usaba
 * `FormularioModulo` para sus cuatro grupos; se extrae para que el panel de
 * resultado lo comparta y las dos columnas se lean igual. */
export const Etiqueta: React.FC<{
    icono?: React.ComponentType<{ className?: string }>;
    children: React.ReactNode;
    className?: string;
}> = ({ icono: Icono, children, className = '' }) => (
    <h3
        className={`flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-slate-500 font-cotizador-head ${className}`}
    >
        {Icono && <Icono className="w-3.5 h-3.5 text-indigo-500 shrink-0" />}
        {children}
    </h3>
);

/** Contenedor blanco estándar. `accion` es el hueco a la derecha del título
 * (un botón "Ver detalle", un chip de estado…), que en el diseño anterior cada
 * componente resolvía por su cuenta y quedaba a distinta altura. */
export const Tarjeta: React.FC<{
    titulo?: React.ReactNode;
    icono?: React.ComponentType<{ className?: string }>;
    accion?: React.ReactNode;
    plano?: boolean;
    className?: string;
    cuerpoClassName?: string;
    children: React.ReactNode;
}> = ({ titulo, icono, accion, plano = false, className = '', cuerpoClassName = '', children }) => (
    <section
        className={`${plano ? '' : 'bg-white border border-slate-200 rounded-xl'} ${className}`}
    >
        {(titulo || accion) && (
            <header className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2">
                {titulo ? <Etiqueta icono={icono}>{titulo}</Etiqueta> : <span />}
                {accion}
            </header>
        )}
        <div className={`${titulo || accion ? 'px-4 pb-4' : 'p-4'} ${cuerpoClassName}`}>{children}</div>
    </section>
);

/** Par etiqueta/valor de una ficha. `valor` admite nodo para poder meter un
 * chip; si llega vacío se pinta un guion, nunca una celda en blanco que haga
 * dudar de si falta el dato o falta la pantalla. */
export const FilaDato: React.FC<{
    etiqueta: string;
    valor: React.ReactNode;
    numerico?: boolean;
}> = ({ etiqueta, valor, numerico = false }) => {
    const vacio = valor === null || valor === undefined || valor === '';
    return (
        <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0">
            <dt className="text-[12px] text-slate-500 shrink-0">{etiqueta}</dt>
            <dd
                className={`text-[12.5px] font-semibold text-right ${
                    vacio ? 'text-slate-300' : 'text-slate-800'
                } ${numerico ? 'font-cotizador-head tabular-nums' : ''}`}
            >
                {vacio ? '—' : valor}
            </dd>
        </div>
    );
};

/** Hueco con explicación. Un panel vacío sin texto parece roto; con texto
 * enseña qué falta hacer, que es justo lo que el vendedor necesita saber. */
export const EstadoVacio: React.FC<{
    icono?: React.ComponentType<{ className?: string }>;
    titulo: string;
    detalle?: string;
    className?: string;
}> = ({ icono: Icono, titulo, detalle, className = '' }) => (
    <div className={`flex flex-col items-center justify-center text-center py-10 px-6 ${className}`}>
        {Icono && <Icono className="w-8 h-8 text-slate-300 mb-2.5" />}
        <p className="text-[13px] font-bold text-slate-600">{titulo}</p>
        {detalle && <p className="text-[12px] text-slate-400 mt-1 max-w-xs leading-snug">{detalle}</p>}
    </div>
);

interface PropsBoton extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    cargando?: boolean;
    icono?: React.ComponentType<{ className?: string }>;
    ancho?: boolean;
}

const BASE_BOTON =
    'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-bold transition ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-indigo-400 ' +
    'disabled:opacity-40 disabled:cursor-not-allowed';

/** CTA. Mientras `cargando` queda deshabilitado y muestra spinner: es lo que
 * evita el doble envío en una conexión lenta, que aquí significaría cotizar
 * dos veces. */
export const BotonPrimario: React.FC<PropsBoton> = ({
    cargando = false,
    icono: Icono,
    ancho = false,
    disabled,
    children,
    className = '',
    ...resto
}) => (
    <button
        {...resto}
        disabled={disabled || cargando}
        className={`${BASE_BOTON} px-4 py-2.5 bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm ${ancho ? 'w-full' : ''} ${className}`}
    >
        {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : Icono && <Icono className="w-4 h-4" />}
        {children}
    </button>
);

export const BotonSecundario: React.FC<PropsBoton> = ({
    cargando = false,
    icono: Icono,
    ancho = false,
    disabled,
    children,
    className = '',
    ...resto
}) => (
    <button
        {...resto}
        disabled={disabled || cargando}
        className={`${BASE_BOTON} px-3 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 ${ancho ? 'w-full' : ''} ${className}`}
    >
        {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : Icono && <Icono className="w-4 h-4" />}
        {children}
    </button>
);
