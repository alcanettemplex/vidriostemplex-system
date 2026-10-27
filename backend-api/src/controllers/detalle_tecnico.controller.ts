// Detalles técnicos de Pedidos PV (2026-10-16). El editor de planos (FOR-005) se abre
// desde Gestión PV con la acción «Diseñar»: un plano por letra DT, colgado del pedido
// principal, con su imagen en Cloudinary para pegarla al Excel oficial del proveedor.
// Reglas compartidas en `utils/detalleTecnico.ts`; detalle en docs/modulos/detalles-tecnicos.md.
//
// NO importar `pedido_pv.controller` desde aquí (ciclo de imports, ver CLAUDE.md). El
// socket se emite con `import('../server')` dinámico por la misma razón.
import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { z } from 'zod';
import { v2 as cloudinary } from 'cloudinary';
import { sequelize, PedidoPV, PedidoPVPlano, PedidoPVDtDesbloqueo, ODP, ODPItem, Usuario } from '../models';
import Cliente from '../models/cliente.model';
import {
  disenadoresDe, grupoDePedido, inicialesAsesor, letrasBloqueadas, normalizarLetra, puedeDesbloquearDT, puedeDisenarDT,
} from '../utils/detalleTecnico';

const CARPETA_CLOUDINARY = 'templex_detalles_tecnicos';
/** Tope de la imagen en base64 (~3 MB de PNG). Un plano a 2,5× pesa unos cientos de KB. */
const MAX_IMAGEN_BASE64 = 4 * 1024 * 1024;

const emitirCambioPedidosPV = () => {
  import('../server').then(({ emitirCambio }) => emitirCambio('pedidos_pv')).catch(() => { /* sin socket no se rompe nada */ });
};

const usuarioDe = (req: Request) => req.user as { id: number; rol: string };

// ─── Esquema del dibujo (espejo de frontend-web/.../detalles-tecnicos/modelo/tipos.ts) ──
const num = z.number().finite();
const grupo = z.object({ id: z.string().max(60), nombre: z.string().max(120) }).strict().optional();
const operacion = z.discriminatedUnion('tipo', [
  z.object({ id: z.string().max(60), grupo, tipo: z.literal('perforacion'), d: num, x: num, refX: z.enum(['izq', 'der', 'centro']), y: num, refY: z.enum(['sup', 'inf', 'centro']) }).strict(),
  // Media perforación (2026-10-19): centro sobre el canto, `pos` medido al centro. Cuenta como PERF.
  z.object({ id: z.string().max(60), grupo, tipo: z.literal('media-perforacion'), borde: z.enum(['sup', 'der', 'inf', 'izq']), pos: num, desde: z.enum(['inicio', 'fin']), d: num }).strict(),
  // `alivio` (2026-10-20): un círculo a cada lado del boquete. Opcional: los planos anteriores no lo traen.
  z.object({ id: z.string().max(60), grupo, tipo: z.literal('boquete'), borde: z.enum(['sup', 'der', 'inf', 'izq']), pos: num, desde: z.enum(['inicio', 'fin']), largo: num, prof: num, radio: num, alivio: z.object({ d: num, fondo: num }).strict().optional() }).strict(),
  z.object({ id: z.string().max(60), grupo, tipo: z.literal('chaflan'), borde: z.enum(['sup', 'der', 'inf', 'izq']), ancho: num }).strict(),
  z.object({ id: z.string().max(60), grupo, tipo: z.literal('nota'), texto: z.string().max(200), x: num, y: num }).strict(),
]);
const tratamiento = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('recta') }).strict(),
  z.object({ tipo: z.literal('despunte'), a: num, b: num }).strict(),
  z.object({ tipo: z.literal('radio'), r: num }).strict(),
  z.object({ tipo: z.literal('muesca'), a: num, b: num }).strict(),
]);
const contorno = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('rectangular') }).strict(),
  z.object({ tipo: z.literal('desplome-lateral'), lado: z.enum(['izq', 'der']), anchoSup: num }).strict(),
  z.object({ tipo: z.literal('desplome-superior'), lado: z.enum(['izq', 'der']), altoLado: num }).strict(),
  // Remate en arco de medio punto (2026-10-20): el canto `lado` completo es un semicírculo.
  z.object({ tipo: z.literal('arco'), lado: z.enum(['sup', 'der', 'inf', 'izq']) }).strict(),
  // Círculo completo (2026-10-27): el diámetro es `ancho` (= `alto`).
  z.object({ tipo: z.literal('circulo') }).strict(),
]);
const piezaSchema = z.object({
  ancho: num.positive(),
  alto: num.positive(),
  contorno,
  esquinas: z.object({ si: tratamiento, sd: tratamiento, id: tratamiento, ii: tratamiento }).strict(),
  operaciones: z.array(operacion).max(200),
  // Cotas generales escritas como ANCHO / ALTO (vidrios de la letra con medidas distintas).
  // Opcional: los planos guardados antes del 2026-10-17 no lo traen y siguen siendo válidos.
  rotulos: z.object({ ancho: z.boolean(), alto: z.boolean() }).strict().optional(),
}).strict();

const guardarPlanoSchema = z.object({
  plantilla_id: z.string().max(60).nullable(),
  nombre: z.string().trim().min(1).max(150),
  sello_en_canto: z.boolean(),
  observaciones: z.string().max(2000),
  pieza: piezaSchema,
  esquema: z.number().int().positive(),
  conteos: z.object({
    perf: z.number().int().nonnegative(),
    boq: z.number().int().nonnegative(),
    dsp: z.number().int().nonnegative(),
    radios: z.number().int().nonnegative(),
    chaflanMl: z.number().nonnegative(),
    m2: z.number().nonnegative(),
    // Metros de chaflán por medida de vidrio de la letra (`"700x1800": 4.1`, 2026-10-17): un
    // plano sirve para vidrios de varias medidas y el Excel no tiene la geometría para medirlos.
    chaflanPorMedida: z.record(z.string().regex(/^\d+x\d+$/), z.number().nonnegative())
      .refine((r) => Object.keys(r).length <= 200, 'Demasiadas medidas en un plano.')
      .optional(),
  }).strict(),
  imagen: z.string().startsWith('data:image/png;base64,').max(MAX_IMAGEN_BASE64),
  imagen_ancho: z.number().int().positive().max(2000),
  imagen_alto: z.number().int().positive().max(2000),
  /** `actualizado_en` que el editor cargó; null si el plano es nuevo. */
  version: z.string().nullable(),
}).strict();

const cambiarLetrasSchema = z.object({
  cambios: z.array(z.object({
    item_id: z.number().int().positive(),
    letra: z.string().trim().max(10).nullable(),
  }).strict()).min(1).max(200),
}).strict();

const bloqueoSchema = z.object({ desbloquear: z.boolean() }).strict();

/** Primer mensaje de Zod en lenguaje del usuario (los arrays de issues son ilegibles). */
const mensajeZod = (e: z.ZodError, contexto: string) => {
  const p = e.issues[0];
  return `${contexto}: ${p?.message ?? 'datos inválidos'}${p?.path?.length ? ` (campo «${p.path.join('.')}»)` : ''}.`;
};

// ─── Carga del grupo completo ─────────────────────────────────────────────────

async function cargarContexto(pedidoId: number) {
  const grupoPV = await grupoDePedido(pedidoId);
  if (!grupoPV) return null;
  const { base, pedidos } = grupoPV;
  const ids = pedidos.map((p) => p.getDataValue('id') as number);
  const items = await ODPItem.findAll({
    where: { pedido_pv_id: { [Op.in]: ids } },
    attributes: ['id', 'pedido_pv_id', 'item', 'prod', 'cantidad', 'color', 'espesor', 'ancho_mm', 'alto_mm', 'dt', 'perforaciones', 'boquetes', 'observaciones_pv'],
    order: [['id', 'ASC']],
  });
  const estadoPorPedido = new Map<number, string>(pedidos.map((p) => [p.getDataValue('id') as number, p.getDataValue('estado') as string]));
  const desbloqueo = await PedidoPVDtDesbloqueo.findByPk(base.getDataValue('id'), {
    include: [{ model: Usuario, as: 'desbloqueador', attributes: ['id', 'nombre_completo'] }],
  });
  const bloqueadas = letrasBloqueadas(
    items.map((i) => ({ id: i.getDataValue('id'), pedido_pv_id: i.getDataValue('pedido_pv_id'), dt: i.getDataValue('dt') })),
    estadoPorPedido,
    !!desbloqueo,
  );
  return { base, pedidos, items, estadoPorPedido, desbloqueo, bloqueadas };
}

/** ¿El ítem está en un pedido ya enviado (y el grupo no está desbloqueado)? */
const itemBloqueado = (pedidoPvId: number | null, estadoPorPedido: Map<number, string>, desbloqueado: boolean) =>
  !desbloqueado && pedidoPvId !== null && (estadoPorPedido.get(pedidoPvId) ?? 'PENDIENTE') !== 'PENDIENTE';

// GET /api/detalle-tecnico/pedido/:id — todo lo que el editor necesita del grupo.
// Lectura abierta a quien ya ve Pedidos PV (el imprimible de Gestión PV la usa).
export const getDisenoPedido = async (req: Request, res: Response) => {
  try {
    const ctx = await cargarContexto(Number(req.params.id));
    if (!ctx) return res.status(404).json({ error: 'El pedido PV no existe o no nació de una ODP, así que no lleva detalles técnicos.' });
    const { base, pedidos, items, estadoPorPedido, desbloqueo, bloqueadas } = ctx;

    const odp = await ODP.findByPk(base.getDataValue('odp_id'), {
      attributes: ['id', 'numero_odp'],
      include: [
        { model: Cliente, as: 'cliente', attributes: ['id', 'nombre_razon_social'] },
        { model: Usuario, as: 'asesor', attributes: ['id', 'nombre_completo'] },
      ],
    });
    const planos = await PedidoPVPlano.findAll({ where: { pedido_pv_id: base.getDataValue('id') }, order: [['letra', 'ASC']] });
    const disenadores = await disenadoresDe(planos);
    const user = usuarioDe(req);
    const asesor = (odp?.getDataValue('asesor') as Usuario | null)?.getDataValue('nombre_completo') as string | undefined;

    res.json({
      pedido_base_id: base.getDataValue('id'),
      encabezado: {
        numero_pedido: base.getDataValue('numero_pedido'),
        proveedor: base.getDataValue('proveedor'),
        creado_en: base.getDataValue('creado_en'),
        odp_id: odp?.getDataValue('id') ?? null,
        numero_odp: odp?.getDataValue('numero_odp') ?? '',
        cliente: (odp?.getDataValue('cliente') as Cliente | null)?.getDataValue('nombre_razon_social') ?? '',
        asesor_nombre: asesor ?? '',
        asesor_iniciales: inicialesAsesor(asesor) || (base.getDataValue('asesor_iniciales') ?? ''),
      },
      pedidos: pedidos.map((p) => ({
        id: p.getDataValue('id'),
        numero_pedido: p.getDataValue('numero_pedido'),
        sufijo: p.getDataValue('sufijo'),
        estado: p.getDataValue('estado'),
        proveedor: p.getDataValue('proveedor'),
      })),
      items: items.map((i) => ({
        id: i.getDataValue('id'),
        pedido_pv_id: i.getDataValue('pedido_pv_id'),
        item: i.getDataValue('item'),
        prod: i.getDataValue('prod'),
        cantidad: i.getDataValue('cantidad'),
        color: i.getDataValue('color'),
        espesor: i.getDataValue('espesor'),
        ancho_mm: i.getDataValue('ancho_mm'),
        alto_mm: i.getDataValue('alto_mm'),
        letra: normalizarLetra(i.getDataValue('dt')),
        perforaciones: i.getDataValue('perforaciones'),
        boquetes: i.getDataValue('boquetes'),
        observaciones_pv: i.getDataValue('observaciones_pv'),
        bloqueado: itemBloqueado(i.getDataValue('pedido_pv_id'), estadoPorPedido, !!desbloqueo),
      })),
      planos: planos.map((p) => ({ ...p.toJSON(), disenado_por: disenadores.get(p.getDataValue('id')) ?? null })),
      letras_bloqueadas: Array.from(bloqueadas),
      desbloqueo: desbloqueo
        ? {
          en: desbloqueo.getDataValue('desbloqueado_en'),
          por: (desbloqueo.getDataValue('desbloqueador') as Usuario | null)?.getDataValue('nombre_completo') ?? '',
        }
        : null,
      hay_enviados: pedidos.some((p) => p.getDataValue('estado') !== 'PENDIENTE'),
      puede_editar: await puedeDisenarDT(user),
      puede_desbloquear: puedeDesbloquearDT(user.rol),
    });
  } catch (error) {
    console.error('Error getDisenoPedido:', error);
    res.status(500).json({ error: 'No se pudieron cargar los detalles técnicos del pedido. Recarga la página.' });
  }
};

// PUT /api/detalle-tecnico/pedido/:id/plano/:letra — crea o reemplaza el plano de la letra.
// Además actualiza PERF y BOQ de los vidrios de esa letra con lo dibujado (decisión
// 2026-10-16): así el formulario del proveedor y el plano no se contradicen.
export const guardarPlano = async (req: Request, res: Response) => {
  const user = usuarioDe(req);
  const letra = normalizarLetra(req.params.letra);
  if (!letra) return res.status(400).json({ error: 'Falta la letra DT del plano.' });
  if (!(await puedeDisenarDT(user))) {
    return res.status(403).json({ error: 'Solo admin y quien gestiona Pedidos PV pueden diseñar detalles técnicos.' });
  }
  const parsed = guardarPlanoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: mensajeZod(parsed.error, `No se pudo guardar el plano ${letra}`) });
  const d = parsed.data;

  const ctx = await cargarContexto(Number(req.params.id)).catch(() => null);
  if (!ctx) return res.status(404).json({ error: 'El pedido PV no existe o no nació de una ODP.' });
  const itemsLetra = ctx.items.filter((i) => normalizarLetra(i.getDataValue('dt')) === letra);
  if (itemsLetra.length === 0) {
    return res.status(409).json({ error: `Ningún vidrio del pedido tiene la letra ${letra}. Asígnala a un vidrio antes de guardar su plano.` });
  }
  if (ctx.bloqueadas.has(letra)) {
    return res.status(409).json({ error: `El plano ${letra} está bloqueado: su pedido ya se envió al proveedor. Solo un administrador puede desbloquearlo.` });
  }
  const baseId = ctx.base.getDataValue('id') as number;
  const existente = await PedidoPVPlano.findOne({ where: { pedido_pv_id: baseId, letra } });
  const versionActual = existente ? new Date(existente.getDataValue('actualizado_en')).toISOString() : null;
  if (versionActual !== (d.version ? new Date(d.version).toISOString() : null)) {
    return res.status(409).json({ error: `Otra persona guardó el plano ${letra} mientras lo editabas. Recarga para ver su versión antes de guardar la tuya.` });
  }

  // La imagen se sube antes de la transacción; si la BD falla, se borra para no dejar huérfanos.
  let subida: { secure_url: string; public_id: string };
  try {
    subida = await cloudinary.uploader.upload(d.imagen, { folder: CARPETA_CLOUDINARY, resource_type: 'image', format: 'png' });
  } catch (error) {
    console.error('Error subiendo imagen de plano DT:', error);
    return res.status(502).json({ error: `No se pudo subir la imagen del plano ${letra}. Revisa la conexión e intenta de nuevo; no se guardó nada.` });
  }

  const t = await sequelize.transaction();
  try {
    const ahora = new Date();
    const valores = {
      plantilla_id: d.plantilla_id,
      nombre: d.nombre,
      sello_en_canto: d.sello_en_canto,
      observaciones: d.observaciones || null,
      pieza: d.pieza,
      esquema: d.esquema,
      conteos: d.conteos,
      imagen_url: subida.secure_url,
      imagen_public_id: subida.public_id,
      imagen_ancho: d.imagen_ancho,
      imagen_alto: d.imagen_alto,
      actualizado_por: user.id,
      actualizado_en: ahora,
    };
    const anteriorPublicId = existente?.getDataValue('imagen_public_id') as string | null;
    const plano = existente
      ? await existente.update(valores, { transaction: t })
      : await PedidoPVPlano.create({ ...valores, pedido_pv_id: baseId, letra, creado_por: user.id, creado_en: ahora }, { transaction: t });

    // `individualHooks`: un update en bloque no dispara la auditoría por fila (TECH_DEBT 2026-07-02).
    await ODPItem.update(
      { perforaciones: d.conteos.perf, boquetes: d.conteos.boq },
      { where: { id: { [Op.in]: itemsLetra.map((i) => i.getDataValue('id')) } }, transaction: t, individualHooks: true },
    );
    await t.commit();

    if (anteriorPublicId) cloudinary.uploader.destroy(anteriorPublicId).catch(() => { /* huérfano, sin impacto */ });
    emitirCambioPedidosPV();
    res.json(plano.toJSON());
  } catch (error) {
    await t.rollback();
    cloudinary.uploader.destroy(subida.public_id).catch(() => { /* huérfano, sin impacto */ });
    console.error('Error guardarPlano:', error);
    res.status(500).json({ error: `No se pudo guardar el plano ${letra}. Intenta de nuevo; si persiste, avisa a sistemas.` });
  }
};

// DELETE /api/detalle-tecnico/pedido/:id/plano/:letra — borra el plano (no toca PERF/BOQ).
export const eliminarPlano = async (req: Request, res: Response) => {
  try {
    const user = usuarioDe(req);
    const letra = normalizarLetra(req.params.letra);
    if (!letra) return res.status(400).json({ error: 'Falta la letra DT del plano.' });
    if (!(await puedeDisenarDT(user))) {
      return res.status(403).json({ error: 'Solo admin y quien gestiona Pedidos PV pueden borrar detalles técnicos.' });
    }
    const ctx = await cargarContexto(Number(req.params.id));
    if (!ctx) return res.status(404).json({ error: 'El pedido PV no existe o no nació de una ODP.' });
    if (ctx.bloqueadas.has(letra)) {
      return res.status(409).json({ error: `El plano ${letra} está bloqueado: su pedido ya se envió al proveedor. Solo un administrador puede desbloquearlo.` });
    }
    const plano = await PedidoPVPlano.findOne({ where: { pedido_pv_id: ctx.base.getDataValue('id'), letra } });
    if (!plano) return res.status(404).json({ error: `El plano ${letra} ya no existe.` });
    const publicId = plano.getDataValue('imagen_public_id') as string | null;
    await plano.destroy();
    if (publicId) cloudinary.uploader.destroy(publicId).catch(() => { /* huérfano, sin impacto */ });
    emitirCambioPedidosPV();
    res.json({ ok: true });
  } catch (error) {
    console.error('Error eliminarPlano:', error);
    res.status(500).json({ error: 'No se pudo borrar el plano. Intenta de nuevo.' });
  }
};

// PATCH /api/detalle-tecnico/pedido/:id/letras — asigna o cambia la letra DT de vidrios
// del grupo. No pasa por `asignarItems` a propósito: ese recrea las extensiones.
export const cambiarLetras = async (req: Request, res: Response) => {
  const user = usuarioDe(req);
  if (!(await puedeDisenarDT(user))) {
    return res.status(403).json({ error: 'Solo admin y quien gestiona Pedidos PV pueden cambiar las letras DT.' });
  }
  const parsed = cambiarLetrasSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: mensajeZod(parsed.error, 'No se pudieron cambiar las letras') });

  const ctx = await cargarContexto(Number(req.params.id)).catch(() => null);
  if (!ctx) return res.status(404).json({ error: 'El pedido PV no existe o no nació de una ODP.' });
  const desbloqueado = !!ctx.desbloqueo;
  const porId = new Map(ctx.items.map((i) => [i.getDataValue('id') as number, i]));

  for (const c of parsed.data.cambios) {
    const it = porId.get(c.item_id);
    if (!it) return res.status(400).json({ error: 'Uno de los vidrios no pertenece a este pedido. Recarga la página.' });
    if (itemBloqueado(it.getDataValue('pedido_pv_id'), ctx.estadoPorPedido, desbloqueado)) {
      return res.status(409).json({ error: 'Uno de los vidrios va en un pedido ya enviado al proveedor: su letra no se puede cambiar sin que un administrador desbloquee el pedido.' });
    }
  }

  const t = await sequelize.transaction();
  try {
    for (const c of parsed.data.cambios) {
      await ODPItem.update({ dt: normalizarLetra(c.letra) }, { where: { id: c.item_id }, transaction: t, individualHooks: true });
    }
    await t.commit();
    emitirCambioPedidosPV();
    res.json({ ok: true });
  } catch (error) {
    await t.rollback();
    console.error('Error cambiarLetras:', error);
    res.status(500).json({ error: 'No se pudieron cambiar las letras DT. Intenta de nuevo.' });
  }
};

// PATCH /api/detalle-tecnico/pedido/:id/bloqueo — solo admin: desbloquea los planos de un
// pedido ya enviado, o lo vuelve a bloquear. Queda abierto hasta que admin lo bloquee.
export const cambiarBloqueo = async (req: Request, res: Response) => {
  try {
    const user = usuarioDe(req);
    if (!puedeDesbloquearDT(user.rol)) {
      return res.status(403).json({ error: 'Solo un administrador puede desbloquear o bloquear los detalles técnicos.' });
    }
    const parsed = bloqueoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: mensajeZod(parsed.error, 'No se pudo cambiar el bloqueo') });
    const grupoPV = await grupoDePedido(Number(req.params.id));
    if (!grupoPV) return res.status(404).json({ error: 'El pedido PV no existe o no nació de una ODP.' });
    const baseId = grupoPV.base.getDataValue('id') as number;

    const actual = await PedidoPVDtDesbloqueo.findByPk(baseId);
    if (parsed.data.desbloquear && !actual) {
      await PedidoPVDtDesbloqueo.create({ pedido_pv_id: baseId, desbloqueado_por: user.id, desbloqueado_en: new Date() });
    } else if (!parsed.data.desbloquear && actual) {
      await actual.destroy();
    }
    emitirCambioPedidosPV();
    res.json({ ok: true, desbloqueado: parsed.data.desbloquear });
  } catch (error) {
    console.error('Error cambiarBloqueo:', error);
    res.status(500).json({ error: 'No se pudo cambiar el bloqueo de los detalles técnicos. Intenta de nuevo.' });
  }
};
