/**
 * Verificación del arbitraje de precio unitario del parser DIAN (2026-09-04).
 *
 * Contexto: `cbc:BaseQuantity` se dividía siempre que fuera > 1, y los emisores que
 * repiten ahí la cantidad facturada terminaban con el precio dividido entre la
 * cantidad. Caso real: HI-TECH FILMS, FED-3171, SI2072-10 → $52.184,88 se registró
 * como $23.720,40.
 *
 * No hay framework de tests en el repo: esto se corre a mano y compara contra los
 * cuatro escenarios que la regla debe distinguir.
 *
 *   npx ts-node backend-api/src/scripts/2026_09_04_verificar_parser_precio.ts
 */
import { parsearXmlFactura } from '../utils/dianXmlParser';

interface Caso {
  nombre: string;
  cantidad: string;
  precioAmount: string;
  baseQuantity: string | null;
  lineExtension: string;
  esperado: number;
}

const CASOS: Caso[] = [
  {
    nombre: 'HI-TECH FED-3171: BaseQuantity repite la cantidad (el bug)',
    cantidad: '2.20',
    precioAmount: '52184.88',
    baseQuantity: '2.20',
    lineExtension: '114806.74',
    esperado: 52184.88,
  },
  {
    nombre: 'Lote real: "$100.000 por cada 100 unidades"',
    cantidad: '250',
    precioAmount: '100000.00',
    baseQuantity: '100',
    lineExtension: '250000.00',
    esperado: 1000,
  },
  {
    nombre: 'Línea normal sin BaseQuantity',
    cantidad: '5',
    precioAmount: '1000.00',
    baseQuantity: null,
    lineExtension: '5000.00',
    esperado: 1000,
  },
  {
    nombre: 'Relleno de BaseQuantity + 10% de descuento (total neto, precio bruto)',
    cantidad: '10',
    precioAmount: '1000.00',
    baseQuantity: '10',
    lineExtension: '9000.00',
    esperado: 1000,
  },
  {
    nombre: 'Sin LineExtensionAmount: no hay con qué arbitrar, manda UBL',
    cantidad: '4',
    precioAmount: '800.00',
    baseQuantity: '4',
    lineExtension: '0',
    esperado: 200,
  },
];

function construirXml(c: Caso): string {
  const base = c.baseQuantity ? `<cbc:BaseQuantity unitCode="94">${c.baseQuantity}</cbc:BaseQuantity>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice>
  <cbc:ID>FED-3171</cbc:ID>
  <cbc:IssueDate>2026-08-21</cbc:IssueDate>
  <cbc:UUID>cufe-de-prueba</cbc:UUID>
  <cbc:DocumentCurrencyCode>COP</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyTaxScheme><cbc:CompanyID>901627931</cbc:CompanyID></cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>HI-TECH FILMS S.A.S.</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="94">${c.cantidad}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="COP">${c.lineExtension}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cac:TaxSubtotal><cac:TaxCategory><cbc:Percent>19.00</cbc:Percent></cac:TaxCategory></cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Description>SILVER 20% 72 SPECTRA</cbc:Description>
      <cac:SellersItemIdentification><cbc:ID>SI2072-10</cbc:ID></cac:SellersItemIdentification>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="COP">${c.precioAmount}</cbc:PriceAmount>
      ${base}
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
}

let fallos = 0;

console.log('\nArbitraje de precio unitario — parser DIAN\n');

for (const caso of CASOS) {
  const resultado = parsearXmlFactura(construirXml(caso));
  const linea = resultado.lineas[0];
  const obtenido = linea ? linea.precio_unitario : 0;
  const ok = Math.abs(obtenido - caso.esperado) < 0.005;
  if (!ok) fallos++;
  console.log(`${ok ? '  OK  ' : ' FALLA'}  ${caso.nombre}`);
  console.log(`         esperado ${caso.esperado}  ·  obtenido ${obtenido}\n`);
}

console.log(fallos === 0 ? 'Todos los escenarios pasan.\n' : `${fallos} escenario(s) fallando.\n`);
process.exit(fallos === 0 ? 0 : 1);
