/**
 * Fix de datos: ODPs facturadas que quedaron sin `monto_factura_principal`.
 *
 * Contexto — el 2026-07-24 se desplegó "monto real por FE" (commit 2d95d57). Tres ODPs
 * facturadas ese día quedaron con monto NULL y, como `sqlFacturadoEnRango` hace SUM, el
 * NULL se ignora y esas FE aportaban $0 al KPI en silencio.
 *
 * Detectadas: ODP-24000 (FE 7332), ODP-24031 (FE 7331), ODP-24120 (FE 7333).
 *
 * CAUSA RAÍZ (confirmada por auditoría, no es la ventana de despliegue que se sospechó
 * primero): `updateODP` — el formulario general de ODP — acepta `estado_facturacion` y
 * `factura_electronica` en `odpSchema` y los escribe sin setear `monto_factura_principal`.
 * Solo `facturarODP` (modal de Contabilidad) lo hace. Mientras esa ruta siga abierta se
 * seguirán creando NULLs. Ver TECH_DEBT.md 2026-07-26.
 *
 * Criterio aplicado: monto principal = valor_total (ninguna de las tres tenía FE
 * adicionales). ⚠️ Para ODP-24000 esa suposición resultó incorrecta y se revirtió a 0 —
 * ver `2026-07-26_ajustar_monto_fe7332_odp24000.ts`.
 *
 * El helper ya lleva `COALESCE(monto_factura_principal, valor_total)` como red de seguridad,
 * así que este script normaliza el dato en origen en vez de depender del fallback.
 *
 * Idempotente: el WHERE solo alcanza filas con monto NULL. Ejecutar UNA vez:
 *   npx ts-node src/scripts/2026-07-26_fix_monto_principal_null.ts
 */
import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';

const run = async () => {
  await sequelize.authenticate();
  console.log('Conectado. Corrigiendo montos principales en NULL...\n');

  const afectadas: any[] = await sequelize.query(`
    SELECT numero_odp, factura_electronica, fecha_factura, valor_total
      FROM odp
     WHERE estado_facturacion = 'FACTURADA'
       AND factura_electronica IS NOT NULL
       AND monto_factura_principal IS NULL
     ORDER BY fecha_factura
  `, { type: QueryTypes.SELECT });

  if (afectadas.length === 0) {
    console.log('✓ No hay ODPs facturadas con monto principal NULL. Nada que hacer.');
    await sequelize.close();
    return;
  }

  console.log(`ODPs a corregir (${afectadas.length}):`);
  console.table(afectadas);

  // Guard: si alguna tuviera FE adicionales, asignar el valor_total completo al principal
  // rompería el tope (principal + adicionales <= valor_total). Se excluyen y se reportan.
  const conAdicionales: any[] = await sequelize.query(`
    SELECT o.numero_odp, COUNT(fa.id) AS num_adicionales
      FROM odp o JOIN facturas_adicionales_odp fa ON fa.odp_id = o.id
     WHERE o.estado_facturacion = 'FACTURADA'
       AND o.factura_electronica IS NOT NULL
       AND o.monto_factura_principal IS NULL
     GROUP BY o.numero_odp
  `, { type: QueryTypes.SELECT });

  if (conAdicionales.length > 0) {
    console.warn('\n⚠️  Estas ODPs tienen FE adicionales y NO se tocan (requieren reparto manual):');
    console.table(conAdicionales);
  }

  const [, meta]: any = await sequelize.query(`
    UPDATE odp o
       SET monto_factura_principal = o.valor_total
     WHERE o.estado_facturacion = 'FACTURADA'
       AND o.factura_electronica IS NOT NULL
       AND o.monto_factura_principal IS NULL
       AND NOT EXISTS (SELECT 1 FROM facturas_adicionales_odp fa WHERE fa.odp_id = o.id)
  `);
  console.log(`\n✓ Corregidas: ${meta?.rowCount ?? '?'} ODPs → monto_factura_principal = valor_total`);

  const chk: any[] = await sequelize.query(`
    SELECT COUNT(*) AS restantes_en_null
      FROM odp
     WHERE estado_facturacion = 'FACTURADA'
       AND factura_electronica IS NOT NULL
       AND monto_factura_principal IS NULL
  `, { type: QueryTypes.SELECT });
  console.log('Verificación:', chk[0]);

  const kpi: any[] = await sequelize.query(`
    SELECT COALESCE(SUM(t.monto), 0) AS facturado_julio FROM (
      SELECT COALESCE(o.monto_factura_principal, o.valor_total) AS monto FROM odp o
       WHERE o.estado_facturacion = 'FACTURADA' AND o.factura_electronica IS NOT NULL
         AND o.fecha_factura::date BETWEEN '2026-07-01' AND '2026-07-31'
      UNION ALL
      SELECT fa.monto FROM facturas_adicionales_odp fa JOIN odp o ON o.id = fa.odp_id
       WHERE o.estado_facturacion = 'FACTURADA'
         AND fa.fecha_factura::date BETWEEN '2026-07-01' AND '2026-07-31'
    ) t
  `, { type: QueryTypes.SELECT });
  console.log('KPI facturado julio 2026 tras el fix:', kpi[0]);

  await sequelize.close();
  console.log('\n✅ Fix completo.');
};

run().catch((e) => { console.error('❌ Error en el fix:', e); process.exit(1); });
