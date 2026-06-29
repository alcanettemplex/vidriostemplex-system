// Script one-off: reemplaza la imagen de evidencia id=98 (ODP-23995)
// Uso: node backend-api/src/scripts/reemplazar_evidencia.js

// Script ya ejecutado — solo elimina imagen vieja de Cloudinary
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: 'dn6grnt9f',
  api_key: '224137859868867',
  api_secret: '3kL9Sx1Arfv-f0QDDIrnbuBVvsw',
});

const OLD_PUBLIC_ID = 'templex_instalaciones/j3witjr8ko1e3d8blw5s';

async function main() {
  console.log(`🗑️  Eliminando imagen vieja (${OLD_PUBLIC_ID})...`);
  const result = await cloudinary.uploader.destroy(OLD_PUBLIC_ID);
  console.log(`✅ Resultado: ${JSON.stringify(result)}`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
