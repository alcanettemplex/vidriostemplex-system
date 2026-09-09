/**
 * Script: 2026-09-09_impresion_op.ts
 *
 * Añade `odp.fecha_impresion_op` (TIMESTAMPTZ NULL) e `odp.impresa_por_id` (INTEGER NULL)
 * para la pestaña "Por Imprimir" del tablero de Taller.
 *
 * Contexto: hasta hoy el taller marcaba "esta OP ya la imprimí" pintando la fila de
 * amarillo a mano (`color_taller = '#FEF9C3'`). Eso gastaba el único canal de color libre
 * del tablero y no dejaba rastro de quién ni cuándo. El amarillo pasa a ser DERIVADO de
 * `fecha_impresion_op`, así que se ve idéntico pero el color manual queda libre otra vez.
 *
 * Backfill (confirmado con el usuario el 2026-09-09): el amarillo actual significa
 * exclusivamente "ya impresa", así que se traduce a `fecha_impresion_op` y se limpia
 * `color_taller` de esas filas. Se usa `fecha_creacion` como fecha de impresión porque
 * no existe el dato real y es la única cota inferior verdadera; `impresa_por_id` queda
 * NULL a propósito: inventar un autor ensuciaría la trazabilidad.
 *
 * No hay ENUM ni CHECK CONSTRAINT en juego, así que no aplica el doble paso
 * (ALTER TYPE + recrear constraint) que sí exigen los cambios de estado.
 *
 * Ejecutar:
 *   npx ts-node src/scripts/2026-09-09_impresion_op.ts             → DRY-RUN (no escribe)
 *   npx ts-node src/scripts/2026-09-09_impresion_op.ts --aplicar   → aplica
 *
 * El DDL (ADD COLUMN IF NOT EXISTS) sí corre en ambos modos: sin las columnas no se puede
 * previsualizar nada y es idempotente. Lo que el dry-run no hace es tocar datos.
 * Idempotente: puede correrse más de una vez sin efectos adicionales.
 */

import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';

const AMARILLO = '#FEF9C3';
const APLICAR = process.argv.includes('--aplicar');

async function run() {
  console.log('=== odp.fecha_impresion_op / impresa_por_id — 2026-09-09 ===');
  console.log(APLICAR ? 'MODO: APLICAR (escribe en la BD)\n' : 'MODO: DRY-RUN (no escribe datos)\n');

  // ─── 1. DDL ────────────────────────────────────────────────────────────────
  await sequelize.query(
    `ALTER TABLE odp ADD COLUMN IF NOT EXISTS fecha_impresion_op TIMESTAMPTZ NULL`,
  );
  await sequelize.query(
    `ALTER TABLE odp ADD COLUMN IF NOT EXISTS impresa_por_id INTEGER NULL`,
  );
  console.log('Columnas fecha_impresion_op / impresa_por_id listas. ✔\n');

  // ─── 2. Radiografía de color_taller ────────────────────────────────────────
  // Se mira ANTES de escribir por si alguna fila guarda el hex en otro formato
  // (mayúsculas, con espacios) y se quedaría fuera del backfill sin que se note.
  const colores = await sequelize.query<{ color_taller: string | null; n: string }>(
    `SELECT color_taller, COUNT(*)::text AS n
       FROM odp
      GROUP BY color_taller
      ORDER BY COUNT(*) DESC`,
    { type: QueryTypes.SELECT },
  );
  console.log('Distribución actual de color_taller:');
  for (const c of colores) {
    const etiqueta = c.color_taller === null ? '(sin color)' : `"${c.color_taller}"`;
    const marca = c.color_taller === AMARILLO ? '  ← amarillo = ya impresa' : '';
    console.log(`  ${etiqueta.padEnd(14)} ${String(c.n).padStart(5)}${marca}`);
  }
  console.log('');

  // Variantes de amarillo que NO coinciden exactamente: quedarían sin migrar.
  const variantes = colores.filter(
    c => c.color_taller
      && c.color_taller !== AMARILLO
      && c.color_taller.trim().toUpperCase() === AMARILLO,
  );
  if (variantes.length > 0) {
    console.log('⚠️  Hay filas con el amarillo escrito distinto (espacios/minúsculas).');
    console.log('    Se incluyen en el backfill vía comparación normalizada.\n');
  }

  // ─── 3. Backfill ───────────────────────────────────────────────────────────
  // Comparación normalizada (TRIM + UPPER) para no dejar por fuera las variantes.
  const CONDICION_AMARILLO = `UPPER(TRIM(color_taller)) = '${AMARILLO}'`;

  const candidatas = await sequelize.query<{ id: number; numero_odp: string; estado_produccion: string }>(
    `SELECT id, numero_odp, estado_produccion
       FROM odp
      WHERE ${CONDICION_AMARILLO} AND fecha_impresion_op IS NULL
      ORDER BY id`,
    { type: QueryTypes.SELECT },
  );

  console.log(`ODP amarillas a marcar como ya impresas: ${candidatas.length}`);
  if (candidatas.length > 0) {
    // Los ids quedan en el log para poder devolver el color a mano si algo sale mal.
    console.log(`  ids: ${candidatas.map(c => c.id).join(', ')}`);
    console.log(`  ${candidatas.slice(0, 10).map(c => `${c.numero_odp} (${c.estado_produccion})`).join(', ')}${candidatas.length > 10 ? ', …' : ''}`);
  }
  console.log('');

  if (!APLICAR) {
    console.log('DRY-RUN: no se escribió ningún dato. Repite con --aplicar para ejecutar.');
    console.log('\n=== Fin ===');
    return;
  }

  const [, metaFecha] = await sequelize.query(
    `UPDATE odp
        SET fecha_impresion_op = COALESCE(fecha_creacion, NOW())
      WHERE ${CONDICION_AMARILLO} AND fecha_impresion_op IS NULL`,
  );
  console.log(`fecha_impresion_op escrita en ${(metaFecha as any)?.rowCount ?? 0} ODP. ✔`);

  const [, metaColor] = await sequelize.query(
    `UPDATE odp SET color_taller = NULL WHERE ${CONDICION_AMARILLO}`,
  );
  console.log(`color_taller amarillo liberado en ${(metaColor as any)?.rowCount ?? 0} ODP. ✔\n`);

  // ─── 4. Verificación ───────────────────────────────────────────────────────
  const resumen = await sequelize.query<{ impresas: string; pendientes: string; amarillas: string }>(
    `SELECT COUNT(*) FILTER (WHERE fecha_impresion_op IS NOT NULL)::text AS impresas,
            COUNT(*) FILTER (WHERE fecha_impresion_op IS NULL)::text     AS pendientes,
            COUNT(*) FILTER (WHERE ${CONDICION_AMARILLO})::text          AS amarillas
       FROM odp`,
    { type: QueryTypes.SELECT },
  );
  console.log(`Total ODP marcadas como impresas: ${resumen[0].impresas}`);
  console.log(`Total ODP sin marca de impresión: ${resumen[0].pendientes}`);
  console.log(`Filas que conservan el amarillo manual: ${resumen[0].amarillas} (debe ser 0)`);

  // Lo único que el usuario ve el día 1: la pestaña "Por Imprimir" solo lista las ODP de
  // la línea de producción (los 6 estados activos), no el histórico entregado.
  const enTablero = await sequelize.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n
       FROM odp
      WHERE fecha_impresion_op IS NULL
        AND estado_produccion IN ('EN_ESPERA','VISITA_TECNICA','MEDICION',
                                  'ALUMINIO_CORTADO','VIDRIO_RECIBIDO','ACCESORIOS_SEPARADOS')`,
    { type: QueryTypes.SELECT },
  );
  console.log(`\nCaerán en la pestaña "Por Imprimir" al abrir el tablero: ${enTablero[0].n} ODP`);

  console.log('\n=== Fin ===');
}

run()
  .then(() => sequelize.close())
  .catch(async (err) => {
    console.error('ERROR:', err);
    await sequelize.close();
    process.exit(1);
  });
