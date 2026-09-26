import React from 'react';

interface TemplexLogoProps {
    className?: string;
    /**
     * `color` (por defecto) es el logo oficial y lo usan todos los imprimibles.
     * `blanco` lo vuelve monocromo para fondos oscuros (menú lateral): el azul del
     * logo sobre el azul noche del menú no alcanza contraste.
     */
    tono?: 'color' | 'blanco';
}

export const TemplexLogo = ({ className = "h-14 w-auto", tono = 'color' }: TemplexLogoProps) => (
    <div className={`flex items-center justify-center ${className}`}>
        <img
            src="/assets/images/logotemplex.png"
            alt="Vidrios Templex"
            className={`max-h-full max-w-full object-contain ${tono === 'blanco' ? 'brightness-0 invert' : 'drop-shadow-sm'}`}
        />
    </div>
);
