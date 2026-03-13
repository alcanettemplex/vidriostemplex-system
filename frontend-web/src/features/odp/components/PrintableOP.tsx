import React from 'react';

interface PrintableOPProps {
    odp: any;
}

const PrintableOP: React.FC<PrintableOPProps> = ({ odp }) => {
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
                {/* ENCABEZADO */}
                <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-black uppercase tracking-wider">Vidrios Templex</h1>
                        <p className="font-semibold text-gray-700 text-sm">ORDEN DE PRODUCCIÓN (TALLER / LOGÍSTICA)</p>
                        <div className="mt-2 text-sm grid grid-cols-2 gap-x-8 gap-y-2">
                            <span className="font-bold">ORDEN N°: <span className="font-normal text-red-600 text-lg">{odp.numero_odp}</span></span>
                            <span className="font-bold">FECHA: <span className="font-normal">{odp.fecha_creacion ? new Date(odp.fecha_creacion).toLocaleDateString() : ''}</span></span>
                            <span className="font-bold">CLIENTE: <span className="font-normal">{odp.cliente?.nombre_razon_social}</span></span>
                            <span className="font-bold">TIPO DE SERVICIO: <span className="font-normal">{odp.tipo_servicio}</span></span>
                        </div>
                    </div>
                    <div className="text-right border-l-2 border-black pl-4">
                        <h2 className="font-bold text-lg mb-1 uppercase">PROVEEDOR VIDRIO</h2>
                        <p className="text-xl font-black uppercase">{odp.proveedor_vidrio || '----'}</p>
                        <p className="font-bold mt-2 uppercase">PEDIDO N°:</p>
                        <p className="text-lg font-mono bg-yellow-100 px-2 py-1 inline-block mt-1 print:border print:border-black print:bg-transparent">
                            {odp.numero_pedido_proveedor || '----'}
                        </p>
                    </div>
                </div>

                {/* DESCRIPCIÓN Y OBSERVACIONES */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="border border-black p-3 min-h-[120px]">
                        <h4 className="font-bold text-sm uppercase mb-2 border-b border-gray-300 pb-1">Descripción del Pedido / Proyecto</h4>
                        <p className="text-sm whitespace-pre-wrap">{odp.descripcion_pedido}</p>
                    </div>
                    <div className="border border-black p-3 min-h-[120px]">
                        <h4 className="font-bold text-sm uppercase mb-2 border-b border-gray-300 pb-1">Observaciones Cliente / Cuidado</h4>
                        <p className="text-sm text-red-700 font-semibold whitespace-pre-wrap">{odp.observaciones || '---'}</p>
                    </div>
                </div>

                <div className="mb-6">
                    <div className="border border-black p-3">
                        <h4 className="font-bold text-sm uppercase mb-2 border-b border-gray-300 pb-1">Entrega Solicitada - Dirección / Notas</h4>
                        <p className="text-sm uppercase font-semibold">{odp.direccion_instalacion || '-- Misma del Cliente --'}</p>
                    </div>
                </div>

                {/* GRID INFERIOR ESTILO EXCEL */}
                <div className="grid grid-cols-[1fr,1.5fr] gap-6 mt-12">
                    <table className="w-full border-collapse border-2 border-black text-sm">
                        <tbody>
                            <tr>
                                <td className="border border-black p-2 font-bold uppercase">MATIZADO</td>
                                <td className="border border-black p-2 text-center font-bold text-xl">{odp.matizado ? 'X' : ''}</td>
                                <td className="border border-black p-2 font-bold uppercase">PELÍCULA</td>
                                <td className="border border-black p-2 text-center font-bold text-xl">{odp.pelicula ? 'X' : ''}</td>
                            </tr>
                            <tr>
                                <td className="border border-black p-2 font-bold uppercase">ACARREO</td>
                                <td className="border border-black p-2 text-center font-bold text-xl">{odp.acarreo ? 'X' : ''}</td>
                                <td className="border border-black p-2 font-bold uppercase">HUACAL</td>
                                <td className="border border-black p-2 text-center font-bold text-xl">{odp.huacal ? 'X' : ''}</td>
                            </tr>
                            <tr>
                                <td className="border border-black p-2 font-bold uppercase">INSTALACIÓN</td>
                                <td className="border border-black p-2 text-center font-bold text-xl">{odp.instalacion ? 'X' : ''}</td>
                                <td className="border border-black p-2 font-bold uppercase">CARTÓN</td>
                                <td className="border border-black p-2 text-center font-bold text-xl">{odp.carton ? 'X' : ''}</td>
                            </tr>
                        </tbody>
                    </table>

                    <table className="w-full border-collapse border-2 border-black text-sm text-center">
                        <tbody>
                            <tr>
                                <td className="border border-black p-2 font-bold align-middle w-1/3 uppercase bg-slate-50" rowSpan={3}>
                                    PEDIDO EXTERNO<br /><span className="text-[10px] font-normal italic capitalize">Registro Llegada</span>
                                </td>
                                <td className="border border-black p-2 font-bold bg-gray-100 uppercase">RECEPCIÓN</td>
                                <td className="border border-black p-2 w-1/4"></td>
                                <td className="border border-black p-2 font-bold bg-gray-100 uppercase">ODC Ref</td>
                                <td className="border border-black p-2 w-1/4"></td>
                            </tr>
                            <tr>
                                <td className="border border-black p-2 font-bold bg-gray-100 uppercase">GUÍA / LOTE</td>
                                <td className="border border-black p-2"></td>
                                <td className="border border-black p-2 font-bold bg-gray-100 uppercase">CONFIRMÓ</td>
                                <td className="border border-black p-2"></td>
                            </tr>
                            <tr>
                                <td className="border border-black p-2 font-bold bg-gray-100 uppercase">TM / NOTA</td>
                                <td className="border border-black p-2"></td>
                                <td className="border border-black p-2 font-bold bg-gray-100 uppercase">FECHA</td>
                                <td className="border border-black p-2"></td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="mt-16 pt-8 border-t border-dashed border-gray-400 text-center text-gray-500 font-bold tracking-widest uppercase">
                    SECCIÓN EXCLUSIVA PARA PRODUCCIÓN Y DESPACHO
                </div>
            </div>
        </div>
    );
};

export default PrintableOP;
