// Pérgola (2026-10-04, pedido del usuario).
//
// Templex ACRISTALA una estructura de pérgola existente: no construye vigas ni
// correas (lo dice también el catálogo maestro: "vidrio templado … instalados
// en estructura de pérgola existente"). Por eso el despiece es solo el vidrio
// —que elige el asesor, templado 6 mm por defecto— y la película de seguridad,
// que en un techo de vidrio no es opcional (decisión del usuario).
//
// La película se cobra por el ÁREA del vidrio, igual que en el resto del
// Cotizador (decisión del 2026-09-27, ver cotizador.md → "Película cobrada por
// área").
//
// Mano de obra: $120.000/m² (`mo_instalacion_pergola_m2`), la calcula
// `calcularManoObraProductos` en lib/cargos.ts desde el input guardado —nunca
// va en este BOM, que `totalizar()` multiplica por las piezas.

import { lineaCatalogo, totalizar, areaM2 } from "../lib/motorCalculo";
import { getParametros, segmentosValidos } from "../lib/catalogo";
import type { InputModulo } from "../tipos";
import { CAMPO_VIDRIO, resolverVidrio } from "../lib/vidrios";

/** Película de seguridad transparente 4 mic: obligatoria en toda pérgola. */
export const PELICULA_PERGOLA = "PEL0106";

/** Vidrio por defecto: templado claro 6 mm. Desde el 2026-10-30 se ofrece el
 * catálogo completo (lib/vidrios.ts); estas 6 opciones —la lista de antes— solo
 * las lee la descripción comercial sin catálogo cargado (pruebas puras). */
const VIDRIO_PERGOLA_DEFECTO = { codigo: "CL6MM03SP", nombre: "templado claro 6 mm" };
const VIDRIOS_PERGOLA = [
  { value: "CL6MM03SP", label: "Templado claro 6 mm" },
  { value: "CL8MM03SP", label: "Templado claro 8 mm" },
  { value: "CL10MM03SP", label: "Templado claro 10 mm" },
  { value: "CL6MM03LM", label: "Laminado claro 3+3" },
  { value: "CL8MM03LM", label: "Laminado claro 4+4" },
  { value: "CL10MM03LM", label: "Laminado claro 5+5" },
];

export const meta = {
  nombre: "Pérgola",
  descripcion:
    "Vidrio sobre estructura de pérgola existente, con película de seguridad. Medidas libres; la estructura no se cotiza.",
  campos: [
    { nombre: "anchoCm", tipo: "number", etiqueta: "Ancho (mm)", requerido: true, grupo: "medidas" },
    { nombre: "altoCm", tipo: "number", etiqueta: "Largo (mm)", requerido: true, grupo: "medidas" },
    { ...CAMPO_VIDRIO, opciones: VIDRIOS_PERGOLA, etiqueta: "Vidrio", requerido: true, defecto: VIDRIO_PERGOLA_DEFECTO.codigo },
    { nombre: "segmentoCliente", tipo: "select", opciones: ["PA", "PM", "PB"], etiqueta: "Tipo de cliente", requerido: true, grupo: "cliente" },
    { nombre: "descripcionItem", tipo: "string", etiqueta: "Ubicación (opcional)", requerido: false, grupo: "comercial" },
    { nombre: "conInstalacion", tipo: "boolean", etiqueta: "Con instalación", requerido: false, grupo: "comercial", defecto: true },
    { nombre: "cantidadPiezas", tipo: "number", etiqueta: "Cantidad de pérgolas iguales", requerido: true, grupo: "comercial" },
  ],
};

export function calcular(input: InputModulo) {
  const { anchoCm, altoCm, segmentoCliente, cantidadPiezas = 1, descuentoPct = 0 } = input ?? {};

  const ancho = Number(anchoCm);
  const largo = Number(altoCm);
  if (!Number.isFinite(ancho) || ancho <= 0) throw new Error("El ancho es obligatorio y debe ser mayor a 0.");
  if (!Number.isFinite(largo) || largo <= 0) throw new Error("El largo es obligatorio y debe ser mayor a 0.");
  if (!segmentosValidos().includes(segmentoCliente)) {
    throw new Error(`segmentoCliente inválido: "${segmentoCliente}". Debe ser uno de ${segmentosValidos().join(", ")}.`);
  }
  const piezas = Number(cantidadPiezas);
  if (!Number.isInteger(piezas) || piezas <= 0) throw new Error("La cantidad debe ser un entero mayor a 0.");
  const descuento = Number(descuentoPct) || 0;
  if (descuento < 0 || descuento >= 1) throw new Error("descuentoPct debe ser una fracción entre 0 y 1.");

  const advertencias: string[] = [];
  const resuelto = resolverVidrio(input?.codigoVidrio, VIDRIO_PERGOLA_DEFECTO);
  const vidrio = resuelto.codigo;
  if (resuelto.advertencia) advertencias.push(resuelto.advertencia);

  const area = areaM2(ancho, largo);
  const items = [
    lineaCatalogo(vidrio, area, segmentoCliente, { unidadOverride: "M2" }),
    lineaCatalogo(PELICULA_PERGOLA, area, segmentoCliente, { unidadOverride: "M2" }),
  ];

  const p = getParametros();
  const resultado = totalizar(items, { cantidadPiezas: piezas, descuentoPct: descuento, aiu: p.aiu, ivaPct: p.iva });
  return { ...resultado, areaM2: area, advertencias };
}
