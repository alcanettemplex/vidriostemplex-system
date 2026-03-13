import React from 'react';
import { format } from 'date-fns';
import { TemplexLogo } from '../../../components/ui/TemplexLogo';

interface PrintableNoConformidadProps {
    data?: any; // future use
    odp?: any;
}

const PrintableNoConformidad: React.FC<PrintableNoConformidadProps> = ({ data, odp }) => {

    return (
        <div className="block print:block shadow-xl print:shadow-none w-[21.5cm] min-h-[29cm] bg-white text-black font-sans text-[11px] mx-auto overflow-hidden">
            <style>
                {`
                .excel-table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
                .excel-table th, .excel-table td { border: 1px solid #000; padding: 4px 6px; border-color: #000; vertical-align: top; }
                .gray-bg { background-color: #f3f4f6; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                
                @media print {
                    .print-container { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
                `}
            </style>

            <div className="print-container p-4 mt-8">
                {/* ---------- CABECERA ---------- */}
                <table className="excel-table mb-4">
                    <tbody>
                        <tr>
                            <td rowSpan={2} className="w-[30%] text-center align-middle">
                                <div className="flex justify-center items-center gap-2">
                                    <TemplexLogo className="h-16 w-56" />
                                </div>
                            </td>
                            <td className="w-[50%] p-0 align-middle">
                                <div className="flex h-full w-full">
                                    <div className="w-[70%] border-r border-black flex items-center justify-center font-black text-2xl uppercase tracking-widest text-[#666]">
                                        NO CONFORMIDAD
                                    </div>
                                    <div className="w-[30%] flex items-center justify-center font-black text-3xl">
                                        # {data?.id || '......'}
                                    </div>
                                </div>
                            </td>
                            <td className="w-[20%] text-[9px] p-0">
                                <div className="border-b border-black h-1/3 flex items-center px-2">Código: CIW04</div>
                                <div className="border-b border-black h-1/3 flex items-center px-2">Versión: 01</div>
                                <div className="h-1/3 flex items-center px-2">Fecha: 14/08/13</div>
                            </td>
                        </tr>
                        <tr>
                            <td colSpan={2} className="p-0 border-t-2 border-t-black">
                                <div className="flex h-10 divide-x divide-black text-[9px] font-bold text-center items-center">
                                    <div className="flex-1 flex justify-between px-2 items-center">
                                        <span>ERROR<br />INTERNO</span>
                                        <div className="w-5 h-5 border border-black flex items-center justify-center font-black text-lg"></div>
                                    </div>
                                    <div className="flex-1 flex justify-between px-2 items-center">
                                        <span>DAÑO EN<br />PLANTA</span>
                                        <div className="w-5 h-5 border border-black flex items-center justify-center font-black text-lg"></div>
                                    </div>
                                    <div className="flex-1 flex justify-between px-2 items-center">
                                        <span>REPROCESO</span>
                                        <div className="w-5 h-5 border border-black flex items-center justify-center font-black text-lg"></div>
                                    </div>
                                    <div className="flex-1 flex justify-between px-2 items-center">
                                        <span>QUEJA</span>
                                        <div className="w-5 h-5 border border-black flex items-center justify-center font-black text-lg"></div>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>

                {/* ---------- DATOS DE REPORTE ---------- */}
                <table className="excel-table mb-4">
                    <tbody>
                        <tr>
                            <td className="w-[25%] h-14 font-bold">Fecha del reporte:<br /><span className="font-normal mt-2 block">{data?.fecha ? format(new Date(data.fecha), 'dd/MMMM/ yyyy') : ''}</span></td>
                            <td className="w-[75%] font-bold">No. Orden de Pedido: <span className="font-normal">{data?.numero_odp}</span> &nbsp;&nbsp;&nbsp;&nbsp; Cliente= <span className="font-normal">{data?.cliente}</span><br /><br />
                                ODC: <span className="font-normal">{data?.odc}</span></td>
                        </tr>
                        <tr>
                            <td className="h-14 font-bold">N.ODP nueva:<br /><br />ODC nueva:</td>
                            <td className="font-bold">Reportado por:<br /><br />FE=</td>
                        </tr>
                    </tbody>
                </table>

                {/* ---------- MOTIVOS ---------- */}
                <table className="excel-table mb-4">
                    <tbody>
                        <tr>
                            <td colSpan={2} className="h-16 font-bold">
                                Área del error: <span className="font-normal">{data?.area_error}</span><br /><br />
                                <span className="font-bold">Causa: </span> <span className="font-normal">{data?.causa}</span>
                            </td>
                        </tr>
                        <tr>
                            <td className="w-[40%] h-16 font-bold">Responsable causa: <span className="font-normal">{data?.responsable}</span></td>
                            <td className="w-[60%] font-bold">Efecto: <span className="font-normal">{data?.efecto}</span></td>
                        </tr>
                    </tbody>
                </table>

                {/* ---------- PRODUCTO PRESENTA ERROR ---------- */}
                <table className="excel-table mb-4 text-center">
                    <thead>
                        <tr><th colSpan={3} className="uppercase font-black text-sm tracking-widest bg-gray-100">PRODUCTO QUE PRESENTA EL ERROR</th></tr>
                        <tr>
                            <th className="w-[60%] font-bold">Descripción</th>
                            <th className="w-[20%] font-bold">Cantidad</th>
                            <th className="w-[20%] font-bold">Costo total</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="h-24 text-left p-2"><span className="whitespace-pre-line">{data?.producto_error?.descripcion}</span></td>
                            <td className="align-middle text-lg font-bold">{data?.producto_error?.cantidad}</td>
                            <td></td>
                        </tr>
                    </tbody>
                </table>

                {/* ---------- PRODUCTO SOLUCIONA ERROR ---------- */}
                <table className="excel-table mb-4 text-center">
                    <thead>
                        <tr><th colSpan={3} className="uppercase font-black text-sm tracking-widest bg-gray-100">PRODUCTO QUE SOLUCIONA EL ERROR</th></tr>
                        <tr>
                            <th className="w-[60%] font-bold">Descripción</th>
                            <th className="w-[20%] font-bold">Cantidad</th>
                            <th className="w-[20%] font-bold">Costo total</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="h-24 text-left p-2"><span className="whitespace-pre-line">{data?.producto_solucion?.descripcion}</span></td>
                            <td className="align-middle text-lg font-bold">{data?.producto_solucion?.cantidad}</td>
                            <td></td>
                        </tr>
                    </tbody>
                </table>

                {/* ---------- FIRMAS ---------- */}
                <table className="excel-table mb-4">
                    <tbody>
                        <tr>
                            <td className="w-1/2 h-10 font-bold align-bottom">Vo. Bo. Responsable</td>
                            <td className="w-1/2 font-bold align-bottom">Vo. Bo. Gerencia</td>
                        </tr>
                        <tr>
                            <td className="font-bold">Se realizo descargo: SI: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; No: </td>
                            <td className="font-bold text-blue-800">Fecha: </td>
                        </tr>
                    </tbody>
                </table>

                {/* ---------- OBSERVACIONES ---------- */}
                <table className="excel-table">
                    <tbody>
                        <tr>
                            <td className="h-32 font-bold">OBSERVACIONES:<br /><span className="font-normal whitespace-pre-line p-2 block">{data?.observaciones_finales}</span></td>
                        </tr>
                    </tbody>
                </table>

            </div>
        </div>
    );
};

export default PrintableNoConformidad;
