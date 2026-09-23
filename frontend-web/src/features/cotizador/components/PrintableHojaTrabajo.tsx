import React from 'react';

import { TemplexLogo } from '../../../components/ui/TemplexLogo';
import { Cotizacion, DespieceItem, ItemCotizacion, ModuloMeta, Plano, Propuesta } from '../types';
import { fmtFecha } from '../format';
import DiagramaProducto from './DiagramaProducto';

// ─────────────────────────────────────────────────────────────────────────────
// Hoja de Trabajo — documento INTERNO para el taller, sin plata.
//
// RÉPLICA DEL FORMATO de `PrintableDetalleTecnico.tsx` (ODP), a pedido del
// usuario (2026-09-22): misma cabecera (logo + título centrado + caja con
// número), misma tabla de datos con bordes gruesos (`excel-table`), mismas DOS
// cajas apiladas con borde — arriba el diseño (donde el ODP pone el croquis),
// abajo los cortes del taller (donde el ODP pone la observación de
// instalación). Página tamaño Carta, no A4.
//
// UNA PÁGINA POR ÍTEM (reemplaza el esquema anterior: "página 1 con resumen de
// TODOS los ítems" + "página 2 con specs de TODOS los ítems"). El número
// grande de la caja de cabecera es el número de ítem (1, 2, 3…), no el de la
// cotización — cada página identifica a un ítem.
//
// La caja de cortes tiene ALTURA FIJA como la del ODP (decisión explícita del
// usuario, 2026-09-22) — pero SIN `overflow: hidden`: si un ítem trae más
// perfiles de los que caben en el alto fijado, la tabla se sale del borde en
// vez de truncar filas. El ODP puede fijar la altura a ciegas porque su caja
// es texto libre corto; aquí es una tabla de datos de largo variable y perder
// una medida de corte es peor que un borde imperfecto.
//
// Un ítem sin diseño no tiene ni plano ni despiece calculable (el backend
// rechaza `/despiece` sin `disenoId` con 400): igual lleva su página, con
// aviso en cada caja en vez de desaparecer del documento.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    cot: Cotizacion;
    propuesta: Propuesta | null;
    modulos: ModuloMeta[];
    planos: Record<number, Plano | null>;
    despieces: Record<number, DespieceItem | null>;
}

/** Mismo criterio que `NIVELES_APTOS_PARA_CORTE` (`motorDespiece.ts`): A y B
 * son aceptables, C y "sin nivel" no. Si cambia allá, cambiar aquí también. */
function esConfiable(despiece: DespieceItem | null | undefined): boolean {
    if (!despiece) return false;
    return (despiece.nivelCorte === 'A' || despiece.nivelCorte === 'B') && !despiece.hayErrores;
}

const PrintableHojaTrabajo: React.FC<Props> = ({ cot, propuesta, modulos, planos, despieces }) => {
    const items: ItemCotizacion[] = cot.items ?? [];

    return (
        <div className="text-black font-sans text-[10px]">
            <style>
                {`
                .excel-table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
                .excel-table th, .excel-table td { border: 1px solid #000; padding: 2px 4px; border-color: #000; }
                .excel-table th { font-weight: bold; text-align: center; }

                @media print {
                    @page { size: letter portrait; margin: 5mm; }
                    body, html { margin: 0 !important; padding: 0 !important; }
                    .hoja-print-container { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 0 !important; }
                    .hoja-print-root { width: 100% !important; min-height: unset !important; box-shadow: none !important; margin: 0 !important; overflow: visible !important; }
                    .hoja-pagina-item { page-break-after: always; }
                    .hoja-pagina-item:last-child { page-break-after: auto; }
                }
                `}
            </style>

            {items.length === 0 && (
                <p className="p-6 text-slate-400 italic">Esta propuesta no tiene ítems.</p>
            )}

            {items.map((it, i) => {
                const modulo = modulos.find((m) => m.id === it.moduloId);
                const plano = planos[it.id] ?? null;
                const despiece = despieces[it.id];
                const confiable = esConfiable(despiece);
                const tieneDiseno = Boolean(it.disenoId);

                return (
                    <div
                        key={it.id}
                        className="hoja-pagina-item hoja-print-root block w-[21.5cm] min-h-[29cm] print:min-h-0 bg-white shadow-xl print:shadow-none text-black font-sans text-[10px] mx-auto overflow-hidden print:overflow-visible"
                    >
                        <div className="hoja-print-container p-6">
                            {/* ---------- CABECERA ---------- */}
                            <div className="flex justify-between items-end mb-1">
                                <div className="flex items-center w-1/3">
                                    <TemplexLogo className="h-10 w-40 justify-start" />
                                </div>

                                <div className="w-1/3 text-center font-bold text-[13px] mb-2 uppercase tracking-[0.2em]">
                                    Hoja de Trabajo
                                </div>

                                <div className="w-1/3 flex justify-end mb-1">
                                    <div className="border-[2px] border-black text-xl font-bold w-32 h-10 flex items-center justify-center">
                                        {i + 1}
                                    </div>
                                </div>
                            </div>

                            {/* ---------- DATOS ---------- */}
                            <table className="excel-table mb-1 border-t-2 border-l-2 border-r-2 border-black">
                                <tbody>
                                    <tr>
                                        <td className="w-[30%] font-bold">FECHA: <span className="font-normal uppercase ml-1">{fmtFecha(cot.creadaEn)}</span></td>
                                        <td className="w-[40%] font-bold">CLIENTE: <span className="font-normal uppercase ml-1">{cot.cliente?.nombre || '—'}</span></td>
                                        <td className="w-[30%] font-bold">
                                            COTIZACIÓN: <span className="font-normal uppercase ml-1">N.° {cot.numero}{propuesta ? ` · Prop. ${propuesta.etiqueta}` : ''}</span>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="w-[30%] font-bold">SISTEMA: <span className="font-normal uppercase ml-1">{it.sistema || '—'}</span></td>
                                        <td className="w-[40%] font-bold">OBRA: <span className="font-normal uppercase ml-1">{cot.cliente?.obra || '—'}</span></td>
                                        <td className="w-[30%] font-bold">
                                            ÍTEM: <span className="font-normal uppercase ml-1">{it.descripcionItem?.trim() || modulo?.nombre || it.moduloId} · {it.cantidadPiezas} pza</span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* ---------- EL DISEÑO ---------- */}
                            <div className="border-2 border-black mt-2 w-full overflow-hidden p-2 flex items-center justify-center" style={{ height: '430px' }}>
                                {tieneDiseno ? (
                                    <DiagramaProducto plano={plano} cargando={!(it.id in planos)} />
                                ) : (
                                    <p className="text-sm text-slate-400 italic">Sin plano — cotizado por medidas libres.</p>
                                )}
                            </div>

                            {/* ---------- CORTES DEL TALLER ---------- */}
                            <div className="border-2 border-black mt-2 w-full p-2 flex flex-col" style={{ height: '400px' }}>
                                <span className="block text-center font-bold text-[12px] uppercase">Cortes del taller</span>

                                {!tieneDiseno && (
                                    <div className="flex-1 flex items-center justify-center text-sm text-slate-400 italic">
                                        Sin despiece calculado — este ítem no tiene diseño asociado.
                                    </div>
                                )}

                                {tieneDiseno && despiece === undefined && (
                                    <p className="mt-2 text-sm text-slate-400 italic">Cargando despiece…</p>
                                )}
                                {tieneDiseno && despiece === null && (
                                    <p className="mt-2 text-sm text-slate-400 italic">
                                        Este ítem no tiene despiece calculado por diseño.
                                    </p>
                                )}

                                {tieneDiseno && despiece && !confiable && (
                                    <p className="mt-1 mb-1 px-2 py-1 text-[11px] font-bold text-red-700 bg-red-50 border border-red-300">
                                        ⚠ Medidas no validadas (nivel {despiece.nivelCorte ?? 'desconocido'}
                                        {despiece.hayErrores ? ', con líneas en error' : ''}) — verificar con el
                                        maestro antes de cortar.
                                    </p>
                                )}

                                {tieneDiseno && despiece?.perfileriaPersonalizada && (
                                    <p className="mt-1 mb-1 px-2 py-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-300">
                                        ⚠ Perfilería personalizada por el asesor (perfil cambiado, quitado o agregado):
                                        los cortes de este ítem se definen a mano. Las piezas "AGREGADO" son las que
                                        añadió el asesor.
                                    </p>
                                )}

                                {tieneDiseno && despiece && (despiece.perfiles.length > 0 || despiece.vidrios.length > 0) && (
                                    <div className="mt-1 grid grid-cols-2 gap-2">
                                        {despiece.perfiles.length > 0 && (
                                            <table className="excel-table text-[10px]">
                                                <thead>
                                                    <tr>
                                                        <th>Perfil</th>
                                                        <th>Medida (mm)</th>
                                                        <th>Cant.</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {despiece.perfiles.map((p, idx) => (
                                                        <tr key={`${p.ref}-${idx}`}>
                                                            <td>{p.descripcion || p.ref}</td>
                                                            <td className="text-right">{Math.round(p.medidaMm)}</td>
                                                            <td className="text-right">{p.cantidad}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                        {despiece.vidrios.length > 0 && (
                                            <table className="excel-table text-[10px]">
                                                <thead>
                                                    <tr>
                                                        <th>Vidrio</th>
                                                        <th>Ancho×Alto (mm)</th>
                                                        <th>Cant.</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {despiece.vidrios.map((v, idx) => (
                                                        <tr key={idx}>
                                                            <td>{v.descripcion || 'Vidrio'}</td>
                                                            <td className="text-right">{Math.round(v.anchoMm)}×{Math.round(v.altoMm)}</td>
                                                            <td className="text-right">{v.cantidad}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="text-right mt-1 font-bold text-[8px]">
                                Pag {i + 1} de {items.length}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default PrintableHojaTrabajo;
