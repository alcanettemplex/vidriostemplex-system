import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Genera un mensaje de alerta URGENTE con IA cuando un lead lleva 2+ ciclos estancado.
 * El tono es más firme pero siempre profesional.
 */
export async function generarMensajeUrgente(params: {
  asesorNombre: string;
  leadNombre: string;
  leadTelefono: string;
  ciclosEstancado: number;
  estadoCrm: string;
}): Promise<string> {
  const { asesorNombre, leadNombre, leadTelefono, ciclosEstancado, estadoCrm } = params;

  const horasEstancado = ciclosEstancado * 2;

  const prompt = `Eres el asistente virtual de seguimiento comercial de Vidrios Templex, una empresa de vidrios y aluminio.
Genera un mensaje de WhatsApp BREVE (máximo 5 líneas) y DIRECTO para el asesor "${asesorNombre}".
El lead "${leadNombre}" (${leadTelefono}) lleva ${horasEstancado} horas sin atención en estado "${estadoCrm}".
El tono debe ser profesional pero firme. Recuérdale que este lead es una oportunidad de venta que no puede dejarse enfriar.
Usa emojis con moderación. No uses saludos largos. Ve directo al punto.
Responde SOLO con el texto del mensaje, sin comillas ni explicaciones adicionales.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 200,
    temperature: 0.7,
  });

  return response.choices[0].message.content?.trim() ?? `⚠️ ${asesorNombre}, el lead "${leadNombre}" lleva ${horasEstancado}h sin atención. Por favor contáctalo a la brevedad.`;
}

/**
 * Genera el reporte periódico estándar (nivel 1) para un asesor.
 * Tono amigable y motivador.
 */
export async function generarReportePeriodico(params: {
  asesorNombre: string;
  asignados: { nombre: string; telefono?: string }[];
  cotizando: number;
  seguimiento: { nombre: string; diasSinActividad: number }[];
}): Promise<string> {
  const { asesorNombre, asignados, cotizando, seguimiento } = params;

  const primerNombre = asesorNombre.split(' ')[0];

  // Construir contexto para la IA
  const contexto: string[] = [];
  if (asignados.length > 0) {
    const lista = asignados.slice(0, 3).map(l => `"${l.nombre}" (${l.telefono || 'sin número'})`).join(', ');
    contexto.push(`Leads nuevos/asignados que requieren primer contacto: ${lista}${asignados.length > 3 ? ` y ${asignados.length - 3} más` : ''}.`);
  }
  if (cotizando > 0) {
    contexto.push(`${cotizando} leads esperando cotización.`);
  }
  if (seguimiento.length > 0) {
    const lista = seguimiento.slice(0, 3).map(l => `"${l.nombre}" (${l.diasSinActividad}d sin actividad)`).join(', ');
    contexto.push(`Leads en seguimiento: ${lista}${seguimiento.length > 3 ? ` y ${seguimiento.length - 3} más` : ''}.`);
  }

  if (contexto.length === 0) return '';

  const prompt = `Eres el asistente virtual de Vidrios Templex. Escribe un mensaje de WhatsApp MOTIVADOR y BREVE (máximo 8 líneas) para el asesor "${primerNombre}".
Situación actual de sus leads:
${contexto.join('\n')}
Usa emojis con moderación. Sé conciso y energético. Termina con una frase motivadora corta.
Responde SOLO con el texto del mensaje, sin comillas ni explicaciones adicionales.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.8,
    });
    return response.choices[0].message.content?.trim() ?? generarMensajeFallback(primerNombre, asignados.length, cotizando, seguimiento.length);
  } catch (err) {
    console.error('[IA] Error al generar mensaje con OpenAI, usando fallback:', err);
    return generarMensajeFallback(primerNombre, asignados.length, cotizando, seguimiento.length);
  }
}

function generarMensajeFallback(nombre: string, asignados: number, cotizando: number, seguimiento: number): string {
  let msg = `Hola ${nombre} 👋\n\nReporte de tus leads activos:\n\n`;
  if (asignados > 0) msg += `🔴 *${asignados} lead(s) por contactar* — Primer contacto urgente.\n`;
  if (cotizando > 0) msg += `🟡 *${cotizando} lead(s) esperando cotización.*\n`;
  if (seguimiento > 0) msg += `🔵 *${seguimiento} lead(s) en seguimiento* — No los dejes enfriar.\n`;
  msg += `\n¡Mucho éxito! 💪 — Templex`;
  return msg;
}
