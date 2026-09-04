import AdmZip from 'adm-zip';
import { createHash } from 'crypto';
import { XMLParser } from 'fast-xml-parser';

export type TipoDocumentoDIAN = 'FACTURA' | 'NOTA_CREDITO' | 'NOTA_DEBITO';

export interface FacturaLinea {
  codigo_proveedor: string;
  /** true si el código NO venía en el XML y se derivó de la descripción (ver derivarCodigo) */
  codigo_derivado: boolean;
  descripcion: string;
  unidad: string;
  /** false cuando el unitCode del XML es genérico ("94", "EA", "NIU"): la unidad no es
   *  un dato del proveedor sino el relleno por defecto, y no debe usarse para decidir
   *  contra qué modalidad de compra se compara el precio. */
  unidad_confiable: boolean;
  unidad_codigo_original: string;
  cantidad: number;
  precio_unitario: number;
  porcentaje_iva: number;
  total_linea: number;
}

export interface FacturaParseada {
  cufe: string | null;
  numero: string;
  fecha_emision: string;
  tipo_documento: TipoDocumentoDIAN;
  moneda: string;
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
 * Mapea unitCode DIAN / UN-ECE a modalidad del sistema.
 *
 * Devuelve además si el código es informativo o genérico: los emisores colombianos
 * usan "94", "EA", "NIU" o "C62" como relleno para "unidad", sin que eso afirme nada
 * sobre cómo se vende el producto. Tratar ese relleno como un dato real haría que el
 * precio de una tira de 6 m se comparara contra el de un metro suelto.
 */
function normalizarUnidad(unitCode: string): { unidad: string; confiable: boolean } {
  const code = (unitCode || '').toUpperCase().trim();
  if (code === 'MTR' || code === 'MT' || code === 'METRO' || code === 'METROS') return { unidad: 'METRO', confiable: true };
  if (code === 'KGM' || code === 'KG' || code === 'KILO' || code === 'KILOGRAMO') return { unidad: 'KG', confiable: true };
  if (code === 'MTK' || code === 'M2') return { unidad: 'M2', confiable: true };
  if (code === 'TIRA' || code === 'TIRA_6M') return { unidad: 'TIRA_6M', confiable: true };
  return { unidad: 'UNIDAD', confiable: false };
}

/**
 * Código estable para líneas cuyo XML no trae identificación de ítem.
 *
 * Antes se caía a `cbc:ID`, que es el número de línea (1, 2, 3…): dos facturas
 * distintas del mismo proveedor colisionaban en la UNIQUE (proveedor, código) y
 * terminaban pisándose descripción y precio como si fueran el mismo producto.
 * Derivar de la descripción agrupa lo que de verdad es el mismo ítem y separa
 * lo que no.
 */
export function derivarCodigo(descripcion: string): string {
  const base = descripcion.toUpperCase().replace(/\s+/g, ' ').trim();
  const hash = createHash('sha1').update(base).digest('hex').slice(0, 10).toUpperCase();
  return `SD-${hash}`;
}

/** Detecta el tipo de documento a partir del nodo raíz y del código de tipo de operación */
function detectarTipo(parsed: any): TipoDocumentoDIAN {
  if (parsed['CreditNote']) return 'NOTA_CREDITO';
  if (parsed['DebitNote']) return 'NOTA_DEBITO';
  return 'FACTURA';
}

/**
 * Parsea un XML (Invoice, CreditNote, DebitNote o AttachedDocument de DIAN)
 * y extrae sus datos estructurados.
 */
export function parsearXmlFactura(xmlString: string): FacturaParseada {
  let parsed = xmlParser.parse(xmlString);

  // 1. Si es AttachedDocument, buscar el documento embebido en CDATA o en el nodo de Attachment
  if (parsed['AttachedDocument'] || parsed['cac:Attachment']) {
    const attached = parsed['AttachedDocument'] || parsed;
    let docXmlStr = '';

    // Buscar en cac:Attachment -> cac:ExternalReference -> cbc:Description
    const descNodo = attached?.['cac:Attachment']?.['cac:ExternalReference']?.['cbc:Description'];
    const descText = extraerTexto(descNodo);

    if (descText && (descText.includes('<Invoice') || descText.includes('<CreditNote') || descText.includes('<DebitNote'))) {
      docXmlStr = descText;
    } else {
      // Buscar en todo el XML si hay bloque del documento o CDATA
      const match =
        xmlString.match(/<Invoice[\s\S]*?<\/Invoice>/i) ||
        xmlString.match(/<CreditNote[\s\S]*?<\/CreditNote>/i) ||
        xmlString.match(/<DebitNote[\s\S]*?<\/DebitNote>/i);
      if (match) {
        docXmlStr = match[0];
      }
    }

    if (docXmlStr) {
      parsed = xmlParser.parse(docXmlStr);
    }
  }

  const tipo_documento = detectarTipo(parsed);

  // 2. Localizar nodo raíz del documento
  const invoice = parsed['Invoice'] || parsed['CreditNote'] || parsed['DebitNote'] || parsed;

  const numero = extraerTexto(invoice['cbc:ID']) || 'S/N';
  const fechaEmision = extraerTexto(invoice['cbc:IssueDate']) || new Date().toISOString().split('T')[0];
  const cufe = extraerTexto(invoice['cbc:UUID']) || null;
  const moneda = extraerTexto(invoice['cbc:DocumentCurrencyCode']) || 'COP';

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

  // 4. Líneas del documento
  const rawLines =
    invoice['cac:InvoiceLine'] ||
    invoice['cac:CreditNoteLine'] ||
    invoice['cac:DebitNoteLine'] ||
    [];
  const linesArray = Array.isArray(rawLines) ? rawLines : [rawLines].filter(Boolean);

  const lineas: FacturaLinea[] = [];

  for (const line of linesArray) {
    const itemNodo = line['cac:Item'] || {};
    const sellersId = itemNodo['cac:SellersItemIdentification']?.['cbc:ID'];
    const standardId = itemNodo['cac:StandardItemIdentification']?.['cbc:ID'];

    const descNodo = itemNodo['cbc:Description'];
    const descripcion = extraerTexto(descNodo) || 'Sin descripción';

    const codigoXml = extraerTexto(sellersId || standardId);
    const codigo_derivado = !codigoXml;
    const codigo_proveedor = codigoXml || derivarCodigo(descripcion);

    const qtyNodo = line['cbc:InvoicedQuantity'] || line['cbc:CreditedQuantity'] || line['cbc:DebitedQuantity'] || {};
    const cantidad = parseFloat(extraerTexto(qtyNodo)) || 1;
    const unitCode = typeof qtyNodo === 'object' ? (qtyNodo['@_unitCode'] || '') : '';
    const { unidad, confiable } = normalizarUnidad(unitCode);

    // Precio Unitario base
    const priceNodo = line['cac:Price'] || {};
    const priceAmountNodo = priceNodo['cbc:PriceAmount'];
    const precioXml = parseFloat(extraerTexto(priceAmountNodo)) || 0;
    const baseQty = parseFloat(extraerTexto(priceNodo['cbc:BaseQuantity'])) || 1;

    const lineExtNodo = line['cbc:LineExtensionAmount'];
    const total_linea = parseFloat(extraerTexto(lineExtNodo)) || 0;

    // UBL 2.1 define PriceAmount como el precio de BaseQuantity unidades — el caso
    // legítimo "$X por cada 100". Pero buena parte de los emisores colombianos repite
    // ahí la cantidad facturada como relleno y deja PriceAmount ya unitario: dividir
    // a ciegas convertía $52.184,88 en $23.720,40 (HI-TECH FILMS, FED-3171, 2026-08-21).
    //
    // El árbitro es el total de la línea, que es lo que el proveedor realmente cobra:
    // entre las dos lecturas posibles gana la que menos se aleja de
    // LineExtensionAmount / cantidad. No se exige coincidencia exacta a propósito: en
    // una línea con descuento el total viene neto y el precio bruto, así que ninguna
    // cuadra, pero la correcta sigue siendo la que queda cerca. Sin total de línea no
    // hay con qué arbitrar y se conserva la lectura UBL.
    const referencia = cantidad > 0 && total_linea > 0 ? total_linea / cantidad : 0;

    let precio_unitario = baseQty > 0 ? precioXml / baseQty : precioXml;
    if (precioXml > 0 && baseQty !== 1 && referencia > 0) {
      if (Math.abs(precioXml - referencia) < Math.abs(precio_unitario - referencia)) {
        precio_unitario = precioXml;
      }
    }
    precio_unitario = +precio_unitario.toFixed(2);

    if (precio_unitario <= 0 && referencia > 0) {
      precio_unitario = +referencia.toFixed(2);
    }

    // Porcentaje IVA
    const taxSubtotal = line['cac:TaxTotal']?.['cac:TaxSubtotal'];
    const subtotalNodo = Array.isArray(taxSubtotal) ? taxSubtotal[0] : taxSubtotal;
    const taxPercent = subtotalNodo
      ? extraerTexto(subtotalNodo['cac:TaxCategory']?.['cbc:Percent'] || subtotalNodo['cbc:Percent'])
      : '';
    const porcentajeParseado = parseFloat(taxPercent);
    const porcentaje_iva = Number.isFinite(porcentajeParseado) ? porcentajeParseado : 19;

    if (precio_unitario > 0) {
      lineas.push({
        codigo_proveedor,
        codigo_derivado,
        descripcion,
        unidad,
        unidad_confiable: confiable,
        unidad_codigo_original: unitCode,
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
    tipo_documento,
    moneda,
    emisor_nit,
    emisor_nombre,
    lineas,
  };
}

/** Tope de expansión al descomprimir: evita que un .zip manipulado agote la memoria */
const MAX_BYTES_XML = 12 * 1024 * 1024; // 12 MB por XML
const MAX_XML_POR_ZIP = 40;

/**
 * Extrae y parsea archivos XML desde un Buffer que puede ser .zip o .xml directo.
 * Un mismo .zip puede traer el AttachedDocument y el documento suelto: el control
 * de duplicados por CUFE aguas arriba se encarga de que no cuenten dos veces.
 */
export function procesarBufferFactura(buffer: Buffer, nombreArchivo: string): FacturaParseada[] {
  const ext = nombreArchivo.split('.').pop()?.toLowerCase();
  const resultados: FacturaParseada[] = [];

  if (ext === 'zip') {
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();
    let leidos = 0;

    for (const entry of zipEntries) {
      if (entry.isDirectory || !entry.entryName.toLowerCase().endsWith('.xml')) continue;
      if (leidos >= MAX_XML_POR_ZIP) break;
      if (entry.header.size > MAX_BYTES_XML) continue;

      leidos++;
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
  } else if (ext === 'xml') {
    const xmlContent = buffer.toString('utf8');
    const parsed = parsearXmlFactura(xmlContent);
    resultados.push(parsed);
  }

  return resultados;
}
