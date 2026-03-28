import React from 'react';
import { format } from 'date-fns';
import { TemplexLogo } from '../../../components/ui/TemplexLogo';

interface PrintableTalonarioProps {
    odp: any;
}

const PrintableTalonario: React.FC<PrintableTalonarioProps> = ({ odp }) => {

    return (
        <div className="print-root block w-[21.5cm] min-h-[29cm] print:min-h-0 bg-white shadow-xl print:shadow-none text-black font-sans text-[10px] mx-auto overflow-hidden print:overflow-visible">
            <style>
                {`
                .excel-table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
                .excel-table th, .excel-table td { border: 1px solid #000; padding: 2px 4px; border-color: #000; }
                .excel-table th { font-weight: bold; text-align: center; }
                .thick-b { border-bottom: 2px solid #000 !important; }
                .fs-8 { font-size: 8px; }
                .fs-7 { font-size: 7px; }

                @media print {
                    @page { size: letter portrait; margin: 4mm; }
                    body, html { margin: 0 !important; padding: 0 !important; }
                    .print-container { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .print-root { width: 100% !important; min-height: unset !important; box-shadow: none !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
                }
                `}
            </style>

            <div className="print-container p-2 print:p-0">
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
                            <td className="w-[30%] font-bold">DIRECCION: <span className="font-normal uppercase ml-1">{odp.cliente?.direccion}</span></td>
                            <td className="w-[45%] font-bold">NIT O C.C: <span className="font-normal uppercase ml-1">{odp.cliente?.numero_documento || odp.cliente?.ruc_rut}</span></td>
                            <td className="w-[25%] font-bold">CEL: <span className="font-normal uppercase ml-1">{odp.cliente?.celular || odp.cliente?.telefono}</span></td>
                        </tr>
                        <tr>
                            <td className="w-[20%] font-bold border-r-0">
                                <span className="whitespace-nowrap">LISTO MATERIAL: <span className="font-normal uppercase ml-1">{odp.fecha_entrega ? format(new Date(odp.fecha_entrega), 'dd/MM/yyyy') : ''}</span></span>
                            </td>
                            <td className="font-bold">CORREO FACTURA ELECTRONICA: <span className="font-normal lowercase ml-1">{odp.cliente?.email}</span></td>
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
                                    <td className="align-top p-1">
                                        <span className="whitespace-pre-line uppercase font-semibold text-[10px] leading-tight">
                                            <span className="font-bold">{svc.tipo_servicio}{svc.descripcion ? ': ' : ''}</span>{svc.descripcion}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td className="h-14 font-bold text-center text-lg align-middle">{odp.cantidad_total || ''}</td>
                                <td className="align-top p-1">
                                    <span className="whitespace-pre-line uppercase font-semibold text-xs leading-tight">
                                        <span className="font-bold">{odp.tipo_servicio}{odp.descripcion_pedido ? ': ' : ''}</span>{odp.descripcion_pedido}
                                    </span>
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
                        <div className="w-64 mx-auto text-center">
                            {odp.nombre_recibe && (
                                <p className="font-bold text-[10px] uppercase mb-1">{odp.nombre_recibe}</p>
                            )}
                            <div className="border-b border-black"></div>
                            <p className="font-bold fs-8 uppercase mt-0.5 tracking-widest">NOMBRE DEL CONTACTO</p>
                            {(odp.telefono_recibe || odp.cargo_recibe) && (
                                <p className="text-[8px] mt-0.5 text-slate-700">
                                    {odp.cargo_recibe && <span className="uppercase font-semibold">{odp.cargo_recibe}</span>}
                                    {odp.cargo_recibe && odp.telefono_recibe && <span> — </span>}
                                    {odp.telefono_recibe && <span>{odp.telefono_recibe}</span>}
                                </p>
                            )}
                        </div>
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
                                            ? (() => {
                                                const codigos: Record<string, string> = {
                                                    'Suministro e Instalación': 'SUMINS01',
                                                    'Venta / Suministro': 'VTAVID01',
                                                    'Mantenimiento': 'INS002',
                                                };
                                                const tipo = odp.tipo_servicio || odp.servicios_detalle?.[0]?.tipo_servicio || '';
                                                return codigos[tipo] || '';
                                            })()
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
                <div className="mt-1">
                    <table style={{ tableLayout: 'fixed', borderCollapse: 'collapse', border: '1px solid #000', fontSize: '11px', width: '100%' }}>
                        <colgroup>
                            <col style={{ width: '11%' }} />
                            <col style={{ width: '6%' }} />
                            <col style={{ width: '11%' }} />
                            <col style={{ width: '6%' }} />
                            <col style={{ width: '14%' }} />
                            <col style={{ width: '8%' }} />
                            <col style={{ width: '8%' }} />
                            <col style={{ width: '8%' }} />
                            <col style={{ width: '8%' }} />
                            <col style={{ width: '8%' }} />
                            <col style={{ width: '12%' }} />
                        </colgroup>
                        <tbody>
                            <tr>
                                <td style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase' }}>MATIZADO</td>
                                <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center', fontWeight: 'bold' }}>{odp.matizado ? 'X' : ''}</td>
                                <td style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase' }}>PELICULA</td>
                                <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center', fontWeight: 'bold' }}>{odp.pelicula ? 'X' : ''}</td>
                                <td rowSpan={2} style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: 'bold', textAlign: 'center', verticalAlign: 'top', textTransform: 'uppercase' }}>
                                    PEDIDO EXTERNO
                                    {odp.numero_pedido_proveedor && <div style={{ fontWeight: 'bold', marginTop: '2px', color: '#1a3ec9' }}>{odp.numero_pedido_proveedor}</div>}
                                </td>
                                <td style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase' }}>SAP</td>
                                <td style={{ border: '1px solid #000', padding: '3px 4px', fontSize: '9px', fontWeight: 'bold', textAlign: 'center' }}>{odp.saps?.[0]?.numero_sap || ''}</td>
                                <td style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase' }}>ODC</td>
                                <td style={{ border: '1px solid #000', padding: '3px 4px' }}></td>
                                <td style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase' }}>PROV</td>
                                <td style={{ border: '1px solid #000', padding: '3px 4px', fontSize: '9px', fontWeight: 'bold', textAlign: 'center' }}>{odp.proveedor_vidrio || ''}</td>
                            </tr>
                            <tr>
                                <td style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase' }}>ACARREO</td>
                                <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center', fontWeight: 'bold' }}>{odp.acarreo ? 'X' : ''}</td>
                                <td style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase' }}>HUACAL</td>
                                <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center', fontWeight: 'bold' }}>{odp.huacal ? 'X' : ''}</td>
                                {/* col 5 absorbida por rowspan de PEDIDO EXTERNO */}
                                <td style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase' }}>COT</td>
                                <td style={{ border: '1px solid #000', padding: '3px 4px', fontSize: '9px', fontWeight: 'bold', textAlign: 'center' }}>{odp.cotizaciones?.[0]?.numero_cot || ''}</td>
                                <td style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase' }}>ODC</td>
                                <td style={{ border: '1px solid #000', padding: '3px 4px' }}></td>
                                <td style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase' }}>PROV</td>
                                <td style={{ border: '1px solid #000', padding: '3px 4px' }}></td>
                            </tr>
                            <tr>
                                <td style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase' }}>INSTALACIÓN</td>
                                <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center', fontWeight: 'bold' }}>{odp.instalacion ? 'X' : ''}</td>
                                <td style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase' }}>CARTÓN</td>
                                <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center', fontWeight: 'bold' }}>{odp.carton ? 'X' : ''}</td>
                                <td style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: 'bold', textAlign: 'center', color: '#1a3ec9' }}>{odp.proveedor_vidrio || ''}</td>
                                <td style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase' }}>TM</td>
                                <td style={{ border: '1px solid #000', padding: '3px 4px', fontSize: '9px', fontWeight: 'bold', textAlign: 'center' }}>{odp.tomas_medidas?.[0]?.numero_tm || ''}</td>
                                <td style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase' }}>ODC</td>
                                <td style={{ border: '1px solid #000', padding: '3px 4px' }}></td>
                                <td style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase' }}>PROV</td>
                                <td style={{ border: '1px solid #000', padding: '3px 4px' }}></td>
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
