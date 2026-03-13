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
                <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-6">
                    <div className="flex items-center gap-6">
                        <TemplexLogo className="h-10 w-40 justify-start" />
                        <div>
                            <h2 className="font-bold text-lg uppercase">DETALLE TÉCNICO (CORTES Y MANUFACTURA)</h2>
                            <p className="font-semibold text-slate-700">ORDEN N°: <span className="font-black text-red-600 ml-1">{odp.numero_odp}</span></p>
                        </div>
                    </div>
                </div>

                <div className="mb-2 uppercase text-xs font-bold bg-slate-100 p-2 border border-black grid grid-cols-2">
                    <div>
                        CLIENTE: <span className="font-normal">{odp.cliente?.nombre_razon_social}</span>
                    </div>
                    <div>
                        FECHA: <span className="font-normal">{odp.fecha_creacion ? new Date(odp.fecha_creacion).toLocaleDateString() : ''}</span>
                    </div>
                </div>

                {/* ITEMS TABLE */}
                <div className="mb-6">
                    <table className="excel-table text-xs text-center">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="py-2 px-1 w-8">ITEM</th>
                                <th className="py-2 px-1 w-10">CANT</th>
                                <th className="py-2 px-1">TIPO VIDRIO</th>
                                <th className="py-2 px-1 w-12">ESP.</th>
                                <th className="py-2 px-1 w-16">ANCHO</th>
                                <th className="py-2 px-1 w-16">ALTO</th>
                                <th className="py-2 px-1">PULIDOS / ACABADOS</th>
                                <th className="py-2 px-1 w-10">PERF</th>
                                <th className="py-2 px-1 w-10">BOQ</th>
                                <th className="py-2 px-1">OTROS / DETALLES</th>
                            </tr>
                        </thead>
                        <tbody>
                            {odp.items?.map((item: any, idx: number) => (
                                <tr key={idx}>
                                    <td className="py-2 px-1 font-bold">{idx + 1}</td>
                                    <td className="py-2 px-1 font-bold text-lg">{item.cantidad}</td>
                                    <td className="py-2 px-1 font-semibold uppercase">{item.tipo_vidrio}</td>
                                    <td className="py-2 px-1 font-bold">{item.espesor || ''}</td>
                                    <td className="py-2 px-1 font-bold">{item.ancho_mm || ''}</td>
                                    <td className="py-2 px-1 font-bold">{item.alto_mm || ''}</td>
                                    <td className="py-2 px-1 text-left uppercase text-[10px] leading-tight font-medium">{item.pulidos || '-'}</td>
                                    <td className="py-2 px-1 font-bold text-red-600 text-sm">{item.perforaciones > 0 ? item.perforaciones : '-'}</td>
                                    <td className="py-2 px-1 font-bold text-red-600 text-sm">{item.boquetes > 0 ? item.boquetes : '-'}</td>
                                    <td className="py-2 px-1 text-left text-[10px] uppercase">
                                        {item.descuentos && <p className="mb-0.5"><span className="font-bold">DESC:</span> {item.descuentos}</p>}
                                        {item.otros && <p><span className="font-bold">OTR:</span> {item.otros}</p>}
                                    </td>
                                </tr>
                            ))}
                            {(!odp.items || odp.items.length === 0) && (
                                <tr>
                                    <td colSpan={10} className="text-gray-400 py-8 italic uppercase text-sm">NO HAY ÍTEMS REGISTRADOS EN LA MODALIDAD TÉCNICA</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    <p className="text-[10px] font-bold mt-1 text-right italic uppercase">
                        * P/B: PULIDO Y BRILLADO | PC: PULIDO CORRIDO | RAD: RADIAR | CHA: CHAFLÁN
                    </p>
                </div>

                {/* CROQUIS */}
                {odp.croquis_url && (
                    <div className="border border-black p-4 mt-8 flex flex-col items-center">
                        <p className="font-bold text-sm tracking-widest uppercase mb-4 border-b border-black w-full text-center pb-2">CROQUIS ADJUNTO</p>
                        <img src={odp.croquis_url} className="max-w-[15cm] max-h-[12cm] object-contain" alt="Croquis" />
                    </div>
                )}
            </div>
        </div>
    );
};

export default PrintableDetalleTecnico;
