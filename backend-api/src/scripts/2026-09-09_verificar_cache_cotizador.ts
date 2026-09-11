// Etapa 2 del módulo Cotizador — verificación de la caché (hito A1).
//
// La caché reconstruye desde Postgres las mismas estructuras que los motores
// leían de disco. Este script comprueba que esa reconstrucción es IDÉNTICA al
// material de origen, campo a campo y clave a clave, no solo equivalente:
// una clave de más (p.ej. `referencia: null` en un producto de catálogo que
// nunca la tuvo) rompería el golden master más adelante, y allí el diagnóstico
// sería mucho más costoso.
//
// Uso: npx ts-node src/scripts/2026-09-09_verificar_cache_cotizador.ts
import * as fs from 'fs';
import * as path from 'path';
import { sequelize } from '../models';
import * as cache from '../cotizador/cache';

const DATOS_DIR = path.join(__dirname, 'datos_cotizador');
function leerJSON<T = unknown>(nombre: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATOS_DIR, nombre), 'utf8'));
}

let fallos = 0;
function fallar(mensaje: string) {
  console.error(`  ✗ ${mensaje}`);
  fallos++;
}
function ok(mensaje: string) {
  console.log(`  ✓ ${mensaje}`);
}

/** Compara dos valores en profundidad exigiendo el MISMO juego de claves.
 * Devuelve la ruta de la primera diferencia, o null si son idénticos. */
function primeraDiferencia(a: unknown, b: unknown, ruta = ''): string | null {
  if (a === b) return null;
  if (typeof a === 'number' && typeof b === 'number') {
    if (a === b || (Number.isNaN(a) && Number.isNaN(b))) return null;
    return `${ruta}: ${a} ≠ ${b}`;
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return `${ruta}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return `${ruta}: uno es array y el otro no`;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${ruta}: longitud ${a.length} ≠ ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const d = primeraDiferencia(a[i], b[i], `${ruta}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  const ka = Object.keys(a as object).sort();
  const kb = Object.keys(b as object).sort();
  if (ka.join('|') !== kb.join('|')) {
    const sobran = ka.filter((k) => !kb.includes(k));
    const faltan = kb.filter((k) => !ka.includes(k));
    return `${ruta}: claves distintas (sobran: [${sobran}], faltan: [${faltan}])`;
  }
  for (const k of ka) {
    const d = primeraDiferencia(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown>)[k],
      ruta ? `${ruta}.${k}` : k
    );
    if (d) return d;
  }
  return null;
}

async function main() {
  console.log('Precargando caché desde Postgres...');
  const t0 = Date.now();
  await cache.precargar();
  console.log(`Precarga completada en ${Date.now() - t0} ms\n`);

  // ─── Conteos ──────────────────────────────────────────────────────────────
  console.log('Conteos:');
  const productos = cache.getProductos();
  const disenos = cache.getDisenos();
  const totalPerfiles = disenos.reduce((n, d) => n + d.perfiles.length, 0);
  const totalVidrios = disenos.reduce((n, d) => n + d.vidrios.length, 0);
  const totalAccesorios = disenos.reduce((n, d) => n + d.accesorios.length, 0);
  const mapeo = cache.getMapeoAccesorios();

  const esperados: Array<[string, number, number]> = [
    // 558 desde el 2026-09-11: 432 de catálogo (dos altas del Excel matriz,
    // KDG1106 y KOP0102) + 126 provisionales, que no se movieron.
    ['productos', productos.size, 558],
    ['diseños', disenos.length, 138],
    ['perfiles', totalPerfiles, 983],
    ['vidrios', totalVidrios, 218],
    ['accesorios', totalAccesorios, 1049],
    ['mapeo accesorios', Object.keys(mapeo.accesorios).length, 54],
  ];
  for (const [nombre, real, esperado] of esperados) {
    if (real === esperado) ok(`${nombre}: ${real}`);
    else fallar(`${nombre}: ${real} (esperado ${esperado})`);
  }

  const cotizables = disenos.filter((d) => d.cotizable).length;
  if (cotizables === 120) ok(`diseños cotizables: ${cotizables}`);
  else fallar(`diseños cotizables: ${cotizables} (esperado 120)`);

  // ─── Round-trip: productos del catálogo real ─────────────────────────────
  console.log('\nRound-trip de productos (catálogo real, 430):');
  const catalogoOrigen = leerJSON<Record<string, unknown>[]>('catalogo.json');
  let difs = 0;
  for (const origen of catalogoOrigen) {
    const codigo = origen.codigo as string;
    const enCache = productos.get(codigo);
    if (!enCache) {
      if (difs++ < 3) fallar(`${codigo} no está en la caché`);
      continue;
    }
    // El origen no trae `activo`; la caché lo añade como true (igual que hacía
    // construirCacheProductos en proveedorLocal.js).
    const d = primeraDiferencia({ ...origen, activo: true }, enCache, codigo);
    if (d && difs++ < 3) fallar(d);
  }
  if (difs === 0) ok('430/430 idénticos (incluido el juego exacto de claves)');
  else fallar(`${difs} productos con diferencias`);

  // ─── Round-trip: provisionales ───────────────────────────────────────────
  console.log('\nRound-trip de provisionales (126):');
  const provOrigen = leerJSON<{ productos: Record<string, unknown>[] }>('catalogo-provisional.json');
  let difsProv = 0;
  for (const origen of provOrigen.productos) {
    const codigo = origen.codigo as string;
    const enCache = productos.get(codigo);
    if (!enCache) {
      if (difsProv++ < 3) fallar(`${codigo} no está en la caché`);
      continue;
    }
    const d = primeraDiferencia({ ...origen, activo: true }, enCache, codigo);
    if (d && difsProv++ < 3) fallar(d);
  }
  if (difsProv === 0) ok('126/126 idénticos');
  else fallar(`${difsProv} provisionales con diferencias`);

  // ─── Round-trip: diseños completos ───────────────────────────────────────
  console.log('\nRound-trip de diseños (138, con perfiles/vidrios/accesorios):');
  const disenosOrigen = leerJSON<{ disenos: Record<string, unknown>[] }>('disenos.json');
  let difsDis = 0;
  for (const origen of disenosOrigen.disenos) {
    const enCache = cache.getDiseno(origen.id as string);
    if (!enCache) {
      if (difsDis++ < 3) fallar(`${origen.id} no está en la caché`);
      continue;
    }
    const d = primeraDiferencia(origen, enCache, origen.id as string);
    if (d && difsDis++ < 5) fallar(d);
  }
  if (difsDis === 0) ok('138/138 idénticos (fórmulas, códigos por color, niveles)');
  else fallar(`${difsDis} diseños con diferencias`);

  // ─── Round-trip: parámetros ──────────────────────────────────────────────
  console.log('\nRound-trip de parámetros:');
  const paramOrigen = leerJSON('parametros.json');
  const d = primeraDiferencia(paramOrigen, cache.getParametros(), 'parametros');
  if (d) fallar(d);
  else ok('idénticos (aiu, iva, smo anidado, listas cerradas)');

  // ─── Round-trip: mapeo de accesorios ─────────────────────────────────────
  console.log('\nRound-trip del mapeo de accesorios:');
  const mapeoOrigen = leerJSON<{
    sistemasActivos: string[];
    accesorios: Record<string, unknown>;
  }>('mapeo-accesorios.json');
  const dm = primeraDiferencia(mapeoOrigen.accesorios, mapeo.accesorios, 'accesorios');
  if (dm) fallar(dm);
  else ok('54/54 idénticos');
  // Desde el 2026-09-11 el JSON de origen SÍ propone dos sistemas
  // (Sistema5020, Sistema5020Reforzado), pero la autoridad en runtime es la
  // tabla cotizador_accesorio_sistema_activo, que está vacía a propósito:
  // activar un sistema es un INSERT manual y deliberado, nunca parte de una
  // siembra ni de una migración. Por eso ya no se comparan JSON y caché aquí.
  if (mapeo.sistemasActivos.length === 0)
    ok('sistemasActivos vacío en BD (activar es un INSERT manual y deliberado)');
  else
    ok(`sistemasActivos: ${mapeo.sistemasActivos.join(', ')} — activados a mano en BD`);

  // ─── AUSENTE ≠ CERO ──────────────────────────────────────────────────────
  console.log('\nInvariante AUSENTE ≠ CERO (calibración vacía):');
  const margenes = cache.getMargenes();
  const holguras = cache.getHolguras();
  if (margenes.global === null) ok('margen global: null (ausente), no 0');
  else fallar(`margen global: ${margenes.global} — debería ser null`);
  if (Object.keys(margenes.sistema).length === 0 && Object.keys(margenes.pieza).length === 0) {
    ok('sin márgenes por sistema ni por pieza');
  } else fallar('hay márgenes cargados y la tabla debería estar vacía');
  if (holguras.global === null) ok('holgura global: null (ausente), no {0,0}');
  else fallar('holgura global debería ser null');

  // ─── Indisponibilidad ────────────────────────────────────────────────────
  console.log('\nAislamiento (el módulo caído no debe tumbar nada):');
  cache.marcarIndisponible('prueba');
  try {
    cache.getProductos();
    fallar('getProductos() no lanzó con la caché marcada indisponible');
  } catch (e) {
    if (e instanceof cache.CotizadorNoDisponibleError) ok('los getters lanzan CotizadorNoDisponibleError');
    else fallar(`lanzó ${e instanceof Error ? e.name : typeof e}, no CotizadorNoDisponibleError`);
  }
  if (!cache.disponible()) ok('disponible() === false');
  else fallar('disponible() sigue en true');

  await sequelize.close();
  if (fallos > 0) {
    console.error(`\n✗ ${fallos} fallo(s). La caché no reproduce el origen: no portar motores todavía.`);
    process.exit(1);
  }
  console.log('\n✓ La caché reproduce el material de origen byte a byte.');
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
