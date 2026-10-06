// Informe del día para WhatsApp (InformeRutasModal): texto con las paradas de un día,
// agrupadas por oficial, para pegar en los grupos. Sin vehículo ni conductor, sin
// teléfonos de clientes y sin valores (decisión del usuario, 2026-10-06).
// - Hoy y días futuros: lo programado. Las paradas pausadas no salen: pausar saca la ODP
//   de la ruta.
// - Días pasados: cada parada con su resultado (✅ ⚠️ ⏸️ ⏳).
// Los datos vienen de GET /api/rutas/programacion?fecha=YYYY-MM-DD.

import { fmtDia, hoyBogotaISO } from '../../../utils/fechas';

export interface InformeParada {
  id: number;
  orden: number;
  estado: 'pendiente' | 'en_curso' | 'pausada' | 'completada' | 'con_dano';
  odp: {
    numero_odp: string;
    descripcion_pedido: string | null;
    direccion_instalacion: string | null;
    es_garantia?: boolean | null;
    es_no_conformidad?: boolean | null;
    cliente: { nombre_razon_social: string } | null;
  } | null;
}

export interface InformeRuta {
  id: number;
  oficial: { id: number; nombre_completo: string } | null;
  instaladores: { id: number; nombre_completo: string }[];
  ruta_odps: InformeParada[];
}

// ─── Resumen de la descripción: una línea corta ──────────────────────────────

// Largo máximo del producto (sin el tipo de servicio ni el espesor). Con el tipo completo
// ("Suministro e instalación", versión elegida por el usuario) la línea queda en ~45-55.
const MAX_PRODUCTO = 28;

const espacios = (t: string): string => t.replace(/\s+/g, ' ').trim();

/** Todo en minúscula salvo los códigos con dígitos (T-244, 8025); "8MM" sí baja a "8mm". */
const minusculas = (t: string): string =>
  espacios(t).split(' ').map((p) => (/\d/.test(p) && !/^\d+([.,]\d+)?mm…?$/i.test(p) ? p : p.toLowerCase())).join(' ');

/** Mayúscula inicial: las descripciones vienen casi siempre en MAYÚSCULAS. */
const oracion = (t: string): string => {
  const s = minusculas(t);
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const sinTildes = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Quita del inicio del texto el tipo repetido ("SUMINISTRO E INSTALACIÓN DE…", "SERVICIO DE…"). */
const quitarPrefijos = (texto: string, tipo: string | null): string => {
  const prefijos = [tipo, 'suministro e instalacion', 'servicio de', 'servicio', 'venta y transporte']
    .filter((p): p is string => !!p)
    .map(sinTildes);
  // NFC + espacios simples: el slice por largo del prefijo asume que cada letra con tilde
  // es un solo carácter, y hay descripciones con doble espacio ("SUMINISTRO  E INSTALACIÓN").
  let t = espacios(texto.normalize('NFC')).replace(/^[\s\-–—:]+/, '');
  for (let cambio = true; cambio;) {
    cambio = false;
    const base = sinTildes(t);
    for (const p of prefijos) {
      if (p && base.startsWith(`${p} `)) { t = t.slice(p.length).trim(); cambio = true; break; }
    }
    const de = t.match(/^(de|del)\s+/i);
    if (de) { t = t.slice(de[0].length); cambio = true; }
  }
  return t;
};

/** Espesor del vidrio (8mm, 10 MM, 3+3), buscado antes de "MEDIDA" para no tomar una dimensión. */
const espesor = (texto: string): string | null => {
  const antesDeMedida = texto.split(/medida/i)[0];
  const m = antesDeMedida.match(/\b(\d{1,2}(?:[.,]\d)?)\s?mm\b/i) ?? antesDeMedida.match(/\b(\d\+\d)\b/);
  if (!m) return null;
  return m[0].includes('+') ? m[1] : `${m[1]}mm`;
};

/** Producto: hasta la primera coma/punto o la primera palabra "en", "con", "incluye". */
const producto = (texto: string): string => {
  let t = espacios(texto).split(/[,.;:(]/)[0];
  t = t.split(/\s+(?:en|con|incluye|medida)\s+/i)[0];
  if (t.length > MAX_PRODUCTO) {
    const corte = t.slice(0, MAX_PRODUCTO);
    t = `${corte.slice(0, corte.lastIndexOf(' ') > 10 ? corte.lastIndexOf(' ') : MAX_PRODUCTO)}…`;
  }
  return t;
};

/**
 * Una línea corta de lo que se va a hacer, a partir de `descripcion_pedido`
 * (`Nx <Tipo>: <texto>`, una línea por servicio; ver ODPForm). Ej.:
 * "1x Suministro e Instalación: DE PUERTA BATIENTE EN VIDRIO TEMPLADO INCOLORO 8MM, …"
 * → "Suministro e instalación puerta batiente 8mm".
 */
export const resumirDescripcion = (desc: string | null | undefined, esGarantia = false): string => {
  const lineas = (desc ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lineas.length) return '';

  const servicios = lineas
    .map((l) => l.match(/^(\d+)\s*x\s+(.+)$/i))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => {
      const conTipo = m[2].match(/^([^:\d]{3,40}):\s*(.*)$/);
      return { cantidad: Number(m[1]) || 1, tipo: conTipo ? conTipo[1].trim() : null, texto: conTipo ? conTipo[2] : m[2] };
    });

  // Sin el patrón Nx: reprocesos de No Conformidad, garantías escritas a mano.
  if (!servicios.length) {
    const reproceso = lineas[0].match(/^\[REPROCESO\s+([^\]]+)\]\s*(?:Ref:\s*(\S+))?/i);
    if (reproceso) return `Reproceso ${reproceso[1]}${reproceso[2] ? ` (${reproceso[2]})` : ''}`;
    servicios.push({ cantidad: 1, tipo: esGarantia ? 'Garantía' : null, texto: lineas[0] });
  }

  const [primero] = servicios;
  // "1x Suministro e Instalación: [REPROCESO NC-0020] Ref: ODP-24203"
  const reproceso = primero.texto.match(/^\[REPROCESO\s+([^\]]+)\]\s*(?:Ref:\s*(\S+))?/i);
  if (reproceso) return `Reproceso ${reproceso[1]}${reproceso[2] ? ` (${reproceso[2]})` : ''}`;

  const cuerpo = quitarPrefijos(primero.texto, primero.tipo);
  const prod = producto(cuerpo);
  const esp = espesor(cuerpo);
  const espTexto = esp && !sinTildes(prod).includes(sinTildes(esp)) ? ` ${esp}` : '';

  const partes = primero.tipo
    ? `${oracion(primero.tipo)}${prod ? ` ${minusculas(prod)}` : ''}`
    : oracion(prod);
  const cantidad = primero.cantidad > 1 ? ` (x${primero.cantidad})` : '';
  const mas = servicios.length > 1 ? ` (+${servicios.length - 1} más)` : '';
  return `${partes}${espTexto}${cantidad}${mas}`;
};

// ─── Texto del informe ───────────────────────────────────────────────────────

const MARCA: Record<InformeParada['estado'], { icono: string; etiqueta: string }> = {
  completada: { icono: '✅', etiqueta: 'instalada' },
  con_dano:   { icono: '⚠️', etiqueta: 'con daño' },
  pausada:    { icono: '⏸️', etiqueta: 'devuelta a bandeja' },
  pendiente:  { icono: '⏳', etiqueta: 'no se hizo' },
  en_curso:   { icono: '⏳', etiqueta: 'no se hizo' },
};

interface Equipo {
  oficial: string | null;
  ayudantes: string[];
  paradas: { ruta: InformeRuta; ro: InformeParada }[];
}

const tituloFecha = (fecha: string): string => {
  const anio = fecha.slice(0, 4) !== hoyBogotaISO().slice(0, 4);
  const t = fmtDia(fecha, { weekday: 'long', day: '2-digit', month: 'long', ...(anio ? { year: 'numeric' } : {}) }).replace(',', '');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Texto listo para WhatsApp. `''` cuando el día no tiene paradas que informar. */
export const generarInformeDia = (rutas: InformeRuta[], fecha: string): string => {
  const pasado = fecha < hoyBogotaISO();

  // Un bloque por oficial (como la vista "Por equipo"): si tiene varias rutas el mismo
  // día, sus paradas se juntan en una sola lista.
  const equipos = new Map<string, Equipo>();
  for (const ruta of rutas) {
    const paradas = [...(ruta.ruta_odps ?? [])]
      .filter((ro) => ro.odp && (pasado || ro.estado !== 'pausada'))
      .sort((a, b) => a.orden - b.orden);
    if (!paradas.length) continue;
    const clave = ruta.oficial ? `o${ruta.oficial.id}` : 'sin-oficial';
    if (!equipos.has(clave)) equipos.set(clave, { oficial: ruta.oficial?.nombre_completo ?? null, ayudantes: [], paradas: [] });
    const eq = equipos.get(clave)!;
    for (const i of ruta.instaladores ?? []) {
      if (i.nombre_completo && i.nombre_completo !== eq.oficial && !eq.ayudantes.includes(i.nombre_completo)) eq.ayudantes.push(i.nombre_completo);
    }
    paradas.forEach((ro) => eq.paradas.push({ ruta, ro }));
  }
  if (!equipos.size) return '';

  // Los equipos con oficial primero, por nombre; "sin oficial" al final.
  const lista = Array.from(equipos.values()).sort((a, b) =>
    (a.oficial ? 0 : 1) - (b.oficial ? 0 : 1) || (a.oficial ?? '').localeCompare(b.oficial ?? ''));

  const lineas: string[] = [`🗓️ *INSTALACIONES — ${tituloFecha(fecha)}*`, ''];
  const conteo: Partial<Record<string, number>> = {};
  let total = 0;

  for (const eq of lista) {
    const cabeza = eq.oficial ? `*${eq.oficial}*` : '*Sin oficial asignado*';
    lineas.push(`👷 ${cabeza}${eq.ayudantes.length ? ` + ${eq.ayudantes.join(', ')}` : ''}`);
    for (let i = 0; i < eq.paradas.length; i += 1) {
      const { ro } = eq.paradas[i];
      const odp = ro.odp!;
      const marca = pasado ? `${MARCA[ro.estado].icono} ` : '';
      if (pasado) conteo[MARCA[ro.estado].icono] = (conteo[MARCA[ro.estado].icono] ?? 0) + 1;
      total += 1;
      lineas.push(`${i + 1}. ${marca}*${odp.numero_odp}* · ${espacios(odp.cliente?.nombre_razon_social ?? 'Sin cliente')}`);
      lineas.push(`   📍 ${odp.direccion_instalacion ? espacios(odp.direccion_instalacion) : 'Sin dirección registrada'}`);
      const resumen = resumirDescripcion(odp.descripcion_pedido, !!odp.es_garantia);
      if (resumen) lineas.push(`   🔧 ${resumen}`);
    }
    lineas.push('');
  }

  const equiposTxt = `${lista.length} equipo${lista.length === 1 ? '' : 's'}`;
  if (pasado) {
    const orden = ['✅', '⚠️', '⏸️', '⏳'];
    const resumen = orden.filter((k) => conteo[k]).map((k) => `${k} ${conteo[k]}`).join(' · ');
    const leyenda = orden.filter((k) => conteo[k])
      .map((k) => `${k} ${Object.values(MARCA).find((m) => m.icono === k)!.etiqueta}`)
      .join(' · ');
    lineas.push(`Total: ${total} · ${resumen}`);
    lineas.push(leyenda);
  } else {
    lineas.push(`Total: ${total} instalaci${total === 1 ? 'ón' : 'ones'} · ${equiposTxt}`);
  }
  return lineas.join('\n');
};
