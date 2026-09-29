import React, { useState } from 'react';
import { motion } from 'framer-motion';

/**
 * Tarjeta contenedora de toda gráfica o bloque de indicadores del ERP.
 *
 *   Título (qué responde la gráfica)            [acciones] [Tabla]
 *   Descripción en una línea: qué mide y sobre qué período
 *   ───────────────────────────────────────────────
 *   gráfica  ó  tabla equivalente
 *
 * `tabla` es el gemelo accesible de la gráfica: los mismos datos en filas, para quien
 * necesita el valor exacto sin depender del tooltip.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- variantes de framer-motion con `custom`
const entrada: any = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.45, ease: [0.22, 1, 0.36, 1] } }),
};

interface ChartCardProps {
  titulo: React.ReactNode;
  descripcion?: React.ReactNode;
  /** Controles a la derecha del título (filtros de la tarjeta, enlaces). */
  acciones?: React.ReactNode;
  /** Vista en tabla con los mismos datos. Si se pasa, aparece el conmutador Gráfica/Tabla. */
  tabla?: React.ReactNode;
  indice?: number;
  className?: string;
  /** Datos actualizándose: se atenúa el contenido anterior en vez de vaciarlo. */
  actualizando?: boolean;
  children: React.ReactNode;
}

export const ChartCard: React.FC<ChartCardProps> = ({
  titulo, descripcion, acciones, tabla, indice = 0, className = '', actualizando = false, children,
}) => {
  const [verTabla, setVerTabla] = useState(false);
  return (
    <motion.section
      custom={indice} variants={entrada} initial="hidden" animate="visible"
      className={`bg-white border border-slate-200 rounded-2xl shadow-card p-5 flex flex-col min-w-0 ${className}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-slate-900 leading-snug">{titulo}</h3>
          {descripcion && <p className="text-[12px] text-slate-700 leading-snug mt-1">{descripcion}</p>}
        </div>
        {(acciones || tabla) && (
          <div className="flex items-center gap-2 shrink-0">
            {acciones}
            {tabla && (
              <div className="flex rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Vista">
                {(['Gráfica', 'Tabla'] as const).map(op => {
                  const activo = (op === 'Tabla') === verTabla;
                  return (
                    <button key={op} type="button" onClick={() => setVerTabla(op === 'Tabla')}
                      aria-pressed={activo}
                      className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition-colors ${activo ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-700 hover:text-slate-900'}`}>
                      {op}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </header>
      <div className={`mt-4 flex-1 min-w-0 transition-opacity duration-300 ${actualizando ? 'opacity-50' : ''}`}>
        {verTabla && tabla ? tabla : children}
      </div>
    </motion.section>
  );
};

/** Tabla compacta para el modo "Tabla" de una ChartCard. */
export const TablaDatos: React.FC<{
  columnas: { label: string; alinear?: 'izq' | 'der' }[];
  filas: React.ReactNode[][];
}> = ({ columnas, filas }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-[12px]">
      <thead>
        <tr className="border-b border-slate-200">
          {columnas.map(c => (
            <th key={c.label} className={`py-1.5 px-2 font-semibold text-slate-900 whitespace-nowrap ${c.alinear === 'der' ? 'text-right' : 'text-left'}`}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={i} className="border-b border-slate-100 last:border-0">
            {f.map((celda, j) => (
              <td key={j} className={`py-1.5 px-2 text-slate-800 whitespace-nowrap ${columnas[j]?.alinear === 'der' ? 'text-right tabular-nums' : ''}`}>{celda}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default ChartCard;
