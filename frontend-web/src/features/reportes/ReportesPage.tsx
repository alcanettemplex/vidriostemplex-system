import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { motion } from 'framer-motion';
import { FileDown, Download, BarChart2, FileText, CheckCircle2, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';

interface ODP {
    id: number;
    numero_odp: string;
    estado_produccion: string;
    estado_facturacion: string;
    cliente: { nombre_razon_social: string };
    asesor: { nombre_completo: string };
    fecha_creacion: string;
}

const ReportesPage: React.FC = () => {
    const [odps, setOdps] = useState<ODP[]>([]);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState('mes'); // mes, semana, hoy

    const fetchData = async () => {
        try {
            setLoading(true);
            const token = sessionStorage.getItem('token');
            const res = await axios.get(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/odp`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setOdps(res.data);
        } catch (error) {
            console.error('Error fetching ODPs', error);
            toast.error('Error cargando datos para el reporte');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [dateFilter]);

    // Transform Data for Charts
    const chartData = [
        { name: 'Facturadas', value: odps.filter(o => o.estado_facturacion === 'FACTURADA').length, fill: '#10b981' },
        { name: 'Entregadas', value: odps.filter(o => o.estado_produccion === 'ENTREGADA').length, fill: '#3b82f6' },
        { name: 'En Producción', value: odps.filter(o => o.estado_produccion !== 'EN_ESPERA' && o.estado_produccion !== 'ENTREGADA').length, fill: '#f59e0b' },
        { name: 'En Espera', value: odps.filter(o => o.estado_produccion === 'EN_ESPERA').length, fill: '#64748b' },
    ];

    // Export to Excel
    const exportToExcel = () => {
        try {
            const dataToExport = odps.map(odp => ({
                'Número ODP': odp.numero_odp,
                'Cliente': odp.cliente?.nombre_razon_social || 'N/A',
                'Asesor': odp.asesor?.nombre_completo || 'N/A',
                'Estado Producción': odp.estado_produccion.replace(/_/g, ' '),
                'Facturación': odp.estado_facturacion.replace(/_/g, ' '),
                'Fecha Creación': format(new Date(odp.fecha_creacion), 'dd/MM/yyyy HH:mm')
            }));

            const ws = XLSX.utils.json_to_sheet(dataToExport);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Órdenes de Producción");

            XLSX.writeFile(wb, `Reporte_Vidrios_Templex_${format(new Date(), 'ddMMyyyy')}.xlsx`);
            toast.success('Reporte Excel descargado exitosamente');
        } catch (error) {
            toast.error('Fallo al generar el archivo Excel');
        }
    };

    // Export to PDF
    const exportToPDF = () => {
        try {
            const doc = new jsPDF();

            doc.setFontSize(20);
            doc.setTextColor(15, 23, 42); // slate-900
            doc.text("Reporte General de ODPs - Vidrios Templex", 14, 22);

            doc.setFontSize(11);
            doc.setTextColor(100, 116, 139); // slate-500
            doc.text(`Generado el: ${format(new Date(), 'dd/MM/yyyy HH:mm')} | Filtro: ${dateFilter.toUpperCase()}`, 14, 30);

            const tableColumn = ["ODP", "Cliente", "Asesor", "Estado", "Fecha Creación"];
            const tableRows = odps.map(odp => [
                odp.numero_odp,
                odp.cliente?.nombre_razon_social || 'N/A',
                odp.asesor?.nombre_completo || 'N/A',
                odp.estado_produccion.replace(/_/g, ' ') + ' / ' + odp.estado_facturacion.replace(/_/g, ' '),
                format(new Date(odp.fecha_creacion), 'dd/MM/yyyy')
            ]);

            (doc as any).autoTable({
                head: [tableColumn],
                body: tableRows,
                startY: 40,
                theme: 'grid',
                headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255] }, // blue-600
                styles: { fontSize: 9, cellPadding: 4 }
            });

            doc.save(`Reporte_Vidrios_Templex_${format(new Date(), 'ddMMyyyy')}.pdf`);
            toast.success('Reporte PDF descargado exitosamente');
        } catch (error) {
            console.error(error);
            toast.error('Fallo al generar el archivo PDF');
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto h-[calc(100vh-64px)] flex flex-col">
            <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Inteligencia y Reportes</h1>
                    <p className="text-slate-500 text-sm mt-1">Exporta datos de operaciones y facturación en tiempo real.</p>
                </div>

                <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner text-sm font-medium">
                    <button
                        onClick={() => setDateFilter('hoy')}
                        className={`px-4 py-2 rounded-lg transition ${dateFilter === 'hoy' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Hoy
                    </button>
                    <button
                        onClick={() => setDateFilter('semana')}
                        className={`px-4 py-2 rounded-lg transition ${dateFilter === 'semana' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Semana
                    </button>
                    <button
                        onClick={() => setDateFilter('mes')}
                        className={`px-4 py-2 rounded-lg transition ${dateFilter === 'mes' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Este Mes
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 shrink-0">
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-6 border-l-4 border-l-blue-500">
                    <div className="flex items-center gap-3 text-slate-600 mb-2">
                        <FileText className="w-5 h-5" />
                        <h3 className="font-bold">Total ODPs Emitidas</h3>
                    </div>
                    <p className="text-3xl font-black text-slate-900 font-display">{odps.length}</p>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel p-6 border-l-4 border-l-emerald-500">
                    <div className="flex items-center gap-3 text-slate-600 mb-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        <h3 className="font-bold">Cerradas/Facturadas</h3>
                    </div>
                    <p className="text-3xl font-black text-slate-900 font-display">
                        {odps.filter(o => o.estado_facturacion === 'FACTURADA' || o.estado_produccion === 'ENTREGADA').length}
                    </p>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-panel p-6 border-l-4 border-l-amber-500 bg-gradient-to-br from-white to-amber-50/30">
                    <div className="flex items-center gap-3 text-slate-600 mb-2">
                        <TrendingUp className="w-5 h-5 text-amber-500" />
                        <h3 className="font-bold">Ciclo Cerrado</h3>
                    </div>
                    <p className="text-3xl font-black text-slate-900 font-display">
                        {odps.length > 0 ? Math.round((odps.filter(o => o.estado_facturacion === 'FACTURADA' || o.estado_produccion === 'ENTREGADA').length / odps.length) * 100) : 0}%
                    </p>
                </motion.div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
                {/* Gráfico Visual */}
                <div className="lg:w-2/3 glass-panel p-6 flex flex-col h-full">
                    <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2 shrink-0">
                        <BarChart2 className="w-5 h-5 text-indigo-500" />
                        Distribución de Estado ({dateFilter.toUpperCase()})
                    </h2>
                    <div className="flex-1 w-full min-h-[250px] relative">
                        {loading ? (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        cursor={{ fill: '#f8fafc' }}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={60} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Panel de Exportaciones */}
                <div className="lg:w-1/3 glass-panel p-6 flex flex-col shrink-0">
                    <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                        <Download className="w-5 h-5 text-blue-500" />
                        Centro de Exportación
                    </h2>

                    <p className="text-sm text-slate-500 mb-6">
                        Descarga los reportes en bruto para uso contable o envía el concentrado PDF a jefatura. Resultará en base a las {odps.length} órdenes que pasaron el filtro de {dateFilter}.
                    </p>

                    <div className="space-y-4 mt-auto">
                        <button
                            onClick={exportToExcel}
                            className="w-full relative overflow-hidden group bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold p-4 rounded-xl flex items-center justify-between transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-emerald-600 text-white flex items-center justify-center rounded-lg shadow-inner group-hover:scale-110 transition-transform">
                                    <FileDown className="w-5 h-5" />
                                </div>
                                <div className="text-left">
                                    <p className="text-sm">Hoja Calculada</p>
                                    <p className="text-xs font-medium opacity-80">Exportar a .XLSX</p>
                                </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-emerald-400 group-hover:translate-x-1 transition-transform" />
                        </button>

                        <button
                            onClick={exportToPDF}
                            className="w-full relative overflow-hidden group bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 font-bold p-4 rounded-xl flex items-center justify-between transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-rose-600 text-white flex items-center justify-center rounded-lg shadow-inner group-hover:scale-110 transition-transform">
                                    <FileText className="w-5 h-5" />
                                </div>
                                <div className="text-left">
                                    <p className="text-sm">Documento Ejecutivo</p>
                                    <p className="text-xs font-medium opacity-80">Exportar a .PDF</p>
                                </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-rose-400 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Componente genérico embebido localmente para no romper si no hay otro archivo ChevronRight
const ChevronRight = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="9 18 15 12 9 6"></polyline></svg>;

export default ReportesPage;
