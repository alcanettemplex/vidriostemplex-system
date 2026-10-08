/**
 * 2026-10-08 — Convertir ODP-24416 (JUAN GONZALO TIRADO) en Orden Azul, por orden del usuario.
 *
 * Contexto: la orden se creó como ODP por $1.276.916 (con IVA) y debe ser una OA (sin IVA)
 * por $1.073.039 (= 1.276.916 / 1,19). El número ODP-24416 deja de existir; queda un hueco
 * en el consecutivo ODP (ya existe ODP-24417), lo cual es normal.
 *
 * Se convierte EL MISMO registro (id 678) en vez de crear una OA y borrar la ODP: un DELETE
 * arrastraría en cascada SAP-8061, el ítem y la captura de cotización, y dejaría huérfano el
 * Pedido PV 7156 (CONFIRMADO_PROVEEDOR con Vitelsa, que lo maneja por número de pedido).
 *
 * Qué toca (una sola fila de `odp`):
 *   - numero_odp        ODP-24416 → siguiente OA (generarNumeroODP('OA'), OA-3846 al diagnóstico)
 *   - tipo_odp          ODP → OA
 *   - valor_total       1.276.916 → 1.073.039
 *   - pendiente         → max(0, valor_total - abono)
 *   - estado_caja       recalculado con el criterio de updateODP (50_50 sin abono → PENDIENTE)
 *   - fecha_impresion_op / impresa_por_id → NULL: la OP salió en formato ODP; vuelve a la cola
 *     "Por Imprimir" de Producción para reimprimirse en formato OA (decisión del usuario).
 *
 * Verificado antes de escribir (2026-10-08): sin FE, sin facturas adicionales, sin pagos ni abono,
 * sin ruta, sin salida de almacén; el número no está copiado como texto en ninguna otra tabla.
 *
 * Se escribe por el MODELO dentro de `requestContext` para que quede en auditoria_log y sea
 * revertible desde ROOT. No emite socket ni invalida la caché del Dashboard (viven en el proceso
 * del servidor): las pantallas ven el cambio al recargar y el Dashboard en ≤30 min.
 *
 * Idempotente. Por defecto simula; escribe solo con --aplicar:
 *   ./backend-api/node_modules/.bin/ts-node backend-api/src/scripts/2026-10-08_convertir_odp24416_a_oa.ts --aplicar
 */
import dotenv from 'dotenv';
dotenv.config({ path: 'backend-api/.env' });

import { QueryTypes } from 'sequelize';
import { ODP, FacturaAdicionalODP, Pago, sequelize } from '../models';
import { requestContext } from '../utils/requestContext';
import { generarNumeroODP } from '../utils/generarNumeroODP';

const ODP_ID = 678;
const NUMERO_ACTUAL = 'ODP-24416';
const VALOR_CON_IVA = 1276916;
const VALOR_OA = 1073039;
const APLICAR = process.argv.includes('--aplicar');

const run = async () => {
  const odp = await ODP.findByPk(ODP_ID);
  if (!odp) throw new Error(`ODP id ${ODP_ID} no encontrada`);

  const antes = {
    numero_odp: odp.getDataValue('numero_odp') as string,
    tipo_odp: odp.getDataValue('tipo_odp') as string,
    valor_total: Number(odp.getDataValue('valor_total')) || 0,
    abono: Number(odp.getDataValue('abono')) || 0,
    pendiente: Number(odp.getDataValue('pendiente')) || 0,
    estado_caja: odp.getDataValue('estado_caja'),
    forma_pago: odp.getDataValue('forma_pago'),
    factura_electronica: odp.getDataValue('factura_electronica'),
    fecha_impresion_op: odp.getDataValue('fecha_impresion_op'),
  };
  console.log(`═══ ANTES — id ${ODP_ID} ═══`);
  console.table([antes]);

  if (antes.tipo_odp === 'OA' && antes.valor_total === VALOR_OA) {
    console.log(`\n✓ Sin cambios: ya es ${antes.numero_odp} por ${VALOR_OA}.`);
    return;
  }

  // ── Guardas: no convertir a ciegas si el registro cambió desde el diagnóstico ──
  if (antes.numero_odp !== NUMERO_ACTUAL || antes.tipo_odp !== 'ODP') {
    throw new Error(`Se esperaba ${NUMERO_ACTUAL} tipo ODP y es ${antes.numero_odp} tipo ${antes.tipo_odp}. Revisar a mano.`);
  }
  if (antes.valor_total !== VALOR_CON_IVA) {
    throw new Error(`Se esperaba valor ${VALOR_CON_IVA} y tiene ${antes.valor_total}. Revisar a mano.`);
  }
  if (antes.abono > 0 || antes.factura_electronica) {
    throw new Error('La ODP ya tiene abono o factura electrónica. Revisar a mano.');
  }
  const pagos = await Pago.count({ where: { odp_id: ODP_ID } });
  const adicionales = await FacturaAdicionalODP.count({ where: { odp_id: ODP_ID } });
  if (pagos > 0 || adicionales > 0) {
    throw new Error(`La ODP tiene ${pagos} pago(s) y ${adicionales} factura(s) adicional(es). Revisar a mano.`);
  }

  const nuevoPendiente = Math.max(0, VALOR_OA - antes.abono);
  // Mismo criterio que updateODP (odp.controller.ts)
  let nuevoEstadoCaja: string;
  if (nuevoPendiente <= 0 && antes.abono > 0) nuevoEstadoCaja = 'CANCELADO';
  else if (antes.forma_pago === 'credito' && antes.abono <= 0) nuevoEstadoCaja = 'CREDITO_APROBADO';
  else if (antes.abono > 0) nuevoEstadoCaja = 'ABONADO';
  else nuevoEstadoCaja = 'PENDIENTE';

  const transaction = await sequelize.transaction();
  try {
    const numeroOA = await generarNumeroODP('OA', transaction);
    const cambios = {
      numero_odp: numeroOA,
      tipo_odp: 'OA',
      valor_total: VALOR_OA,
      pendiente: nuevoPendiente,
      estado_caja: nuevoEstadoCaja,
      fecha_impresion_op: null,
      impresa_por_id: null,
    };
    console.log('\n═══ CAMBIOS ═══');
    console.table([cambios]);

    if (!APLICAR) {
      await transaction.rollback();
      console.log('\nSimulación: no se escribió nada. Ejecutar con --aplicar.');
      return;
    }
    await odp.update(cambios, { transaction });
    await transaction.commit();
  } catch (e) {
    if (!(transaction as any).finished) await transaction.rollback();
    throw e;
  }

  const fresca = await ODP.findByPk(ODP_ID);
  console.log('\n═══ DESPUÉS ═══');
  console.table([{
    numero_odp: fresca!.getDataValue('numero_odp'),
    tipo_odp: fresca!.getDataValue('tipo_odp'),
    valor_total: fresca!.getDataValue('valor_total'),
    pendiente: fresca!.getDataValue('pendiente'),
    estado_caja: fresca!.getDataValue('estado_caja'),
    fecha_impresion_op: fresca!.getDataValue('fecha_impresion_op'),
  }]);

  const aud: any[] = await sequelize.query(`
    SELECT id, operacion, usuario_nombre, fecha
      FROM auditoria_log WHERE tabla = 'odp' AND registro_id = :id
     ORDER BY fecha DESC LIMIT 3
  `, { type: QueryTypes.SELECT, replacements: { id: String(ODP_ID) } });
  console.log('\n═══ AUDITORÍA (últimas 3) ═══');
  console.table(aud);
};

(async () => {
  try {
    await new Promise<void>((resolve, reject) => {
      requestContext.run(
        { userId: null, userName: 'script 2026-10-08_convertir_odp24416_a_oa (orden del usuario)', ip: null },
        () => { run().then(resolve, reject); },
      );
    });
  } catch (e: any) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  } finally {
    // Margen para que el INSERT de auditoría (fire-and-forget en el hook) alcance a salir.
    await new Promise((r) => setTimeout(r, 1500));
    await sequelize.close();
  }
})();
