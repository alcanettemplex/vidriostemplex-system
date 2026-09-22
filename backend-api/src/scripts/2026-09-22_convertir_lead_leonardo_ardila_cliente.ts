// Cierra la conversión lead→cliente del CRM para el lead 2744
// ("LEONARDO ARDILA OSORIO"), que quedó pendiente después de vincularlo a
// ODP-24357 (ver 2026-09-22_vincular_lead_leonardo_ardila_odp24357.ts).
//
// Vía el endpoint HTTP real POST /api/crm/:id/convertir, no con un UPDATE
// directo, para que corran las tres validaciones del controlador, la escritura
// del LeadEvento tipo CONVERSION y el sellado de `fecha_cierre`.
//
// POR QUÉ ESTO NO DUPLICA AL CLIENTE 1712
// ---------------------------------------
// `convertLeadToCliente` deduplica por `numero_documento`: busca
// `Cliente.findOne({ where: { numero_documento } })` y, si lo encuentra, toma la
// rama de "cliente existente" — vincula (`cliente_id`, `cliente_es_nuevo=false`)
// y NO crea nada. Sólo crea cliente cuando el documento no existe. Por eso el
// dato que importa de este body es el documento, y se pasa el del cliente real.
//
// VERIFICADO CONTRA LA BASE ANTES DE CORRER (2026-09-22):
//   - Documento 1088311500 devuelve EXACTAMENTE un cliente: id 1712,
//     "LEONARDO ARDILA OSORIO", tel/cel 3148660966, leodiblack@gmail.com, y su
//     dirección coincide con la de instalación de ODP-24357. Importa que sea uno
//     solo: `findOne` sin `order` con documentos repetidos elegiría cualquiera.
//   - Lead 2744: estado APROBADO (lo exige el endpoint, 400 si no),
//     `cliente_id` NULL (si tuviera, responde 409 "ya fue convertido"),
//     `cliente_es_nuevo` NULL y `fecha_cierre` NULL.
//
// EFECTO ESPERADO: cliente_id=1712, cliente_es_nuevo=false, fecha_cierre=ahora,
// y un LeadEvento CONVERSION "Lead vinculado a cliente existente: ... (ID: 1712)".
//
// Uso: npx ts-node backend-api/src/scripts/2026-09-22_convertir_lead_leonardo_ardila_cliente.ts
// Requiere el backend corriendo en local (puerto 3001).
import 'dotenv/config';
import jwt from 'jsonwebtoken';

const LEAD_ID = 2744;
// Los dos únicos campos que el controlador exige. El documento es además la
// llave con la que decide vincular en vez de crear.
const CUERPO = {
  numero_documento: '1088311500',
  nombre_razon_social: 'LEONARDO ARDILA OSORIO',
};

async function main() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('Falta JWT_SECRET en el entorno (backend-api/.env)');
  // rol root: no figura en el `requireRole` de la ruta, pero rbacMiddleware lo
  // deja pasar antes de mirar la lista ("root tiene acceso a todo").
  const token = jwt.sign({ id: 30, rol: 'root' }, secret, { expiresIn: '5m' });

  console.log(`Convirtiendo lead ${LEAD_ID} -> cliente doc ${CUERPO.numero_documento}...`);
  const res = await fetch(`http://localhost:3001/api/crm/${LEAD_ID}/convertir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(CUERPO),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`  Error (${res.status}):`, data);
    process.exit(1);
  }
  console.log(`  OK — esNuevo=${data.esNuevo} (debe ser false: se vinculó al cliente que ya existía)`);
  console.log(`  cliente: id=${data.cliente?.id} · ${data.cliente?.nombre_razon_social}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
