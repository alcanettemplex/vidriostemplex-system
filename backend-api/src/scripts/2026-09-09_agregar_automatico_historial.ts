/**
 * Script: 2026-09-09_agregar_automatico_historial.ts
 *
 * Añade `historial_estados_odp.automatico` (BOOLEAN NOT NULL DEFAULT false).
 *
 * Marca los movimientos que hizo el sistema solo —checks automáticos de vidrio y
 * herrajes, avance a LISTO_INSTALAR, retroceso por material revertido— para que la
 * pestaña "Automáticos" del tablero de Producción los pueda listar sin depender del
 * texto de `observacion`. Distinguirlos por LIKE sobre el mensaje funciona hoy y se
 * rompe el día que alguien reescriba una cadena; una columna no miente.
 *
 * No hay ENUM ni CHECK CONSTRAINT en juego, así que no aplica el doble paso
 * (ALTER TYPE + recrear constraint) que sí exigen los cambios de estado.
 *
 * Los registros históricos quedan en `false`: no se puede saber a posteriori cuáles
 * de los avances viejos fueron automáticos, y adivinarlo ensuciaría la trazabilidad.
 *
 * Ejecutar: npx ts-node src/scripts/2026-09-09_agregar_automatico_historial.ts
 * Idempotente: puede correrse más de una vez sin efectos adicionales.
 */

import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';

async function run() {
  console.log('=== historial_estados_odp.automatico — 2026-09-09 ===\n');

  const existe = await sequelize.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n
       FROM information_schema.columns
      WHERE table_name = 'historial_estados_odp' AND column_name = 'automatico'`,
    { type: QueryTypes.SELECT },
  );

  if (Number(existe[0].n) > 0) {
    console.log("La columna 'automatico' ya existe — nada que hacer.\n");
  } else {
    await sequelize.query(
      `ALTER TABLE historial_estados_odp
         ADD COLUMN automatico BOOLEAN NOT NULL DEFAULT false`,
    );
    console.log("Columna 'automatico' creada (BOOLEAN NOT NULL DEFAULT false). ✔\n");
  }

  // Índice parcial: la pestaña solo pide los últimos N automáticos, y son una
  // fracción mínima de la tabla. Un índice parcial sobre (fecha DESC) evita
  // escanear todo el historial en cada consulta.
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS idx_historial_automatico_fecha
       ON historial_estados_odp (fecha DESC)
     WHERE automatico = true`,
  );
  console.log('Índice parcial idx_historial_automatico_fecha listo. ✔\n');

  const total = await sequelize.query<{ n: string; automaticos: string }>(
    `SELECT COUNT(*)::text AS n,
            COUNT(*) FILTER (WHERE automatico)::text AS automaticos
       FROM historial_estados_odp`,
    { type: QueryTypes.SELECT },
  );
  console.log(`Registros en historial_estados_odp: ${total[0].n} (automáticos: ${total[0].automaticos})`);
  console.log('\n=== Fin ===');
}

run()
  .then(() => sequelize.close())
  .catch(async (err) => {
    console.error('ERROR:', err);
    await sequelize.close();
    process.exit(1);
  });
