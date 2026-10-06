// Reduce una foto en el navegador antes de subirla, sin dependencias (canvas).
//
// Por qué (2026-10-06): las fotos de evidencia salían del celular en tamaño completo
// (3–5 MB cada una) aunque Cloudinary las guarda a 1200 px y ~100 KB. Con señal débil y
// varias fotos, la subida tardaba minutos. A 1600 px y JPEG 0,8 pesan ~300 KB.
//
// Nunca falla: si el navegador no puede abrir la imagen (p. ej. un HEIC que no sabe
// decodificar) o el resultado no pesa menos, devuelve el archivo original.

const cargarImagen = (file: File): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagen ilegible')); };
        img.src = url;
    });

export async function comprimirImagen(file: File, maxLado = 1600, calidad = 0.8): Promise<File> {
    if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
    try {
        // <img> respeta la orientación EXIF, así la foto vertical no sale acostada.
        const img = await cargarImagen(file);
        const escala = Math.min(1, maxLado / Math.max(img.naturalWidth, img.naturalHeight));
        const ancho = Math.max(1, Math.round(img.naturalWidth * escala));
        const alto = Math.max(1, Math.round(img.naturalHeight * escala));
        const canvas = document.createElement('canvas');
        canvas.width = ancho;
        canvas.height = alto;
        const ctx = canvas.getContext('2d');
        if (!ctx) return file;
        ctx.fillStyle = '#fff'; // un PNG transparente no queda con fondo negro en JPEG
        ctx.fillRect(0, 0, ancho, alto);
        ctx.drawImage(img, 0, 0, ancho, alto);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', calidad));
        if (!blob || blob.size >= file.size) return file;
        const nombre = file.name.replace(/\.[^.]+$/, '') || 'foto';
        return new File([blob], `${nombre}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
    } catch {
        return file;
    }
}
