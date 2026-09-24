import React from 'react';
import { Loader2, X } from 'lucide-react';

import { EstadoCotizacion } from '../../types';

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
 * componente resolvía por su cuenta y quedaba a distinta altura.
 *
 * `descripcion` es la frase de contexto que antes vivía en una barra gris
 * aparte (`bg-slate-50 border-b`, patrón de Configuración/Calibración antes
 * del rediseño): va bajo el título, dentro de la misma tarjeta blanca, sin
 * barra — la explicación de negocio no se pierde, sólo deja de tener un
 * lenguaje visual propio.
 *
 * `sinRelleno` es para el caso de una tabla que debe llegar edge-to-edge
 * (Configuración, Calibración, Guardadas): quita el padding del cuerpo y
 * activa `overflow-hidden` para que las esquinas redondeadas corten la tabla
 * limpio. NO es el default: la mayoría de usos de Tarjeta llevan un
 * `SelectorDiseno` o un `<select>` con menú `position: absolute` dentro, y
 * `overflow-hidden` se lo recortaría contra el borde de la tarjeta. */
export const Tarjeta: React.FC<{
    titulo?: React.ReactNode;
    descripcion?: React.ReactNode;
    icono?: React.ComponentType<{ className?: string }>;
    accion?: React.ReactNode;
    plano?: boolean;
    sinRelleno?: boolean;
    className?: string;
    cuerpoClassName?: string;
    children: React.ReactNode;
}> = ({
    titulo, descripcion, icono, accion, plano = false, sinRelleno = false,
    className = '', cuerpoClassName = '', children,
}) => (
    <section
        className={`${plano ? '' : 'bg-white border border-slate-200 rounded-xl'} ${sinRelleno ? 'overflow-hidden' : ''} ${className}`}
    >
        {(titulo || accion) && (
            <header className={`flex items-start justify-between gap-2 px-4 pt-3.5 ${sinRelleno ? 'pb-3.5 border-b border-slate-100' : 'pb-2'}`}>
                <div className="min-w-0">
                    {titulo ? <Etiqueta icono={icono}>{titulo}</Etiqueta> : <span />}
                    {descripcion && <p className="text-[11.5px] text-slate-400 mt-1 leading-snug">{descripcion}</p>}
                </div>
                {accion}
            </header>
        )}
        <div className={sinRelleno ? cuerpoClassName : `${titulo || accion ? 'px-4 pb-4' : 'p-4'} ${cuerpoClassName}`}>
            {children}
        </div>
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

/** Estado por defecto de `EstadoCotizacion`, en un solo sitio: antes
 * `badgeEstado()` estaba copiada literal en `TabGuardadas` y en
 * `ModalDetalleCotizacion`, con las mismas cuatro entradas. */
const TONO_ESTADO_COTIZACION: Record<EstadoCotizacion, Tono> = {
    PENDIENTE: 'ambar',
    APROBADA: 'esmeralda',
    CANCELADO: 'neutro',
    PERDIDO: 'rosa',
};

const ETIQUETA_ESTADO_COTIZACION: Record<EstadoCotizacion, string> = {
    PENDIENTE: 'Pendiente',
    APROBADA: 'Aprobada',
    CANCELADO: 'Cancelado',
    PERDIDO: 'Perdido',
};

export const ChipEstadoCotizacion: React.FC<{ estado: EstadoCotizacion; className?: string }> = ({ estado, className }) => (
    <Chip tono={TONO_ESTADO_COTIZACION[estado] ?? 'neutro'} className={className}>
        {ETIQUETA_ESTADO_COTIZACION[estado] ?? estado}
    </Chip>
);

const TONO_NIVEL_CORTE: Record<'A' | 'B' | 'C', Tono> = {
    A: 'esmeralda',
    B: 'ambar',
    C: 'neutro',
};

const TITULO_NIVEL_CORTE: Record<'A' | 'B' | 'C', string> = {
    A: 'Nivel A — todas las medidas determinadas al milímetro',
    B: 'Nivel B — alguna pieza que divide puede variar ±1 mm; el resto está determinado',
    C: 'Nivel C — alguna pieza sigue con la fórmula aproximada: su desviación no está acotada',
};

/** Chip del nivel de corte A/B/C. Unifica el estilo "ring" que ya usaba
 * `SelectorDiseno` (donde C es informativo: "todos cotizan igual, la
 * diferencia sólo importa al cortar") con el que tenía `TabCalibracion`
 * (donde C sí bloquea: la pieza queda vetada para orden de corte). Son dos
 * situaciones reales distintas, no sólo dos estilos — por eso `alertaEnC` es
 * explícito en vez de asumir un único color para C en todas partes. */
export const ChipNivelCorte: React.FC<{ nivel: string; alertaEnC?: boolean; className?: string }> = ({
    nivel, alertaEnC = false, className,
}) => {
    const n: 'A' | 'B' | 'C' = nivel === 'A' || nivel === 'B' ? nivel : 'C';
    const tono: Tono = n === 'C' && alertaEnC ? 'rosa' : TONO_NIVEL_CORTE[n];
    return (
        <Chip tono={tono} title={TITULO_NIVEL_CORTE[n]} className={className}>
            {n === 'C' && alertaEnC ? 'C — vetada' : nivel}
        </Chip>
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
    /** Botón denso para una fila de tabla o un formulario apretado
     * (Calibración, Configuración): antes cada archivo declaraba su propio
     * `btnPrimary`/`btnSecundario` en vez de usar el CTA de aquí, porque el
     * CTA es demasiado grande para caber al lado de una fila. */
    compacto?: boolean;
}

interface PropsBotonPrimario extends PropsBoton {
    /** Reemplaza el índigo por otro color de fondo (el de la propuesta en
     * "Agregar a Propuesta B"). Reemplaza, no se suma: dos clases `bg-*` en el
     * mismo elemento las resuelve el orden del CSS, no el del atributo, y el
     * resultado sería impredecible. Vive sólo aquí para que los otros botones no
     * lo reenvíen al `<button>` del DOM. */
    claseColor?: string;
}

const BASE_BOTON =
    'inline-flex items-center justify-center rounded-lg font-bold transition ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-indigo-400 ' +
    'disabled:opacity-40 disabled:cursor-not-allowed';

const TAMANO_BOTON: Record<'normal' | 'compacto', string> = {
    normal: 'gap-2 px-4 py-2.5 text-sm',
    compacto: 'gap-1.5 px-3 py-1.5 text-[13px]',
};

const iconoBoton = (compacto: boolean) => (compacto ? 'w-3.5 h-3.5' : 'w-4 h-4');

/** CTA. Mientras `cargando` queda deshabilitado y muestra spinner: es lo que
 * evita el doble envío en una conexión lenta, que aquí significaría cotizar
 * dos veces. */
export const BotonPrimario: React.FC<PropsBotonPrimario> = ({
    cargando = false,
    icono: Icono,
    ancho = false,
    compacto = false,
    claseColor = 'bg-indigo-600 text-white hover:bg-indigo-700',
    disabled,
    children,
    className = '',
    ...resto
}) => (
    <button
        {...resto}
        disabled={disabled || cargando}
        className={`${BASE_BOTON} ${TAMANO_BOTON[compacto ? 'compacto' : 'normal']} ${claseColor} shadow-sm ${ancho ? 'w-full' : ''} ${className}`}
    >
        {cargando ? <Loader2 className={`${iconoBoton(compacto)} animate-spin`} /> : Icono && <Icono className={iconoBoton(compacto)} />}
        {children}
    </button>
);

export const BotonSecundario: React.FC<PropsBoton> = ({
    cargando = false,
    icono: Icono,
    ancho = false,
    compacto = false,
    disabled,
    children,
    className = '',
    ...resto
}) => (
    <button
        {...resto}
        disabled={disabled || cargando}
        className={`${BASE_BOTON} ${TAMANO_BOTON[compacto ? 'compacto' : 'normal']} bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 ${ancho ? 'w-full' : ''} ${className}`}
    >
        {cargando ? <Loader2 className={`${iconoBoton(compacto)} animate-spin`} /> : Icono && <Icono className={iconoBoton(compacto)} />}
        {children}
    </button>
);

/** Acción destructiva (anular un contraste, una holgura…). No existía en el
 * sistema: cada archivo que la necesitaba (sólo Calibración) declaraba su
 * propio `btnPeligro` suelto. */
export const BotonPeligro: React.FC<PropsBoton> = ({
    cargando = false,
    icono: Icono,
    ancho = false,
    compacto = false,
    disabled,
    children,
    className = '',
    ...resto
}) => (
    <button
        {...resto}
        disabled={disabled || cargando}
        className={`${BASE_BOTON} ${TAMANO_BOTON[compacto ? 'compacto' : 'normal']} bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 ${ancho ? 'w-full' : ''} ${className}`}
    >
        {cargando ? <Loader2 className={`${iconoBoton(compacto)} animate-spin`} /> : Icono && <Icono className={iconoBoton(compacto)} />}
        {children}
    </button>
);

// ─── Campos de formulario ───────────────────────────────────────────────────
// Extraídos de `CampoDinamico` (el control más cuidado del módulo: alto fijo
// de 40px para el objetivo de clic mínimo, ring de foco, estado de error), en
// vez de los `inputClass`/`labelClass` más simples que cuatro archivos
// distintos (Guardadas, Calibración, Configuración, ModalClonarPropuesta)
// declaraban cada uno por su cuenta. `CampoDinamico` sigue componiendo su
// propia cadena de clases para los casos con sufijo de unidad (mm/%) — sólo
// pasa a importar los tokens de aquí en vez de repetirlos.

export const CONTROL_LABEL_CLASS = 'block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1';

const CONTROL_BASE =
    'w-full h-10 px-3 text-sm rounded-lg bg-white text-slate-800 border transition ' +
    'focus:outline-none focus:ring-2';
export const CONTROL_NORMAL = 'border-slate-300 hover:border-slate-400 focus:border-indigo-500 focus:ring-indigo-200';
export const CONTROL_ERROR = 'border-rose-400 bg-rose-50/40 focus:border-rose-500 focus:ring-rose-200';

/** Cadena de clases del control (input/select). `extra` va al final para que
 * un consumidor pueda angostar el ancho (`w-24` en las columnas PA/PM/PB de
 * Configuración) — mismo patrón de composición que ya usaba esa pantalla. */
export const claseControl = (error = false, extra = '') =>
    `${CONTROL_BASE} ${error ? CONTROL_ERROR : CONTROL_NORMAL} ${extra}`.trim();

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { error?: boolean }> = ({
    error = false, className = '', ...resto
}) => <input className={claseControl(error, className)} {...resto} />;

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }> = ({
    error = false, className = '', children, ...resto
}) => <select className={claseControl(error, className)} {...resto}>{children}</select>;

/** Envoltorio simple etiqueta+control+ayuda, para los formularios sin
 * validación campo a campo (Guardadas, Calibración, Configuración,
 * ModalClonarPropuesta usan `toast.error` para eso). `CampoDinamico` no lo
 * usa: necesita `aria-describedby`/id explícitos que este envoltorio no
 * expone. */
export const Campo: React.FC<{
    etiqueta: string;
    requerido?: boolean;
    ayuda?: string;
    htmlFor?: string;
    children: React.ReactNode;
    className?: string;
}> = ({ etiqueta, requerido = false, ayuda, htmlFor, children, className = '' }) => (
    <div className={className}>
        <label htmlFor={htmlFor} className={CONTROL_LABEL_CLASS}>
            {etiqueta}{requerido && <span className="text-rose-500"> *</span>}
        </label>
        {children}
        {ayuda && <p className="text-[10px] text-slate-400 mt-0.5">{ayuda}</p>}
    </div>
);

// ─── Modal ───────────────────────────────────────────────────────────────────

/** Chrome compartido de un modal del Cotizador: backdrop + panel blanco
 * centrado + header sticky con título/subtítulo/cerrar. `ModalDetalleCotizacion`
 * y `ModalClonarPropuesta` repetían este markup carácter por carácter (mismo
 * comentario "calcado de…" en los dos archivos, ver git log). `accionesHeader`
 * es el hueco antes del botón de cerrar (el selector Normal/Técnica/Comparar
 * de ModalDetalleCotizacion); `pie` es un footer sticky opcional con los
 * botones de acción — ModalDetalleCotizacion NO lo usa porque sus acciones
 * sólo aplican a la vista "Normal", no a las tres vistas del modal. */
export const ModalShell: React.FC<{
    titulo: React.ReactNode;
    subtitulo?: React.ReactNode;
    accionesHeader?: React.ReactNode;
    anchoMaximo?: string;
    onClose: () => void;
    pie?: React.ReactNode;
    children: React.ReactNode;
}> = ({ titulo, subtitulo, accionesHeader, anchoMaximo = 'max-w-2xl', onClose, pie, children }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
        <div className={`bg-white rounded-2xl shadow-2xl w-full ${anchoMaximo} max-h-[90vh] overflow-y-auto border border-slate-200 font-cotizador`}>
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
                <div className="min-w-0">
                    <h2 className="text-lg font-bold text-slate-800 font-cotizador-head truncate">{titulo}</h2>
                    {subtitulo && <p className="text-xs text-slate-500 font-medium truncate">{subtitulo}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {accionesHeader}
                    <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition">
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {children}

            {pie && (
                <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 sticky bottom-0 bg-white">
                    {pie}
                </div>
            )}
        </div>
    </div>
);
