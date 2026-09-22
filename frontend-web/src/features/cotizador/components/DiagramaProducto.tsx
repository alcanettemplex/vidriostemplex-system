import React from 'react';
import { Loader2, Ruler } from 'lucide-react';

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
}

// Margen alrededor del exterior para que quepan las cotas (ticks + texto) sin
// salirse del viewBox.
const MARGEN_FRACCION = 0.18;

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

const DiagramaProducto: React.FC<Props> = ({ plano, cargando }) => {
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

    const cotasAncho = cotas.filter(esCotaTipo('exterior-ancho'));
    const cotasAlto = cotas.filter(esCotaTipo('exterior-alto'));
    const cotasPano = cotas.filter(esCotaTipo('pano'));

    const colorMotivo = confianza === 'media' ? 'text-amber-600' : confianza === 'nula' ? 'text-rose-600' : 'text-slate-500';
    const badge = BADGE_CONFIANZA[confianza];

    return (
        <div className="space-y-2">
            {/* Marco del plano: fondo neutro con retícula tenue y aire suficiente
                para que las cotas exteriores no queden pegadas al borde. El
                `pt-12` es para el badge, que va flotando en la esquina: con el
                `p-4` de antes se montaba encima de la cota de ancho. */}
            <div
                className="relative overflow-hidden rounded-xl border border-slate-200 px-5 pb-6 pt-12 sm:px-7 sm:pb-8"
                style={{
                    backgroundColor: '#f8fafc',
                    backgroundImage: 'linear-gradient(#e9eef5 1px, transparent 1px), linear-gradient(90deg, #e9eef5 1px, transparent 1px)',
                    backgroundSize: '20px 20px',
                }}
            >
                <Chip tono={badge.tono} className="absolute top-3 right-3">
                    {badge.texto}
                </Chip>
                <svg
                    viewBox={`0 0 ${vbAncho} ${vbAlto}`}
                    preserveAspectRatio="xMidYMid meet"
                    width="100%"
                    style={{ maxWidth: 420, display: 'block', margin: '0 auto', aspectRatio: `${vbAncho} / ${vbAlto}` }}
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
                        return (
                            <text key={`cp-${i}`} x={cx} y={cy} textAnchor="middle" fontSize={fuenteCota * 1.3} fontWeight="bold" fill="#000000" fontFamily="Space Grotesk, sans-serif">
                                {Math.round(c.anchoMm)}×{Math.round(c.altoMm)} mm
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
