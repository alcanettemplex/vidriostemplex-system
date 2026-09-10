// Etapa 2 del módulo Cotizador — sonda previa al port de los motores.
//
// Comprueba dos cosas antes de escribir una sola línea de motor:
//
// 1. Que ninguna columna de las 21 tablas cotizador_* sea `numeric`. El driver
//    `pg` devuelve NUMERIC como STRING, y los motores portados suman y
//    multiplican sin validar tipos: una sola columna numeric produciría
//    concatenación silenciosa ("32443.65" + "0.5" = "32443.650.5") o NaN, sin
//    lanzar ningún error. Es el bug más probable de todo el port.
//
// 2. Que las 5 tablas de calibración estén vacías. El golden master compara el
//    port contra el proyecto standalone, cuyo calibracion.json está vacío; si
//    aquí hubiera márgenes u holguras vigentes, los despieces diferirían por un
//    motivo legítimo y la comparación no probaría nada.
//
// Uso: npx ts-node src/scripts/2026-09-09_sonda_tipos_cotizador.ts
import { sequelize } from '../models';

const TABLAS_CALIBRACION = [
  'cotizador_calibracion_margen',
  'cotizador_calibracion_holgura',
  'cotizador_calibracion_contraste',
  'cotizador_calibracion_sistema',
  'cotizador_calibracion_historial',
];

async function main() {
  let fallos = 0;

  // ─── 1. Tipos numéricos ────────────────────────────────────────────────────
  const [columnas] = await sequelize.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name LIKE 'cotizador_%'
    ORDER BY table_name, ordinal_position;
  `);
  const cols = columnas as Array<{ table_name: string; column_name: string; data_type: string }>;

  const tablas = new Set(cols.map((c) => c.table_name));
  console.log(`Tablas cotizador_* encontradas: ${tablas.size} (esperadas 21)`);
  if (tablas.size !== 21) {
    console.error(`  ✗ Se esperaban 21 tablas, hay ${tablas.size}`);
    fallos++;
  }

  const numericas = cols.filter((c) => c.data_type === 'numeric');
  if (numericas.length > 0) {
    console.error(`  ✗ ${numericas.length} columnas NUMERIC (pg las devuelve como string):`);
    for (const c of numericas) console.error(`      ${c.table_name}.${c.column_name}`);
    fallos++;
  } else {
    console.log('  ✓ Cero columnas NUMERIC');
  }

  const dobles = cols.filter((c) => c.data_type === 'double precision').length;
  console.log(`  ✓ ${dobles} columnas double precision`);

  // ─── 2. Calibración vacía ──────────────────────────────────────────────────
  console.log('\nTablas de calibración (deben estar vacías para el golden master):');
  for (const tabla of TABLAS_CALIBRACION) {
    const [filas] = await sequelize.query(`SELECT count(*)::int AS n FROM ${tabla};`);
    const n = (filas as Array<{ n: number }>)[0].n;
    if (n === 0) {
      console.log(`  ✓ ${tabla}: vacía`);
    } else {
      console.error(`  ✗ ${tabla}: ${n} filas — el golden master no sería comparable`);
      fallos++;
    }
  }

  // ─── 3. Muestra de round-trip de tipos en runtime ──────────────────────────
  // Confirma que Sequelize entrega number, no string, en una lectura real.
  const [muestra] = await sequelize.query(`
    SELECT precio_pa, costo_unitario FROM cotizador_producto
    WHERE precio_pa > 0 ORDER BY codigo LIMIT 1;
  `);
  const fila = (muestra as Array<{ precio_pa: unknown; costo_unitario: unknown }>)[0];
  console.log('\nTipos en runtime:');
  for (const [campo, valor] of Object.entries(fila)) {
    const ok = typeof valor === 'number';
    console.log(`  ${ok ? '✓' : '✗'} ${campo}: ${typeof valor} (${valor})`);
    if (!ok) fallos++;
  }

  await sequelize.close();
  if (fallos > 0) {
    console.error(`\n✗ SONDA FALLIDA: ${fallos} problema(s). No portar motores hasta resolverlos.`);
    process.exit(1);
  }
  console.log('\n✓ Terreno despejado para el port de los motores.');
}

main().catch((e) => {
  console.error('Error en la sonda:', e);
  process.exit(1);
});
