import sequelize from './src/config/database';
import { Usuario, Lead, Prospecto, Cotizacion } from './src/models';
import { Op } from 'sequelize';

async function main() {
  try {
    await sequelize.authenticate();
    console.log('---DB CONECTADA---');

    // 1. Buscar asesores
    const asesores: any[] = await Usuario.findAll({
      attributes: ['id', 'username', 'nombre_completo', 'rol', 'email'],
      raw: true
    });

    console.log('TODOS LOS USUARIOS:', JSON.stringify(asesores, null, 2));

    const advisorIds = asesores.map((a: any) => a.id);

    // 2. Buscar todos los leads de estos asesores
    const leads: any[] = await Lead.findAll({
      order: [['updatedAt', 'DESC']],
      raw: true
    });

    console.log(`TOTAL LEADS EN LA BASE DE DATOS: ${leads.length}`);

    // Agrupación de leads por asesor y estado
    const reportLeads: any = {};
    for (const a of asesores) {
      reportLeads[a.id] = {
        asesor: a,
        aprobados_sin_odp: [],
        seguimiento: [],
        cotizando: [],
        en_contacto: [],
        prospectos_crm: [],
        otros: []
      };
    }

    for (const l of leads) {
      const aId = l.asesor_id;
      if (!reportLeads[aId]) {
        if (!reportLeads['sin_asesor']) {
          reportLeads['sin_asesor'] = {
            asesor: { id: null, nombre_completo: 'SIN ASIGNAR', username: 'none' },
            aprobados_sin_odp: [],
            seguimiento: [],
            cotizando: [],
            en_contacto: [],
            prospectos_crm: [],
            otros: []
          };
        }
        if (l.estado_crm === 'APROBADO' && !l.odp_id) {
          reportLeads['sin_asesor'].aprobados_sin_odp.push(l);
        } else if (l.estado_crm === 'SEGUIMIENTO') {
          reportLeads['sin_asesor'].seguimiento.push(l);
        } else if (l.estado_crm === 'COTIZANDO') {
          reportLeads['sin_asesor'].cotizando.push(l);
        } else if (l.estado_crm === 'EN_CONTACTO') {
          reportLeads['sin_asesor'].en_contacto.push(l);
        } else if (l.estado_crm === 'NUEVO' || l.estado_crm === 'ASIGNADO') {
          reportLeads['sin_asesor'].prospectos_crm.push(l);
        } else {
          reportLeads['sin_asesor'].otros.push(l);
        }
        continue;
      }

      if (l.estado_crm === 'APROBADO' && !l.odp_id) {
        reportLeads[aId].aprobados_sin_odp.push(l);
      } else if (l.estado_crm === 'SEGUIMIENTO') {
        reportLeads[aId].seguimiento.push(l);
      } else if (l.estado_crm === 'COTIZANDO') {
        reportLeads[aId].cotizando.push(l);
      } else if (l.estado_crm === 'EN_CONTACTO') {
        reportLeads[aId].en_contacto.push(l);
      } else if (l.estado_crm === 'NUEVO' || l.estado_crm === 'ASIGNADO') {
        reportLeads[aId].prospectos_crm.push(l);
      } else {
        reportLeads[aId].otros.push(l);
      }
    }

    // 3. Buscar prospectos de la tabla prospectos
    const prospectos: any[] = await Prospecto.findAll({
      raw: true
    });
    console.log(`TOTAL PROSPECTOS EN TABLA PROSPECTOS: ${prospectos.length}`);

    console.log('---DATOS COMPLETOS RESUMEN---');
    for (const key of Object.keys(reportLeads)) {
      const data = reportLeads[key];
      const a = data.asesor;
      console.log(`\n==============================================`);
      console.log(`ASESOR: ${a.nombre_completo} (@${a.username}) ID: ${a.id}`);
      console.log(`1. APROBADOS SIN ODP (${data.aprobados_sin_odp.length}):`);
      data.aprobados_sin_odp.forEach((x: any) => {
        console.log(`  - [ID:${x.id}] Nombre: "${x.nombre}" | Tel: "${x.telefono}" | Monto Cot: S/ ${x.monto_proyectado_cotizacion} | Monto Real: S/ ${x.monto_real_venta} | Prod: "${x.producto_interes}" | Contexto: "${x.descripcion_contexto || ''}" | Ult Act: ${x.ultima_actividad || x.updatedAt}`);
      });

      console.log(`2. EN SEGUIMIENTO (${data.seguimiento.length}):`);
      data.seguimiento.forEach((x: any) => {
        console.log(`  - [ID:${x.id}] Nombre: "${x.nombre}" | Tel: "${x.telefono}" | Monto Cot: S/ ${x.monto_proyectado_cotizacion} | Prod: "${x.producto_interes}" | Intentos: ${x.intentos_seguimiento} | Contexto: "${x.descripcion_contexto || ''}" | Ult Act: ${x.ultima_actividad || x.updatedAt}`);
      });

      console.log(`3. COTIZANDO (${data.cotizando.length}):`);
      data.cotizando.forEach((x: any) => {
        console.log(`  - [ID:${x.id}] Nombre: "${x.nombre}" | Tel: "${x.telefono}" | Monto Cot: S/ ${x.monto_proyectado_cotizacion} | Prod: "${x.producto_interes}" | Contexto: "${x.descripcion_contexto || ''}" | Ult Act: ${x.ultima_actividad || x.updatedAt}`);
      });

      console.log(`4. EN CONTACTO / NUEVOS / ASIGNADOS (${data.en_contacto.length + data.prospectos_crm.length}):`);
      [...data.en_contacto, ...data.prospectos_crm].forEach((x: any) => {
        console.log(`  - [ID:${x.id}][${x.estado_crm}] Nombre: "${x.nombre}" | Tel: "${x.telefono}" | Prod: "${x.producto_interes}" | Contexto: "${x.descripcion_contexto || ''}" | Ult Act: ${x.ultima_actividad || x.updatedAt}`);
      });

      const prosAsesor = prospectos.filter(p => p.asesor_id === a.id);
      console.log(`5. PROSPECTOS TABLA PROSPECTOS (${prosAsesor.length}):`);
      prosAsesor.forEach((p: any) => {
        console.log(`  - [Nro:${p.numero_prospecto}] Contacto: "${p.nombre_contacto}" | Tel: "${p.telefono_contacto}" | Estado: ${p.estado} | Cotiz: ${p.numero_cotizacion || 'S/N'} | ODP: ${p.odp_id || 'SIN_ODP'} | Desc: "${p.descripcion || ''}"`);
      });
    }

  } catch (error) {
    console.error('Error al consultar:', error);
  } finally {
    process.exit(0);
  }
}

main();
