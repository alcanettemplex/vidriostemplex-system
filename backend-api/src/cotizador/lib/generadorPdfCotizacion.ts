// Genera el PDF de cotización que el asesor envía al cliente por WhatsApp
// (`cotizador-vision.md` → "Aprobación del cliente, en dos tiempos" — hoy sólo
// la primera: PDF enviado a mano, el asesor marca APROBADA en el sistema).
//
// AISLADO A PROPÓSITO (2026-09-21): recibe los datos YA calculados y
// denormalizados (`cotizacion`/`propuesta` tal como los devuelve
// `cotizacionStore.obtener()`, y `empresa` tal como la devuelve
// `empresaStore.leer(true)`). No consulta Postgres, no decide totales, no
// decide aptitud: sólo maqueta lo que se le pasa. Quien arma esos datos es el
// controlador.
//
// POR QUÉ pdfmake Y NO window.print(): los demás printables del ERP abren una
// vista de impresión (`abrirVentanaImpresion`), pero este documento hay que
// poder ADJUNTARLO a un mensaje de WhatsApp — hace falta un archivo real, no
// un diálogo de impresión. `pdfmake@0.3.11` exacto: 0.3 reescribió el motor
// sobre `pdfkit` y cambió la API de extremo a extremo frente a la 0.2 (por
// eso NO se instaló `@types/pdfmake`, que describe la 0.2 — ver
// `src/types/pdfmake.d.ts`).
//
// TIPOGRAFÍA: Helvetica (las 14 fuentes estándar de pdfkit, sin archivos que
// embeber). La identidad del Cotizador usa Space Grotesk/Manrope en pantalla,
// pero traerlas aquí exige generar un `vfs_fonts` propio con los TTF — no
// entra en esta v1; se documenta como pendiente si el usuario lo pide.
//
// PALETA: estimada del logo real (`frontend-web/public/assets/images/logotemplex.png`),
// no un valor de marca confirmado. Ajustar aquí en cuanto el usuario dé los
// códigos exactos — es el único punto que hay que tocar para todo el documento.
// `pdfmake` no trae tipos propios (ver `src/types/pdfmake.d.ts`) y esa
// declaración ambiental no llega sola al programa de `ts-node` cuando nadie
// más la importa (`ts-node/register` sólo añade al programa lo alcanzable
// desde el require() inicial, a diferencia de `tsc`, que usa el `include` del
// tsconfig entero) — sin esta referencia, `npm run dev` compila con `tsc`
// pero un script lanzado con `ts-node/register` falla con TS7016.
/// <reference path="../../types/pdfmake.d.ts" />
import pdfMake from "pdfmake";
import helvetica from "pdfmake/standard-fonts/Helvetica";
import { getModulo } from "../modules/registry";
import { esCargoManoObra, manoObraPorItem } from "./cargos";
import { descripcionComercial, personalizacionComercial } from "./detalleComercial";
import type { ResumenPersonalizacionLaxo } from "./detalleComercial";
import {
  agruparIdenticos,
  leyendaSimbolos,
  rotuloItems,
  svgDiseno,
  svgPlantaL,
  textoAvisoL,
  type DibujoItem,
  type GrupoAnexo,
} from "./dibujoPdf";

pdfMake.setFonts(helvetica);
// pdfkit resuelve las 14 fuentes estándar por el mismo camino que un archivo
// local (`PDFDocument.provideFont` -> `validateLocalFile`): negar la política
// entera bloquea también "Helvetica-Bold". Se permiten sólo los 4 nombres que
// `standard-fonts/Helvetica` declara — cualquier otra ruta sigue denegada,
// que es la defensa en profundidad real (el documento nunca referencia un
// archivo del disco; el logo llega ya como data URI desde `empresaStore`).
const FUENTES_PERMITIDAS = new Set(Object.values(helvetica.Helvetica));
pdfMake.setLocalAccessPolicy((ruta) => FUENTES_PERMITIDAS.has(ruta));
pdfMake.setUrlAccessPolicy(() => false);

const COLOR = {
  navy: "#1B3A63",
  blue: "#2E75B6",
  blueLight: "#EAF2FB",
  grayDark: "#333333",
  gray: "#666666",
  grayBorder: "#CCCCCC",
  white: "#FFFFFF",
};

const formatoCOP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function moneda(n: number | null | undefined): string {
  return formatoCOP.format(Number(n ?? 0));
}

// El blob de un ítem/cotización/empresa es un artefacto de otra capa, tipado
// laxo a propósito — mismo criterio que `ResultadoGuardado` en `aptitudOrden.ts`.
export interface ItemPdf {
  orden?: number;
  moduloId?: string | null;
  descripcionItem?: string | null;
  cantidadPiezas?: number;
  subtotalConAiu?: number;
  /** Solo los trae la propuesta que se imprime (las demás llegan sin blobs):
   * de aquí sale la línea de especificaciones de cada ítem. */
  input?: Record<string, unknown> | null;
  resultado?: {
    diseno?: { sistema?: string; etiqueta?: string | null; diseno?: string } | null;
    personalizacion?: ResumenPersonalizacionLaxo | null;
  } | null;
  /** Dibujo para el anexo (2026-10-17). Lo calcula el controlador con
   * `dibujoDeItem` (necesita las correcciones de geometría de la caché, que
   * este generador no lee). Ausente = el ítem no sale en el anexo. */
  dibujo?: DibujoItem | null;
}

export interface CargoPdf {
  tipo: string;
  descripcion?: string | null;
  cantidad: number;
  unidad: string;
  valorUnitario: number;
  total: number;
  aplicaIva: boolean;
}

export interface PropuestaPdf {
  id: number;
  etiqueta: string;
  nombre?: string | null;
  nota?: string | null;
  descuentoPct: number;
  totales: { productos: number; manoObra?: number; descuento: number; cargos: number; iva: number; total: number };
  items?: ItemPdf[];
  cargos?: CargoPdf[];
}

export interface CotizacionPdf {
  numero: number;
  creadaEn: string | Date;
  cliente: { nombre?: string | null; direccion?: string | null; telefono?: string | null; obra?: string | null; contacto?: string | null };
  asesor?: string | null;
  /** "ODP-24381" si la cotización ya tiene ODP (2026-09-27). */
  odpNumero?: string | null;
}

// ─── Referencia del documento (2026-09-27, pedido del usuario) ──────────────
// "COT-87" y, si la cotización tiene varias opciones, la letra: "COT-87 B". Con
// una sola opción la letra sobra (siempre sería la A). La misma referencia
// encabeza el PDF y da nombre al archivo: "COT-87 B, ODP-24381 Luis Rafael
// Alcala Muñoz.pdf", para que el cliente y el asesor los encuentren igual.

export function folioCotizacion(numero: number, etiqueta: string, variasOpciones: boolean): string {
  return variasOpciones && etiqueta ? `COT-${numero} ${etiqueta}` : `COT-${numero}`;
}

/** Nombre del archivo, sin extensión, sin los caracteres que Windows no admite. */
export function nombreArchivoCotizacion(folio: string, odpNumero?: string | null, cliente?: string | null): string {
  const partes = [folio, odpNumero?.trim()].filter(Boolean).join(", ");
  const nombre = [partes, cliente?.trim()].filter(Boolean).join(" ");
  return nombre.replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);
}

export interface EmpresaPdf {
  razonSocial?: string | null;
  nombreComercial?: string | null;
  eslogan?: string | null;
  nit?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  web?: string | null;
  cuentaBancaria?: { banco?: string; tipo?: string; numero?: string; titular?: string; nit?: string } | null;
  garantia?: string | null;
  validezOfertaTexto?: string | null;
  condicionesComerciales?: string[];
  logoDataUri?: string | null;
}

/** `id` del bloque de términos y condiciones, para `pageBreakBefore`. */
const BLOQUE_CONDICIONES = "bloque-condiciones";

/** Suma `monto` a `base` en proporción a `pesos`; sin pesos positivos, por partes iguales. */
function repartir(base: number[], monto: number, pesos: number[]): number[] {
  if (!(monto > 0) || base.length === 0) return base.slice();
  const positivos = pesos.map((p) => Math.max(0, p));
  const suma = positivos.reduce((a, b) => a + b, 0);
  return base.map((v, k) => v + (suma > 0 ? (monto * positivos[k]) / suma : monto / base.length));
}

/**
 * Valor de cada ítem tal como se imprime, en PESOS ENTEROS, con la mano de obra
 * y los demás cargos (flete, andamio, huacal, otros) ya sumados.
 *
 * Decisiones del usuario: la mano de obra va dentro del precio del ítem
 * (2026-09-26, "Suministro e instalación de…" muestra el precio instalado), y
 * desde el 2026-10-14 también los cargos: el cliente solo ve Subtotal, IVA y
 * Total, sin renglones de flete ni de instalación.
 *
 * - Mano de obra: por el peso que da `manoObraPorItem`; si ningún ítem la genera
 *   (caso raro), en proporción al valor de cada ítem.
 * - Demás cargos: en proporción al valor del ítem ya con su mano de obra; si
 *   todos valen cero, por partes iguales.
 *
 * Los totales que se reparten son los GUARDADOS en la propuesta, no unos
 * recalculados, así que lo impreso nunca se aparta de lo guardado aunque una
 * tarifa haya cambiado después. Redondeo por mayor residuo: la suma de los
 * enteros impresos es exactamente `round(productos + manoObra + cargos)`, el
 * mismo "Subtotal" de la tabla de totales.
 */
export function valoresConCargos(items: ItemPdf[], totalManoObra: number, totalOtrosCargos = 0): number[] {
  const productos = items.map((it) => Number(it.subtotalConAiu) || 0);
  const pesosMO = manoObraPorItem(items.map((it) => ({ moduloId: it.moduloId, input: it.input ?? {} })));
  const hayPesosMO = pesosMO.some((p) => p > 0);
  const conManoObra = repartir(productos, totalManoObra, hayPesosMO ? pesosMO : productos);
  const exactos = repartir(conManoObra, totalOtrosCargos, conManoObra);
  const objetivo = Math.round(exactos.reduce((a, b) => a + b, 0));
  const pisos = exactos.map(Math.floor);
  let faltan = objetivo - pisos.reduce((a, b) => a + b, 0);
  const orden = exactos.map((v, k) => ({ k, residuo: v - Math.floor(v) })).sort((a, b) => b.residuo - a.residuo);
  for (const { k } of orden) {
    if (faltan <= 0) break;
    pisos[k] += 1;
    faltan -= 1;
  }
  return pisos;
}

/**
 * Qué trae una propuesta, en una línea: "Ventanas (2) · Tablero (1)".
 *
 * Sale solo de columnas que las propuestas NO impresas también traen en modo
 * ligero (`modulo_id`, `descripcion_item`, `cantidad_piezas`): `descripcionComercial`
 * necesita los blobs `input`/`resultado`, que solo viajan con la propuesta que se
 * imprime. Agrupa por producto y suma piezas; más de 4 grupos se resumen en "y N más".
 */
export function resumenPropuesta(items: ItemPdf[] | undefined): string {
  const grupos = new Map<string, number>();
  for (const it of (items ?? []).slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))) {
    const nombre = it.descripcionItem?.trim() || getModulo(it.moduloId ?? "")?.meta?.nombre || "Producto";
    const piezas = Number(it.cantidadPiezas) > 0 ? Number(it.cantidadPiezas) : 1;
    grupos.set(nombre, (grupos.get(nombre) ?? 0) + piezas);
  }
  const partes = [...grupos].map(([nombre, piezas]) => `${nombre} (${piezas})`);
  const MAX = 4;
  return partes.length > MAX
    ? `${partes.slice(0, MAX).join(" · ")} y ${partes.length - MAX} más`
    : partes.join(" · ");
}

/** Condición con negrillas marcadas `**así**` (Configuración las escribe así). */
function textoConNegrilla(texto: string): Array<{ text: string; bold?: boolean }> {
  return texto
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((trozo) => (/^\*\*[^*]+\*\*$/.test(trozo) ? { text: trozo.slice(2, -2), bold: true } : { text: trozo }));
}

/** Casilla para marcar a mano (Helvetica estándar no trae el glifo ☐). */
function casilla() {
  return { canvas: [{ type: "rect", x: 0, y: 1, w: 9, h: 9, lineWidth: 0.8, lineColor: COLOR.navy }], width: 12 };
}

function filaTotal(etiqueta: string, valor: number, opts: { negativo?: boolean; destacado?: boolean } = {}) {
  const texto = (opts.negativo && valor > 0 ? "-" : "") + moneda(valor);
  if (opts.destacado) {
    return [
      { text: etiqueta, style: "totalDestacadoLabel", fillColor: COLOR.navy },
      { text: texto, style: "totalDestacadoValue", fillColor: COLOR.navy },
    ];
  }
  return [
    { text: etiqueta, style: "totalLabel" },
    { text: texto, style: "totalValue" },
  ];
}

const ALERTA = { fondo: "#FFF6E5", borde: "#E8B04B", titulo: "#8A5A00" };

/**
 * Tarjeta de un grupo del anexo: número(s) de ítem, unidades, dibujo, sentido
 * de apertura (solo puertas de cabina), aviso de cabina en L y descripción.
 * Un grupo de idénticos imprime la descripción sin ubicación y lista las
 * ubicaciones en la anotación.
 */
function tarjetaAnexo(g: GrupoAnexo) {
  const { entrada } = g;
  const d = entrada.dibujo;
  const agrupado = g.numeros.length > 1;
  const input = agrupado ? { ...(entrada.input ?? {}), descripcionItem: "" } : entrada.input;
  const descripcion = descripcionComercial(entrada.moduloId, input, entrada.resultado) ||
    getModulo(entrada.moduloId ?? "")?.meta?.nombre || "Producto";
  const esPuerta = d.tipo === "cabinaBatiente" && d.plano.paneles.some((p) => ["Z", "P", "B"].includes(p.tipo.toUpperCase()));
  const avisoL = d.enL
    ? {
        table: {
          widths: ["auto", "*"],
          body: [[
            { svg: svgPlantaL(d.cotaAnchoMm, d.ladoYMm), width: 92, margin: [2, 2, 0, 0] },
            {
              stack: [
                { text: "Cabina en L", style: "avisoTitulo" },
                { text: textoAvisoL(d.cotaAnchoMm, d.ladoYMm), style: "avisoTexto" },
                { text: "Vista desde arriba", style: "avisoRotulo" },
              ],
              margin: [6, 4, 4, 4],
            },
          ]],
        },
        layout: {
          fillColor: () => ALERTA.fondo,
          hLineWidth: () => 0.8,
          vLineWidth: () => 0.8,
          hLineColor: () => ALERTA.borde,
          vLineColor: () => ALERTA.borde,
          paddingLeft: () => 0,
          paddingRight: () => 0,
        },
        margin: [0, 6, 0, 0],
      }
    : null;
  return {
    stack: [
      {
        columns: [
          { text: rotuloItems(g.numeros), style: "anexoItem", width: "*" },
          { text: g.piezas > 1 ? `${g.piezas} unidades` : "1 unidad", style: "anexoCantidad", width: "auto" },
        ],
        margin: [0, 0, 0, 2],
      },
      agrupado
        ? { text: `Productos idénticos${g.ubicaciones.length ? " · " + g.ubicaciones.join(", ") : ""}`, style: "anexoAgrupado" }
        : null,
      d.enL
        ? { text: "VISTA FRONTAL (LADO X)", style: "anexoRotuloVista", alignment: "center", margin: [0, 4, 0, 2] }
        : { text: " ", fontSize: 4 },
      { svg: svgDiseno(d), fit: [225, d.enL ? 150 : 190], alignment: "center" },
      esPuerta
        ? {
            text: d.apertura ? `Abre hacia la ${d.apertura} (vista exterior)` : "Sentido de apertura por definir",
            style: d.apertura ? "anexoApertura" : "anexoAperturaPendiente",
            alignment: "center",
            margin: [0, 4, 0, 0],
          }
        : null,
      avisoL,
      { text: descripcion, style: "anexoDescripcion", margin: [0, 6, 0, 0] },
    ].filter(Boolean),
    margin: [10, 10, 10, 10],
  };
}

/**
 * Arma el `docDefinition` y lo renderiza a un Buffer PDF.
 *
 * `otrasPropuestas` son las demás propuestas de la MISMA cotización (si las
 * hay): se muestran como comparación compacta (nombre + total), nunca con su
 * detalle completo — eso ya lo decidió `cotizador-vision.md`.
 */
export async function generarPdfCotizacion({
  cotizacion,
  propuesta,
  otrasPropuestas = [],
  empresa,
  ivaPct,
}: {
  cotizacion: CotizacionPdf;
  propuesta: PropuestaPdf;
  otrasPropuestas?: PropuestaPdf[];
  empresa: EmpresaPdf | null;
  /** Fracción (0,19). Solo rotula el renglón del IVA; el valor ya viene calculado. */
  ivaPct?: number | null;
}): Promise<Buffer> {
  const items = (propuesta.items ?? []).slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const cargos = propuesta.cargos ?? [];
  // Zona explícita: el PDF lo genera el servidor (Render, en UTC) y una cotización creada
  // de noche salía con la fecha de mañana.
  const fecha = new Date(cotizacion.creadaEn).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Bogota",
  });
  const variasOpciones = otrasPropuestas.length > 0;
  const folio = folioCotizacion(cotizacion.numero, propuesta.etiqueta, variasOpciones);

  const manoObra = cargos.filter((c) => esCargoManoObra(c.tipo));
  const otrosCargos = cargos.filter((c) => !esCargoManoObra(c.tipo));
  const totalManoObra = manoObra.reduce((a, c) => a + (Number(c.total) || 0), 0);
  const totalOtrosCargos = otrosCargos.reduce((a, c) => a + (Number(c.total) || 0), 0);
  // Mano de obra y cargos van DENTRO del precio de cada ítem (2026-10-14): el
  // cliente no ve renglones de flete, andamio ni instalación.
  const valores = valoresConCargos(items, totalManoObra, totalOtrosCargos);

  const filasItems = items.map((it, i) => {
    const piezas = Number(it.cantidadPiezas) > 0 ? Number(it.cantidadPiezas) : 1;
    const subtotal = valores[i];
    // "Sala — Suministro e instalación de ventana 744 color mate, vidrio claro
    // 4 mm crudo, medidas 1.000 × 1.000 mm" (ver detalleComercial.ts).
    const descripcion = descripcionComercial(it.moduloId, it.input, it.resultado) ||
      it.descripcionItem?.trim() || getModulo(it.moduloId ?? "")?.meta?.nombre || "Producto";
    const personalizado = personalizacionComercial(it.resultado);
    return [
      // Posición en la lista mostrada, NUNCA `it.orden`: es una secuencia interna
      // que empieza en 0 y "ítem 0" no es un número que un cliente deba leer.
      { text: String(i + 1), style: "tablaCelda", alignment: "center" },
      {
        stack: [
          { text: descripcion },
          personalizado ? { text: personalizado, style: "detalleItem", italics: true } : null,
          it.dibujo ? { text: "Ver diseño en el anexo", style: "verAnexo" } : null,
        ].filter(Boolean),
        style: "tablaCelda",
      },
      { text: String(piezas), style: "tablaCelda", alignment: "center" },
      // Unitario = subtotal ÷ piezas: presentación; × piezas puede diferir en $1.
      { text: moneda(subtotal / piezas), style: "tablaCelda", alignment: "right" },
      { text: moneda(subtotal), style: "tablaCelda", alignment: "right" },
    ];
  });

  // Solo Subtotal → (Descuento) → IVA → Total (2026-10-14). El Subtotal es la
  // suma de la columna de ítems, que ya trae mano de obra y cargos.
  const subtotal = items.length
    ? valores.reduce((a, b) => a + b, 0)
    : Math.round(propuesta.totales.productos + totalManoObra + totalOtrosCargos);
  const filasTotales: unknown[][] = [filaTotal("Subtotal", subtotal)];
  if (propuesta.totales.descuento > 0) {
    // Sin el %: el descuento se calcula sobre productos + mano de obra, no sobre
    // los cargos que ahora van dentro del Subtotal; el % impreso no cuadraría.
    filasTotales.push(filaTotal("Descuento", propuesta.totales.descuento, { negativo: true }));
  }
  // Con un cargo exento, el IVA ya no es el % exacto del Subtotal impreso.
  const ivaUniforme = otrosCargos.every((c) => c.aplicaIva !== false);
  const rotuloIva = Number(ivaPct) > 0 && ivaUniforme ? `IVA (${(Number(ivaPct) * 100).toLocaleString("es-CO")}%)` : "IVA";
  filasTotales.push(filaTotal(rotuloIva, propuesta.totales.iva));
  filasTotales.push(filaTotal("TOTAL A PAGAR", propuesta.totales.total, { destacado: true }));

  const content: Record<string, unknown>[] = [
    // --- Encabezado -----------------------------------------------------
    {
      columns: [
        empresa?.logoDataUri
          ? { image: empresa.logoDataUri, width: 120 }
          : { text: empresa?.nombreComercial ?? "VIDRIOS TEMPLEX", style: "marca" },
        {
          stack: [
            { text: "COTIZACIÓN", style: "tituloDocumento", alignment: "right" },
            // Referencia (2026-09-27): "COT-87 B" en grande; debajo la ODP, si
            // ya la tiene, y el cliente. Es lo mismo que dice el nombre del archivo.
            { text: folio, style: "folioDocumento", alignment: "right" },
            cotizacion.odpNumero?.trim()
              ? {
                  text: [{ text: "ODP ", style: "referenciaEtiqueta" }, { text: cotizacion.odpNumero.trim().replace(/^ODP-?/i, "") }],
                  style: "referenciaDocumento",
                  alignment: "right",
                }
              : null,
            cotizacion.cliente.nombre?.trim()
              ? { text: cotizacion.cliente.nombre.trim(), style: "clienteDocumento", alignment: "right" }
              : null,
            // El nombre de la opción (2026-09-26): con varias propuestas, la
            // letra sola no le dice al cliente cuál de las tres está leyendo.
            // Sin nombre (2026-09-28, COT-91): "Opción A de 2", nunca la letra sola.
            propuesta.nombre?.trim()
              ? { text: `Opción ${propuesta.etiqueta}: ${propuesta.nombre.trim()}`, style: "opcionDocumento", alignment: "right" }
              : variasOpciones
                ? { text: `Opción ${propuesta.etiqueta} de ${otrasPropuestas.length + 1}`, style: "opcionDocumento", alignment: "right" }
                : null,
          ].filter(Boolean),
          width: "*",
        },
      ],
    },
    { canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 3, color: COLOR.navy }], margin: [0, 8, 0, 16] },

    // --- Cliente / proyecto ----------------------------------------------
    {
      columns: [
        {
          width: "*",
          stack: [
            { text: "CLIENTE", style: "etiquetaSeccion" },
            { text: cotizacion.cliente.nombre || "—", style: "valorDestacado" },
            cotizacion.cliente.direccion ? { text: cotizacion.cliente.direccion, style: "valor" } : null,
            cotizacion.cliente.telefono ? { text: cotizacion.cliente.telefono, style: "valor" } : null,
            cotizacion.cliente.contacto ? { text: `Contacto: ${cotizacion.cliente.contacto}`, style: "valor" } : null,
          ].filter(Boolean),
        },
        {
          width: "*",
          stack: [
            { text: "PROYECTO / OBRA", style: "etiquetaSeccion" },
            { text: cotizacion.cliente.obra || "—", style: "valorDestacado" },
            { text: `Fecha: ${fecha}`, style: "valor" },
            cotizacion.asesor ? { text: `Asesor: ${cotizacion.asesor}`, style: "valor" } : null,
          ].filter(Boolean),
        },
      ],
      margin: [0, 0, 0, 20],
    },

    // --- Ítems -------------------------------------------------------------
    {
      table: {
        headerRows: 1,
        widths: [26, "*", 36, 72, 76],
        // Un ítem es nombre + especificaciones: partirlo entre dos hojas deja el
        // nombre en una y lo que es en la otra.
        dontBreakRows: true,
        body: [
          [
            { text: "NO", style: "tablaEncabezado", alignment: "center" },
            { text: "DESCRIPCIÓN", style: "tablaEncabezado" },
            { text: "CANT.", style: "tablaEncabezado", alignment: "center" },
            { text: "VR. UNIT.", style: "tablaEncabezado", alignment: "right" },
            { text: "SUBTOTAL", style: "tablaEncabezado", alignment: "right" },
          ],
          ...filasItems,
        ],
      },
      layout: {
        fillColor: (rowIndex: number) => (rowIndex === 0 ? COLOR.navy : rowIndex % 2 === 0 ? COLOR.blueLight : null),
        hLineWidth: () => 0.5,
        vLineWidth: () => 0,
        hLineColor: () => COLOR.grayBorder,
      },
      margin: [0, 0, 0, 16],
    },

    propuesta.nota ? { text: propuesta.nota, style: "nota", margin: [0, 0, 0, 12] } : null,

    // --- Totales -------------------------------------------------------------
    {
      columns: [
        { width: "*", text: "" },
        {
          width: 260,
          table: { widths: ["*", 100], body: filasTotales },
          layout: "noBorders",
        },
      ],
      margin: [0, 0, 0, 20],
    },
  ].filter(Boolean) as Record<string, unknown>[];

  // Las propuestas son ALTERNATIVAS excluyentes de la misma obra, no
  // complementos: el título y la nota lo dicen para que nadie las sume
  // (2026-09-28, COT-91). Cada una lleva su contenido resumido debajo del
  // nombre; sin nombre, el resumen hace de nombre en vez de un "—".
  if (variasOpciones) {
    content.push({ text: "OTRAS OPCIONES COTIZADAS (ALTERNATIVAS, SE ELIGE UNA)", style: "etiquetaSeccion", margin: [0, 0, 0, 2] });
    content.push({
      text: `Cada opción se cotiza por separado: su valor no se suma al total de la opción ${propuesta.etiqueta}.`,
      style: "nota",
      margin: [0, 0, 0, 6],
    });
    content.push({
      table: {
        widths: ["auto", "*", 100],
        dontBreakRows: true,
        body: [
          [
            { text: "OPCIÓN", style: "tablaEncabezadoClara" },
            { text: "CONTENIDO", style: "tablaEncabezadoClara" },
            { text: "TOTAL", style: "tablaEncabezadoClara", alignment: "right" },
          ],
          ...otrasPropuestas.map((p) => {
            const nombre = p.nombre?.trim();
            const resumen = resumenPropuesta(p.items);
            return [
              { text: p.etiqueta, style: "tablaCelda", bold: true },
              {
                stack: [
                  nombre ? { text: nombre, bold: true } : null,
                  resumen
                    ? { text: resumen, style: nombre ? "detalleItem" : undefined }
                    : nombre ? null : { text: "Sin productos" },
                ].filter(Boolean),
                style: "tablaCelda",
              },
              { text: moneda(p.totales.total), style: "tablaCelda", alignment: "right" },
            ];
          }),
        ],
      },
      layout: { hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => COLOR.grayBorder },
      margin: [0, 0, 0, 20],
    });
  }

  // --- Pago, garantía y contacto ---------------------------------------------
  const cuenta = empresa?.cuentaBancaria;
  content.push({
    unbreakable: true,
    stack: [
      { text: "MÉTODO DE PAGO", style: "etiquetaSeccion" },
      cuenta
        ? { text: `${cuenta.banco ?? ""} — ${cuenta.tipo ?? ""} No. ${cuenta.numero ?? ""}`, style: "valor" }
        : { text: "[Datos bancarios pendientes]", style: "valor" },
      cuenta?.titular ? { text: `A nombre de ${cuenta.titular}${cuenta.nit ? " · NIT " + cuenta.nit : ""}`, style: "valor" } : null,
    ].filter(Boolean),
    margin: [0, 0, 0, 20],
  });

  // --- Cierre, como el formato VR09 del negocio (2026-09-26) ----------------
  // Condiciones → garantía → validez → recuadro final: marca a la izquierda y,
  // a la derecha, lo que se llena a mano al aprobar (asesor, fecha de entrega,
  // aprobó sí/no, número de O.D.P.). Un solo bloque: si no cabe entero en lo que
  // queda de hoja, `pageBreakBefore` lo pasa completo a la siguiente (antes, la
  // última condición caía sola en una segunda página).
  const condiciones = empresa?.condicionesComerciales ?? [];
  const linea = (etiqueta: string, valor?: string | null) => ({
    columns: [
      { text: etiqueta, style: "cierreEtiqueta", width: 95 },
      {
        stack: [
          { text: valor?.trim() || " ", style: "cierreValor" },
          // 95 = ancho útil de la columna (215 − márgenes − rótulo): no se sale del recuadro.
          { canvas: [{ type: "line", x1: 0, y1: 0, x2: 95, y2: 0, lineWidth: 0.6, lineColor: COLOR.navy }] },
        ],
        width: "*",
      },
    ],
    margin: [0, 0, 0, 7],
  });
  const recuadroFinal = {
    table: {
      widths: ["*", 215],
      body: [
        [
          {
            stack: [
              { text: (empresa?.nombreComercial ?? "VIDRIOS TEMPLEX").toUpperCase(), style: "marcaPie" },
              empresa?.eslogan ? { text: empresa.eslogan, style: "esloganPie" } : null,
              {
                text: [empresa?.telefono, empresa?.direccion, empresa?.web].filter(Boolean).join("  ·  "),
                style: "contactoPie",
              },
            ].filter(Boolean),
            fillColor: COLOR.navy,
            margin: [14, 16, 10, 14],
          },
          {
            stack: [
              linea("ASESOR COMERCIAL:", cotizacion.asesor),
              linea("FECHA DE ENTREGA:"),
              {
                columns: [
                  { text: "APROBÓ:", style: "cierreEtiqueta", width: 95 },
                  { text: "SÍ", style: "cierreEtiqueta", width: 14 },
                  casilla(),
                  { text: "", width: 16 },
                  { text: "NO", style: "cierreEtiqueta", width: 18 },
                  casilla(),
                ],
                margin: [0, 0, 0, 9],
              },
              linea("O.D.P. No:"),
            ],
            margin: [10, 12, 10, 6],
          },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 1,
      vLineWidth: () => 1,
      hLineColor: () => COLOR.navy,
      vLineColor: () => COLOR.navy,
    },
  };
  content.push({
    stack: [
      ...(condiciones.length > 0
        ? [
            { text: "CONDICIONES COMERCIALES", style: "etiquetaSeccion", margin: [0, 0, 0, 6] },
            { ol: condiciones.map((c) => ({ text: textoConNegrilla(c), style: "condicion" })), margin: [0, 0, 0, 12] },
          ]
        : []),
      { text: "GARANTÍA", style: "etiquetaSeccion" },
      { text: empresa?.garantia || "[Garantía pendiente]", style: "valor", margin: [0, 0, 0, 10] },
      empresa?.validezOfertaTexto
        ? { text: empresa.validezOfertaTexto, style: "validez", margin: [0, 0, 0, 10] }
        : null,
      recuadroFinal,
    ].filter(Boolean),
    id: BLOQUE_CONDICIONES,
  });

  // --- Anexo: diseños cotizados (2026-10-17) --------------------------------
  // Va después del recuadro de aprobación, en hoja aparte. Ver lib/dibujoPdf.ts.
  const entradasAnexo = items.flatMap((it, i) =>
    it.dibujo
      ? [{ numero: i + 1, moduloId: it.moduloId, input: it.input, resultado: it.resultado, cantidadPiezas: it.cantidadPiezas, dibujo: it.dibujo }]
      : []
  );
  if (entradasAnexo.length > 0) {
    const grupos = agruparIdenticos(entradasAnexo);
    const filas: unknown[][] = [];
    for (let k = 0; k < grupos.length; k += 2) {
      filas.push([tarjetaAnexo(grupos[k]), grupos[k + 1] ? tarjetaAnexo(grupos[k + 1]) : { text: "" }]);
    }
    content.push({
      pageBreak: "before",
      stack: [
        {
          columns: [
            { text: "ANEXO · DISEÑOS COTIZADOS", style: "tituloAnexo", width: "*" },
            { text: folio, style: "folioAnexo", width: "auto" },
          ],
        },
        { canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 2, color: COLOR.navy }], margin: [0, 6, 0, 6] },
        {
          text: "Esquema ilustrativo de cada producto, visto desde el exterior. Medidas en milímetros (ancho × alto); las definitivas se confirman en la toma de medidas.",
          style: "nota",
          margin: [0, 0, 0, 6],
        },
        {
          columns: leyendaSimbolos(entradasAnexo.map((e) => e.dibujo)).map((l) => ({
            width: "auto",
            columns: [
              { svg: l.svg, width: 22 },
              { text: l.texto, style: "leyenda", width: "auto", noWrap: true, margin: [4, 4, 0, 0] },
            ],
          })),
          columnGap: 14,
          margin: [0, 0, 0, 10],
        },
      ],
    });
    content.push({
      table: { widths: ["*", "*"], dontBreakRows: true, body: filas },
      layout: {
        hLineWidth: () => 0.8,
        vLineWidth: () => 0.8,
        hLineColor: () => COLOR.grayBorder,
        vLineColor: () => COLOR.grayBorder,
      },
    });
  }

  const docDefinition: Record<string, unknown> = {
    info: {
      title: nombreArchivoCotizacion(folio, cotizacion.odpNumero, cotizacion.cliente.nombre),
      author: empresa?.nombreComercial ?? "Vidrios Templex",
    },
    pageSize: "A4",
    pageMargins: [40, 40, 40, 50],
    content,
    pageBreakBefore: (nodo: { id?: string; pageNumbers?: number[]; startPosition?: { top?: number } }) =>
      nodo.id === BLOQUE_CONDICIONES &&
      (nodo.pageNumbers?.length ?? 0) > 1 &&
      // Si ya empieza arriba de una hoja y aun así no cabe, partirlo es lo único
      // posible: saltar otra vez dejaría una hoja en blanco.
      (nodo.startPosition?.top ?? 0) > 120,
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        {
          text: [
            empresa?.direccion ? `${empresa.direccion} · ` : "",
            empresa?.telefono ?? "",
            empresa?.web ? ` · ${empresa.web}` : "",
          ].join(""),
          style: "pie",
        },
        { text: `Página ${currentPage} de ${pageCount}`, style: "pie", alignment: "right" },
      ],
      margin: [40, 0, 40, 0],
    }),
    defaultStyle: { font: "Helvetica", fontSize: 9, color: COLOR.grayDark },
    styles: {
      marca: { fontSize: 18, bold: true, color: COLOR.navy },
      tituloDocumento: { fontSize: 22, bold: true, color: COLOR.navy },
      subtituloDocumento: { fontSize: 11, color: COLOR.gray },
      folioDocumento: { fontSize: 14, bold: true, color: COLOR.blue, margin: [0, 2, 0, 0] },
      referenciaDocumento: { fontSize: 10, bold: true, color: COLOR.grayDark, margin: [0, 1, 0, 0] },
      referenciaEtiqueta: { fontSize: 8, bold: true, color: COLOR.gray },
      clienteDocumento: { fontSize: 10, color: COLOR.grayDark, margin: [0, 1, 0, 0] },
      opcionDocumento: { fontSize: 10, bold: true, color: COLOR.blue, margin: [0, 2, 0, 0] },
      detalleItem: { fontSize: 8, color: COLOR.gray, margin: [0, 2, 0, 0] },
      validez: { fontSize: 10, bold: true, color: COLOR.navy, alignment: "center" },
      marcaPie: { fontSize: 18, bold: true, color: COLOR.white, margin: [0, 0, 0, 4] },
      esloganPie: { fontSize: 10, italics: true, color: COLOR.white, margin: [0, 0, 0, 10] },
      contactoPie: { fontSize: 8, color: COLOR.white },
      cierreEtiqueta: { fontSize: 8, bold: true, color: COLOR.navy },
      cierreValor: { fontSize: 8, color: COLOR.grayDark, margin: [0, 0, 0, 1] },
      etiquetaSeccion: { fontSize: 9, bold: true, color: COLOR.blue, margin: [0, 0, 0, 4] },
      valorDestacado: { fontSize: 11, bold: true, margin: [0, 0, 0, 2] },
      valor: { fontSize: 9, color: COLOR.gray, margin: [0, 0, 0, 2] },
      nota: { fontSize: 9, italics: true, color: COLOR.gray },
      tablaEncabezado: { fontSize: 9, bold: true, color: COLOR.white, margin: [4, 5, 4, 5] },
      tablaEncabezadoClara: { fontSize: 9, bold: true, color: COLOR.navy, margin: [4, 4, 4, 4] },
      tablaCelda: { fontSize: 9, margin: [4, 4, 4, 4] },
      totalLabel: { fontSize: 9, color: COLOR.gray, margin: [4, 3, 4, 3] },
      totalValue: { fontSize: 9, alignment: "right", margin: [4, 3, 4, 3] },
      totalDestacadoLabel: { fontSize: 11, bold: true, color: COLOR.white, margin: [4, 6, 4, 6] },
      totalDestacadoValue: { fontSize: 11, bold: true, color: COLOR.white, alignment: "right", margin: [4, 6, 4, 6] },
      condicion: { fontSize: 8, color: COLOR.gray, margin: [0, 0, 0, 4] },
      pie: { fontSize: 7, color: COLOR.gray },
      // Anexo de diseños (2026-10-17)
      verAnexo: { fontSize: 7.5, bold: true, color: COLOR.blue, margin: [0, 2, 0, 0] },
      tituloAnexo: { fontSize: 14, bold: true, color: COLOR.navy },
      folioAnexo: { fontSize: 11, bold: true, color: COLOR.blue, margin: [0, 3, 0, 0] },
      leyenda: { fontSize: 7.5, color: COLOR.grayDark },
      anexoItem: { fontSize: 10, bold: true, color: COLOR.navy },
      anexoCantidad: { fontSize: 8, color: COLOR.gray, margin: [0, 1, 0, 0] },
      anexoAgrupado: { fontSize: 7.5, italics: true, color: COLOR.blue },
      anexoRotuloVista: { fontSize: 7, bold: true, color: COLOR.gray, characterSpacing: 0.5 },
      anexoApertura: { fontSize: 8, bold: true, color: COLOR.navy },
      anexoAperturaPendiente: { fontSize: 8, italics: true, color: COLOR.gray },
      anexoDescripcion: { fontSize: 7.5, color: COLOR.grayDark, lineHeight: 1.15 },
      avisoTitulo: { fontSize: 8.5, bold: true, color: ALERTA.titulo, margin: [0, 0, 0, 2] },
      avisoTexto: { fontSize: 7.5, color: COLOR.grayDark, lineHeight: 1.1 },
      avisoRotulo: { fontSize: 6.5, italics: true, color: COLOR.gray, margin: [0, 3, 0, 0] },
    },
  };

  return pdfMake.createPdf(docDefinition).getBuffer();
}
