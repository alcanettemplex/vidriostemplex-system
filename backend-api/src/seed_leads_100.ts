import { Lead, LeadEvento } from './models';
import * as dotenv from 'dotenv';
dotenv.config();

const ASESORES = [13, 14, 15]; // Alejandro, Juan Diego, Nataly
const ASISTENTES = [56, 33, 1]; // Sandra, Alba, Admin
const SEGMENTOS = ['Arquitecto', 'Cliente final', 'Industrial', 'Institucional', 'Intervid'];
const RESPONDIO_OPTS = ['Espera de información', 'No responde', 'Si'];
const PRODUCTOS = [
  'Fachadas en Vidrio', 'Ventanas de Aluminio', 'Pasamanos en Acero',
  'Divisiones de Baño', 'Vidrio Templado 10mm', 'Espejos Decorativos',
  'Techos en Vidrio', 'Puertas Corredizas', 'Mesas de Vidrio'
];
const ESTADOS = ['NUEVO', 'ASIGNADO', 'EN_CONTACTO', 'COTIZANDO', 'VISITA_TECNICA', 'FRIO', 'APROBADO', 'PERDIDO'];
const MOTIVOS_PERDIDA = ['Precio muy alto', 'Ya compró con otro proveedor', 'No responde llamadas', 'No tenemos el producto', 'Canceló el proyecto'];

function getRandomItem(arr: any[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

(async () => {
  try {
    console.log('🚀 Iniciando seeding definitivo de 100 leads comerciales...');
    
    for (let i = 1; i <= 100; i++) {
      const estado = getRandomItem(ESTADOS);
      const isNuevo = estado === 'NUEVO';
      const isAsignado = !isNuevo;
      const isPerdido = estado === 'PERDIDO';
      const isFrio = estado === 'FRIO';
      const isAprobado = estado === 'APROBADO';

      const lead = await Lead.create({
        nombre: `Test Lead #${i} - ${getRandomItem(['Proyecto Residencial', 'Mantenimiento Vidrios', 'Remodelación Baños', 'Obra Nueva', 'Oficinas Empresariales'])}`,
        telefono: `315${getRandomInt(1000000, 9999999)}`,
        mensaje_entrada: `Solicito cotización urgente para instalación de ${getRandomItem(PRODUCTOS)}.`,
        segmento: getRandomItem(SEGMENTOS),
        respondio: getRandomItem(RESPONDIO_OPTS),
        producto_interes: getRandomItem(PRODUCTOS),
        descripcion_contexto: `Prospecto captado vía CRM. Se asignó automáticamente para seguimiento.`,
        estado_crm: estado,
        intentos_seguimiento: (isFrio) ? 3 : getRandomInt(0, 2),
        monto_proyectado_cotizacion: (estado !== 'NUEVO' && estado !== 'ASIGNADO') ? getRandomInt(850000, 22000000) : 0,
        motivo_perdida: isPerdido ? getRandomItem(MOTIVOS_PERDIDA) : null,
        fecha_cierre: (isAprobado || isPerdido) ? new Date() : null,
        asesor_id: isNuevo ? null : getRandomItem(ASESORES),
        asistente_id: getRandomItem(ASISTENTES),
        cliente_id: null
      });

      const leadId = (lead as any).id;
      const creadorId = (lead as any).asistente_id;
      const asesorId = (lead as any).asesor_id;

      // Evento: CREACION
      await LeadEvento.create({
        tipo: 'CREACION',
        detalle_texto: 'Registro inicial de prospecto en bolsa común.',
        lead_id: leadId,
        creado_por: creadorId
      });

      if (asesorId) {
        // Evento: ASIGNACION
        await LeadEvento.create({
          tipo: 'ASIGNACION',
          detalle_texto: `Asignado a asesor comercial para gestión directa.`,
          lead_id: leadId,
          creado_por: 1
        });

        // Evento: COMUNICACION (Simulado para que aparezca en el timeline)
        await LeadEvento.create({
          tipo: 'COMUNICACION',
          detalle_texto: `Se realizó primer contacto con el cliente. ${getRandomItem(['WhatsApp enviado.', 'Llamada telefónica realizada.', 'Correo de presentación enviado.'])}`,
          lead_id: leadId,
          creado_por: asesorId
        });
      }

      if (estado !== 'NUEVO' && estado !== 'ASIGNADO') {
        // Evento: CAMBIO_ESTADO
        await LeadEvento.create({
          tipo: 'CAMBIO_ESTADO',
          detalle_texto: `Transición de etapa detectada: ${estado}.`,
          lead_id: leadId,
          creado_por: asesorId || 1
        });
      }

      if (isFrio) {
         await LeadEvento.create({
          tipo: 'PASE_A_FRIO',
          detalle_texto: `Cliente sin respuesta tras 3 intentos. Movido a enfriamiento.`,
          lead_id: leadId,
          creado_por: asesorId || 1
        });
      }

      if (i % 25 === 0) console.log(`✅ ${i} leads generados correctamente...`);
    }

    console.log('\n✨ ¡Finalizado! 100 leads de prueba con historial de eventos están listos para visualizar.');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ Fallo crítico en seeding:', err.message);
    process.exit(1);
  }
})();
