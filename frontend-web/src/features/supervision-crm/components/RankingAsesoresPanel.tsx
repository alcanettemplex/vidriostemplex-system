import React from 'react';
import { Trophy, Loader2, Users } from 'lucide-react';
import { RankingAsesorItem } from '../types';

interface Props {
  ranking: RankingAsesorItem[];
  loading: boolean;
  disabled: boolean;
}

const fmtCOP = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0, notation: 'compact' }).format(v);

const MEDALLAS = ['🥇', '🥈', '🥉'];

const RankingAsesoresPanel: React.FC<Props> = ({ ranking, loading, disabled }) => {
  return (
    <div className="bg-white rounded-2xl shadow-apple overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-apple-hairline">
        <Trophy className="w-4 h-4 text-apple-orange" />
        <span className="text-xs font-bold text-apple-text uppercase tracking-wider">Ranking de Asesores</span>
        <span className="text-[10px] text-apple-text-tertiary font-medium ml-1">(siempre todos, ignora el filtro de asesor)</span>
      </div>

      {disabled ? (
        <div className="flex items-center justify-center gap-2 py-8 text-apple-text-tertiary text-xs font-semibold">
          <Users className="w-4 h-4" />
          Selecciona &quot;Todos los asesores&quot; para ver el ranking comercial.
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-apple-text-tertiary">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando ranking...
        </div>
      ) : ranking.length === 0 ? (
        <div className="text-center py-8 text-sm text-apple-text-tertiary font-medium">Sin actividad de asesores en este período.</div>
      ) : (
        <div className="divide-y divide-apple-hairline">
          {ranking.map((r, idx) => (
            <div key={r.asesor_id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-6 text-center text-sm shrink-0">{MEDALLAS[idx] || `#${idx + 1}`}</span>
              <span className="flex-1 min-w-0 text-xs font-bold text-apple-text truncate">{r.asesor_nombre}</span>
              <span className="text-[10px] font-semibold text-apple-text-tertiary w-16 text-right shrink-0">{r.total_leads} leads</span>
              <span className="text-[10px] font-bold text-apple-blue w-14 text-right shrink-0">{r.conversion_pct}%</span>
              <span className="text-xs font-bold text-apple-green w-20 text-right shrink-0">{fmtCOP(r.monto_vendido)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RankingAsesoresPanel;
