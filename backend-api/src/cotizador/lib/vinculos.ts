// Vínculo de una cotización del Cotizador con el ERP (2026-09-27).
//
// Toda cotización nace ligada a UN registro del ERP —lead, prospecto, cliente u
// ODP—: "¿Para quién es esta cotización?". Este archivo reúne lo que ese vínculo
// necesita y que no es aritmética de cotización:
//
//   1. Buscar y describir el registro (buscador de la pantalla, ficha del vínculo).
//   2. El "lead rápido" para quien solo pregunta el precio. NO crea el lead por
//      su cuenta: llama a `crearLeadRegistro` del CRM, el mismo cuerpo del
//      `POST /api/crm` (duplicado por teléfono, asignación, eventos, socket).
//   3. La sincronía automática con el CRM al crear / aprobar / perder la
//      cotización (lead a COTIZANDO / APROBADO / PERDIDO + su bitácora). Corre
//      DENTRO de la transacción del store: la cotización y el lead cambian juntos.
//   4. "Crear ODP" desde una cotización aprobada. Tampoco crea la ODP a mano:
//      elige el flujo que ya existe según el vínculo y lo reutiliza —
//        prospecto (o lead nacido de un prospecto en gestión) → `aprobarProspectoRegistro`
//          (aprobar un prospecto ES crear su ODP: TMs, leads, capturas, Pedido PV);
//        lead → `crearODPParaLead` (el "Crear ODP" del CRM);
//        cliente → `crearODPRegistro` (el `POST /api/odp` del formulario).
//      Así el lead y el prospecto quedan sincronizados igual que hoy.
//
// Egress: todas las consultas piden columnas contadas y con LIMIT.
import { Op, QueryTypes, Transaction } from 'sequelize';
import {
  sequelize,
  Lead,
  LeadEvento,
  Prospecto,
  Cliente,
  ODP,
  Usuario,
  CotizadorCotizacion,
  CotizadorPropuesta,
} from '../../models';
import { crearLeadRegistro, crearODPParaLead } from '../../controllers/crm.controller';
import { aprobarProspectoRegistro } from '../../controllers/prospecto.controller';
import { crearODPRegistro } from '../../controllers/odp.controller';
import { getModulo } from '../modules/registry';
import { ROLES_CONTROL_TOTAL, ROLES_EDITAN_PROPIAS } from './permisos';

type Fila = Record<string, any>;
export type TipoVinculo = 'lead' | 'prospecto' | 'cliente' | 'odp';

/** Error con código HTTP y texto ya redactado para el asesor. */
export class ErrorVinculo extends Error {
  constructor(public estado: number, mensaje: string) {
    super(mensaje);
  }
}

/** Lo que la pantalla necesita para pintar un vínculo y precargar el cliente. */
export interface FichaVinculo {
  tipo: TipoVinculo;
  id: number;
  /** "Carlos Pérez" / "PR-0042 · Carlos Pérez" / "ODP-1234". */
  titulo: string;
  /** Teléfono, documento, estado… en una línea. */
  subtitulo: string;
  /** Estado del registro en su módulo (estado_crm, en_gestion, estado_produccion…). */
  estado: string | null;
  // Datos para precargar el cliente de la cotización (editables en Resumen).
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  clienteId: number | null;
  asesorId: number | null;
  /** ODP ya ligada al registro (lead.odp_id, prospecto.odp_id). */
  odpId: number | null;
}

const ETIQUETA_ESTADO_PROSPECTO: Record<string, string> = {
  en_gestion: 'En gestión',
  aprobado: 'Aprobado',
  no_aprobado: 'No aprobado',
};

const texto = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const unir = (...partes: unknown[]) => partes.map(texto).filter(Boolean).join(' · ');

function fichaLead(l: Fila): FichaVinculo {
  return {
    tipo: 'lead',
    id: l.id,
    titulo: texto(l.nombre) || `Lead #${l.id}`,
    subtitulo: unir('Lead', l.telefono, l.asesor?.nombre_completo ? `Asesor: ${l.asesor.nombre_completo}` : 'Bolsa común'),
    estado: l.estado_crm ?? null,
    nombre: texto(l.nombre),
    telefono: l.telefono ?? null,
    direccion: null,
    clienteId: l.cliente_id ?? null,
    asesorId: l.asesor_id ?? null,
    odpId: l.odp_id ?? null,
  };
}

function fichaProspecto(p: Fila): FichaVinculo {
  const nombre = texto(p.cliente?.nombre_razon_social) || texto(p.nombre_contacto);
  return {
    tipo: 'prospecto',
    id: p.id,
    titulo: unir(p.numero_prospecto, nombre),
    subtitulo: unir('Prospecto', p.telefono_contacto, ETIQUETA_ESTADO_PROSPECTO[p.estado] ?? p.estado),
    estado: p.estado ?? null,
    nombre,
    telefono: p.telefono_contacto ?? p.cliente?.celular ?? p.cliente?.telefono ?? null,
    direccion: p.direccion ?? null,
    clienteId: p.cliente_id ?? null,
    asesorId: p.asesor_id ?? null,
    odpId: p.odp_id ?? null,
  };
}

function fichaCliente(c: Fila): FichaVinculo {
  return {
    tipo: 'cliente',
    id: c.id,
    titulo: texto(c.nombre_razon_social) || `Cliente #${c.id}`,
    subtitulo: unir('Cliente', c.numero_documento, c.celular || c.telefono),
    estado: null,
    nombre: texto(c.nombre_razon_social),
    telefono: c.celular || c.telefono || null,
    direccion: c.direccion ?? null,
    clienteId: c.id,
    asesorId: null,
    odpId: null,
  };
}

function fichaOdp(o: Fila): FichaVinculo {
  const cliente = texto(o.cliente?.nombre_razon_social);
  return {
    tipo: 'odp',
    id: o.id,
    titulo: unir(o.numero_odp, cliente),
    subtitulo: unir('ODP', texto(o.estado_produccion).replace(/_/g, ' ').toLowerCase()),
    estado: o.estado_produccion ?? null,
    nombre: cliente,
    telefono: o.cliente?.celular || o.cliente?.telefono || o.telefono_recibe || null,
    direccion: o.direccion_instalacion ?? o.cliente?.direccion ?? null,
    clienteId: o.cliente_id ?? null,
    asesorId: o.asesor_id ?? null,
    odpId: o.id,
  };
}

const ATTR_LEAD = ['id', 'nombre', 'telefono', 'estado_crm', 'asesor_id', 'cliente_id', 'odp_id', 'prospecto_id'];
const ATTR_PROSPECTO = ['id', 'numero_prospecto', 'nombre_contacto', 'telefono_contacto', 'direccion', 'estado', 'cliente_id', 'asesor_id', 'odp_id'];
const ATTR_CLIENTE = ['id', 'nombre_razon_social', 'numero_documento', 'telefono', 'celular', 'direccion'];
const ATTR_ODP = ['id', 'numero_odp', 'estado_produccion', 'cliente_id', 'asesor_id', 'direccion_instalacion', 'telefono_recibe', 'valor_total'];
const INCLUDE_ASESOR = { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] };
const INCLUDE_CLIENTE = { model: Cliente, as: 'cliente', attributes: ATTR_CLIENTE };

const LIMITE_POR_TIPO = 6;

/**
 * Buscador de "¿Para quién es esta cotización?". Mínimo 2 caracteres. Busca por
 * nombre, teléfono (también solo sus dígitos), documento y número (PR-…, ODP-…).
 * `tipos` restringe los grupos (el modal de Crear ODP pide solo clientes).
 */
export async function buscarVinculos(q: string, tipos: TipoVinculo[] = ['lead', 'prospecto', 'cliente', 'odp']) {
  const termino = q.trim();
  if (termino.length < 2) return { leads: [], prospectos: [], clientes: [], odps: [] };
  const like = `%${termino}%`;
  const digitos = termino.replace(/\D/g, '');
  const likeTel = digitos.length >= 4 ? `%${digitos}%` : null;
  const quiere = (t: TipoVinculo) => tipos.includes(t);

  const [leads, prospectos, clientes, odps] = await Promise.all([
    quiere('lead')
      ? Lead.findAll({
          where: {
            [Op.or]: [
              { nombre: { [Op.iLike]: like } },
              { telefono: { [Op.iLike]: like } },
              ...(likeTel ? [{ telefono: { [Op.iLike]: likeTel } }] : []),
            ],
          },
          attributes: ATTR_LEAD,
          include: [INCLUDE_ASESOR],
          order: [['id', 'DESC']],
          limit: LIMITE_POR_TIPO,
        })
      : [],
    quiere('prospecto')
      ? Prospecto.findAll({
          where: {
            [Op.or]: [
              { numero_prospecto: { [Op.iLike]: like } },
              { nombre_contacto: { [Op.iLike]: like } },
              { telefono_contacto: { [Op.iLike]: like } },
              ...(likeTel ? [{ telefono_contacto: { [Op.iLike]: likeTel } }] : []),
              { '$cliente.nombre_razon_social$': { [Op.iLike]: like } },
            ],
          },
          attributes: ATTR_PROSPECTO,
          include: [INCLUDE_CLIENTE],
          subQuery: false,
          order: [['id', 'DESC']],
          limit: LIMITE_POR_TIPO,
        })
      : [],
    quiere('cliente')
      ? Cliente.findAll({
          where: {
            [Op.or]: [
              { nombre_razon_social: { [Op.iLike]: like } },
              { numero_documento: { [Op.iLike]: like } },
              { telefono: { [Op.iLike]: like } },
              { celular: { [Op.iLike]: like } },
              ...(likeTel ? [{ telefono: { [Op.iLike]: likeTel } }, { celular: { [Op.iLike]: likeTel } }] : []),
            ],
          },
          attributes: ATTR_CLIENTE,
          order: [['nombre_razon_social', 'ASC']],
          limit: LIMITE_POR_TIPO,
        })
      : [],
    quiere('odp')
      ? ODP.findAll({
          where: {
            [Op.or]: [
              { numero_odp: { [Op.iLike]: like } },
              { '$cliente.nombre_razon_social$': { [Op.iLike]: like } },
            ],
          },
          attributes: ATTR_ODP,
          include: [INCLUDE_CLIENTE],
          subQuery: false,
          order: [['id', 'DESC']],
          limit: LIMITE_POR_TIPO,
        })
      : [],
  ]);

  const plano = (lista: unknown[]) => lista.map((x) => (x as { toJSON: () => Fila }).toJSON());
  return {
    leads: plano(leads).map(fichaLead),
    // En gestión primero: son los que todavía se pueden cotizar y aprobar.
    prospectos: plano(prospectos)
      .map(fichaProspecto)
      .sort((a, b) => Number(b.estado === 'en_gestion') - Number(a.estado === 'en_gestion')),
    clientes: plano(clientes).map(fichaCliente),
    odps: plano(odps).map(fichaOdp),
  };
}

/** Ficha de UN vínculo (para pintarlo al abrir una cotización o al llegar por enlace). */
export async function resolverVinculo(tipo: TipoVinculo, id: number, t?: Transaction): Promise<FichaVinculo | null> {
  if (tipo === 'lead') {
    const l = await Lead.findByPk(id, { attributes: ATTR_LEAD, include: [INCLUDE_ASESOR], transaction: t });
    return l ? fichaLead(l.toJSON()) : null;
  }
  if (tipo === 'prospecto') {
    const p = await Prospecto.findByPk(id, { attributes: ATTR_PROSPECTO, include: [INCLUDE_CLIENTE], transaction: t });
    return p ? fichaProspecto(p.toJSON()) : null;
  }
  if (tipo === 'cliente') {
    const c = await Cliente.findByPk(id, { attributes: ATTR_CLIENTE, transaction: t });
    return c ? fichaCliente(c.toJSON()) : null;
  }
  const o = await ODP.findByPk(id, { attributes: ATTR_ODP, include: [INCLUDE_CLIENTE], transaction: t });
  return o ? fichaOdp(o.toJSON()) : null;
}

/** Usuarios que pueden ser asesor (dueño) de una cotización: los de control
 * total y los que editan las suyas, activos. */
/** Roles que nunca aparecen como asesor en las listas (filtros y reasignación). */
export const ROLES_NO_ASESOR: ReadonlySet<string> = new Set(['root', 'admin']);

export async function listarAsesores() {
  // Sin root ni admin (2026-09-27, usuario): son cuentas de sistema, no asesores.
  const roles = [...ROLES_CONTROL_TOTAL, ...ROLES_EDITAN_PROPIAS].filter((r) => !ROLES_NO_ASESOR.has(r));
  const filas = await Usuario.findAll({
    where: { activo: true, rol: { [Op.in]: roles } },
    attributes: ['id', 'nombre_completo', 'rol'],
    order: [['nombre_completo', 'ASC']],
  });
  return filas.map((u) => {
    const f = u.toJSON() as Fila;
    return { id: f.id as number, nombre: f.nombre_completo as string, rol: f.rol as string };
  });
}

// ─── Lead rápido ─────────────────────────────────────────────────────────────

export const FUENTES_LEAD = [
  'Web', 'Facebook', 'Instagram', 'WhatsApp', 'Llamada', 'Presencial', 'Show Room', 'Referidos', 'Visita Asesor', 'Cliente',
] as const;

/**
 * "+ Crear lead rápido": quien solo pregunta el precio queda registrado como
 * lead REAL del CRM, asignado al asesor de la cotización. Si ya hay un lead con
 * ese teléfono no se duplica: se responde 409 con su ficha para usarlo.
 */
export async function crearLeadRapido(
  datos: { nombre: string; telefono: string; fuente?: (typeof FUENTES_LEAD)[number]; asesorId?: number | null },
  user: NonNullable<Express.Request['user']>
): Promise<{ status: number; body: unknown }> {
  const r = await crearLeadRegistro(
    {
      nombre: datos.nombre.trim(),
      telefono: datos.telefono.trim(),
      fuente_lead: datos.fuente ?? 'Presencial',
      asesor_id: datos.asesorId ?? user.id,
      producto_interes: null,
      descripcion_contexto: 'Registrado desde el Cotizador ("lead rápido"): la persona pidió una cotización.',
    },
    user
  );
  if (r.status === 201) {
    const id = (r.body as { getDataValue: (k: string) => number }).getDataValue('id');
    return { status: 201, body: await resolverVinculo('lead', id) };
  }
  if (r.status === 409) {
    const leadId = (r.body as { lead_id?: number }).lead_id;
    const existente = leadId ? await resolverVinculo('lead', leadId) : null;
    return {
      status: 409,
      body: {
        error: `Ya hay un lead con el teléfono ${datos.telefono.trim()}${existente ? ` (${existente.titulo})` : ''}. Úsalo en vez de crear otro.`,
        existente,
      },
    };
  }
  return r;
}

// ─── Sincronía con el CRM ────────────────────────────────────────────────────
// Reglas (decisión del usuario, 2026-09-27):
//   · Crear la cotización → lead a COTIZANDO si estaba antes en el embudo.
//     Nunca retrocede un lead en SEGUIMIENTO / VISITA_TECNICA ni toca uno
//     APROBADO / PERDIDO. Un lead FRÍO se reactiva: recibir una cotización es
//     señal de vida (lo documenta el reporte del agente).
//   · Aprobar la cotización → lead a APROBADO (misma escritura que
//     `updateLeadStatus`: fecha_aprobado + monto real de venta, que aquí es el
//     total de la cotización).
//   · Perder la cotización → el lead SOLO se marca perdido si el asesor lo pide.
// Siempre queda un evento en la bitácora del lead. Tipos existentes del ENUM de
// Postgres: CAMBIO_ESTADO si cambió de etapa, SEGUIMIENTO si no.

const ESTADOS_ANTES_DE_COTIZAR = ['NUEVO', 'ASIGNADO', 'EN_CONTACTO', 'FRIO'];

/** Etiquetas de motivo de pérdida del CRM (las del detalle del lead). */
const MOTIVO_A_CRM: Record<string, string> = {
  PRECIO: 'Precio alto',
  TIEMPO_ENTREGA: 'Tiempo de entrega',
  COMPETENCIA: 'Fue con la competencia',
  NO_RESPONDIO: 'Sin respuesta del cliente',
  DESISTIO: 'Proyecto cancelado',
  OTRO: 'Otro',
};
export const ETIQUETA_MOTIVO: Record<string, string> = {
  PRECIO: 'Precio',
  TIEMPO_ENTREGA: 'Tiempo de entrega',
  COMPETENCIA: 'Competencia',
  NO_RESPONDIO: 'No respondió',
  DESISTIO: 'Desistió',
  OTRO: 'Otro',
};

const pesos = (n: unknown) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

/** Avisa al tablero del CRM cuando la transacción se confirma (nunca antes). */
function emitirCrmAlConfirmar(t: Transaction) {
  t.afterCommit(() => {
    import('../../server').then(({ emitirCambio }) => emitirCambio('crm')).catch(() => {});
  });
}

async function evento(leadId: number, tipo: 'CAMBIO_ESTADO' | 'SEGUIMIENTO' | 'ASIGNACION', detalle: string, usuarioId: number, t: Transaction) {
  await LeadEvento.create({ tipo, detalle_texto: detalle, lead_id: leadId, creado_por: usuarioId }, { transaction: t });
}

/** Al crear una cotización vinculada a un lead (o al vincularla después). */
export async function sincronizarLeadAlCotizar(
  leadId: number,
  cot: { numero: number; asesorUsuarioId: number | null },
  usuarioId: number,
  t: Transaction
): Promise<string | null> {
  const lead = await Lead.findByPk(leadId, { transaction: t });
  if (!lead) return null;
  const estado = String(lead.getDataValue('estado_crm'));
  const cambios: Fila = {};
  const avisos: string[] = [];
  const ahora = new Date();

  // Un lead de la bolsa común que recibe una cotización ya tiene asesor: el de
  // la cotización (equivale a "reclamarlo").
  if (!lead.getDataValue('asesor_id') && cot.asesorUsuarioId) {
    cambios.asesor_id = cot.asesorUsuarioId;
    if (!lead.getDataValue('fecha_asignado')) cambios.fecha_asignado = ahora;
    if (estado === 'NUEVO') cambios.estado_crm = 'ASIGNADO';
  }
  const pasaACotizando = ESTADOS_ANTES_DE_COTIZAR.includes(estado);
  if (pasaACotizando) {
    cambios.estado_crm = 'COTIZANDO';
    cambios.fecha_cotizando = ahora;
  }
  if (Object.keys(cambios).length) await lead.update(cambios, { transaction: t });

  if (cambios.asesor_id) {
    await evento(leadId, 'ASIGNACION', `Asignado al crear la cotización N.° ${cot.numero} en el Cotizador.`, usuarioId, t);
  }
  if (pasaACotizando) {
    await evento(leadId, 'CAMBIO_ESTADO', `Movido de ${estado} a COTIZANDO: cotización N.° ${cot.numero} creada en el Cotizador.`, usuarioId, t);
    avisos.push(`El lead pasó a Cotizando.`);
  } else {
    await evento(leadId, 'SEGUIMIENTO', `Cotización N.° ${cot.numero} creada en el Cotizador (el lead sigue en ${estado}).`, usuarioId, t);
  }
  emitirCrmAlConfirmar(t);
  return avisos[0] ?? null;
}

/** Al pasar la cotización a APROBADA. */
export async function sincronizarLeadAlAprobar(
  leadId: number,
  cot: { numero: number; etiqueta: string | null; total: number },
  usuarioId: number,
  t: Transaction
): Promise<string | null> {
  const lead = await Lead.findByPk(leadId, { transaction: t });
  if (!lead) return null;
  const estado = String(lead.getDataValue('estado_crm'));
  const resumen = `cotización N.° ${cot.numero}${cot.etiqueta ? ` (Opción ${cot.etiqueta})` : ''} aprobada en el Cotizador por ${pesos(cot.total)}`;
  emitirCrmAlConfirmar(t);
  if (estado === 'APROBADO') {
    if (!(Number(lead.getDataValue('monto_real_venta')) > 0)) {
      await lead.update({ monto_real_venta: cot.total }, { transaction: t });
    }
    await evento(leadId, 'SEGUIMIENTO', `${resumen[0].toUpperCase()}${resumen.slice(1)}. El lead ya estaba aprobado.`, usuarioId, t);
    return null;
  }
  await lead.update({ estado_crm: 'APROBADO', fecha_aprobado: new Date(), monto_real_venta: cot.total }, { transaction: t });
  await evento(leadId, 'CAMBIO_ESTADO', `Movido de ${estado} a APROBADO: ${resumen}.`, usuarioId, t);
  return 'El lead pasó a Aprobado.';
}

/** Al pasar la cotización a PERDIDO. `marcarLead` = respuesta del asesor a
 * "¿Marcar también el lead como perdido?". */
export async function sincronizarLeadAlPerder(
  leadId: number,
  cot: { numero: number; motivo: string; detalle: string | null },
  marcarLead: boolean,
  usuarioId: number,
  t: Transaction
): Promise<string | null> {
  const lead = await Lead.findByPk(leadId, { transaction: t });
  if (!lead) return null;
  const estado = String(lead.getDataValue('estado_crm'));
  const motivoTxt = `${ETIQUETA_MOTIVO[cot.motivo] ?? cot.motivo}${cot.detalle ? ` — ${cot.detalle}` : ''}`;
  emitirCrmAlConfirmar(t);
  if (!marcarLead || estado === 'APROBADO' || estado === 'PERDIDO') {
    await evento(leadId, 'SEGUIMIENTO', `Cotización N.° ${cot.numero} marcada como perdida en el Cotizador (motivo: ${motivoTxt}). El lead sigue en ${estado}.`, usuarioId, t);
    return marcarLead && estado === 'APROBADO'
      ? 'El lead está aprobado (tiene otra venta): no se marcó como perdido.'
      : null;
  }
  await lead.update(
    { estado_crm: 'PERDIDO', motivo_perdida: MOTIVO_A_CRM[cot.motivo] ?? 'Otro', fecha_perdido: new Date() },
    { transaction: t }
  );
  await evento(leadId, 'CAMBIO_ESTADO', `Movido de ${estado} a PERDIDO: cotización N.° ${cot.numero} perdida (motivo: ${motivoTxt}).`, usuarioId, t);
  return 'El lead también quedó como Perdido.';
}

// ─── Crear ODP desde una cotización aprobada ────────────────────────────────

/** Roles que el `POST /api/odp` y el `POST /api/crm/:id/crear-odp` admiten hoy. */
const ROLES_CREAN_ODP = new Set(['admin', 'gerencia', 'asesor_comercial', 'jefe_produccion']);

export type CaminoODP = 'prospecto' | 'lead' | 'cliente';

export interface PlanCrearODP {
  puede: boolean;
  /** Por qué no se puede (null si se puede). */
  motivo: string | null;
  camino: CaminoODP | null;
  /** Qué va a pasar, en una frase, para el modal. */
  explicacion: string;
  cotizacion: { id: number; numero: number; total: number; etiqueta: string | null };
  asesor: { id: number | null; nombre: string };
  /** Cliente ya resuelto por el vínculo (null = hay que elegirlo). */
  cliente: { id: number; nombre: string } | null;
  requiereCliente: boolean;
  /** Solo camino lead: se puede crear el cliente con nombre + teléfono (flujo del CRM). */
  permiteClienteNuevo: boolean;
  /** El lead o el prospecto ya tienen ODP: se ofrece vincular la cotización a ella. */
  odpExistente: { id: number; numero: string } | null;
  prospecto: { id: number; numero: string } | null;
  lead: { id: number; nombre: string; estado: string } | null;
}

async function odpCorta(id: number | null | undefined) {
  if (!id) return null;
  const o = await ODP.findByPk(id, { attributes: ['id', 'numero_odp'] });
  return o ? { id: Number(o.getDataValue('id')), numero: String(o.getDataValue('numero_odp')) } : null;
}

async function clienteCorto(id: number | null | undefined) {
  if (!id) return null;
  const c = await Cliente.findByPk(id, { attributes: ['id', 'nombre_razon_social'] });
  return c ? { id: Number(c.getDataValue('id')), nombre: String(c.getDataValue('nombre_razon_social')) } : null;
}

/** Qué haría "Crear ODP" con esta cotización, sin escribir nada (previsualización). */
export async function planCrearODP(cotizacionId: number, user: NonNullable<Express.Request['user']>): Promise<PlanCrearODP> {
  const cot = (await CotizadorCotizacion.findByPk(cotizacionId, { raw: true })) as Fila | null;
  if (!cot) throw new ErrorVinculo(404, 'Cotización no encontrada.');
  const elegida = (await CotizadorPropuesta.findOne({
    where: { cotizacion_id: cotizacionId, elegida: true },
    attributes: ['id', 'etiqueta', 'total_total'],
    raw: true,
  })) as Fila | null;

  const plan: PlanCrearODP = {
    puede: false,
    motivo: null,
    camino: null,
    explicacion: '',
    cotizacion: {
      id: cot.id,
      numero: cot.numero,
      total: Number(elegida?.total_total ?? cot.total_total) || 0,
      etiqueta: elegida?.etiqueta ?? null,
    },
    asesor: { id: cot.asesor_usuario_id ?? null, nombre: cot.asesor || '' },
    cliente: null,
    requiereCliente: false,
    permiteClienteNuevo: false,
    odpExistente: null,
    prospecto: null,
    lead: null,
  };
  const no = (motivo: string) => ({ ...plan, puede: false, motivo });

  if (cot.odp_id) {
    plan.odpExistente = await odpCorta(cot.odp_id);
    return no(`Esta cotización ya está vinculada a la ${plan.odpExistente?.numero ?? `ODP #${cot.odp_id}`}.`);
  }
  if (cot.estado !== 'APROBADA') return no('Primero marca la cotización como Aprobada (en Resumen).');
  if (!elegida) return no('La cotización no tiene una opción elegida.');

  // ── ¿Por qué camino? ────────────────────────────────────────────────────
  let prospectoId: number | null = cot.prospecto_id ?? null;
  if (cot.lead_id) {
    const lead = await Lead.findByPk(cot.lead_id, { attributes: ATTR_LEAD });
    if (!lead) return no('El lead de esta cotización ya no existe.');
    const l = lead.toJSON() as Fila;
    plan.lead = { id: l.id, nombre: l.nombre, estado: l.estado_crm };
    // Un lead que pidió visita técnica tiene su prospecto: si sigue en gestión,
    // aprobarlo es el camino (el propio flujo sincroniza el lead).
    if (l.prospecto_id) {
      const p = await Prospecto.findByPk(l.prospecto_id, { attributes: ['id', 'estado'] });
      if (p && p.getDataValue('estado') === 'en_gestion') prospectoId = l.prospecto_id;
    }
    if (!prospectoId) {
      if (l.odp_id) {
        plan.odpExistente = await odpCorta(l.odp_id);
        return no(`El lead ya tiene la ${plan.odpExistente?.numero ?? 'ODP'}: vincula esta cotización a ella en vez de crear otra.`);
      }
      if (l.estado_crm !== 'APROBADO') {
        return no(`El lead está en ${l.estado_crm}: vuelve a marcar la cotización como Aprobada para sincronizarlo.`);
      }
      plan.camino = 'lead';
      plan.cliente = await clienteCorto(l.cliente_id);
      plan.requiereCliente = !plan.cliente;
      plan.permiteClienteNuevo = true;
      plan.explicacion =
        'Se crea la ODP desde el lead, igual que "Crear ODP" del CRM: queda vinculada al lead y a esta cotización.';
    }
  }

  if (prospectoId) {
    const p = await Prospecto.findByPk(prospectoId, { attributes: ATTR_PROSPECTO });
    if (!p) return no('El prospecto de esta cotización ya no existe.');
    const pr = p.toJSON() as Fila;
    plan.prospecto = { id: pr.id, numero: pr.numero_prospecto };
    if (pr.estado !== 'en_gestion') {
      if (pr.odp_id) {
        plan.odpExistente = await odpCorta(pr.odp_id);
        return no(`El prospecto ${pr.numero_prospecto} ya se aprobó con la ${plan.odpExistente?.numero ?? 'ODP'}: vincula esta cotización a ella.`);
      }
      return no(`El prospecto ${pr.numero_prospecto} está ${ETIQUETA_ESTADO_PROSPECTO[pr.estado] ?? pr.estado}: no se puede aprobar.`);
    }
    const esAdminGerencia = ['admin', 'gerencia'].includes(String(user.rol ?? ''));
    if (!esAdminGerencia && Number(pr.asesor_id) !== Number(user.id)) {
      return no(`Solo el asesor del prospecto ${pr.numero_prospecto}, gerencia o un administrador pueden aprobarlo (y crear su ODP).`);
    }
    plan.camino = 'prospecto';
    plan.cliente = await clienteCorto(pr.cliente_id);
    plan.requiereCliente = !plan.cliente;
    plan.explicacion =
      `Se aprueba el prospecto ${pr.numero_prospecto}, como en el módulo Prospectos: se crea su ODP, se le pasan sus ` +
      'tomas de medidas y el lead de origen (si lo tiene) queda Aprobado.';
  } else if (!plan.camino) {
    if (cot.cliente_id) {
      plan.camino = 'cliente';
      plan.cliente = await clienteCorto(cot.cliente_id);
      if (!plan.cliente) return no('El cliente de esta cotización ya no existe.');
      plan.explicacion = 'Se crea una ODP nueva para el cliente, igual que desde el formulario de ODP.';
    } else {
      return no('La cotización no está vinculada a un lead, prospecto o cliente: vincúlala primero.');
    }
  }

  if (plan.camino !== 'prospecto' && !ROLES_CREAN_ODP.has(String(user.rol ?? ''))) {
    return no('Tu rol no crea ODP (pueden: asesor comercial, jefe de producción, gerencia y administración).');
  }
  return { ...plan, puede: true, motivo: null };
}

/** Descripción del pedido y servicios de la ODP a partir de la opción elegida. */
async function detalleParaODP(cotizacionId: number, numero: number, etiqueta: string | null) {
  const filas = (await sequelize.query(
    `SELECT i.modulo_id, i.descripcion_item, i.cantidad_piezas,
            i.resultado->>'descripcionComercial' AS descripcion_comercial
       FROM cotizador.cotizacion_item i
       JOIN cotizador.propuesta p ON p.id = i.propuesta_id
      WHERE p.cotizacion_id = :id AND p.elegida = true
      ORDER BY i.orden`,
    { replacements: { id: cotizacionId }, type: QueryTypes.SELECT }
  )) as Fila[];
  const servicios = filas.map((f) => {
    const modulo = getModulo(String(f.modulo_id)) as { meta?: { nombre?: string } } | null;
    return {
      cantidad: Number(f.cantidad_piezas) || 1,
      tipo_servicio: modulo?.meta?.nombre ?? String(f.modulo_id),
      descripcion: String(f.descripcion_comercial || f.descripcion_item || modulo?.meta?.nombre || f.modulo_id),
    };
  });
  const cabecera = `Cotización N.° ${numero}${etiqueta ? ` (Opción ${etiqueta})` : ''} del Cotizador`;
  const descripcion = [cabecera, ...servicios.map((s) => `${s.cantidad}x ${s.descripcion}`)].join('\n');
  return { servicios, descripcion, cabecera };
}

export const FORMAS_PAGO = ['contado', 'credito', '50_50'] as const;

/**
 * Ejecuta "Crear ODP". Vuelve a calcular el plan (nada de lo que dijo la
 * previsualización se da por bueno) y llama al flujo existente que corresponda.
 *
 * Candado contra la doble ODP (2026-09-29): los tres flujos que crean la ODP
 * abren su propia transacción, así que no se pueden envolver en una sola. En
 * su lugar se bloquea la fila de la cotización (`FOR UPDATE`) durante toda la
 * operación y se enlaza la ODP dentro de esa misma transacción. Un segundo
 * "Crear ODP" sobre la misma cotización (otra pestaña, un reintento tras un
 * corte de red) espera al primero y, al entrar, el plan ya ve `odp_id` y lo
 * rechaza. Ninguno de los tres flujos escribe en `cotizador.cotizacion`, por
 * eso el candado no puede bloquearse contra sí mismo.
 */
export async function crearODPDesdeCotizacion(
  cotizacionId: number,
  datos: { clienteId?: number; nombre?: string; telefono?: string; formaPago: (typeof FORMAS_PAGO)[number] },
  user: NonNullable<Express.Request['user']>
): Promise<{ odpId: number; numeroOdp: string; camino: CaminoODP }> {
  const t = await sequelize.transaction();
  let resultado: { odpId: number; numeroOdp: string; camino: CaminoODP; leadId: number | null; numeroCot: number };
  try {
    await sequelize.query('SELECT id FROM cotizador.cotizacion WHERE id = :id FOR UPDATE', {
      replacements: { id: cotizacionId },
      type: QueryTypes.SELECT,
      transaction: t,
    });
    resultado = await crearODPBajoCandado(cotizacionId, datos, user, t);
    await t.commit();
  } catch (e) {
    await t.rollback().catch(() => {});
    throw e;
  }

  const { leadId, numeroCot, ...respuesta } = resultado;
  if (leadId) {
    await LeadEvento.create({
      tipo: 'SEGUIMIENTO',
      detalle_texto: `${respuesta.numeroOdp} creada desde la cotización N.° ${numeroCot} del Cotizador.`,
      lead_id: leadId,
      creado_por: user.id,
    });
    // El "Crear ODP" del CRM no avisa al módulo ODP; desde aquí sí.
    import('../../utils/notificaciones').then(({ emitirODPPatch }) => emitirODPPatch(respuesta.odpId, 'create')).catch(() => {});
  }
  return respuesta;
}

async function crearODPBajoCandado(
  cotizacionId: number,
  datos: { clienteId?: number; nombre?: string; telefono?: string; formaPago: (typeof FORMAS_PAGO)[number] },
  user: NonNullable<Express.Request['user']>,
  t: Transaction
): Promise<{ odpId: number; numeroOdp: string; camino: CaminoODP; leadId: number | null; numeroCot: number }> {
  // El plan lee fuera de `t`: el candado ya se tiene, y lo que escribió un
  // "Crear ODP" anterior ya está confirmado.
  const plan = await planCrearODP(cotizacionId, user);
  if (!plan.puede || !plan.camino) throw new ErrorVinculo(409, plan.motivo ?? 'No se puede crear la ODP.');

  const clienteId = plan.cliente?.id ?? datos.clienteId ?? null;
  if (plan.requiereCliente && !clienteId && !(plan.permiteClienteNuevo && datos.telefono?.trim())) {
    throw new ErrorVinculo(
      400,
      plan.permiteClienteNuevo
        ? 'Elige el cliente de la ODP o escribe nombre y teléfono para crearlo.'
        : 'Elige el cliente de la ODP.'
    );
  }
  if (clienteId && !plan.cliente && !(await clienteCorto(clienteId))) {
    throw new ErrorVinculo(404, 'El cliente elegido ya no existe. Búscalo de nuevo.');
  }

  const { servicios, descripcion, cabecera } = await detalleParaODP(cotizacionId, plan.cotizacion.numero, plan.cotizacion.etiqueta);
  const valor = plan.cotizacion.total;
  const asesorId = plan.asesor.id ?? undefined;

  let r: { status: number; body: any };
  let leerId: (b: any) => number;
  let leerNumero: (b: any) => string | null;
  if (plan.camino === 'prospecto') {
    r = await aprobarProspectoRegistro(
      plan.prospecto!.id,
      {
        servicios_detalle: servicios,
        valor_total: valor,
        forma_pago: datos.formaPago,
        observaciones: cabecera,
        ...(plan.cliente ? {} : { cliente_id: clienteId }),
        ...(asesorId ? { asesor_id: asesorId } : {}),
      },
      user
    );
    leerId = (b) => Number(b?.odp?.id ?? b?.odp?.getDataValue?.('id'));
    leerNumero = (b) => b?.odp?.numero_odp ?? b?.odp?.getDataValue?.('numero_odp') ?? null;
  } else if (plan.camino === 'lead') {
    r = await crearODPParaLead(
      plan.lead!.id,
      clienteId ? { cliente_id: clienteId } : { nombre: datos.nombre?.trim() || plan.lead!.nombre, telefono: datos.telefono?.trim() },
      user,
      { asesor_id: asesorId, valor_total: valor, descripcion_pedido: descripcion, forma_pago: datos.formaPago }
    );
    leerId = (b) => Number(b?.odp_id);
    leerNumero = (b) => b?.numero_odp ?? null;
  } else {
    r = await crearODPRegistro(
      {
        cliente_id: clienteId,
        ...(asesorId ? { asesor_id: asesorId } : {}),
        valor_total: valor,
        forma_pago: datos.formaPago,
        servicios_detalle: servicios,
        cantidad_total: servicios.reduce((a, s) => a + s.cantidad, 0) || 1,
        tipo_servicio: servicios[0]?.tipo_servicio,
        descripcion_pedido: descripcion,
      },
      user.id
    );
    leerId = (b) => Number(b?.id ?? b?.getDataValue?.('id'));
    leerNumero = (b) => b?.numero_odp ?? b?.getDataValue?.('numero_odp') ?? null;
  }

  if (r.status !== 201) {
    const msg = typeof r.body?.error === 'string' ? r.body.error : 'No se pudo crear la ODP.';
    throw new ErrorVinculo(r.status >= 400 && r.status < 600 ? r.status : 500, msg);
  }
  const odpId = leerId(r.body);
  let numeroOdp = leerNumero(r.body);
  if (!numeroOdp) numeroOdp = (await odpCorta(odpId))?.numero ?? `#${odpId}`;

  // La ODP ya existe: vincularla a la cotización. Por instancia (no update
  // masivo) para que el hook de auditoría lo registre. Sin subir `version`: la
  // pantalla abierta seguiría autoguardando sin un falso "cambió en otra ventana".
  //
  // Cliente oficial (2026-09-27, decisión del usuario): la cotización deja el
  // nombre escrito a mano al cotizar y toma el del cliente de la ODP —el que se
  // eligió o se creó en este paso—, para que el PDF y los listados muestren el
  // registrado y el filtro por cliente la encuentre. El lead / prospecto de
  // origen se conservan: sigue viéndose de dónde vino.
  const fila = await CotizadorCotizacion.findByPk(cotizacionId, { transaction: t });
  if (fila) {
    const odpFila = await ODP.findByPk(odpId, { attributes: ['cliente_id'] });
    const clienteOdpId = (odpFila?.getDataValue('cliente_id') as number | null | undefined) ?? null;
    const cliente = clienteOdpId
      ? ((await Cliente.findByPk(clienteOdpId, {
          attributes: ['id', 'nombre_razon_social', 'telefono', 'celular', 'direccion'],
          raw: true,
        })) as Fila | null)
      : null;
    await fila.update({
      odp_id: odpId,
      actualizada_en: new Date(),
      ...(cliente
        ? {
            cliente_id: cliente.id,
            cliente_nombre: String(cliente.nombre_razon_social ?? '').slice(0, 150) || fila.getDataValue('cliente_nombre'),
            ...(cliente.celular || cliente.telefono
              ? { cliente_telefono: String(cliente.celular || cliente.telefono).slice(0, 50) }
              : {}),
            ...(cliente.direccion ? { cliente_direccion: String(cliente.direccion).slice(0, 200) } : {}),
          }
        : {}),
    }, { transaction: t });
  }

  return {
    odpId,
    numeroOdp,
    camino: plan.camino,
    leadId: plan.camino === 'lead' ? plan.lead!.id : null,
    numeroCot: plan.cotizacion.numero,
  };
}
