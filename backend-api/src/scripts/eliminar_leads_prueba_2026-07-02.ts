// Script one-off: elimina los leads de prueba "prueba" (id 1316) y "prueba 2" (id 1317)
// creados manualmente durante pruebas del módulo CRM. Ya ejecutado — no correr de nuevo.
import { Lead, LeadImagen } from '../models';
import { v2 as cloudinary } from 'cloudinary';
import '../config/upload';

const LEAD_IDS = [1316, 1317];

async function run() {
  const imagenes = await LeadImagen.findAll({ where: { lead_id: LEAD_IDS } });

  for (const img of imagenes) {
    const publicId = img.getDataValue('public_id');
    try {
      await cloudinary.uploader.destroy(publicId);
      console.log(`Imagen Cloudinary eliminada: ${publicId}`);
    } catch (err: any) {
      console.error(`No se pudo eliminar imagen ${publicId}:`, err?.message || err);
    }
  }

  // individualHooks: true es obligatorio para que Sequelize dispare beforeDestroy/afterDestroy
  // por instancia en un destroy masivo (where). Sin esto, el hook de auditoría global
  // (models/index.ts) no se ejecuta y la eliminación no queda registrada en auditoria_log.
  const eliminados = await Lead.destroy({ where: { id: LEAD_IDS }, individualHooks: true });
  console.log(`Leads eliminados: ${eliminados}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error al eliminar leads de prueba:', err);
    process.exit(1);
  });
