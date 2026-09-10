// Cálculo de UN ítem con el motor del módulo indicado, sin guardar nada.
//
// Es el endpoint que usa la pantalla de cotizar mientras el vendedor teclea
// medidas: entra un input, sale el BOM con sus totales y sus advertencias.
import { Request, Response } from 'express';
import { getModulo } from '../cotizador/modules/registry';

/**
 * POST /cotizar/:moduloId
 *
 * El body NO se valida con un esquema aquí a propósito: cada módulo declara
 * sus campos en su propio `meta` y no hay dos con la misma forma, así que un
 * esquema en este punto sería una cuarta copia del contrato (meta, formulario,
 * motor) y la primera en quedar desincronizada. Cada `calcular()` valida lo
 * suyo y lanza con un mensaje ya redactado para el vendedor —"El ancho (cm)
 * debe ser un número mayor a 0"—, que es exactamente lo que se devuelve en el
 * 400. Duplicar esa validación aquí daría dos mensajes distintos para el mismo
 * error.
 */
export const cotizarItem = async (req: Request, res: Response) => {
  const moduloId = req.params.moduloId;
  const modulo = getModulo(moduloId);
  if (!modulo) {
    return res.status(404).json({ error: `El módulo "${moduloId}" no existe.` });
  }
  try {
    res.json(modulo.calcular(req.body ?? {}));
  } catch (e) {
    // Un error del motor es casi siempre un dato que falta o que no calza, y
    // su mensaje ya está escrito para el usuario final.
    const mensaje = e instanceof Error ? e.message : 'No se pudo calcular el ítem.';
    console.error('cotizarItem:', moduloId, mensaje);
    res.status(400).json({ error: mensaje });
  }
};
