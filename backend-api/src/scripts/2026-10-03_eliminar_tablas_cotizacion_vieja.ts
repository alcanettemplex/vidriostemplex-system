// Borra las dos tablas del COTModal viejo: `public.cotizacion` y
// `public.cotizacion_items` (decisión del usuario, 2026-10-03).
//
// El código que las usaba (modelo, controlador, rutas /api/cotizaciones y
// /api/documentos/cotizacion*, COTModal, página y slice) se retiró el
// 2026-10-03. Nunca guardaron una fila: las cotizaciones viven en el Cotizador
// (schema `cotizador`). El usuario pidió dejar las tablas un tiempo y borrarlas
// cuando confirme que producción no extraña nada — por eso es un script aparte.
//
// Protecciones, todas antes de escribir:
//   1. Las dos tablas deben tener 0 filas. Si alguna tiene datos, aborta.
//   2. Ninguna otra tabla puede tener una FK que apunte a ellas (salvo
//      cotizacion_items → cotizacion, que se va con ellas). Si aparece una, aborta.
//   3. Idempotente: si ya no existen, no hace nada.
// Antes de borrar imprime las columnas de cada tabla, como registro.
//
// Por defecto solo previsualiza; `--aplicar` escribe. NO corre con `npm run dev`:
//   npx ts-node --files src/scripts/2026-10-03_eliminar_tablas_cotizacion_vieja.ts [--aplicar]
import { QueryTypes } from 'sequelize';
import { sequelize } from '../models';

const APLICAR = process.argv.includes('--aplicar');
const TABLAS = ['cotizacion_items', 'cotizacion']; // hija primero

async function main(): Promise<void> {
  const existentes = await sequelize.query<{ tabla: string }>(
    `SELECT tablename AS tabla FROM pg_tables WHERE schemaname = 'public' AND tablename IN (:tablas)`,
    { replacements: { tablas: TABLAS }, type: QueryTypes.SELECT }
  );
  if (existentes.length === 0) {
    console.log('Las dos tablas ya no existen. Nada que hacer.');
    return;
  }

  for (const { tabla } of existentes) {
    const [{ n }] = await sequelize.query<{ n: number }>(`SELECT count(*)::int AS n FROM public."${tabla}"`, {
      type: QueryTypes.SELECT,
    });
    if (n > 0) throw new Error(`public.${tabla} tiene ${n} fila(s): no se borra. Revisa de dónde salieron.`);
    console.log(`public.${tabla}: 0 filas ✓`);
  }

  const fksExternas = await sequelize.query<{ tabla: string; restriccion: string }>(
    `SELECT conrelid::regclass::text AS tabla, conname AS restriccion
       FROM pg_constraint
      WHERE contype = 'f'
        AND confrelid IN (SELECT ('public.' || t)::regclass FROM unnest(ARRAY[:tablas]::text[]) AS t
                           WHERE to_regclass('public.' || t) IS NOT NULL)
        AND conrelid::regclass::text NOT IN (:tablas)`,
    { replacements: { tablas: TABLAS }, type: QueryTypes.SELECT }
  );
  if (fksExternas.length > 0) {
    throw new Error(
      `Otras tablas dependen de estas: ${fksExternas.map((f) => `${f.tabla} (${f.restriccion})`).join(', ')}. No se borra.`
    );
  }
  console.log('Ninguna otra tabla las referencia ✓');

  for (const { tabla } of existentes) {
    const columnas = await sequelize.query<{ columna: string; tipo: string; nulo: string }>(
      `SELECT column_name AS columna, data_type AS tipo, is_nullable AS nulo
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = :tabla ORDER BY ordinal_position`,
      { replacements: { tabla }, type: QueryTypes.SELECT }
    );
    console.log(`\nEstructura de public.${tabla} (registro):`);
    console.table(columnas);
  }

  if (!APLICAR) {
    console.log('\nSimulación: no se borró nada. Corre con --aplicar para borrar las tablas.');
    return;
  }

  await sequelize.transaction(async (t) => {
    for (const tabla of TABLAS) {
      await sequelize.query(`DROP TABLE IF EXISTS public."${tabla}"`, { transaction: t });
      console.log(`DROP TABLE public.${tabla} ✓`);
    }
  });
  console.log('\nListo. Las tablas del COTModal viejo se eliminaron.');
}

main()
  .catch((e) => {
    console.error('\n✗', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
