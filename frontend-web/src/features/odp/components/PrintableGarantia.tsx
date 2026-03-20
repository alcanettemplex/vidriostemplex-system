import React from 'react';
import { format, addYears, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { TemplexLogo } from '../../../components/ui/TemplexLogo';

interface PrintableGarantiaProps {
    odp?: any;
}

const PrintableGarantia: React.FC<PrintableGarantiaProps> = ({ odp }) => {

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        return isValid(d) ? format(d, 'dd/MM/yyyy') : '—';
    };

    const getExpiryDate = (dateStr: string) => {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        return isValid(d) ? format(addYears(d, 1), 'dd/MM/yyyy') : '—';
    };

    const asesorNombre = odp?.asesor?.nombre_completo || '—';
    const lastProgramacion = odp?.programaciones?.[odp.programaciones.length - 1];
    const instaladorNombre = lastProgramacion?.instalador?.nombre_completo || '—';

    return (
        <div className="block print:block shadow-xl print:shadow-none w-[21.5cm] min-h-[29cm] bg-white text-black font-sans text-[11px] mx-auto overflow-hidden">
            <style>
                {`
                .excel-table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
                .excel-table th, .excel-table td { border: 1px solid #000; padding: 4px; border-color: #000; }
                .celda-title { font-weight: bold; text-align: center; text-transform: uppercase; }
                .celda-value { text-align: center; font-size: 13px; font-weight: bold; }
                
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
                            <td colSpan={2} className="w-[70%] bg-slate-100 text-center font-black text-2xl uppercase tracking-widest p-4 pb-2 border-b-2 border-b-black">
                                SERVICIO GARANTIA DE<br />PRODUCTO
                            </td>
                        </tr>
                        <tr>
                            <td className="w-[35%] celda-title bg-slate-50 text-[10px] uppercase font-black leading-tight p-2 flex items-center justify-center">
                                NUMERO CONSECUTIVO<br />DE GARANTIA
                            </td>
                            <td className="w-[35%] text-center font-black text-2xl">
                                G-{odp?.numero_odp?.split('-').pop() || '......'}
                            </td>
                        </tr>

                        {/* ROW FECHA - ODP */}
                        <tr>
                            <td className="celda-title bg-slate-50 py-3">FECHA DE SOLICITUD</td>
                            <td className="celda-value text-slate-800">{formatDate(odp?.fecha_creacion)}</td>
                            <td className="p-0 border-none">
                                <table className="w-full h-full border-collapse">
                                    <tbody>
                                        <tr>
                                            <td className="w-1/2 celda-title bg-slate-50 text-xl py-3 border border-black border-l-0 border-t-0 border-b-0">ODP</td>
                                            <td className="w-1/2 text-center text-red-600 font-black text-2xl border-none">{odp?.numero_odp || ''}</td>
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
                            <td className="w-[35%] celda-value uppercase text-sm">{asesorNombre}</td>
                            <td className="w-[15%] celda-title bg-slate-50">INSTALADOR:</td>
                            <td className="w-[35%] celda-value uppercase text-sm">{instaladorNombre}</td>
                        </tr>

                        {/* CLIENTE */}
                        <tr>
                            <td colSpan={2} className="celda-title bg-slate-50 w-[50%] leading-tight text-[10px] py-3">NOMBRE DEL CLIENTE O RAZON<br />SOCIAL:</td>
                            <td colSpan={2} className="celda-value uppercase">{odp?.cliente?.nombre_razon_social || '—'}</td>
                        </tr>

                        {/* CONTACTO - TELEFONO */}
                        <tr>
                            <td className="celda-title bg-slate-50 py-3">CONTACTO:</td>
                            <td className="celda-value uppercase">{odp?.nombre_recibe || odp?.cliente?.nombre_razon_social || '—'}</td>
                            <td className="celda-title bg-slate-50">TELEFONO:</td>
                            <td className="celda-value">{odp?.telefono_recibe || odp?.cliente?.celular || odp?.cliente?.telefono || '—'}</td>
                        </tr>

                        {/* DIRECCION */}
                        <tr>
                            <td className="celda-title bg-slate-50 py-3">DIRECCION INSTALACIÓN:</td>
                            <td colSpan={3} className="celda-value uppercase">{odp?.direccion_instalacion || odp?.cliente?.direccion || '—'}</td>
                        </tr>

                        {/* TIPO PRODUCTO */}
                        <tr>
                            <td className="celda-title bg-slate-50 py-3">TIPO DE<br />PRODUCTO:</td>
                            <td colSpan={3} className="celda-value uppercase">{odp?.tipo_servicio || 'SERVICIO DE VIDRIERÍA'}</td>
                        </tr>

                        {/* FECHAS INSTALACION Y VENCIMIENTO */}
                        <tr>
                            <td className="celda-title bg-slate-50 text-[9px] py-3 leading-tight">FECHA INSTALACION DEL<br />PRODUCTO:</td>
                            <td className="celda-value">{formatDate(odp?.fecha_entrega)}</td>
                            <td className="celda-title bg-slate-50 text-[9px] leading-tight">FECHA VENCIMIENTO DE<br />GARANTIA:</td>
                            <td className="celda-value">{getExpiryDate(odp?.fecha_entrega)}</td>
                        </tr>
                    </tbody>
                </table>

                <table className="excel-table border-t-0 min-h-[400px]">
                    <tbody>
                        {/* DESCRIPCION CLIENTE TARGET */}
                        <tr>
                            <td className="celda-title bg-slate-100 py-3 tracking-widest border-b-[2px] border-black text-sm">DESCRIPCIÓN DEL PROYECTO / PEDIDO</td>
                        </tr>
                        <tr>
                           <td className="h-64 text-left text-sm uppercase px-4 font-medium align-top pt-4">
                                {odp?.descripcion_pedido || 'Sin descripción detallada.'}
                                {odp?.observaciones && (
                                    <div className="mt-4 pt-4 border-t border-slate-200">
                                        <p className="font-bold text-[10px]">OBSERVACIONES:</p>
                                        <p className="normal-case">{odp.observaciones}</p>
                                    </div>
                                )}
                           </td>
                        </tr>
                        <tr>
                            <td className="h-24 text-center font-bold italic tracking-widest mt-4">
                                <div className="flex justify-around items-center pt-8">
                                    <div className="text-center">
                                        <div className="w-48 border-b border-black mb-1"></div>
                                        <p className="text-[9px] uppercase">Firma Templex S.A.S</p>
                                    </div>
                                    <div className="text-center">
                                        <div className="w-48 border-b border-black mb-1"></div>
                                        <p className="text-[9px] uppercase">Firma del Cliente</p>
                                    </div>
                                </div>
                                <p className="mt-8 text-slate-400 text-[10px]">ADMINISTRACIÓN Y SELLOS</p>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <div className="mt-4 text-[9px] text-slate-500 text-center uppercase tracking-widest">
                    Esta garantía cubre defectos de fabricación por un periodo de un (1) año a partir de la fecha de instalación.
                </div>
            </div>
        </div>
    );
};

export default PrintableGarantia;
