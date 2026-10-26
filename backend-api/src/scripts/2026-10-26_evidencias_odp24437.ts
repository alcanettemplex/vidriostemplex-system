/**
 * 2026-10-26_evidencias_odp24437.ts
 *
 * Adjunta las fotos de la instalación de la ODP-24437 (id 701) como evidencias.
 *
 * CONTEXTO
 * La ODP se cerró el 2026-10-26 desde "Pendientes de cierre" (cierre
 * administrativo, ruta #589): ese camino no exige fotos, así que quedó ENTREGADA
 * sin ninguna evidencia. La instalación la hizo Jorge Giraldo (id 48) el
 * 2026-10-23, según la nota del cierre; el usuario envió las fotos después.
 *
 * QUÉ HACE
 *   - Sube cada imagen a Cloudinary, carpeta `templex_instalaciones`, con la
 *     misma transformación que `uploadConfig` (ancho 1200, quality auto).
 *   - Crea una fila en `evidencias_instalacion` por foto: tipo 'foto',
 *     instalador_id 48, fecha 2026-10-23 12:00 Bogotá (día de la instalación).
 *
 * QUÉ NO TOCA
 *   - `odp.estado_produccion` (ya ENTREGADA), `ruta_odp` ni el historial. Por eso
 *     no se usa `POST /api/evidencias`: ese endpoint fuerza ENTREGADA y emite
 *     una notificación global.
 *
 * Si falla la transacción, se borran de Cloudinary las fotos ya subidas.
 * Aborta si la ODP ya tiene evidencias (no duplica en una segunda corrida).
 *
 * EJECUCIÓN (one-off, ya ejecutado el 2026-10-26):
 *   backend-api/node_modules/.bin/ts-node --project backend-api/tsconfig.json \
 *     backend-api/src/scripts/2026-10-26_evidencias_odp24437.ts <carpeta-con-fotos>
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { v2 as cloudinary } from 'cloudinary';
import sequelize from '../config/database';
import { ODP, EvidenciaInstalacion, Usuario } from '../models';
import { requestContext } from '../utils/requestContext';

const NUMERO_ODP = 'ODP-24437';
const INSTALADOR_ID = 48; // Jorge Giraldo
const FECHA_INSTALACION = new Date('2026-10-23T17:00:00.000Z'); // 12:00 Bogotá

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

(async () => {
  const carpeta = process.argv[2];
  if (!carpeta || !fs.existsSync(carpeta)) {
    console.error('Uso: ts-node 2026-10-26_evidencias_odp24437.ts <carpeta-con-fotos>');
    process.exit(1);
  }
  const archivos = fs.readdirSync(carpeta)
    .filter(f => /\.(jpe?g|png|webp)$/i.test(f))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    .map(f => path.join(carpeta, f));
  if (archivos.length === 0) {
    console.error('ABORTA: la carpeta no tiene imágenes.');
    process.exit(1);
  }

  const subidas: string[] = [];
  try {
    await sequelize.authenticate();

    // ── Guardas ───────────────────────────────────────────────────────────────
    const odp = await ODP.findOne({ where: { numero_odp: NUMERO_ODP }, attributes: ['id', 'estado_produccion'] });
    if (!odp) { console.error(`ABORTA: ${NUMERO_ODP} no existe.`); process.exit(1); }
    const odpId = odp.getDataValue('id') as number;

    const instalador = await Usuario.findByPk(INSTALADOR_ID, { attributes: ['id', 'nombre_completo', 'rol'] });
    if (!instalador || instalador.getDataValue('rol') !== 'instalador') {
      console.error(`ABORTA: el usuario ${INSTALADOR_ID} no es un instalador.`); process.exit(1);
    }

    const existentes = await EvidenciaInstalacion.count({ where: { odp_id: odpId } });
    if (existentes > 0) {
      console.error(`ABORTA: ${NUMERO_ODP} ya tiene ${existentes} evidencia(s). No se duplica.`); process.exit(1);
    }

    console.log(`${NUMERO_ODP} (id ${odpId}, ${odp.getDataValue('estado_produccion')}) — ${archivos.length} fotos de ${instalador.getDataValue('nombre_completo')}\n`);

    // ── Cloudinary ────────────────────────────────────────────────────────────
    const urls: string[] = [];
    for (const archivo of archivos) {
      const r = await cloudinary.uploader.upload(archivo, {
        folder: 'templex_instalaciones',
        transformation: [{ width: 1200, crop: 'limit' }, { quality: 'auto' }],
      });
      subidas.push(r.public_id);
      urls.push(r.secure_url);
      console.log(`  subida ${path.basename(archivo)} → ${r.secure_url}`);
    }

    // ── BD ────────────────────────────────────────────────────────────────────
    await requestContext.run(
      { userId: null, userName: 'SCRIPT 2026-10-26_evidencias_odp24437', ip: null },
      () => sequelize.transaction(async (t) => {
        for (const url of urls) {
          await EvidenciaInstalacion.create({
            odp_id: odpId,
            instalador_id: INSTALADOR_ID,
            tipo_evidencia: 'foto',
            archivo_url: url,
            fecha: FECHA_INSTALACION,
          }, { transaction: t });
        }
      }),
    );

    console.log(`\nOK: ${urls.length} evidencias creadas para ${NUMERO_ODP}.`);
    await sequelize.close();
  } catch (err) {
    console.error('ERROR:', err);
    for (const id of subidas) {
      await cloudinary.uploader.destroy(id).catch(() => console.error(`  no se pudo borrar ${id} de Cloudinary`));
    }
    if (subidas.length) console.error(`Se revirtieron ${subidas.length} subidas a Cloudinary.`);
    process.exit(1);
  }
})();
