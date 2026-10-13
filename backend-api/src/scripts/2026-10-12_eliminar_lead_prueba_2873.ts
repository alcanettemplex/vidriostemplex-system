/**
 * Script: 2026-10-12_eliminar_lead_prueba_2873.ts
 *
 * Borra los leads de prueba de Luis Alcalá (pedido del usuario, 2026-10-12):
 *   - 2873 "Luis Alcala PRUEBA" (asesor: Administrador, COTIZANDO) — salía en el reporte diario.
 *   - 2061 "luis alcala" (sin asesor, PERDIDO).
 * Verificado antes de borrar: sin cliente, ODP, prospecto, imágenes, ítems de lineamiento ni
 * cotizaciones del Cotizador (la N.° 86 del 2873 ya se había borrado el 2026-09-28). Sus eventos
 * de bitácora (9 y 2) caen por ON DELETE CASCADE.
 * Va por Sequelize (no SQL directo) para que el hook deje el snapshot en auditoria_log.
 * Solo borra si el id conserva el nombre revisado y sigue sin vínculos.
 *
 * Simular: npx ts-node --files src/scripts/2026-10-12_eliminar_lead_prueba_2873.ts
 * Aplicar:  npx ts-node --files src/scripts/2026-10-12_eliminar_lead_prueba_2873.ts --aplicar
 */
import { sequelize, Lead } from '../models';

const APLICAR = process.argv.includes('--aplicar');
const LEADS = [
  { id: 2873, nombre: 'Luis Alcala PRUEBA' },
  { id: 2061, nombre: 'luis alcala' },
];

async function main() {
  for (const esperado of LEADS) {
    const lead = await Lead.findByPk(esperado.id);
    if (!lead) {
      console.log(`Lead ${esperado.id}: ya no existe.`);
      continue;
    }
    const d: any = lead.toJSON();
    console.log(`Lead ${d.id}: "${d.nombre}" · ${d.telefono} · ${d.estado_crm} · asesor ${d.asesor_id}`);
    if (d.nombre !== esperado.nombre || d.odp_id || d.cliente_id || d.prospecto_id) {
      console.log('  No coincide con el lead revisado: no se borra.');
      continue;
    }
    if (!APLICAR) {
      console.log('  Simulación: no se borra. Usa --aplicar.');
      continue;
    }
    await lead.destroy();
    console.log('  ✔ Eliminado.');
  }
  // Los hooks de auditoría son fire-and-forget: dar tiempo antes de cerrar la conexión.
  if (APLICAR) await new Promise((r) => setTimeout(r, 2000));
}

main()
  .catch((e) => { console.error('Error:', e.message); process.exitCode = 1; })
  // models/index deja tareas vivas (no termina solo): se sale explícitamente.
  .finally(() => sequelize.close().finally(() => process.exit()));
