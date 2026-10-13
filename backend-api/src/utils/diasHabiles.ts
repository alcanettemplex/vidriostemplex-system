/**
 * Tiempo hábil en hora de Bogotá — fuente única para las reglas de supervisión
 * comercial (reporte diario de asesores, colas de Primer Contacto y Seguimiento).
 *
 * Horario laboral (decisión del usuario, 2026-10-12):
 *   - lunes a viernes 08:00–17:00
 *   - sábado 08:00–12:00 (cuenta como día hábil)
 *   - domingos y festivos de Colombia: no hábiles
 *
 * Los festivos se calculan aquí (Ley 51 de 1983 "Ley Emiliani" + fiestas atadas
 * a la Pascua), sin dependencia externa. Bogotá no tiene horario de verano: el
 * desfase UTC−5 es fijo y toda la aritmética se hace en UTC desplazado.
 */
import { diaBogotaISO, sumarDiasISO } from './fechas';

const MS_HORA = 60 * 60 * 1000;
const MS_OFFSET_BOGOTA = 5 * MS_HORA;

/** Horario por día de la semana (0 = domingo): [hora inicio, hora fin) o null. */
const HORARIO: Record<number, [number, number] | null> = {
  0: null,
  1: [8, 17],
  2: [8, 17],
  3: [8, 17],
  4: [8, 17],
  5: [8, 17],
  6: [8, 12],
};

/** Horas de una jornada completa de lunes a viernes (para expresar horas en días). */
export const HORAS_JORNADA = 9;

const cacheFestivos = new Map<number, Set<string>>();

function iso(anio: number, mes: number, dia: number): string {
  return new Date(Date.UTC(anio, mes - 1, dia)).toISOString().slice(0, 10);
}

/** Domingo de Pascua (algoritmo anónimo gregoriano / Meeus). */
function domingoPascua(anio: number): string {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(anio, mes, dia);
}

function diaSemana(fechaISO: string): number {
  return new Date(`${fechaISO}T00:00:00Z`).getUTCDay();
}

/** Ley Emiliani: si la fecha no cae en lunes, el festivo pasa al lunes siguiente. */
function aLunesSiguiente(fechaISO: string): string {
  const dow = diaSemana(fechaISO);
  return dow === 1 ? fechaISO : sumarDiasISO(fechaISO, (8 - dow) % 7);
}

/** Festivos de Colombia de un año, como `'YYYY-MM-DD'`. */
export function festivosColombia(anio: number): Set<string> {
  const cache = cacheFestivos.get(anio);
  if (cache) return cache;

  const pascua = domingoPascua(anio);
  const festivos = new Set<string>([
    // Fijos
    iso(anio, 1, 1),   // Año nuevo
    iso(anio, 5, 1),   // Día del trabajo
    iso(anio, 7, 20),  // Independencia
    iso(anio, 8, 7),   // Batalla de Boyacá
    iso(anio, 12, 8),  // Inmaculada Concepción
    iso(anio, 12, 25), // Navidad
    // Trasladables al lunes (Ley Emiliani)
    aLunesSiguiente(iso(anio, 1, 6)),   // Reyes Magos
    aLunesSiguiente(iso(anio, 3, 19)),  // San José
    aLunesSiguiente(iso(anio, 6, 29)),  // San Pedro y San Pablo
    aLunesSiguiente(iso(anio, 8, 15)),  // Asunción de la Virgen
    aLunesSiguiente(iso(anio, 10, 12)), // Día de la Raza
    aLunesSiguiente(iso(anio, 11, 1)),  // Todos los Santos
    aLunesSiguiente(iso(anio, 11, 11)), // Independencia de Cartagena
    // Atados a la Pascua
    sumarDiasISO(pascua, -3), // Jueves Santo
    sumarDiasISO(pascua, -2), // Viernes Santo
    sumarDiasISO(pascua, 43), // Ascensión (lunes)
    sumarDiasISO(pascua, 64), // Corpus Christi (lunes)
    sumarDiasISO(pascua, 71), // Sagrado Corazón (lunes)
  ]);
  cacheFestivos.set(anio, festivos);
  return festivos;
}

/** ¿El día `'YYYY-MM-DD'` es hábil (lunes a sábado, no festivo)? */
export function esDiaHabil(fechaISO: string): boolean {
  if (!HORARIO[diaSemana(fechaISO)]) return false;
  return !festivosColombia(Number(fechaISO.slice(0, 4))).has(fechaISO);
}

/**
 * Horas hábiles entre dos instantes (con decimales). Recorre día por día la
 * intersección de [desde, hasta] con la jornada de cada día hábil.
 */
export function horasHabilesEntre(desde: Date, hasta: Date): number {
  if (hasta.getTime() <= desde.getTime()) return 0;
  const ultimoDia = diaBogotaISO(hasta);
  let ms = 0;
  for (let dia = diaBogotaISO(desde); dia <= ultimoDia; dia = sumarDiasISO(dia, 1)) {
    const horario = HORARIO[diaSemana(dia)];
    if (!horario || !esDiaHabil(dia)) continue;
    const base = Date.parse(`${dia}T00:00:00Z`) + MS_OFFSET_BOGOTA;
    const inicio = Math.max(base + horario[0] * MS_HORA, desde.getTime());
    const fin = Math.min(base + horario[1] * MS_HORA, hasta.getTime());
    if (fin > inicio) ms += fin - inicio;
  }
  return ms / MS_HORA;
}

/**
 * Días hábiles transcurridos desde un instante hasta hoy: cuenta los días hábiles
 * posteriores al día de `desde`, hasta el día de `hasta` inclusive. Actividad el
 * lunes → el miércoles lleva 2 días hábiles sin actividad.
 */
export function diasHabilesDesde(desde: Date, hasta: Date = new Date()): number {
  const ultimoDia = diaBogotaISO(hasta);
  let dias = 0;
  for (let dia = sumarDiasISO(diaBogotaISO(desde), 1); dia <= ultimoDia; dia = sumarDiasISO(dia, 1)) {
    if (esDiaHabil(dia)) dias++;
  }
  return dias;
}
