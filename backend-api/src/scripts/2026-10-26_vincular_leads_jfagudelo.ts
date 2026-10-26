/**
 * 2026-10-26_vincular_leads_jfagudelo.ts
 *
 * Vincula dos leads APROBADOS de John Fredy Agudelo Palacio a sus ODP. Mismo criterio que
 * `2026-10-26_vincular_lead3224_odp24473.ts` (decisión del usuario):
 *   - odp_id → la ODP (lo mismo que hace vincularODPAlLead)
 *   - cliente_id → el cliente de la ODP
 *   - monto_proyectado_cotizacion y monto_real_venta → valor_total de la ODP
 *   - evento SEGUIMIENTO "Lead vinculado a ODP-XXXXX."
 *
 *   Lead #3267 CLINICA AURORA- ALEX HERRERA (310 8445357) → ODP-24470 (cliente 1756, ya asignado)
 *   Lead #3200 EDWIN ACOSTA - @teddfun     (3006969981)  → ODP-24469 (cliente 1757; el lead estaba en $0)
 *
 * Guardas por par: lead APROBADO y sin ODP, la ODP sin otro lead, mismo teléfono.
 * Si una guarda falla no se escribe nada (una sola transacción para los dos).
 *
 * EJECUCIÓN (one-off, ya ejecutado el 2026-10-26):
 *   backend-api/node_modules/.bin/ts-node --project backend-api/tsconfig.json \
 *     backend-api/src/scripts/2026-10-26_vincular_leads_jfagudelo.ts
 */
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import sequelize from '../config/database';
import { Lead, LeadEvento, ODP, Cliente } from '../models';
import { requestContext } from '../utils/requestContext';

const VINCULOS = [
  { leadId: 3267, numeroOdp: 'ODP-24470' },
  { leadId: 3200, numeroOdp: 'ODP-24469' },
];
const USUARIO_ROOT = 30;
const soloDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');

(async () => {
  try {
    await sequelize.authenticate();

    const planes: { lead: InstanceType<typeof Lead>; leadId: number; numeroOdp: string; odpId: number; clienteId: number; valor: number }[] = [];
    for (const { leadId, numeroOdp } of VINCULOS) {
      const lead = await Lead.findByPk(leadId);
      const odp = await ODP.findOne({
        where: { numero_odp: numeroOdp },
        attributes: ['id', 'cliente_id', 'valor_total'],
        include: [{ model: Cliente, as: 'cliente', attributes: ['celular', 'telefono'] }],
      }) as any;
      if (!lead || !odp) throw new Error(`no se encontró el lead #${leadId} o ${numeroOdp}`);
      if (lead.getDataValue('estado_crm') !== 'APROBADO') throw new Error(`el lead #${leadId} ya no está APROBADO`);
      if (lead.getDataValue('odp_id')) throw new Error(`el lead #${leadId} ya tiene ODP`);
      if (await Lead.count({ where: { odp_id: odp.id } })) throw new Error(`${numeroOdp} ya tiene otro lead`);
      const tel = soloDigitos(lead.getDataValue('telefono'));
      if (![soloDigitos(odp.cliente?.celular), soloDigitos(odp.cliente?.telefono)].includes(tel)) {
        throw new Error(`el teléfono del lead #${leadId} no coincide con el cliente de ${numeroOdp}`);
      }
      planes.push({ lead, leadId, numeroOdp, odpId: odp.id as number, clienteId: odp.cliente_id as number, valor: Number(odp.valor_total) });
    }

    await requestContext.run(
      { userId: null, userName: 'SCRIPT 2026-10-26_vincular_leads_jfagudelo', ip: null },
      () => sequelize.transaction(async (t) => {
        for (const p of planes) {
          await p.lead.update({
            odp_id: p.odpId,
            cliente_id: p.clienteId,
            monto_proyectado_cotizacion: p.valor,
            monto_real_venta: p.valor,
          }, { transaction: t });
          await LeadEvento.create({
            tipo: 'SEGUIMIENTO',
            detalle_texto: `Lead vinculado a ${p.numeroOdp}.`,
            lead_id: p.leadId,
            creado_por: USUARIO_ROOT,
          }, { transaction: t });
        }
      }),
    );

    for (const p of planes) console.log(`OK: lead #${p.leadId} → ${p.numeroOdp} (id ${p.odpId}), cliente ${p.clienteId}, monto ${p.valor}.`);
    await sequelize.close();
  } catch (err: any) {
    console.error('ABORTA:', err.message ?? err);
    process.exit(1);
  }
})();
