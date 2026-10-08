import { Op } from 'sequelize';
import { ODP, Cliente } from '../models';
import { hoyBogotaISO, sumarDiasISO, diaCalendarioISO, diferenciaDias } from './fechas';
import { obtenerDiasCarteraVencida } from './odpFiltros';

/**
 * Regla ÚNICA de cartera vencida del dashboard (2026-10-08, decisión del usuario).
 *
 * Regla contable: crédito con FE emitida, saldo pendiente y caja no cancelada, cuya
 * `fecha_factura` quedó más de `dias_alerta_cartera_vencida` días atrás (hoy en Bogotá).
 * Una ODP a crédito SIN FE todavía no es cartera: no hay documento que cobrar.
 *
 * Antes convivían tres reglas en el mismo dashboard: Visión general y el modal usaban
 * `fecha_factura`; Alertas y Ventas usaban `fecha_entrega` sin exigir FE, y Ventas además
 * filtraba por mes de creación (por eso mostraba $0 con $168M vencidos). Toda vista del
 * dashboard que muestre cartera debe pasar por aquí.
 *
 * Es una foto de HOY: no se filtra por período. Vive en utils/ y no en un controlador
 * para no cerrar el ciclo de imports `server → app → routes → controller`.
 *
 * Fuera de este alcance (ver TECH_DEBT.md 2026-10-08): la Cartera Vencida de Contabilidad
 * y el Informe Ejecutivo siguen con sus propias reglas.
 */

export type RiesgoCartera = 'normal' | 'alerta' | 'critico';

export interface ItemCarteraVencida {
  id: number;
  numero_odp: string;
  cliente_id: number;
  cliente_nombre: string;
  factura_electronica: string;
  fecha_factura: string;
  pendiente: number;
  valor_total: number;
  /** Días transcurridos desde la fecha de la FE principal. */
  dias_vencido: number;
  riesgo: RiesgoCartera;
}

export interface RangoCartera {
  clave: RiesgoCartera;
  rango: string;
  total: number;
}

export interface CarteraVencida {
  umbral_dias: number;
  items: ItemCarteraVencida[];
  total: number;
  clientes_unicos: number;
  por_antiguedad: RangoCartera[];
}

/** Cortes de riesgo: > 2× umbral es crítico, > 1,5× es alerta. Los mismos en todo el dashboard. */
export const riesgoCartera = (dias: number, umbral: number): RiesgoCartera =>
  dias > umbral * 2 ? 'critico' : dias > umbral * 1.5 ? 'alerta' : 'normal';

/**
 * Devuelve la cartera vencida completa, de la más antigua a la más reciente.
 * `umbralDias` se puede pasar si el llamador ya leyó la configuración (evita una consulta).
 */
export async function consultarCarteraVencida(umbralDias?: number): Promise<CarteraVencida> {
  const umbral = umbralDias ?? await obtenerDiasCarteraVencida();
  const hoy = hoyBogotaISO();

  const filas = await ODP.findAll({
    where: {
      forma_pago:          'credito',
      pendiente:           { [Op.gt]: 0 },
      factura_electronica: { [Op.ne]: null },
      // `fecha_factura` es DATEONLY: se compara como día de calendario, sin zona.
      fecha_factura:       { [Op.lt]: sumarDiasISO(hoy, -umbral) },
      estado_caja:         { [Op.ne]: 'CANCELADO' },
    },
    include: [{ model: Cliente, as: 'cliente', attributes: ['nombre_razon_social'] }],
    attributes: ['id', 'numero_odp', 'factura_electronica', 'fecha_factura', 'pendiente', 'valor_total', 'cliente_id'],
    order: [['fecha_factura', 'ASC']],
  });

  const items: ItemCarteraVencida[] = filas.map(o => {
    const dias = diferenciaDias(diaCalendarioISO(o.getDataValue('fecha_factura')), hoy);
    return {
      id:                  o.getDataValue('id'),
      numero_odp:          o.getDataValue('numero_odp'),
      cliente_id:          o.getDataValue('cliente_id'),
      cliente_nombre:      (o as any).cliente?.nombre_razon_social || 'Sin cliente',
      factura_electronica: o.getDataValue('factura_electronica'),
      fecha_factura:       o.getDataValue('fecha_factura'),
      pendiente:           Number(o.getDataValue('pendiente')),
      valor_total:         Number(o.getDataValue('valor_total')),
      dias_vencido:        dias,
      riesgo:              riesgoCartera(dias, umbral),
    };
  });

  const sumar = (r: RiesgoCartera) => items.filter(i => i.riesgo === r).reduce((a, i) => a + i.pendiente, 0);
  const por_antiguedad: RangoCartera[] = [
    { clave: 'normal',  rango: `${umbral}–${Math.round(umbral * 1.5)} días`,     total: sumar('normal') },
    { clave: 'alerta',  rango: `${Math.round(umbral * 1.5)}–${umbral * 2} días`, total: sumar('alerta') },
    { clave: 'critico', rango: `>${umbral * 2} días`,                             total: sumar('critico') },
  ];

  return {
    umbral_dias:     umbral,
    items,
    total:           items.reduce((a, i) => a + i.pendiente, 0),
    clientes_unicos: new Set(items.map(i => i.cliente_id)).size,
    por_antiguedad,
  };
}
