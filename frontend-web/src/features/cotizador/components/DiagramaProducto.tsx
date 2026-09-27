import React from 'react';
import { Loader2, Ruler } from '../../../components/ui/icons';

import { CotaPlano, Plano } from '../types';
import { Chip, EstadoVacio } from './ui';

// ─────────────────────────────────────────────────────────────────────────────
// Dibuja el `Plano` que devuelve el backend (ver planoProducto.ts): un
// rectángulo exterior con "paneles" (marco de aluminio) y, dentro de cada
// uno, opcionalmente su "paño" de vidrio, más las cotas de ancho/alto/paño.
// Es una vista ESQUEMÁTICA de frente para que el vendedor ubique de un
// vistazo la geometría del producto — no un plano técnico de fabricación, y
// el inset del marco alrededor del paño es una proporción visual fija, no la
// medida real de perfilería.
//
// Puramente presentacional: no conoce disenoId ni medidas, sólo pinta lo que
// le pasa el padre (que usa usePlanoPrevisualizacion).
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    plano: Plano | null;
    cargando?: boolean;
    /** Alto máximo del dibujo en px. La Hoja de Trabajo lo fija para que el
     * plano quepa en su caja de alto fijo. */
    altoMaximoPx?: number;
    /** Ancho máximo del dibujo en px (420 en pantalla). */
    anchoMaximoPx?: number;
    /** Hoja impresa: menos relleno alrededor del dibujo, para que el plano use
     * la caja (2026-09-26, el usuario pidió el plano un 50 % más grande). */
    impresion?: boolean;
}

// Margen alrededor del exterior para que quepan las cotas (ticks + texto) sin
// salirse del viewBox.
const MARGEN_FRACCION = 0.18;

// Tope de tamaño del SVG. Antes solo se limitaba el ancho, así que un producto
// alto y angosto (una ventana de escalera de 1000 × 1800) crecía hacia abajo y
// en la Hoja de Trabajo se cortaba contra el borde de la caja (2026-09-26).
const ANCHO_MAXIMO_PX = 420;
const ALTO_MAXIMO_PX = 420;

/** Proporción media de un carácter de la fuente de cotas respecto a su tamaño. */
const ANCHO_CARACTER_EM = 0.6;

const esCotaTipo = <T extends CotaPlano['tipo']>(tipo: T) =>
    (c: CotaPlano): c is Extract<CotaPlano, { tipo: T }> => c.tipo === tipo;

/** Texto + tono del badge de confianza — sólo estados que trae `Plano.confianza`.
 * El tono va contra la primitiva `Chip` compartida (2026-09-20) para que este
 * badge y los del resto del módulo sean el mismo objeto visual; los textos y
 * los tres estados son exactamente los de antes. */
const BADGE_CONFIANZA: Record<Plano['confianza'], { texto: string; tono: 'esmeralda' | 'ambar' | 'rosa' }> = {
    alta: { texto: 'Alta confianza', tono: 'esmeralda' },
    media: { texto: 'Confianza media', tono: 'ambar' },
    nula: { texto: 'Confianza baja', tono: 'rosa' },
};

const DiagramaProducto: React.FC<Props> = ({
    plano, cargando, altoMaximoPx = ALTO_MAXIMO_PX, anchoMaximoPx: anchoTope = ANCHO_MAXIMO_PX, impresion = false,
}) => {
    if (cargando) {
        return (
            <div className="flex items-center justify-center py-16 rounded-xl border border-slate-200 bg-slate-50">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
        );
    }

    if (!plano) {
        return (
            <div className="rounded-xl border border-slate-200 bg-slate-50">
                <EstadoVacio
                    icono={Ruler}
                    titulo="Sin plano para este ítem"
                    detalle="Elige un diseño para ver el esquema con sus cotas. Las medidas libres no tienen plano."
                />
            </div>
        );
    }

    const { exterior, paneles, cotas, confianza, motivo, avisos } = plano;
    const anchoMm = exterior.anchoMm || 1;
    const altoMm = exterior.altoMm || 1;

    const margenLeft = anchoMm * MARGEN_FRACCION;
    const margenTop = altoMm * MARGEN_FRACCION;
    const vbAncho = anchoMm + margenLeft * 1.4;
    const vbAlto = altoMm + margenTop * 1.3;

    // Origen del rectángulo exterior dentro del viewBox: desplazado para dejar
    // sitio a la cota de ancho arriba y la de alto a la izquierda.
    const ox = margenLeft;
    const oy = margenTop;
    const grosorLinea = anchoMm * 0.0025;
    const fuenteCota = anchoMm * 0.04;
    // El ancho que respeta a la vez el tope de ancho y el de alto.
    const anchoMaximoPx = Math.min(anchoTope, altoMaximoPx * (vbAncho / vbAlto));

    const cotasAncho = cotas.filter(esCotaTipo('exterior-ancho'));
    const cotasAlto = cotas.filter(esCotaTipo('exterior-alto'));
    const cotasPano = cotas.filter(esCotaTipo('pano'));

    const colorMotivo = confianza === 'media' ? 'text-amber-600' : confianza === 'nula' ? 'text-rose-600' : 'text-slate-500';
    const badge = BADGE_CONFIANZA[confianza];

    return (
        // En la hoja impresa ocupa todo el ancho de la caja: sin esto el recuadro
        // se encogía al contenido y un plano ancho no llegaba a crecer.
        <div className={impresion ? 'space-y-2 w-full' : 'space-y-2'}>
            {/* Marco del plano: fondo neutro con retícula tenue y aire suficiente
                para que las cotas exteriores no queden pegadas al borde. El
                `pt-12` es para el badge, que va flotando en la esquina: con el
                `p-4` de antes se montaba encima de la cota de ancho. */}
            <div
                className={`relative overflow-hidden rounded-xl border border-slate-200 ${impresion ? 'px-3 pb-2 pt-7' : 'px-5 pb-6 pt-12 sm:px-7 sm:pb-8'}`}
                style={{
                    backgroundColor: '#f8fafc',
                    backgroundImage: 'linear-gradient(#e9eef5 1px, transparent 1px), linear-gradient(90deg, #e9eef5 1px, transparent 1px)',
                    backgroundSize: '20px 20px',
                }}
            >
                <Chip tono={badge.tono} className={`absolute ${impresion ? 'top-1.5 right-1.5' : 'top-3 right-3'}`}>
                    {badge.texto}
                </Chip>
                <svg
                    viewBox={`0 0 ${vbAncho} ${vbAlto}`}
                    preserveAspectRatio="xMidYMid meet"
                    width="100%"
                    style={{ maxWidth: anchoMaximoPx, display: 'block', margin: '0 auto', aspectRatio: `${vbAncho} / ${vbAlto}` }}
                    role="img"
                    aria-label="Plano esquemático del producto"
                >
                    {/* Cota de ancho exterior */}
                    {cotasAncho.map((c, i) => {
                        const y = oy - margenTop * 0.35;
                        return (
                            <g key={`ca-${i}`} stroke="#94a3b8" strokeWidth={grosorLinea}>
                                <line x1={ox} y1={y} x2={ox + anchoMm} y2={y} />
                                <line x1={ox} y1={y - margenTop * 0.08} x2={ox} y2={y + margenTop * 0.08} />
                                <line x1={ox + anchoMm} y1={y - margenTop * 0.08} x2={ox + anchoMm} y2={y + margenTop * 0.08} />
                                <text x={ox + anchoMm / 2} y={y - margenTop * 0.1} textAnchor="middle" fontSize={fuenteCota * 1.4} fontWeight="bold" fill="#000000" stroke="none" fontFamily="Space Grotesk, sans-serif">
                                    {Math.round(c.anchoMm)} mm
                                </text>
                            </g>
                        );
                    })}

                    {/* Cota de alto exterior */}
                    {cotasAlto.map((c, i) => {
                        const x = ox - margenLeft * 0.35;
                        const cy = oy + altoMm / 2;
                        return (
                            <g key={`cl-${i}`} stroke="#94a3b8" strokeWidth={grosorLinea}>
                                <line x1={x} y1={oy} x2={x} y2={oy + altoMm} />
                                <line x1={x - margenLeft * 0.08} y1={oy} x2={x + margenLeft * 0.08} y2={oy} />
                                <line x1={x - margenLeft * 0.08} y1={oy + altoMm} x2={x + margenLeft * 0.08} y2={oy + altoMm} />
                                <text
                                    x={x - margenLeft * 0.12}
                                    y={cy}
                                    textAnchor="middle"
                                    fontSize={fuenteCota * 1.4}
                                    fontWeight="bold"
                                    fill="#000000"
                                    stroke="none"
                                    fontFamily="Space Grotesk, sans-serif"
                                    transform={`rotate(-90 ${x - margenLeft * 0.12} ${cy})`}
                                >
                                    {Math.round(c.altoMm)} mm
                                </text>
                            </g>
                        );
                    })}

                    {/* Rectángulo exterior */}
                    <rect x={ox} y={oy} width={anchoMm} height={altoMm} fill="#ffffff" stroke="#94a3b8" strokeWidth={grosorLinea} />

                    {/* Paneles: marco de aluminio (esquemático) + paño de vidrio si aplica */}
                    {paneles.map((p, i) => {
                        const px = ox + p.xMm;
                        const py = oy + p.yMm;
                        // Inset proporcional al lado menor del panel: representa el marco de
                        // aluminio alrededor del vidrio, sin pretender ser la medida real.
                        const inset = Math.min(p.anchoMm, p.altoMm) * 0.08;
                        const panoAncho = Math.max(p.anchoMm - inset * 2, 0);
                        const panoAlto = Math.max(p.altoMm - inset * 2, 0);
                        return (
                            <g key={i}>
                                <rect x={px} y={py} width={p.anchoMm} height={p.altoMm} fill="#f1f5f9" stroke="#94a3b8" strokeWidth={grosorLinea * 0.6} />
                                {p.pano && (
                                    <rect
                                        x={px + inset}
                                        y={py + inset}
                                        width={panoAncho}
                                        height={panoAlto}
                                        fill="#e0f2fe"
                                        stroke="#38bdf8"
                                        strokeWidth={grosorLinea * 0.6}
                                    />
                                )}
                            </g>
                        );
                    })}

                    {/* Cotas de paño: una por tamaño distinto, ancladas al primer panel que lo tiene */}
                    {cotasPano.map((c, i) => {
                        const panel = paneles.find(p => p.fila === c.fila && p.col === c.col);
                        if (!panel) return null;
                        const cx = ox + panel.xMm + panel.anchoMm / 2;
                        const cy = oy + panel.yMm + panel.altoMm / 2;
                        // El tamaño de la cota se ajusta al ANCHO DEL PAÑO, no al de
                        // la ventana: con tres paños de 450 mm, la fuente pensada
                        // para 1597 mm hacía que las etiquetas se montaran unas
                        // sobre otras (2026-09-26). En dos líneas para que quepa.
                        const medida = `${Math.round(c.anchoMm)}×${Math.round(c.altoMm)}`;
                        const fuente = Math.min(
                            fuenteCota * 1.3,
                            (panel.anchoMm * 0.84) / (medida.length * ANCHO_CARACTER_EM),
                        );
                        return (
                            <text key={`cp-${i}`} x={cx} y={cy} textAnchor="middle" fontSize={fuente} fontWeight="bold" fill="#000000" fontFamily="Space Grotesk, sans-serif">
                                <tspan x={cx} dy={-fuente * 0.1}>{medida}</tspan>
                                <tspan x={cx} dy={fuente * 1.1} fontSize={fuente * 0.8} fontWeight="normal">mm</tspan>
                            </text>
                        );
                    })}
                </svg>
            </div>

            {confianza !== 'alta' && motivo && (
                <p className={`text-xs ${colorMotivo}`}>{motivo}</p>
            )}
            {avisos.length > 0 && (
                <ul className="text-xs text-slate-400 list-disc list-inside space-y-0.5">
                    {avisos.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
            )}
        </div>
    );
};

export default DiagramaProducto;
