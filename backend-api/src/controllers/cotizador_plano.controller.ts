// Geometría del plano de un producto, en dos sabores: previsualización a una
// medida cualquiera, y plano de un ítem ya guardado.
import { Request, Response } from 'express';
import { calcularPlano } from '../cotizador/lib/planoProducto';
import { getDiseno } from '../cotizador/lib/motorDespiece';
import { ordenarParaTaller } from '../cotizador/lib/ordenCorte';
import * as cache from '../cotizador/cache';
import * as store from '../cotizador/store/cotizacionStore';
import type { Diseno } from '../cotizador/tipos';

// `motorDespiece` calcula cada medida con `a*anchoMm + b*altoMm + c`, pero esa
// función es privada de ese archivo. Se duplica aquí —mínima— en vez de
// exportarla, igual que hacía el original: si hiciera falta en un tercer sitio,
// ahí sí valdría la pena exportarla de verdad y borrar esta copia.
function evaluarFormula(
  formula: { a: number; b: number; c: number } | null | undefined,
  anchoMm: number,
  altoMm: number
): number | null {
  if (!formula) return null;
  return formula.a * anchoMm + formula.b * altoMm + formula.c;
}

/** Arma el array `vidrios` que espera `calcularPlano` evaluando las fórmulas
 * del diseño, con la misma cuenta y el mismo redondeo a 2 decimales que usa
 * `calcularDespiece`: así la previsualización coincide con lo que saldría de
 * cotizar de verdad a esa medida. */
function evaluarVidrios(diseno: Diseno, anchoMm: number, altoMm: number) {
  const vidrios: Array<{ anchoMm: number; altoMm: number; cantidad: number }> = [];
  for (const v of diseno.vidrios ?? []) {
    const anchoV = evaluarFormula(v.formulaAncho, anchoMm, altoMm);
    const altoV = evaluarFormula(v.formulaAlto, anchoMm, altoMm);
    if (anchoV === null || altoV === null || !Number.isFinite(anchoV) || !Number.isFinite(altoV)) continue;
    vidrios.push({
      anchoMm: Math.round(anchoV * 100) / 100,
      altoMm: Math.round(altoV * 100) / 100,
      cantidad: v.cantidad,
    });
  }
  return vidrios;
}

/**
 * GET /plano?disenoId=&anchoCm=&altoCm=
 * Previsualización: evalúa las fórmulas del diseño a esa medida (sin cotizar,
 * sin guardar nada). La usa el selector de diseño y la pantalla de cálculo
 * antes de agregar el ítem.
 */
export const previsualizarPlano = async (req: Request, res: Response) => {
  try {
    const { disenoId, anchoCm, altoCm } = req.query;
    if (typeof disenoId !== 'string' || !disenoId) {
      return res.status(400).json({ error: 'Falta el diseño (disenoId).' });
    }
    const anchoCmNum = Number(anchoCm);
    const altoCmNum = Number(altoCm);
    if (!Number.isFinite(anchoCmNum) || anchoCmNum <= 0 || !Number.isFinite(altoCmNum) || altoCmNum <= 0) {
      return res.status(400).json({ error: 'El ancho y el alto deben ser números mayores que cero.' });
    }

    const diseno = getDiseno(disenoId);
    if (!diseno) {
      return res.status(404).json({ error: `El diseño "${disenoId}" no existe en el catálogo.` });
    }

    const anchoMm = anchoCmNum * 10;
    const altoMm = altoCmNum * 10;

    res.json(
      calcularPlano({
        codigoDiseno: diseno.diseno,
        modulo: diseno.modulo,
        anchoFabMm: anchoMm,
        altoFabMm: altoMm,
        vidrios: evaluarVidrios(diseno, anchoMm, altoMm),
        disenoId: diseno.id,
        overrides: cache.getGeometriaOverrides(),
      })
    );
  } catch (e) {
    console.error('previsualizarPlano:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo calcular el plano.' });
  }
};

/**
 * GET /cotizaciones/:id/items/:itemId/plano
 *
 * Plano de un ítem YA GUARDADO: usa exclusivamente lo que quedó persistido en
 * `item.resultado` (cortes de vidrio y medida de fabricación reales del momento
 * en que se cotizó), sin volver a tocar el catálogo de diseños — funciona igual
 * aunque ese diseño haya cambiado de fórmula o lo hayan borrado desde entonces.
 */
export const planoDeItem = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    if (!Number.isInteger(id) || !Number.isInteger(itemId)) {
      return res.status(400).json({ error: 'El identificador de cotización o de ítem no es válido.' });
    }

    // `obtener()` sólo trae los blobs de UNA propuesta (por defecto la elegida),
    // y el plano sale del blob. Por eso se acepta `?propuesta=<id>`: sin él, el
    // plano de un ítem de la propuesta B —que el vendedor está mirando— no
    // encontraría su `resultado` (2026-09-20).
    const propuesta = typeof req.query.propuesta === 'string' ? req.query.propuesta : undefined;
    const cot = await store.obtener(id, { propuesta });
    if (!cot) return res.status(404).json({ error: 'Cotización no encontrada.' });

    const item = (cot.items ?? []).find((i: { id: number }) => i.id === itemId);
    if (!item) {
      return res.status(404).json({
        error: 'Ese ítem no existe en la propuesta que se está consultando.',
      });
    }

    const resultado = item.resultado;
    const disenoInfo = resultado?.diseno;
    if (!disenoInfo?.diseno) {
      return res
        .status(400)
        .json({ error: 'Este ítem se cotizó con medidas libres, no por diseño: no tiene plano.' });
    }
    const fabricacion = resultado.medidas?.fabricacion;
    if (!fabricacion) {
      return res.status(400).json({ error: 'Este ítem no tiene una medida de fabricación guardada.' });
    }

    // `resultado.diseno` sólo guarda {id, sistema, diseno, etiqueta, paneles,
    // nivelCorte} — no `modulo`. Sólo hace falta para la regla especial de
    // espejo, así que se infiere del prefijo del propio código en vez de volver
    // al catálogo: eso rompería la promesa de que este endpoint funciona aunque
    // el diseño ya no exista. Ningún otro módulo usa ese prefijo.
    const modulo = String(disenoInfo.diseno).startsWith('ESP_') ? 'espejo' : undefined;

    res.json(
      calcularPlano({
        codigoDiseno: disenoInfo.diseno,
        modulo,
        anchoFabMm: Number(fabricacion.anchoCm) * 10,
        altoFabMm: Number(fabricacion.altoCm) * 10,
        vidrios: resultado.cortes?.vidrios ?? [],
        disenoId: disenoInfo.id,
        overrides: cache.getGeometriaOverrides(),
      })
    );
  } catch (e) {
    console.error('planoDeItem:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo calcular el plano de este ítem.' });
  }
};

/**
 * GET /cotizaciones/:id/items/:itemId/despiece
 *
 * Especificaciones de corte por perfil y vidrio de un ítem ya guardado, para
 * la página 2 de la Hoja de Trabajo (2026-09-21). Sólo lee `resultado.cortes`
 * tal como quedó guardado — no recalcula nada — y ordena los perfiles con
 * `ordenarParaTaller()`, la única función del módulo pensada para presentar
 * piezas en una hoja de taller (ver `ordenCorte.ts`: heurística sin confirmar
 * con el maestro, pero es el único sitio que la aplica, para que el día que se
 * confirme el orden real baste con tocar ahí).
 *
 * `nivelCorte`/`hayErrores` viajan aparte para que el frontend decida si avisa
 * que las medidas no están validadas — son las mismas columnas denormalizadas
 * que ya usa la tabla de "Normal", no un cálculo nuevo.
 */
export const despieceDeItem = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    if (!Number.isInteger(id) || !Number.isInteger(itemId)) {
      return res.status(400).json({ error: 'El identificador de cotización o de ítem no es válido.' });
    }

    const propuesta = typeof req.query.propuesta === 'string' ? req.query.propuesta : undefined;
    const cot = await store.obtener(id, { propuesta });
    if (!cot) return res.status(404).json({ error: 'Cotización no encontrada.' });

    const item = (cot.items ?? []).find((i: { id: number }) => i.id === itemId);
    if (!item) {
      return res.status(404).json({
        error: 'Ese ítem no existe en la propuesta que se está consultando.',
      });
    }

    const resultado = item.resultado;
    if (!resultado?.cortes) {
      return res.status(400).json({ error: 'Este ítem no tiene despiece por diseño.' });
    }

    res.json({
      perfiles: ordenarParaTaller(resultado.cortes.perfiles ?? []),
      vidrios: resultado.cortes.vidrios ?? [],
      nivelCorte: item.nivelCorte ?? null,
      hayErrores: item.hayErrores === true,
      // El asesor tocó un perfil: estos cortes ya no son sólo los del diseño.
      perfileriaPersonalizada: resultado.perfileriaPersonalizada === true,
    });
  } catch (e) {
    console.error('despieceDeItem:', e instanceof Error ? e.message : e);
    res.status(500).json({ error: 'No se pudo calcular el despiece de este ítem.' });
  }
};
