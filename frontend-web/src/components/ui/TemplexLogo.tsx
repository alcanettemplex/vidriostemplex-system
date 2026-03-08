import React from 'react';

export const TemplexLogo = ({ className = "h-14 w-auto" }: { className?: string }) => (
    <div className={`flex items-center justify-center ${className}`}>
        <img
            src="/assets/images/logotemplex.png"
            alt="Vidrios Templex"
            className="max-h-full max-w-full object-contain drop-shadow-sm"
        />
    </div>
);
