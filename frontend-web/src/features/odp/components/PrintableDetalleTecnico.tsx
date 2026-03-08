import React from 'react';
import { TemplexLogo } from '../../../components/ui/TemplexLogo';

interface PrintableDetalleTecnicoProps {
    odp: any;
}

const PrintableDetalleTecnico: React.FC<PrintableDetalleTecnicoProps> = ({ odp }) => {

    return (
        <div className="hidden print:block w-[21.5cm] min-h-[29cm] bg-white text-black font-sans text-[10px] mx-auto overflow-hidden">
            <style>
                {`
                .excel-table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
                .excel-table th, .excel-table td { border: 1px solid #000; padding: 2px 4px; border-color: #000; }
                .excel-table th { font-weight: bold; text-align: center; }
                
                @media print {
                    .print-container { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin-top: 2cm; }
                }
                `}
            </style>

            <div className="print-container p-2">
                {/* ---------- CABECERA ---------- */}
                <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center w-1/3">
                        <div className="flex flex-col">
                            <TemplexLogo className="h-12 w-48 justify-start" />
                        </div>
                    </div>
                </div>

                <table className="excel-table mb-1">
                    <tbody>
                        <tr>
                            <td className="font-bold text-center uppercase tracking-[0.2em] text-sm py-1 bg-gray-50">
                                DETALLE TECNICO
                            </td>
                        </tr>
                        <tr>
                            <td className="h-[600px] align-top p-4">
                                {/* Aqui va el croquis si existe, si no vacio */}
                                {odp.croquis_url ? (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <img src={odp.croquis_url} className="max-w-full max-h-full object-contain" alt="Croquis" />
                                    </div>
                                ) : null}
                            </td>
                        </tr>
                    </tbody>
                </table>
                <table className="excel-table">
                    <tbody>
                        <tr>
                            <td className="font-bold text-center uppercase tracking-[0.2em] py-1 bg-gray-50">
                                OBSERVACION DE INSTALACION
                            </td>
                        </tr>
                        <tr>
                            <td className="h-40 align-top p-2 text-sm uppercase">
                            </td>
                        </tr>
                    </tbody>
                </table>
                <div className="text-right mt-2 font-bold tracking-[0.3em]">
                    ...................................
                </div>
            </div>
        </div>
    );
};

export default PrintableDetalleTecnico;
