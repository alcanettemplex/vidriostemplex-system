import React from 'react';

import { TemplexLogo } from '../../../components/ui/TemplexLogo';
import { Cotizacion, DespieceItem, ItemCotizacion, ModuloMeta, Plano, Propuesta } from '../types';
import { fmtFecha } from '../format';
import { especificaciones, leerFicha } from '../fichaProducto';
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
// rechaza `/despiece` sin `disenoId` con 400). Hasta el 2026-09-26 su página
// salía con dos cajas vacías ("Sin plano") y "Sistema: —" aunque el asesor sí
// había elegido sistema: el taller no sabía ni qué se vendió. Ahora la caja de
// arriba lleva la FICHA DE FABRICACIÓN (cada campo del formulario, en texto) y
// la de abajo los MATERIALES de la cotización (el BOM, sin precios), rotulados
// para que nadie los confunda con medidas de corte.
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

/**
 * Tamaño de la letra de los cortes según cuántos renglones hay que meter en la
 * caja (2026-09-26, pedido del usuario: "más grande, más llamativo y que
 * aproveche la hoja"). La medida en mm es lo que busca el cortador, así que va
 * más grande y en negrilla. Con muchos perfiles se baja por escalones en vez de
 * cortar filas: la caja no oculta lo que se sale (ver cabecera).
 */
function escalaCortes(renglones: number): React.CSSProperties {
    // Umbrales para la caja de 430 px (desde que el plano creció, 2026-09-26).
    const [texto, medida, encabezado, relleno] =
        renglones <= 10 ? [17, 22, 15, '4px 8px']
            : renglones <= 12 ? [15, 19, 13, '3px 6px']
                : [13, 16, 12, '2px 5px'];
    return {
        fontSize: `${texto}px`,
        ['--hoja-medida' as string]: `${medida}px`,
        ['--hoja-encabezado' as string]: `${encabezado}px`,
        ['--hoja-relleno' as string]: relleno,
    } as React.CSSProperties;
}

/** La ficha de fabricación va en la caja del plano (más baja): un escalón menos. */
const ESCALA_FICHA = escalaCortes(12);

const PrintableHojaTrabajo: React.FC<Props> = ({ cot, propuesta, modulos, planos, despieces }) => {
    const items: ItemCotizacion[] = cot.items ?? [];

    return (
        <div className="text-black font-sans text-[10px]">
            <style>
                {`
                .excel-table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
                .excel-table th, .excel-table td { border: 1px solid #000; padding: 2px 4px; border-color: #000; }
                .excel-table th { font-weight: bold; text-align: center; }
                .tabla-cortes th, .tabla-cortes td { padding: var(--hoja-relleno, 2px 4px); line-height: 1.15; }
                .tabla-cortes th { font-size: var(--hoja-encabezado, 10px); }
                .tabla-cortes .medida { font-size: var(--hoja-medida, 10px); font-weight: 700; }

                @media print {
                    /* 5 mm como las hojas de la ODP. La fecha y el "about:blank" que
                       a veces salen arriba y abajo los pone el diálogo del navegador
                       ("Encabezados y pies de página"); con margen 0 igual salían
                       (probado 2026-09-26), así que no se fuerza. */
                    @page { size: letter portrait; margin: 5mm; }
                    body, html { margin: 0 !important; padding: 0 !important; background: #fff !important; }
                    .hoja-print-container { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 1mm 2mm !important; }
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
                const ficha = leerFicha(it.input, it.resultado, modulo);
                const specs = tieneDiseno ? [] : especificaciones(it.input, modulo);
                const materiales = tieneDiseno ? [] : (it.resultado?.items ?? []);

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
                                        <td className="w-[30%] font-bold">SISTEMA: <span className="font-normal uppercase ml-1">{it.sistema || ficha.sistema || modulo?.nombre || '—'}</span></td>
                                        <td className="w-[40%] font-bold">OBRA: <span className="font-normal uppercase ml-1">{cot.cliente?.obra || '—'}</span></td>
                                        <td className="w-[30%] font-bold">
                                            ÍTEM: <span className="font-normal uppercase ml-1">{it.descripcionItem?.trim() || modulo?.nombre || it.moduloId} · {it.cantidadPiezas} pza</span>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="w-[30%] font-bold">MEDIDA: <span className="font-normal uppercase ml-1">{ficha.medidas || '—'}</span></td>
                                        <td className="w-[40%] font-bold">COLOR / ACABADO: <span className="font-normal uppercase ml-1">{[ficha.color, ficha.acabados].filter(Boolean).join(' · ') || '—'}</span></td>
                                        <td className="w-[30%] font-bold">VIDRIO: <span className="font-normal uppercase ml-1">{[ficha.vidrio, ficha.pelicula ? 'con película' : null].filter(Boolean).join(' · ') || '—'}</span></td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* ---------- EL DISEÑO ---------- */}
                            <div className="border-2 border-black mt-2 w-full overflow-hidden p-2 flex items-center justify-center" style={{ height: '400px' }}>
                                {tieneDiseno ? (
                                    // Plano un 50 % más grande que en pantalla (pedido del
                                    // usuario, 2026-09-26): hasta 345 px de alto y 630 de ancho.
                                    <DiagramaProducto plano={plano} cargando={!(it.id in planos)} altoMaximoPx={345} anchoMaximoPx={630} impresion />
                                ) : (
                                    <div className="w-full h-full flex flex-col">
                                        <span className="block text-center font-bold text-[16px] uppercase tracking-wide">Ficha de fabricación</span>
                                        <p className="text-center text-[10px] italic mb-2">
                                            Cotizado por medidas libres, sin diseño del catálogo: no hay plano ni cortes calculados.
                                            Las medidas de corte las define el taller.
                                        </p>
                                        {specs.length > 0 ? (
                                            <table className="excel-table tabla-cortes" style={ESCALA_FICHA}>
                                                <tbody>
                                                    {specs.map(e => (
                                                        <tr key={e.etiqueta}>
                                                            <td className="w-[45%] font-bold">{e.etiqueta}</td>
                                                            <td className="uppercase">{e.valor}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : (
                                            <p className="text-center text-[11px] italic">Este ítem no tiene datos de producto: ver los materiales abajo.</p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* ---------- CORTES DEL TALLER ---------- */}
                            <div className="border-2 border-black mt-2 w-full p-2 flex flex-col" style={{ height: '430px' }}>
                                <span className="block text-center font-bold text-[16px] uppercase tracking-wide mb-1">Cortes del taller</span>

                                {!tieneDiseno && materiales.length === 0 && (
                                    <div className="flex-1 flex items-center justify-center text-sm italic">
                                        Sin despiece calculado — este ítem no tiene diseño asociado.
                                    </div>
                                )}
                                {!tieneDiseno && materiales.length > 0 && (
                                    <>
                                        <p className="mt-1 mb-2 px-2 py-1 text-[12px] font-bold text-amber-800 bg-amber-50 border border-amber-300">
                                            ⚠ Materiales según la cotización (cantidades para UNA pieza, en metros, m² o unidades). No son medidas de corte.
                                        </p>
                                        {/* +3: el encabezado y el aviso ámbar, que ocupan lo de dos renglones. */}
                                        <table className="excel-table tabla-cortes" style={escalaCortes(materiales.length + 3)}>
                                            <thead>
                                                <tr>
                                                    <th>Código</th>
                                                    <th>Descripción</th>
                                                    <th>Cant.</th>
                                                    <th>Unidad</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {materiales.map((m, idx) => (
                                                    <tr key={`${m.codigo}-${idx}`}>
                                                        <td>{m.codigo}</td>
                                                        <td>{m.descripcion}</td>
                                                        <td className="text-right medida">{Number(m.cantidad).toLocaleString('es-CO', { maximumFractionDigits: 2 })}</td>
                                                        <td>{m.unidad}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </>
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
                                    <div className="mt-1 grid grid-cols-[1.25fr_1fr] gap-3 items-start">
                                        {despiece.perfiles.length > 0 && (
                                            <table className="excel-table tabla-cortes" style={escalaCortes(Math.max(despiece.perfiles.length, despiece.vidrios.length))}>
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
                                                            <td className="text-right medida">{Math.round(p.medidaMm)}</td>
                                                            <td className="text-right medida">{p.cantidad}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                        {despiece.vidrios.length > 0 && (
                                            <table className="excel-table tabla-cortes" style={escalaCortes(Math.max(despiece.perfiles.length, despiece.vidrios.length))}>
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
                                                            <td className="text-right medida whitespace-nowrap">{Math.round(v.anchoMm)}×{Math.round(v.altoMm)}</td>
                                                            <td className="text-right medida">{v.cantidad}</td>
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
