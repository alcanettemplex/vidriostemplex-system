import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';
import dotenv from 'dotenv';
dotenv.config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req: any, file: any) => {
        return {
            folder: 'templex_instalaciones',
            allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
            transformation: [{ width: 1200, crop: 'limit' }, { quality: 'auto' }] // Compress heavily to save space
        };
    },
});

export const uploadConfig = multer({ storage: storage });

const storageCotizacion = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (_req: any, _file: any) => ({
        folder: 'templex_cotizacion_capturas',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 1600, crop: 'limit' }, { quality: 'auto' }],
    }),
});

export const uploadCotizacionConfig = multer({ storage: storageCotizacion });

const storageDetalleSAP = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (_req: any, _file: any) => ({
        folder: 'templex_detalle_sap',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 1600, crop: 'limit' }, { quality: 'auto' }],
    }),
});

export const uploadDetalleSAPConfig = multer({ storage: storageDetalleSAP });
