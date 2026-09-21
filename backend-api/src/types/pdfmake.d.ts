// `pdfmake` no publica tipos para la API 0.3.x (una reescritura sobre pdfkit).
// `@types/pdfmake` describe la 0.2 — instalarlo declararía una API que ya no
// existe, así que se declara aquí, a mano, únicamente lo que
// `generadorPdfCotizacion.ts` usa. El `docDefinition` en sí se deja como
// `Record<string, unknown>`: tipar entero el DSL de contenido de pdfmake
// (tablas, columnas, canvas, estilos anidados...) no vale la pena para un solo
// consumidor — ver el mismo criterio en `ResultadoGuardado` de `aptitudOrden.ts`.
declare module "pdfmake" {
  export interface PdfMakeFontDescriptor {
    normal: string;
    bold: string;
    italics: string;
    bolditalics: string;
  }

  export interface PdfMakeOutputDocument {
    getBuffer(): Promise<Buffer>;
  }

  export interface PdfMake {
    setFonts(fonts: Record<string, PdfMakeFontDescriptor>): void;
    setLocalAccessPolicy(callback: (path: string) => boolean): void;
    setUrlAccessPolicy(callback: (url: string) => boolean): void;
    createPdf(docDefinition: Record<string, unknown>): PdfMakeOutputDocument;
  }

  const pdfMake: PdfMake;
  export default pdfMake;
}

declare module "pdfmake/standard-fonts/Helvetica" {
  import type { PdfMakeFontDescriptor } from "pdfmake";
  const fonts: { Helvetica: PdfMakeFontDescriptor };
  export default fonts;
}
