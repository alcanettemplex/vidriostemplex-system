// Estados TM: solicitada | programada | realizada | convertida | archivada
// convertida = prospecto convertido a ODP después de visita realizada → se trata igual que realizada

export interface TmEstadoConfig {
  label: string;
  badgeCls: string;   // clases para badge (border incluido)
  cardCls: string;    // clases para card contenedor
  mensajeSinFotos: string | null;
}

const TM_ESTADO_MAP: Record<string, TmEstadoConfig> = {
  solicitada: {
    label: 'Solicitada',
    badgeCls: 'bg-amber-100 text-amber-700 border-amber-200',
    cardCls: 'bg-amber-50 border-amber-200',
    mensajeSinFotos: 'Pendiente de programar por jefe de producción',
  },
  programada: {
    label: 'Programada',
    badgeCls: 'bg-blue-100 text-blue-700 border-blue-200',
    cardCls: 'bg-blue-50 border-blue-200',
    mensajeSinFotos: 'Visita programada — pendiente de realizar',
  },
  realizada: {
    label: '✓ Realizada',
    badgeCls: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    cardCls: 'bg-emerald-50 border-emerald-200',
    mensajeSinFotos: 'Sin fotos registradas',
  },
  convertida: {
    label: '✓ Realizada',
    badgeCls: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    cardCls: 'bg-emerald-50 border-emerald-200',
    mensajeSinFotos: 'Sin fotos registradas',
  },
  archivada: {
    label: 'Archivada',
    badgeCls: 'bg-slate-100 text-slate-500 border-slate-200',
    cardCls: 'bg-slate-50 border-slate-200',
    mensajeSinFotos: 'TM archivada',
  },
};

export const getTmEstadoConfig = (estado: string): TmEstadoConfig =>
  TM_ESTADO_MAP[estado] ?? {
    label: estado,
    badgeCls: 'bg-amber-100 text-amber-700 border-amber-200',
    cardCls: 'bg-amber-50 border-amber-200',
    mensajeSinFotos: null,
  };

/** true si la visita ya fue realizada (con o sin conversión posterior) */
export const tmVisitaRealizada = (estado: string) =>
  estado === 'realizada' || estado === 'convertida';

/** true si no hay ningún registro de la visita: ni croquis ni fotos */
export const tmSinRegistro = (tm: { croquis_url?: string | null; medidas_json?: string[] | null }) =>
  !tm.croquis_url && !(tm.medidas_json && tm.medidas_json.length > 0);

/**
 * true si la TM puede devolverse al panel "Solicitadas".
 * Espeja la guarda de `retornarTM` en backend-api/src/controllers/toma_medidas.controller.ts:
 * una visita programada siempre; una marcada como realizada solo si nunca se registró nada
 * (caso típico: aprobar el prospecto la dio por realizada sin que nadie visitara).
 */
export const tmRetornable = (tm: { estado: string; croquis_url?: string | null; medidas_json?: string[] | null }) =>
  tm.estado === 'programada' || (tmVisitaRealizada(tm.estado) && tmSinRegistro(tm));
