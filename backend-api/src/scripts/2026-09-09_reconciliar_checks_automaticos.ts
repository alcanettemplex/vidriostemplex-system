/**
 * Script: 2026-09-09_reconciliar_checks_automaticos.ts
 *
 * Encuentra las ODP vivas cuyo check de Herrajes o de Vidrio no refleja la realidad,
 * por los dos defectos que arrastraba el automatismo anterior:
 *
 *   - `recibirItems` resolvía **una sola** ODP tomando el primer SAPItem de la ODC.
 *     Como una orden de perfilería agrupa material de varias ODP, todas las demás
 *     quedaron sin marcar (falso negativo); y esa única se marcaba aunque le quedaran
 *     líneas pendientes en otra orden (falso positivo).
 *   - Las otras tres vías por las que un SAPItem llega a `en_existencia` —recepción
 *     desde la cabecera de la ODC, la "S" manual y la cobertura por inventario— no
 *     tocaban el check en absoluto.
 *
 * Por defecto **NO ESCRIBE NADA**: imprime el informe y termina. Todo el trabajo se
 * hace dentro de una transacción que se revierte, así el cálculo de "¿saltaría a
 * LISTO_INSTALAR?" es el real —el mismo motor que corre en producción— y no una
 * simulación aparte que podría discrepar.
 *
 * Ejecutar (informe):  npx ts-node src/scripts/2026-09-09_reconciliar_checks_automaticos.ts
 * Ejecutar (aplicar):  npx ts-node src/scripts/2026-09-09_reconciliar_checks_automaticos.ts --aplicar
 *
 * ⚠️ Con --aplicar, cada ODP corregida emite su notificación y su patch de socket. Si
 * son muchas, los usuarios conectados verán una ráfaga de avisos. Correrlo fuera de
 * horario pico.
 */

import sequelize from '../config/database';
import { Op } from 'sequelize';
import { ODP, Cliente, PedidoPV } from '../models';
import { herrajesCubiertos, recalcularChecksODP } from '../utils/checksAutomaticos';

const APLICAR = process.argv.includes('--aplicar');

// Vivas = todo lo que aún puede moverse en taller. Se excluyen ENTREGADA y ANULADA:
// su histórico está cerrado y reescribirlo solo ensuciaría la trazabilidad.
const ESTADOS_VIVOS = [
  'EN_ESPERA', 'VISITA_TECNICA', 'MEDICION', 'ALUMINIO_CORTADO',
  'VIDRIO_RECIBIDO', 'ACCESORIOS_SEPARADOS', 'LISTO_INSTALAR', 'PAUSADA',
];

interface Hallazgo {
  numero_odp: string;
  cliente: string;
  estado: string;
  check: 'Herrajes' | 'Vidrio';
  de: boolean;
  a: boolean;
  motivo: string;
  estadoDespues: string;
}

async function run() {
  console.log('=== Reconciliación de checks automáticos — 2026-09-09 ===');
  console.log(APLICAR ? 'MODO: APLICAR (se escribirán los cambios)\n' : 'MODO: INFORME (no se escribe nada)\n');

  const odps = await ODP.findAll({
    where: { estado_produccion: { [Op.in]: ESTADOS_VIVOS } },
    include: [{ model: Cliente, as: 'cliente', attributes: ['nombre_razon_social'] }],
    order: [['numero_odp', 'ASC']],
  });
  console.log(`ODP vivas analizadas: ${odps.length}\n`);

  const hallazgos: Hallazgo[] = [];
  const t = await sequelize.transaction();

  try {
    for (const odp of odps) {
      const odpId = odp.getDataValue('id') as number;
      const numero = odp.getDataValue('numero_odp') as string;
      const cli = (odp as any).cliente?.nombre_razon_social ?? '';
      const estadoPrevio = odp.getDataValue('estado_produccion') as string;

      // ─── Herrajes: regla calculable ───
      const debeHerrajes = await herrajesCubiertos(odpId, t);
      const tieneHerrajes = !!odp.getDataValue('chk_accesorios');

      // ─── Vidrio: solo el falso negativo es reconciliable ───
      // La regla real es dirigida por evento, así que no se puede recalcular a
      // posteriori. Lo único inequívoco es: todos los Pedido PV verificados y el
      // check apagado. El caso inverso NO se toca: un chk_vidrio marcado a mano en
      // una ODP sin PV es perfectamente legítimo.
      const pvs = await PedidoPV.findAll({ where: { odp_id: odpId }, attributes: ['estado'], transaction: t });
      const todosPVVerificados = pvs.length > 0 && pvs.every((p) => p.getDataValue('estado') === 'VERIFICADO');
      const tieneVidrio = !!odp.getDataValue('chk_vidrio');
      const debeVidrio = todosPVVerificados && !tieneVidrio ? true : undefined;

      if (debeHerrajes === tieneHerrajes && debeVidrio === undefined) continue;

      const res = await recalcularChecksODP(odpId, {
        usuarioId: 30, // usuario ROOT: historial_estados_odp.usuario_id es NOT NULL
        origen: 'SCRIPT',
        detalle: 'reconciliación 2026-09-09',
        herrajes: true,
        ...(debeVidrio !== undefined ? { vidrio: debeVidrio } : {}),
        transaction: t,
      });
      if (!res) continue;

      for (const [campo, valor] of Object.entries(res.cambios)) {
        hallazgos.push({
          numero_odp: numero,
          cliente: cli,
          estado: estadoPrevio,
          check: campo === 'chk_accesorios' ? 'Herrajes' : 'Vidrio',
          de: !valor,
          a: valor,
          motivo: campo === 'chk_accesorios'
            ? (valor ? 'todas las líneas de la SAP están cubiertas' : 'quedan líneas de la SAP sin cubrir')
            : 'todos los Pedido PV están verificados',
          estadoDespues: res.estadoNuevo,
        });
      }
    }

    // ─── Informe ───
    if (hallazgos.length === 0) {
      console.log('✔ No hay descuadres: todos los checks reflejan el estado real del material.\n');
    } else {
      const marcar = hallazgos.filter((h) => h.a);
      const desmarcar = hallazgos.filter((h) => !h.a);
      const saltanALista = hallazgos.filter((h) => h.estadoDespues === 'LISTO_INSTALAR' && h.estado !== 'LISTO_INSTALAR');
      const retroceden = hallazgos.filter((h) => h.estado === 'LISTO_INSTALAR' && h.estadoDespues !== 'LISTO_INSTALAR');

      console.log(`Descuadres encontrados: ${hallazgos.length}`);
      console.log(`  · A marcar:   ${marcar.length}`);
      console.log(`  · A desmarcar:${desmarcar.length}`);
      console.log(`  · Saltarían a LISTO_INSTALAR: ${saltanALista.length}`);
      console.log(`  · Saldrían de LISTO_INSTALAR: ${retroceden.length}\n`);

      console.log('ODP          CHECK      CAMBIO      ESTADO              → DESPUÉS             MOTIVO');
      console.log('─'.repeat(120));
      for (const h of hallazgos) {
        const cambio = h.a ? 'marcar  ' : 'desmarcar';
        const flecha = h.estado === h.estadoDespues ? '(igual)' : h.estadoDespues;
        console.log(
          `${h.numero_odp.padEnd(12)} ${h.check.padEnd(10)} ${cambio.padEnd(11)} ${h.estado.padEnd(20)}→ ${flecha.padEnd(20)} ${h.motivo}`,
        );
        console.log(`             ${h.cliente.slice(0, 60)}`);
      }
      console.log('─'.repeat(120));

      if (saltanALista.length > 0) {
        console.log('\n⚠ Estas ODP aparecerían de golpe en Instalaciones:');
        for (const h of saltanALista) console.log(`   ${h.numero_odp} — ${h.cliente.slice(0, 60)}`);
      }
      if (retroceden.length > 0) {
        console.log('\n⚠ Estas ODP saldrían de Instalaciones y volverían a producción:');
        for (const h of retroceden) console.log(`   ${h.numero_odp} — ${h.cliente.slice(0, 60)} → ${h.estadoDespues}`);
      }
    }

    if (APLICAR) {
      await t.commit();
      console.log(`\n✔ APLICADO: ${hallazgos.length} cambio(s) escritos en la base de datos.`);
    } else {
      await t.rollback();
      console.log('\nInforme solamente — no se escribió nada.');
      console.log('Para aplicarlo: npx ts-node src/scripts/2026-09-09_reconciliar_checks_automaticos.ts --aplicar');
    }
  } catch (err) {
    await t.rollback();
    throw err;
  }

  console.log('\n=== Fin ===');
}

run()
  .then(() => sequelize.close())
  .catch(async (err) => {
    console.error('ERROR:', err);
    await sequelize.close();
    process.exit(1);
  });
