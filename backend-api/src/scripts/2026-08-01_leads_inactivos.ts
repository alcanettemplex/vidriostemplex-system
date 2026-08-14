/**
 * Leads con más de 3 días sin registro ni contacto, agrupados por asesor — SOLO LECTURA.
 *
 * Criterio de "última actividad": COALESCE(leads.ultima_actividad, leads."createdAt").
 * Es la misma definición que usa el tablero CRM (crm.controller.ts:451 y :504); la
 * columna denormalizada la mantiene el hook LeadEvento.afterCreate, así que refleja el
 * último evento real (COMUNICACION, SEGUIMIENTO, CAMBIO_ESTADO, …), no el updatedAt del
 * registro (que se mueve por cualquier edición de campo y daría falsos "sí hubo contacto").
 *
 * Población: estados en gestión activa (NUEVO → VISITA_TECNICA). APROBADO y PERDIDO son
 * terminales y no aplican; FRIO se reporta aparte porque su inactividad es intencional.
 *
 * Egress: todo el filtrado y el conteo ocurre en el servidor; se traen solo las filas
 * que ya cumplen el criterio, con columnas cortas (no se toca mensaje_entrada ni
 * descripcion_contexto, que son los TEXT pesados de la tabla).
 *
 * Uso:
 *   npx ts-node src/scripts/2026-08-01_leads_inactivos.ts        (umbral por defecto: 3 días)
 *   npx ts-node src/scripts/2026-08-01_leads_inactivos.ts 7      (umbral personalizado)
 */
import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';

const DIAS_UMBRAL = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 3;

const ESTADOS_ACTIVOS = ['NUEVO', 'ASIGNADO', 'EN_CONTACTO', 'COTIZANDO', 'SEGUIMIENTO', 'VISITA_TECNICA'];

interface FilaLead {
  lead_id: number;
  nombre: string;
  telefono: string;
  estado_crm: string;
  respondio: string | null;
  asesor: string | null;
  asesor_id: number | null;
  monto: string | null;
  dias: number;
  ultima_actividad: string;
  origen_actividad: 'evento' | 'creacion';
  ultimo_evento_tipo: string | null;
  intentos: number | null;
}

const money = (n: any) => {
  const v = Math.round(Number(n ?? 0));
  return v === 0 ? '—' : `$${v.toLocaleString('es-CO')}`;
};
const trunc = (s: string | null, n: number) => {
  const t = (s ?? '—').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

const consulta = (filtroEstados: string, soloAsignados = true) => `
  SELECT l.id                                   AS lead_id,
         l.nombre,
         l.telefono,
         l.estado_crm,
         l.respondio,
         l.asesor_id,
         COALESCE(u.nombre_completo, '(sin asesor asignado)') AS asesor,
         l.monto_proyectado_cotizacion          AS monto,
         l.intentos_seguimiento                 AS intentos,
         FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(l.ultima_actividad, l."createdAt"))) / 86400)::int AS dias,
         to_char(COALESCE(l.ultima_actividad, l."createdAt") AT TIME ZONE 'America/Bogota',
                 'YYYY-MM-DD HH24:MI')          AS ultima_actividad,
         CASE WHEN l.ultima_actividad IS NULL THEN 'creacion' ELSE 'evento' END AS origen_actividad,
         (SELECT e.tipo FROM lead_eventos e
           WHERE e.lead_id = l.id
           ORDER BY e."createdAt" DESC LIMIT 1)  AS ultimo_evento_tipo
    FROM leads l
    LEFT JOIN usuarios u ON u.id = l.asesor_id
   WHERE l.estado_crm IN (${filtroEstados})
     ${soloAsignados ? 'AND l.asesor_id IS NOT NULL' : ''}
     AND COALESCE(l.ultima_actividad, l."createdAt") < now() - ($1 || ' days')::interval
   ORDER BY asesor, dias DESC, l.id
`;

const imprimirTabla = (filas: FilaLead[]) => {
  const porAsesor = new Map<string, FilaLead[]>();
  filas.forEach((f) => {
    const k = f.asesor ?? '(sin asesor asignado)';
    if (!porAsesor.has(k)) porAsesor.set(k, []);
    porAsesor.get(k)!.push(f);
  });

  // Asesores ordenados por lead más rezagado primero
  const asesores = [...porAsesor.entries()].sort(
    (a, b) => Math.max(...b[1].map((f) => f.dias)) - Math.max(...a[1].map((f) => f.dias))
  );

  asesores.forEach(([asesor, leads]) => {
    const monto = leads.reduce((s, f) => s + Number(f.monto ?? 0), 0);
    console.log(`\n  ▸ ${asesor}  —  ${leads.length} lead(s) inactivo(s)   |   proyectado en riesgo: ${money(monto)}`);
    console.log(`    ${'DÍAS'.padStart(4)}  ${'ID'.padStart(5)}  ${'LEAD'.padEnd(26)} ${'TELÉFONO'.padEnd(13)} ${'ESTADO'.padEnd(15)} ${'ÚLT. ACTIVIDAD'.padEnd(17)} ${'ÚLT. EVENTO'.padEnd(13)} ${'RESPONDIÓ'.padEnd(22)} MONTO`);
    console.log(`    ${'─'.repeat(140)}`);
    leads.forEach((f) => {
      const alerta = f.dias >= 15 ? '🔴' : f.dias >= 7 ? '🟠' : '🟡';
      const evento = f.origen_actividad === 'creacion' ? 'SIN EVENTOS' : (f.ultimo_evento_tipo ?? '—');
      console.log(
        `    ${String(f.dias).padStart(3)}${alerta} ${String(f.lead_id).padStart(5)}  ` +
        `${trunc(f.nombre, 26).padEnd(26)} ${trunc(f.telefono, 13).padEnd(13)} ` +
        `${f.estado_crm.padEnd(15)} ${f.ultima_actividad.padEnd(17)} ${evento.padEnd(13)} ` +
        `${trunc(f.respondio, 22).padEnd(22)} ${money(f.monto)}`
      );
    });
  });
};

const run = async () => {
  await sequelize.authenticate();

  const activos = ESTADOS_ACTIVOS.map((e) => `'${e}'`).join(',');

  const filas: FilaLead[] = await sequelize.query(consulta(activos), {
    type: QueryTypes.SELECT,
    bind: [String(DIAS_UMBRAL)],
  });

  console.log(`\n${'═'.repeat(146)}`);
  console.log(`  LEADS EN GESTIÓN ACTIVA CON MÁS DE ${DIAS_UMBRAL} DÍAS SIN REGISTRO NI CONTACTO`);
  console.log(`  Corte: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })} (hora Bogotá)`);
  console.log(`${'═'.repeat(146)}`);

  if (filas.length === 0) {
    console.log(`\n  ✅ Ningún lead activo supera los ${DIAS_UMBRAL} días de inactividad.\n`);
  } else {
    imprimirTabla(filas);
    const montoTotal = filas.reduce((s, f) => s + Number(f.monto ?? 0), 0);
    const sinEventos = filas.filter((f) => f.origen_actividad === 'creacion').length;
    const noResponde = filas.filter((f) => f.respondio === 'No responde').length;
    console.log(`\n${'─'.repeat(146)}`);
    console.log(`  TOTAL: ${filas.length} leads · ${new Set(filas.map((f) => f.asesor)).size} asesores · proyectado en riesgo ${money(montoTotal)}`);
    console.log(`  De esos: ${sinEventos} nunca registraron un evento desde su creación · ${noResponde} marcados "No responde" (viven en la pestaña Sin Respuesta, no en el pipeline)`);
    console.log(`  Semáforo: 🟡 ${DIAS_UMBRAL}-6 días · 🟠 7-14 días · 🔴 15+ días`);
  }

  // Bolsa sin asignar: no es responsabilidad de ningún asesor todavía, pero es el mayor
  // volumen de inactividad del CRM. Se reporta agregado, no lead por lead.
  const bolsa: any[] = await sequelize.query(
    `SELECT count(*)::int AS n,
            max(FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(l.ultima_actividad, l."createdAt"))) / 86400))::int AS max_dias,
            count(*) FILTER (WHERE l.respondio = 'No responde')::int AS no_responde
       FROM leads l
      WHERE l.estado_crm IN (${activos})
        AND l.asesor_id IS NULL
        AND COALESCE(l.ultima_actividad, l."createdAt") < now() - ($1 || ' days')::interval`,
    { type: QueryTypes.SELECT, bind: [String(DIAS_UMBRAL)] }
  );
  const b = bolsa[0];
  console.log(`\n${'═'.repeat(146)}`);
  console.log(`  BOLSA SIN ASIGNAR — ${b.n} leads sin asesor y sin actividad hace más de ${DIAS_UMBRAL} días (el más viejo: ${b.max_dias} días)`);
  console.log(`  ${b.no_responde} de ellos están marcados "No responde". No son atribuibles a ningún asesor: es deuda de asignación, no de seguimiento.`);
  console.log(`${'═'.repeat(146)}`);

  // FRÍO aparte: su inactividad es una decisión tomada, no un descuido
  const frios: FilaLead[] = await sequelize.query(consulta(`'FRIO'`), {
    type: QueryTypes.SELECT,
    bind: [String(DIAS_UMBRAL)],
  });
  console.log(`\n${'═'.repeat(146)}`);
  console.log(`  ANEXO — LEADS EN FRÍO CON MÁS DE ${DIAS_UMBRAL} DÍAS SIN ACTIVIDAD (${frios.length}) — inactividad esperada, se listan solo como referencia de recuperación`);
  console.log(`${'═'.repeat(146)}`);
  if (frios.length === 0) console.log('\n  (ninguno)\n');
  else imprimirTabla(frios);

  console.log('');
  await sequelize.close();
};

run().catch(async (e) => {
  console.error('Error:', e.message);
  await sequelize.close();
  process.exit(1);
});
