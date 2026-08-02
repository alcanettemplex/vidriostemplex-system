import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bell, ShieldCheck, ChevronDown, ArrowRight,
  Factory, Wallet, CalendarClock,
} from 'lucide-react';

/**
 * Panel de alertas del dashboard gerencial.
 *
 * Rediseñado el 2026-08-02. El formato anterior apilaba tarjetas idénticas de ~70 px,
 * todas en rojo (el backend emitía siempre `critico`) y con el texto "vence pronto"
 * incluso para ODPs vencidas hacía días: 15 cajas indistinguibles que nadie usaba.
 *
 * Ahora: una barra de resumen, agrupación por categoría y filas de una línea. La
 * severidad viene del atraso real, de modo que lo vencido se separa de lo que aún
 * tiene margen. El backend ya no recorta a 10+5, así que se ve el universo completo.
 */

type Alerta = {
  id: string;
  tipo: 'critico' | 'alto' | 'medio';
  categoria: 'produccion' | 'cartera';
  referencia: string;
  estado?: string;
  dias: number;
  fecha?: string;
  monto?: number;
  cliente_nombre?: string;
  cliente_id?: number;
  odp_id?: number;
  umbral_dias?: number;
};

const SEVERIDAD: Record<Alerta['tipo'], { punto: string; texto: string; fondo: string }> = {
  critico: { punto: 'bg-rose-500',   texto: 'text-rose-700',   fondo: 'hover:bg-rose-50/60' },
  alto:    { punto: 'bg-orange-500', texto: 'text-orange-700', fondo: 'hover:bg-orange-50/60' },
  medio:   { punto: 'bg-amber-400',  texto: 'text-amber-700',  fondo: 'hover:bg-amber-50/60' },
};

const moneda = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

// Formato compacto para la barra de resumen: $298,8M
const montoCorto = (n: number) => {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}MM`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
};

// El backend manda días positivos = atraso. Se traduce a lenguaje natural para que
// no haya que interpretar un número con signo.
const textoPlazo = (dias: number) => {
  if (dias > 1) return `vencida hace ${dias} días`;
  if (dias === 1) return 'vencida hace 1 día';
  if (dias === 0) return 'vence hoy';
  if (dias === -1) return 'vence mañana';
  return `vence en ${Math.abs(dias)} días`;
};

const textoMora = (dias: number) => `${dias} días de mora`;

export const PanelAlertas: React.FC<{
  data: Alerta[];
  isLoading: boolean;
  onViewOdp?: (id: number) => void;
}> = ({ data, isLoading, onViewOdp }) => {
  const [colapsado, setColapsado] = useState<Record<string, boolean>>({});

  const resumen = useMemo(() => {
    const lista = data || [];
    const produccion = lista.filter(a => a.categoria === 'produccion');
    const cartera = lista.filter(a => a.categoria === 'cartera');
    return {
      produccion,
      cartera,
      total: lista.length,
      vencidas: produccion.filter(a => a.dias > 0).length,
      montoRiesgo: cartera.reduce((acc, a) => acc + (a.monto || 0), 0),
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-14 bg-white border border-slate-200 animate-pulse rounded-lg" />
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-9 bg-white border border-slate-200 animate-pulse rounded" />
        ))}
      </div>
    );
  }

  const timestamp = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

  if (!data || data.length === 0) {
    return (
      <div className="bg-white p-8 rounded-lg border border-emerald-100 flex flex-col items-center justify-center text-center">
        <ShieldCheck className="w-9 h-9 text-emerald-500 mb-3" strokeWidth={1.5} />
        <h2 className="text-[14px] font-semibold text-slate-800 mb-1">Sin alertas activas</h2>
        <p className="text-[12px] text-slate-500 max-w-sm">
          No hay ODPs fuera de plazo ni cartera vencida por encima del umbral configurado.
        </p>
        <span className="text-[9px] uppercase font-bold text-slate-400 mt-4 tracking-wider">
          Actualizado: {timestamp}
        </span>
      </div>
    );
  }

  const grupos = [
    {
      clave: 'produccion',
      icono: Factory,
      titulo: 'Producción',
      subtitulo: `${resumen.produccion.length} ODP fuera de plazo${resumen.vencidas ? ` · ${resumen.vencidas} ya vencidas` : ''}`,
      items: resumen.produccion,
    },
    {
      clave: 'cartera',
      icono: Wallet,
      titulo: 'Cartera',
      subtitulo: `${resumen.cartera.length} clientes en mora · ${moneda(resumen.montoRiesgo)}`,
      items: resumen.cartera,
    },
  ].filter(g => g.items.length > 0);

  return (
    <div className="space-y-4">
      {/* ── Barra de resumen: el estado de un vistazo, sin tener que contar tarjetas ── */}
      <div className="bg-white rounded-lg border border-slate-200 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded bg-rose-50">
            <Bell className="w-4 h-4 text-rose-600" strokeWidth={2} />
          </div>
          <div>
            <p className="text-[17px] font-bold text-slate-900 leading-none">{resumen.total}</p>
            <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wider mt-0.5">Alertas</p>
          </div>
        </div>

        <div className="h-8 w-px bg-slate-100 hidden sm:block" />

        <Metrica valor={resumen.vencidas} etiqueta="Vencidas" color="text-rose-600" />
        <Metrica valor={resumen.produccion.length} etiqueta="Producción" color="text-slate-700" />
        <Metrica valor={resumen.cartera.length} etiqueta="En mora" color="text-slate-700" />
        <Metrica valor={montoCorto(resumen.montoRiesgo)} etiqueta="En riesgo" color="text-amber-600" />

        <span className="ml-auto text-[10px] font-medium text-slate-400 flex items-center gap-1.5">
          <CalendarClock className="w-3.5 h-3.5" /> {timestamp}
        </span>
      </div>

      {/* ── Grupos por categoría ── */}
      {grupos.map(grupo => {
        const abierto = !colapsado[grupo.clave];
        const Icono = grupo.icono;
        return (
          <div key={grupo.clave} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => setColapsado(p => ({ ...p, [grupo.clave]: abierto }))}
              className="w-full px-4 py-2.5 flex items-center gap-2.5 border-b border-slate-100 hover:bg-slate-50 transition-colors text-left"
            >
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform ${abierto ? '' : '-rotate-90'}`}
              />
              <Icono className="w-4 h-4 text-slate-500" strokeWidth={2} />
              <span className="text-[12px] font-semibold text-slate-800 uppercase tracking-wide">
                {grupo.titulo}
              </span>
              <span className="text-[11px] text-slate-500">{grupo.subtitulo}</span>
            </button>

            {abierto && (
              <div className="divide-y divide-slate-50">
                {grupo.items.map((alerta, i) => (
                  <FilaAlerta key={alerta.id} alerta={alerta} indice={i} onViewOdp={onViewOdp} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const Metrica: React.FC<{ valor: number | string; etiqueta: string; color: string }> = ({
  valor, etiqueta, color,
}) => (
  <div>
    <p className={`text-[17px] font-bold leading-none ${color}`}>{valor}</p>
    <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wider mt-0.5">{etiqueta}</p>
  </div>
);

/** Una alerta = una línea. La densidad es intencional: caben ~25 sin hacer scroll. */
const FilaAlerta: React.FC<{
  alerta: Alerta;
  indice: number;
  onViewOdp?: (id: number) => void;
}> = ({ alerta, indice, onViewOdp }) => {
  const sev = SEVERIDAD[alerta.tipo] || SEVERIDAD.medio;
  const esCartera = alerta.categoria === 'cartera';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      // Escalonado breve y acotado: con 40 filas, un delay por índice sin tope
      // dejaba las últimas en blanco varios segundos.
      transition={{ delay: Math.min(indice * 0.015, 0.3) }}
      className={`group px-4 py-2 flex items-center gap-3 transition-colors ${sev.fondo}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sev.punto}`} />

      <span className="text-[12px] font-semibold text-slate-800 shrink-0 w-[104px] truncate">
        {esCartera ? alerta.cliente_nombre : alerta.referencia}
      </span>

      <span className="text-[11px] text-slate-500 truncate flex-1 min-w-0">
        {esCartera
          ? alerta.referencia
          : <>{alerta.estado}{alerta.cliente_nombre ? <span className="text-slate-400"> · {alerta.cliente_nombre}</span> : null}</>}
      </span>

      {esCartera && alerta.monto != null && (
        <span className="text-[12px] font-semibold text-slate-700 tabular-nums shrink-0 hidden sm:block">
          {moneda(alerta.monto)}
        </span>
      )}

      <span className={`text-[11px] font-semibold shrink-0 w-[124px] text-right ${sev.texto}`}>
        {esCartera ? textoMora(alerta.dias) : textoPlazo(alerta.dias)}
      </span>

      <button
        onClick={() => alerta.odp_id && onViewOdp?.(alerta.odp_id)}
        // Antes este botón decía "Ver cliente" en cartera y no hacía nada: el handler
        // exigía `odp_id` y esas alertas solo traían `cliente_id`. El backend ahora
        // envía también el `odp_id` de la ODP con saldo, así que abre su ficha.
        className="shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-slate-500
                   border border-slate-200 rounded opacity-0 group-hover:opacity-100 focus:opacity-100
                   hover:bg-white hover:text-slate-700 transition-all"
      >
        Ver <ArrowRight className="w-3 h-3" />
      </button>
    </motion.div>
  );
};

export default PanelAlertas;
