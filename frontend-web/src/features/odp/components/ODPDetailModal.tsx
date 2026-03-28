import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, FileText, Settings, PenTool, Download, CheckCircle, Package, UserCircle, Calculator, Image as ImageIcon, Printer } from 'lucide-react';
import { format } from 'date-fns';
import PrintableTalonario from './PrintableTalonario';
import PrintableProduccion from './PrintableProduccion';
import PrintableDetalleTecnico from './PrintableDetalleTecnico';
interface ODPDetailModalProps {
    odp: any;
    onClose: () => void;
}

const ODPDetailModal: React.FC<ODPDetailModalProps> = ({ odp, onClose }) => {
    const [activeTab, setActiveTab] = useState<'admin' | 'produccion' | 'lienzo'>('produccion');

    if (!odp) return null;

    const handlePrint = () => {
        const printArea = document.getElementById('odp-print-area');
        if (!printArea) return;
        const win = window.open('', '_blank', 'width=900,height=700');
        if (!win) return;
        win.document.write(`<!DOCTYPE html><html><head>
            <meta charset="utf-8"/>
            <title>Impresión ODP</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                @page { size: letter portrait; margin: 4mm; }
                body { margin: 0; padding: 0; font-family: sans-serif; }
                .excel-table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
                .excel-table th, .excel-table td { border: 1px solid #000; padding: 2px 4px; }
                .excel-table th { font-weight: bold; text-align: center; }
                .thick-b { border-bottom: 2px solid #000 !important; }
            </style>
        </head><body>${printArea.innerHTML}</body></html>`);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); win.close(); }, 800);
    };

    return (
        <>
            <div id="modal-root" className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="bg-white w-full max-w-5xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                >
                    {/* Header */}
                    <div className="bg-slate-900 px-6 py-4 flex justify-between items-center shrink-0 print-hidden">
                        <div className="flex items-center gap-4">
                            <div className="bg-blue-600/20 p-2 rounded-lg">
                                <FileText className="w-6 h-6 text-blue-400" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    Formato Matriz: {odp.numero_odp}
                                </h2>
                                <p className="text-slate-400 text-sm font-medium">Visualización de Control y Talonario - Vidrios Templex</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 print-hidden">
                            <button
                                onClick={handlePrint}
                                className="mr-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg flex items-center gap-2 transition shadow-lg shadow-blue-500/30"
                            >
                                <Printer className="w-4 h-4" />
                                Imprimir Talonario
                            </button>
                            <button onClick={onClose} className="w-8 h-8 flex justify-center items-center rounded-full bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="bg-slate-50 border-b border-slate-200 px-6 flex gap-1 shrink-0 print-hidden">
                        <button
                            onClick={() => setActiveTab('produccion')}
                            className={`px-4 py-3 text-sm font-bold border-b-2 transition flex items-center gap-2 ${activeTab === 'produccion' ? 'border-blue-600 text-blue-700 bg-blue-50/50' : 'border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
                        >
                            <Settings className="w-4 h-4" /> Hoja de Producción (Taller)
                        </button>
                        <button
                            onClick={() => setActiveTab('admin')}
                            className={`px-4 py-3 text-sm font-bold border-b-2 transition flex items-center gap-2 ${activeTab === 'admin' ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50' : 'border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
                        >
                            <Calculator className="w-4 h-4" /> Cliente / Área Contable
                        </button>
                        <button
                            onClick={() => setActiveTab('lienzo')}
                            className={`px-4 py-3 text-sm font-bold border-b-2 transition flex items-center gap-2 ${activeTab === 'lienzo' ? 'border-purple-600 text-purple-700 bg-purple-50/50' : 'border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
                        >
                            <PenTool className="w-4 h-4" /> Detalle Técnico (Lienzo / Diseño)
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto bg-slate-100/50 p-6 relative">

                        {/* VISTA EN PANTALLA */}
                        <div className="print-hidden h-full">
                            {/* -- TAB 1: PRODUCCION -- */}
                            {activeTab === 'produccion' && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                            <Package className="w-5 h-5 text-blue-600" />
                                            Listado de Materiales a Fabrícate / Cortar
                                        </h3>
                                        <div className="bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm font-bold text-sm text-slate-700 flex items-center gap-2">
                                            Estado Actual:
                                            <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{odp.estado_produccion?.replace(/_/g, ' ')}</span>
                                        </div>
                                    </div>

                                    <div className="bg-white border text-center border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                        <table className="w-full text-left">
                                            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-bold">
                                                <tr>
                                                    <th className="px-4 py-3 border-r">Ítem</th>
                                                    <th className="px-4 py-3 border-r">Tipo Cristal / Alum.</th>
                                                    <th className="px-4 py-3 border-r text-center">Esp. (mm)</th>
                                                    <th className="px-4 py-3 border-r text-center">Ancho</th>
                                                    <th className="px-4 py-3 border-r text-center">Alto</th>
                                                    <th className="px-4 py-3 border-r text-center">Cant.</th>
                                                    <th className="px-4 py-3 text-center w-1/4">Procesos (Templado, Bisel, etc)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {odp.items?.map((item: any, i: number) => (
                                                    <tr key={i} className="hover:bg-blue-50/30 transition">
                                                        <td className="px-4 py-3 border-r text-slate-400 font-bold text-center">#{i + 1}</td>
                                                        <td className="px-4 py-3 border-r text-slate-800 font-medium">{item.tipo_vidrio || '-'}</td>
                                                        <td className="px-4 py-3 border-r text-center font-mono text-slate-600">{item.espesor || '-'}</td>
                                                        <td className="px-4 py-3 border-r text-center font-mono text-slate-600">{item.ancho || '-'}</td>
                                                        <td className="px-4 py-3 border-r text-center font-mono text-slate-600">{item.alto || '-'}</td>
                                                        <td className="px-4 py-3 border-r text-center font-bold text-blue-600">{item.cantidad || '-'}</td>
                                                        <td className="px-4 py-3 text-center text-xs text-slate-500 uppercase">{item.procesos || 'Ninguno'}</td>
                                                    </tr>
                                                ))}
                                                {(!odp.items || odp.items.length === 0) && (
                                                    <tr>
                                                        <td colSpan={7} className="px-4 py-8 text-center text-slate-500">No hay ítems registrados en esta orden.</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* -- TAB 2: CLIENTE / AREA CONTABLE -- */}
                            {activeTab === 'admin' && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* Datos del Cliente y Asesor */}
                                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                                            <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
                                                <UserCircle className="w-5 h-5 text-emerald-600" />
                                                Datos Generales
                                            </h3>
                                            <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-sm">
                                                <div>
                                                    <p className="text-slate-500 text-xs font-bold uppercase mb-1">Cliente</p>
                                                    <p className="text-slate-800 font-medium">{odp.cliente?.nombre_razon_social || 'N/A'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-slate-500 text-xs font-bold uppercase mb-1">Asesor Venta</p>
                                                    <p className="text-slate-800 font-medium">{odp.asesor?.nombre_completo || 'N/A'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-slate-500 text-xs font-bold uppercase mb-1">Fecha Emisión</p>
                                                    <p className="font-mono text-slate-600">{odp.fecha_creacion ? format(new Date(odp.fecha_creacion), 'dd/MM/yyyy HH:mm') : 'N/A'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-slate-500 text-xs font-bold uppercase mb-1">Autorización Especial</p>
                                                    <p className="font-medium text-amber-600">{odp.autorizacion_especial_despacho ? 'SÍ APLICADA' : 'NO'}</p>
                                                </div>
                                            </div>
                                            {odp.observacion_autorizacion && (
                                                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-xs">
                                                    <span className="font-bold text-amber-800">Nota Jefe Producción: </span>
                                                    <span className="text-amber-700">{odp.observacion_autorizacion}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Area Contable */}
                                        <div className="bg-emerald-50/50 p-5 rounded-xl border border-emerald-200 shadow-sm">
                                            <h3 className="font-bold text-emerald-800 border-b border-emerald-200 pb-2 mb-4 flex items-center gap-2">
                                                <Calculator className="w-5 h-5" />
                                                Talonario Contable y Financiero
                                            </h3>

                                            <div className="space-y-4 mb-6">
                                                <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                                                    <span className="text-sm font-bold text-slate-500 uppercase">Estado Facturación</span>
                                                    <span className="text-xs font-bold px-3 py-1 bg-slate-100 text-slate-700 rounded-full border border-slate-300">
                                                        {odp.estado_facturacion?.replace(/_/g, ' ')}
                                                    </span>
                                                </div>

                                                <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-emerald-200 shadow-sm group hover:border-emerald-400 transition">
                                                    <span className="text-sm font-bold text-emerald-700 uppercase">Estado Caja (Cobro)</span>
                                                    <span className={`text-xs font-bold px-3 py-1 rounded-full border ${odp.estado_caja === 'CANCELADO' || odp.estado_caja === 'CREDITO_APROBADO' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-rose-100 text-rose-800 border-rose-200'}`}>
                                                        {odp.estado_caja?.replace(/_/g, ' ')}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="bg-white rounded-lg border-2 border-emerald-100 p-4 relative overflow-hidden">
                                                <div className="absolute opacity-5 -right-6 -bottom-6">
                                                    <Calculator className="w-32 h-32 text-emerald-800" />
                                                </div>
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-sm font-medium text-slate-500">Anticipo / Abono Inicial</span>
                                                    <span className="font-mono font-bold text-slate-700 text-lg">${Number(odp.abono || 0).toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between items-center mt-2 pt-2 border-t border-dashed border-emerald-200">
                                                    <span className="text-sm font-bold text-emerald-800">Saldo Pendiente</span>
                                                    <span className="font-mono font-black text-rose-600 text-xl">${Number(odp.pendiente || 0).toFixed(2)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* -- TAB 3: LIENZO -- */}
                            {activeTab === 'lienzo' && (
                                <div className="h-full min-h-[400px] flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4 shrink-0">
                                        <PenTool className="w-5 h-5 text-purple-600" />
                                        Diseño Estructural del Pedido (Croquis)
                                    </h3>

                                    {odp.croquis_url ? (
                                        <div className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-inner flex flex-col items-center justify-center relative group">
                                            <img
                                                src={odp.croquis_url}
                                                alt="Croquis"
                                                className="w-full h-full object-contain max-h-[500px]"
                                            />
                                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/80 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <div className="flex justify-center gap-4">
                                                    <button className="px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/50 text-white rounded-lg flex items-center gap-2 text-sm font-bold transition">
                                                        <Download className="w-4 h-4" /> Descargar Diseño
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex-1 bg-white border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center p-8 text-center hover:bg-purple-50 hover:border-purple-300 transition group cursor-pointer">
                                            <div className="w-20 h-20 bg-purple-100 text-purple-500 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                                <ImageIcon className="w-10 h-10" />
                                            </div>
                                            <h4 className="text-xl font-bold text-slate-800 mb-2">No se ha adjuntado ningún diseño</h4>
                                            <p className="text-slate-500 max-w-sm text-sm">Actualmente en Templex, la mayoría de talonarios traen el diseño a pulso y en pocas ocasiones en AutoCAD. Sube una foto de la hoja a pulso o exporta el PDF para visualizarlo aquí.</p>

                                            <button className="mt-6 px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg shadow-md hover:shadow-lg transition">
                                                Cargar / Subir Croquis
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* ÁREA DE IMPRESIÓN — fuera del modal para evitar overflow-hidden */}
            <div id="odp-print-area" style={{ display: 'none' }}>
                {activeTab === 'admin' && <PrintableTalonario odp={odp} />}
                {activeTab === 'produccion' && <PrintableProduccion odp={odp} />}
                {activeTab === 'lienzo' && <PrintableDetalleTecnico odp={odp} />}
            </div>
        </>
    );
};

export default ODPDetailModal;
