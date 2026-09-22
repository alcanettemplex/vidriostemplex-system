// Vincula el lead APROBADO "LEONARDO ARDILA OSORIO" a ODP-24357, vía el endpoint
// HTTP real (PATCH /api/crm/:id/vincular-odp) y no con un UPDATE directo, para
// que corran la validación de estado, la escritura del LeadEvento y el
// emitirCambio('crm') del proceso ya corriendo. Mismo patrón que
// 2026-09-21_vincular_leads_aprobados_odp.ts.
//
// VERIFICADO CONTRA LA BASE ANTES DE CORRER (2026-09-22):
//   - Lead 2744 en estado APROBADO (lo exige el endpoint: rechaza con 400 en
//     cualquier otro estado) y con odp_id NULL, así que no se sobreescribe nada.
//   - ODP-24357 = id 608, estado LISTO_INSTALAR, cliente_id 1712
//     ("LEONARDO ARDILA OSORIO", documento 1088311500).
//   - Identidad confirmada por TRES señales independientes: el nombre del lead,
//     el del cliente de la ODP, y el teléfono, que es EXACTO en ambos lados
//     (3148660966 = telefono del lead = telefono_recibe = celular del cliente).
//   - Ningún otro lead ni prospecto apuntaba ya a la ODP 608. Importa porque el
//     endpoint NO valida unicidad: dos leads pueden apuntar a la misma ODP sin
//     que nada lo impida.
//
// Uso: npx ts-node backend-api/src/scripts/2026-09-22_vincular_lead_leonardo_ardila_odp24357.ts
// Requiere el backend corriendo en local (puerto 3001).
import 'dotenv/config';
import jwt from 'jsonwebtoken';

const VINCULOS = [
  { lead_id: 2744, lead_nombre: 'LEONARDO ARDILA OSORIO', odp_id: 608, numero_odp: 'ODP-24357' },
];

async function main() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('Falta JWT_SECRET en el entorno (backend-api/.env)');
  // rol root: `requireRole` de esta ruta no lista a root, pero rbacMiddleware lo
  // deja pasar antes de comprobar la lista ("root tiene acceso a todo").
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
    console.log(`  OK — lead.odp_id ahora = ${data.odp_id}, odp asociada = ${data.odp?.numero_odp} (${data.odp?.estado_produccion})`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
