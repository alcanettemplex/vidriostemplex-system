import React from 'react';

import { TemplexLogo } from '../../../components/ui/TemplexLogo';
import { Cotizacion, DespieceItem, ItemCotizacion, ModuloMeta, OpcionCampo, Plano, Propuesta } from '../types';
import { fmtFecha } from '../format';
import DiagramaProducto from './DiagramaProducto';

// ─────────────────────────────────────────────────────────────────────────────
// Hoja de Trabajo — documento INTERNO para el taller, sin plata.
//
// A diferencia del PDF de cotización (pdfmake, para el cliente), esta se
// imprime con `window.print()` vía `abrirVentanaImpresion()` — mismo patrón
// que `PrintableProduccion`/`PrintableOA` de la ODP real: nunca sale del
// edificio, así que no necesita ser un archivo portátil.
//
// DOS PÁGINAS, DOS NIVELES DE CONFIANZA DISTINTOS (2026-09-21):
//   Página 1 — resumen por producto (lo que tecleó el asesor: sistema, color,
//   vidrio, vano) + el plano esquemático. Es siempre cierto, cotizado o no.
//   Página 2 — especificaciones de corte por perfil y vidrio (el despiece
//   calculado). Sale SIEMPRE (es el único documento de taller que existe, no
//   pasa por `/aptitud`), pero si el nivel del diseño es C o hay líneas en
//   error, lleva un aviso: esa es exactamente la condición que en el resto del
//   sistema bloquea la Orden de Corte (`NIVELES_APTOS_PARA_CORTE` en
//   `motorDespiece.ts` = {A, B}). Aquí no se bloquea, se advierte — el taller
//   decide con la información completa en vez de quedarse sin nada.
//
// Los campos técnicos de la página 1 se resuelven de forma GENÉRICA contra
// `modulo.campos` (el mismo contrato que ya usa el formulario de Cotizar)
// filtrando por `grupo: 'medidas' | 'vidrio'` — nunca 'cliente' (ahí vive el
// segmento PA/PM/PB, comercial) ni 'comercial'. Así no hace falta mapear a
// mano los 6 módulos.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    cot: Cotizacion;
    propuesta: Propuesta | null;
    modulos: ModuloMeta[];
    planos: Record<number, Plano | null>;
    despieces: Record<number, DespieceItem | null>;
}

const GRUPOS_TALLER = new Set(['medidas', 'vidrio']);

/** Mismo criterio que `NIVELES_APTOS_PARA_CORTE` (`motorDespiece.ts`): A y B
 * son aceptables, C y "sin nivel" no. Si cambia allá, cambiar aquí también. */
function esConfiable(despiece: DespieceItem | null | undefined): boolean {
    if (!despiece) return false;
    return (despiece.nivelCorte === 'A' || despiece.nivelCorte === 'B') && !despiece.hayErrores;
}

function esOpcionObjeto(o: string | number | OpcionCampo): o is OpcionCampo {
    return typeof o === 'object' && o !== null;
}

/** Traduce el valor crudo del `input` de un ítem a lo que debe leer un
 * operario: resuelve la `label` de un select, y "Sí/No" para booleanos. Un
 * valor ausente es "—", no "0" ni "false" — omitir un campo no es lo mismo que
 * haberlo puesto en su valor mínimo. */
function valorLegible(valor: unknown, opciones?: Array<string | number | OpcionCampo>): string {
    if (valor === undefined || valor === null || valor === '') return '—';
    if (opciones) {
        const encontrada = opciones.find((o) => (esOpcionObjeto(o) ? o.value : o) === valor);
        if (encontrada) return esOpcionObjeto(encontrada) ? encontrada.label : String(encontrada);
    }
    if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
    return String(valor);
}

const PrintableHojaTrabajo: React.FC<Props> = ({ cot, propuesta, modulos, planos, despieces }) => {
    const items: ItemCotizacion[] = cot.items ?? [];

    return (
        <div className="text-slate-900">
            <style>
                {`
                @media print {
                    @page { size: A4 portrait; margin: 14mm; }
                    .hoja-item { page-break-inside: avoid; }
                    .hoja-pagina-2 { page-break-before: always; }
                    .hoja-despiece-item { page-break-inside: avoid; }
                }
                `}
            </style>

            {/* ── Página 1: resumen + plano ──────────────────────────────── */}
            <div className="flex items-center justify-between border-b-2 border-slate-800 pb-3 mb-4">
                <TemplexLogo className="h-12 w-auto" />
                <div className="text-right">
                    <h1 className="text-xl font-black uppercase tracking-wide">Hoja de Trabajo</h1>
                    <p className="text-xs text-slate-500">
                        Cotización N.° {cot.numero}{propuesta ? ` · Propuesta ${propuesta.etiqueta}` : ''}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-5 text-sm">
                <div>
                    <div><span className="text-slate-400">Cliente:</span> <span className="font-semibold">{cot.cliente?.nombre || '—'}</span></div>
                    {cot.cliente?.obra && <div><span className="text-slate-400">Obra:</span> {cot.cliente.obra}</div>}
                    {cot.cliente?.direccion && <div><span className="text-slate-400">Dirección:</span> {cot.cliente.direccion}</div>}
                </div>
                <div className="text-right">
                    <div><span className="text-slate-400">Fecha:</span> {fmtFecha(cot.creadaEn)}</div>
                    {cot.asesor && <div><span className="text-slate-400">Asesor:</span> {cot.asesor}</div>}
                    {propuesta?.nombre && <div><span className="text-slate-400">Propuesta:</span> {propuesta.nombre}</div>}
                </div>
            </div>

            {items.length === 0 && (
                <p className="text-slate-400 italic">Esta propuesta no tiene ítems.</p>
            )}

            <div className="space-y-4">
                {items.map((it, i) => {
                    const modulo = modulos.find((m) => m.id === it.moduloId);
                    const campos = (modulo?.campos ?? []).filter((c) => GRUPOS_TALLER.has(c.grupo ?? ''));
                    const input = (it.input ?? {}) as Record<string, unknown>;
                    const plano = planos[it.id] ?? null;
                    return (
                        <div key={it.id} className="hoja-item border-2 border-slate-800 rounded-lg overflow-hidden">
                            <div className="bg-slate-800 text-white px-3 py-1.5 flex items-center justify-between text-sm font-bold">
                                <span>{i + 1}. {it.descripcionItem?.trim() || modulo?.nombre || it.moduloId}</span>
                                <span>{it.cantidadPiezas} pieza(s)</span>
                            </div>
                            <div className="px-3 py-2 text-xs text-slate-500">
                                Sistema: <span className="font-semibold text-slate-700">{it.sistema || '—'}</span>
                            </div>
                            {campos.length > 0 && (
                                <table className="w-full text-sm border-t border-slate-200">
                                    <tbody>
                                        {campos.map((c) => (
                                            <tr key={c.nombre} className="border-b border-slate-100 last:border-0">
                                                <td className="px-3 py-1.5 text-slate-500 w-1/2">{c.etiqueta}</td>
                                                <td className="px-3 py-1.5 font-semibold">
                                                    {valorLegible(input[c.nombre], c.opciones)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                            {it.disenoId && (
                                <div className="border-t border-slate-200 p-3">
                                    <DiagramaProducto plano={plano} cargando={!(it.id in planos)} />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* ── Página 2: especificaciones de corte por perfil y vidrio ──── */}
            {items.some((it) => it.disenoId) && (
                <div className="hoja-pagina-2">
                    <div className="flex items-center justify-between border-b-2 border-slate-800 pb-2 mb-4">
                        <h2 className="text-lg font-black uppercase tracking-wide">Especificaciones de corte</h2>
                        <p className="text-xs text-slate-500">
                            Cotización N.° {cot.numero}{propuesta ? ` · Propuesta ${propuesta.etiqueta}` : ''}
                        </p>
                    </div>

                    <div className="space-y-4">
                        {items.filter((it) => it.disenoId).map((it, i) => {
                            const despiece = despieces[it.id];
                            const confiable = esConfiable(despiece);
                            return (
                                <div key={it.id} className="hoja-despiece-item border-2 border-slate-800 rounded-lg overflow-hidden">
                                    <div className="bg-slate-800 text-white px-3 py-1.5 text-sm font-bold">
                                        {i + 1}. {it.descripcionItem?.trim() || it.moduloId}
                                    </div>

                                    {despiece === undefined && (
                                        <p className="px-3 py-3 text-sm text-slate-400 italic">Cargando despiece…</p>
                                    )}
                                    {despiece === null && (
                                        <p className="px-3 py-3 text-sm text-slate-400 italic">
                                            Este ítem no tiene despiece calculado por diseño.
                                        </p>
                                    )}

                                    {despiece && !confiable && (
                                        <p className="px-3 py-2 text-sm font-bold text-red-700 bg-red-50 border-b border-red-200">
                                            ⚠ Medidas no validadas (nivel {despiece.nivelCorte ?? 'desconocido'}
                                            {despiece.hayErrores ? ', con líneas en error' : ''}) — verificar con el
                                            maestro antes de cortar.
                                        </p>
                                    )}

                                    {despiece && despiece.perfiles.length > 0 && (
                                        <table className="w-full text-sm border-t border-slate-200">
                                            <thead className="bg-slate-100">
                                                <tr>
                                                    <th className="px-3 py-1.5 text-left font-bold">Perfil</th>
                                                    <th className="px-3 py-1.5 text-right font-bold">Medida (mm)</th>
                                                    <th className="px-3 py-1.5 text-right font-bold">Cant.</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {despiece.perfiles.map((p, idx) => (
                                                    <tr key={`${p.ref}-${idx}`} className="border-b border-slate-100 last:border-0">
                                                        <td className="px-3 py-1.5">{p.descripcion || p.ref}</td>
                                                        <td className="px-3 py-1.5 text-right font-semibold">{Math.round(p.medidaMm)}</td>
                                                        <td className="px-3 py-1.5 text-right">{p.cantidad}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}

                                    {despiece && despiece.vidrios.length > 0 && (
                                        <table className="w-full text-sm border-t border-slate-200">
                                            <thead className="bg-slate-100">
                                                <tr>
                                                    <th className="px-3 py-1.5 text-left font-bold">Vidrio</th>
                                                    <th className="px-3 py-1.5 text-right font-bold">Ancho×Alto (mm)</th>
                                                    <th className="px-3 py-1.5 text-right font-bold">Cant.</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {despiece.vidrios.map((v, idx) => (
                                                    <tr key={idx} className="border-b border-slate-100 last:border-0">
                                                        <td className="px-3 py-1.5">{v.descripcion || 'Vidrio'}</td>
                                                        <td className="px-3 py-1.5 text-right font-semibold">
                                                            {Math.round(v.anchoMm)}×{Math.round(v.altoMm)}
                                                        </td>
                                                        <td className="px-3 py-1.5 text-right">{v.cantidad}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <p className="mt-6 text-[11px] text-slate-400 italic border-t border-slate-200 pt-2">
                Documento informativo para el taller. La página 2 sale siempre, incluso sin validar
                para orden de corte — revisa el aviso de cada ítem antes de cortar material.
            </p>
        </div>
    );
};

export default PrintableHojaTrabajo;
