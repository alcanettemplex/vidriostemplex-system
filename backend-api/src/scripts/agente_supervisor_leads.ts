import sequelize from '../config/database';
import { Usuario, Lead } from '../models';
import { WhatsappService } from '../services/whatsapp.service';
import { generarReportePeriodico, generarMensajeUrgente } from '../services/ia.service';
import { leerMemoria, guardarMemoria, LeadMemoria } from './memoria_agente';
import { Op } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config();

// ──────────────────────────────────────────────
//  CONFIGURACIÓN
// ──────────────────────────────────────────────
const CICLOS_PARA_URGENTE = 2;       // Después de 2 avisos seguidos sin reacción → alerta nivel 2
const HORA_INICIO = 8;               // 8 AM
const HORA_FIN = 18;                 // 6 PM
const ESTADOS_ACTIVOS = ['NUEVO', 'ASIGNADO', 'COTIZANDO', 'SEGUIMIENTO', 'EN_CONTACTO'];

async function main() {
  // ── 1. Validar horario de oficina ──────────
  const currentHour = new Date().getHours();
  if (currentHour < HORA_INICIO || currentHour >= HORA_FIN) {
    console.log('[Agente] Fuera de horario laboral. Terminando.');
    process.exit(0);
  }

  console.log(`[Agente] Iniciando Agente Supervisor — ${new Date().toLocaleString('es-MX')}`);

  try {
    await sequelize.authenticate();

    // ── 2. Obtener asesores con teléfono ──────
    const asesores: any[] = await Usuario.findAll({
      where: {
        rol: 'asesor_comercial',
        activo: true,
        telefono_whatsapp: { [Op.not]: null },
      },
      attributes: ['id', 'nombre_completo', 'email', 'telefono_whatsapp'],
      raw: true,
    });

    if (asesores.length === 0) {
      console.log('[Agente] No hay asesores con teléfono configurado. Agrega el número en la tabla usuarios.telefono_whatsapp');
      process.exit(0);
    }

    const asesorIds = asesores.map((a: any) => a.id);

    // ── 3. Obtener leads activos ───────────────
    const leads: any[] = await Lead.findAll({
      where: {
        asesor_id: { [Op.in]: asesorIds },
        estado_crm: { [Op.in]: ESTADOS_ACTIVOS },
      },
      order: [['updatedAt', 'DESC']],
      raw: true,
    });

    // ── 4. Leer memoria del ciclo anterior ────
    const memoria = leerMemoria();
    const memoriaActualizada = { ...memoria, leads: { ...memoria.leads } };

    // ── 5. Inicializar WhatsApp ────────────────
    const whatsapp = new WhatsappService();
    await whatsapp.initialize();

    // ── 6. Procesar cada asesor ───────────────
    for (const asesor of asesores) {
      const leadsAsesor = leads.filter((l: any) => l.asesor_id === asesor.id);

      const asignados = leadsAsesor.filter((l: any) =>
        ['NUEVO', 'ASIGNADO', 'EN_CONTACTO'].includes(l.estado_crm)
      );
      const cotizando = leadsAsesor.filter((l: any) => l.estado_crm === 'COTIZANDO');
      const seguimiento = leadsAsesor.filter((l: any) => l.estado_crm === 'SEGUIMIENTO');

      if (asignados.length === 0 && cotizando.length === 0 && seguimiento.length === 0) {
        console.log(`[Agente] ${asesor.nombre_completo}: Sin leads activos. No se envía mensaje.`);
        continue;
      }

      // ── 7. Detectar leads estancados (Nivel 2) ────
      const mensajesUrgentesPendientes: string[] = [];
      for (const lead of asignados) {
        const leadMem: LeadMemoria | undefined = memoriaActualizada.leads[lead.id];

        if (leadMem && leadMem.ciclosAlertados >= CICLOS_PARA_URGENTE) {
          // Este lead ya fue alertado varias veces → mensaje urgente con IA
          console.log(`[Agente] Lead "${lead.nombre}" (ID:${lead.id}) estancado ${leadMem.ciclosAlertados} ciclos. Generando alerta urgente...`);
          const msgUrgente = await generarMensajeUrgente({
            asesorNombre: asesor.nombre_completo,
            leadNombre: lead.nombre,
            leadTelefono: lead.telefono || 'sin número',
            ciclosEstancado: leadMem.ciclosAlertados,
            estadoCrm: lead.estado_crm,
          });
          mensajesUrgentesPendientes.push(msgUrgente);
          // Actualizar ciclos en memoria
          memoriaActualizada.leads[lead.id] = {
            ...leadMem,
            ciclosAlertados: leadMem.ciclosAlertados + 1,
          };
        } else if (leadMem) {
          // Lead ya alertado pero aún no urgente → incrementar contador
          memoriaActualizada.leads[lead.id] = {
            ...leadMem,
            ciclosAlertados: leadMem.ciclosAlertados + 1,
          };
        } else {
          // Primera vez que se ve este lead → registrar en memoria
          memoriaActualizada.leads[lead.id] = {
            leadId: lead.id,
            asesorId: asesor.id,
            primeraAlertaEn: new Date().toISOString(),
            ciclosAlertados: 1,
          };
        }
      }

      // ── 8. Enviar mensajes urgentes si los hay ────
      for (const msgUrgente of mensajesUrgentesPendientes) {
        console.log(`[Agente] Enviando alerta URGENTE a ${asesor.nombre_completo}...`);
        await whatsapp.enviarMensaje(asesor.telefono_whatsapp, msgUrgente);
        await delay(1500);
      }

      // ── 9. Generar y enviar reporte periódico ────
      const diasSinActividad = (lead: any) => {
        const diff = Date.now() - new Date(lead.updatedAt).getTime();
        return Math.floor(diff / (1000 * 60 * 60 * 24));
      };

      const mensajePeriodico = await generarReportePeriodico({
        asesorNombre: asesor.nombre_completo,
        asignados: asignados.map((l: any) => ({ nombre: l.nombre, telefono: l.telefono })),
        cotizando: cotizando.length,
        seguimiento: seguimiento.map((l: any) => ({
          nombre: l.nombre,
          diasSinActividad: diasSinActividad(l),
        })),
      });

      if (mensajePeriodico) {
        console.log(`[Agente] Enviando reporte periódico a ${asesor.nombre_completo} (${asesor.telefono_whatsapp})...`);
        await whatsapp.enviarMensaje(asesor.telefono_whatsapp, mensajePeriodico);
        await delay(1500);
      }
    }

    // ── 10. Limpiar leads ya cerrados de la memoria ────
    const idsLeadsActivos = new Set(leads.map((l: any) => l.id));
    for (const id of Object.keys(memoriaActualizada.leads)) {
      if (!idsLeadsActivos.has(Number(id))) {
        delete memoriaActualizada.leads[Number(id)];
      }
    }

    memoriaActualizada.ultimaEjecucion = new Date().toISOString();
    guardarMemoria(memoriaActualizada);

    await whatsapp.close();
    console.log('[Agente] Ciclo completado exitosamente.');

  } catch (error) {
    console.error('[Agente] Error crítico:', error);
  } finally {
    process.exit(0);
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main();
