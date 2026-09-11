// Refresca el catálogo de precios del Cotizador (cotizador_producto) desde
// src/scripts/datos_cotizador/catalogo.json, que fue regenerado el 2026-09-11
// contra la versión vigente del Excel de costos.
//
// POR QUÉ: el catálogo se sembró una sola vez (script 2026-09-07) desde una
// versión vieja del Excel. Desde entonces cambiaron tanto los factores de
// margen como el costo base de compra, así que 415 de los 430 códigos tenían
// un precio distinto al real. Este script pone la BD al día sin volver a
// correr la siembra completa (que además pisaría diseños y parámetros).
//
// QUÉ TOCA — y qué no:
//   - cotizador_producto SOLO en las filas con origen = 'CATALOGO'. Un código
//     del JSON que en BD figure como 'PROVISIONAL' o 'ALTA' se reporta y se
//     SALTA: esas filas tienen dueño distinto y no las gobierna el Excel.
//   - cotizador_precio_override: NUNCA. Es la capa de ediciones humanas que se
//     aplica encima del catálogo; pisarla borraría decisiones comerciales.
//   - cotizador_precio_historial: tampoco. El historial registra ediciones
//     hechas desde la pantalla de precios (las escribe el controlador a mano,
//     no un hook); un refresco masivo del catálogo base no es una de ellas.
//
// REGLA DE ORO (ya aplicada al construir el JSON, se re-verifica acá):
// nunca degradar un precio vivo a cero. Hay 15 códigos que el Excel no puede
// derivar —costo vacío, "depende medida" o costo 0— y el JSON conserva para
// ellos el valor que ya tenía el catálogo. Tres de esos 15 tienen precio real
// en BD (ES0001, TOA0901, BR6MM02TE) y ES0001 es el único código de espejo:
// si quedara en 0, el módulo Espejo cotizaría en cero.
//
// Se escribe con bulkCreate + updateOnDuplicate, igual que la siembra: los
// hooks de instancia no disparan en bulk, así que un refresco de 415 filas no
// inunda auditoria_log con movimientos sin usuario responsable. El filtro por
// origen se hace en memoria, antes de escribir, justamente porque el UPSERT
// por PK no distingue origen.
//
// Idempotente: correrlo dos veces seguidas reporta 0 actualizados la segunda.
//
// NO se ejecuta con `npm run dev`. Correr a mano, una vez, tras desplegar:
//   npx ts-node src/scripts/2026-09-11_regenerar_catalogo_cotizador.ts
import * as fs from 'fs';
import * as path from 'path';
import { Transaction } from 'sequelize';
import { sequelize, CotizadorProducto } from '../models';

const DATOS_DIR = path.join(__dirname, 'datos_cotizador');

// `type` y no `interface` a propósito: bulkCreate espera Optional<any, string>,
// que exige índice implícito. Un alias de tipo lo tiene; una interfaz no, y el
// literal se rechaza con TS2345.
/** Forma exacta de cada entrada de catalogo.json. */
type FilaCatalogo = {
  codigo: string;
  descripcion: string;
  categoria: string;
  unidad: string;
  costo_unitario: number;
  precio_pa: number;
  precio_pm: number;
  precio_pb: number;
};

/** Columnas que leemos de cotizador_producto para decidir si hay cambio. */
type FilaBD = FilaCatalogo & { origen: string };

/** Campos que este script actualiza. El resto de la fila queda intacto. */
const CAMPOS_ACTUALIZABLES = [
  'descripcion',
  'categoria',
  'unidad',
  'costo_unitario',
  'precio_pa',
  'precio_pm',
  'precio_pb',
] as const;

// Los 15 códigos sin precio derivable del Excel. La lista se mantiene acá solo
// para reportarlos; el JSON ya trae el valor conservado.
const CODIGOS_REGLA_DE_ORO = [
  '1BOQN02', '1BPB10', '1BPB07', 'CM572A', 'ES0001',
  'KDE0303', 'KDE0304', 'KVE001', '1PERF01', 'SDR0301',
  'TOA0901', 'BR6MM02TE', 'CL4MM08SP', 'CL4MM03LM', 'CL6MM08SP',
];

const MONEDA = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

/** DOUBLE no debería perder precisión, pero no comparamos flotantes con ===. */
function numIguales(a: number, b: number): boolean {
  return Math.abs((a ?? 0) - (b ?? 0)) < 1e-9;
}

function hayCambio(json: FilaCatalogo, bd: FilaBD): boolean {
  return CAMPOS_ACTUALIZABLES.some((campo) => {
    const nuevo = json[campo];
    const viejo = bd[campo];
    return typeof nuevo === 'number' && typeof viejo === 'number'
      ? !numIguales(nuevo, viejo)
      : nuevo !== viejo;
  });
}

function leerCatalogo(): FilaCatalogo[] {
  const texto = fs.readFileSync(path.join(DATOS_DIR, 'catalogo.json'), 'utf8');
  const filas = JSON.parse(texto) as FilaCatalogo[];

  // Guardas sobre el archivo de entrada: es la única validación que queda
  // entre un JSON mal generado y 430 precios pisados en producción.
  if (!Array.isArray(filas) || filas.length < 430) {
    throw new Error(`catalogo.json trae ${Array.isArray(filas) ? filas.length : 'no-array'} entradas; se esperaban >= 430`);
  }
  const duplicados = filas.map((f) => f.codigo).filter((c, i, arr) => arr.indexOf(c) !== i);
  if (duplicados.length > 0) {
    throw new Error(`catalogo.json trae códigos duplicados: ${duplicados.join(', ')}`);
  }
  for (const f of filas) {
    if (!f.codigo || !f.descripcion || !f.categoria) {
      throw new Error(`catalogo.json: fila incompleta en ${f.codigo ?? '(sin código)'}`);
    }
    if (![f.costo_unitario, f.precio_pa, f.precio_pm, f.precio_pb].every((n) => typeof n === 'number' && isFinite(n) && n >= 0)) {
      throw new Error(`catalogo.json: precios no numéricos o negativos en ${f.codigo}`);
    }
  }
  return filas;
}

async function regenerar(t: Transaction) {
  const catalogo = leerCatalogo();

  // `raw: true` devuelve objetos planos; el modelo no declara atributos
  // tipados (class CotizadorProducto extends Model {}), así que Sequelize los
  // tipa como Model[]. El doble cast es la forma sin `any` de nombrar la forma
  // que sabemos que tienen las columnas seleccionadas.
  const enBD = await CotizadorProducto.findAll({
    attributes: ['codigo', 'descripcion', 'categoria', 'unidad', 'costo_unitario', 'precio_pa', 'precio_pm', 'precio_pb', 'origen'],
    raw: true,
    transaction: t,
  }) as unknown as FilaBD[];
  const porCodigo = new Map(enBD.map((f) => [f.codigo, f]));

  const aEscribir: (FilaCatalogo & { origen: 'CATALOGO'; provisional: false })[] = [];
  const nuevos: string[] = [];
  const actualizados: { codigo: string; antes: number; despues: number }[] = [];
  const ajenos: { codigo: string; origen: string }[] = [];
  let sinCambio = 0;

  for (const fila of catalogo) {
    const bd = porCodigo.get(fila.codigo);

    if (bd && bd.origen !== 'CATALOGO') {
      // No es nuestro: lo administra la pantalla de altas o la migración de
      // provisionales. El Excel no manda sobre él.
      ajenos.push({ codigo: fila.codigo, origen: bd.origen });
      continue;
    }

    if (!bd) nuevos.push(fila.codigo);
    else if (hayCambio(fila, bd)) actualizados.push({ codigo: fila.codigo, antes: bd.precio_pa, despues: fila.precio_pa });
    else { sinCambio++; continue; } // idempotencia: nada que escribir

    aEscribir.push({ ...fila, origen: 'CATALOGO', provisional: false });
  }

  if (aEscribir.length > 0) {
    await CotizadorProducto.bulkCreate(aEscribir, {
      updateOnDuplicate: [...CAMPOS_ACTUALIZABLES],
      transaction: t,
    });
  }

  return { catalogo, enBD, porCodigo, nuevos, actualizados, ajenos, sinCambio };
}

function imprimirReporte(r: Awaited<ReturnType<typeof regenerar>>) {
  const { catalogo, porCodigo, nuevos, actualizados, ajenos, sinCambio } = r;

  console.log('\n═══ Regeneración del catálogo del Cotizador ═══');
  console.log(`  Entradas en catalogo.json : ${catalogo.length}`);
  console.log(`  Actualizados              : ${actualizados.length}`);
  console.log(`  Sin cambio                : ${sinCambio}`);
  console.log(`  Nuevos (insertados)       : ${nuevos.length}${nuevos.length ? ' → ' + nuevos.join(', ') : ''}`);
  console.log(`  Saltados por origen ≠ CATALOGO : ${ajenos.length}`);
  for (const a of ajenos) console.log(`      ⚠ ${a.codigo} (origen=${a.origen}) — no se tocó`);

  console.log('\n  Regla de oro — códigos sin precio derivable del Excel,');
  console.log('  conservados con el valor que ya tenía el catálogo:');
  for (const codigo of CODIGOS_REGLA_DE_ORO) {
    const json = catalogo.find((f) => f.codigo === codigo);
    const bd = porCodigo.get(codigo);
    if (!json) { console.log(`      ✗ ${codigo.padEnd(11)} NO está en catalogo.json`); continue; }
    const vivo = json.precio_pa > 0;
    const marca = vivo ? '●' : '○';
    const valor = vivo ? `pa = $${MONEDA.format(json.precio_pa)}` : 'sin precio en ninguna de las dos fuentes';
    const alerta = vivo && bd && bd.origen === 'CATALOGO' && bd.precio_pa > 0 && !numIguales(bd.precio_pa, json.precio_pa)
      ? '  ⚠ DIFIERE DE LA BD' : '';
    console.log(`      ${marca} ${codigo.padEnd(11)} ${valor}${alerta}`);
  }
  console.log('      ● = precio vivo que se protegió   ○ = ya estaba en 0 en ambas fuentes');

  if (actualizados.length > 0) {
    const mayores = [...actualizados]
      .filter((a) => a.antes > 0)
      .sort((x, y) => Math.abs((y.despues - y.antes) / y.antes) - Math.abs((x.despues - x.antes) / x.antes))
      .slice(0, 10);
    console.log('\n  Mayores variaciones de precio_pa:');
    for (const m of mayores) {
      const pct = ((m.despues - m.antes) / m.antes) * 100;
      console.log(`      ${m.codigo.padEnd(11)} $${MONEDA.format(m.antes).padStart(11)} → $${MONEDA.format(m.despues).padStart(11)}  (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`);
    }
  }

  console.log('\n  cotizador_precio_override: intacta (no la toca este script).');
  console.log('═══════════════════════════════════════════════\n');
}

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Conexión OK');

    const resultado = await sequelize.transaction(async (t) => regenerar(t));
    imprimirReporte(resultado);

    console.log('Catálogo del Cotizador regenerado. Reiniciar el backend para que el caché de precios recargue.');
  } catch (err) {
    console.error('Error regenerando el catálogo del cotizador:', err);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

run();
