// Módulo "Ítem libre" — el ítem que el asesor arma desde cero, línea por línea,
// con cualquier código del catálogo.
//
// POR QUÉ EXISTE (2026-09-22)
// ───────────────────────────
// El Excel que usan hoy los asesores ("ORIGINAL PARA COPIAR no tocar.xlsb",
// hoja `Formato Digital`) no tiene solo los seis productos de los otros seis
// módulos: tiene además TRECE bloques idénticos rotulados "PLANTILLAS" donde el
// vendedor escribe un código cualquiera del catálogo, el Excel le resuelve
// descripción / unidad / precio del segmento con
// `VLOOKUP(Tabla_Costos, MATCH(segmento, COSTOS!L1:W1))`, y él pone el área (si
// es vidrio) o la cantidad (si es accesorio). Con eso cotizan todo lo que no
// encaja en ningún módulo: en el archivo vivo hay ítems rotulados "Fachada",
// "División de oficina" y "Mayor seguridad".
//
// Mientras el ERP solo supiera cotizar los seis módulos, toda fachada, división
// de oficina, baranda o pasamanos seguía saliendo del Excel — es decir, el Excel
// no se podía jubilar. Este módulo cierra ese hueco y no inventa ninguna regla
// de precio nueva: usa `lineaCatalogo()` y `totalizar()`, exactamente los mismos
// que los otros seis.
//
// LO QUE ESTE MÓDULO NO HACE, A PROPÓSITO
// ───────────────────────────────────────
//  1. NO emite `cortes`. Un ítem libre no tiene diseño, así que no tiene
//     despiece ni plano ni nivel de corte — igual que en el Excel, que para
//     estos ítems tampoco los tiene. `aptitudOrden.ts` ya trata la ausencia de
//     `resultado.cortes` como motivo SIN_DESPIECE_POR_DISENO, y la Hoja de
//     Trabajo ya imprime su página con los avisos "Sin plano" / "Sin despiece
//     calculado": no hubo que tocar ninguno de los dos.
//  2. NO agrega SMO ni flete al BOM, aunque el Excel sí los pone como dos
//     líneas más (`SMO01`, `GTFA26`). `totalizar()` multiplica CADA línea del
//     BOM por `cantidadPiezas`, así que meterlos aquí reproduciría el bug medido
//     el 2026-09-20: cinco piezas iguales cobrando cinco fletes y cinco manos de
//     obra. Son cargos de la propuesta (`cotizador.propuesta_cargo`), se cobran
//     una vez y quedan fuera del AIU y del descuento.
//  3. NO declara `descuentoPct` en el formulario: desde el 2026-09-20 hay UN
//     solo descuento y vive en la propuesta. `calcular()` lo sigue aceptando por
//     compatibilidad con lo ya guardado, igual que los otros seis módulos.
//
// LA UNIDAD DEL CATÁLOGO ES LA QUE DA SENTIDO A `cantidad`
// ────────────────────────────────────────────────────────
// No hay un campo "tipo de línea": lo decide el producto, como en el Excel. Un
// código `X M2` consume metros cuadrados, uno `X METRO`/`ML` metros lineales y
// uno `UND` unidades. El motor solo multiplica cantidad × precio; quien rotula
// el campo es el formulario, leyendo la misma unidad.
import { lineaCatalogo, totalizar, round2 } from "../lib/motorCalculo";
import { getParametros, segmentosValidos } from "../lib/catalogo";
import type { InputModulo } from "../tipos";
import type { LineaBOM } from "../lib/motorCalculo";

/** Tope de líneas por ítem. El Excel tenía cinco filas de vidrio y seis de
 * accesorios por plantilla; 40 es holgado sin volverse una tabla ingobernable
 * dentro de una sola línea del PDF al cliente. */
const MAX_LINEAS = 40;

/**
 * Cómo se interpreta la `cantidad` de una línea según la unidad del producto.
 *
 * Las cuatro unidades que existen hoy en el catálogo son `X METRO` (217
 * productos), `UND` (176), `X M2` (37) y `ML` (2). La clasificación se hace por
 * contenido y no con una lista exacta a propósito: si mañana entra `M2` o
 * `METRO LINEAL`, cae en el grupo correcto en vez de degradarse a "unidades" en
 * silencio.
 */
export function claseDeUnidad(unidad: string | null | undefined): "area" | "lineal" | "unidad" {
  const u = String(unidad ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  if (u.includes("M2")) return "area";
  if (u.includes("METRO") || u === "ML") return "lineal";
  return "unidad";
}

export const meta = {
  nombre: "Ítem libre",
  descripcion:
    "Ítem armado línea por línea con cualquier código del catálogo, para lo que no encaja en los otros módulos: " +
    "fachadas, divisiones de oficina, barandas, pasamanos. La unidad de cada código decide si su cantidad son " +
    "metros cuadrados, metros lineales o unidades. No genera despiece ni plano, porque no parte de un diseño.",
  campos: [
    {
      nombre: "descripcionItem",
      // 'string', no 'text': es el valor que ya declara el union `TipoCampo` del
      // frontend (types.ts). Ningún módulo lo usaba todavía —los seis anteriores
      // solo tienen number/select/boolean— pero `CampoDinamico` ya lo renderiza:
      // su rama final, la que no es select ni number, es un input de texto.
      tipo: "string",
      etiqueta: "Nombre del ítem (lo ve el cliente)",
      requerido: true,
      grupo: "cliente",
    },
    {
      nombre: "segmentoCliente",
      tipo: "select",
      opciones: ["PA", "PM", "PB"],
      etiqueta: "Tipo de cliente",
      requerido: true,
      grupo: "cliente",
    },
    {
      nombre: "lineas",
      tipo: "lineas",
      etiqueta: "Materiales y acabados",
      requerido: true,
      // Cae en la tarjeta "Medidas" porque es donde el formulario pone lo que
      // dimensiona el producto, y en un ítem libre eso son justamente las
      // líneas. Los cuatro títulos de tarjeta son fijos en el frontend
      // (GRUPO_CONFIG en FormularioModulo.tsx) y no vale la pena abrirlos por un
      // rótulo: la etiqueta del propio campo ya dice "Materiales y acabados".
      grupo: "medidas",
    },
    {
      nombre: "cantidadPiezas",
      tipo: "number",
      etiqueta: "Cantidad de piezas iguales",
      requerido: true,
      grupo: "comercial",
    },
  ],
};

interface LineaEntrada {
  codigo?: unknown;
  cantidad?: unknown;
  /** Solo productos con precio a cotizar: costo del proveedor que escribe el asesor. */
  costo?: unknown;
}

export function calcular(input: InputModulo) {
  const {
    descripcionItem,
    lineas,
    segmentoCliente,
    cantidadPiezas = 1,
    descuentoPct = 0,
  } = input ?? {};

  // --- Validación de inputs obligatorios ---
  if (!segmentosValidos().includes(segmentoCliente)) {
    throw new Error(
      `segmentoCliente inválido: "${segmentoCliente}". Debe ser uno de ${segmentosValidos().join(", ")}.`
    );
  }
  const cantPiezas = Number(cantidadPiezas);
  if (!Number.isInteger(cantPiezas) || cantPiezas <= 0) {
    throw new Error("cantidadPiezas es obligatorio y debe ser un entero mayor a 0.");
  }
  const descuento = Number(descuentoPct) || 0;
  if (descuento < 0 || descuento >= 1) {
    throw new Error("descuentoPct debe ser una fracción entre 0 (inclusive) y 1 (exclusive).");
  }
  if (!Array.isArray(lineas) || lineas.length === 0) {
    throw new Error("Agrega al menos una línea de material o acabado para poder calcular el ítem.");
  }
  if (lineas.length > MAX_LINEAS) {
    throw new Error(`Un ítem libre admite hasta ${MAX_LINEAS} líneas (llegaron ${lineas.length}).`);
  }

  const parametros = getParametros();
  const advertencias: string[] = [];

  // Un código repetido no se rechaza ni se fusiona —puede ser legítimo: el mismo
  // perfil en dos medidas distintas del mismo ítem— pero sí se avisa, porque la
  // otra causa posible es que el vendedor lo agregó dos veces sin darse cuenta y
  // el ítem estaría cobrando doble.
  const vistos = new Map<string, number>();

  const items: LineaBOM[] = (lineas as LineaEntrada[]).map((linea, i) => {
    const numero = i + 1;
    const codigo = String(linea?.codigo ?? "").trim().toUpperCase();
    if (!codigo) {
      throw new Error(`La línea ${numero} no tiene código. Elige un producto del catálogo o quita la línea.`);
    }
    const cantidad = Number(linea?.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new Error(
        `La cantidad de la línea ${numero} (${codigo}) debe ser un número mayor a 0.`
      );
    }

    vistos.set(codigo, (vistos.get(codigo) ?? 0) + 1);

    // Sin `unidadOverride`: la unidad que vale es la que el catálogo declara para
    // ese código, y es la misma que el formulario usó para rotular la cantidad.
    // Forzarla aquí sería poder contradecir la etiqueta que vio el vendedor.
    return lineaCatalogo(codigo, cantidad, segmentoCliente, { costoManual: linea?.costo });
  });

  for (const [codigo, veces] of vistos) {
    if (veces > 1) {
      advertencias.push(
        `El código ${codigo} aparece ${veces} veces en este ítem: si no es a propósito, se está cobrando de más.`
      );
    }
  }

  // Área informativa: solo suma las líneas que de verdad se cotizan por metro
  // cuadrado. No es "el área del ítem" (un ítem libre no tiene una geometría),
  // es cuánto vidrio/material por m² lleva — que es lo que el Excel mostraba en
  // su celda "Total Area". Se emite igual que en los otros módulos para que la
  // pantalla y el PDF tengan un número que enseñar.
  const area = round2(
    items.reduce((acc, it) => {
      if (it.error) return acc;
      return claseDeUnidad(it.unidad) === "area" ? acc + it.cantidad : acc;
    }, 0)
  );

  const nombre = String(descripcionItem ?? "").trim();
  if (!nombre) {
    advertencias.push(
      'Este ítem no tiene nombre: en la cotización del cliente va a aparecer como "item-libre #N". ' +
        'Escribe algo como "Fachada oficina 2º piso".'
    );
  }

  const resultado = totalizar(items, {
    cantidadPiezas: cantPiezas,
    descuentoPct: descuento,
    aiu: parametros.aiu,
    ivaPct: parametros.iva,
  });

  return { ...resultado, areaM2: area, advertencias };
}
