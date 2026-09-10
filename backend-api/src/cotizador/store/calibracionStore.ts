// Lectura síncrona de la calibración para los motores.
//
// Sustituye al `db/storeCalibracion.js` del origen, que leía y escribía un
// archivo JSON. De sus 13 funciones, los motores sólo usan TRES getters —
// verificado siguiendo los imports:
//
//   getMargenes()  ← motorDespiece y aptitudOrden
//   getHolguras()  ← cotizarPorDiseno
//   getSistemas()  ← aptitudOrden
//
// Las otras diez (registrar y anular contrastes, aprobar y anular márgenes,
// fijar holguras, cambiar el estado de un sistema, el historial) las llamaba
// únicamente la capa de rutas, así que se reimplementan asíncronas y en
// transacción en `cotizador_calibracion.controller.ts`. Ese reparto es lo que
// permite que la parte síncrona quede reducida a leer de la caché.
//
// AUSENTE ≠ CERO: la caché sólo carga filas `vigente`, así que un nivel no
// medido llega como `null` o como clave inexistente, nunca como 0. Es la
// invariante que el módulo de calibración entero defiende — "no he medido esta
// pieza" y "la medí y no lleva descuento" llevan a decisiones distintas.
import * as cache from '../cache';
import type { Holguras, Margenes, Sistemas } from '../tipos';

/** `{global, sistema:{}, material:{}, pieza:{}}` — misma forma que el store de
 * origen, que es la que espera `margenEfectivo()`. */
export function getMargenes(): Margenes {
  return cache.getMargenes();
}

/** `{global, sistema:{}}` — la que espera `holguraEfectiva()`. */
export function getHolguras(): Holguras {
  return cache.getHolguras();
}

/** `{[sistema]: {estado, firmaMaestro, ...}}` — la que espera `evaluarMadurez()`
 * a través de `aptitudOrden`. */
export function getSistemas(): Sistemas {
  return cache.getSistemas();
}
