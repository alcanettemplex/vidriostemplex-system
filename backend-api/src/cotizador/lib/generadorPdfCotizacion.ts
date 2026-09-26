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
import { esCargoManoObra } from "./cargos";

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
}: {
  cotizacion: CotizacionPdf;
  propuesta: PropuestaPdf;
  otrasPropuestas?: PropuestaPdf[];
  empresa: EmpresaPdf | null;
}): Promise<Buffer> {
  const items = (propuesta.items ?? []).slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const cargos = propuesta.cargos ?? [];
  const fecha = new Date(cotizacion.creadaEn).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const folio = `${cotizacion.numero}-${propuesta.etiqueta}`;

  const filasItems = items.map((it, i) => [
    // Posición en la lista mostrada, NUNCA `it.orden`: es una secuencia interna
    // que empieza en 0 y "ítem 0" no es un número que un cliente deba leer.
    { text: String(i + 1), style: "tablaCelda", alignment: "center" },
    {
      text: it.descripcionItem?.trim() || getModulo(it.moduloId ?? "")?.meta?.nombre || "Producto",
      style: "tablaCelda",
    },
    { text: String(it.cantidadPiezas ?? 1), style: "tablaCelda", alignment: "center" },
    { text: moneda(it.subtotalConAiu), style: "tablaCelda", alignment: "right" },
  ]);

  // Mano de obra por producto (ENSAMBLE / INSTALACION, 2026-09-26) va ANTES del
  // descuento porque entra en su base; el resto de cargos, después. Así cada
  // renglón aparece en el orden en que se suma y la hoja cuadra.
  const manoObra = cargos.filter((c) => esCargoManoObra(c.tipo));
  const otrosCargos = cargos.filter((c) => !esCargoManoObra(c.tipo));
  const filasTotales: unknown[][] = [filaTotal("Subtotal productos", propuesta.totales.productos)];
  for (const c of manoObra) filasTotales.push(filaCargo(c));
  if (propuesta.totales.descuento > 0) {
    filasTotales.push(
      filaTotal(`Descuento (${(propuesta.descuentoPct * 100).toLocaleString("es-CO")}%)`, propuesta.totales.descuento, {
        negativo: true,
      })
    );
  }
  for (const c of otrosCargos) filasTotales.push(filaCargo(c));
  filasTotales.push(filaTotal("IVA", propuesta.totales.iva));
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
            { text: `No. ${folio}`, style: "subtituloDocumento", alignment: "right" },
          ],
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
            empresa?.validezOfertaTexto ? { text: empresa.validezOfertaTexto, style: "valor" } : null,
          ].filter(Boolean),
        },
      ],
      margin: [0, 0, 0, 20],
    },

    // --- Ítems -------------------------------------------------------------
    {
      table: {
        headerRows: 1,
        widths: [30, "*", 50, 80],
        body: [
          [
            { text: "NO", style: "tablaEncabezado", alignment: "center" },
            { text: "DESCRIPCIÓN", style: "tablaEncabezado" },
            { text: "CANT.", style: "tablaEncabezado", alignment: "center" },
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
    columns: [
      {
        width: "*",
        stack: [
          { text: "MÉTODO DE PAGO", style: "etiquetaSeccion" },
          cuenta
            ? { text: `${cuenta.banco ?? ""} — ${cuenta.tipo ?? ""} No. ${cuenta.numero ?? ""}`, style: "valor" }
            : { text: "[Datos bancarios pendientes]", style: "valor" },
          cuenta?.titular ? { text: `A nombre de ${cuenta.titular}${cuenta.nit ? " · NIT " + cuenta.nit : ""}`, style: "valor" } : null,
        ].filter(Boolean),
      },
      {
        width: "*",
        stack: [
          { text: "GARANTÍA", style: "etiquetaSeccion" },
          { text: empresa?.garantia || "[Garantía pendiente]", style: "valor" },
        ],
      },
    ],
    margin: [0, 0, 0, 20],
  });

  const condiciones = empresa?.condicionesComerciales ?? [];
  if (condiciones.length > 0) {
    content.push({ text: "TÉRMINOS Y CONDICIONES", style: "etiquetaSeccion", margin: [0, 0, 0, 6] });
    content.push({
      ol: condiciones.map((c) => ({ text: c, style: "condicion" })),
      margin: [0, 0, 0, 10],
    });
  }

  const docDefinition: Record<string, unknown> = {
    pageSize: "A4",
    pageMargins: [40, 40, 40, 50],
    content,
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
