/**
 * Verificación del manejo de descuentos de línea del parser DIAN (2026-09-19).
 *
 * Contexto: hasta esta fecha el parser no leía `cac:AllowanceCharge` y registraba el
 * precio de lista —o, cuando `BaseQuantity` traía la cantidad repetida, ni siquiera eso—.
 * Sobre dos facturas reales (FA140922 de Templacol y FELC90709 de Grupo Roldán) 13 de
 * 14 líneas quedaban mal registradas.
 *
 * Reglas que esta verificación protege:
 *  · El precio que se registra es el NETO (NIC 2 §11: el descuento comercial se deduce
 *    del costo de adquisición).
 *  · El bruto se resuelve por reconciliación exacta contra el total de la línea, no por
 *    la heurística de cercanía anterior.
 *  · Una línea con 100% de descuento es una bonificación y NO actualiza precios.
 *  · El descuento de documento (pronto pago) no toca el precio de ningún producto.
 *
 * No hay framework de tests en el repo: esto se corre a mano.
 *
 *   ./backend-api/node_modules/.bin/ts-node backend-api/src/scripts/2026-09-19_verificar_descuentos_linea.ts
 *
 * Opcionalmente acepta rutas de XML reales para volcar su lectura:
 *   ... 2026-09-19_verificar_descuentos_linea.ts C:/ruta/factura.xml
 */
import fs from 'fs';
import { parsearXmlFactura } from '../utils/dianXmlParser';

interface Caso {
  nombre: string;
  cantidad: string;
  precioAmount: string;
  baseQuantity: string | null;
  lineExtension: string;
  /** [montoDescuento, base] a nivel de línea */
  descuentoLinea?: [string, string];
  /** [montoCargo, base] a nivel de línea (flete, recargo) */
  cargoLinea?: [string, string];
  /** AllowanceCharge dentro de cac:Price — descriptivo, NO debe restarse */
  descuentoPrecio?: [string, string];
  /** AllowanceCharge a nivel de documento — pronto pago, no toca precios */
  descuentoDocumento?: string;
  esperado: {
    neto: number;
    bruto: number;
    pct: number;
    bonificacion: boolean;
    descuentoGlobal?: number;
  };
}

const CASOS: Caso[] = [
  {
    nombre: 'Línea normal sin descuento ni BaseQuantity',
    cantidad: '5', precioAmount: '1000.00', baseQuantity: null, lineExtension: '5000.00',
    esperado: { neto: 1000, bruto: 1000, pct: 0, bonificacion: false },
  },
  {
    nombre: 'BaseQuantity repite la cantidad, sin descuento (HI-TECH FED-3171)',
    cantidad: '2.20', precioAmount: '52184.88', baseQuantity: '2.20', lineExtension: '114806.74',
    esperado: { neto: 52184.88, bruto: 52184.88, pct: 0, bonificacion: false },
  },
  {
    nombre: '"$100.000 por cada 100 unidades" — BaseQuantity legítimo',
    cantidad: '250', precioAmount: '100000.00', baseQuantity: '100', lineExtension: '250000.00',
    esperado: { neto: 1000, bruto: 1000, pct: 0, bonificacion: false },
  },
  {
    nombre: 'Descuento 10% con BaseQuantity de relleno',
    cantidad: '10', precioAmount: '1000.00', baseQuantity: '10', lineExtension: '9000.00',
    descuentoLinea: ['1000.00', '10000.00'],
    esperado: { neto: 900, bruto: 1000, pct: 10, bonificacion: false },
  },
  {
    nombre: 'REAL FA140922 L1 — vidrio templado 8mm, 39,4% (antes daba 68.558,89)',
    cantidad: '2.40669', precioAmount: '165000.00', baseQuantity: '2.40669', lineExtension: '240644.93',
    descuentoLinea: ['156458.92', '397103.85'],
    esperado: { neto: 99990, bruto: 165000, pct: 39.4, bonificacion: false },
  },
  {
    nombre: 'REAL FELC90709 L1 — adaptador, 34% (antes daba 55.024)',
    cantidad: '3', precioAmount: '165072.00', baseQuantity: '3', lineExtension: '326842.56',
    descuentoLinea: ['168373.44', '495216.00'],
    esperado: { neto: 108947.52, bruto: 165072, pct: 34, bonificacion: false },
  },
  {
    nombre: 'REAL FA140922 L2 — BPB regalado, 100% y total en cero',
    cantidad: '6.566', precioAmount: '3100.00', baseQuantity: '6.566', lineExtension: '0',
    descuentoLinea: ['20354.60', '20354.60'],
    esperado: { neto: 0, bruto: 3100, pct: 100, bonificacion: true },
  },
  {
    nombre: 'REAL FA140922 L4 — BOQUETE regalado, 100% con BaseQuantity 1',
    cantidad: '1', precioAmount: '4500.00', baseQuantity: '1', lineExtension: '0',
    descuentoLinea: ['4500.00', '4500.00'],
    esperado: { neto: 0, bruto: 4500, pct: 100, bonificacion: true },
  },
  {
    nombre: 'Descuento dentro de cac:Price — descriptivo, no se resta dos veces',
    cantidad: '10', precioAmount: '900.00', baseQuantity: null, lineExtension: '9000.00',
    descuentoPrecio: ['100.00', '1000.00'],
    esperado: { neto: 900, bruto: 900, pct: 0, bonificacion: false },
  },
  {
    nombre: 'Cargo de línea (flete) — suma, no resta',
    cantidad: '5', precioAmount: '1000.00', baseQuantity: null, lineExtension: '5500.00',
    cargoLinea: ['500.00', '5000.00'],
    esperado: { neto: 1100, bruto: 1000, pct: 0, bonificacion: false },
  },
  {
    nombre: 'Descuento de documento (pronto pago) — no toca el precio de la línea',
    cantidad: '5', precioAmount: '1000.00', baseQuantity: null, lineExtension: '5000.00',
    descuentoDocumento: '250.00',
    esperado: { neto: 1000, bruto: 1000, pct: 0, bonificacion: false, descuentoGlobal: 250 },
  },
  {
    nombre: 'Sin LineExtensionAmount ni descuento: no hay con qué reconciliar, manda UBL',
    cantidad: '4', precioAmount: '800.00', baseQuantity: '4', lineExtension: '0',
    esperado: { neto: 200, bruto: 200, pct: 0, bonificacion: false },
  },
];

function bloqueAC(par: [string, string] | undefined, indicador: 'true' | 'false'): string {
  if (!par) return '';
  return `<cac:AllowanceCharge>
      <cbc:ChargeIndicator>${indicador}</cbc:ChargeIndicator>
      <cbc:MultiplierFactorNumeric>0.00</cbc:MultiplierFactorNumeric>
      <cbc:Amount currencyID="COP">${par[0]}</cbc:Amount>
      <cbc:BaseAmount currencyID="COP">${par[1]}</cbc:BaseAmount>
    </cac:AllowanceCharge>`;
}

function construirXml(c: Caso): string {
  const base = c.baseQuantity ? `<cbc:BaseQuantity unitCode="94">${c.baseQuantity}</cbc:BaseQuantity>` : '';
  const acDoc = c.descuentoDocumento
    ? `<cac:AllowanceCharge>
    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
    <cbc:Amount currencyID="COP">${c.descuentoDocumento}</cbc:Amount>
  </cac:AllowanceCharge>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice>
  <cbc:ID>PRUEBA-1</cbc:ID>
  <cbc:IssueDate>2026-09-19</cbc:IssueDate>
  <cbc:UUID>cufe-de-prueba</cbc:UUID>
  <cbc:DocumentCurrencyCode>COP</cbc:DocumentCurrencyCode>
  ${acDoc}
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyTaxScheme><cbc:CompanyID>900776621</cbc:CompanyID></cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>PROVEEDOR DE PRUEBA</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="94">${c.cantidad}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="COP">${c.lineExtension}</cbc:LineExtensionAmount>
    ${bloqueAC(c.descuentoLinea, 'false')}
    ${bloqueAC(c.cargoLinea, 'true')}
    <cac:TaxTotal>
      <cac:TaxSubtotal><cac:TaxCategory><cbc:Percent>19.00</cbc:Percent></cac:TaxCategory></cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Description>PRODUCTO DE PRUEBA</cbc:Description>
      <cac:SellersItemIdentification><cbc:ID>COD-1</cbc:ID></cac:SellersItemIdentification>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="COP">${c.precioAmount}</cbc:PriceAmount>
      ${base}
      ${bloqueAC(c.descuentoPrecio, 'false')}
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
}

const cerca = (a: number, b: number, tol = 0.02) => Math.abs(a - b) < tol;
let fallos = 0;

console.log('\nDescuentos de línea — parser DIAN\n');

for (const caso of CASOS) {
  const resultado = parsearXmlFactura(construirXml(caso));
  const l = resultado.lineas[0];
  const e = caso.esperado;

  const checks: [string, boolean, string][] = [];
  if (!l) {
    checks.push(['línea presente', false, 'el parser no devolvió ninguna línea']);
  } else {
    checks.push(['neto', cerca(l.precio_unitario, e.neto), `${l.precio_unitario} vs ${e.neto}`]);
    checks.push(['bruto', cerca(l.precio_bruto, e.bruto), `${l.precio_bruto} vs ${e.bruto}`]);
    checks.push(['pct', cerca(l.descuento_pct, e.pct, 0.05), `${l.descuento_pct} vs ${e.pct}`]);
    checks.push(['bonificación', l.bonificacion === e.bonificacion, `${l.bonificacion} vs ${e.bonificacion}`]);
  }
  if (e.descuentoGlobal !== undefined) {
    checks.push(['desc. global', cerca(resultado.descuento_global, e.descuentoGlobal), `${resultado.descuento_global} vs ${e.descuentoGlobal}`]);
  }

  const ok = checks.every(c => c[1]);
  if (!ok) fallos++;
  console.log(`${ok ? '  OK  ' : ' FALLA'}  ${caso.nombre}`);
  for (const [etiqueta, pasa, detalle] of checks) {
    if (!pasa) console.log(`          ✗ ${etiqueta}: ${detalle}`);
  }
}

console.log(fallos === 0 ? '\nTodos los escenarios pasan.\n' : `\n${fallos} escenario(s) fallando.\n`);

// ─── Volcado de facturas reales, si se pasan rutas por argumento ──────────────
const archivos = process.argv.slice(2).filter(a => a.toLowerCase().endsWith('.xml'));
for (const archivo of archivos) {
  const r = parsearXmlFactura(fs.readFileSync(archivo, 'utf8'));
  console.log('='.repeat(72));
  console.log(`${r.numero} · ${r.emisor_nombre} · ${r.fecha_emision} · desc. global ${r.descuento_global}`);
  console.log('='.repeat(72));
  for (const l of r.lineas) {
    const marca = l.bonificacion ? ' [BONIFICACIÓN — no actualiza precio]' : '';
    console.log(`  ${l.descripcion.slice(0, 44).padEnd(44)} bruto ${String(l.precio_bruto).padStart(12)}` +
                `  −${String(l.descuento_pct).padStart(6)}%  neto ${String(l.precio_unitario).padStart(12)}${marca}`);
  }
  console.log('');
}

process.exit(fallos === 0 ? 0 : 1);
