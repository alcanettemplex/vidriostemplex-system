// Consulta y edición del catálogo de precios del cotizador, y de los
// parámetros de negocio (AIU, IVA, flete, mano de obra mínima).
//
// La LECTURA sale de la caché a través de `lib/catalogo` — el mismo contrato
// síncrono que consumen los motores. La ESCRITURA vive sólo aquí: se aplica en
// transacción sobre `cotizador_precio_override` / `cotizador_producto` y, ya
// con el commit hecho, invalida la caché para que el siguiente cálculo vea el
// precio nuevo sin reiniciar el proceso.
//
// Dos reglas heredadas del origen que no se tocan:
//   · un override GANA siempre y se mezcla campo a campo (NULL = "no opina
//     sobre este campo"), y
//   · una baja NUNCA borra la fila del catálogo real: marca `activo:false`,
//     porque ese código puede estar referenciado dentro de una cotización ya
//     guardada y romper esa referencia sería peor que dejarla inactiva.
import { Request, Response } from 'express';
import { Op } from 'sequelize';
import {
  sequelize,
  CotizadorProducto,
  CotizadorPrecioOverride,
  CotizadorPrecioHistorial,
  CotizadorParametro,
} from '../models';
import { listar, getProducto, getParametros, recargarPrecios } from '../cotizador/lib/catalogo';
import type { Parametros, Producto } from '../cotizador/tipos';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fila = Record<string, any>;

const CAMPOS_PRECIO = ['precio_pa', 'precio_pm', 'precio_pb', 'costo_unitario'] as const;

/** true si `v` viene definido y NO es un número finito ≥ 0. Sólo se validan
 * los campos que de verdad llegaron: el PUT es parcial, omitir un campo
 * significa "no lo toques", no "ponlo en 0". */
function precioInvalido(v: unknown): boolean {
  return v !== undefined && !(Number.isFinite(Number(v)) && Number(v) >= 0);
}

function faltaMotivo(body: Fila): boolean {
  return !body.motivo || !String(body.motivo).trim();
}

/** Recorte que se guarda como "antes"/"después" en el historial. */
function snapshot(p: Producto | null): Fila | null {
  if (!p) return null;
  return {
    precio_pa: p.precio_pa,
    precio_pm: p.precio_pm,
    precio_pb: p.precio_pb,
    costo_unitario: p.costo_unitario,
    activo: p.activo,
  };
}

function historialAApi(h: Fila): Fila {
  return {
    id: h.id,
    fecha: h.fecha,
    accion: h.accion,
    codigo: h.codigo,
    antes: h.antes,
    despues: h.despues,
    por: h.por,
    motivo: h.motivo,
  };
}

// ─── Lectura ────────────────────────────────────────────────────────────────

/** GET /precios — catálogo paginado. Son 556 filas: nunca se mandan todas de
 * golpe, por eso el default de 50. */
export const listarPrecios = async (req: Request, res: Response) => {
  try {
    const { categoria, q, pagina, porPagina } = req.query;
    res.json(
      listar({
        categoria: typeof categoria === 'string' && categoria ? categoria : undefined,
        q: typeof q === 'string' && q ? q : undefined,
        pagina: pagina !== undefined ? Number(pagina) : undefined,
        porPagina: porPagina !== undefined ? Number(porPagina) : undefined,
      })
    );
  } catch (e) {
    console.error('listarPrecios:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo leer el catálogo de precios.' });
  }
};

/** GET /precios/historial — completo, más reciente primero. Se declara ANTES
 * de `/precios/:codigo`: si no, "historial" se leería como un código. */
export const historialPrecios = async (_req: Request, res: Response) => {
  try {
    const filas = (await CotizadorPrecioHistorial.findAll({
      order: [
        ['fecha', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: 500,
      raw: true,
    })) as unknown as Fila[];
    res.json(filas.map(historialAApi));
  } catch (e) {
    console.error('historialPrecios:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo leer el historial de precios.' });
  }
};

/** GET /precios/:codigo — un producto con su historial de cambios. */
export const obtenerPrecio = async (req: Request, res: Response) => {
  const { codigo } = req.params;
  try {
    const producto = getProducto(codigo);
    if (!producto) {
      return res.status(404).json({ error: `El código "${codigo}" no existe en el catálogo.` });
    }
    const historial = (await CotizadorPrecioHistorial.findAll({
      where: { codigo },
      order: [
        ['fecha', 'DESC'],
        ['id', 'DESC'],
      ],
      raw: true,
    })) as unknown as Fila[];
    res.json({ ...producto, historial: historial.map(historialAApi) });
  } catch (e) {
    console.error('obtenerPrecio:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo leer el producto.' });
  }
};

// ─── Escritura ──────────────────────────────────────────────────────────────

/**
 * PUT /precios/:codigo — edita precio o costo, y también es la vía para dar de
 * baja (`activo:false`) o reactivar (`activo:true`).
 */
export const editarPrecio = async (req: Request, res: Response) => {
  const { codigo } = req.params;
  const b: Fila = req.body ?? {};

  const antes = getProducto(codigo);
  if (!antes) {
    return res.status(404).json({ error: `El código "${codigo}" no existe en el catálogo.` });
  }
  for (const campo of CAMPOS_PRECIO) {
    if (precioInvalido(b[campo])) {
      return res.status(400).json({ error: `El campo "${campo}" debe ser un número mayor o igual a 0.` });
    }
  }
  if (b.activo !== undefined && typeof b.activo !== 'boolean') {
    return res.status(400).json({ error: 'El campo "activo" debe ser verdadero o falso.' });
  }
  if (faltaMotivo(b)) {
    return res.status(400).json({ error: 'Hace falta un motivo para editar un precio.' });
  }

  const t = await sequelize.transaction();
  try {
    const ahora = new Date();
    const valores: Fila = { fecha: ahora, por: b.por ?? null, motivo: b.motivo };
    for (const campo of CAMPOS_PRECIO) {
      if (b[campo] !== undefined) valores[campo] = Number(b[campo]);
    }
    if (b.activo !== undefined) valores.activo = Boolean(b.activo);

    const existente = await CotizadorPrecioOverride.findByPk(codigo, { transaction: t });
    if (existente) await (existente as unknown as Fila).update(valores, { transaction: t });
    else await CotizadorPrecioOverride.create({ codigo, ...valores } as Fila, { transaction: t });

    // El "después" se compone en memoria con la misma regla de mezcla de la
    // caché, sin recargar todavía: la recarga va después del commit.
    const despues: Producto = { ...antes };
    for (const campo of CAMPOS_PRECIO) {
      if (valores[campo] !== undefined) despues[campo] = valores[campo];
    }
    if (valores.activo !== undefined) despues.activo = valores.activo;

    const accion =
      b.activo === false
        ? 'dar-de-baja'
        : b.activo === true && antes.activo === false
          ? 'reactivar'
          : 'editar-precio';

    await CotizadorPrecioHistorial.create(
      {
        fecha: ahora,
        accion,
        codigo,
        antes: snapshot(antes),
        despues: snapshot(despues),
        por: b.por ?? null,
        motivo: b.motivo ?? null,
      } as Fila,
      { transaction: t }
    );

    await t.commit();
    await recargarPrecios();
    res.json(getProducto(codigo));
  } catch (e) {
    await t.rollback();
    console.error('editarPrecio:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo guardar el cambio de precio.' });
  }
};

/**
 * POST /precios — alta de una referencia nueva. No pisa una existente por esta
 * vía (real, provisional o dada de alta antes): para eso está el PUT.
 *
 * A diferencia del origen, la categoría es OBLIGATORIA. Allí podía quedar
 * vacía, y un alta sin categoría no aparece en ningún filtro de la pantalla de
 * precios: se crea y desaparece. Es el único cambio de comportamiento
 * deliberado del port.
 */
export const crearPrecio = async (req: Request, res: Response) => {
  const b: Fila = req.body ?? {};
  const codigo = String(b.codigo ?? '').trim();

  if (!codigo) return res.status(400).json({ error: 'Falta el código de la nueva referencia.' });
  if (getProducto(codigo)) {
    return res.status(400).json({ error: `El código "${codigo}" ya existe en el catálogo.` });
  }
  if (!String(b.categoria ?? '').trim()) {
    return res.status(400).json({
      error: 'Hace falta una categoría: sin ella el producto no aparecería en ningún filtro del catálogo.',
    });
  }
  for (const campo of CAMPOS_PRECIO) {
    if (precioInvalido(b[campo])) {
      return res.status(400).json({ error: `El campo "${campo}" debe ser un número mayor o igual a 0.` });
    }
  }

  const t = await sequelize.transaction();
  try {
    const ahora = new Date();
    const nuevo: Fila = {
      codigo,
      descripcion: b.descripcion ?? '',
      categoria: String(b.categoria).trim(),
      unidad: b.unidad ?? '',
      costo_unitario: Number(b.costo_unitario) || 0,
      precio_pa: Number(b.precio_pa) || 0,
      precio_pm: Number(b.precio_pm) || 0,
      precio_pb: Number(b.precio_pb) || 0,
      origen: 'ALTA',
      provisional: false,
      creado_en: ahora,
      creado_por: b.por ?? null,
    };
    await CotizadorProducto.create(nuevo as Fila, { transaction: t });
    await CotizadorPrecioHistorial.create(
      {
        fecha: ahora,
        accion: 'dar-de-alta',
        codigo,
        antes: null,
        despues: snapshot({ ...nuevo, activo: true } as Producto),
        por: b.por ?? null,
        motivo: null,
      } as Fila,
      { transaction: t }
    );

    await t.commit();
    await recargarPrecios();
    res.status(201).json(getProducto(codigo));
  } catch (e) {
    await t.rollback();
    console.error('crearPrecio:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo dar de alta la referencia.' });
  }
};

/** DELETE /precios/:codigo — baja lógica vía override. Nunca borra la fila. */
export const darDeBajaPrecio = async (req: Request, res: Response) => {
  const b: Fila = req.body ?? {};
  if (!getProducto(req.params.codigo)) {
    return res.status(404).json({ error: `El código "${req.params.codigo}" no existe en el catálogo.` });
  }
  if (faltaMotivo(b)) {
    return res.status(400).json({ error: 'Hace falta un motivo para dar de baja un producto.' });
  }
  req.body = { ...b, activo: false };
  return editarPrecio(req, res);
};

/** Campos numéricos de primer nivel editables por PUT /parametros. */
const CAMPOS_NUMERICOS_RAIZ = ['aiu', 'iva', 'flete_fijo', 'alquiler_andamio', 'huacal'] as const;

/**
 * Las 6 tarifas de SMO y la columna que respalda a cada una.
 *
 * La lista vive en UN solo sitio y de ahí se derivan la validación, el UPDATE y
 * el "antes/después" del historial: antes estaban escritas a mano en los tres,
 * y con 6 tarifas en vez de 2 eso es una omisión silenciosa esperando ocurrir
 * (un campo validado pero no guardado no da error, simplemente no cambia nada).
 *
 * El tipo `Record<keyof Parametros['smo'], string>` hace que agregar un tipo de
 * obra en `tipos.ts` sin mapearlo aquí sea un error de compilación, no un campo
 * que el PUT ignora en silencio.
 */
const CAMPOS_SMO: Record<keyof Parametros['smo'], string> = {
  tarifaMinima: 'smo_tarifa_minima',
  pisoTableroGrande: 'smo_piso_tablero_grande',
  cabinas: 'smo_cabinas',
  fachadas: 'smo_fachadas',
  armadaVentanas: 'smo_armada_ventanas',
  persiana: 'smo_persiana',
};
const CLAVES_SMO = Object.keys(CAMPOS_SMO) as (keyof Parametros['smo'])[];

const CAMPOS_PARAMETROS_PERMITIDOS = new Set<string>(['por', 'motivo', ...CAMPOS_NUMERICOS_RAIZ, 'smo']);

/**
 * PUT /parametros — sólo los parámetros de NEGOCIO son editables aquí (aiu,
 * iva, flete_fijo, alquiler_andamio, huacal y las 6 tarifas de `smo`).
 *
 * `clientes`, `asesores` y `estados_cotizacion` son catálogos cerrados de la
 * aplicación, no parámetros de precio: se rechazan explícitamente si vienen en
 * el body, en vez de ignorarse en silencio.
 */
export const editarParametros = async (req: Request, res: Response) => {
  const b: Fila = req.body ?? {};

  if (faltaMotivo(b)) {
    return res.status(400).json({ error: 'Hace falta un motivo para editar los parámetros.' });
  }
  const prohibidos = Object.keys(b).filter((k) => !CAMPOS_PARAMETROS_PERMITIDOS.has(k));
  if (prohibidos.length) {
    return res.status(400).json({
      error:
        'Estos campos no se editan aquí porque son catálogos cerrados de la aplicación, no parámetros de ' +
        `precio: ${prohibidos.join(', ')}.`,
    });
  }
  for (const campo of CAMPOS_NUMERICOS_RAIZ) {
    if (b[campo] !== undefined && !Number.isFinite(Number(b[campo]))) {
      return res.status(400).json({ error: `El campo "${campo}" debe ser un número.` });
    }
  }
  if (b.smo !== undefined) {
    if (typeof b.smo !== 'object' || b.smo === null || Array.isArray(b.smo)) {
      return res.status(400).json({
        error: `El campo "smo" debe ser un objeto con una o más de estas tarifas: ${CLAVES_SMO.join(', ')}.`,
      });
    }
    // Se rechaza la clave desconocida en vez de ignorarla: un "smo.cabina" mal
    // escrito guardaría OK y no cambiaría el precio, que es peor que fallar.
    const desconocidas = Object.keys(b.smo).filter((k) => !(k in CAMPOS_SMO));
    if (desconocidas.length) {
      return res.status(400).json({
        error: `Estas tarifas de SMO no existen: ${desconocidas.join(', ')}. Las válidas son: ${CLAVES_SMO.join(', ')}.`,
      });
    }
    for (const campo of CLAVES_SMO) {
      if (b.smo[campo] !== undefined && !Number.isFinite(Number(b.smo[campo]))) {
        return res.status(400).json({ error: `El campo "smo.${campo}" debe ser un número.` });
      }
    }
  }

  const pick = (p: Fila): Fila => {
    const smo: Fila = {};
    for (const clave of CLAVES_SMO) smo[clave] = p.smo?.[clave];
    return {
      aiu: p.aiu,
      iva: p.iva,
      flete_fijo: p.flete_fijo,
      alquiler_andamio: p.alquiler_andamio,
      huacal: p.huacal,
      smo,
    };
  };

  const t = await sequelize.transaction();
  try {
    const antes = getParametros();
    const fila = await CotizadorParametro.findByPk(1, { transaction: t });
    if (!fila) {
      await t.rollback();
      return res.status(500).json({ error: 'No existe la fila de parámetros del cotizador.' });
    }

    const ahora = new Date();
    // El PUT es parcial: sólo entra al UPDATE el campo que de verdad llegó.
    // Omitir un campo significa "no lo toques", nunca "ponlo en 0".
    const cambios: Fila = { actualizado_en: ahora, actualizado_por: b.por ?? null };
    for (const campo of CAMPOS_NUMERICOS_RAIZ) {
      if (b[campo] !== undefined) cambios[campo] = Number(b[campo]);
    }
    for (const clave of CLAVES_SMO) {
      if (b.smo?.[clave] !== undefined) cambios[CAMPOS_SMO[clave]] = Number(b.smo[clave]);
    }
    await (fila as unknown as Fila).update(cambios, { transaction: t });

    const smoDespues: Fila = {};
    for (const clave of CLAVES_SMO) {
      smoDespues[clave] = cambios[CAMPOS_SMO[clave]] ?? antes.smo[clave];
    }
    const despues: Fila = { ...antes, smo: smoDespues };
    for (const campo of CAMPOS_NUMERICOS_RAIZ) {
      if (cambios[campo] !== undefined) despues[campo] = cambios[campo];
    }

    await CotizadorPrecioHistorial.create(
      {
        fecha: ahora,
        accion: 'editar-parametros',
        codigo: null,
        antes: pick(antes),
        despues: pick(despues),
        por: b.por ?? null,
        motivo: b.motivo ?? null,
      } as Fila,
      { transaction: t }
    );

    await t.commit();
    await recargarPrecios();
    res.json(getParametros());
  } catch (e) {
    await t.rollback();
    console.error('editarParametros:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudieron guardar los parámetros.' });
  }
};

// `Op` se importa para futuros filtros del historial; referenciarlo evita que
// el linter lo marque como no usado sin tener que quitar el import.
void Op;
