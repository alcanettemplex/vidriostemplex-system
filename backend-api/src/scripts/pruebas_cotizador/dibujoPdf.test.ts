// Pruebas del dibujo del anexo del PDF (`cotizador/lib/dibujoPdf.ts`), 2026-10-17.
//
// Funciones puras: no tocan la caché ni Postgres (las correcciones de geometría
// se pasan vacías). Los SVG llevan marcas `data-*` en las piezas que importan
// (marco, riel, bisagra, símbolo) para poder comprobarlas sin interpretar dibujo.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  agruparIdenticos,
  dibujoDeItem,
  leyendaSimbolos,
  paletaDeColor,
  planoDeResultadoGuardado,
  rotuloItems,
  svgDiseno,
  svgPlantaL,
  textoAvisoL,
  type DibujoItem,
  type EntradaAnexo,
} from '../../cotizador/lib/dibujoPdf';

const SIN_OVERRIDES = {};

/** `resultado` guardado mínimo: diseño + medidas (vano y fabricación en cm). */
function resultado(diseno: string, id: string, fab: [number, number], vano: [number, number] | null = null) {
  return {
    diseno: { id, diseno },
    medidas: {
      vano: vano ? { anchoCm: vano[0], altoCm: vano[1] } : null,
      fabricacion: { anchoCm: fab[0], altoCm: fab[1] },
    },
    cortes: { vidrios: [] },
  };
}

const R_VENTANA = resultado('OX', 'Sistema8025::OX', [149.6, 99.5], [150, 100]);
const R_PLEGABLE = resultado('PP_PLEGABLE', 'Cabina Batiente::PP_PLEGABLE', [120, 190]);
const R_CORREDIZA = resultado('OX_CABINA', 'Cabina Corrediza::OX_CABINA', [130, 180]);
const R_CORREDIZA_MARCO = resultado('XO_CABINA_MARCO', 'Cabina Corrediza::XO_CABINA_MARCO', [130, 180]);

const dibujo = (moduloId: string, input: Record<string, unknown>, r: unknown): DibujoItem => {
  const d = dibujoDeItem(moduloId, input, r as never, SIN_OVERRIDES);
  assert.ok(d, 'debería poder dibujarse');
  return d;
};

// ─── Plano de un ítem guardado ─────────────────────────────────────────────

test('plano guardado: sin diseño o sin medida de fabricación devuelve el error del endpoint', () => {
  assert.match(String((planoDeResultadoGuardado({}, SIN_OVERRIDES) as { error: string }).error), /medidas libres/);
  const sinFab = { diseno: { id: 'Sistema8025::OX', diseno: 'OX' }, medidas: { fabricacion: null } };
  assert.match(String((planoDeResultadoGuardado(sinFab, SIN_OVERRIDES) as { error: string }).error), /fabricación/);
});

test('plano guardado: un OX da dos paneles, fijo y corredizo, a la medida de fabricación', () => {
  const r = planoDeResultadoGuardado(R_VENTANA, SIN_OVERRIDES);
  assert.ok('plano' in r);
  assert.deepEqual(r.plano.paneles.map((p) => p.tipo), ['O', 'X']);
  assert.equal(r.plano.exterior.anchoMm, 1496);
});

// ─── Datos del dibujo ──────────────────────────────────────────────────────

test('sin diseño no hay dibujo (el ítem no sale en el anexo)', () => {
  assert.equal(dibujoDeItem('espejo', { anchoCm: 100, altoCm: 150 }, null, SIN_OVERRIDES), null);
  assert.equal(dibujoDeItem('item-libre', {}, undefined, SIN_OVERRIDES), null);
});

test('cotas: la medida que escribió el asesor (vano), no la de fabricación', () => {
  const d = dibujo('ventanas', { colorPerfileria: 'negro' }, R_VENTANA);
  assert.equal(d.cotaAnchoMm, 1500);
  assert.equal(d.cotaAltoMm, 1000);
  assert.equal(d.tipo, 'ventana');
  assert.equal(d.color, 'negro');
});

test('cotas: si el asesor escribió la medida de fabricación, se usa esa', () => {
  const d = dibujo('ventanas', {}, resultado('OX', 'Sistema8025::OX', [149.6, 99.5]));
  assert.equal(d.cotaAnchoMm, 1496);
});

test('"Abre hacia" solo cuenta en Cabinas batientes', () => {
  assert.equal(dibujo('cabinas-batientes', { abreHacia: 'derecha' }, R_PLEGABLE).apertura, 'derecha');
  assert.equal(dibujo('cabinas-batientes', { abreHacia: 'IZQUIERDA' }, R_PLEGABLE).apertura, 'izquierda');
  assert.equal(dibujo('cabinas-batientes', {}, R_PLEGABLE).apertura, null);
  assert.equal(dibujo('cabinas-batientes', { abreHacia: 'arriba' }, R_PLEGABLE).apertura, null);
  assert.equal(dibujo('ventanas', { abreHacia: 'derecha' }, R_VENTANA).apertura, null);
});

test('cabina en L: con lado Y lo guarda en mm; sin él, null; una ventana nunca es en L', () => {
  const conY = dibujo('cabinas-corredizas', { enL: true, ladoYCm: 90 }, R_CORREDIZA);
  assert.equal(conY.enL, true);
  assert.equal(conY.ladoYMm, 900);
  const sinY = dibujo('cabinas-batientes', { enL: 'true' }, R_PLEGABLE);
  assert.equal(sinY.enL, true);
  assert.equal(sinY.ladoYMm, null);
  assert.equal(dibujo('cabinas-corredizas', { enL: false, ladoYCm: 90 }, R_CORREDIZA).ladoYMm, null);
  assert.equal(dibujo('ventanas', { enL: true }, R_VENTANA).enL, false);
});

// ─── SVG ───────────────────────────────────────────────────────────────────

test('ventana: marco del color cotizado y cotas con la medida del asesor', () => {
  const svg = svgDiseno(dibujo('ventanas', { colorPerfileria: 'negro' }, R_VENTANA));
  assert.match(svg, /^<svg [^>]*viewBox=/);
  assert.match(svg, /data-marco="1"[^>]*fill="#2B2E31"/);
  assert.match(svg, />1\.500 mm</);
  assert.match(svg, />1\.000 mm</);
  assert.match(svg, />FIJO</);
  assert.match(svg, /data-simbolo="corrediza"/);
});

test('color: cada opción del formulario tiene su paleta; uno desconocido cae en mate', () => {
  const marcos = ['mate', 'bronce', 'gris plata', 'blanco', 'crudo', 'negro'].map((c) => paletaDeColor(c).marco);
  assert.equal(new Set(marcos).size, 6);
  assert.equal(paletaDeColor('Gris-Plata').marco, paletaDeColor('gris plata').marco);
  assert.equal(paletaDeColor('morado').marco, paletaDeColor('mate').marco);
  assert.equal(paletaDeColor(null).marco, paletaDeColor('mate').marco);
});

test('cabina batiente: solo vidrio, con bisagras y símbolo hacia el lado elegido', () => {
  const svg = svgDiseno(dibujo('cabinas-batientes', { abreHacia: 'derecha' }, R_PLEGABLE));
  assert.doesNotMatch(svg, /data-marco/);
  assert.doesNotMatch(svg, /data-riel/);
  assert.equal((svg.match(/data-simbolo="apertura-derecha"/g) ?? []).length, 2, 'las dos hojas del plegable');
  assert.equal((svg.match(/data-bisagra/g) ?? []).length, 4, 'dos bisagras por hoja');
});

test('cabina batiente sin "Abre hacia": sin símbolo de apertura ni bisagras', () => {
  const svg = svgDiseno(dibujo('cabinas-batientes', {}, R_PLEGABLE));
  assert.doesNotMatch(svg, /data-simbolo="apertura/);
  assert.doesNotMatch(svg, /data-bisagra/);
});

test('cabina corrediza: riel superior y sin marco; la variante _MARCO sí lleva marco', () => {
  const corrediza = svgDiseno(dibujo('cabinas-corredizas', {}, R_CORREDIZA));
  assert.match(corrediza, /data-riel="1"/);
  assert.doesNotMatch(corrediza, /data-marco/);
  assert.match(corrediza, /data-simbolo="corrediza"/);
  assert.match(svgDiseno(dibujo('cabinas-corredizas', {}, R_CORREDIZA_MARCO)), /data-marco="1"/);
});

test('vista desde arriba de la L: con lado Y lleva las dos medidas; sin él, "Costado" sin número', () => {
  const conY = svgPlantaL(1300, 900);
  assert.match(conY, /Frente X · 1\.300 mm/);
  assert.match(conY, /Costado Y · 900 mm/);
  const sinY = svgPlantaL(880, null);
  assert.match(sinY, />Costado</);
  assert.doesNotMatch(sinY, /Costado Y/);
});

test('aviso de la L: dice qué se dibuja y qué no', () => {
  assert.equal(
    textoAvisoL(1300, 900),
    'El dibujo muestra solo el frente (lado X, 1.300 mm). El costado (lado Y, 900 mm) va a 90° y no se dibuja.'
  );
  assert.equal(textoAvisoL(880, null), 'El dibujo muestra solo el frente; el costado va a 90° y no se dibuja.');
});

test('leyenda: solo los símbolos que aparecen; una hoja sin "Abre hacia" no la agrega', () => {
  const textos = (ds: DibujoItem[]) => leyendaSimbolos(ds).map((l) => l.texto);
  assert.deepEqual(textos([dibujo('ventanas', {}, R_VENTANA)]), ['Hoja corrediza', 'Paño fijo']);
  assert.deepEqual(textos([dibujo('cabinas-batientes', {}, R_PLEGABLE)]), []);
  assert.deepEqual(textos([dibujo('cabinas-batientes', { abreHacia: 'izquierda' }, R_PLEGABLE)]), ['Hoja que abre: la punta señala la bisagra']);
});

// ─── Agrupar idénticos ─────────────────────────────────────────────────────

function entrada(numero: number, moduloId: string, input: Record<string, unknown>, r: unknown, cantidadPiezas = 1): EntradaAnexo {
  return { numero, moduloId, input, resultado: r as never, cantidadPiezas, dibujo: dibujo(moduloId, input, r) };
}

const PLEGABLE = { anchoCm: 120, altoCm: 190, espesorVidrioMm: 8, disenoId: 'Cabina Batiente::PP_PLEGABLE', conInstalacion: true };

test('idénticos con distinta ubicación: una tarjeta con los números, las unidades y las ubicaciones', () => {
  const grupos = agruparIdenticos([
    entrada(1, 'ventanas', { colorPerfileria: 'mate' }, R_VENTANA),
    entrada(3, 'cabinas-batientes', { ...PLEGABLE, abreHacia: 'derecha', descripcionItem: 'Baño principal' }, R_PLEGABLE),
    entrada(4, 'cabinas-batientes', { ...PLEGABLE, abreHacia: 'derecha', descripcionItem: 'Baño social' }, R_PLEGABLE, 2),
  ]);
  assert.equal(grupos.length, 2);
  assert.deepEqual(grupos[0].numeros, [1], 'conserva el orden de la tabla');
  assert.deepEqual(grupos[1].numeros, [3, 4]);
  assert.equal(grupos[1].piezas, 3);
  assert.deepEqual(grupos[1].ubicaciones, ['Baño principal', 'Baño social']);
});

test('no se agrupan si cambia la apertura, el color, la medida, la L o la descripción', () => {
  const base = entrada(1, 'cabinas-batientes', { ...PLEGABLE, abreHacia: 'derecha' }, R_PLEGABLE);
  const variantes = [
    entrada(2, 'cabinas-batientes', { ...PLEGABLE, abreHacia: 'izquierda' }, R_PLEGABLE),
    entrada(3, 'cabinas-batientes', { ...PLEGABLE, abreHacia: 'derecha', enL: true }, R_PLEGABLE),
    entrada(4, 'cabinas-batientes', { ...PLEGABLE, abreHacia: 'derecha', espesorVidrioMm: 10 }, R_PLEGABLE),
    entrada(5, 'cabinas-batientes', { ...PLEGABLE, abreHacia: 'derecha' }, resultado('PP_PLEGABLE', 'Cabina Batiente::PP_PLEGABLE', [100, 190])),
  ];
  for (const v of variantes) assert.equal(agruparIdenticos([base, v]).length, 2, `ítem ${v.numero}`);
  const negro = entrada(6, 'ventanas', { colorPerfileria: 'negro' }, R_VENTANA);
  const mate = entrada(7, 'ventanas', { colorPerfileria: 'mate' }, R_VENTANA);
  assert.equal(agruparIdenticos([negro, mate]).length, 2);
});

test('rótulo de la tarjeta: "ÍTEM 3", "ÍTEMS 3 Y 4", "ÍTEMS 2, 5 Y 7"', () => {
  assert.equal(rotuloItems([3]), 'ÍTEM 3');
  assert.equal(rotuloItems([3, 4]), 'ÍTEMS 3 Y 4');
  assert.equal(rotuloItems([2, 5, 7]), 'ÍTEMS 2, 5 Y 7');
});
