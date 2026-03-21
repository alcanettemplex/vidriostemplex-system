import React from 'react';
import { motion } from 'framer-motion';
import { X, Printer, FileText } from 'lucide-react';

interface ODPMatrixModalProps {
    odp: any;
    onClose: () => void;
}

const ODPMatrixModal: React.FC<ODPMatrixModalProps> = ({ odp, onClose }) => {
    if (!odp) return null;

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
            >
                {/* Header Normal */}
                <div className="flex justify-between items-center p-6 border-b border-slate-100 print:hidden dark:bg-white">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                        <FileText className="w-5 h-5 text-blue-600" />
                        Formato Matriz de Taller - {odp.numero_odp}
                    </h2>
                    <div className="flex gap-2">
                        <button
                            onClick={handlePrint}
                            className="p-2 bg-blue-50 text-blue-600 rounded flex items-center gap-2 hover:bg-blue-100 transition font-medium"
                        >
                            <Printer className="w-4 h-4" /> IMPRIMIR
                        </button>
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded bg-slate-50">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Área a Imprimir */}
                <div className="p-8 overflow-y-auto bg-white flex-1 text-black print:p-0 print:overflow-visible text-sm" id="printable-area">
                    {/* ENCABEZADO FORMATO */}
                    <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-6">
                        <div>
                            <h1 className="text-2xl font-black uppercase tracking-wider">Vidrios Templex</h1>
                            <p className="font-semibold text-gray-700">ORDEN DE PRODUCCIÓN (TALLER)</p>
                            <div className="mt-2 text-sm grid grid-cols-2 gap-x-8 gap-y-1">
                                <span className="font-bold">ORDEN N°: <span className="font-normal text-red-600 text-base">{odp.numero_odp}</span></span>
                                <span className="font-bold">FECHA: <span className="font-normal">{new Date(odp.fecha_creacion).toLocaleDateString()}</span></span>
                                <span className="font-bold">CLIENTE: <span className="font-normal">{odp.cliente?.nombre_razon_social}</span></span>
                                <span className="font-bold">TIPO DE SERVICIO: <span className="font-normal">{odp.tipo_servicio}</span></span>
                            </div>
                        </div>
                        <div className="text-right border-l-2 border-black pl-4">
                            <h2 className="font-bold text-lg mb-1">PROVEEDOR VIDRIO</h2>
                            <p className="text-xl font-black">{odp.proveedor_vidrio || 'N/A'}</p>
                            <p className="font-bold mt-2">PEDIDO N°:</p>
                            <p className="text-lg font-mono bg-yellow-100 px-2 py-1 inline-block mt-1 print:border print:border-black print:bg-transparent">{odp.numero_pedido_proveedor || 'N/A'}</p>
                        </div>
                    </div>

                    {/* ITEMS TABLE */}
                    <div className="mb-6">
                        <h3 className="font-bold bg-black text-white px-2 py-1 mb-2">DETALLE DE CRISTALES / ÍTEMS</h3>
                        <table className="w-full border-collapse border border-black text-xs text-center">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th className="border border-black py-1 px-1 w-8">ITEM</th>
                                    <th className="border border-black py-1 px-1">CANT</th>
                                    <th className="border border-black py-1 px-1">TIPO VIDRIO</th>
                                    <th className="border border-black py-1 px-1 w-12">ESP.</th>
                                    <th className="border border-black py-1 px-1">ANCHO</th>
                                    <th className="border border-black py-1 px-1">ALTO</th>
                                    <th className="border border-black py-1 px-1">PULIDOS/ACABADOS</th>
                                    <th className="border border-black py-1 px-1">PERF</th>
                                    <th className="border border-black py-1 px-1">BOQ</th>
                                    <th className="border border-black py-1 px-1">DESCUENTOS / OTROS</th>
                                </tr>
                            </thead>
                            <tbody>
                                {odp.items?.map((item: any, idx: number) => (
                                    <tr key={idx}>
                                        <td className="border border-black py-1.5 px-1 font-bold">{idx + 1}</td>
                                        <td className="border border-black py-1.5 px-1 font-bold text-base">{item.cantidad}</td>
                                        <td className="border border-black py-1.5 px-1">{item.tipo_vidrio}</td>
                                        <td className="border border-black py-1.5 px-1 font-bold">{item.espesor}mm</td>
                                        <td className="border border-black py-1.5 px-1">{item.ancho_mm}</td>
                                        <td className="border border-black py-1.5 px-1">{item.alto_mm}</td>
                                        <td className="border border-black py-1.5 px-1 text-left line-clamp-2">{item.pulidos || '-'}</td>
                                        <td className="border border-black py-1.5 px-1 font-bold text-red-600">{item.perforaciones > 0 ? item.perforaciones : '-'}</td>
                                        <td className="border border-black py-1.5 px-1 font-bold text-red-600">{item.boquetes > 0 ? item.boquetes : '-'}</td>
                                        <td className="border border-black py-1.5 px-1 text-left">
                                            {item.descuentos && <span className="block mb-0.5"><span className="font-semibold">Des:</span> {item.descuentos}</span>}
                                            {item.otros && <span><span className="font-semibold">Otr:</span> {item.otros}</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <p className="text-[10px] font-bold mt-1 text-right italic">
                            *P/B: Pulido y Brillado | PC: Pulido Corrido | RAD: Radiar | CHA: Chaflán
                        </p>
                    </div>

                    {/* DETAILS SECTIONS */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="border border-black p-2 min-h-[80px]">
                            <h4 className="font-bold text-xs uppercase mb-1 border-b border-gray-300 pb-1">Descripción del Pedido / Proyecto</h4>
                            <p className="text-xs whitespace-pre-wrap">{odp.descripcion_pedido}</p>
                        </div>
                        <div className="border border-black p-2 min-h-[80px]">
                            <h4 className="font-bold text-xs uppercase mb-1 border-b border-gray-300 pb-1">Observaciones Cliente / Cuidado</h4>
                            <p className="text-xs text-red-700 font-semibold whitespace-pre-wrap">{odp.observaciones || 'Sin observaciones'}</p>
                        </div>
                    </div>

                    <div className="mb-6">
                        <div className="border border-black p-2">
                            <h4 className="font-bold text-xs uppercase mb-1 border-b border-gray-300 pb-1">Entrega Solicitada - Dirección / Notas</h4>
                            <p className="text-xs">{odp.direccion_instalacion || '-- Misma del Cliente --'}</p>
                        </div>
                    </div>

                    {/* BOTTOm GRID LIKE EXCEL */}
                    <div className="grid grid-cols-[1fr,1.5fr] gap-4">
                        {/* Requirements */}
                        <table className="w-full border-collapse border border-black text-xs">
                            <tbody>
                                <tr>
                                    <td className="border border-black p-1 font-bold">MATIZADO</td>
                                    <td className="border border-black p-1 text-center font-bold text-lg">{odp.matizado ? 'X' : ''}</td>
                                    <td className="border border-black p-1 font-bold">PELÍCULA</td>
                                    <td className="border border-black p-1 text-center font-bold text-lg">{odp.pelicula ? 'X' : ''}</td>
                                </tr>
                                <tr>
                                    <td className="border border-black p-1 font-bold">ACARREO</td>
                                    <td className="border border-black p-1 text-center font-bold text-lg">{odp.acarreo ? 'X' : ''}</td>
                                    <td className="border border-black p-1 font-bold">HUACAL</td>
                                    <td className="border border-black p-1 text-center font-bold text-lg">{odp.huacal ? 'X' : ''}</td>
                                </tr>
                                <tr>
                                    <td className="border border-black p-1 font-bold">INSTALACIÓN</td>
                                    <td className="border border-black p-1 text-center font-bold text-lg">{odp.instalacion ? 'X' : ''}</td>
                                    <td className="border border-black p-1 font-bold">CARTÓN</td>
                                    <td className="border border-black p-1 text-center font-bold text-lg">{odp.carton ? 'X' : ''}</td>
                                </tr>
                            </tbody>
                        </table>

                        {/* Pedido Externo Log */}
                        <table className="w-full border-collapse border border-black text-xs text-center">
                            <tbody>
                                <tr>
                                    <td className="border border-black p-1 font-bold align-middle w-1/3" rowSpan={3}>PEDIDO EXTERNO<br /><span className="text-[10px] font-normal italic">Registro Llegada</span></td>
                                    <td className="border border-black p-1.5 font-bold bg-gray-100">RECEPCIÓN</td>
                                    <td className="border border-black p-1.5 w-1/4"></td>
                                    <td className="border border-black p-1.5 font-bold bg-gray-100">ODC Ref</td>
                                    <td className="border border-black p-1.5 w-1/4"></td>
                                </tr>
                                <tr>
                                    <td className="border border-black p-1.5 font-bold bg-gray-100">GUÍA / LOTE</td>
                                    <td className="border border-black p-1.5"></td>
                                    <td className="border border-black p-1.5 font-bold bg-gray-100">CONFIRMÓ</td>
                                    <td className="border border-black p-1.5"></td>
                                </tr>
                                <tr>
                                    <td className="border border-black p-1.5 font-bold bg-gray-100">TM / NOTA</td>
                                    <td className="border border-black p-1.5"></td>
                                    <td className="border border-black p-1.5 font-bold bg-gray-100">FECHA</td>
                                    <td className="border border-black p-1.5"></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Bitácora de Notas (Print only if there are notes) */}
                    <div className="mt-6">
                        <h3 className="font-bold bg-black text-white px-2 py-1 mb-2">BITÁCORA DE PRODUCCIÓN / NOTAS TÉCNICAS</h3>
                        <div className="border border-black min-h-[60px] p-2 space-y-1">
                            {/* Este espacio se llena manualmente o se muestra si hay registradas */}
                            <p className="text-[10px] italic text-gray-500 mb-2">Espacio para anotaciones adicionales del taller...</p>
                            <div className="h-4 border-b border-gray-300"></div>
                            <div className="h-4 border-b border-gray-300"></div>
                            <div className="h-4 border-b border-gray-300"></div>
                        </div>
                    </div>

                </div>

                <style dangerouslySetInnerHTML={{
                    __html: `
                    @media print {
                        body * {
                            visibility: hidden;
                        }
                        #printable-area, #printable-area * {
                            visibility: visible;
                        }
                        #printable-area {
                            position: absolute;
                            left: 0;
                            top: 0;
                            width: 100%;
                            padding: 20px;
                        }
                        @page {
                            margin: 1cm;
                            size: portrait;
                        }
                    }
                `}} />

            </motion.div>
        </div>
    );
};

export default ODPMatrixModal;
