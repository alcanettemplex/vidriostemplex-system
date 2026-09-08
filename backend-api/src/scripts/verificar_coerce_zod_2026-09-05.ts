/**
 * Verifica que `z.coerce.string().nullable().optional()` (el patrón que ya usa
 * `espesor` en odpItemSchema) sea seguro para pulidos/pulidos_h:
 * debe aceptar números Y conservar null/undefined sin convertirlos a "null".
 * No toca la BD.
 */
import { z } from 'zod';

const actual = z.string().nullable().optional();          // como está hoy
const propuesto = z.coerce.string().nullable().optional(); // como quedaría

const casos: Array<[string, unknown]> = [
  ['número 2 (lo que manda el modal)', 2],
  ['número 0 (campo borrado)', 0],
  ['string "2" (lo que manda ODPForm)', '2'],
  ['string vacío ""', ''],
  ['null', null],
  ['undefined', undefined],
];

console.log('caso'.padEnd(38), '| actual z.string()'.padEnd(26), '| propuesto z.coerce.string()');
console.log('-'.repeat(100));
for (const [nombre, valor] of casos) {
  const a = actual.safeParse(valor);
  const p = propuesto.safeParse(valor);
  const fmt = (r: any) => r.success ? `OK → ${JSON.stringify(r.data)}` : `RECHAZA (${r.error.issues[0].code})`;
  console.log(nombre.padEnd(38), '|', fmt(a).padEnd(24), '|', fmt(p));
}
