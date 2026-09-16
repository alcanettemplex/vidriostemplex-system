// Capa de ESCRITURA de calibración: registrar contrastes del taller, aprobar/
// anular márgenes y holguras, y gobernar el estado de madurez de cada sistema.
//
// La LECTURA para los motores de cálculo (getMargenes/getHolguras/getSistemas)
// ya existe en `cotizador/store/calibracionStore.ts` y sale de la caché — este
// controlador escribe en las tablas reales de Postgres y, ya con el commit
// hecho, invalida la caché (`cache.recargar('calibracion')`, mismo mecanismo
// que `recargarPrecios()` en `lib/catalogo.ts`) para que el siguiente cálculo
// vea el cambio sin reiniciar el proceso.
//
// Todas las tablas y la matemática (`lib/calibracion.ts`) ya existían: ver
// TECH_DEBT.md 2026-09-13 y el plan de la sesión 2026-09-16. Este archivo NO
// inventa reglas de negocio nuevas, solo las conecta a HTTP.
import { Request, Response } from 'express';
import { z } from 'zod';
import { Op } from 'sequelize';
import {
  sequelize,
  Usuario,
  CotizadorCalibracionContraste,
  CotizadorCalibracionMargen,
  CotizadorCalibracionHolgura,
  CotizadorCalibracionSistema,
  CotizadorCalibracionHistorial,
} from '../models';
import * as cache from '../cotizador/cache';
import { analizarPieza, evaluarMadurez, margenEfectivo } from '../cotizador/lib/calibracion';
import { inventarioPiezasDeSistema } from '../cotizador/lib/aptitudOrden';

function responderZod(res: Response, e: unknown): boolean {
  if (e instanceof z.ZodError) {
    res.status(400).json({ error: e.issues[0]?.message ?? 'Datos inválidos.' });
    return true;
  }
  return false;
}

/** Nombre legible del usuario autenticado, para los campos "_por" (STRING(80),
 * no FK — heredado del store original en JSON). Cae al id si el usuario no
 * está o no tiene nombre, para no dejar el campo vacío. */
async function actorDesdeRequest(req: Request): Promise<string> {
  const id = req.user?.id;
  if (!id) return 'desconocido';
  const usuario = await Usuario.findByPk(id, { attributes: ['nombre_completo'] });
  return (usuario?.getDataValue('nombre_completo') as string | undefined) || `usuario-${id}`;
}

function listarSistemas(): string[] {
  const set = new Set<string>();
  for (const d of cache.getDisenos()) set.add(d.sistema);
  return [...set].sort();
}

// ─── Sistemas ────────────────────────────────────────────────────────────────

/** GET /calibracion/sistemas — los sistemas del Cotizador con su madurez
 * calculada. Replica el criterio de `aptitudOrden.madurezDeSistema` (mismo
 * `evaluarMadurez`/`margenEfectivo`, mismo `inventarioPiezasDeSistema`) para
 * que esta pantalla y el bloqueo real de impresión nunca puedan divergir. */
export const listarEstadoSistemas = async (_req: Request, res: Response) => {
  try {
    const margenes = cache.getMargenes();
    const sistemasGuardados = cache.getSistemas();
    const filas = listarSistemas().map((sistema) => {
      const piezas = inventarioPiezasDeSistema(sistema);
      let piezasTotales = 0;
      let piezasVetadas = 0;
      let piezasConMargen = 0;
      for (const p of piezas) {
        piezasTotales++;
        if (p.nivelCorte === 'C') piezasVetadas++;
        const m = margenEfectivo(margenes, { sistema, material: p.material, ref: p.ref });
        if (m.origen === 'pieza') piezasConMargen++;
      }
      const guardado = sistemasGuardados?.[sistema];
      const madurez = evaluarMadurez({
        piezasTotales,
        piezasConMargen,
        piezasVetadas,
        firmaMaestro: Boolean(guardado?.firmaMaestro),
      });
      // Un estado guardado en EN_CALIBRACION es un freno manual y siempre gana;
      // cualquier otro valor guardado (o ninguno) deja mandar al cálculo — ver
      // el mismo criterio en aptitudOrden.ts::madurezDeSistema.
      const estado = guardado?.estado === 'EN_CALIBRACION' ? 'EN_CALIBRACION' : madurez.estado;
      return {
        sistema,
        estado,
        pausadoManualmente: guardado?.estado === 'EN_CALIBRACION' && madurez.estado !== 'EN_CALIBRACION',
        firmaMaestro: Boolean(guardado?.firmaMaestro),
        cobertura: madurez.cobertura,
        piezasTotales,
        piezasConMargen,
        piezasVetadas,
        motivo: madurez.motivo,
        actualizadoEn: guardado?.actualizadoEn ?? null,
        actualizadoPor: guardado?.actualizadoPor ?? null,
      };
    });
    res.json(filas);
  } catch (e) {
    console.error('listarEstadoSistemas:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo leer el estado de los sistemas.' });
  }
};

/** GET /calibracion/piezas/:sistema — inventario de piezas calibrables de un
 * sistema (perfiles + vidrio si aplica), con su margen efectivo actual. */
export const listarPiezasDeSistema = async (req: Request, res: Response) => {
  const { sistema } = req.params;
  try {
    const margenes = cache.getMargenes();
    const piezas = inventarioPiezasDeSistema(sistema);
    if (piezas.length === 0) {
      return res.status(404).json({ error: `El sistema "${sistema}" no tiene diseños o no existe.` });
    }
    const conteos = (await CotizadorCalibracionContraste.findAll({
      where: { sistema, anulado: false },
      attributes: ['ref'],
      raw: true,
    })) as unknown as Array<{ ref: string }>;
    const contrastesPorRef = new Map<string, number>();
    for (const c of conteos) contrastesPorRef.set(c.ref, (contrastesPorRef.get(c.ref) ?? 0) + 1);

    res.json(
      piezas.map((p) => ({
        ...p,
        margenEfectivo: margenEfectivo(margenes, { sistema, material: p.material, ref: p.ref }),
        contrastesVigentes: contrastesPorRef.get(p.ref) ?? 0,
      }))
    );
  } catch (e) {
    console.error('listarPiezasDeSistema:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo leer el inventario de piezas del sistema.' });
  }
};

const pausadoSchema = z.object({ pausado: z.boolean().optional(), firmaMaestro: z.boolean().optional() }).strict();

/**
 * PATCH /calibracion/sistemas/:sistema — pausar/reanudar (freno manual) y/o
 * marcar/retirar la firma del maestro.
 *
 * `EN_PRODUCCION` NUNCA se escribe a mano aquí: sólo lo declara el cálculo
 * (cobertura 100% + firma). "reanudar" no borra el freno con NULL —la columna
 * es ENUM NOT NULL— sino que escribe `VALIDADO` como centinela de "sin freno
 * manual": `madurezDeSistema` sólo trata distinto el valor exacto
 * `EN_CALIBRACION`, así que cualquier otro valor guardado deja mandar al
 * cálculo real (ver aptitudOrden.ts).
 */
export const actualizarEstadoSistema = async (req: Request, res: Response) => {
  const { sistema } = req.params;
  try {
    const datos = pausadoSchema.parse(req.body ?? {});
    if (datos.pausado === undefined && datos.firmaMaestro === undefined) {
      return res.status(400).json({ error: 'Indica "pausado" y/o "firmaMaestro".' });
    }
    if (!listarSistemas().includes(sistema)) {
      return res.status(404).json({ error: `El sistema "${sistema}" no existe.` });
    }

    const actor = await actorDesdeRequest(req);
    const ahora = new Date();
    const t = await sequelize.transaction();
    try {
      const [fila] = await CotizadorCalibracionSistema.findOrCreate({
        where: { sistema },
        defaults: { sistema, estado: 'EN_CALIBRACION', firma_maestro: false },
        transaction: t,
      });
      const cambios: Record<string, unknown> = { actualizado_en: ahora, actualizado_por: actor };
      if (datos.pausado !== undefined) cambios.estado = datos.pausado ? 'EN_CALIBRACION' : 'VALIDADO';
      if (datos.firmaMaestro !== undefined) cambios.firma_maestro = datos.firmaMaestro;
      await fila.update(cambios, { transaction: t });

      await CotizadorCalibracionHistorial.create(
        { fecha: ahora, accion: 'cambiar-estado', payload: { sistema, ...datos, por: actor } },
        { transaction: t }
      );
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }

    await cache.recargar('calibracion');
    res.json({ ok: true });
  } catch (e) {
    if (responderZod(res, e)) return;
    console.error('actualizarEstadoSistema:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo actualizar el estado del sistema.' });
  }
};

// ─── Contrastes ──────────────────────────────────────────────────────────────

const contrasteSchema = z
  .object({
    sistema: z.string().min(1).max(60),
    ref: z.string().min(1).max(30),
    material: z.enum(['aluminio', 'vidrio']),
    medidaSistemaBrutaMm: z.number().finite(),
    medidaMaestroMm: z.number().finite(),
    anchoVanoMm: z.number().finite().nullable().optional(),
    altoVanoMm: z.number().finite().nullable().optional(),
    nota: z.string().max(2000).nullable().optional(),
  })
  .strict();

/** GET /calibracion/contrastes?sistema=&ref= — contrastes vigentes (no
 * anulados) de una pieza, más recientes primero. */
export const listarContrastes = async (req: Request, res: Response) => {
  const { sistema, ref } = req.query;
  if (typeof sistema !== 'string' || typeof ref !== 'string') {
    return res.status(400).json({ error: 'Se requieren los parámetros "sistema" y "ref".' });
  }
  try {
    const filas = await CotizadorCalibracionContraste.findAll({
      where: { sistema, ref },
      order: [['registrado_en', 'DESC']],
    });
    res.json(filas);
  } catch (e) {
    console.error('listarContrastes:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudieron leer los contrastes.' });
  }
};

/** POST /calibracion/contrastes — registrar un contraste (formulario suelto:
 * sistema + pieza + medida del sistema + medida real del maestro). Valida que
 * la pieza exista en el inventario del sistema para no dejar entrar un typo
 * de `ref` que después nunca aparecería en ningún análisis. */
export const registrarContraste = async (req: Request, res: Response) => {
  try {
    const datos = contrasteSchema.parse(req.body ?? {});
    const piezas = inventarioPiezasDeSistema(datos.sistema);
    const pieza = piezas.find((p) => p.ref === datos.ref);
    if (!pieza) {
      return res.status(400).json({
        error: `"${datos.ref}" no es una pieza conocida del sistema "${datos.sistema}". Consulta GET /calibracion/piezas/${encodeURIComponent(datos.sistema)} para ver las piezas válidas.`,
      });
    }
    if (pieza.material !== datos.material) {
      return res.status(400).json({
        error: `La pieza "${datos.ref}" es de material "${pieza.material}", no "${datos.material}".`,
      });
    }

    const actor = await actorDesdeRequest(req);
    const fila = await CotizadorCalibracionContraste.create({
      registrado_en: new Date(),
      anulado: false,
      sistema: datos.sistema,
      ref: datos.ref,
      material: datos.material,
      medida_sistema_bruta_mm: datos.medidaSistemaBrutaMm,
      medida_maestro_mm: datos.medidaMaestroMm,
      ancho_vano_mm: datos.anchoVanoMm ?? null,
      alto_vano_mm: datos.altoVanoMm ?? null,
      nota: datos.nota ?? null,
      registrado_por: actor,
    });
    res.status(201).json(fila);
  } catch (e) {
    if (responderZod(res, e)) return;
    console.error('registrarContraste:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo registrar el contraste.' });
  }
};

const anularContrasteSchema = z.object({ motivo: z.string().min(1, 'El motivo de anulación es obligatorio.').max(2000) }).strict();

/** PATCH /calibracion/contrastes/:id/anular — anulación lógica, nunca DELETE
 * (invariante del modelo: el dato crudo del taller jamás se corrige ni se
 * borra). */
export const anularContraste = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Identificador de contraste inválido.' });
  try {
    const datos = anularContrasteSchema.parse(req.body ?? {});
    const fila = await CotizadorCalibracionContraste.findByPk(id);
    if (!fila) return res.status(404).json({ error: 'Contraste no encontrado.' });
    if (fila.getDataValue('anulado')) return res.status(400).json({ error: 'Este contraste ya estaba anulado.' });

    await fila.update({ anulado: true, anulado_en: new Date(), motivo_anulacion: datos.motivo });
    res.json(fila);
  } catch (e) {
    if (responderZod(res, e)) return;
    console.error('anularContraste:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo anular el contraste.' });
  }
};

/** GET /calibracion/analisis?sistema=&ref= — corre `analizarPieza()` sobre los
 * contrastes vigentes de esa pieza. Material y nivelCorte se derivan del
 * inventario del sistema, no se piden al cliente: son datos del catálogo, no
 * una opinión de quien llama. */
export const analizarPiezaEndpoint = async (req: Request, res: Response) => {
  const { sistema, ref } = req.query;
  if (typeof sistema !== 'string' || typeof ref !== 'string') {
    return res.status(400).json({ error: 'Se requieren los parámetros "sistema" y "ref".' });
  }
  try {
    const pieza = inventarioPiezasDeSistema(sistema).find((p) => p.ref === ref);
    if (!pieza) {
      return res.status(404).json({ error: `"${ref}" no es una pieza conocida del sistema "${sistema}".` });
    }
    const contrastes = (await CotizadorCalibracionContraste.findAll({
      where: { sistema, ref, anulado: false },
      raw: true,
    })) as unknown as Array<Record<string, unknown>>;
    const analisis = analizarPieza(
      contrastes.map((c) => ({
        medidaSistemaBrutaMm: c.medida_sistema_bruta_mm as number,
        medidaMaestroMm: c.medida_maestro_mm as number,
        anchoVanoMm: c.ancho_vano_mm as number | null,
        altoVanoMm: c.alto_vano_mm as number | null,
      })),
      { material: pieza.material, nivelCorte: pieza.nivelCorte ?? 'A' }
    );
    res.json({ sistema, ref, ...analisis });
  } catch (e) {
    console.error('analizarPiezaEndpoint:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo analizar la pieza.' });
  }
};

// ─── Márgenes ────────────────────────────────────────────────────────────────

const margenSchema = z
  .object({
    ambito: z.enum(['global', 'sistema', 'material', 'pieza']),
    sistema: z.string().min(1).max(60).optional(),
    material: z.enum(['aluminio', 'vidrio']).optional(),
    ref: z.string().min(1).max(30).optional(),
    margenMm: z.number().finite(),
    evidencia: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.ambito !== 'global' && !d.sistema) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `El ámbito "${d.ambito}" requiere "sistema".` });
    }
    if (d.ambito === 'material' && !d.material) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El ámbito "material" requiere "material".' });
    }
    if (d.ambito === 'pieza' && (!d.ref || !d.material)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El ámbito "pieza" requiere "ref" y "material".' });
    }
  });

/** Misma fórmula que `margenEfectivo()` (calibracion.ts) para derivar la
 * `clave` de la cascada — no se reinventa el criterio, se replica el cómputo
 * inverso. */
function claveDeMargen(d: z.infer<typeof margenSchema>): string {
  switch (d.ambito) {
    case 'global':
      return 'global';
    case 'sistema':
      return d.sistema as string;
    case 'material':
      return `${d.sistema}|${d.material}`;
    case 'pieza':
      return `${d.sistema}|${d.ref}`;
  }
}

/** POST /calibracion/margenes — aprobar un margen. Versiona por reemplazo: la
 * fila vigente anterior de esa (ambito, clave) pasa a `vigente:false` y se
 * inserta la nueva — nunca se hace UPDATE del valor en la fila vieja, para no
 * perder el historial de qué se aprobó cuándo. */
export const aprobarMargen = async (req: Request, res: Response) => {
  try {
    const datos = margenSchema.parse(req.body ?? {});
    const clave = claveDeMargen(datos);
    const actor = await actorDesdeRequest(req);
    const ahora = new Date();

    const t = await sequelize.transaction();
    try {
      await CotizadorCalibracionMargen.update(
        { vigente: false, anulado_en: ahora },
        { where: { ambito: datos.ambito, clave, vigente: true }, transaction: t }
      );
      const fila = await CotizadorCalibracionMargen.create(
        {
          ambito: datos.ambito,
          sistema: datos.sistema ?? null,
          material: datos.material ?? null,
          ref: datos.ref ?? null,
          clave,
          margen_mm: datos.margenMm,
          aprobado_por: actor,
          evidencia: datos.evidencia ?? null,
          vigente: true,
          creado_en: ahora,
        },
        { transaction: t }
      );
      await CotizadorCalibracionHistorial.create(
        { fecha: ahora, accion: 'aprobar-margen', payload: { ambito: datos.ambito, clave, margenMm: datos.margenMm, por: actor } },
        { transaction: t }
      );
      await t.commit();
      await cache.recargar('calibracion');
      res.status(201).json(fila);
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (e) {
    if (responderZod(res, e)) return;
    console.error('aprobarMargen:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo aprobar el margen.' });
  }
};

/** PATCH /calibracion/margenes/:id/anular — la pieza vuelve a "sin calibrar"
 * (no a margen 0: AUSENTE ≠ CERO es la invariante del módulo). */
export const anularMargen = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Identificador de margen inválido.' });
  try {
    const actor = await actorDesdeRequest(req);
    const ahora = new Date();
    const t = await sequelize.transaction();
    try {
      const fila = await CotizadorCalibracionMargen.findByPk(id, { transaction: t });
      if (!fila) {
        await t.rollback();
        return res.status(404).json({ error: 'Margen no encontrado.' });
      }
      if (!fila.getDataValue('vigente')) {
        await t.rollback();
        return res.status(400).json({ error: 'Este margen ya no estaba vigente.' });
      }
      await fila.update({ vigente: false, anulado_en: ahora }, { transaction: t });
      await CotizadorCalibracionHistorial.create(
        {
          fecha: ahora,
          accion: 'anular-margen',
          payload: { ambito: fila.getDataValue('ambito'), clave: fila.getDataValue('clave'), por: actor },
        },
        { transaction: t }
      );
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
    await cache.recargar('calibracion');
    res.json({ ok: true });
  } catch (e) {
    console.error('anularMargen:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo anular el margen.' });
  }
};

// ─── Holguras ────────────────────────────────────────────────────────────────

/** GET /calibracion/holguras — holguras vigentes (global + por sistema). */
export const listarHolguras = async (_req: Request, res: Response) => {
  try {
    const filas = await CotizadorCalibracionHolgura.findAll({
      where: { vigente: true },
      order: [['ambito', 'ASC'], ['sistema', 'ASC']],
    });
    res.json(filas);
  } catch (e) {
    console.error('listarHolguras:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudieron leer las holguras.' });
  }
};

const holguraSchema = z
  .object({
    ambito: z.enum(['global', 'sistema']),
    sistema: z.string().min(1).max(60).optional(),
    anchoMm: z.number().finite(),
    altoMm: z.number().finite(),
    nota: z.string().max(2000).nullable().optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.ambito === 'sistema' && !d.sistema) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El ámbito "sistema" requiere "sistema".' });
    }
  });

/** POST /calibracion/holguras — fijar la holgura de instalación (vano →
 * medida de fabricación). Misma lógica de versión por reemplazo que márgenes. */
export const fijarHolgura = async (req: Request, res: Response) => {
  try {
    const datos = holguraSchema.parse(req.body ?? {});
    const actor = await actorDesdeRequest(req);
    const ahora = new Date();

    const t = await sequelize.transaction();
    try {
      await CotizadorCalibracionHolgura.update(
        { vigente: false },
        { where: { ambito: datos.ambito, sistema: datos.sistema ?? null, vigente: true }, transaction: t }
      );
      const fila = await CotizadorCalibracionHolgura.create(
        {
          ambito: datos.ambito,
          sistema: datos.sistema ?? null,
          ancho_mm: datos.anchoMm,
          alto_mm: datos.altoMm,
          nota: datos.nota ?? null,
          definido_por: actor,
          definido_en: ahora,
          vigente: true,
        },
        { transaction: t }
      );
      await CotizadorCalibracionHistorial.create(
        {
          fecha: ahora,
          accion: 'fijar-holgura',
          payload: { ambito: datos.ambito, sistema: datos.sistema ?? null, anchoMm: datos.anchoMm, altoMm: datos.altoMm, por: actor },
        },
        { transaction: t }
      );
      await t.commit();
      await cache.recargar('calibracion');
      res.status(201).json(fila);
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (e) {
    if (responderZod(res, e)) return;
    console.error('fijarHolgura:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo fijar la holgura.' });
  }
};

/** PATCH /calibracion/holguras/:id/anular */
export const anularHolgura = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Identificador de holgura inválido.' });
  try {
    const actor = await actorDesdeRequest(req);
    const ahora = new Date();
    const t = await sequelize.transaction();
    try {
      const fila = await CotizadorCalibracionHolgura.findByPk(id, { transaction: t });
      if (!fila) {
        await t.rollback();
        return res.status(404).json({ error: 'Holgura no encontrada.' });
      }
      if (!fila.getDataValue('vigente')) {
        await t.rollback();
        return res.status(400).json({ error: 'Esta holgura ya no estaba vigente.' });
      }
      await fila.update({ vigente: false }, { transaction: t });
      await CotizadorCalibracionHistorial.create(
        {
          fecha: ahora,
          accion: 'anular-holgura',
          payload: { ambito: fila.getDataValue('ambito'), sistema: fila.getDataValue('sistema'), por: actor },
        },
        { transaction: t }
      );
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
    await cache.recargar('calibracion');
    res.json({ ok: true });
  } catch (e) {
    console.error('anularHolgura:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo anular la holgura.' });
  }
};

// ─── Historial ───────────────────────────────────────────────────────────────

/** GET /calibracion/historial?sistema=&limit= — bitácora combinada de
 * márgenes, holguras y cambios de estado, más reciente primero. */
export const listarHistorial = async (req: Request, res: Response) => {
  const { sistema } = req.query;
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  try {
    const where =
      typeof sistema === 'string' && sistema ? { payload: { [Op.contains]: { sistema } } } : undefined;
    const filas = await CotizadorCalibracionHistorial.findAll({
      where,
      order: [
        ['fecha', 'DESC'],
        ['id', 'DESC'],
      ],
      limit,
    });
    res.json(filas);
  } catch (e) {
    console.error('listarHistorial:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo leer el historial de calibración.' });
  }
};
