// Registro central de los 6 motores de cálculo (uno por módulo de producto).
// Cada módulo vive en su propio archivo y exporta:
//   - meta: { id, nombre, descripcion, campos: [...] }  (para que el frontend arme el formulario)
//   - calcular(input): usa lineaCatalogo()/totalizar() de ../lib/motorCalculo.js
//     y retorna { items, areaM2, cantidadPiezas, subtotal, ..., total, advertencias }
//
// Contrato del `input` común a todos los módulos:
//   { segmentoCliente: "PA"|"PM"|"PB", cantidadPiezas: number, descuentoPct: number, ...camposPropios }
//
// Contrato de salida común (ver ../lib/motorCalculo.js:totalizar):
//   { items, cantidadPiezas, subtotalPieza, subtotal, aiu, subtotalConAiu,
//     descuentoPct, descuento, ivaPct, baseIva, iva, total, hayErrores, advertencias, areaM2? }

import * as ventanas from "./ventanas";
import * as proyectantes from "./proyectantes";
import * as cabinasCorredizas from "./cabinasCorredizas";
import * as cabinasBatientes from "./cabinasBatientes";
import * as tablero from "./tablero";
import * as espejo from "./espejo";

export const MODULOS = {
  ventanas,
  proyectantes,
  "cabinas-corredizas": cabinasCorredizas,
  "cabinas-batientes": cabinasBatientes,
  tablero,
  espejo,
};

export function listarModulos() {
  return Object.entries(MODULOS).map(([id, mod]) => ({ id, ...mod.meta }));
}

export function getModulo(id: string) {
  return MODULOS[id as keyof typeof MODULOS] ?? null;
}
