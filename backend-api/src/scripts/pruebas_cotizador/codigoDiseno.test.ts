// Prueba de codigoDiseno.ts: verifica el parser contra los 138 diseños REALES
// del catálogo, comparando `paneles` contra la suma de `vidrios[].cantidad`
// de cada diseño — la fuente de verdad independiente (cuántos paños de
// vidrio se cortan de verdad), no otro número derivado del propio código.
// Ver la cabecera de codigoDiseno.ts para la explicación completa del bug
// que esto reemplaza.
//
// Lee el JSON de origen y no la base de datos a propósito: es una prueba pura
// del parser, y hacerla depender de Postgres la volvería lenta y frágil por
// motivos que no tienen nada que ver con lo que verifica.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parsearCodigo } from '../../cotizador/lib/codigoDiseno';

interface DisenoOrigen {
  id: string;
  diseno: string;
  modulo: string;
  paneles: number;
  vidrios?: Array<{ cantidad?: number }>;
}

const disenos: DisenoOrigen[] = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'datos_cotizador', 'disenos.json'), 'utf-8')
).disenos;

test('hay 138 diseños en el catálogo (si esto cambia, los números de abajo hay que revisarlos)', () => {
  assert.equal(disenos.length, 138);
});

test('parsearCodigo nunca lanza excepción, con cualquier entrada', () => {
  const entradasRaras = [null, undefined, '', '   ', '___', '123', '90°', 'ñ', 42, {}, [], 'ESP_', '_OX'];
  for (const e of entradasRaras) {
    assert.doesNotThrow(() => parsearCodigo(e, { modulo: 'ventanas' }));
    assert.doesNotThrow(() => parsearCodigo(e));
  }
  for (const d of disenos) {
    assert.doesNotThrow(() => parsearCodigo(d.diseno, { modulo: d.modulo }));
  }
});

test("una entrada no reconocible da confianza:'nula' y filas:[]", () => {
  for (const e of [null, undefined, '', '   ', '___', '123', '90°']) {
    const r = parsearCodigo(e, { modulo: 'ventanas' });
    assert.equal(r.confianza, 'nula', `entrada ${JSON.stringify(e)} debería dar confianza nula`);
    assert.deepEqual(r.filas, []);
    assert.equal(r.paneles, 0);
    assert.equal(r.alas, 0);
  }
});

test('para los 138 diseños reales, paneles del parser === suma de vidrios[].cantidad', () => {
  // Esta es LA verificación pedida: el número de paneles que calcula el
  // parser a partir del código tiene que coincidir con cuántos paños de
  // vidrio trae de verdad el diseño (dato independiente, no derivado del
  // propio código). Coincide en los 138: el mismatches[] de abajo documenta
  // el detalle si algún día deja de ser así (p.ej. si se añade un diseño
  // nuevo al catálogo con un patrón de sufijo no contemplado).
  const mismatches: string[] = [];
  for (const d of disenos) {
    const vidCant = (d.vidrios ?? []).reduce((acc, v) => acc + (v.cantidad ?? 0), 0);
    const r = parsearCodigo(d.diseno, { modulo: d.modulo });
    if (r.confianza !== 'alta' || r.paneles !== vidCant) {
      mismatches.push(
        `${d.id}: parser.paneles=${r.paneles} (confianza=${r.confianza}) vs vidrios=${vidCant}`
      );
    }
  }
  assert.deepEqual(mismatches, [], `${mismatches.length} diseño(s) no coinciden:\n${mismatches.join('\n')}`);
});

test('disenos.json.paneles ya no diverge del parser: la corrección se aplicó a los datos', () => {
  // Esta prueba documentaba el TAMAÑO del bug (43 de 138 diseños tenían el
  // campo `paneles` corrupto por contar letras del sufijo). Ese número era
  // correcto mientras `disenos.json` seguía sin corregir: el bug estaba ya
  // arreglado en `cotizarPorDiseno` (de donde sale el precio), pero no en el
  // dato crudo (de donde sale la leyenda "N cuerpos" del selector), así que el
  // precio y el texto en pantalla decían números distintos para esos 43
  // diseños.
  //
  // Se corrigió después, con un script de una sola pasada que usa este mismo
  // parser (no una reimplementación) para reescribir `paneles`. La invariante
  // correcta de ahora en adelante es CERO discrepancias: si esto vuelve a
  // fallar, es porque se añadió un diseño nuevo al catálogo (o se tocó
  // `disenos.json` a mano) sin pasar por ese mismo parser.
  const divergentes: string[] = [];
  for (const d of disenos) {
    const r = parsearCodigo(d.diseno, { modulo: d.modulo });
    if (r.confianza === 'alta' && r.paneles !== d.paneles) {
      divergentes.push(`${d.id}: disenos.json trae paneles=${d.paneles}, el parser da ${r.paneles}`);
    }
  }
  assert.deepEqual(
    divergentes,
    [],
    `${divergentes.length} diseño(s) con paneles desincronizado:\n${divergentes.join('\n')}`
  );
});

test('M (marco) nunca se cuenta como panel', () => {
  assert.equal(parsearCodigo('MXX', { modulo: 'proyectantes' }).paneles, 2);
  assert.equal(parsearCodigo('MXXX', { modulo: 'ventanas' }).paneles, 3);
  assert.equal(parsearCodigo('MX', { modulo: 'proyectantes' }).paneles, 1);
  assert.equal(parsearCodigo('XM', { modulo: 'proyectantes' }).paneles, 1);
});

test('los sufijos descriptivos no aportan paneles aunque compartan letras del alfabeto', () => {
  const r1 = parsearCodigo('XXX_3P', { modulo: 'ventanas' });
  assert.equal(r1.paneles, 3);
  assert.equal(r1.alas, 3);
  assert.equal(r1.sufijo, '3P');

  const r2 = parsearCodigo('XOX_BOLSILLO_CERROJOPR', { modulo: 'ventanas' });
  assert.equal(r2.paneles, 3);
  assert.equal(r2.sufijo, 'BOLSILLO_CERROJOPR');

  const r3 = parsearCodigo('XXXX_INTERIOR_DOBLE_MARCO', { modulo: 'ventanas' });
  assert.equal(r3.paneles, 4);
  assert.equal(r3.alas, 4);
});

test('dígitos y símbolos tras una letra de panel se descartan', () => {
  assert.equal(parsearCodigo('XOX2', { modulo: 'ventanas' }).paneles, 3);
  assert.equal(parsearCodigo('Z1_CABINA', { modulo: 'cabinas-batientes' }).paneles, 1);
  assert.equal(parsearCodigo('X90°O', { modulo: 'ventanas' }).paneles, 2);
});

test('O_O, O_O_O y OO_OO_OO son las únicas 3 filas reales del catálogo', () => {
  assert.deepEqual(parsearCodigo('O_O', { modulo: 'proyectantes' }).filas, [['O'], ['O']]);
  assert.deepEqual(parsearCodigo('O_O_O', { modulo: 'proyectantes' }).filas, [['O'], ['O'], ['O']]);
  assert.deepEqual(parsearCodigo('OO_OO_OO', { modulo: 'proyectantes' }).filas, [
    ['O', 'O'],
    ['O', 'O'],
    ['O', 'O'],
  ]);
  // Cualquier otro código con "_" NO es una fila: es sufijo, una sola fila.
  assert.equal(parsearCodigo('OX_CABINA', { modulo: 'cabinas-corredizas' }).filas.length, 1);
});

test("espejo: un código ESP_* es un único panel de tipo E, sólo si modulo==='espejo'", () => {
  const r = parsearCodigo('ESP_FLOT_1', { modulo: 'espejo' });
  assert.equal(r.paneles, 1);
  assert.deepEqual(r.filas, [['E']]);
  assert.equal(r.sufijo, 'FLOT_1');

  // Sin el modulo correcto no se activa la regla especial (documentado: es
  // un caso conocido, resuelto en la ruta que sí conoce el módulo del
  // diseño). No debe lanzar de todas formas.
  const sinModulo = parsearCodigo('ESP_FLOT_1');
  assert.equal(sinModulo.confianza, 'alta'); // resuelve por la rama general, no revienta
});

test('alasCorredizas cuenta sólo las X del código real, nunca las del sufijo', () => {
  assert.equal(parsearCodigo('XX_RETICULA_2x5', { modulo: 'ventanas' }).alas, 2);
  assert.equal(parsearCodigo('OXXO_FACHADA_TORINO', { modulo: 'cabinas-corredizas' }).alas, 2);
});
