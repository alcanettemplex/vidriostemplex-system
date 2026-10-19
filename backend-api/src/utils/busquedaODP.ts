import { sequelize } from '../models';

// ─── Búsqueda de ODP en SQL ──────────────────────────────────────────────────
// Regla única "esta ODP coincide con el término". Vivía privada en contabilidad.controller;
// se movió aquí (2026-10-19) para que Facturas vs Salidas encuentre exactamente lo mismo
// sin importar un controlador desde otro.

// La BD no tiene la extensión `unaccent`: `translate()` es nativo de Postgres y quita las
// tildes sin migración. El término llega ya normalizado igual desde normalizarTermino().
export const sinTildes = (expr: string) =>
  `translate(lower(coalesce(${expr}, '')), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc')`;

export const normalizarTermino = (q: string) =>
  q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Patrón LIKE seguro: escapa los comodines con '!' y lo pasa por sequelize.escape (no se
// concatena texto del usuario sin escapar).
export const patronLike = (termino: string) =>
  sequelize.escape(`%${termino.replace(/[!%_]/g, (c) => `!${c}`)}%`);

/**
 * Condición SQL "esta ODP coincide con el término": número de ODP, FE principal y
 * adicionales, cliente (nombre y NIT, también sin puntos ni guiones) y asesor.
 * La usan Contabilidad (/odps sobre "ODP"."id", /pagos sobre "Pago"."odp_id") y
 * Facturas vs Salidas (/ubicar), para que todas encuentren exactamente lo mismo.
 */
export const condicionBusquedaODP = (odpIdExpr: string, q: string): string => {
  const termino = normalizarTermino(q);
  const like = patronLike(termino);
  const digitos = q.replace(/\D/g, '');
  const porNitSinFormato = digitos.length >= 3
    ? `OR regexp_replace(coalesce(c.numero_documento, ''), '\\D', '', 'g') LIKE ${patronLike(digitos)} ESCAPE '!'`
    : '';
  return `EXISTS (
    SELECT 1 FROM odp o
    LEFT JOIN clientes c ON c.id = o.cliente_id
    LEFT JOIN usuarios u ON u.id = o.asesor_id
    WHERE o.id = ${odpIdExpr} AND (
      ${sinTildes('o.numero_odp')} LIKE ${like} ESCAPE '!'
      OR ${sinTildes('o.factura_electronica')} LIKE ${like} ESCAPE '!'
      OR ${sinTildes('c.nombre_razon_social')} LIKE ${like} ESCAPE '!'
      OR ${sinTildes('c.numero_documento')} LIKE ${like} ESCAPE '!'
      ${porNitSinFormato}
      OR ${sinTildes('u.nombre_completo')} LIKE ${like} ESCAPE '!'
      OR EXISTS (
        SELECT 1 FROM facturas_adicionales_odp f
        WHERE f.odp_id = o.id AND ${sinTildes('f.numero_fe')} LIKE ${like} ESCAPE '!'
      )
    )
  )`;
};
