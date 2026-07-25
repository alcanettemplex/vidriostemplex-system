import { literal } from 'sequelize';

/**
 * Facturación con monto real por FE.
 *
 * Cada ODP factura por una o varias facturas electrónicas, cada una con su fecha y su
 * MONTO propio:
 *   - FE principal:  odp.factura_electronica / odp.fecha_factura / odp.monto_factura_principal
 *   - FE adicionales: facturas_adicionales_odp (numero_fe / fecha_factura / monto)
 *
 * El "facturado en un rango" es la SUMA de los montos de cada FE cuya fecha cae dentro
 * del rango — contablemente exacto: el ingreso se reconoce cuando se emite cada FE.
 */

/**
 * SQL (subconsulta escalar) que suma los montos de TODAS las FE — principal y adicionales —
 * cuya fecha cae en [desde, hasta], opcionalmente acotado a ODPs tipo OA.
 *
 * `desde`/`hasta` provienen de fechas ya parseadas del servidor (no input crudo), por lo
 * que interpolarlas como ISO no supone riesgo de inyección.
 */
export const sqlFacturadoEnRango = (
  desde: Date | string,
  hasta: Date | string,
  opts: { soloOA?: boolean; asesorId?: number | null } = {}
): string => {
  const d = new Date(desde).toISOString();
  const h = new Date(hasta).toISOString();
  const filtros: string[] = [];
  if (opts.soloOA) filtros.push(`AND o.tipo_odp = 'OA'`);
  if (opts.asesorId) filtros.push(`AND o.asesor_id = ${Number(opts.asesorId)}`);
  const extra = filtros.join(' ');
  return `
    COALESCE((
      SELECT SUM(t.monto) FROM (
        SELECT o.monto_factura_principal AS monto
          FROM odp o
         WHERE o.estado_facturacion = 'FACTURADA'
           AND o.factura_electronica IS NOT NULL
           AND o.fecha_factura BETWEEN '${d}' AND '${h}'
           ${extra}
        UNION ALL
        SELECT fa.monto AS monto
          FROM facturas_adicionales_odp fa
          JOIN odp o ON o.id = fa.odp_id
         WHERE o.estado_facturacion = 'FACTURADA'
           AND fa.fecha_factura BETWEEN '${d}' AND '${h}'
           ${extra}
      ) t
    ), 0)`;
};

/**
 * Condición Sequelize (literal) para filtrar ODPs que tienen AL MENOS UNA FE (principal o
 * adicional) con fecha dentro de [desde, hasta]. Usar dentro de `[Op.and]`.
 * `alias` es el alias SQL de la tabla ODP (Sequelize usa "ODP", entre comillas dobles).
 */
export const whereTieneFacturaEnRango = (
  desde: Date | string,
  hasta: Date | string,
  alias = 'ODP'
) => {
  const d = new Date(desde).toISOString();
  const h = new Date(hasta).toISOString();
  return literal(
    `(
      ("${alias}"."factura_electronica" IS NOT NULL AND "${alias}"."fecha_factura" BETWEEN '${d}' AND '${h}')
      OR EXISTS (
        SELECT 1 FROM facturas_adicionales_odp fa
         WHERE fa.odp_id = "${alias}"."id" AND fa.fecha_factura BETWEEN '${d}' AND '${h}'
      )
    )`
  );
};
