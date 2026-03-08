import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'react-toastify';
import { Settings, CheckCircle2, Package, Clock, QrCode, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ODPMatrixModal from './components/ODPMatrixModal';

interface ODP {
    id: number;
    numero_odp: string;
    estado_produccion: string;
    cliente: { nombre_razon_social: string };
    items: any[];
}

const COLUMNS = [
    { id: 'EN_ESPERA', title: 'En Espera', icon: <Clock className="w-5 h-5 text-slate-500" />, color: 'bg-slate-100', border: 'border-slate-300' },
    { id: 'MEDICION', title: 'Medición', icon: <Settings className="w-5 h-5 text-blue-500" />, color: 'bg-blue-50', border: 'border-blue-300' },
    { id: 'PEDIDO_PROVEEDOR', title: 'Proveedor', icon: <Package className="w-5 h-5 text-purple-500" />, color: 'bg-purple-50', border: 'border-purple-300' },
    { id: 'ALUMINIO_CORTADO', title: 'Alum. Cortado', icon: <Settings className="w-5 h-5 text-indigo-500" />, color: 'bg-indigo-50', border: 'border-indigo-300' },
    { id: 'VIDRIO_RECIBIDO', title: 'Vidrio', icon: <Package className="w-5 h-5 text-sky-500" />, color: 'bg-sky-50', border: 'border-sky-300' },
    { id: 'ACCESORIOS_SEPARADOS', title: 'Accesorios', icon: <Package className="w-5 h-5 text-teal-500" />, color: 'bg-teal-50', border: 'border-teal-300' },
    { id: 'LISTO_INSTALAR', title: 'Listo Instalar', icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />, color: 'bg-emerald-50', border: 'border-emerald-300' }
];

const ProduccionPage: React.FC = () => {
    const [odps, setOdps] = useState<{ [key: string]: ODP[] }>({
        'EN_ESPERA': [], 'MEDICION': [], 'PEDIDO_PROVEEDOR': [],
        'ALUMINIO_CORTADO': [], 'VIDRIO_RECIBIDO': [],
        'ACCESORIOS_SEPARADOS': [], 'LISTO_INSTALAR': []
    });
    const [selectedQR, setSelectedQR] = useState<string | null>(null);
    const [selectedODPDetail, setSelectedODPDetail] = useState<ODP | null>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/odp`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            // Filtrar y organizar por estado
            const data: ODP[] = res.data;

            const grouped: any = {
                'EN_ESPERA': data.filter(o => o.estado_produccion === 'EN_ESPERA'),
                'MEDICION': data.filter(o => o.estado_produccion === 'MEDICION'),
                'PEDIDO_PROVEEDOR': data.filter(o => o.estado_produccion === 'PEDIDO_PROVEEDOR'),
                'ALUMINIO_CORTADO': data.filter(o => o.estado_produccion === 'ALUMINIO_CORTADO'),
                'VIDRIO_RECIBIDO': data.filter(o => o.estado_produccion === 'VIDRIO_RECIBIDO'),
                'ACCESORIOS_SEPARADOS': data.filter(o => o.estado_produccion === 'ACCESORIOS_SEPARADOS'),
                'LISTO_INSTALAR': data.filter(o => o.estado_produccion === 'LISTO_INSTALAR')
            };

            // Fallback para testing si no hay data
            if (data.length === 0) {
                grouped['EN_ESPERA'] = [
                    { id: 101, numero_odp: 'ODP-2026-0101', estado_produccion: 'EN_ESPERA', cliente: { nombre_razon_social: 'Vidrios San Juan' }, items: [{}, {}] }
                ];
                grouped['ALUMINIO_CORTADO'] = [
                    { id: 102, numero_odp: 'ODP-2026-0102', estado_produccion: 'ALUMINIO_CORTADO', cliente: { nombre_razon_social: 'Constructora Atlas' }, items: [{}] }
                ];
            }

            setOdps(grouped);
        } catch (error: any) {
            console.error('Error fetching ODPs', error);
            const errMsg = error.response?.data?.error || error.message || 'Error desconocido';
            toast.error(`Error: No se pudo cargar el tablero (${errMsg})`);
        }
    };

    const onDragEnd = async (result: DropResult) => {
        const { source, destination, draggableId } = result;

        // Fuera de área válida
        if (!destination) return;

        // Mismo lugar
        if (source.droppableId === destination.droppableId && source.index === destination.index) return;

        const sourceCol = odps[source.droppableId];
        const destCol = odps[destination.droppableId];
        const sourceClone = Array.from(sourceCol);
        const destClone = Array.from(destCol);

        const [removed] = sourceClone.splice(source.index, 1);

        // Optimistic UI Update
        if (source.droppableId === destination.droppableId) {
            sourceClone.splice(destination.index, 0, removed);
            setOdps({ ...odps, [source.droppableId]: sourceClone });
        } else {
            destClone.splice(destination.index, 0, removed);
            removed.estado_produccion = destination.droppableId; // Cambiar estado internamente

            setOdps({
                ...odps,
                [source.droppableId]: sourceClone,
                [destination.droppableId]: destClone
            });

            // API Call
            try {
                const token = localStorage.getItem('token');
                await axios.put(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/odp/${draggableId}`,
                    { estado_produccion: destination.droppableId },
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                toast.success(`Movido a ${COLUMNS.find(c => c.id === destination.droppableId)?.title}`);
            } catch (error) {
                toast.error('Error al actualizar estado en servidor');
                fetchData(); // Restaurar estado previo ante error
            }
        }
    };

    return (
        <div className="p-6 h-[calc(100vh-64px)] overflow-hidden flex flex-col">
            <div className="mb-6 flex justify-between items-center shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Control de Producción</h1>
                    <p className="text-slate-500 text-sm mt-1">Kanban de Planta: Mueve las ODPs de Pendiente a Preparada</p>
                </div>
            </div>

            <DragDropContext onDragEnd={onDragEnd}>
                <div className="flex gap-6 overflow-x-auto pb-4 h-full">
                    {COLUMNS.map((column) => (
                        <div key={column.id} className="flex-shrink-0 w-80 md:w-96 flex flex-col glass-panel overflow-hidden border border-slate-200">
                            <div className={`px-4 py-3 border-b border-white/50 flex items-center gap-2 font-bold text-slate-700 ${column.color}`}>
                                {column.icon}
                                {column.title}
                                <span className="ml-auto bg-white/60 text-xs px-2 py-1 rounded shadow-sm">
                                    {odps[column.id]?.length || 0}
                                </span>
                            </div>

                            <Droppable droppableId={column.id}>
                                {(provided, snapshot) => (
                                    <div
                                        {...provided.droppableProps}
                                        ref={provided.innerRef}
                                        className={`flex-1 p-3 overflow-y-auto transition-colors ${snapshot.isDraggingOver ? 'bg-slate-50/80 rounded-xl' : ''}`}
                                    >
                                        {odps[column.id]?.map((odp, index) => (
                                            <Draggable key={odp.id.toString()} draggableId={odp.id.toString()} index={index}>
                                                {(provided, snapshot) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        {...provided.dragHandleProps}
                                                        className={`mb-3 p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow select-none group relative ${snapshot.isDragging ? 'rotate-2 scale-105 shadow-xl border-blue-400 z-50' : ''}`}
                                                    >
                                                        <div className="flex justify-between items-start mb-2">
                                                            <span className="text-sm font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                                                                {odp.numero_odp}
                                                            </span>
                                                            <div className="flex gap-2">
                                                                <button
                                                                    onClick={() => setSelectedODPDetail(odp)}
                                                                    className="text-slate-300 hover:text-blue-600 transition"
                                                                    title="Ver Formato Matriz / Pedido"
                                                                >
                                                                    <FileText className="w-5 h-5" />
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        setSelectedQR(odp.numero_odp);
                                                                        setSelectedODPDetail(odp);
                                                                    }}
                                                                    className="text-slate-300 hover:text-indigo-600 transition"
                                                                    title="Ver Código QR"
                                                                >
                                                                    <QrCode className="w-5 h-5" />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        <h3 className="font-bold text-slate-800 mb-1 leading-snug">
                                                            {odp.cliente?.nombre_razon_social || 'Desconocido'}
                                                        </h3>

                                                        <div className="flex items-center text-xs text-slate-500 font-medium mt-3">
                                                            <Package className="w-3.5 h-3.5 mr-1" />
                                                            {odp.items?.length || 0} Ítems a procesar
                                                        </div>

                                                        {/* Drag Indicator Overlay */}
                                                        <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-slate-50/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-r-xl pointer-events-none">
                                                            <div className="w-1.5 h-8 border-l border-r border-slate-300"></div>
                                                        </div>
                                                    </div>
                                                )}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}
                                    </div>
                                )}
                            </Droppable>
                        </div>
                    ))}
                </div>
            </DragDropContext>

            {/* QR Modal */}
            <AnimatePresence>
                {selectedQR && (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedQR(null)}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center"
                            onClick={e => e.stopPropagation()}
                        >
                            <h3 className="text-xl font-bold mb-6 text-slate-800 flex items-center gap-2">
                                <QrCode className="w-6 h-6 text-blue-600" />
                                Etiqueta Digital
                            </h3>

                            {selectedODPDetail && (
                                <div className="font-medium text-slate-800 flex items-center gap-2 mb-4 bg-slate-100 px-4 py-2 rounded-lg">
                                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                    {selectedODPDetail.cliente?.nombre_razon_social || 'Cliente sin asignar'}
                                </div>
                            )}

                            <div className="p-4 bg-white border-2 border-slate-100 rounded-xl shadow-inner mb-4">
                                <QRCodeSVG value={selectedQR} size={200} level="H" includeMargin={false} />
                            </div>

                            <p className="text-lg font-mono font-bold text-slate-600 tracking-wider bg-slate-100 px-4 py-1.5 rounded-lg w-full text-center">
                                {selectedQR}
                            </p>

                            <p className="text-xs text-slate-400 mt-4 text-center max-w-[200px]">
                                Escanea este código en terminales de planta para registrar trazabilidad.
                            </p>

                            <button
                                onClick={() => setSelectedQR(null)}
                                className="mt-6 px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition w-full"
                            >
                                Cerrar
                            </button>
                        </motion.div>
                    </div>
                )}

                {!selectedQR && selectedODPDetail && (
                    <ODPMatrixModal
                        odp={selectedODPDetail}
                        onClose={() => setSelectedODPDetail(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default ProduccionPage;
