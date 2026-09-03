/**
 * Script one-off — 2026-09-03
 *
 * Alinea el proveedor de los Pedidos PV con el de su ODP.
 *
 * Contexto: hasta hoy, cambiar `proveedor_vidrio` en una ODP ya existente no tocaba su
 * Pedido PV — `updateODP` solo creaba el pedido cuando el proveedor se asignaba por
 * primera vez. El módulo Pedidos PV elige el formulario (Excel e impreso) por
 * `pedido_pv.proveedor`, así que los pedidos desalineados venían generando el formato
 * del proveedor equivocado.
 *
 * La propagación automática ya quedó implementada en `updateODP` (mismo commit); este
 * script solo corrige los registros que ya estaban torcidos.
 *
 * Al 2026-09-03 son 4:
 *   PV 7075 (ODP-24301) Vitelsa   → Templacol   [ENVIADO]
 *   PV 7071 (ODP-24295) Vitelsa   → Templacol   [CONFIRMADO_PROVEEDOR]
 *   PV 6870 (ODP-24012) "PV"      → Vitelsa     [VERIFICADO]  ← valor sucio
 *   PV 6763 (ODP-23870) Templacol → Vitelsa     [VERIFICADO]
 *
 * No filtra por estado: se corrigen los 4, incluidos los VERIFICADO, por decisión
 * operativa (la ODP es la fuente de verdad). Queda registrado en auditoria_log.
 *
 * La detección es dinámica —compara contra la ODP, no contra una lista quemada—, así
 * que si aparecieran casos nuevos entre el análisis y la ejecución también se alinean.
 * Las ODP sin proveedor se omiten: no hay valor al cual alinear.
 *
 * Tras alinear, se revisa si algún pedido quedó con más ítems de los que admite el
 * formulario del proveedor nuevo (Templacol 29 → Vitelsa 12) y, de ser así, se
 * reparte en extensiones con la misma lógica que usa la aplicación.
 *
 * Seguridad:
 *  - Idempotente: si ya no hay desalineados, no escribe nada.
 *  - Opera por INSTANCIA para que los hooks de MODELOS_AUDITADOS graben en auditoria_log.
 *  - Atribuido a ROOT (id 30) vía requestContext.
 *
 * Ejecutar:  npx ts-node src/scripts/2026-09-03_alinear_proveedor_pedidos_pv.ts
 */
import { sequelize, ODP, PedidoPV } from '../models';
import { requestContext } from '../utils/requestContext';
import { reparticionarPedidosPV, maxItemsPorPedido } from '../utils/pedidoPvCapacidad';
import { QueryTypes } from 'sequelize';

const USUARIO_ROOT = 30;

interface Desalineado {
  pv_id: number;
  numero_pedido: string;
  pv_proveedor: string | null;
  odp_id: number;
  numero_odp: string;
  odp_proveedor: string;
  estado: string;
}

const buscarDesalineados = () => sequelize.query<Desalineado>(`
  SELECT p.id AS pv_id, p.numero_pedido, p.proveedor AS pv_proveedor,
         o.id AS odp_id, o.numero_odp, o.proveedor_vidrio AS odp_proveedor, p.estado
    FROM pedido_pv p
    JOIN odp o ON o.id = p.odp_id
   WHERE COALESCE(TRIM(o.proveedor_vidrio), '') <> ''
     AND COALESCE(TRIM(LOWER(o.proveedor_vidrio)), '') <> COALESCE(TRIM(LOWER(p.proveedor)), '')
   ORDER BY p.numero_pedido DESC
`, { type: QueryTypes.SELECT });

async function ejecutar() {
  const casos = await buscarDesalineados();
  console.log(`Pedidos PV desalineados encontrados: ${casos.length}\n`);
  if (casos.length === 0) return 0;

  for (const c of casos) {
    console.log(`  ${c.numero_pedido.padEnd(8)} ${c.numero_odp.padEnd(11)} ` +
      `${String(c.pv_proveedor).padEnd(10)} → ${c.odp_proveedor.padEnd(10)} [${c.estado}]`);
  }
  console.log('');

  let alineados = 0;
  const odpsTocadas = new Map<number, string>();

  for (const c of casos) {
    const pv = await PedidoPV.findByPk(c.pv_id) as any;
    if (!pv) { console.log(`  ⏭️  PV ${c.numero_pedido}: ya no existe.`); continue; }

    const t = await sequelize.transaction();
    try {
      await pv.update({ proveedor: c.odp_proveedor }, { transaction: t });
      await t.commit();
      alineados++;
      odpsTocadas.set(c.odp_id, c.odp_proveedor);
      console.log(`  ✅ PV ${c.numero_pedido}: ${c.pv_proveedor} → ${c.odp_proveedor}`);
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  // ¿Alguno quedó por encima del tope del formulario nuevo?
  console.log('\n── Revisión de capacidad ──');
  for (const [odpId, proveedor] of odpsTocadas) {
    const tope = maxItemsPorPedido(proveedor);
    const rehechos = await reparticionarPedidosPV(odpId, proveedor, USUARIO_ROOT);
    console.log(`  ODP id=${odpId} (${proveedor}, tope ${tope}): ` +
      (rehechos > 0 ? `${rehechos} grupo(s) repartido(s) en extensiones.` : 'todo cabe, sin cambios.'));
  }

  return alineados;
}

async function verificar() {
  console.log('\n── Verificación POST ──');
  const restantes = await buscarDesalineados();
  if (restantes.length === 0) {
    console.log('  ✅ No queda ningún Pedido PV desalineado con su ODP.');
    return true;
  }
  console.log(`  ❌ Siguen desalineados ${restantes.length}:`);
  restantes.forEach(r => console.log(`     ${r.numero_pedido} — PV=${r.pv_proveedor} vs ODP=${r.odp_proveedor}`));
  return false;
}

async function main() {
  console.log('=== Alineación de proveedor: Pedidos PV ↔ ODP — 2026-09-03 ===\n');

  const alineados = await requestContext.run(
    { userId: USUARIO_ROOT, userName: 'Script mantenimiento 2026-09-03 — alinear proveedor de Pedidos PV', ip: null },
    () => ejecutar()
  );

  await verificar();
  console.log(`\n=== Terminado: ${alineados} pedido(s) alineado(s) ===`);
  await sequelize.close();
}

main().catch(async (e) => {
  console.error('\n❌ ERROR:', e.message);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
