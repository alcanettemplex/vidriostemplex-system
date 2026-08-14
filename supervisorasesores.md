# Proyecto: Agente Supervisor de Asesores Comerciales

**Estado actual:** Idea conceptual / Documentación para futura implementación.

## 📌 Objetivo
Crear un sistema automatizado (Agente) que se ejecute cada 2 horas (dentro de horario laboral: 8 AM - 6 PM) para revisar el estado de los leads asignados a los asesores comerciales (Alejandro, Paolo, Nataly). El agente debe enviar un resumen profesional recordando a cada asesor:
- Qué leads nuevos o asignados deben contactar urgentemente.
- Qué leads tienen en estado "Cotizando".
- A qué leads deben hacerle "Seguimiento".

> **Regla de Negocio (Comunicación Unidireccional):** El agente tiene un rol estrictamente emisor ("Push"). Su única tarea es enviar el reporte. No tiene capacidad para leer, procesar ni responder los mensajes de los asesores. Cualquier respuesta o duda enviada por los asesores al WhatsApp del bot será gestionada manualmente por el administrador humano.

## 🏗 Arquitectura Propuesta

La arquitectura se divide en los siguientes componentes principales:
1. **Memoria de Estado Local (`memoria_agente.json`):** Para lograr que el agente detecte si un asesor ignoró una recomendación anterior, el script guardará un registro local en tu PC (un archivo JSON). Anotará a qué leads se les hizo advertencia y a qué hora. 
2. **Generación de Mensajes por IA:** Al ejecutarse, el agente comparará la base de datos actual con su `memoria_agente.json`. Si detecta que un lead lleva 2 ciclos (4 horas) estancado en "Asignado" a pesar del aviso anterior, le enviará este contexto a una IA (ej. API de Gemini u OpenAI). La IA será la encargada de redactar un mensaje dinámico, natural y con un tono más firme pero profesional, exigiendo atención sobre ese lead en particular.
3. **Servicio de Notificaciones (`notificaciones.ts`):** Una clase abstracta encargada de enviar el mensaje. 
   - *Nota sobre WhatsApp Web:* Ya que no se cuenta con la API oficial paga de Meta, la vía más viable es usar automatización de WhatsApp Web. Existen librerías en Node.js (como `whatsapp-web.js` o `Baileys`) que actúan como un dispositivo vinculado. Solo requiere escanear un código QR la primera vez y el sistema enviará los mensajes gratuitamente simulando ser WhatsApp Web. Como los mensajes son internos (solo a 3 asesores y cada 2 horas), el riesgo de bloqueo por spam es nulo.
4. **Script Core (`agente_supervisor_leads.ts`):** Un script que consulta la base de datos `Usuario` y `Lead`, filtra por asesor, lee el estado anterior del JSON, solicita la redacción a la IA y pasa el texto al servicio de notificaciones.
   - *Mapeo de Teléfonos:* Se agregará una nueva columna `telefono_whatsapp` a la tabla `Usuario` en Supabase/PostgreSQL. El script consultará directamente este campo dinámico, permitiendo escalar a más asesores en el futuro sin modificar el código.
5. **Despliegue y Ejecución (Local):** En lugar de sobrecargar el servidor principal (Render), este script se ejecutará directamente en la PC de trabajo del administrador. Utilizando un programador de tareas (como el Programador de Tareas de Windows o PM2) se configurará para que se active cada 2 horas exclusivamente mientras la PC esté encendida durante el horario laboral (8 AM - 5 PM). Esto aprovecha el uso de memoria de la PC local (necesario para levantar el navegador invisible de WhatsApp Web) sin generar costos extras en la nube.

## 💻 Código Base (Borradores)

### 1. `backend-api/src/services/notificaciones.ts`
```typescript
export class NotificacionesService {
  /**
   * Envía un mensaje al asesor.
   * En producción, aquí se integraría Twilio (WhatsApp) o Nodemailer (Email).
   */
  static async enviarMensajeAsesor(asesorNombre: string, asesorEmail: string, mensaje: string): Promise<void> {
    console.log(`\n[AGENTE SUPERVISOR -> ENVIANDO MENSAJE]`);
    console.log(`Destinatario: ${asesorNombre}`);
    console.log(`Mensaje:\n`);
    console.log(mensaje);
    
    // Simular delay de red
    return new Promise((resolve) => setTimeout(resolve, 500));
  }
}
```

### 2. `backend-api/src/scripts/agente_supervisor_leads.ts`
```typescript
import sequelize from '../config/database';
import { Usuario, Lead } from '../models';
import { NotificacionesService } from '../services/notificaciones';
import { Op } from 'sequelize';

async function main() {
  try {
    // 1. Validar horario de oficina (8 AM a 6 PM)
    const currentHour = new Date().getHours();
    if (currentHour < 8 || currentHour >= 18) {
      console.log('Fuera de horario laboral. El agente supervisor no enviará notificaciones.');
      process.exit(0);
    }

    await sequelize.authenticate();
    console.log('Iniciando Agente Supervisor de Leads...');

    // Asesores objetivos
    let asesoresFinales = await Usuario.findAll({
      where: {
        [Op.or]: [
          { nombre_completo: { [Op.like]: '%alejandro%' } },
          { nombre_completo: { [Op.like]: '%paolo%' } },
          { nombre_completo: { [Op.like]: '%nataly%' } }
        ]
      },
      attributes: ['id', 'username', 'nombre_completo', 'rol', 'email'],
      raw: true
    });

    if (asesoresFinales.length === 0) process.exit(0);
    const advisorIds = asesoresFinales.map((a: any) => a.id);

    // 2. Buscar todos los leads de estos asesores
    const leads: any[] = await Lead.findAll({
      where: {
        asesor_id: { [Op.in]: advisorIds },
        estado_crm: {
          [Op.in]: ['NUEVO', 'ASIGNADO', 'COTIZANDO', 'SEGUIMIENTO', 'EN_CONTACTO']
        }
      },
      order: [['updatedAt', 'DESC']],
      raw: true
    });

    // 3. Agrupar leads por asesor
    const reportLeads: any = {};
    for (const a of asesoresFinales) {
      reportLeads[a.id] = { asesor: a, asignados: [], cotizando: [], seguimiento: [] };
    }

    for (const l of leads) {
      const aId = l.asesor_id;
      if (['NUEVO', 'ASIGNADO', 'EN_CONTACTO'].includes(l.estado_crm)) {
        reportLeads[aId].asignados.push(l);
      } else if (l.estado_crm === 'COTIZANDO') {
        reportLeads[aId].cotizando.push(l);
      } else if (l.estado_crm === 'SEGUIMIENTO') {
        reportLeads[aId].seguimiento.push(l);
      }
    }

    // 4. Generar y enviar mensajes
    for (const key of Object.keys(reportLeads)) {
      const data = reportLeads[key];
      const a = data.asesor;
      
      const totalAsignados = data.asignados.length;
      const totalCotizando = data.cotizando.length;
      const totalSeguimiento = data.seguimiento.length;

      if (totalAsignados > 0 || totalCotizando > 0 || totalSeguimiento > 0) {
        let mensaje = `Hola ${a.nombre_completo.split(' ')[0]},\n\nSoy tu asistente virtual de Templex. Este es tu reporte de actividad de leads de las últimas 2 horas.\n\n`;
        
        if (totalAsignados > 0) {
          mensaje += `🔴 *LEADS ASIGNADOS POR CONTACTAR (${totalAsignados}):*\nEs vital un primer contacto rápido.\n`;
          data.asignados.slice(0, 3).forEach((l: any) => mensaje += `  - ${l.nombre} (${l.telefono || 'Sin número'})\n`);
          if (totalAsignados > 3) mensaje += `  ...y ${totalAsignados - 3} más.\n\n`;
        }

        if (totalCotizando > 0) {
          mensaje += `🟡 *LEADS EN COTIZACIÓN (${totalCotizando}):*\nRecuerda enviar las cotizaciones pendientes y hacer seguimiento.\n\n`;
        }

        if (totalSeguimiento > 0) {
          mensaje += `🔵 *LEADS EN SEGUIMIENTO (${totalSeguimiento}):*\nNo dejes enfriar estas oportunidades.\n`;
          data.seguimiento.slice(0, 3).forEach((l: any) => mensaje += `  - ${l.nombre} (Últ. act: ${new Date(l.updatedAt).toLocaleDateString()})\n`);
          if (totalSeguimiento > 3) mensaje += `  ...y ${totalSeguimiento - 3} más.\n\n`;
        }

        mensaje += `¡Mucho éxito en tus gestiones!\nSaludos,\nEl equipo Templex.`;

        await NotificacionesService.enviarMensajeAsesor(a.nombre_completo, a.email, mensaje);
      }
    }
  } catch (error) {
    console.error('Error en el Agente Supervisor:', error);
  } finally {
    process.exit(0);
  }
}

main();
```

## 🚀 Pasos para Implementación Futura

Cuando decidas retomar este proyecto, entrégale este documento a la IA e indícale lo siguiente:
1. **Migración de BD:** Crear y ejecutar un script SQL para agregar la columna `telefono_whatsapp` a la tabla `Usuario` y actualizar los números de Alejandro, Paola y Nataly.
2. **Creación de Scripts:** Recrear los scripts en base al código documentado aquí, asegurando que `agente_supervisor_leads.ts` lea el nuevo campo `telefono_whatsapp`.
3. **Integración WhatsApp:** Instalar y configurar `whatsapp-web.js` (o similar) en el servicio de notificaciones, y escanear el QR desde la terminal local.
4. **Programación Local:** Configurar un Cronjob o Tarea Programada en la PC local de trabajo (ej. de 8 AM a 5 PM cada 2 horas).
