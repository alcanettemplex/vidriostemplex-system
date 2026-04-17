import React, { useEffect } from 'react';
import { X, Printer } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface LightboxProps {
  src: string | null;
  alt?: string;
  onClose: () => void;
}

export const Lightbox: React.FC<LightboxProps> = ({ src, alt = 'Imagen', onClose }) => {
  useEffect(() => {
    if (!src) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [src, onClose]);

  const handlePrint = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!src) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Imagen</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #fff; }
            img { max-width: 100%; max-height: 100vh; object-fit: contain; display: block; }
            @media print {
              body { margin: 0; }
              img { width: 100%; height: auto; page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <img src="${src}" alt="${alt}" onload="window.print(); window.close();" />
        </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <AnimatePresence>
      {src && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4"
          onClick={onClose}
        >
          {/* Botón cerrar */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 rounded-full p-2 transition z-10"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Botón imprimir */}
          <button
            onClick={handlePrint}
            className="absolute top-4 right-16 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 rounded-full p-2 transition z-10"
            title="Imprimir imagen"
          >
            <Printer className="w-6 h-6" />
          </button>

          <motion.img
            src={src}
            alt={alt}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Hook helper para manejar el estado del lightbox
export const useLightbox = () => {
  const [lightboxSrc, setLightboxSrc] = React.useState<string | null>(null);
  const openLightbox = (src: string) => setLightboxSrc(src);
  const closeLightbox = () => setLightboxSrc(null);
  return { lightboxSrc, openLightbox, closeLightbox };
};

export default Lightbox;
