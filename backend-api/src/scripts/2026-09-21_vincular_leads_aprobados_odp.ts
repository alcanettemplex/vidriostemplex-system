// Vincula 2 leads APROBADO sin ODP a sus ODP correspondientes, vía el endpoint
// HTTP real (PATCH /api/crm/:id/vincular-odp) para ejercitar la validación de
// estado, la escritura de LeadEvento y el emitirCambio('crm') del proceso ya
// corriendo -- no un UPDATE directo. Mismo patrón que
// 2026-09-14_alta_accesorios_7038_restantes.ts.
//
// Verificado antes de correr: ambos leads en APROBADO con odp_id null, ninguna
// de las dos ODP tenía otro lead vinculado, y el contacto/celular de cada ODP
// (nombre_recibe/telefono_recibe u ODP.cliente) coincide con el lead.
//
// Uso: npx ts-node backend-api/src/scripts/2026-09-21_vincular_leads_aprobados_odp.ts
// Requiere el backend corriendo en local (puerto 3001).
import 'dotenv/config';
import jwt from 'jsonwebtoken';

const VINCULOS = [
  { lead_id: 2412, lead_nombre: 'ROMAN CASTILLO', odp_id: 590, numero_odp: 'ODP-24342' },
  { lead_id: 2388, lead_nombre: 'EDWIN ANDRES LOPEZ CARMONA', odp_id: 571, numero_odp: 'ODP-24323' },
];

async function main() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('Falta JWT_SECRET en el entorno (backend-api/.env)');
  const token = jwt.sign({ id: 30, rol: 'root' }, secret, { expiresIn: '5m' });

  for (const v of VINCULOS) {
    console.log(`Vinculando lead ${v.lead_id} (${v.lead_nombre}) -> ${v.numero_odp} (id=${v.odp_id})...`);
    const res = await fetch(`http://localhost:3001/api/crm/${v.lead_id}/vincular-odp`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ odp_id: v.odp_id }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(`  Error (${res.status}):`, data);
      continue;
    }
    console.log(`  OK — lead.odp_id ahora = ${data.odp_id}, odp asociada = ${data.odp?.numero_odp}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
