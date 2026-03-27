import React from 'react';
import { format } from 'date-fns';
import { TemplexLogo } from '../../../components/ui/TemplexLogo';

interface PrintableTalonarioProps {
    odp: any;
}

const PrintableTalonario: React.FC<PrintableTalonarioProps> = ({ odp }) => {

    return (
        <div className="block print:block w-[21.5cm] min-h-[29cm] bg-white shadow-xl print:shadow-none text-black font-sans text-[10px] mx-auto overflow-hidden">
            <style>
                {`
                .excel-table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
                .excel-table th, .excel-table td { border: 1px solid #000; padding: 2px 4px; border-color: #000; }
                .excel-table th { font-weight: bold; text-align: center; }
                .thick-b { border-bottom: 2px solid #000 !important; }
                .fs-8 { font-size: 8px; }
                .fs-7 { font-size: 7px; }

                @media print {
                    .print-container { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
                `}
            </style>

            <div className="print-container p-2">
                {/* ---------- CABECERA ---------- */}
                <div className="flex justify-between items-end mb-1">
                    <div className="flex items-center w-1/3">
                        <div className="flex flex-col">
                            <TemplexLogo className="h-10 w-40 justify-start" />
                        </div>
                    </div>

                    <div className="w-1/3 text-center font-bold text-[11px] mb-2 uppercase tracking-[0.2em]">
                        ORDEN DE COMPRA CLIENTE
                    </div>

                    <div className="w-1/3 flex justify-end mb-1">
                        <div className="border-[2px] border-black text-xl font-bold w-32 h-10 flex items-center justify-center">
                            {odp.numero_odp?.split('-').pop() || odp.numero_odp}
                        </div>
                    </div>
                </div>

                {/* ---------- DATOS CLIENTE ---------- */}
                <table className="excel-table thick-b mb-1">
                    <tbody>
                        <tr>
                            <td className="w-[30%] font-bold">FECHA: <span className="font-normal uppercase ml-1">{odp.fecha_creacion ? format(new Date(odp.fecha_creacion), 'dd/MM/yyyy') : ''}</span></td>
                            <td className="w-[45%] font-bold">CLIENTE: <span className="font-normal uppercase ml-1">{odp.cliente?.nombre_razon_social}</span></td>
                            <td className="w-[25%] font-bold">TEL: <span className="font-normal uppercase ml-1">{odp.cliente?.telefono}</span></td>
                        </tr>
                        <tr>
                            <td colSpan={2} className="font-bold border-r-0">
                                <div className="flex items-center justify-between">
                                    <span>DIRECCION: <span className="font-normal uppercase ml-1">{odp.cliente?.direccion}</span></span>
                                    <span className="border-l border-black pl-2 ml-2">NIT O C.C: <span className="font-normal uppercase ml-1">{odp.cliente?.numero_documento || odp.cliente?.ruc_rut}</span></span>
                                </div>
                            </td>
                            <td className="font-bold">CEL: <span className="font-normal uppercase ml-1">{odp.cliente?.celular || odp.cliente?.telefono}</span></td>
                        </tr>
                        <tr>
                            <td colSpan={2} className="font-bold border-r-0">
                                <div className="flex items-center justify-between">
                                    <span>FECHA ODP LISTO MATERIAL: <span className="font-normal uppercase ml-1">{odp.fecha_entrega ? format(new Date(odp.fecha_entrega), 'dd/MM/yyyy') : ''}</span></span>
                                    <span className="border-l border-black pl-2 ml-2">CORREO FACTURA ELECTRONICA: <span className="font-normal lowercase ml-1">{odp.cliente?.email}</span></span>
                                </div>
                            </td>
                            <td className="font-bold">SEGM: <span className="font-normal uppercase ml-1">{odp.cliente?.segmento}</span></td>
                        </tr>
                    </tbody>
                </table>

                {/* ---------- DESCRIPCION ---------- */}
                <table className="excel-table mb-1">
                    <tbody>
                        <tr>
                            <td className="font-bold w-12 text-center border-b-black uppercase">CANT</td>
                            <td className="font-bold text-center border-b-black uppercase tracking-widest">PRODUCTO O SERVICIO</td>
                        </tr>
                        {odp.servicios_detalle && odp.servicios_detalle.length > 0 ? (
                            odp.servicios_detalle.map((svc: any, idx: number) => (
                                <tr key={idx}>
                                    <td className="h-10 font-bold text-center text-lg align-middle">{svc.cantidad}</td>
                                    <td className="h-10 align-top p-1">
                                        <div className="font-bold border-b border-black mb-1 pb-0.5 uppercase">{svc.tipo_servicio}</div>
                                        <span className="whitespace-pre-line uppercase font-semibold text-[10px] leading-tight">{svc.descripcion}</span>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td className="h-14 font-bold text-center text-lg align-middle">{odp.cantidad_total || ''}</td>
                                <td className="h-14 align-top p-1">
                                    <div className="font-bold border-b border-black mb-1 pb-1 uppercase">{odp.tipo_servicio}</div>
                                    <span className="whitespace-pre-line uppercase font-semibold text-xs leading-tight">{odp.descripcion_pedido}</span>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>

                {/* ---------- TABLA PRINCIPAL ---------- */}
                <table className="excel-table text-center uppercase">
                    <thead>
                        <tr className="font-bold">
                            <th rowSpan={3} className="w-8">ITEM</th>
                            <th rowSpan={3} className="w-6">CL</th>
                            <th rowSpan={3} className="w-8">ESP<br />mm</th>
                            <th rowSpan={3} className="w-8">CANT</th>
                            <th colSpan={2} className="w-[18%]">MEDIDA EXACTA</th>
                            <th colSpan={6}>ACABADOS</th>
                            <th rowSpan={3} className="w-10">MTS<br />PT</th>
                            <th rowSpan={3} className="w-[15%]">VALOR</th>
                            <th rowSpan={3} className="w-10">PROD</th>
                        </tr>
                        <tr className="font-bold fs-[8px]">
                            <th rowSpan={2}>Ancho (A)</th>
                            <th rowSpan={2}>Alto (H)</th>
                            <th colSpan={2}>PUL *</th>
                            <th rowSpan={2} className="w-7">Perf</th>
                            <th rowSpan={2} className="w-7">Boq.</th>
                            <th rowSpan={2} className="w-7">Des</th>
                            <th rowSpan={2} className="w-7">Otro**</th>
                        </tr>
                        <tr className="font-bold fs-[8px]">
                            <th className="w-6">A</th>
                            <th className="w-6">H</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: 10 }).map((_, idx) => {
                            const item = odp.items?.[idx];
                            const letter = String.fromCharCode(65 + idx); // A, B, C...
                            return (
                                <tr key={idx} className="h-[22px]">
                                    <td className="font-bold">{letter}</td>
                                    <td className="font-bold">{item?.tipo_vidrio?.charAt(0) || ''}</td>
                                    <td className="font-bold">{item?.espesor || ''}</td>
                                    <td className="font-bold">{item?.cantidad || ''}</td>
                                    <td className="font-bold">{item?.ancho_mm || ''}</td>
                                    <td className="font-bold">{item?.alto_mm || ''}</td>
                                    <td className="font-bold text-[8px]">{item?.pulidos || ''}</td> {/* PUL A */}
                                    <td className="font-bold text-[8px]">{item?.pulidos_h || ''}</td> {/* PUL H */}
                                    <td className="font-bold">{item?.perforaciones > 0 ? item.perforaciones : ''}</td>
                                    <td className="font-bold">{item?.boquetes > 0 ? item.boquetes : ''}</td>
                                    <td className="font-bold text-[8px] max-w-[20px] truncate">{item?.descuentos || ''}</td> {/* Des */}
                                    <td className="font-bold text-[8px] max-w-[30px] truncate">{item?.otros || ''}</td> {/* Otro */}
                                    <td className="font-bold text-[8px] text-center">{item?.ancho_mm && item?.alto_mm ? ((item.ancho_mm / 1000) * (item.alto_mm / 1000)).toFixed(3) : ''}</td> {/* MTS PT */}
                                    <td></td> {/* VALOR */}
                                    <td className="font-bold text-[8px] text-center">{item?.prod || ''}</td> {/* PROD */}
                                </tr>
                            );
                        })}
                        {(() => {
                            const IVA_RATE = 0.19;
                            const valorTotal = Number(odp.valor_total || 0);
                            const subtotal = valorTotal / (1 + IVA_RATE);
                            const iva = valorTotal - subtotal;
                            const fmt = (v: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(v);
                            return (
                                <>
                                    <tr>
                                        <td colSpan={13} rowSpan={3} className="text-left font-bold pt-1 align-top">
                                            ASESOR: <span className="font-normal ml-2 uppercase text-[9px]">{odp.asesor?.nombre_completo || `${odp.asesor?.first_name} ${odp.asesor?.last_name}`}</span>
                                        </td>
                                        <td className="text-right font-bold text-[8px] pr-1 text-orange-600">SUBTOTAL</td>
                                        <td className="text-right font-bold text-[9px] pr-1">{valorTotal > 0 ? `$ ${fmt(subtotal)}` : ''}</td>
                                    </tr>
                                    <tr>
                                        <td className="text-right font-bold text-[8px] pr-1 text-orange-600">IVA</td>
                                        <td className="text-right font-bold text-[9px] pr-1">{valorTotal > 0 ? `$ ${fmt(iva)}` : ''}</td>
                                    </tr>
                                    <tr>
                                        <td className="text-right font-bold text-[8px] pr-1 text-orange-600">VALOR TOTAL</td>
                                        <td className="text-right font-bold text-[9px] pr-1">{valorTotal > 0 ? `$ ${fmt(valorTotal)}` : ''}</td>
                                    </tr>
                                </>
                            );
                        })()}
                    </tbody>
                </table>

                <div className="flex justify-between items-end mt-1">
                    <div className="text-[7.5px] italic font-bold">
                        *BORDE PUL: Pulido/Brillado (P/B) - Pulido cerrado (PC) -Matado (MF) <br />
                        ** ACABADOS: Radios (RAD), Chaflan (CHA).
                    </div>
                </div>

                {/* ---------- OBSERVACIONES ---------- */}
                <div className="border-[2px] border-black p-2 mt-1 bg-white min-h-[50px]">
                    <p className="font-bold uppercase tracking-widest mb-1 text-[11px]">ENTREGA SOLICITADA - DIRECCION: <span className="font-normal">{odp.direccion_instalacion}</span></p>
                    <p className="font-bold uppercase tracking-widest mt-2 mb-1">OBSERVACIONES:</p>
                    <p className="text-sm uppercase font-semibold text-slate-700 whitespace-pre-line">
                        {odp.observaciones}
                    </p>
                </div>

                {/* ---------- LEGAL & FIRMA ---------- */}
                <div className="border-l-[2px] border-r-[2px] border-b-[2px] border-black p-1 text-center bg-white">
                    <p className="text-[5.5px] leading-[7px] text-justify px-2 font-medium text-slate-900 uppercase">
                        Autorizo de manera voluntaria, previa, expresa e informada a VIDRIOS Y ALUMINIOS TEMPLEX S.A.S. con NIT 900.XXX.XXX-X, para que en los terminos del articulo 10 de la ley 1581 de 2012 en concordancia con el decreto 1377 de 2013, recopile, almacene, use, circule y en general realice el tratamiento de los datos personales de caracter financiero, crediticio, comercial y de servicios, que me identifican o que me hacen identificable, con el proposito de consulta y reporte ante las Centrales de Riesgo y Bases de Datos (CIFIN - DATACRÉDITO - FENALCO - PROCREDITO) que administran informacion de habitos de pago. El incumplimiento de las obligaciones contraidas con VIDRIOS Y ALUMINIOS TEMPLEX S.A.S. autoriza el reporte de dicha informacion. La firma de este documento equivale a su aceptacion firme segun ley en las condiciones indicadas. La mercancia se entrega en buen estado y no se aceptan devoluciones pasados 8 dias.
                    </p>
                    <p className="font-bold italic mt-2 text-[10px] uppercase">ACEPTO LA DESCRIPCION DEL PRODUCTO Y LAS CONDICIONES COMERCIALES</p>

                    <div className="mt-6 mb-1">
                        <div className="w-64 border-b border-black mx-auto"></div>
                        <p className="font-bold fs-8 uppercase mt-0.5 tracking-widest">NOMBRE DEL CONTACTO</p>
                    </div>
                </div>

                {/* ---------- FORMA DE PAGO ---------- */}
                <table className="excel-table mt-1 bg-white">
                    <tbody>
                        <tr><td colSpan={6} className="font-bold text-center fs-8 uppercase tracking-widest">FORMA DE PAGO</td></tr>
                        {[0, 1].map((i) => {
                            const pago = odp.pagos?.[i];
                            return (
                                <tr key={i}>
                                    <td className="w-[10%] font-bold uppercase pl-2">RECIBO No:</td>
                                    <td className="w-[20%] text-[9px] font-bold pl-2">{pago?.referencia_pago || ''}</td>
                                    <td className="w-[15%] text-[9px] font-bold pl-2 uppercase">{pago?.metodo_pago || ''}</td>
                                    <td className="w-[25%] text-[9px] font-bold pl-2">{pago ? `$ ${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Number(pago.monto))}` : ''}</td>
                                    <td className="w-[15%] font-bold uppercase pl-2">{i === 0 ? 'CODIGO:' : 'FE No.:'}</td>
                                    <td className="w-[15%] text-[9px] font-bold uppercase pl-2">
                                        {i === 0
                                            ? (odp.tipo_servicio || odp.servicios_detalle?.[0]?.tipo_servicio || '')
                                            : (odp.factura_electronica
                                                ? `FE-${odp.factura_electronica} — ${odp.fecha_factura ? format(new Date(odp.fecha_factura), 'dd/MM/yyyy') : ''}`
                                                : '')
                                        }
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {/* Grilla inferior (Checkboxes visuales) */}
                <div className="flex gap-1 mt-1 bg-white">
                    <table className="excel-table w-1/4">
                        <tbody>
                            <tr><td className="font-bold text-center py-1 border-b border-black">MATIZADO</td><td className="w-8 text-center font-bold text-base border-b border-black">{odp.matizado ? 'X' : ''}</td></tr>
                            <tr><td className="font-bold text-center py-1 border-b border-black">ACARREO</td><td className="text-center font-bold text-base border-b border-black">{odp.acarreo ? 'X' : ''}</td></tr>
                            <tr><td className="font-bold text-center py-1 border-b border-black">INSTALACIÓN</td><td className="text-center font-bold text-base border-b border-black">{odp.instalacion ? 'X' : ''}</td></tr>
                        </tbody>
                    </table>
                    <table className="excel-table w-1/4">
                        <tbody>
                            <tr><td className="font-bold text-center py-1 border-b border-black">PELICULA</td><td className="w-8 text-center font-bold text-base border-b border-black">{odp.pelicula ? 'X' : ''}</td></tr>
                            <tr><td className="font-bold text-center py-1 border-b border-black">HUACAL</td><td className="text-center font-bold text-base border-b border-black">{odp.huacal ? 'X' : ''}</td></tr>
                            <tr><td className="font-bold text-center py-1 border-b border-black">CARTÓN</td><td className="text-center font-bold text-base border-b border-black">{odp.carton ? 'X' : ''}</td></tr>
                        </tbody>
                    </table>
                    <table className="excel-table w-1/2">
                        <tbody>
                            <tr>
                                <td rowSpan={3} className="font-bold align-top text-center border-r-2 border-r-black w-24 pt-1">PEDIDO EXTERNO</td>
                                <td className="font-bold text-center w-12 py-1">SAP</td>
                                <td className="w-16 text-center text-[9px] font-bold">{odp.saps?.[0]?.numero_sap || ''}</td>
                                <td className="font-bold text-center w-12 py-1">ODC</td>
                                <td className="w-16"></td>
                            </tr>
                            <tr>
                                <td className="font-bold text-center py-1">COT</td>
                                <td className="text-center text-[9px] font-bold">{odp.cotizaciones?.[0]?.numero_cot || ''}</td>
                                <td className="font-bold text-center py-1">ODC</td>
                                <td></td>
                            </tr>
                            <tr>
                                <td className="font-bold text-center py-1">TM</td>
                                <td className="text-center text-[9px] font-bold">{odp.tomas_medidas?.[0]?.numero_tm || ''}</td>
                                <td className="font-bold text-center py-1">ODC</td>
                                <td></td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* ---------- PIE DE PÁGINA ---------- */}
                <div className="flex justify-end mt-1">
                    <span className="text-[7px] text-slate-500">VTS-2026-003</span>
                </div>

            </div>
        </div>
    );
};

export default PrintableTalonario;
