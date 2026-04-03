/**
 * Script de migración: PLANTILLA PEDIDOS PV 2026.xlsx → tabla pedido_pv
 *
 * Uso:
 *   cd backend-api
 *   npx ts-node src/scripts/migrar_pedidos_pv.ts
 *
 * IMPORTANTE: Ajustar el mapa ASESORES_MAP con los IDs reales de la BD.
 */

import path from 'path';
import { Sequelize } from 'sequelize';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const XLSX = require('../../../frontend-web/node_modules/xlsx');
import dotenv from 'dotenv';
dotenv.config();

// ─── Mapa de iniciales de asesor → ID en tabla usuarios ─────────────────────
// Ajustar con los IDs reales antes de ejecutar
const ASESORES_MAP: Record<string, number | null> = {
  'BA':  12,   // Bryam Arrubla
  'JD':  14,   // Juan Diego Cataño
  'AA':  13,   // Alejandro Ardila (puede_gestionar_pv = true)
  'NL':  15,   // Nataly Londoño
  'KP':  null, // No existe en BD aún
  'ALC': null, // No existe en BD aún
  'AL':  null, // No existe en BD aún
};

// ─── Convertir serial de Excel a fecha JS ────────────────────────────────────
const excelSerialToDate = (serial: number): string | null => {
  if (!serial || typeof serial !== 'number' || serial < 1) return null;
  // Excel epoch: 1 enero 1900, con bug de año bisiesto
  const utc = (serial - 25569) * 86400 * 1000;
  const date = new Date(utc);
  return date.toISOString().split('T')[0];
};

// ─── Convertir fracción decimal de Excel a string HH:MM ─────────────────────
const excelFraccionToTime = (fraccion: number | string): string | null => {
  if (!fraccion) return null;
  if (typeof fraccion === 'string') {
    // Casos como "13;55" o "13:55"
    const cleaned = fraccion.replace(';', ':');
    if (cleaned.includes(':')) return cleaned;
    return null;
  }
  const totalMinutes = Math.round(fraccion * 24 * 60);
  const h = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
  const m = (totalMinutes % 60).toString().padStart(2, '0');
  return `${h}:${m}:00`;
};

// ─── Determinar estado según los datos históricos ────────────────────────────
const determinarEstado = (row: any[]): string => {
  const llegada = row[9];   // columna LLEGADA
  const recibido = row[6];  // RECIBIDO x PROVEEDOR
  const fechaEnvio = row[4]; // FECHA ENVIO

  if (llegada && typeof llegada === 'number' && llegada > 0) return 'VERIFICADO';
  if (recibido === 'OK') return 'CONFIRMADO_PROVEEDOR';
  if (fechaEnvio) return 'ENVIADO';
  return 'PENDIENTE';
};

// ─── Parsear número de pedido ─────────────────────────────────────────────────
const parsearNumero = (raw: string | number): { numero_base: number; sufijo: string | null } => {
  const str = String(raw).trim();
  const match = str.match(/^(\d+)(?:-([A-Z]))?$/i);
  if (match) {
    return {
      numero_base: parseInt(match[1]),
      sufijo: match[2] ? match[2].toUpperCase() : null,
    };
  }
  return { numero_base: parseInt(str) || 0, sufijo: null };
};

// ─── Main ─────────────────────────────────────────────────────────────────────
const main = async () => {
  const sequelize = new Sequelize(process.env.DATABASE_URL as string, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  });

  await sequelize.authenticate();
  console.log('Conectado a Supabase');

  const excelPath = path.resolve(__dirname, '../../../documentation/PLANTILLA PEDIDOS PV 2026.xlsx');
  const wb = XLSX.readFile(excelPath);

  let insertados = 0;
  let omitidos = 0;

  for (const hoja of wb.SheetNames) {
    const ws = wb.Sheets[hoja];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    console.log(`\n📋 Procesando hoja: ${hoja} (${rows.length} filas)`);

    // Filas de datos empiezan en índice 3 (fila 4 del Excel)
    for (let i = 3; i < rows.length; i++) {
      const row = rows[i];

      // Ignorar filas vacías
      const numeroPedidoRaw = row[1];
      if (!numeroPedidoRaw || numeroPedidoRaw === '') {
        omitidos++;
        continue;
      }

      const { numero_base, sufijo } = parsearNumero(numeroPedidoRaw);
      if (numero_base === 0) { omitidos++; continue; }

      const numero_pedido = sufijo ? `${numero_base}-${sufijo}` : `${numero_base}`;

      // Buscar ODP por numero_odp
      const odpNumero = row[2];
      let odp_id: number | null = null;
      if (odpNumero) {
        const [odpRows]: any = await sequelize.query(
          `SELECT id FROM odp WHERE numero_odp LIKE '%${odpNumero}%' LIMIT 1`
        );
        if (odpRows.length > 0) odp_id = odpRows[0].id;
      }

      // Mapear asesor
      const asesorIniciales = String(row[3]).trim().toUpperCase();
      const creado_por = ASESORES_MAP[asesorIniciales] ?? null;

      const proveedor = String(row[0]).trim() || 'VITELSA S.A';
      const fecha_envio = typeof row[4] === 'number' ? excelSerialToDate(row[4]) : null;
      const hora_envio = excelFraccionToTime(row[5]);
      const confirmado_proveedor = row[6] === 'OK';
      const fecha_entrega_prometida = typeof row[7] === 'number' ? excelSerialToDate(row[7]) : null;
      const dias_diferencia = typeof row[8] === 'number' ? row[8] : null;
      const fecha_llegada_real = typeof row[9] === 'number' ? excelSerialToDate(row[9]) : null;
      const metraje_venta = typeof row[10] === 'number' ? row[10] : null;
      const espesor_vidrio = String(row[14] || '').trim() || null;
      const factura_pv = String(row[12] || '').trim() || null;
      const observaciones = String(row[15] || '').trim() || null;
      const estado = determinarEstado(row);

      try {
        await sequelize.query(`
          INSERT INTO pedido_pv (
            numero_pedido, numero_base, sufijo, odp_id, proveedor, creado_por,
            estado, confirmado_proveedor, fecha_envio, hora_envio,
            fecha_entrega_prometida, fecha_llegada_real, dias_diferencia,
            metraje_venta, espesor_vidrio, factura_pv, observaciones,
            tuvo_problema, alerta_enviada, creado_en
          ) VALUES (
            '${numero_pedido}', ${numero_base}, ${sufijo ? `'${sufijo}'` : 'NULL'},
            ${odp_id ?? 'NULL'}, '${proveedor.replace(/'/g, "''")}',
            ${creado_por ?? 'NULL'}, '${estado}', ${confirmado_proveedor},
            ${fecha_envio ? `'${fecha_envio}'` : 'NULL'},
            ${hora_envio ? `'${hora_envio}'` : 'NULL'},
            ${fecha_entrega_prometida ? `'${fecha_entrega_prometida}'` : 'NULL'},
            ${fecha_llegada_real ? `'${fecha_llegada_real}'` : 'NULL'},
            ${dias_diferencia ?? 'NULL'},
            ${metraje_venta ?? 'NULL'},
            ${espesor_vidrio ? `'${espesor_vidrio.replace(/'/g, "''")}'` : 'NULL'},
            ${factura_pv ? `'${factura_pv.replace(/'/g, "''")}'` : 'NULL'},
            ${observaciones ? `'${observaciones.replace(/'/g, "''")}'` : 'NULL'},
            false, ${estado === 'VERIFICADO'}, NOW()
          )
          ON CONFLICT (numero_pedido) DO NOTHING;
        `);
        insertados++;
        process.stdout.write('.');
      } catch (err: any) {
        console.error(`\nError en fila ${i} (${numero_pedido}):`, err.message);
        omitidos++;
      }
    }
  }

  console.log(`\n\n✅ Migración completada: ${insertados} insertados, ${omitidos} omitidos`);
  console.log('\n⚠️  PRÓXIMOS PASOS:');
  console.log('1. Actualizar ASESORES_MAP con los IDs reales de la tabla usuarios');
  console.log('2. Marcar puede_gestionar_pv = true para Alejandro (AA)');
  console.log('3. Re-ejecutar para actualizar creado_por');

  await sequelize.close();
};

main().catch((e) => {
  console.error('Error fatal:', e);
  process.exit(1);
});
