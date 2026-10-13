/**
 * Reporte diario de asesores — fuente única de las reglas de supervisión comercial
 * (decisiones del usuario, 2026-10-12). Lo consumen:
 *   - crm.controller → GET/POST /api/supervision-crm/reporte-diario (botón del ERP)
 *   - crm.controller → colas Primer Contacto y Seguimiento de Supervisión CRM
 *   - scripts/reporte_asesores.ts → skill /reporte-asesores de Claude Code
 *
 * Vive en utils y no en el controlador para que el script lo importe sin arrastrar
 * el ciclo server → app → routes → controller.
 *
 * Reglas (detalle en docs/modulos/supervision-crm.md):
 *   Leads (excluye FRIO y "No responde"):
 *     SIN_ASIGNAR      NUEVO sin asesor, > 2 h hábiles desde la creación → asistente administrativo
 *     PRIMER_CONTACTO  NUEVO/ASIGNADO con asesor, sin eventos distintos de CREACION/ASIGNACION
 *                      desde la asignación, > 2 h hábiles desde la asignación
 *     SEGUIMIENTO      EN_CONTACTO/COTIZANDO/SEGUIMIENTO/VISITA_TECNICA, ≥ 2 días hábiles sin actividad
 *   ODP (solo tipo ODP: sin OA, garantías, No Conformidades ni "sin ítems"):
 *     FACTURAR            LISTO_INSTALAR/PROGRAMADA sin FE
 *     FACTURAR_INSTALADA  INSTALANDO/INSTALADA/ENTREGADA sin FE (sale una sola vez, con su saldo)
 *     COBRAR              INSTALANDO/INSTALADA/ENTREGADA con FE, caja PENDIENTE/ABONADO/CREDITO_APROBADO, saldo > 0
 */
import { Op, QueryTypes, Transaction } from 'sequelize';
import sequelize from '../config/database';
import {
  Lead, LeadEvento, Usuario, Cliente, ODP,
  SupervisionLineamiento, SupervisionLineamientoItem,
} from '../models';
import { hoyBogotaISO, diaBogotaISO, diferenciaDias, diaCalendarioISO } from './fechas';
import { horasHabilesEntre, diasHabilesDesde, HORAS_JORNADA } from './diasHabiles';

// ─── Parámetros de las reglas ────────────────────────────────────────────────

export const HORAS_SIN_CONTACTO = 2;
export const DIAS_SIN_ACTIVIDAD = 2;
const ROL_ASIGNADOR = 'asistente_administrativo';
const ESTADOS_CONTACTO = ['NUEVO', 'ASIGNADO'];
const ESTADOS_SEGUIMIENTO = ['EN_CONTACTO', 'COTIZANDO', 'SEGUIMIENTO', 'VISITA_TECNICA'];
const EVENTOS_QUE_NO_SON_CONTACTO = ['CREACION', 'ASIGNACION'];
const ESTADOS_LISTA = ['LISTO_INSTALAR', 'PROGRAMADA'];
const ESTADOS_INSTALADA = ['INSTALANDO', 'INSTALADA', 'ENTREGADA'];
const CAJA_POR_COBRAR = ['PENDIENTE', 'ABONADO', 'CREDITO_APROBADO'];
/** Ventana de ítems que el cumplimiento automático revisa. */
const DIAS_EVALUACION = 30;

const ETAPA_LABEL: Record<string, string> = {
  NUEVO: 'Nuevo', ASIGNADO: 'Asignado', EN_CONTACTO: 'En contacto', COTIZANDO: 'Cotizando',
  SEGUIMIENTO: 'Seguimiento', VISITA_TECNICA: 'Visita técnica',
};
const ESTADO_ODP_LABEL: Record<string, string> = {
  LISTO_INSTALAR: 'lista', PROGRAMADA: 'programada', INSTALANDO: 'en instalación',
  INSTALADA: 'instalada', ENTREGADA: 'entregada',
};

/** El lead no está marcado "No responde" (ojo: `<> 'No responde'` en SQL descarta los NULL). */
const whereRespondeLead = {
  [Op.or]: [{ respondio: null }, { respondio: { [Op.ne]: 'No responde' } }],
};

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type TipoPendiente =
  | 'SIN_ASIGNAR' | 'PRIMER_CONTACTO' | 'SEGUIMIENTO'
  | 'FACTURAR' | 'FACTURAR_INSTALADA' | 'COBRAR';

export type Prioridad = 'alta' | 'media' | 'baja';

export interface PendienteReporte {
  /** Identidad estable del pendiente: evita repetirlo en la 2ª parte del día. */
  clave: string;
  tipo: TipoPendiente;
  responsable_id: number | null;
  lead_id: number | null;
  odp_id: number | null;
  prioridad: Prioridad;
  /** Línea lista para el mensaje (sin numeración). */
  texto: string;
  detalle: Record<string, string | number | boolean | null>;
  /** Para ordenar dentro del bloque (mayor primero). */
  peso: number;
}

export interface GrupoReporte {
  responsable_id: number | null;
  nombre: string;
  activo: boolean;
  es_asignador: boolean;
  leads: number;
  odps: number;
  saldo: number;
  items: PendienteReporte[];
}

export interface ReporteAsesores {
  fecha: string;
  generado_en: string;
  /** Parte del día que tocaría registrar (1 si aún no hay envío hoy). */
  parte: number;
  /** true = la lista trae solo lo que no salió en un envío anterior de hoy. */
  solo_nuevos: boolean;
  totales: { leads: number; odps: number; saldo: number };
  grupos: GrupoReporte[];
  mensaje: string;
}

export interface LeadSupervisado {
  id: number;
  nombre: string;
  telefono: string;
  estado_crm: string;
  asesor_id: number | null;
  monto_proyectado_cotizacion: number;
  intentos_seguimiento: number;
  /** Desde cuándo corre el reloj de la regla. */
  desde: Date;
  horas_habiles: number;
  dias_habiles: number;
}

// ─── Formato ─────────────────────────────────────────────────────────────────

export const fmtPesos = (n: number): string =>
  `$${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

const fmtDiaCorto = (fechaISO: string): string => {
  const [a, m, d] = fechaISO.split('-');
  return `${d}/${m}/${a}`;
};

/** "5h" si es menos de una jornada; si no, "3 días hábiles". */
export function fmtTiempoHabil(horas: number, dias: number): string {
  if (horas < HORAS_JORNADA) return `${Math.max(1, Math.floor(horas))}h`;
  const d = Math.max(1, dias);
  return `${d} día${d === 1 ? '' : 's'} hábil${d === 1 ? '' : 'es'}`;
}

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

/** Quita espacios sobrantes (nombres y teléfonos se digitan a mano). */
const limpio = (v: string | null | undefined): string => (v || '').replace(/\s+/g, ' ').trim();

/** Saldo para el mensaje: una ODP ya pagada se dice así, no "saldo $0". */
const fmtSaldo = (saldo: number): string => (saldo > 0 ? `saldo ${fmtPesos(saldo)}` : 'pagada');

// ─── Reglas de leads (también alimentan las colas de Supervisión CRM) ───────

const ATRIBUTOS_LEAD = [
  'id', 'nombre', 'telefono', 'estado_crm', 'asesor_id', 'monto_proyectado_cotizacion',
  'intentos_seguimiento', 'createdAt', 'fecha_asignado', 'fecha_en_contacto', 'fecha_cotizando',
  'fecha_seguimiento', 'fecha_visita_tecnica', 'ultima_actividad',
];

const FECHA_ENTRADA_ESTADO: Record<string, string> = {
  EN_CONTACTO: 'fecha_en_contacto', COTIZANDO: 'fecha_cotizando',
  SEGUIMIENTO: 'fecha_seguimiento', VISITA_TECNICA: 'fecha_visita_tecnica',
};

function aLeadSupervisado(data: any, desde: Date, ahora: Date): LeadSupervisado {
  return {
    id: data.id,
    nombre: limpio(data.nombre),
    telefono: limpio(data.telefono),
    estado_crm: data.estado_crm,
    asesor_id: data.asesor_id ?? null,
    monto_proyectado_cotizacion: parseFloat(data.monto_proyectado_cotizacion || '0'),
    intentos_seguimiento: data.intentos_seguimiento || 0,
    desde,
    horas_habiles: horasHabilesEntre(desde, ahora),
    dias_habiles: diasHabilesDesde(desde, ahora),
  };
}

/** Leads NUEVO sin asesor con más de 2 h hábiles desde la creación. */
export async function leadsSinAsignar(ahora: Date = new Date()): Promise<LeadSupervisado[]> {
  const leads = await Lead.findAll({
    where: { estado_crm: 'NUEVO', asesor_id: null, ...whereRespondeLead },
    attributes: ATRIBUTOS_LEAD,
  });
  return leads
    .map((l) => { const d: any = l.toJSON(); return aLeadSupervisado(d, new Date(d.createdAt), ahora); })
    .filter((l) => l.horas_habiles > HORAS_SIN_CONTACTO)
    .sort((a, b) => b.horas_habiles - a.horas_habiles);
}

/**
 * Leads NUEVO/ASIGNADO con asesor, sin ningún evento de contacto desde la asignación
 * y con más de 2 h hábiles desde ella. "Contacto" = cualquier evento de la bitácora
 * salvo CREACION y ASIGNACION (que la asignación también deja evento).
 */
export async function leadsSinContacto(asesorId?: number, ahora: Date = new Date()): Promise<LeadSupervisado[]> {
  const where: any = {
    estado_crm: { [Op.in]: ESTADOS_CONTACTO },
    asesor_id: asesorId ? asesorId : { [Op.ne]: null },
    ...whereRespondeLead,
    [Op.and]: [sequelize.literal(`NOT EXISTS (
      SELECT 1 FROM lead_eventos ev
       WHERE ev.lead_id = "Lead"."id"
         AND ev.tipo::text NOT IN (${EVENTOS_QUE_NO_SON_CONTACTO.map((t) => `'${t}'`).join(', ')})
         AND ev."createdAt" >= COALESCE("Lead"."fecha_asignado", "Lead"."createdAt")
    )`)],
  };
  const leads = await Lead.findAll({ where, attributes: ATRIBUTOS_LEAD });
  return leads
    .map((l) => {
      const d: any = l.toJSON();
      return aLeadSupervisado(d, new Date(d.fecha_asignado || d.createdAt), ahora);
    })
    .filter((l) => l.horas_habiles > HORAS_SIN_CONTACTO)
    .sort((a, b) => b.horas_habiles - a.horas_habiles);
}

/** Leads en gestión con 2 o más días hábiles sin actividad. */
export async function leadsSinSeguimiento(asesorId?: number, ahora: Date = new Date()): Promise<LeadSupervisado[]> {
  const where: any = {
    estado_crm: { [Op.in]: ESTADOS_SEGUIMIENTO },
    asesor_id: asesorId ? asesorId : { [Op.ne]: null },
    ...whereRespondeLead,
  };
  const leads = await Lead.findAll({ where, attributes: ATRIBUTOS_LEAD });
  return leads
    .map((l) => {
      const d: any = l.toJSON();
      // Última señal de vida: último evento, entrada a la etapa o creación — la más reciente.
      const candidatas = [d.ultima_actividad, d[FECHA_ENTRADA_ESTADO[d.estado_crm]], d.createdAt]
        .filter(Boolean)
        .map((v: string | Date) => new Date(v).getTime());
      return aLeadSupervisado(d, new Date(Math.max(...candidatas)), ahora);
    })
    .filter((l) => l.dias_habiles >= DIAS_SIN_ACTIVIDAD)
    .sort((a, b) => b.dias_habiles - a.dias_habiles || b.monto_proyectado_cotizacion - a.monto_proyectado_cotizacion);
}

/** Texto de acción y prioridad de un lead según la regla que lo atrapó (colas de Supervisión CRM). */
export function accionLead(tipo: 'PRIMER_CONTACTO' | 'SEGUIMIENTO', l: LeadSupervisado): { texto: string; prioridad: Prioridad } {
  const tiempo = fmtTiempoHabil(l.horas_habiles, l.dias_habiles);
  if (tipo === 'PRIMER_CONTACTO') {
    return { texto: `Contactar — asignado hace ${tiempo}, sin contacto`, prioridad: 'alta' };
  }
  return {
    texto: `Seguimiento — ${ETAPA_LABEL[l.estado_crm] || l.estado_crm}, ${tiempo} sin actividad`,
    prioridad: l.dias_habiles >= 5 ? 'alta' : 'media',
  };
}

// ─── Reglas de ODP ───────────────────────────────────────────────────────────

interface FechasHistorial { [odpId: number]: { [estado: string]: Date } }

/** Última vez que cada ODP entró a cada estado, según el historial. */
async function fechasDeHistorial(odpIds: number[]): Promise<FechasHistorial> {
  if (odpIds.length === 0) return {};
  const filas = (await sequelize.query(
    `SELECT odp_id, estado_nuevo, MAX(fecha) AS fecha
       FROM historial_estados_odp
      WHERE odp_id IN (:ids) AND estado_nuevo IN (:estados)
      GROUP BY odp_id, estado_nuevo`,
    { replacements: { ids: odpIds, estados: [...ESTADOS_LISTA, ...ESTADOS_INSTALADA] }, type: QueryTypes.SELECT }
  )) as Array<{ odp_id: number; estado_nuevo: string; fecha: string }>;
  const out: FechasHistorial = {};
  for (const f of filas) {
    (out[f.odp_id] ||= {})[f.estado_nuevo] = new Date(f.fecha);
  }
  return out;
}

const tieneFE = (o: any): boolean =>
  o.estado_facturacion === 'FACTURADA' || !!(o.factura_electronica && String(o.factura_electronica).trim());

async function pendientesODP(asesorIds?: number[]): Promise<PendienteReporte[]> {
  const where: any = {
    tipo_odp: 'ODP',
    es_garantia: { [Op.not]: true },
    es_no_conformidad: { [Op.not]: true },
    sin_items: { [Op.not]: true },
    estado_produccion: { [Op.in]: [...ESTADOS_LISTA, ...ESTADOS_INSTALADA] },
  };
  if (asesorIds?.length) where.asesor_id = { [Op.in]: asesorIds };

  const odps = await ODP.findAll({
    where,
    attributes: [
      'id', 'numero_odp', 'asesor_id', 'estado_produccion', 'estado_facturacion', 'estado_caja',
      'factura_electronica', 'valor_total', 'abono', 'fecha_listo_instalar', 'fecha_vencimiento_credito',
    ],
    include: [{ model: Cliente, as: 'cliente', attributes: ['nombre_razon_social'] }],
  });
  const historial = await fechasDeHistorial(odps.map((o) => o.getDataValue('id')));
  const hoy = hoyBogotaISO();
  const out: PendienteReporte[] = [];

  for (const odp of odps) {
    const o: any = odp.toJSON();
    const saldo = Math.max(0, Number(o.valor_total || 0) - Number(o.abono || 0));
    const cliente = limpio(o.cliente?.nombre_razon_social) || 'Sin cliente';
    const h = historial[o.id] || {};
    const conFE = tieneFE(o);
    const diasDesde = (f?: Date | string | null) => (f ? diferenciaDias(diaBogotaISO(new Date(f)), hoy) : null);
    const base = {
      responsable_id: o.asesor_id ?? null, lead_id: null, odp_id: o.id,
    };

    if (ESTADOS_LISTA.includes(o.estado_produccion)) {
      if (conFE) continue;
      const dias = diasDesde(o.fecha_listo_instalar || h.LISTO_INSTALAR);
      const cuando = dias === null ? 'sin fecha de lista' : `lista hace ${plural(dias, 'día', 'días')}`;
      out.push({
        ...base, clave: `O:${o.id}:FACTURAR`, tipo: 'FACTURAR', prioridad: 'alta',
        texto: `Solicitar FE: ${o.numero_odp} · ${cliente} · ${fmtSaldo(saldo)} (${cuando})`,
        detalle: { numero_odp: o.numero_odp, cliente, saldo, dias, estado: o.estado_produccion },
        peso: dias ?? 0,
      });
      continue;
    }

    // Instalando / instalada / entregada: días desde la instalación o entrega.
    const fechaFin = h.INSTALADA || h.ENTREGADA || h.INSTALANDO || null;
    const dias = diasDesde(fechaFin);
    const verbo = ESTADO_ODP_LABEL[o.estado_produccion];
    const cuando = dias === null ? `${verbo}, sin fecha` : `${verbo} hace ${plural(dias, 'día', 'días')}`;

    if (!conFE) {
      out.push({
        ...base, clave: `O:${o.id}:FACTURAR_INSTALADA`, tipo: 'FACTURAR_INSTALADA', prioridad: 'alta',
        texto: `Solicitar FE (ya ${verbo}): ${o.numero_odp} · ${cliente} · ${fmtSaldo(saldo)} (${cuando})`,
        detalle: { numero_odp: o.numero_odp, cliente, saldo, dias, estado: o.estado_produccion },
        peso: dias ?? 0,
      });
      continue;
    }

    if (!CAJA_POR_COBRAR.includes(o.estado_caja) || saldo <= 0) continue;
    let credito = '';
    let creditoVencido = false;
    if (o.estado_caja === 'CREDITO_APROBADO') {
      if (o.fecha_vencimiento_credito) {
        const venc = diaCalendarioISO(o.fecha_vencimiento_credito);
        const diasVenc = diferenciaDias(venc, hoy);
        creditoVencido = diasVenc > 0;
        credito = creditoVencido
          ? ` · crédito vencido hace ${plural(diasVenc, 'día', 'días')}`
          : ` · crédito, vence ${fmtDiaCorto(venc)}`;
      } else {
        credito = ' · crédito sin fecha de vencimiento';
      }
    }
    out.push({
      ...base, clave: `O:${o.id}:COBRAR`, tipo: 'COBRAR',
      prioridad: creditoVencido || (dias ?? 0) > 30 ? 'alta' : 'media',
      texto: `Gestionar cobro: ${o.numero_odp} · ${cliente} · saldo ${fmtPesos(saldo)} (${cuando})${credito}`,
      detalle: { numero_odp: o.numero_odp, cliente, saldo, dias, estado: o.estado_produccion, caja: o.estado_caja },
      peso: dias ?? 0,
    });
  }
  return out;
}

// ─── Armado del reporte ──────────────────────────────────────────────────────

const ORDEN_TIPO: Record<TipoPendiente, number> = {
  SIN_ASIGNAR: 0, PRIMER_CONTACTO: 1, SEGUIMIENTO: 2, FACTURAR: 3, FACTURAR_INSTALADA: 4, COBRAR: 5,
};

function pendienteDeLead(tipo: 'SIN_ASIGNAR' | 'PRIMER_CONTACTO' | 'SEGUIMIENTO', l: LeadSupervisado, responsableId: number | null): PendienteReporte {
  const tiempo = fmtTiempoHabil(l.horas_habiles, l.dias_habiles);
  const tel = l.telefono ? ` · ${l.telefono}` : '';
  const etapa = ETAPA_LABEL[l.estado_crm] || l.estado_crm;
  const texto =
    tipo === 'SIN_ASIGNAR' ? `Asignar lead ${l.nombre}${tel} (creado hace ${tiempo})`
      : tipo === 'PRIMER_CONTACTO' ? `Contactar a ${l.nombre}${tel} (asignado hace ${tiempo}, sin contacto)`
        : `Seguimiento a ${l.nombre}${tel} – ${etapa} (${tiempo} sin actividad)`;
  return {
    clave: `L:${l.id}`,
    tipo,
    responsable_id: responsableId,
    lead_id: l.id,
    odp_id: null,
    prioridad: tipo === 'SEGUIMIENTO' && l.dias_habiles < 5 ? 'media' : 'alta',
    texto,
    detalle: {
      nombre: l.nombre, telefono: l.telefono, estado_crm: l.estado_crm,
      horas_habiles: Math.round(l.horas_habiles * 10) / 10, dias_habiles: l.dias_habiles,
    },
    peso: l.horas_habiles,
  };
}

/** Todos los pendientes vigentes (sin descontar lo ya enviado hoy). */
async function pendientesVigentes(asesorIds?: number[]): Promise<{ pendientes: PendienteReporte[]; asignadores: { id: number; nombre_completo: string }[] }> {
  const ahora = new Date();
  const filtroUno = asesorIds?.length === 1 ? asesorIds[0] : undefined;
  const [sinAsignar, sinContacto, seguimiento, odps, asignadores] = await Promise.all([
    leadsSinAsignar(ahora),
    leadsSinContacto(filtroUno, ahora),
    leadsSinSeguimiento(filtroUno, ahora),
    pendientesODP(asesorIds),
    Usuario.findAll({
      where: { rol: ROL_ASIGNADOR, activo: true },
      attributes: ['id', 'nombre_completo'],
      order: [['id', 'ASC']],
    }),
  ]);
  const listaAsignadores = asignadores.map((u) => u.toJSON() as { id: number; nombre_completo: string });
  const asignadorId = listaAsignadores[0]?.id ?? null;
  const filtra = (id: number | null) => !asesorIds?.length || (id !== null && asesorIds.includes(id));

  const pendientes: PendienteReporte[] = [
    ...sinAsignar.map((l) => pendienteDeLead('SIN_ASIGNAR', l, asignadorId)).filter((p) => filtra(p.responsable_id)),
    ...sinContacto.filter((l) => filtra(l.asesor_id)).map((l) => pendienteDeLead('PRIMER_CONTACTO', l, l.asesor_id)),
    ...seguimiento.filter((l) => filtra(l.asesor_id)).map((l) => pendienteDeLead('SEGUIMIENTO', l, l.asesor_id)),
    ...odps,
  ];
  return { pendientes, asignadores: listaAsignadores };
}

/** Claves ya enviadas hoy y la última parte registrada. */
async function enviadoHoy(transaction?: Transaction): Promise<{ claves: Set<string>; ultimaParte: number }> {
  const items = await SupervisionLineamientoItem.findAll({
    attributes: ['lead_id', 'odp_id', 'origen', 'envio'],
    include: [{ model: SupervisionLineamiento, attributes: [], where: { fecha: hoyBogotaISO() }, required: true }],
    transaction,
  });
  const claves = new Set<string>();
  let ultimaParte = 0;
  for (const it of items) {
    const i: any = it.toJSON();
    if (i.lead_id) claves.add(`L:${i.lead_id}`);
    if (i.odp_id) claves.add(`O:${i.odp_id}:${i.origen}`);
    if (i.envio) ultimaParte = Math.max(ultimaParte, i.envio);
  }
  return { claves, ultimaParte };
}

async function agrupar(pendientes: PendienteReporte[], asignadores: { id: number; nombre_completo: string }[]): Promise<GrupoReporte[]> {
  const ids = [...new Set(pendientes.map((p) => p.responsable_id).filter((v): v is number => v !== null))];
  const usuarios = ids.length
    ? await Usuario.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id', 'nombre_completo', 'activo', 'rol'] })
    : [];
  const porId = new Map(usuarios.map((u) => [u.getDataValue('id') as number, u.toJSON() as any]));
  const asignadorIds = new Set(asignadores.map((a) => a.id));

  const grupos = new Map<string, GrupoReporte>();
  for (const p of pendientes) {
    const esAsignacion = p.tipo === 'SIN_ASIGNAR';
    const llave = esAsignacion ? 'asignador' : String(p.responsable_id);
    let g = grupos.get(llave);
    if (!g) {
      const u = p.responsable_id !== null ? porId.get(p.responsable_id) : null;
      g = {
        responsable_id: p.responsable_id,
        nombre: u?.nombre_completo || (esAsignacion ? 'Asistente administrativo' : 'Sin asesor'),
        activo: u ? u.activo !== false : true,
        es_asignador: esAsignacion || (p.responsable_id !== null && asignadorIds.has(p.responsable_id)),
        leads: 0, odps: 0, saldo: 0, items: [],
      };
      grupos.set(llave, g);
    }
    g.items.push(p);
    if (p.lead_id) g.leads++;
    if (p.odp_id) { g.odps++; g.saldo += Number(p.detalle.saldo || 0); }
  }
  // Dos cuentas con el mismo nombre (pasa: gerencia y admin de la misma persona) se distinguen por rol.
  const conteoNombres = new Map<string, number>();
  for (const g of grupos.values()) conteoNombres.set(g.nombre, (conteoNombres.get(g.nombre) || 0) + 1);
  for (const g of grupos.values()) {
    const rol = g.responsable_id !== null ? porId.get(g.responsable_id)?.rol : null;
    if (rol && (conteoNombres.get(g.nombre) || 0) > 1) g.nombre = `${g.nombre} (${String(rol).replace(/_/g, ' ')})`;
  }
  for (const g of grupos.values()) {
    g.items.sort((a, b) => ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo] || b.peso - a.peso);
  }
  // Bloque de asignación primero; luego asesores por nombre.
  return [...grupos.values()].sort((a, b) => {
    const aa = a.items[0]?.tipo === 'SIN_ASIGNAR' ? 0 : 1;
    const bb = b.items[0]?.tipo === 'SIN_ASIGNAR' ? 0 : 1;
    return aa - bb || a.nombre.localeCompare(b.nombre, 'es');
  });
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Mensaje de WhatsApp (formato elegido por el usuario: resumen ejecutivo + tono de equipo). */
export function redactarMensaje(grupos: GrupoReporte[], parte: number, ahora: Date = new Date()): string {
  const hoy = diaBogotaISO(ahora);
  const horaBogota = (ahora.getUTCHours() + 19) % 24;
  const saludo = horaBogota < 12 ? 'Buenos días' : horaBogota < 18 ? 'Buenas tardes' : 'Buenas noches';
  const dia = DIAS_SEMANA[new Date(`${hoy}T12:00:00Z`).getUTCDay()];

  if (grupos.length === 0) {
    return `${saludo} equipo 👋 Hoy ${dia} ${fmtDiaCorto(hoy)} no hay pendientes. ¡Todo al día! ✅`;
  }

  const leads = grupos.reduce((s, g) => s + g.leads, 0);
  const odps = grupos.reduce((s, g) => s + g.odps, 0);
  const saldo = grupos.reduce((s, g) => s + g.saldo, 0);

  const lineas: string[] = [];
  if (parte > 1) {
    lineas.push(`🔁 *Parte ${parte}* – nuevos pendientes desde el envío anterior (${dia} ${fmtDiaCorto(hoy)})`);
  } else {
    lineas.push(`${saludo} equipo 👋 Pendientes del ${dia} ${fmtDiaCorto(hoy)}`);
  }
  const resumen = [plural(leads, 'lead', 'leads'), `${odps} ODP`];
  if (saldo > 0) resumen.push(`${fmtPesos(saldo)} por cobrar`);
  lineas.push(`📊 Total: ${resumen.join(' · ')}`);

  for (const g of grupos) {
    lineas.push('');
    if (g.items[0]?.tipo === 'SIN_ASIGNAR') {
      lineas.push(`📌 *Sin asignar* (${g.nombre})`);
    } else {
      const partes = [];
      if (g.leads) partes.push(plural(g.leads, 'lead', 'leads'));
      if (g.odps) partes.push(`${g.odps} ODP`);
      if (g.saldo > 0) partes.push(fmtPesos(g.saldo));
      lineas.push(`*${g.nombre}*${g.activo ? '' : ' (inactivo)'} (${partes.join(' · ')})`);
    }
    g.items.forEach((it, i) => lineas.push(`${i + 1}. ${it.texto}`));
  }
  lineas.push('');
  lineas.push('Quedo atento a sus avances 🙌');
  return lineas.join('\n');
}

export interface OpcionesReporte {
  /** Restringe a estos responsables (asesores o la asistente). */
  asesorIds?: number[];
  /** true = descuenta lo que ya salió hoy (lo que registraría el botón). */
  soloNuevos?: boolean;
}

/** Reporte listo para mostrar. No escribe nada en la BD. */
export async function construirReporte(opciones: OpcionesReporte = {}): Promise<ReporteAsesores> {
  const ahora = new Date();
  const { pendientes, asignadores } = await pendientesVigentes(opciones.asesorIds);
  let lista = pendientes;
  let parte = 1;
  if (opciones.soloNuevos) {
    const { claves, ultimaParte } = await enviadoHoy();
    lista = pendientes.filter((p) => !claves.has(p.clave));
    parte = ultimaParte + 1;
  }
  const grupos = await agrupar(lista, asignadores);
  return {
    fecha: diaBogotaISO(ahora),
    generado_en: ahora.toISOString(),
    parte,
    solo_nuevos: !!opciones.soloNuevos,
    totales: {
      leads: grupos.reduce((s, g) => s + g.leads, 0),
      odps: grupos.reduce((s, g) => s + g.odps, 0),
      saldo: grupos.reduce((s, g) => s + g.saldo, 0),
    },
    grupos,
    mensaje: redactarMensaje(grupos, parte, ahora),
  };
}

/**
 * Registra un envío: guarda como ítems del lineamiento del día los pendientes que
 * el usuario vio en la vista previa (`claves`) y que siguen vigentes y sin enviar.
 * Devuelve la parte asignada y cuántos ítems se guardaron.
 */
export async function registrarEnvio(params: { usuarioId: number; claves: string[]; asesorIds?: number[] }): Promise<{ parte: number; registrados: number }> {
  const { pendientes } = await pendientesVigentes(params.asesorIds);
  const pedidas = new Set(params.claves);
  const fecha = hoyBogotaISO();

  return sequelize.transaction(async (t) => {
    // Serializa registros simultáneos (doble clic, dos admins a la vez): el candado
    // transaccional se libera solo al terminar la transacción.
    await sequelize.query(`SELECT pg_advisory_xact_lock(hashtext('reporte_diario_asesores'))`, { transaction: t });
    const { claves: yaEnviadas, ultimaParte } = await enviadoHoy(t);
    const nuevos = pendientes.filter((p) => pedidas.has(p.clave) && !yaEnviadas.has(p.clave) && p.responsable_id !== null);
    if (nuevos.length === 0) return { parte: ultimaParte, registrados: 0 };

    const parte = ultimaParte + 1;
    const porResponsable = new Map<number, PendienteReporte[]>();
    for (const p of nuevos) {
      const id = p.responsable_id as number;
      porResponsable.set(id, [...(porResponsable.get(id) || []), p]);
    }
    for (const [responsableId, items] of porResponsable) {
      const [lineamiento] = await SupervisionLineamiento.findOrCreate({
        where: { fecha, asesor_id: responsableId },
        defaults: { creado_por: params.usuarioId },
        transaction: t,
      });
      await SupervisionLineamientoItem.bulkCreate(
        items.map((p) => ({
          lineamiento_id: lineamiento.getDataValue('id'),
          lead_id: p.lead_id,
          odp_id: p.odp_id,
          texto_accion: p.texto,
          prioridad: p.prioridad,
          origen: p.tipo,
          envio: parte,
          detalle: p.detalle,
        })),
        { transaction: t },
      );
    }
    return { parte, registrados: nuevos.length };
  });
}

// ─── Cumplimiento automático ─────────────────────────────────────────────────

let ultimaEvaluacion = 0;
const INTERVALO_EVALUACION_MS = 60 * 1000;

/**
 * Marca cumplidos los ítems del reporte que ya se resolvieron. No toca los que un
 * usuario marcó a mano (`marcado_manual`) ni los del generador por asesor (envio NULL).
 * Se llama al abrir el reporte o un lineamiento; como mucho una vez por minuto.
 */
export async function evaluarCumplimiento(forzar = false): Promise<number> {
  if (!forzar && Date.now() - ultimaEvaluacion < INTERVALO_EVALUACION_MS) return 0;
  ultimaEvaluacion = Date.now();

  const desde = new Date(Date.now() - DIAS_EVALUACION * 24 * 60 * 60 * 1000);
  const pendientes = await SupervisionLineamientoItem.findAll({
    where: { cumplido: false, marcado_manual: false, envio: { [Op.ne]: null }, createdAt: { [Op.gte]: desde } },
    attributes: ['id', 'lead_id', 'odp_id', 'origen', 'createdAt', 'detalle'],
  });
  if (pendientes.length === 0) return 0;

  const items = pendientes.map((p) => p.toJSON() as any);
  const leadIds = [...new Set(items.map((i) => i.lead_id).filter(Boolean))] as number[];
  const odpIds = [...new Set(items.map((i) => i.odp_id).filter(Boolean))] as number[];

  const [leads, eventos, odps] = await Promise.all([
    leadIds.length
      ? Lead.findAll({ where: { id: { [Op.in]: leadIds } }, attributes: ['id', 'estado_crm', 'asesor_id', 'ultima_actividad'] })
      : [],
    leadIds.length
      ? LeadEvento.findAll({
        where: {
          lead_id: { [Op.in]: leadIds },
          tipo: { [Op.notIn]: EVENTOS_QUE_NO_SON_CONTACTO },
          createdAt: { [Op.gte]: desde },
        },
        attributes: ['lead_id', 'createdAt'],
      })
      : [],
    odpIds.length
      ? ODP.findAll({
        where: { id: { [Op.in]: odpIds } },
        attributes: ['id', 'estado_facturacion', 'factura_electronica', 'estado_caja', 'valor_total', 'abono'],
      })
      : [],
  ]);
  const leadPorId = new Map(leads.map((l) => [l.getDataValue('id'), l.toJSON() as any]));
  const odpPorId = new Map(odps.map((o) => [o.getDataValue('id'), o.toJSON() as any]));
  const ultimoContacto = new Map<number, number>();
  for (const e of eventos) {
    const id = e.getDataValue('lead_id');
    const t = new Date(e.getDataValue('createdAt')).getTime();
    if (t > (ultimoContacto.get(id) || 0)) ultimoContacto.set(id, t);
  }

  const resueltos: number[] = [];
  for (const it of items) {
    const creado = new Date(it.createdAt).getTime();
    if (it.lead_id) {
      const l = leadPorId.get(it.lead_id);
      if (!l) continue;
      const huboContacto = (ultimoContacto.get(it.lead_id) || 0) > creado;
      if (it.origen === 'SIN_ASIGNAR' && (l.asesor_id || l.estado_crm !== 'NUEVO')) resueltos.push(it.id);
      else if (it.origen === 'PRIMER_CONTACTO' && (huboContacto || !ESTADOS_CONTACTO.includes(l.estado_crm))) resueltos.push(it.id);
      else if (it.origen === 'SEGUIMIENTO' && (huboContacto || l.estado_crm !== it.detalle?.estado_crm)) resueltos.push(it.id);
    } else if (it.odp_id) {
      const o = odpPorId.get(it.odp_id);
      if (!o) continue;
      const saldo = Number(o.valor_total || 0) - Number(o.abono || 0);
      if ((it.origen === 'FACTURAR' || it.origen === 'FACTURAR_INSTALADA') && tieneFE(o)) resueltos.push(it.id);
      else if (it.origen === 'COBRAR' && (saldo <= 0 || o.estado_caja === 'CANCELADO')) resueltos.push(it.id);
    }
  }
  if (resueltos.length === 0) return 0;

  // individualHooks: que el cambio quede en auditoria_log como cualquier otra marca.
  await SupervisionLineamientoItem.update(
    { cumplido: true, fecha_cumplido: new Date(), cumplido_automatico: true },
    { where: { id: { [Op.in]: resueltos } }, individualHooks: true },
  );
  return resueltos.length;
}
