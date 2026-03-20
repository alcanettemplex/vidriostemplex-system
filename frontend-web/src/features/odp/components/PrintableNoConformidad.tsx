import React from 'react';
import { format } from 'date-fns';
import { TemplexLogo } from '../../../components/ui/TemplexLogo';

interface PrintableNoConformidadProps {
    data?: any; // future use
    odp?: any;
}

const PrintableNoConformidad: React.FC<PrintableNoConformidadProps> = ({ data, odp }) => {

    const checkIcon = (type: string) => (data?.tipo_error === type ? 'X' : '');

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
                                        {data?.numero_reporte?.replace('NC-', '') || '...'}
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
                                        <div className="w-5 h-5 border border-black flex items-center justify-center font-black text-lg">{checkIcon('ERROR_INTERNO')}</div>
                                    </div>
                                    <div className="flex-1 flex justify-between px-2 items-center">
                                        <span>DAÑO EN<br />PLANTA</span>
                                        <div className="w-5 h-5 border border-black flex items-center justify-center font-black text-lg">{checkIcon('DANO_PLANTA')}</div>
                                    </div>
                                    <div className="flex-1 flex justify-between px-2 items-center">
                                        <span>REPROCESO</span>
                                        <div className="w-5 h-5 border border-black flex items-center justify-center font-black text-lg">{checkIcon('REPROCESO')}</div>
                                    </div>
                                    <div className="flex-1 flex justify-between px-2 items-center">
                                        <span>QUEJA</span>
                                        <div className="w-5 h-5 border border-black flex items-center justify-center font-black text-lg">{checkIcon('QUEJA')}</div>
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
                            <td className="w-[75%] font-bold">No. Orden de Pedido: <span className="font-normal">{odp?.numero_odp}</span> &nbsp;&nbsp;&nbsp;&nbsp; Cliente= <span className="font-normal">{odp?.cliente?.nombre_razon_social}</span><br /><br />
                                ODC (Solicitud): <span className="font-normal">{odp?.numero_odp}</span></td>
                        </tr>
                        <tr>
                            <td className="h-14 font-bold">N.ODP nueva:<br /><br />ODC nueva:</td>
                            <td className="font-bold uppercase">Reportado por:<br /><span className="font-normal">{data?.usuario_reporta?.nombre_completo || '—'}</span></td>
                        </tr>
                    </tbody>
                </table>

                {/* ---------- MOTIVOS ---------- */}
                <table className="excel-table mb-4">
                    <tbody>
                        <tr>
                            <td colSpan={2} className="h-16 font-bold">
                                Área del error: <span className="font-normal uppercase">{data?.area_error}</span><br /><br />
                                <span className="font-bold uppercase text-xs">Causa: </span> <span className="font-normal">{data?.causa}</span>
                            </td>
                        </tr>
                        <tr>
                            <td className="w-[40%] h-16 font-bold uppercase text-xs">Responsable causa: <span className="font-normal">{data?.responsable}</span></td>
                            <td className="w-[60%] font-bold uppercase text-xs">Efecto: <span className="font-normal">{data?.efecto}</span></td>
                        </tr>
                    </tbody>
                </table>

                {/* ---------- PRODUCTO PRESENTA ERROR ---------- */}
                <table className="excel-table mb-4 text-center">
                    <thead>
                        <tr><th colSpan={3} className="uppercase font-black text-sm tracking-widest bg-gray-100 p-2">PRODUCTO QUE PRESENTA EL ERROR</th></tr>
                        <tr>
                            <th className="w-[60%] font-bold text-xs">Descripción</th>
                            <th className="w-[20%] font-bold text-xs">Cantidad</th>
                            <th className="w-[20%] font-bold text-xs">Costo total</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="h-24 text-left p-2"><span className="whitespace-pre-line text-xs uppercase">{data?.producto_error_descripcion}</span></td>
                            <td className="align-middle text-lg font-bold">{data?.producto_error_cantidad}</td>
                            <td className="align-middle font-bold">{data?.costo_total > 0 ? `$ ${data.costo_total}` : ''}</td>
                        </tr>
                    </tbody>
                </table>

                {/* ---------- PRODUCTO SOLUCIONA ERROR ---------- */}
                <table className="excel-table mb-4 text-center">
                    <thead>
                        <tr><th colSpan={3} className="uppercase font-black text-sm tracking-widest bg-gray-100 p-2">PRODUCTO QUE SOLUCIONA EL ERROR</th></tr>
                        <tr>
                            <th className="w-[60%] font-bold text-xs">Descripción</th>
                            <th className="w-[20%] font-bold text-xs">Cantidad</th>
                            <th className="w-[20%] font-bold text-xs">Costo total</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="h-24 text-left p-2"><span className="whitespace-pre-line text-xs uppercase">{data?.producto_solucion_descripcion}</span></td>
                            <td className="align-middle text-lg font-bold">{data?.producto_solucion_cantidad}</td>
                            <td></td>
                        </tr>
                    </tbody>
                </table>

                {/* ---------- FIRMAS ---------- */}
                <table className="excel-table mb-4">
                    <tbody>
                        <tr>
                            <td className="w-1/2 h-20 font-bold align-bottom p-4">
                                <div className="border-t border-black w-2/3 mx-auto text-center pt-1 text-[9px]">Vo. Bo. Responsable</div>
                            </td>
                            <td className="w-1/2 font-bold align-bottom p-4">
                                <div className="border-t border-black w-2/3 mx-auto text-center pt-1 text-[9px]">Vo. Bo. Gerencia</div>
                            </td>
                        </tr>
                        <tr>
                            <td className="font-bold py-3 px-4">Se realizo descargo: SI: ______  No: ______ </td>
                            <td className="font-bold text-slate-400 p-4">Fecha: ________________</td>
                        </tr>
                    </tbody>
                </table>

                {/* ---------- OBSERVACIONES ---------- */}
                <table className="excel-table">
                    <tbody>
                        <tr>
                            <td className="h-32 font-bold p-4">
                                <span className="text-[10px] text-slate-500 block mb-2">OBSERVACIONES FINALES:</span>
                                <span className="font-normal whitespace-pre-line text-xs uppercase block">{data?.observaciones}</span>
                            </td>
                        </tr>
                    </tbody>
                </table>

            </div>
        </div>
    );
};


export default PrintableNoConformidad;
