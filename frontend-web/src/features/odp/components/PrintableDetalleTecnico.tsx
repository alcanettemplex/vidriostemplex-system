import React from 'react';
import { TemplexLogo } from '../../../components/ui/TemplexLogo';

interface PrintableDetalleTecnicoProps {
    odp: any;
}

const PrintableDetalleTecnico: React.FC<PrintableDetalleTecnicoProps> = ({ odp }) => {
    return (
        <div className="block print:block w-[21.5cm] min-h-[29cm] bg-white shadow-xl print:shadow-none text-black font-sans text-[10px] mx-auto overflow-hidden">
            <style>
                {`
                .excel-table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
                .excel-table th, .excel-table td { border: 1px solid #000; padding: 2px 4px; border-color: #000; }
                .excel-table th { font-weight: bold; text-align: center; }
                
                @media print {
                    .print-container { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 0 !important; }
                }
                `}
            </style>

            <div className="print-container p-6">
                {/* ---------- CABECERA ---------- */}
                <div className="flex justify-between items-end mb-1">
                    <div className="flex items-center w-1/3">
                        <div className="flex flex-col">
                            <TemplexLogo className="h-10 w-40 justify-start" />
                        </div>
                    </div>

                    <div className="w-1/3 text-center font-bold text-[13px] mb-2 uppercase tracking-[0.2em]">
                        DETALLE TECNICO
                    </div>

                    <div className="w-1/3 flex justify-end mb-1">
                        <div className="border-[2px] border-black text-xl font-bold w-32 h-10 flex items-center justify-center">
                            {odp.numero_odp?.split('-').pop() || odp.numero_odp}
                        </div>
                    </div>
                </div>

                {/* ---------- DATOS CLIENTE ---------- */}
                <table className="excel-table thick-b mb-1 border-t-2 border-l-2 border-r-2 border-black">
                    <tbody>
                        <tr>
                            <td className="w-[30%] font-bold">FECHA: <span className="font-normal uppercase ml-1">{odp.fecha_creacion ? new Date(odp.fecha_creacion).toLocaleDateString() : ''}</span></td>
                            <td className="w-[45%] font-bold">CLIENTE: <span className="font-normal uppercase ml-1">{odp.cliente?.nombre_razon_social}</span></td>
                            <td className="w-[25%] font-bold">TEL: <span className="font-normal uppercase ml-1">{odp.cliente?.telefono}</span></td>
                        </tr>
                        <tr>
                            <td colSpan={2} className="font-bold border-r-0">
                                <div className="flex items-center justify-between">
                                    <span>DIRECCION: <span className="font-normal uppercase ml-1">{odp.direccion_instalacion || odp.cliente?.direccion}</span></span>
                                    <span className="border-l border-black pl-2 ml-2">NIT O C.C: <span className="font-normal uppercase ml-1">{odp.cliente?.numero_documento || odp.cliente?.ruc_rut}</span></span>
                                </div>
                            </td>
                            <td className="font-bold">CEL: <span className="font-normal uppercase ml-1">{odp.cliente?.celular || odp.cliente?.telefono}</span></td>
                        </tr>
                    </tbody>
                </table>

                {/* ---------- ESPACIO DE DIBUJO ---------- */}
                <div className="border-2 border-black mt-2 w-full p-2 relative" style={{ height: '700px' }}>
                    {/* Placeholder content where User will implement drawing later */}
                    {odp.croquis_url && (
                        <div className="absolute inset-0 flex items-center justify-center opacity-80 pointer-events-none p-4">
                            <img src={odp.croquis_url} className="w-full h-full object-contain" alt="Croquis" />
                        </div>
                    )}
                </div>

                <div className="border-2 border-black mt-2 w-full p-2 flex flex-col" style={{ height: '180px' }}>
                    <span className="font-bold text-[12px] uppercase">OBSERVACION DE INSTALACION</span>
                    <div className="mt-2 text-sm uppercase font-semibold text-slate-700 whitespace-pre-line flex-1">
                        {odp.observacion_instalacion || "\n\n\n\n"}
                    </div>
                </div>

                <div className="text-right mt-1 font-bold text-[8px]">
                    Vr/Versión:08 18/03/2021 Pag 4 de 4
                </div>

            </div>
        </div>
    );
};

export default PrintableDetalleTecnico;
