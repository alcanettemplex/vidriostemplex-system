import { v2 as cloudinary } from 'cloudinary';
import sequelize from '../config/database';
import dotenv from 'dotenv';
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function extraerPublicId(url: string): string {
  // https://res.cloudinary.com/{cloud}/image/upload/v{ver}/{public_id}.{ext}
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
  return match ? match[1] : '';
}

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Conectado a BD.');

    const [rows] = await sequelize.query(
      `SELECT id, numero_tm, estado, medidas_json, croquis_url FROM toma_medidas WHERE numero_tm = 'TM-0116'`
    ) as [any[], unknown];

    if (!rows.length) {
      console.log('TM-0116 no encontrada.');
      process.exit(0);
    }

    const tm = rows[0];
    console.log('TM encontrada:', { id: tm.id, estado: tm.estado, fotos: tm.medidas_json?.length ?? 0 });

    const fotos: string[] = Array.isArray(tm.medidas_json) ? tm.medidas_json : [];

    if (!fotos.length) {
      console.log('La TM no tiene fotos cargadas.');
    } else {
      console.log(`Eliminando ${fotos.length} foto(s) de Cloudinary...`);
      for (const url of fotos) {
        const publicId = extraerPublicId(url);
        if (!publicId) { console.warn('  No se pudo extraer public_id de:', url); continue; }
        try {
          const result = await cloudinary.uploader.destroy(publicId);
          console.log(`  ${publicId} → ${result.result}`);
        } catch (e: any) {
          console.warn(`  Error eliminando ${publicId}:`, e.message);
        }
      }
    }

    await sequelize.query(
      `UPDATE toma_medidas SET medidas_json = '[]', croquis_url = NULL, estado = 'programada' WHERE id = :id`,
      { replacements: { id: tm.id } }
    );

    console.log('TM-0116 actualizada: fotos limpiadas, estado → programada.');
    process.exit(0);
  } catch (e: any) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
