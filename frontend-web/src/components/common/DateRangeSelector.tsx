import React, { useState } from 'react';
import { Calendar, AlertTriangle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DateRangeSelectorProps {
  desde: string | null;
  hasta: string | null;
  onChange: (desde: string | null, hasta: string | null) => void;
  maxMeses?: number;
  className?: string;
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const DateRangeSelector: React.FC<DateRangeSelectorProps> = ({
  desde,
  hasta,
  onChange,
  maxMeses = 4,
  className = '',
}) => {
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mensajeExcedido, setMensajeExcedido] = useState('');

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 2 + i);

  const parseFecha = (val: string | null): { mes: number; anio: number } | null => {
    if (!val) return null;
    const [a, m] = val.split('-').map(Number);
    if (!a || !m) return null;
    return { mes: m, anio: a };
  };

  const formatFecha = (mes: number, anio: number): string =>
    `${anio}-${String(mes).padStart(2, '0')}`;

  const mesDesde = parseFecha(desde);
  const mesHasta = parseFecha(hasta);

  const handleDesdeMes = (nuevoMes: number) => {
    const a = mesDesde?.anio ?? new Date().getFullYear();
    const nueva = formatFecha(nuevoMes, a);
    validarYActualizar(nueva, hasta);
  };

  const handleDesdeAnio = (nuevoAnio: number) => {
    const m = mesDesde?.mes ?? 1;
    const nueva = formatFecha(m, nuevoAnio);
    validarYActualizar(nueva, hasta);
  };

  const handleHastaMes = (nuevoMes: number) => {
    const a = mesHasta?.anio ?? new Date().getFullYear();
    const nueva = formatFecha(nuevoMes, a);
    validarYActualizar(desde, nueva);
  };

  const handleHastaAnio = (nuevoAnio: number) => {
    const m = mesHasta?.mes ?? 1;
    const nueva = formatFecha(m, nuevoAnio);
    validarYActualizar(desde, nueva);
  };

  const calcularMesesDiff = (d: string, h: string): number => {
    const [a1, m1] = d.split('-').map(Number);
    const [a2, m2] = h.split('-').map(Number);
    return (a2 - a1) * 12 + (m2 - m1);
  };

  const validarYActualizar = (d: string | null, h: string | null) => {
    setError(null);

    if (d && h) {
      if (h < d) {
        const errorMsg = 'La fecha "Hasta" debe ser posterior a "Desde".';
        setError(errorMsg);
        setMensajeExcedido('La fecha de fin ("Hasta") debe ser posterior a la fecha de inicio ("Desde").');
        setIsModalOpen(true);
        return;
      }

      const diff = calcularMesesDiff(d, h);
      if (diff > maxMeses) {
        const errorMsg = `El rango máximo permitido es de ${maxMeses} meses. Seleccionaste ${diff} meses.`;
        setError(errorMsg);
        setMensajeExcedido(`Has seleccionado un período de ${diff} meses. El rango máximo de consulta permitido es de ${maxMeses} meses para garantizar la rapidez y estabilidad del sistema.`);
        setIsModalOpen(true);
        return;
      }
    }

    onChange(d, h);
  };

  const desdeVal = mesDesde || { mes: new Date().getMonth() + 1, anio: new Date().getFullYear() };
  const hastaVal = mesHasta || { mes: new Date().getMonth() + 1, anio: new Date().getFullYear() };

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm">
        <div className="flex items-center gap-2 text-slate-500 pr-2 border-r border-slate-100">
          <Calendar className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-wider">Periodo</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Desde</span>
          <select
            value={desdeVal.mes}
            onChange={e => handleDesdeMes(parseInt(e.target.value))}
            className="bg-transparent text-sm font-semibold text-slate-700 outline-none cursor-pointer border border-slate-200 rounded px-1.5 h-7"
          >
            {MESES.map((nombre, index) => (
              <option key={index + 1} value={index + 1}>{nombre}</option>
            ))}
          </select>
          <select
            value={desdeVal.anio}
            onChange={e => handleDesdeAnio(parseInt(e.target.value))}
            className="bg-transparent text-sm font-semibold text-slate-700 outline-none cursor-pointer h-7"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <span className="text-slate-300 text-lg font-light">→</span>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Hasta</span>
          <select
            value={hastaVal.mes}
            onChange={e => handleHastaMes(parseInt(e.target.value))}
            className="bg-transparent text-sm font-semibold text-slate-700 outline-none cursor-pointer border border-slate-200 rounded px-1.5 h-7"
          >
            {MESES.map((nombre, index) => (
              <option key={index + 1} value={index + 1}>{nombre}</option>
            ))}
          </select>
          <select
            value={hastaVal.anio}
            onChange={e => handleHastaAnio(parseInt(e.target.value))}
            className="bg-transparent text-sm font-semibold text-slate-700 outline-none cursor-pointer h-7"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-0.5 ml-1 font-medium">
          ⚠️ {error}
        </div>
      )}

      {/* Modal Emergente de Advertencia (Framer Motion) */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop con desenfoque */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            
            {/* Contenedor del Modal */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full overflow-hidden p-6 relative z-10"
            >
              {/* Botón de cerrar */}
              <button
                onClick={() => setIsModalOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
                aria-label="Cerrar modal"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Contenido */}
              <div className="flex flex-col items-center text-center mt-2">
                <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mb-4 text-amber-500 ring-4 ring-amber-50/50 animate-pulse">
                  <AlertTriangle className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 tracking-tight">
                  Límite de Período Excedido
                </h3>
                <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                  {mensajeExcedido}
                </p>
              </div>

              {/* Acciones */}
              <div className="mt-6 flex justify-center">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-sm rounded-xl shadow-md hover:shadow-lg transition-all"
                >
                  Entendido
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DateRangeSelector;
