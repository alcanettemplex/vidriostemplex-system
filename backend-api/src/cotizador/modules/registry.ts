// Registro central de los 7 motores de cálculo (uno por módulo de producto).
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
import * as itemLibre from "./itemLibre";
import { aplicarPersonalizacion } from "../lib/personalizacion";
import { advertenciasPrecioACotizar } from "../lib/motorCalculo";
// Import circular (detalleComercial usa getModulo de aquí): seguro, porque los
// dos lados sólo se llaman dentro de funciones, nunca al cargar el módulo.
import { descripcionComercial } from "../lib/detalleComercial";
import { opcionesPelicula } from "../lib/peliculas";
import type { InputModulo } from "../tipos";

// El orden de este objeto es el orden en que el frontend pinta las tarjetas de
// producto. "item-libre" va último a propósito: es el cajón de lo que no encaja
// en los seis anteriores, no una opción más al mismo nivel.
export const MODULOS = {
  ventanas,
  proyectantes,
  "cabinas-corredizas": cabinasCorredizas,
  "cabinas-batientes": cabinasBatientes,
  tablero,
  espejo,
  "item-libre": itemLibre,
};

/** Opciones que salen del catálogo vigente y no de una constante del módulo
 * (2026-09-27: la película). Se resuelven en cada consulta, así que un alta
 * nueva aparece en el formulario sin reiniciar nada. */
const OPCIONES_DINAMICAS: Record<string, () => unknown[]> = {
  peliculas: opcionesPelicula,
};

export function listarModulos() {
  return Object.entries(MODULOS).map(([id, mod]) => ({
    id,
    ...mod.meta,
    campos: (mod.meta.campos as Record<string, unknown>[]).map((c) => {
      const origen = typeof c.opcionesDinamicas === "string" ? OPCIONES_DINAMICAS[c.opcionesDinamicas] : undefined;
      return origen ? { ...c, opciones: origen() } : c;
    }),
  }));
}

export function getModulo(id: string) {
  return MODULOS[id as keyof typeof MODULOS] ?? null;
}

/**
 * Calcula UN ítem: el motor de su módulo más la personalización del asesor
 * (`input.personalizacion`: cambiar / quitar / agregar componentes).
 *
 * Es la ÚNICA puerta para calcular un ítem (2026-09-23): botón Calcular,
 * variante de propuesta y cambio de segmento pasan todos por aquí, así que una
 * personalización nunca se pierde por recalcular. El motor no la ve: recibe el
 * input sin esa clave y la personalización se aplica sobre su despiece.
 */
export function calcularItem(moduloId: string, input: InputModulo) {
  const modulo = getModulo(moduloId);
  if (!modulo) throw new Error(`El producto "${moduloId}" no existe en el cotizador.`);
  const { personalizacion, ...paraMotor } = input ?? {};
  const resultado = aplicarPersonalizacion(
    modulo.calcular(paraMotor),
    personalizacion,
    String(paraMotor.segmentoCliente ?? 'PA')
  );
  // Aquí y no en cada módulo: un producto con precio a cotizar puede entrar por
  // el ítem libre, por un componente agregado o por un cambio de componente.
  const avisos = Array.isArray(resultado?.items) ? advertenciasPrecioACotizar(resultado.items) : [];
  // La frase que ve el cliente ("Suministro e instalación de ventana 744…"),
  // guardada con el resultado para que la pantalla la muestre tal cual la
  // imprimirá el PDF. Usa el input COMPLETO: la ubicación (descripcionItem) y
  // "Con instalación" no pasan por el motor pero sí por la frase.
  const descripcion = descripcionComercial(moduloId, input, resultado);
  if (avisos.length === 0) return { ...resultado, descripcionComercial: descripcion };
  const previas: string[] = Array.isArray(resultado.advertencias) ? resultado.advertencias : [];
  return {
    ...resultado,
    descripcionComercial: descripcion,
    advertencias: [...previas, ...avisos.filter((a) => !previas.includes(a))],
  };
}
