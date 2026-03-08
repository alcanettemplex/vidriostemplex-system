import React from 'react';
import { format } from 'date-fns';
import { TemplexLogo } from '../../../components/ui/TemplexLogo';

interface PrintableGarantiaProps {
    data?: any; // future use
}

const PrintableGarantia: React.FC<PrintableGarantiaProps> = ({ data }) => {

    return (
        <div className="hidden print:block w-[21.5cm] min-h-[29cm] bg-white text-black font-sans text-[11px] mx-auto overflow-hidden">
            <style>
                {`
                .excel-table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
                .excel-table th, .excel-table td { border: 1px solid #000; padding: 4px; border-color: #000; }
                .celda-title { font-weight: bold; text-align: center; text-transform: uppercase; }
                .celda-value { text-align: center; font-size: 13px; }
                
                @media print {
                    .print-container { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
                `}
            </style>

            <div className="print-container p-4 mt-8">
                <table className="excel-table">
                    <tbody>
                        {/* HEADER LOGO Y TITULO */}
                        <tr>
                            <td rowSpan={2} className="w-[30%] text-center align-middle p-2">
                                <div className="flex justify-center items-center gap-2">
                                    <TemplexLogo className="h-16 w-56" />
                                </div>
                            </td>
                            <td colSpan={2} className="w-[70%] bg-blue-50 text-center font-black text-2xl uppercase tracking-widest p-4 pb-2 border-b-2 border-b-black">
                                SERVICIO GARANTIA DE<br />PRODUCTO
                            </td>
                        </tr>
                        <tr>
                            <td className="w-[35%] celda-title bg-slate-50 text-[10px] uppercase font-black leading-tight p-2 flex items-center justify-center">
                                NUMERO CONSECUTIVO<br />DE GARANTIA
                            </td>
                            <td className="w-[35%] text-center font-black text-2xl">
                                {data?.consecutivo || '...'}
                            </td>
                        </tr>

                        {/* ROW FECHA - ODP */}
                        <tr>
                            <td className="celda-title bg-slate-50 py-3">FECHA DE SOLICITUD</td>
                            <td className="celda-value text-blue-800 font-bold">{data?.fecha ? format(new Date(data.fecha), 'dd-MMM-yy') : ''}</td>
                            <td className="p-0 border-none">
                                <table className="w-full h-full border-collapse">
                                    <tbody>
                                        <tr>
                                            <td className="w-1/2 celda-title bg-slate-50 text-xl py-3 border border-black border-l-0 border-t-0 border-b-0">ODP</td>
                                            <td className="w-1/2 text-center text-red-600 font-black text-2xl border-none">{data?.odp || ''}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <table className="excel-table border-t-0">
                    <tbody>
                        {/* ASESOR - INSTALADOR */}
                        <tr>
                            <td className="w-[15%] celda-title bg-slate-50">ASESOR:</td>
                            <td className="w-[35%] celda-value uppercase">{data?.asesor}</td>
                            <td className="w-[15%] celda-title bg-slate-50">INSTALADOR:</td>
                            <td className="w-[35%] celda-value uppercase">{data?.instalador}</td>
                        </tr>

                        {/* CLIENTE */}
                        <tr>
                            <td colSpan={2} className="celda-title bg-slate-50 w-[50%] leading-tight text-[10px]">NOMBRE DEL CLIENTE O RAZON<br />SOCIAL:</td>
                            <td colSpan={2} className="celda-value uppercase">{data?.cliente}</td>
                        </tr>

                        {/* CONTACTO - TELEFONO */}
                        <tr>
                            <td className="celda-title bg-slate-50">CONTACTO:</td>
                            <td className="celda-value uppercase">{data?.contacto}</td>
                            <td className="celda-title bg-slate-50">TELEFONO:</td>
                            <td className="celda-value">{data?.telefono}</td>
                        </tr>

                        {/* DIRECCION */}
                        <tr>
                            <td className="celda-title bg-slate-50 py-3">DIRECCION:</td>
                            <td colSpan={3} className="celda-value uppercase">{data?.direccion}</td>
                        </tr>

                        {/* TIPO PRODUCTO */}
                        <tr>
                            <td className="celda-title bg-slate-50 py-3">TIPO DE<br />PRODUCTO:</td>
                            <td colSpan={3} className="celda-value uppercase">{data?.tipo_producto}</td>
                        </tr>

                        {/* FECHAS INSTALACION Y VENCIMIENTO */}
                        <tr>
                            <td className="celda-title bg-slate-50 text-[9px] leading-tight">FECHA INSTALACION DEL<br />PRODUCTO:</td>
                            <td className="celda-value">{data?.fecha_instalacion}</td>
                            <td className="celda-title bg-slate-50 text-[9px] leading-tight">FECHA VENCIMIENTO DE<br />GARANTIA:</td>
                            <td className="celda-value">{data?.fecha_vencimiento}</td>
                        </tr>
                    </tbody>
                </table>

                <table className="excel-table border-t-0 min-h-[400px]">
                    <tbody>
                        {/* DESCRIPCION CLIENTE TARGET */}
                        <tr>
                            <td className="celda-title bg-slate-50 py-2 tracking-widest border-b-[2px] border-black">DESCRIPCIÓN DEL CLIENTE</td>
                        </tr>
                        {Array.from({ length: 8 }).map((_, i) => (
                            <tr key={i}>
                                <td className={`h-10 text-left text-sm uppercase px-2 font-medium ${i === 0 ? 'border-b border-black text-blue-800' : 'border-b border-black'}`}>
                                    {i === 0 ? data?.descripcion : ''}
                                </td>
                            </tr>
                        ))}
                        <tr>
                            <td className="h-10 text-center font-bold italic tracking-widest mt-4 border-none pt-8">
                                ADMINISTRACIÓN
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default PrintableGarantia;
