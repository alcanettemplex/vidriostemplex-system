import fs from 'fs';

const rawData = fs.readFileSync('advisors_report_data.json', 'utf8');
const data = JSON.parse(rawData);

console.log('RESUMEN DE DATOS POR ASESOR:');
for (const id of [13, 15, 74]) {
  const item = data[id];
  console.log(`\n============================`);
  console.log(`ASESOR: ${item.user.nombre_completo} (ID: ${item.user.id})`);
  console.log(`Total Leads: ${item.leads.length}`);
  console.log(`Total Prospectos: ${item.prospectos.length}`);
  
  const leadsByEstado: any = {};
  item.leads.forEach((l: any) => {
    leadsByEstado[l.estado_crm] = (leadsByEstado[l.estado_crm] || 0) + 1;
  });
  console.log('Leads por estado:', leadsByEstado);

  console.log('Leads detalles:');
  item.leads.forEach((l: any) => {
    console.log(`- [${l.estado_crm}] ID:${l.id} | ${l.nombre} | Tel:${l.telefono} | Cotizado:$${l.monto_proyectado_cotizacion} | Real:$${l.monto_real_venta} | ODP:${l.odp_id || 'SIN_ODP'} | Prod:${l.producto_interes} | UltAct:${l.ultima_actividad || l.updatedAt}`);
  });

  console.log('Prospectos detalles:');
  item.prospectos.forEach((p: any) => {
    console.log(`- [${p.estado}] ${p.numero_prospecto} | ${p.nombre_contacto} | Tel:${p.telefono_contacto} | Cotiz:${p.numero_cotizacion || 'S/N'} | ODP:${p.odp_id || 'SIN_ODP'} | Desc:${p.descripcion}`);
  });
}
