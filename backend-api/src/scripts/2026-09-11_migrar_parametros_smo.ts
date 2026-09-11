// Un SMO por TIPO DE OBRA — agrega a `cotizador_parametro` las 6 columnas que
// faltaban y corrige el flete.
//
// El Excel original (hoja COSTOS, tabla "GASTOS DE INSTALACION", Z27:AC38) NO
// cobra un Servicio Mínimo de Obra único: cobra uno por tipo de obra. La webapp
// modeló uno solo (`smo_tarifa_minima` = 58.000), así que hasta hoy cobraba lo
// mismo instalar una cabina (120.000) que armar una ventana (60.000). Lo mismo
// con dos conceptos que el Excel cobra y la app no tenía: alquiler de andamio
// (ALQU36) y huacal (HUAC06).
//
// Por qué un script y no `sync({ alter: true })`: `cotizador_parametro` es una
// fila única ya poblada en producción, y `sync({ alter: false })` —lo que corre
// al arrancar— no agrega columnas a tablas existentes. Sin este ALTER, el
// SELECT de la caché pediría columnas inexistentes y el módulo Cotizador
// arrancaría indisponible.
//
// Idempotente: `ADD COLUMN IF NOT EXISTS` y un UPDATE condicionado al valor
// viejo, así que se puede correr dos veces sin efecto y sin pisar una edición
// posterior hecha desde la app.
//
// Ejecutar UNA vez por entorno (local / Supabase de producción):
//   npx ts-node src/scripts/2026-09-11_migrar_parametros_smo.ts
import { sequelize } from '../models';

/** Valores del Excel, hoja COSTOS, tabla "GASTOS DE INSTALACION" (Z27:AC38). */
const COLUMNAS_NUEVAS = [
  { columna: 'smo_cabinas', codigo: 'SMO01', concepto: 'SMO Cabinas', valor: 120000 },
  { columna: 'smo_fachadas', codigo: 'SMO02', concepto: 'SMO Fachadas', valor: 85000 },
  { columna: 'smo_armada_ventanas', codigo: 'SMO03', concepto: 'SMO solo armada ventanas', valor: 60000 },
  { columna: 'smo_persiana', codigo: 'SMO04', concepto: 'SMO Persiana', valor: 110000 },
  { columna: 'alquiler_andamio', codigo: 'ALQU36', concepto: 'Alquiler andamio', valor: 90000 },
  { columna: 'huacal', codigo: 'HUAC06', concepto: 'Huacal', valor: 80000 },
] as const;

/** GTFA26 — gastos de fletes y acarreos. La app quedó en 25.000; el Excel cobra
 * 40.000. Sólo se corrige si sigue en el valor viejo: si alguien ya lo editó
 * desde la pantalla de parámetros, su decisión manda sobre esta migración. */
const FLETE_VIEJO = 25000;
const FLETE_EXCEL = 40000;

type FilaColumna = { column_name: string };
type FilaFlete = { flete_fijo: string | number };

async function columnasExistentes(): Promise<Set<string>> {
  const [filas] = await sequelize.query(`
    SELECT column_name
      FROM information_schema.columns
     WHERE table_name = 'cotizador_parametro';
  `);
  return new Set((filas as FilaColumna[]).map((f) => f.column_name));
}

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Conexión OK');

    const antes = await columnasExistentes();
    const porAgregar = COLUMNAS_NUEVAS.filter((c) => !antes.has(c.columna));
    if (porAgregar.length === 0) {
      console.log('… las 6 columnas de SMO/andamio/huacal ya existen — nada que agregar');
    } else {
      console.log(`Faltan ${porAgregar.length} columna(s): ${porAgregar.map((c) => c.columna).join(', ')}`);
    }

    // Un solo ALTER con las 6 cláusulas: PostgreSQL lo resuelve en una sola
    // reescritura de catálogo y un único lock sobre la tabla.
    await sequelize.query(`
      ALTER TABLE cotizador_parametro
        ADD COLUMN IF NOT EXISTS smo_cabinas         DOUBLE PRECISION NOT NULL DEFAULT 120000,
        ADD COLUMN IF NOT EXISTS smo_fachadas        DOUBLE PRECISION NOT NULL DEFAULT 85000,
        ADD COLUMN IF NOT EXISTS smo_armada_ventanas DOUBLE PRECISION NOT NULL DEFAULT 60000,
        ADD COLUMN IF NOT EXISTS smo_persiana        DOUBLE PRECISION NOT NULL DEFAULT 110000,
        ADD COLUMN IF NOT EXISTS alquiler_andamio    DOUBLE PRECISION NOT NULL DEFAULT 90000,
        ADD COLUMN IF NOT EXISTS huacal              DOUBLE PRECISION NOT NULL DEFAULT 80000;
    `);

    const despues = await columnasExistentes();
    for (const c of COLUMNAS_NUEVAS) {
      const estado = antes.has(c.columna) ? 'ya existía' : `agregada (DEFAULT ${c.valor})`;
      const ok = despues.has(c.columna) ? '✓' : '✗';
      console.log(`${ok} ${c.columna.padEnd(20)} ${c.codigo.padEnd(7)} ${c.concepto.padEnd(28)} — ${estado}`);
    }

    // Flete: se lee antes y después para poder reportar qué pasó de verdad.
    const [filasAntes] = await sequelize.query(
      'SELECT flete_fijo FROM cotizador_parametro WHERE id = 1;'
    );
    const fleteAntes = (filasAntes as FilaFlete[])[0]?.flete_fijo;
    if (fleteAntes === undefined) {
      console.log('⚠ no existe la fila id=1 de cotizador_parametro — el UPDATE del flete no aplica');
    } else {
      const [, meta] = await sequelize.query(
        `UPDATE cotizador_parametro
            SET flete_fijo = ${FLETE_EXCEL}
          WHERE id = 1 AND flete_fijo = ${FLETE_VIEJO};`
      );
      const afectadas = (meta as unknown as { rowCount?: number })?.rowCount ?? 0;
      if (afectadas > 0) {
        console.log(`✓ flete_fijo        GTFA26  Gastos fletes y acarreos     — ${FLETE_VIEJO} → ${FLETE_EXCEL}`);
      } else {
        console.log(
          `… flete_fijo sin tocar: vale ${fleteAntes}, no ${FLETE_VIEJO} ` +
            '(ya migrado o editado a mano desde la app — no se pisa)'
        );
      }
    }

    console.log('\nMigración de parámetros SMO completada.');
    console.log('Recordá reiniciar el backend: la caché del Cotizador lee estas columnas al arrancar.');
  } catch (err) {
    console.error('Error migrando los parámetros del cotizador:', err);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

run();
