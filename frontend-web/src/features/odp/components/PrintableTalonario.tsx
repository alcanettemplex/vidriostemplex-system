import React from 'react';
import { format } from 'date-fns';
import { TemplexLogo } from '../../../components/ui/TemplexLogo';

interface PrintableTalonarioProps {
    odp: any;
}

const PrintableTalonario: React.FC<PrintableTalonarioProps> = ({ odp }) => {

    return (
        <div className="hidden print:block w-[21.5cm] min-h-[29cm] bg-white text-black font-sans text-[10px] mx-auto overflow-hidden">
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
                                    <span className="border-l border-black pl-2 ml-2">NIT O C.C: <span className="font-normal uppercase ml-1">{odp.cliente?.numero_documento}</span></span>
                                </div>
                            </td>
                            <td className="font-bold">CEL: <span className="font-normal uppercase ml-1">{odp.cliente?.celular}</span></td>
                        </tr>
                        <tr>
                            <td colSpan={2} className="font-bold border-r-0">
                                <div className="flex">
                                    <span className="w-1/2">INCON DUP INFO METODO:</span>
                                    <span className="w-1/2 border-l border-black pl-2">CORREO FACTURA ELECTRONICA: <span className="font-normal lowercase ml-1">{odp.cliente?.email}</span></span>
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
                            <th rowSpan={2} className="w-8">ITEM</th>
                            <th rowSpan={2} className="w-8">CL</th>
                            <th rowSpan={2} className="w-10">ESP<br />mm</th>
                            <th rowSpan={2} className="w-10">CANT</th>
                            <th colSpan={2} className="w-[12%]">MEDIDAS EXACTAS</th>
                            <th colSpan={7}>ACABADOS</th>
                            <th rowSpan={2} className="w-10">MTS<br />PT</th>
                            <th rowSpan={2} className="w-[15%]">VALOR</th>
                            <th rowSpan={2} className="w-10">PROD</th>
                        </tr>
                        <tr className="font-bold fs-[8px]">
                            <th>Ancho [A]</th>
                            <th>Alto [H]</th>
                            <th className="w-6 border-r-0 translate-x-[2px]">T</th>
                            <th className="w-6 border-l-0 translate-x-[-2px]">T/P</th>
                            <th className="w-6">Pul.</th>
                            <th className="w-6">Boq.</th>
                            <th className="w-6">Per.</th>
                            <th className="w-6">Bisc*</th>
                            <th className="w-6">Otro</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: 11 }).map((_, idx) => {
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
                                    <td></td> {/* T placeholder */}
                                    <td></td> {/* T/P placeholder */}
                                    <td className="font-bold">{item?.pulidos || ''}</td>
                                    <td className="font-bold">{item?.boquetes || ''}</td>
                                    <td className="font-bold">{item?.perforaciones || ''}</td>
                                    <td></td> {/* Bisc placeholder */}
                                    <td className="font-bold fs-7">{item?.otros || ''}</td>
                                    <td></td>
                                    <td></td>
                                    <td></td>
                                </tr>
                            );
                        })}

                        {/* Summary lines mimicking Excel blank rows under table */}
                        <tr className="h-6">
                            <td colSpan={14} className="text-left align-top font-bold border-l-0 border-b-0">
                                ======
                            </td>
                            <td className="border-t border-b-0 border-black"></td>
                            <td className="bg-slate-200 border-none"></td>
                        </tr>
                        <tr className="h-6">
                            <td colSpan={14} className="text-left font-bold border-l-0 border-b-0 border-t-0">
                                =================================
                            </td>
                            <td className="border-b-0 border-t-0 border-black"></td>
                            <td className="bg-slate-200 border-none"></td>
                        </tr>
                        <tr className="h-6">
                            <td colSpan={14} className="text-left border-l-0 border-t-0 font-bold">
                                =====================
                            </td>
                            <td className="border-b border-t-0 border-black"></td>
                            <td className="bg-slate-200 border-none"></td>
                        </tr>

                        <tr>
                            <td colSpan={16} className="text-left font-bold p-1 border-t-2 border-t-black">ENTREGA SOLICITADA - DIREC: <span className="font-normal uppercase ml-1">{odp.direccion_instalacion}</span></td>
                        </tr>
                        <tr>
                            <td colSpan={16} className="text-left font-bold p-1">OBSERVACIONES: <span className="font-normal uppercase ml-1 text-[9px]">{odp.observaciones}</span></td>
                        </tr>
                    </tbody>
                </table>

                {/* ---------- LEGAL & FOOTER ---------- */}
                <div className="border-l-[2px] border-r-[2px] border-b-[2px] border-black p-1 text-center bg-white">
                    <p className="text-[5.5px] leading-[7px] text-justify px-2 font-medium text-slate-900 uppercase">
                        Autorizo a Vidrios y Aluminios TEMPLEX S.A.S. o a quien este designe, ceda o mutue sus derechos para que de manera permanente e irrevocable, con fines de control crediticio, financiero y comercial mi información sea reportada a las centrales de riesgo y/o bases de datos que manejen información de este mismo tipo. La firma de este documento equivale a su aceptación firme según ley en las condiciones indicadas, aceptando que la mercancía se entrega en buen estado y no se aceptan devoluciones pasados los 8 días.
                    </p>
                    <p className="font-bold italic mt-2 text-[10px] uppercase">ACEPTO LAS DESCRIPCIONES DEL PRODUCTO Y LAS CONDICIONALES COMERCIALES</p>

                    <div className="mt-6 mb-1">
                        <div className="w-64 border-b border-black mx-auto"></div>
                        <p className="font-bold fs-8 uppercase mt-0.5 tracking-widest">NOMBRE DEL CONTACTO</p>
                    </div>
                </div>

                {/* Forma de pago */}
                <table className="excel-table mt-1 bg-white">
                    <tbody>
                        <tr><td colSpan={4} className="font-bold text-center fs-8 uppercase tracking-widest">FORMA DE PAGO</td></tr>
                        <tr>
                            <td className="w-1/6 font-bold uppercase pl-2">ABONO:</td>
                            <td className="w-[30%] text-right font-bold pr-2 bg-slate-50">${Number(odp.abono || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            <td className="w-1/6 font-bold uppercase pl-2">CODIGO:</td>
                            <td className="w-[30%]"></td>
                        </tr>
                        <tr>
                            <td className="font-bold uppercase pl-2">SALDO:</td>
                            <td className="text-right font-bold pr-2 bg-slate-50">${Number(odp.pendiente || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            <td className="font-bold uppercase pl-2">TEL.:</td>
                            <td></td>
                        </tr>
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
                                <td className="w-16"></td>
                                <td className="w-16"></td>
                                <td className="w-16"></td>
                            </tr>
                            <tr>
                                <td className="font-bold text-center py-1">COT</td>
                                <td></td>
                                <td></td>
                                <td></td>
                            </tr>
                            <tr>
                                <td className="font-bold text-center py-1">TM</td>
                                <td></td>
                                <td></td>
                                <td></td>
                            </tr>
                        </tbody>
                    </table>
                </div>

            </div>
        </div>
    );
};

export default PrintableTalonario;
