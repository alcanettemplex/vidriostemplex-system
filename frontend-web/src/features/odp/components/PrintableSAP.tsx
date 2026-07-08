import React from 'react';
import { format } from 'date-fns';
import { TemplexLogo } from '../../../components/ui/TemplexLogo';

interface PrintableSAPProps {
    odp: any;
    sap?: any;
}

/** Máximo de ítems visibles por hoja A4 */
const ITEMS_POR_PAGINA = 18;

/**
 * Convierte la clave `item` de la BD a la letra que se muestra en el imprimible.
 *
 * Reglas según DB real (ODP-23860):
 *   - "A"–"Z"  → se muestran tal cual (índices 0–25)
 *   - "27"–"N" → número guardado en DB = posición absoluta 1-based
 *                 posición 27 → índice 26 → "AA"
 *                 posición 28 → índice 27 → "AB"
 *                 …
 *                 posición 27 + k → "A" + letraDeK
 *
 * El imprimible usa siempre letras (nunca números).
 */
const normalizarItem = (item: string): { letraDisplay: string; indice: number } => {
    const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    // Caso A–Z (letra simple)
    if (/^[A-Z]$/.test(item)) {
        const indice = abc.indexOf(item);
        return { letraDisplay: item, indice };
    }

    // Caso numérico (27 en adelante): posición absoluta 1-based
    const pos = parseInt(item, 10);
    if (!isNaN(pos) && pos >= 27) {
        const indice = pos - 1; // 27 → índice 26
        // Construir letra doble: idx 26 → AA, 27 → AB …
        const primeraCiclo = Math.floor(indice / 26) - 1; // 0-based dentro del segundo ciclo
        const segundaCiclo = indice % 26;
        const letraDisplay = abc[primeraCiclo] + abc[segundaCiclo];
        return { letraDisplay, indice };
    }

    // Fallback: usar tal cual
    return { letraDisplay: item, indice: 9999 };
};

/** Formatea cantidad: sin decimales si es entero, con decimales si los tiene */
const fmtCant = (v: any): string => {
    if (v === null || v === undefined || v === '') return '';
    const n = Number(v);
    if (isNaN(n)) return String(v);
    return n % 1 === 0 ? String(Math.round(n)) : String(n);
};

const BadgeFalta = () => (
    <span
        className="text-white text-[8px] font-black bg-amber-500 rounded px-1 ml-1 align-middle"
        // Estilos inline: la ventana de impresión depende del CDN de Tailwind (carga async, 800ms);
        // si no llega a tiempo (red/proxy en algunas PCs) las clases no se aplican y el badge desaparece.
        style={{ backgroundColor: '#f59e0b', color: '#fff', borderRadius: '3px', padding: '0 4px', marginLeft: '4px', fontWeight: 900, fontSize: '8px', verticalAlign: 'middle', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
    >FALTA</span>
);

/** Genera la letra de display para un índice 0-based en la cuadrícula del imprimible */
const letraDeIndice = (idx: number): string => {
    const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (idx < 26) return abc[idx];
    // idx 26 → AA, 27 → AB …
    const primeraCiclo = Math.floor(idx / 26) - 1;
    const segundaCiclo = idx % 26;
    return abc[primeraCiclo] + abc[segundaCiclo];
};

const PrintableSAP: React.FC<PrintableSAPProps> = ({ odp, sap }) => {

    const sapData  = sap || odp.saps?.[0];
    const allItems: any[] = sapData?.items || [];
    const odcs:    any[] = sapData?.ordenes_compra || [];

    // IDs de SAPItems ya en cualquier ODC → badge C (pendiente) o E (Existencia, una vez recibida)
    const itemsEnODC = new Set(
        odcs.flatMap((odc: any) => (odc.items || []).map((it: any) => it.sap_item_id))
    );

    // IDs de SAPItems en ODC con estado RECIBIDO → franja azul
    const itemsEnODCRecibida = new Set(
        odcs
            .filter((odc: any) => odc.estado === 'recibido')
            .flatMap((odc: any) => (odc.items || []).map((it: any) => it.sap_item_id))
    );

    /**
     * Construir mapa índice 0-based → datos del item.
     * Se ordena explícitamente por índice (A→Z→AA→AO) antes de mapear,
     * garantizando que el imprimible muestre siempre A primero sin depender
     * del orden en que el backend entrega los items.
     */
    const itemsSorted = [...allItems].sort((a, b) => {
        const { indice: ia } = normalizarItem(a.item);
        const { indice: ib } = normalizarItem(b.item);
        return ia - ib;
    });

    // Mapa índice → item, unificando duplicados LEGÍTIMOS (cobertura parcial: original + faltante,
    // marcados con es_faltante por dividirPorExistencia). Si dos ítems distintos colisionan en la
    // misma letra por un dato corrupto (nunca deberían compartir letra sin ser par original/faltante),
    // no se fusionan silenciosamente perdiendo datos: el segundo se reubica en el próximo índice libre
    // para que ambos sigan siendo visibles en el imprimible.
    const indicesOriginales = new Set(itemsSorted.map(it => normalizarItem(it.item).indice));
    const itemPorIndice: Record<number, any> = {};
    let cursorLibre = 0;
    const siguienteIndiceLibre = (): number => {
        while (indicesOriginales.has(cursorLibre) || Object.prototype.hasOwnProperty.call(itemPorIndice, cursorLibre)) {
            cursorLibre++;
        }
        return cursorLibre;
    };
    for (const it of itemsSorted) {
        const { indice } = normalizarItem(it.item);
        const existente = itemPorIndice[indice];
        if (!existente) {
            itemPorIndice[indice] = { ...it };
        } else if (it.es_faltante || existente.es_faltante) {
            // Cobertura parcial legítima (original + faltante de dividirPorExistencia): unificar
            // en una sola fila donde el ORIGINAL manda en CANT/código/dimensión/exist_perf y cada
            // faltante aporta su cantidad/dimensión al badge FALTA de la columna EXIS. PERF.
            const original = it.es_faltante ? existente : it;
            const faltante = it.es_faltante ? it : existente;
            const merged: any = { ...original };
            merged.es_faltante = true;
            merged.exist_perf = [original.exist_perf, faltante.exist_perf].filter(Boolean).join(' / ') || null;
            merged.faltantes = [
                ...(original.faltantes || []),
                ...(faltante.faltantes || []),
                { cantidad: faltante.cantidad, dimension: faltante.dimension },
            ];
            // id de la fila = faltante aún activo (pendiente/en_odc): es el registro que se
            // asigna a las ODC, y los badges C/E se detectan por id contra odc.items.
            merged.idFaltanteActivo = faltante.idFaltanteActivo
                ?? original.idFaltanteActivo
                ?? (faltante.es_faltante && faltante.estado_compra !== 'en_existencia' ? faltante.id : undefined);
            if (merged.idFaltanteActivo) merged.id = merged.idFaltanteActivo;
            itemPorIndice[indice] = merged;
        } else {
            // Colisión de letra entre ítems distintos (dato corrupto): no ocultar
            itemPorIndice[siguienteIndiceLibre()] = { ...it };
        }
    }


    // Cuántas páginas necesitamos
    const cantidadReal = Object.keys(itemPorIndice).length;
    const paginas = Math.ceil(Math.max(cantidadReal, ITEMS_POR_PAGINA) / ITEMS_POR_PAGINA);

    // Bloques de índices (0-base) por página
    const indicesPorPagina: number[][] = Array.from({ length: paginas }, (_, p) =>
        Array.from({ length: ITEMS_POR_PAGINA }, (_, i) => p * ITEMS_POR_PAGINA + i)
    );

    // Filas de ODCs (siempre 5, igual en todas las hojas)
    const odcRows = [0, 1, 2, 3, 4].map(i => odcs[i] || null);

    /* ─── Sub-componentes ─────────────────────────────────────────────────── */

    const Cabecera = ({ esContinuacion }: { esContinuacion: boolean }) => (
        <>
            <div className="flex justify-between items-end mb-1">
                <div className="w-1/3">
                    <TemplexLogo className="h-10 w-40 justify-start" />
                </div>
                <div className="w-1/3 text-center font-bold text-[13px] uppercase tracking-[0.15em] leading-tight">
                    SOLICITUD DE ACCESORIOS<br />Y PERFILERÍA (SAP)
                    {esContinuacion && (
                        <div className="text-[10px] text-slate-500 font-normal normal-case tracking-normal mt-0.5">
                            (Continuación)
                        </div>
                    )}
                </div>
                <div className="w-1/3 flex flex-col items-end gap-1">
                    <div className="border-[2px] border-black text-xl font-bold w-32 h-10 flex items-center justify-center">
                        {(sapData?.numero_sap || '').split('-').pop()}
                    </div>
                    <div className="text-[11px] font-bold">
                        ODP: <span className="font-normal">{odp.numero_odp?.split('-').pop() || odp.numero_odp}</span>
                    </div>
                </div>
            </div>

            <table className="sap-table thick-b mb-1">
                <tbody>
                    <tr>
                        <td colSpan={3} className="font-bold">
                            NOMBRE CLIENTE / RAZÓN SOCIAL:
                            <span className="font-normal uppercase ml-2">{odp.cliente?.nombre_razon_social}</span>
                        </td>
                        <td className="font-bold w-[25%]">
                            ASESOR: <span className="font-normal uppercase ml-1">
                                {odp.asesor?.nombre_completo || `${odp.asesor?.first_name || ''} ${odp.asesor?.last_name || ''}`}
                            </span>
                        </td>
                    </tr>
                    <tr>
                        <td className="font-bold w-[30%]">
                            NIT / CC: <span className="font-normal uppercase ml-1">
                                {odp.cliente?.numero_documento || odp.cliente?.ruc_rut}
                            </span>
                        </td>
                        <td className="font-bold w-[30%]">
                            TELÉFONO FIJO: <span className="font-normal uppercase ml-1">{odp.cliente?.telefono}</span>
                        </td>
                        <td className="font-bold w-[20%]">
                            CELULAR: <span className="font-normal uppercase ml-1">{odp.cliente?.celular}</span>
                        </td>
                        <td className="font-bold">
                            FECHA LISTO:{' '}
                            {odp.fecha_entrega ? (
                                <span className="font-bold text-red-600 ml-1">
                                    {format(new Date(odp.fecha_entrega), 'dd/MM/yyyy')}
                                </span>
                            ) : (
                                <span className="font-normal ml-1 text-slate-400">—</span>
                            )}
                        </td>
                    </tr>
                </tbody>
            </table>
        </>
    );

    /** Sección Detalle Técnico / ODCs — se repite en TODAS las hojas */
    const DetalleTecnico = () => (
        <table className="sap-table mb-1">
            <thead>
                <tr className="font-bold text-[11px]">
                    <th className="w-[50%] text-left px-1">DETALLE TÉCNICO / OBSERVACIÓN</th>
                    <th className="w-[16%]">ODC Nº</th>
                    <th className="w-[16%]">ITEMS</th>
                    <th className="w-[18%]">PROV / FECHA</th>
                </tr>
            </thead>
            <tbody>
                {odcRows.map((odc, i) => (
                    <tr key={i}>
                        {i === 0 && (
                            <td className="align-top p-1 h-[70px]" rowSpan={5}>
                                <p className="text-[11px] whitespace-pre-line uppercase font-semibold">
                                    {sapData?.notas || ''}
                                </p>
                                {odp?.fecha_chk_accesorios && (
                                    <p className="text-[11px] uppercase font-bold text-red-600 mt-1">
                                        Accesorios separados —{' '}
                                        {new Date(odp.fecha_chk_accesorios + 'T12:00:00').toLocaleDateString('es-CO')}
                                    </p>
                                )}
                            </td>
                        )}
                        <td className="text-center text-[11px] h-[18px] font-bold">
                            {odc?.numero_odc || ''}
                        </td>
                        <td className="text-center text-[11px]">
                            {odc?.items?.length
                                ? (() => {
                                    const mapa = new Map<number, string>();
                                    odc.items.forEach((it: any) => {
                                        const { letraDisplay, indice } = normalizarItem(String(it.item));
                                        if (!mapa.has(indice)) mapa.set(indice, letraDisplay);
                                    });
                                    return Array.from(mapa.entries())
                                        .sort((a, b) => a[0] - b[0])
                                        .map(e => e[1])
                                        .join(', ');
                                })()
                                : ''}
                        </td>
                        <td className="text-center text-[11px]">
                            {odc
                                ? `${odc.proveedor || ''} ${odc.fecha_creacion ? new Date(odc.fecha_creacion).toLocaleDateString('es-CO') : ''}`.trim()
                                : ''}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    const Firmas = () => (
        <div className="flex justify-between items-end mt-2 px-2">
            {['SOLICITADO POR', 'AUTORIZADO POR', 'RECIBIDO POR'].map(label => (
                <div key={label} className="text-center">
                    <div className="w-48 border-b border-black mb-0.5" />
                    <p className="font-bold uppercase text-[11px] tracking-widest">{label}</p>
                </div>
            ))}
        </div>
    );

    /* ─── Render ─────────────────────────────────────────────────────────── */

    return (
        <>
            <style>{`
                .sap-table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
                .sap-table th, .sap-table td { border: 1px solid #000; padding: 2px 4px; }
                .sap-table th { font-weight: bold; text-align: center; background-color: #f0f0f0; }
                .thick-b { border-bottom: 2px solid #000 !important; }
                @media print {
                    .sap-page { page-break-after: always; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .sap-page:last-child { page-break-after: avoid; }
                }
            `}</style>

            {indicesPorPagina.map((indices, paginaIdx) => (
                <div
                    key={paginaIdx}
                    className="sap-page block w-[21.5cm] min-h-[29cm] bg-white shadow-xl print:shadow-none text-black font-sans text-[14px] mx-auto overflow-hidden mb-6 print:mb-0"
                >
                    <div className="print-container p-2">

                        {/* Cabecera idéntica en todas las hojas */}
                        <Cabecera esContinuacion={paginaIdx > 0} />

                        {/* Tabla de 18 ítems de esta página */}
                        <table className="sap-table mb-1 text-center uppercase">
                            <thead>
                                <tr className="font-bold text-[11px]">
                                    <th className="w-8">ITEM</th>
                                    <th className="w-8">CANT</th>
                                    <th className="w-[14%]">COD</th>
                                    <th className="w-[24%]">DESCRIPCIÓN</th>
                                    <th className="w-[12%]">DIMENSIÓN</th>
                                    <th className="w-[10%]">EXIST. PERF.</th>
                                    <th className="w-[10%]">GASTO PERF.</th>
                                    <th className="w-[18%]">OBSERVACIÓN</th>
                                </tr>
                            </thead>
                            <tbody>
                                {indices.map(idx => {
                                    const letra  = letraDeIndice(idx);
                                    const item   = itemPorIndice[idx];
                                    const enODC         = item && itemsEnODC.has(item.id);
                                    const enODCRecibida = item && itemsEnODCRecibida.has(item.id);
                                    const esFaltante    = item?.es_faltante === true;
                                    return (
                                        <tr
                                            key={idx}
                                            className={`h-[24px] ${enODCRecibida ? 'bg-blue-100' : esFaltante ? 'bg-amber-50' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}
                                        >
                                            <td className="font-bold text-center">{letra}</td>
                                            <td className="text-[11px] text-center">{item ? fmtCant(item.cantidad) : ''}</td>
                                            <td className="text-[11px]">{item?.codigo || ''}</td>
                                            <td className="text-left text-[11px] px-1">
                                                <span>{item?.descripcion || ''}</span>
                                                {enODC ? (
                                                    <span className="font-black text-red-600 text-[12px] ml-1 align-middle" style={{ color: '#dc2626', fontWeight: 900, fontSize: '12px', marginLeft: '4px', verticalAlign: 'middle' }}>{enODCRecibida ? 'E' : 'C'}</span>
                                                ) : (item?.exist_perf || item?.estado_compra === 'en_existencia') ? (
                                                    <span className="font-black text-red-600 text-[12px] ml-1 align-middle" style={{ color: '#dc2626', fontWeight: 900, fontSize: '12px', marginLeft: '4px', verticalAlign: 'middle' }}>S</span>
                                                ) : null}
                                            </td>
                                            <td className="text-[11px]">{item?.dimension || ''}</td>
                                            <td className="text-[11px]">
                                                {item?.exist_perf || ''}
                                                {/* Faltante sin par (original eliminado): badge solo, sus datos ya están en las columnas */}
                                                {esFaltante && !item?.faltantes?.length && <BadgeFalta />}
                                                {(item?.faltantes || []).map((f: any, i: number) => (
                                                    <span key={i} style={{ whiteSpace: 'nowrap' }}>
                                                        <BadgeFalta />
                                                        <span style={{ marginLeft: '2px' }}>{[fmtCant(f.cantidad), f.dimension].filter(Boolean).join(' - ')}</span>
                                                    </span>
                                                ))}
                                            </td>
                                            <td className="text-[11px]">{item?.gasto_perf || ''}</td>
                                            <td className="text-left text-[11px] px-1">{item?.observacion || ''}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        {/* Detalle Técnico / ODCs — en TODAS las hojas */}
                        <DetalleTecnico />

                        {/* Firmas — en todas las hojas */}
                        <Firmas />

                        {/* Pie: número de hoja + versión */}
                        <div className="flex justify-between mt-1">
                            <span className="text-[9px] text-slate-500">
                                {paginas > 1 ? `Hoja ${paginaIdx + 1} de ${paginas}` : ''}
                            </span>
                            <span className="text-[9px] text-slate-500">VTS-2026-003</span>
                        </div>

                    </div>
                </div>
            ))}
        </>
    );
};

export default PrintableSAP;
