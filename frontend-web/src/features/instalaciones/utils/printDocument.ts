import { toast } from 'react-toastify';
import { abrirVentanaImpresion } from '../../../utils/printWindow';

export type TipoDoc = 'op' | 'tecnico' | 'sap';

export const abrirDocumento = (odp: any, tipo: TipoDoc) => {
  const contenidoId = tipo === 'op' ? `print-op-${odp.id}` :
    tipo === 'tecnico' ? `print-tec-${odp.id}` :
    `print-sap-${odp.id}`;
  const el = document.getElementById(contenidoId);
  if (!el) return toast.error('Documento no disponible');

  const titulos: Record<TipoDoc, string> = {
    op: `Orden de Producción ${odp.numero_odp || ''}`,
    tecnico: `Detalle Técnico ${odp.numero_odp || ''}`,
    sap: `SAP ${odp.numero_odp || ''}`,
  };

  abrirVentanaImpresion({
    titulo: titulos[tipo],
    contenidoHtml: el.innerHTML,
    ancho: 950,
    alto: 800,
    // Antes este documento no llevaba ningún estilo propio: dependía por
    // completo del CDN, así que sin él salía como texto plano.
    estilos: `
      @page { size: letter portrait; margin: 4mm; }
      body { font-family: sans-serif; }
      ${ESTILOS_DOCUMENTO}
    `,
  });
};

/** Tablas de los imprimibles de ODP. Los usan la ventana de impresión y el visor
 * del celular (`VisorDocumentos`), para que la hoja se vea igual en los dos. */
export const ESTILOS_DOCUMENTO = `
  .excel-table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
  .excel-table th, .excel-table td { border: 1px solid #000; padding: 2px 4px; }
  .excel-table th { font-weight: bold; text-align: center; }
  .thick-b { border-bottom: 2px solid #000 !important; }
`;

/** Celular (2026-10-11, decisión del usuario): ahí los documentos se VEN en un
 * visor en vez de imprimirse —la ventana emergente se bloquea y la hoja carta sale
 * diminuta—. En computador se sigue imprimiendo como siempre. */
export const esCelular = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches;
