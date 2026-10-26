/**
 * 2026-10-26_crear_tabla_pedido_pv_correccion.ts
 *
 * Crea `pedido_pv_correccion` (bitácora de "Corregir medidas" en Gestión PV) con sus índices
 * y la FK a `pedido_pv`. Idempotente: `Model.sync()` sin `alter` solo crea si no existe.
 *
 * ⚠️ Correr ANTES de desplegar el backend: en producción `server.ts` no ejecuta
 * `sequelize.sync()` (solo en desarrollo), y `getHistorialODP` consulta esta tabla — sin
 * ella, la pestaña Historial de toda ODP respondería 500.
 *
 * EJECUCIÓN (ya ejecutado el 2026-10-26):
 *   backend-api/node_modules/.bin/ts-node --project backend-api/tsconfig.json \
 *     backend-api/src/scripts/2026-10-26_crear_tabla_pedido_pv_correccion.ts
 */
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import sequelize from '../config/database';
import { PedidoPVCorreccion } from '../models';

(async () => {
  try {
    await sequelize.authenticate();
    await PedidoPVCorreccion.sync();
    const [cols] = await sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'pedido_pv_correccion' ORDER BY ordinal_position`,
    );
    console.log(`OK: pedido_pv_correccion con ${(cols as unknown[]).length} columnas.`);
    await sequelize.close();
  } catch (err) {
    console.error('ERROR:', err);
    process.exit(1);
  }
})();
