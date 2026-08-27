import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';

export interface FacturaLinea {
  codigo_proveedor: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
  porcentaje_iva: number;
  total_linea: number;
}

export interface FacturaParseada {
  cufe: string | null;
  numero: string;
  fecha_emision: string;
  emisor_nit: string | null;
  emisor_nombre: string;
  lineas: FacturaLinea[];
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '__cdata',
  trimValues: true,
  parseTagValue: false, // mantener strings para no perder ceros a la izquierda en NITs/códigos
});

/**
 * Normaliza y extrae texto de un nodo que puede ser string, objeto con #text o __cdata
 */
function extraerTexto(nodo: any): string {
  if (!nodo) return '';
  if (typeof nodo === 'string') return nodo.trim();
  if (typeof nodo === 'number') return String(nodo);
  if (nodo['__cdata']) return String(nodo['__cdata']).trim();
  if (nodo['#text']) return String(nodo['#text']).trim();
  return '';
}

/**
 * Mapea unitCode DIAN / UN/ECE a modalidad del sistema
 */
function normalizarUnidad(unitCode: string): string {
  const code = (unitCode || '').toUpperCase().trim();
  if (code === 'MTR' || code === 'MT' || code === 'METRO' || code === 'METROS') return 'METRO';
  if (code === 'KGM' || code === 'KG' || code === 'KILO' || code === 'KILOGRAMO') return 'KG';
  if (code === 'MTK' || code === 'M2') return 'M2';
  if (code === 'TIRA' || code === 'TIRA_6M') return 'TIRA_6M';
  return 'UNIDAD';
}

/**
 * Parsea un XML (Invoice o AttachedDocument de DIAN) y extrae sus datos estructurados
 */
export function parsearXmlFactura(xmlString: string): FacturaParseada {
  let parsed = xmlParser.parse(xmlString);

  // 1. Si es AttachedDocument, buscar el Invoice embebido en CDATA o en el nodo de Attachment
  if (parsed['AttachedDocument'] || parsed['cac:Attachment']) {
    const attached = parsed['AttachedDocument'] || parsed;
    let invoiceXmlStr = '';

    // Buscar en cac:Attachment -> cac:ExternalReference -> cbc:Description
    const descNodo = attached?.['cac:Attachment']?.['cac:ExternalReference']?.['cbc:Description'];
    const descText = extraerTexto(descNodo);

    if (descText && (descText.includes('<Invoice') || descText.includes('<CreditNote'))) {
      invoiceXmlStr = descText;
    } else {
      // Buscar en todo el XML si hay bloque <Invoice...> o CDATA
      const match = xmlString.match(/<Invoice[\s\S]*?<\/Invoice>/i) || xmlString.match(/<CreditNote[\s\S]*?<\/CreditNote>/i);
      if (match) {
        invoiceXmlStr = match[0];
      }
    }

    if (invoiceXmlStr) {
      parsed = xmlParser.parse(invoiceXmlStr);
    }
  }

  // 2. Localizar nodo raíz Invoice (o CreditNote)
  const invoice = parsed['Invoice'] || parsed['CreditNote'] || parsed;

  const numero = extraerTexto(invoice['cbc:ID']) || 'S/N';
  const fechaEmision = extraerTexto(invoice['cbc:IssueDate']) || new Date().toISOString().split('T')[0];
  const cufe = extraerTexto(invoice['cbc:UUID']) || null;

  // 3. Emisor (Supplier)
  const supplierParty = invoice['cac:AccountingSupplierParty']?.['cac:Party'] || {};
  const nitTax = supplierParty['cac:PartyTaxScheme']?.['cbc:CompanyID'];
  const nitIdent = supplierParty['cac:PartyIdentification']?.['cbc:ID'];
  const nitRaw = extraerTexto(nitTax || nitIdent);

  // Limpiar NIT: extraer solo dígitos
  const nitMatch = nitRaw.match(/\d{6,}/);
  const emisor_nit = nitMatch ? nitMatch[0] : (nitRaw || null);

  const nombreReg = supplierParty['cac:PartyLegalEntity']?.['cbc:RegistrationName'];
  const nombreParty = supplierParty['cac:PartyName']?.['cbc:Name'];
  const emisor_nombre = extraerTexto(nombreReg || nombreParty) || (emisor_nit ? `Proveedor NIT ${emisor_nit}` : 'Proveedor Desconocido');

  // 4. Líneas de Factura (cac:InvoiceLine o cac:CreditNoteLine)
  const rawLines = invoice['cac:InvoiceLine'] || invoice['cac:CreditNoteLine'] || [];
  const linesArray = Array.isArray(rawLines) ? rawLines : [rawLines].filter(Boolean);

  const lineas: FacturaLinea[] = [];

  for (const line of linesArray) {
    const itemNodo = line['cac:Item'] || {};
    const sellersId = itemNodo['cac:SellersItemIdentification']?.['cbc:ID'];
    const standardId = itemNodo['cac:StandardItemIdentification']?.['cbc:ID'];
    const lineId = line['cbc:ID'];
    const codigo_proveedor = extraerTexto(sellersId || standardId || lineId || 'SIN_CODIGO');

    const descNodo = itemNodo['cbc:Description'];
    const descripcion = extraerTexto(descNodo) || 'Sin descripción';

    const qtyNodo = line['cbc:InvoicedQuantity'] || line['cbc:CreditedQuantity'] || {};
    const cantidad = parseFloat(extraerTexto(qtyNodo)) || 1;
    const unitCode = typeof qtyNodo === 'object' ? (qtyNodo['@_unitCode'] || '') : '';
    const unidad = normalizarUnidad(unitCode);

    // Precio Unitario base
    const priceAmountNodo = line['cac:Price']?.['cbc:PriceAmount'];
    let precio_unitario = parseFloat(extraerTexto(priceAmountNodo)) || 0;

    const lineExtNodo = line['cbc:LineExtensionAmount'];
    const total_linea = parseFloat(extraerTexto(lineExtNodo)) || 0;

    if (precio_unitario <= 0 && cantidad > 0 && total_linea > 0) {
      precio_unitario = +(total_linea / cantidad).toFixed(2);
    }

    // Porcentaje IVA
    const taxSubtotal = line['cac:TaxTotal']?.['cac:TaxSubtotal'];
    const taxPercent = taxSubtotal ? extraerTexto(taxSubtotal['cac:TaxCategory']?.['cbc:Percent'] || taxSubtotal['cbc:Percent']) : '';
    const porcentaje_iva = parseFloat(taxPercent) || 19;

    if (precio_unitario > 0) {
      lineas.push({
        codigo_proveedor,
        descripcion,
        unidad,
        cantidad,
        precio_unitario,
        porcentaje_iva,
        total_linea,
      });
    }
  }

  return {
    cufe,
    numero,
    fecha_emision: fechaEmision,
    emisor_nit,
    emisor_nombre,
    lineas,
  };
}

/**
 * Extrae y parsea archivos XML desde un Buffer que puede ser .zip o .xml directo
 */
export function procesarBufferFactura(buffer: Buffer, nombreArchivo: string): FacturaParseada[] {
  const ext = nombreArchivo.split('.').pop()?.toLowerCase();
  const resultados: FacturaParseada[] = [];

  if (ext === 'zip') {
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();

    for (const entry of zipEntries) {
      if (!entry.isDirectory && entry.entryName.toLowerCase().endsWith('.xml')) {
        const xmlContent = entry.getData().toString('utf8');
        try {
          const parsed = parsearXmlFactura(xmlContent);
          if (parsed.lineas.length > 0 || parsed.cufe) {
            resultados.push(parsed);
          }
        } catch {
          // Si una entrada XML no es factura válida, ignorar
        }
      }
    }
  } else if (ext === 'xml') {
    const xmlContent = buffer.toString('utf8');
    const parsed = parsearXmlFactura(xmlContent);
    resultados.push(parsed);
  }

  return resultados;
}
