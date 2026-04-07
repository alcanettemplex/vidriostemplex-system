import React from 'react';
import { Calendar } from 'lucide-react';

interface PeriodSelectorProps {
  mes: number;
  anio: number;
  onChange: (mes: number, anio: number) => void;
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const PeriodSelector: React.FC<PeriodSelectorProps> = ({ mes, anio, onChange }) => {
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
      <div className="flex items-center gap-2 px-3 text-slate-500">
        <Calendar className="w-4 h-4" />
        <span className="text-xs font-bold uppercase tracking-wider">Periodo</span>
      </div>
      
      <select
        value={mes}
        onChange={(e) => onChange(parseInt(e.target.value), anio)}
        className="bg-transparent text-sm font-semibold text-slate-700 outline-none cursor-pointer border-l border-slate-100 pl-2 pr-1 h-8"
      >
        {MESES.map((nombre, index) => (
          <option key={index + 1} value={index + 1}>{nombre}</option>
        ))}
      </select>

      <select
        value={anio}
        onChange={(e) => onChange(mes, parseInt(e.target.value))}
        className="bg-transparent text-sm font-semibold text-slate-700 outline-none cursor-pointer h-8"
      >
        {years.map(y => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
};

export default PeriodSelector;
