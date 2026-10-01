/**
 * Simulacro de ingesta con regla de código (2026-09-30) — NO ESCRIBE NADA.
 *
 * Procesa una factura SINTÉTICA de GRUPO ROLDAN con el handler real
 * `cargarFacturasLote`, dentro de una única transacción que se revierte al final.
 * Sirve para verificar de punta a punta el vínculo automático sin tocar producción:
 *
 *   · ALU701NG  "SILLAR … ALU701 NEGRO"  → la regla lo une a SIL0601 (GRE701NG/GRP701NG)
 *   · ALU703NG  precio x3                 → la regla lo reconoce pero NO lo vincula (umbral)
 *   · GRX700NT  "CABEZAL … NATURAL"       → color sin gemelo: va a Por Mapear
 *   · GRP174NG  ya pendiente, sin gemelo  → sigue en Por Mapear
 *
 * Cómo no escribe:
 *   1. `sequelize.transaction()` devuelve siempre la misma transacción T, cuyo commit
 *      es un no-op; al final se revierte T de verdad.
 *   2. Los `afterCommit` se descartan (no se recalcula el Cotizador).
 *   3. `AuditoriaLog.create` se anula en ESTE proceso: el hook de auditoría escribe fuera
 *      de la transacción y dejaría en producción el rastro de cambios que no ocurrieron.
 *
 *   npx ts-node --files src/scripts/pruebas_proveedores/simulacro_ingesta_regla.ts
 */
import sequelize from '../../config/database';
import { AuditoriaLog, ProveedorCodigoPendiente, ProveedorProducto, ProveedorProductoCodigo, Proveedor } from '../../models';
import { cargarFacturasLote } from '../../controllers/proveedor.controller';

const ROLDAN = 1044;

function xmlFactura(nit: string, lineas: Array<{ cod: string; desc: string; precio: number; cant: number }>) {
  const ls = lineas.map((l, i) => `
    <cac:InvoiceLine>
      <cbc:ID>${i + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="94">${l.cant}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="COP">${(l.precio * l.cant).toFixed(2)}</cbc:LineExtensionAmount>
      <cac:TaxTotal><cac:TaxSubtotal><cac:TaxCategory><cbc:Percent>19.00</cbc:Percent></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
      <cac:Item>
        <cbc:Description>${l.desc}</cbc:Description>
        <cac:SellersItemIdentification><cbc:ID>${l.cod}</cbc:ID></cac:SellersItemIdentification>
      </cac:Item>
      <cac:Price><cbc:PriceAmount currencyID="COP">${l.precio.toFixed(2)}</cbc:PriceAmount><cbc:BaseQuantity unitCode="94">1</cbc:BaseQuantity></cac:Price>
    </cac:InvoiceLine>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>SIMULACRO-0001</cbc:ID>
  <cbc:UUID>SIMULACRO-CUFE-${Date.now()}</cbc:UUID>
  <cbc:IssueDate>2026-09-29</cbc:IssueDate>
  <cbc:InvoiceTypeCode>01</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>COP</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyTaxScheme><cbc:CompanyID>${nit}</cbc:CompanyID></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>GRUPO ROLDAN SAS</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  ${ls}
</Invoice>`;
}

async function main() {
  const proveedor = await Proveedor.findByPk(ROLDAN, { attributes: ['nit'] });
  const nit = String(proveedor!.getDataValue('nit'));
  const sil = await ProveedorProducto.findOne({
    where: { proveedor_id: ROLDAN, codigo_proveedor: 'GRE701NG', activo: true }, attributes: ['id', 'precio_actual', 'fecha_precio_actual'],
  });
  const ppSil = Number(sil!.getDataValue('id'));
  const hor = await ProveedorProducto.findOne({
    where: { proveedor_id: ROLDAN, codigo_proveedor: 'GRE703NG' }, attributes: ['precio_actual'],
  });
  const precioSil = Number(sil!.getDataValue('precio_actual'));
  const precioHor = Number(hor!.getDataValue('precio_actual'));
  console.log(`SIL0601 vigente: $${precioSil} (${sil!.getDataValue('fecha_precio_actual')}) · HOR0602 vigente: $${precioHor}`);

  // ── Aislamiento ──
  const T = await sequelize.transaction();
  const revertir = T.rollback.bind(T);
  (T as any).commit = async () => undefined;
  (T as any).rollback = async () => undefined;
  (T as any).afterCommit = () => undefined;
  (sequelize as any).transaction = async () => T;
  (AuditoriaLog as any).create = async () => null;

  try {
    const xml = xmlFactura(nit, [
      { cod: 'ALU701NG', desc: 'SILLAR  S/7038 EMPOTRAR ALU701 NEGRO  (2)', precio: Math.round(precioSil * 1.03), cant: 2 },
      { cod: 'ALU703NG', desc: 'HORIZONTAL INF. Y SUP. 7038 ALU703 NEGRO (4)', precio: Math.round(precioHor * 3), cant: 1 },
      { cod: 'GRX700NT', desc: 'CABEZAL 7038 GR700 NATURAL (4)', precio: 120000, cant: 1 },
      { cod: 'GRP174NG', desc: 'JAMBA P/3831  GR174 NEGRO (12UN)', precio: 50000, cant: 1 },
    ]);
    const req: any = { files: [{ buffer: Buffer.from(xml, 'utf8'), originalname: 'simulacro.xml' }], user: { id: 30, rol: 'root' } };
    const res: any = { statusCode: 200, cuerpo: null, status(c: number) { this.statusCode = c; return this; }, json(b: any) { this.cuerpo = b; return this; } };
    await cargarFacturasLote(req, res);
    const b = res.cuerpo;
    console.log(`\nHTTP ${res.statusCode} · facturas ${b.facturas_procesadas} · vinculados_por_regla ${b.vinculados_por_regla} · nuevos pendientes ${b.codigos_nuevos_pendientes} · errores ${b.errores.length}`);
    if (b.errores.length) console.log(b.errores);
    console.log('Precios actualizados:', b.precios_actualizados.map((p: any) => `${p.codigo_proveedor} ${p.precio_anterior}→${p.precio_nuevo} (${p.variacion_pct.toFixed(1)} %)`));
    console.log('Avisos:'); for (const a of b.avisos) console.log(`  [${a.tipo}] ${a.detalle}`);

    const codigos = await ProveedorProductoCodigo.findAll({
      where: { proveedor_id: ROLDAN, codigo_proveedor: ['ALU701NG', 'ALU703NG', 'GRX700NT', 'GRP174NG'] },
      attributes: ['codigo_proveedor', 'origen', 'proveedor_producto_id'], transaction: T,
    });
    console.log('\nCódigos registrados:', codigos.map((c: any) => `${c.getDataValue('codigo_proveedor')}(${c.getDataValue('origen')}, pp ${c.getDataValue('proveedor_producto_id')})`));
    const bandeja = await ProveedorCodigoPendiente.findAll({
      where: { proveedor_id: ROLDAN, codigo_proveedor: ['ALU701NG', 'ALU703NG', 'GRX700NT', 'GRP174NG'] },
      attributes: ['codigo_proveedor', 'estado', 'veces_visto'], transaction: T,
    });
    console.log('Bandeja:', bandeja.map((x: any) => `${x.getDataValue('codigo_proveedor')}=${x.getDataValue('estado')}(${x.getDataValue('veces_visto')})`));
    const silDespues = await ProveedorProducto.findByPk(ppSil, { attributes: ['precio_actual', 'precio_anterior_1'], transaction: T });
    console.log(`SIL0601 dentro del simulacro: $${silDespues!.getDataValue('precio_actual')} (anterior $${silDespues!.getDataValue('precio_anterior_1')})`);
  } finally {
    await revertir();
    console.log('\nTransacción revertida: nada quedó escrito.');
  }

  const fuera = await ProveedorProductoCodigo.count({ where: { proveedor_id: ROLDAN, codigo_proveedor: ['ALU701NG', 'ALU703NG', 'GRX700NT'] } });
  console.log(`Verificación fuera del simulacro: ${fuera} códigos de prueba en la BD (debe ser 0).`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => setTimeout(() => sequelize.close(), 1500));
