/**
 * Ajuste puntual: monto de la FE 7332 (ODP-24000, LABORATORIOS ECAR SA) → 0.
 *
 * Contexto — el script `2026-07-26_fix_monto_principal_null.ts` asignó
 * `monto_factura_principal = valor_total` a las 3 ODPs que habían quedado en NULL. Para
 * ODP-24000 esa suposición metía $220.754.096 en julio (la ODP está en PROGRAMADA, crédito
 * aprobado y sin abono), inflando el KPI. Decisión del usuario (2026-07-26): dejarla en
 * **0 explícito** hasta confirmar con contabilidad el monto real de la FE.
 *
 * Se usa 0 y NO NULL a propósito: `sqlFacturadoEnRango` ahora hace
 * `COALESCE(monto_factura_principal, valor_total)`, así que un NULL volvería a contar el
 * total. El 0 explícito es el único valor que la deja fuera del KPI, y deja el saldo por
 * facturar visible en el modal de Contabilidad ($220.754.096 en ámbar).
 *
 * ODP-24031 ($2.206.385) y ODP-24120 ($780.000) se dejan con monto = valor_total: sus
 * cifras son consistentes (24120 tiene $600.000 abonados sobre $780.000). Pendiente de
 * confirmación del usuario.
 *
 * Idempotente. Ejecutar UNA vez:
 *   npx ts-node src/scripts/2026-07-26_ajustar_monto_fe7332_odp24000.ts
 */
import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';

const run = async () => {
  await sequelize.authenticate();

  const antes: any[] = await sequelize.query(`
    SELECT numero_odp, factura_electronica, fecha_factura::date AS fecha,
           valor_total, monto_factura_principal
      FROM odp WHERE numero_odp = 'ODP-24000'
  `, { type: QueryTypes.SELECT });
  console.log('Antes:'); console.table(antes);

  const [, meta]: any = await sequelize.query(`
    UPDATE odp SET monto_factura_principal = 0
     WHERE numero_odp = 'ODP-24000'
       AND factura_electronica = '7332'
       AND monto_factura_principal IS DISTINCT FROM 0
  `);
  console.log(`\n✓ Filas actualizadas: ${meta?.rowCount ?? 0}`);

  const despues: any[] = await sequelize.query(`
    SELECT numero_odp, factura_electronica, valor_total, monto_factura_principal,
           (valor_total - COALESCE(monto_factura_principal,0)
                        - COALESCE((SELECT SUM(monto) FROM facturas_adicionales_odp fa
                                     WHERE fa.odp_id = odp.id), 0)) AS saldo_por_facturar
      FROM odp WHERE numero_odp = 'ODP-24000'
  `, { type: QueryTypes.SELECT });
  console.log('\nDespués:'); console.table(despues);

  const kpi: any[] = await sequelize.query(`
    SELECT COUNT(*) AS num_fe, COALESCE(SUM(t.monto), 0) AS facturado_julio FROM (
      SELECT COALESCE(o.monto_factura_principal, o.valor_total) AS monto FROM odp o
       WHERE o.estado_facturacion = 'FACTURADA' AND o.factura_electronica IS NOT NULL
         AND o.fecha_factura::date BETWEEN '2026-07-01' AND '2026-07-31'
      UNION ALL
      SELECT fa.monto FROM facturas_adicionales_odp fa JOIN odp o ON o.id = fa.odp_id
       WHERE o.estado_facturacion = 'FACTURADA'
         AND fa.fecha_factura::date BETWEEN '2026-07-01' AND '2026-07-31'
    ) t
  `, { type: QueryTypes.SELECT });
  console.log('\nKPI facturado julio 2026:'); console.table(kpi);

  await sequelize.close();
};

run().catch((e) => { console.error('❌ Error:', e); process.exit(1); });
