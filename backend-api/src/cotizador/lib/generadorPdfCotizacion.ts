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

/**
 * Valor de cada ítem tal como se imprime, en PESOS ENTEROS, con su parte de la
 * mano de obra ya sumada (decisión del usuario, 2026-09-26: "Suministro e
 * instalación de…" muestra el precio instalado).
 *
 * El total de mano de obra que se reparte es el GUARDADO en la propuesta, no uno
 * recalculado: `manoObraPorItem` solo da los pesos de reparto, así que el total
 * impreso nunca se aparta del guardado aunque una tarifa haya cambiado después.
 * Redondeo por mayor residuo: la suma de los enteros impresos es exactamente
 * `round(productos + manoObra)`, el mismo "Subtotal" de la tabla de totales.
 *
 * Devuelve null si no hay cómo repartir (mano de obra guardada sin ítems que la
 * generen): el PDF vuelve entonces a los renglones aparte, sin perder un peso.
 */
export function valoresConManoObra(items: ItemPdf[], totalManoObra: number): number[] | null {
  const productos = items.map((it) => Number(it.subtotalConAiu) || 0);
  const pesos = manoObraPorItem(items.map((it) => ({ moduloId: it.moduloId, input: it.input ?? {} })));
  const sumaPesos = pesos.reduce((a, b) => a + b, 0);
  if (totalManoObra > 0 && sumaPesos <= 0) return null;
  const exactos = productos.map((v, k) => v + (sumaPesos > 0 ? (totalManoObra * pesos[k]) / sumaPesos : 0));
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

const NOMBRE_CARGO: Record<string, string> = {
  SMO: "Mano de obra",
  ANDAMIO: "Alquiler de andamio",
  HUACAL: "Huacal",
  FLETE: "Flete",
  OTRO: "Otro",
  ENSAMBLE: "Ensamble",
  INSTALACION: "Instalación",
};

function filaCargo(c: CargoPdf) {
  const etiqueta = c.descripcion?.trim() || NOMBRE_CARGO[c.tipo] || c.tipo;
  return [
    { text: etiqueta, style: "totalLabel" },
    { text: moneda(c.total) + (c.aplicaIva ? "" : " (sin IVA)"), style: "totalValue" },
  ];
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
  const fecha = new Date(cotizacion.creadaEn).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const folio = folioCotizacion(cotizacion.numero, propuesta.etiqueta, otrasPropuestas.length > 0);

  const manoObra = cargos.filter((c) => esCargoManoObra(c.tipo));
  const otrosCargos = cargos.filter((c) => !esCargoManoObra(c.tipo));
  const totalManoObra = manoObra.reduce((a, c) => a + (Number(c.total) || 0), 0);
  // La mano de obra va DENTRO del precio de cada ítem; si no se puede repartir,
  // se queda en renglones aparte como antes.
  const valores = valoresConManoObra(items, totalManoObra);
  const manoObraIncluida = valores !== null;

  const filasItems = items.map((it, i) => {
    const piezas = Number(it.cantidadPiezas) > 0 ? Number(it.cantidadPiezas) : 1;
    const subtotal = valores ? valores[i] : Number(it.subtotalConAiu ?? 0);
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
        ].filter(Boolean),
        style: "tablaCelda",
      },
      { text: String(piezas), style: "tablaCelda", alignment: "center" },
      // Unitario = subtotal ÷ piezas: presentación; × piezas puede diferir en $1.
      { text: moneda(subtotal / piezas), style: "tablaCelda", alignment: "right" },
      { text: moneda(subtotal), style: "tablaCelda", alignment: "right" },
    ];
  });

  // Orden en que se suma, para que la hoja cuadre: subtotal (productos + mano de
  // obra, que entra en la base del descuento) → descuento → cargos fuera del
  // AIU y del descuento → IVA → total.
  const filasTotales: unknown[][] = manoObraIncluida
    ? [filaTotal("Subtotal", propuesta.totales.productos + totalManoObra)]
    : [filaTotal("Subtotal productos", propuesta.totales.productos), ...manoObra.map(filaCargo)];
  if (propuesta.totales.descuento > 0) {
    filasTotales.push(
      filaTotal(`Descuento (${(propuesta.descuentoPct * 100).toLocaleString("es-CO")}%)`, propuesta.totales.descuento, {
        negativo: true,
      })
    );
  }
  for (const c of otrosCargos) filasTotales.push(filaCargo(c));
  const rotuloIva = Number(ivaPct) > 0 ? `IVA (${(Number(ivaPct) * 100).toLocaleString("es-CO")}%)` : "IVA";
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
            propuesta.nombre?.trim()
              ? { text: `Opción ${propuesta.etiqueta}: ${propuesta.nombre.trim()}`, style: "opcionDocumento", alignment: "right" }
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

  if (otrasPropuestas.length > 0) {
    content.push({ text: "OTRAS PROPUESTAS PRESENTADAS", style: "etiquetaSeccion", margin: [0, 0, 0, 6] });
    content.push({
      table: {
        widths: ["auto", "*", 100],
        body: [
          [
            { text: "PROP.", style: "tablaEncabezadoClara" },
            { text: "NOMBRE", style: "tablaEncabezadoClara" },
            { text: "TOTAL", style: "tablaEncabezadoClara", alignment: "right" },
          ],
          ...otrasPropuestas.map((p) => [
            { text: p.etiqueta, style: "tablaCelda" },
            { text: p.nombre?.trim() || "—", style: "tablaCelda" },
            { text: moneda(p.totales.total), style: "tablaCelda", alignment: "right" },
          ]),
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
    },
  };

  return pdfMake.createPdf(docDefinition).getBuffer();
}
