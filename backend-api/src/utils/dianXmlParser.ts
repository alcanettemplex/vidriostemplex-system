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
  /** Precio NETO unitario: lo que realmente se pagó, ya descontado. Es el que se registra. */
  precio_unitario: number;
  /** Precio de lista unitario, antes del descuento. Informativo y para auditar el histórico. */
  precio_bruto: number;
  /** Suma de los cac:AllowanceCharge de la línea con ChargeIndicator=false */
  descuento_valor: number;
  /** Suma de los cac:AllowanceCharge de la línea con ChargeIndicator=true (fletes, recargos) */
  cargo_valor: number;
  /** descuento_valor sobre el bruto de la línea, en porcentaje */
  descuento_pct: number;
  /** Línea regalada: 100% de descuento y total en cero. NO debe actualizar ningún precio. */
  bonificacion: boolean;
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
  /**
   * Descuento a nivel de DOCUMENTO (Invoice/cac:AllowanceCharge). En la FE colombiana
   * es el descuento condicionado (pronto pago): no reduce la base del IVA y
   * contablemente es un ingreso financiero, no un menor costo del producto. Se expone
   * para avisar, nunca para repartirlo entre las líneas.
   */
  descuento_global: number;
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

/** Número desde un nodo, 0 si no es parseable */
function extraerNumero(nodo: any): number {
  const valor = parseFloat(extraerTexto(nodo));
  return Number.isFinite(valor) ? valor : 0;
}

/**
 * Suma los cac:AllowanceCharge de un nodo, separando descuentos de cargos.
 *
 * `cbc:MultiplierFactorNumeric` se ignora a propósito: es el porcentaje declarado por
 * el emisor, y lo que tiene que cuadrar contra el total de la línea son los MONTOS.
 * El porcentaje se calcula después a partir de ellos.
 */
function sumarAllowanceCharge(nodo: any): { descuento: number; cargo: number } {
  const items = Array.isArray(nodo) ? nodo : nodo ? [nodo] : [];
  let descuento = 0;
  let cargo = 0;
  for (const ac of items) {
    if (!ac || typeof ac !== 'object') continue;
    const monto = extraerNumero(ac['cbc:Amount']);
    if (monto <= 0) continue;
    // ChargeIndicator: true = cargo (suma), false = descuento (resta)
    if (extraerTexto(ac['cbc:ChargeIndicator']).toLowerCase() === 'true') cargo += monto;
    else descuento += monto;
  }
  return { descuento, cargo };
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

    // Descuentos y cargos de la LÍNEA. Son los únicos que tocan el precio del producto:
    // en la FE colombiana el descuento de línea es el comercial (reduce la base del IVA)
    // y la NIC 2 §11 manda deducirlo del costo de adquisición. El de documento es el
    // condicionado (pronto pago) y se trata aparte, fuera de este bucle.
    //
    // `cac:Price/cac:AllowanceCharge` NO se suma: en la DIAN es descriptivo de cómo se
    // formó PriceAmount, y restarlo otra vez sería descontar dos veces.
    const { descuento: descuento_valor, cargo: cargo_valor } = sumarAllowanceCharge(line['cac:AllowanceCharge']);

    // UBL 2.1 define PriceAmount como el precio de BaseQuantity unidades — el caso
    // legítimo "$X por cada 100". Pero buena parte de los emisores colombianos repite
    // ahí la cantidad facturada como relleno y deja PriceAmount ya unitario: dividir
    // a ciegas convertía $52.184,88 en $23.720,40 (HI-TECH FILMS, FED-3171, 2026-08-21).
    //
    // Antes se elegía "la lectura que menos se aleja" de total/cantidad. Con descuento
    // esa heurística falla, porque el total viene neto y el precio bruto: en FA140922
    // (Templacol, 39,4% de descuento) registró $68.558,89 para un vidrio cuya lista es
    // $165.000 y cuyo neto es $99.990 — ni lo uno ni lo otro, solo 165.000 ÷ 2,40669.
    //
    // Con el descuento ya leído la ambigüedad se resuelve por RECONCILIACIÓN EXACTA, no
    // por cercanía: la lectura correcta es la que reproduce el total de la línea.
    //   PriceAmount × cantidad − descuento + cargo == LineExtensionAmount
    // Verificado al centavo en las 14 líneas de FA140922 (Templacol) y FELC90709 (Roldán).
    //
    // Se reconcilia contra el BRUTO de la línea (total + descuento − cargo) y no contra
    // el total neto, porque así también cuadran las líneas regaladas, donde el total es
    // cero y el único ancla disponible es el descuento (BPB: 3.100 × 6,566 = 20.354,60).
    const brutoLineaEsperado = total_linea + descuento_valor - cargo_valor;
    const reconcilia = (unitario: number) => {
      if (!(brutoLineaEsperado > 0) || !(cantidad > 0)) return false;
      // Tolerancia relativa: los emisores redondean a 2 decimales sobre cantidades
      // con 6 (2,40669 m²), así que exigir igualdad exacta rechazaría líneas válidas.
      return Math.abs(unitario * cantidad - brutoLineaEsperado) <= Math.max(1, brutoLineaEsperado * 0.005);
    };

    const lecturaDividida = baseQty > 0 ? precioXml / baseQty : precioXml;
    let precio_bruto: number;
    if (precioXml > 0 && baseQty !== 1 && reconcilia(precioXml)) {
      precio_bruto = precioXml;                 // BaseQuantity era relleno
    } else if (precioXml > 0 && baseQty !== 1 && reconcilia(lecturaDividida)) {
      precio_bruto = lecturaDividida;           // "$X por cada N" legítimo
    } else if (precioXml > 0) {
      precio_bruto = lecturaDividida;           // sin con qué reconciliar: manda UBL
    } else {
      precio_bruto = 0;
    }
    precio_bruto = +precio_bruto.toFixed(2);

    // El NETO es el total de la línea repartido entre la cantidad: por definición ya
    // viene descontado (UBL define LineExtensionAmount neto de los AllowanceCharge de
    // línea). Sin total de línea se deriva restando el descuento del bruto.
    let precio_unitario: number;
    if (cantidad > 0 && total_linea > 0) {
      precio_unitario = total_linea / cantidad;
    } else if (cantidad > 0 && precio_bruto > 0) {
      precio_unitario = precio_bruto - (descuento_valor - cargo_valor) / cantidad;
    } else {
      precio_unitario = precio_bruto;
    }
    precio_unitario = +Math.max(0, precio_unitario).toFixed(2);

    if (precio_bruto <= 0 && precio_unitario > 0) precio_bruto = precio_unitario;

    // Invariante: el bruto no puede quedar por debajo del neto, salvo que la línea traiga
    // cargos (un flete sí sube el neto por encima del precio del producto). Si pasa, es
    // que PriceAmount no resultó interpretable y la lectura dividida quedó por debajo:
    // se conserva el neto, que es el dato duro, y no se afirma un descuento insostenible.
    if (precio_bruto < precio_unitario && cargo_valor <= 0) precio_bruto = precio_unitario;

    const brutoLinea = precio_bruto * cantidad;
    const descuento_pct = brutoLinea > 0 ? +((descuento_valor / brutoLinea) * 100).toFixed(2) : 0;

    // Bonificación: el proveedor facturó el ítem y lo regaló (100% de descuento, total
    // en cero). Su "precio" es 0 y registrarlo borraría el costo real del producto —
    // y ese cero se propagaría al Cotizador. Se marca para que el controlador la
    // excluya del flujo de precios en vez de descartarla en silencio.
    // Caso real: BPB y BOQUETE NORMAL en FA140922.
    const bonificacion = descuento_valor > 0 && precio_unitario <= 0;

    // Porcentaje IVA
    const taxSubtotal = line['cac:TaxTotal']?.['cac:TaxSubtotal'];
    const subtotalNodo = Array.isArray(taxSubtotal) ? taxSubtotal[0] : taxSubtotal;
    const taxPercent = subtotalNodo
      ? extraerTexto(subtotalNodo['cac:TaxCategory']?.['cbc:Percent'] || subtotalNodo['cbc:Percent'])
      : '';
    const porcentajeParseado = parseFloat(taxPercent);
    const porcentaje_iva = Number.isFinite(porcentajeParseado) ? porcentajeParseado : 19;

    // Las bonificaciones se emiten aunque su precio sea 0: el controlador las cuenta y
    // avisa. Lo que se descarta es la línea sin ninguna cifra utilizable.
    if (precio_unitario > 0 || bonificacion) {
      lineas.push({
        codigo_proveedor,
        codigo_derivado,
        descripcion,
        unidad,
        unidad_confiable: confiable,
        unidad_codigo_original: unitCode,
        cantidad,
        precio_unitario,
        precio_bruto,
        descuento_valor,
        cargo_valor,
        descuento_pct,
        bonificacion,
        porcentaje_iva,
        total_linea,
      });
    }
  }

  const { descuento: descuento_global } = sumarAllowanceCharge(invoice['cac:AllowanceCharge']);

  return {
    cufe,
    numero,
    fecha_emision: fechaEmision,
    tipo_documento,
    moneda,
    emisor_nit,
    emisor_nombre,
    descuento_global,
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
