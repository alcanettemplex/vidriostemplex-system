// PDF de cotización (`lib/generadorPdfCotizacion.ts`), 2026-10-03.
//
// Es el documento que recibe el cliente: si un valor no cuadra, el cliente lo
// ve. Se prueban las funciones puras (folio, nombre de archivo, reparto de la
// mano de obra, resumen de opciones) y una generación REAL, leyendo el texto del
// PDF resultante para comprobar que lo impreso es lo que se le pasó.
//
// Cómo se lee el texto sin dependencias: pdfmake (sobre pdfkit) comprime cada
// stream con Flate y escribe el texto de las fuentes estándar como cadenas hex
// en operadores TJ. Se infla con `zlib` (Node) y se decodifica cada `<hex>` como
// latin1 (WinAnsi). Suficiente para buscar folios y montos; no es un lector de
// PDF general.
//
// Precarga la caché (las tarifas de mano de obra salen de los parámetros) — no
// escribe nada.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';

import { sequelize } from '../../models';
import * as cache from '../../cotizador/cache';
import {
  folioCotizacion,
  nombreArchivoCotizacion,
  valoresConManoObra,
  resumenPropuesta,
  generarPdfCotizacion,
  type ItemPdf,
  type PropuestaPdf,
  type CotizacionPdf,
} from '../../cotizador/lib/generadorPdfCotizacion';
import { manoObraPorItem } from '../../cotizador/lib/cargos';

before(async () => { await cache.precargar(); });
after(async () => { await sequelize.close(); });

const formatoCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const moneda = (n: number) => formatoCOP.format(n);

/** Texto visible del PDF, una línea por renglón dibujado.
 *
 * pdfmake dibuja CADA PALABRA en su propio bloque `BT … Tm … [<hex>] TJ … ET`,
 * con el espacio final incluido en el hex. Se unen las palabras que comparten
 * la coordenada vertical del `Tm` y se corta la línea cuando cambia. */
function textoDelPdf(pdf: Buffer): string {
  const crudo = pdf.toString('latin1');
  const lineas: string[] = [];
  let actual = '';
  let yActual: string | null = null;
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(crudo))) {
    let contenido: string;
    try {
      contenido = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
    } catch {
      continue; // imágenes u otros streams que no son de texto
    }
    for (const bloque of contenido.match(/BT[\s\S]*?ET/g) ?? []) {
      const y = bloque.match(/[\d.-]+\s+([\d.-]+)\s+Tm/)?.[1] ?? null;
      const palabra = (bloque.match(/<([0-9a-fA-F]+)>/g) ?? [])
        .map((h) => Buffer.from(h.slice(1, -1), 'hex').toString('latin1'))
        .join('');
      if (y !== yActual && actual) {
        lineas.push(actual.trim());
        actual = '';
      }
      yActual = y;
      actual += palabra;
    }
  }
  if (actual) lineas.push(actual.trim());
  return lineas.join('\n').replace(/ /g, ' ');
}

const normal = (s: string) => s.replace(/ /g, ' ');

// ─── Ítems de prueba: módulos reales, entradas mínimas ─────────────────────

const VENTANA: ItemPdf = {
  orden: 0, moduloId: 'ventanas', cantidadPiezas: 2, subtotalConAiu: 812345.67,
  input: { disenoId: 'Sistema5020::OX', anchoCm: 150, altoCm: 100, colorPerfileria: 'mate', codigoVidrio: 'CL4MM01CR', conInstalacion: true, cantidadPiezas: 2 },
  resultado: { diseno: { sistema: 'Sistema5020', diseno: 'OX' } },
};
const ESPEJO: ItemPdf = {
  orden: 1, moduloId: 'espejo', cantidadPiezas: 1, subtotalConAiu: 219000.4,
  input: { anchoCm: 100, altoCm: 150, acabado: 'BPB', conInstalacion: true, cantidadPiezas: 1 },
  resultado: null,
};
const LIBRE: ItemPdf = {
  orden: 2, moduloId: 'item-libre', cantidadPiezas: 1, subtotalConAiu: 100000, descripcionItem: 'Fachada oficina',
  input: { descripcionItem: 'Fachada oficina', lineas: [] }, resultado: null,
};

// ─── Folio y nombre de archivo ─────────────────────────────────────────────

test('folio: con una sola opción no lleva letra; con varias, sí', () => {
  assert.equal(folioCotizacion(17001, 'A', false), 'COT-17001');
  assert.equal(folioCotizacion(17001, 'B', true), 'COT-17001 B');
  assert.equal(folioCotizacion(17001, '', true), 'COT-17001');
});

test('nombre de archivo: folio, ODP y cliente; sin caracteres que Windows rechaza', () => {
  assert.equal(nombreArchivoCotizacion('COT-17001 B', 'ODP-24381', 'Luis Alcalá'), 'COT-17001 B, ODP-24381 Luis Alcalá');
  assert.equal(nombreArchivoCotizacion('COT-17001', null, null), 'COT-17001');
  assert.equal(nombreArchivoCotizacion('COT-1', '  ', 'A/B:C*D?"E<F>G|H'), 'COT-1 A B C D E F G H');
  assert.ok(nombreArchivoCotizacion('COT-1', null, 'x'.repeat(400)).length <= 150);
});

// ─── Reparto de la mano de obra dentro de los ítems ────────────────────────

test('mano de obra repartida: los enteros impresos suman exacto round(productos + mano de obra)', () => {
  const items = [VENTANA, ESPEJO];
  const mo = 187654.33;
  const valores = valoresConManoObra(items, mo);
  assert.ok(valores);
  const productos = items.reduce((a, it) => a + Number(it.subtotalConAiu), 0);
  assert.equal(valores.reduce((a, b) => a + b, 0), Math.round(productos + mo));
  for (const v of valores) assert.ok(Number.isInteger(v));
});

test('mano de obra repartida en proporción a lo que cada ítem genera', () => {
  const items = [VENTANA, ESPEJO];
  const pesos = manoObraPorItem(items.map((it) => ({ moduloId: it.moduloId, input: it.input ?? {} })));
  assert.ok(pesos.every((p) => p > 0), 'los dos productos llevan instalación');
  const mo = pesos.reduce((a, b) => a + b, 0); // el total "natural": cada ítem recibe su propio peso
  const valores = valoresConManoObra(items, mo)!;
  items.forEach((it, k) => {
    assert.ok(Math.abs(valores[k] - (Number(it.subtotalConAiu) + pesos[k])) <= 1, `ítem ${k}`);
  });
});

test('sin mano de obra, el reparto es solo el redondeo de los productos', () => {
  const valores = valoresConManoObra([VENTANA, ESPEJO], 0)!;
  assert.equal(valores.reduce((a, b) => a + b, 0), Math.round(812345.67 + 219000.4));
});

test('mano de obra guardada sin ítems que la generen → null (renglones aparte, sin perder un peso)', () => {
  assert.equal(valoresConManoObra([LIBRE], 50000), null);
});

// ─── Resumen de las otras opciones ─────────────────────────────────────────

test('resumen de opción: agrupa por producto y suma piezas, en el orden del asesor', () => {
  const r = resumenPropuesta([
    { orden: 1, moduloId: 'espejo', cantidadPiezas: 1 },
    { orden: 0, moduloId: 'ventanas', cantidadPiezas: 2 },
    { orden: 2, moduloId: 'ventanas', cantidadPiezas: 1 },
  ]);
  assert.match(r, /\(3\).*·.*\(1\)/, r);
  assert.ok(r.indexOf('(3)') < r.indexOf('(1)'), 'las ventanas (orden 0) van primero');
});

test('resumen de opción: más de 4 grupos se resumen en "y N más"; vacío = cadena vacía', () => {
  const items = ['A', 'B', 'C', 'D', 'E', 'F'].map((d, i) => ({ orden: i, descripcionItem: `Producto ${d}` }));
  assert.match(resumenPropuesta(items), / y 2 más$/);
  assert.equal(resumenPropuesta([]), '');
  assert.equal(resumenPropuesta(undefined), '');
});

// ─── Generación real ───────────────────────────────────────────────────────

const COT: CotizacionPdf = {
  numero: 17001,
  creadaEn: '2026-10-01T15:00:00Z',
  cliente: { nombre: 'Cliente de Prueba', telefono: '3001234567', obra: 'Apartamento 502' },
  asesor: 'Asesor de Prueba',
  odpNumero: 'ODP-99999',
};

function propuesta(over: Partial<PropuestaPdf> = {}): PropuestaPdf {
  const items = [VENTANA, ESPEJO];
  const productos = items.reduce((a, it) => a + Number(it.subtotalConAiu), 0);
  const manoObra = 187654.33;
  const descuento = Math.round((productos + manoObra) * 0.05 * 100) / 100;
  const flete = 65000;
  const base = productos + manoObra - descuento;
  const iva = Math.round((base * 0.19 + flete * 0.19) * 100) / 100;
  return {
    id: 1, etiqueta: 'A', nombre: null, descuentoPct: 0.05,
    totales: { productos, manoObra, descuento, cargos: flete, iva, total: base + flete + iva },
    items,
    cargos: [
      { tipo: 'INSTALACION', cantidad: 1, unidad: 'GLOBAL', valorUnitario: manoObra, total: manoObra, aplicaIva: true },
      { tipo: 'FLETE', cantidad: 1, unidad: 'GLOBAL', valorUnitario: flete, total: flete, aplicaIva: true },
    ],
    ...over,
  };
}

const EMPRESA = {
  nombreComercial: 'Vidrios Templex', garantia: 'Garantía de prueba', validezOfertaTexto: 'Validez de prueba',
  condicionesComerciales: ['Primera condición', 'Segunda con **negrilla**'],
};

test('PDF real: archivo válido con folio, ODP, cliente y TOTAL A PAGAR', async () => {
  const p = propuesta();
  const pdf = await generarPdfCotizacion({ cotizacion: COT, propuesta: p, empresa: EMPRESA, ivaPct: 0.19 });
  assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
  const texto = textoDelPdf(pdf);
  for (const esperado of ['COTIZACIÓN', 'COT-17001', '99999', 'Cliente de Prueba', 'TOTAL A PAGAR', 'IVA (19%)']) {
    assert.ok(texto.includes(esperado), `falta "${esperado}" en el PDF`);
  }
  assert.ok(texto.includes(normal(moneda(p.totales.total))), `falta el total ${moneda(p.totales.total)}`);
});

test('PDF real: la mano de obra va DENTRO de los ítems y la columna SUBTOTAL suma el "Subtotal"', async () => {
  const p = propuesta();
  const texto = textoDelPdf(await generarPdfCotizacion({ cotizacion: COT, propuesta: p, empresa: EMPRESA, ivaPct: 0.19 }));
  const valores = valoresConManoObra(p.items!, p.totales.manoObra!)!;
  for (const v of valores) assert.ok(texto.includes(normal(moneda(v))), `falta el subtotal de ítem ${moneda(v)}`);
  assert.ok(texto.includes(normal(moneda(p.totales.productos + p.totales.manoObra!))), 'falta el Subtotal');
  assert.ok(!texto.includes('Subtotal productos'), 'con reparto no hay renglón "Subtotal productos"');
  assert.ok(texto.includes('Flete'), 'los cargos fuera del AIU siguen en renglón propio');
});

test('PDF real: si la mano de obra no se puede repartir, sale en renglón aparte', async () => {
  const p = propuesta({ items: [LIBRE] });
  const texto = textoDelPdf(await generarPdfCotizacion({ cotizacion: COT, propuesta: p, empresa: EMPRESA, ivaPct: 0.19 }));
  assert.ok(texto.includes('Subtotal productos'));
  assert.ok(texto.includes('Instalación'));
});

test('PDF real: con varias opciones, letra en el folio, "Opción A de 2" y las alternativas sin sumar', async () => {
  const otra = propuesta({ id: 2, etiqueta: 'B', nombre: 'Templado 6 mm', items: [{ orden: 0, moduloId: 'ventanas', cantidadPiezas: 2 }] });
  const texto = textoDelPdf(
    await generarPdfCotizacion({ cotizacion: COT, propuesta: propuesta(), otrasPropuestas: [otra], empresa: EMPRESA, ivaPct: 0.19 })
  );
  assert.ok(texto.includes('COT-17001 A'));
  assert.ok(texto.includes('Opción A de 2'));
  assert.ok(texto.includes('OTRAS OPCIONES COTIZADAS'));
  assert.ok(texto.includes('Templado 6 mm'));
});

test('PDF real: sin empresa configurada no revienta y avisa lo pendiente', async () => {
  const texto = textoDelPdf(await generarPdfCotizacion({ cotizacion: COT, propuesta: propuesta(), empresa: null, ivaPct: 0.19 }));
  assert.ok(texto.includes('[Datos bancarios pendientes]'));
  assert.ok(texto.includes('[Garantía pendiente]'));
});
