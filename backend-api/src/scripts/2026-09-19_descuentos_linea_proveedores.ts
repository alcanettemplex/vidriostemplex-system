/**
 * Migración 2026-09-19 — descuentos de línea en el módulo Proveedores.
 *
 * Contexto: hasta hoy la ingesta de FE no leía `cac:AllowanceCharge`, así que el
 * descuento comercial de la factura no existía en ninguna parte del sistema. El precio
 * que quedaba registrado era el de lista o, cuando `BaseQuantity` repetía la cantidad,
 * un artefacto de división sin significado (FA140922 de Templacol registraba $68.558,89
 * para un vidrio de lista $165.000 y neto $99.990).
 *
 * A partir de ahora se registra el NETO y se conservan al lado el bruto, el descuento,
 * la cantidad y el total de línea. Esos tres últimos, además, vuelven AUDITABLE el
 * histórico: con ellos un error de parseo futuro se corrige con un UPDATE y un script de
 * recálculo, en vez de vaciar el módulo entero como hubo que hacer el 2026-09-04
 * (ver TECH_DEBT.md de esa fecha).
 *
 * Todas las columnas son NULLABLE y sin DEFAULT a propósito: el NULL identifica las filas
 * cargadas ANTES de este cambio, cuyo precio quedó en bruto y no se puede recalcular
 * porque los XML no se persisten. Se corrigen solas cuando entre la próxima factura de
 * cada producto (decisión del usuario, 2026-09-19).
 *
 * Es idempotente (IF NOT EXISTS) y no toca ningún ENUM ni CHECK CONSTRAINT.
 *
 *   ./backend-api/node_modules/.bin/ts-node backend-api/src/scripts/2026-09-19_descuentos_linea_proveedores.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: 'backend-api/.env' });

import { QueryTypes } from 'sequelize';
import sequelize from '../config/database';

const COLUMNAS: { tabla: string; columna: string; tipo: string; comentario: string }[] = [
  // Bandeja de códigos por mapear — alimenta el modal de vinculación
  { tabla: 'proveedor_codigo_pendiente', columna: 'precio_bruto_detectado', tipo: 'DECIMAL(15,2)',
    comentario: 'Precio de lista unitario antes del descuento, leído del XML' },
  { tabla: 'proveedor_codigo_pendiente', columna: 'descuento_pct_detectado', tipo: 'DECIMAL(5,2)',
    comentario: 'Porcentaje de descuento de la línea de la que salió el precio' },
  { tabla: 'proveedor_codigo_pendiente', columna: 'descuento_valor_detectado', tipo: 'DECIMAL(15,2)',
    comentario: 'Valor absoluto del descuento de esa línea' },
  { tabla: 'proveedor_codigo_pendiente', columna: 'cantidad_detectada', tipo: 'DECIMAL(15,6)',
    comentario: 'Cantidad facturada en esa línea (permite verificar cantidad x neto = total)' },
  { tabla: 'proveedor_codigo_pendiente', columna: 'total_linea_detectado', tipo: 'DECIMAL(15,2)',
    comentario: 'LineExtensionAmount de esa línea, neto de descuentos' },

  // Histórico de precios — vuelve cada fila auditable y recalculable
  { tabla: 'proveedor_producto_precio', columna: 'precio_bruto', tipo: 'DECIMAL(15,2)',
    comentario: 'Precio de lista unitario antes del descuento. NULL = cargado antes del 2026-09-19' },
  { tabla: 'proveedor_producto_precio', columna: 'descuento_pct', tipo: 'DECIMAL(5,2)',
    comentario: 'Porcentaje de descuento aplicado sobre el bruto' },
  { tabla: 'proveedor_producto_precio', columna: 'descuento_valor', tipo: 'DECIMAL(15,2)',
    comentario: 'Valor absoluto del descuento de la línea' },
  { tabla: 'proveedor_producto_precio', columna: 'cantidad', tipo: 'DECIMAL(15,6)',
    comentario: 'Cantidad facturada de la que salió el precio' },
  { tabla: 'proveedor_producto_precio', columna: 'total_linea', tipo: 'DECIMAL(15,2)',
    comentario: 'Total neto de la línea. Con cantidad, permite recomputar el precio' },
];

(async () => {
  try {
    console.log('\nMigración 2026-09-19 — descuentos de línea\n');

    for (const { tabla, columna, tipo, comentario } of COLUMNAS) {
      await sequelize.query(`ALTER TABLE ${tabla} ADD COLUMN IF NOT EXISTS ${columna} ${tipo}`);
      await sequelize.query(`COMMENT ON COLUMN ${tabla}.${columna} IS '${comentario.replace(/'/g, "''")}'`);
      console.log(`  ✓ ${tabla}.${columna}  ${tipo}`);
    }

    // Verificación: las 10 columnas existen y son nullable
    const filas: any[] = await sequelize.query(
      `SELECT table_name, column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE (table_name = 'proveedor_codigo_pendiente'
               AND column_name IN ('precio_bruto_detectado','descuento_pct_detectado',
                                   'descuento_valor_detectado','cantidad_detectada','total_linea_detectado'))
           OR (table_name = 'proveedor_producto_precio'
               AND column_name IN ('precio_bruto','descuento_pct','descuento_valor','cantidad','total_linea'))
        ORDER BY table_name, column_name`,
      { type: QueryTypes.SELECT }
    );

    console.log(`\nVerificación — ${filas.length}/10 columnas presentes:`);
    for (const f of filas) {
      console.log(`  ${f.table_name}.${f.column_name}  ${f.data_type}  nullable=${f.is_nullable}`);
    }

    const noNullable = filas.filter((f: any) => f.is_nullable !== 'YES');
    if (filas.length !== 10 || noNullable.length > 0) {
      console.error('\n⚠️  La migración no quedó como se esperaba. Revisar antes de cargar facturas.');
      process.exit(1);
    }

    console.log('\nMigración completada.\n');
    await sequelize.close();
    process.exit(0);
  } catch (e: any) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
