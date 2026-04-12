/**
 * CRMIcons.tsx
 * Íconos SVG personalizados con micro-animaciones para el módulo CRM.
 * Cada ícono usa animaciones CSS inline para lograr efectos premium.
 */
import React from 'react';

interface IconProps { size?: number; className?: string; }

// ── Estilos de animación globales (inyectados una sola vez) ───────────────────
const ANIM_STYLE = `
@keyframes crm-pulse-ring {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.15); opacity: 0.15; }
}
@keyframes crm-spin-slow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes crm-bounce-soft {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
@keyframes crm-wave {
  0% { transform: scaleY(0.4); }
  50% { transform: scaleY(1); }
  100% { transform: scaleY(0.4); }
}
@keyframes crm-dash {
  from { stroke-dashoffset: 40; }
  to { stroke-dashoffset: 0; }
}
@keyframes crm-glow {
  0%, 100% { filter: drop-shadow(0 0 2px currentColor); }
  50% { filter: drop-shadow(0 0 6px currentColor); }
}
@keyframes crm-float {
  0%, 100% { transform: translateY(0px) rotate(-2deg); }
  50% { transform: translateY(-4px) rotate(2deg); }
}
@keyframes crm-coin-flip {
  0%, 100% { transform: scaleX(1); }
  45%, 55% { transform: scaleX(0.1); }
  50% { transform: scaleX(0.1) scaleY(0.9); }
}
@keyframes crm-check-draw {
  from { stroke-dashoffset: 20; opacity: 0; }
  to { stroke-dashoffset: 0; opacity: 1; }
}
@keyframes crm-bar-grow {
  0% { transform: scaleY(0.2); }
  100% { transform: scaleY(1); }
}
@keyframes crm-trophy-shine {
  0%, 100% { opacity: 0; transform: translateX(-8px); }
  50% { opacity: 0.4; transform: translateX(8px); }
}
@keyframes crm-radar {
  0% { transform: rotate(0deg); opacity: 0.8; }
  100% { transform: rotate(360deg); opacity: 0.8; }
}
@keyframes crm-people-move {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(2px); }
}
@keyframes crm-globe-spin {
  from { stroke-dashoffset: 0; }
  to { stroke-dashoffset: -60; }
}
@keyframes crm-arrow-move {
  0%, 100% { transform: translate(0,0); }
  50% { transform: translate(2px,-2px); }
}
@keyframes crm-clock-tick {
  0%   { transform: rotate(0deg); }
  25%  { transform: rotate(90deg); }
  50%  { transform: rotate(180deg); }
  75%  { transform: rotate(270deg); }
  100% { transform: rotate(360deg); }
}
`;

let injected = false;
const injectStyles = () => {
  if (injected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.innerHTML = ANIM_STYLE;
  document.head.appendChild(style);
  injected = true;
};

// ── Hook de inyección ─────────────────────────────────────────────────────────
const useAnimStyles = () => { React.useEffect(() => { injectStyles(); }, []); };


// ═══════════════════════════════════════════════════════════════════════════════
// 1. ÍCONO: Total Leads (personas animadas)
// ═══════════════════════════════════════════════════════════════════════════════
export const IconLeads: React.FC<IconProps> = ({ size = 24, className = '' }) => {
  useAnimStyles();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Persona izquierda */}
      <g style={{ animation: 'crm-people-move 2s ease-in-out infinite', transformOrigin: '7px 14px' }}>
        <circle cx="7" cy="6" r="2.5" fill="currentColor" opacity="0.7"/>
        <path d="M3 18c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.7"/>
      </g>
      {/* Persona derecha */}
      <g style={{ animation: 'crm-people-move 2s ease-in-out infinite 0.3s', transformOrigin: '17px 14px' }}>
        <circle cx="17" cy="6" r="2.5" fill="currentColor"/>
        <path d="M13 18c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      </g>
      {/* Punto pulsante */}
      <circle cx="12" cy="21" r="1" fill="currentColor" opacity="0.4"
        style={{ animation: 'crm-pulse-ring 1.5s ease-in-out infinite' }} />
    </svg>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// 2. ÍCONO: DollarSign / Ticket (moneda con brillo)
// ═══════════════════════════════════════════════════════════════════════════════
export const IconDollar: React.FC<IconProps> = ({ size = 24, className = '' }) => {
  useAnimStyles();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <g style={{ animation: 'crm-coin-flip 3s ease-in-out infinite 1s', transformOrigin: '12px 12px' }}>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.3"/>
        <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.15"/>
      </g>
      <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="bold" fill="currentColor">$</text>
      {/* Destellos */}
      <circle cx="16" cy="8" r="1" fill="currentColor" opacity="0.4"
        style={{ animation: 'crm-pulse-ring 2s ease-in-out infinite 0.5s' }}/>
    </svg>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// 3. ÍCONO: TrendingUp (flecha con trazo animado)
// ═══════════════════════════════════════════════════════════════════════════════
export const IconTrending: React.FC<IconProps> = ({ size = 24, className = '' }) => {
  useAnimStyles();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <polyline
        points="3,17 9,11 13,15 21,7"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="40" fill="none"
        style={{ animation: 'crm-dash 1.5s ease-in-out infinite alternate' }}
      />
      <polyline points="15,7 21,7 21,13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"
        style={{ animation: 'crm-arrow-move 2s ease-in-out infinite' }}
      />
    </svg>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// 4. ÍCONO: Target / Tasa de cierre (radar)
// ═══════════════════════════════════════════════════════════════════════════════
export const IconTarget: React.FC<IconProps> = ({ size = 24, className = '' }) => {
  useAnimStyles();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.3"/>
      <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.5"/>
      <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.9"
        style={{ animation: 'crm-pulse-ring 1.8s ease-in-out infinite' }}/>
      {/* Línea de radar */}
      <line x1="12" y1="12" x2="12" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"
        style={{ animation: 'crm-radar 3s linear infinite', transformOrigin: '12px 12px' }}/>
    </svg>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// 5. ÍCONO: CheckCircle (tick que se dibuja)
// ═══════════════════════════════════════════════════════════════════════════════
export const IconCheck: React.FC<IconProps> = ({ size = 24, className = '' }) => {
  useAnimStyles();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.2"/>
      <polyline
        points="7.5,12 10.5,15 16.5,9"
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="20" fill="none"
        style={{ animation: 'crm-check-draw 1.5s ease-in-out infinite alternate' }}
      />
    </svg>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// 6. ÍCONO: Globe / Fuentes (globo con órbita)
// ═══════════════════════════════════════════════════════════════════════════════
export const IconGlobe: React.FC<IconProps> = ({ size = 24, className = '' }) => {
  useAnimStyles();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.8"/>
      {/* Líneas de longitud animadas */}
      <ellipse cx="12" cy="12" rx="4" ry="9" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.5"
        strokeDasharray="30"
        style={{ animation: 'crm-globe-spin 4s linear infinite', transformOrigin: '12px 12px' }}/>
      <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1" opacity="0.4"/>
      <line x1="4.5" y1="7" x2="19.5" y2="7" stroke="currentColor" strokeWidth="1" opacity="0.3"/>
      <line x1="4.5" y1="17" x2="19.5" y2="17" stroke="currentColor" strokeWidth="1" opacity="0.3"/>
    </svg>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// 7. ÍCONO: Clock / Ciclo de vida (manecillas que rotan)
// ═══════════════════════════════════════════════════════════════════════════════
export const IconClock: React.FC<IconProps> = ({ size = 24, className = '' }) => {
  useAnimStyles();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.1"/>
      {/* Manecilla de minutos */}
      <line x1="12" y1="12" x2="12" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        style={{ animation: 'crm-clock-tick 8s steps(60) infinite', transformOrigin: '12px 12px' }}/>
      {/* Manecilla de horas */}
      <line x1="12" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
        style={{ animation: 'crm-clock-tick 96s linear infinite', transformOrigin: '12px 12px' }}/>
      <circle cx="12" cy="12" r="1.2" fill="currentColor"/>
    </svg>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// 8. ÍCONO: BarChart / Métricas (barras animadas)
// ═══════════════════════════════════════════════════════════════════════════════
export const IconBarChart: React.FC<IconProps> = ({ size = 24, className = '' }) => {
  useAnimStyles();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="12" width="4" height="9" rx="1" fill="currentColor" opacity="0.6"
        style={{ animation: 'crm-wave 2s ease-in-out infinite 0s', transformOrigin: '5px 21px' }}/>
      <rect x="10" y="7" width="4" height="14" rx="1" fill="currentColor" opacity="0.8"
        style={{ animation: 'crm-wave 2s ease-in-out infinite 0.3s', transformOrigin: '12px 21px' }}/>
      <rect x="17" y="3" width="4" height="18" rx="1" fill="currentColor"
        style={{ animation: 'crm-wave 2s ease-in-out infinite 0.6s', transformOrigin: '19px 21px' }}/>
    </svg>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// 9. ÍCONO: Trophy (copa con brillo)
// ═══════════════════════════════════════════════════════════════════════════════
export const IconTrophy: React.FC<IconProps> = ({ size = 24, className = '' }) => {
  useAnimStyles();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <g style={{ animation: 'crm-bounce-soft 2s ease-in-out infinite' }}>
        <path d="M6 4h12v6a6 6 0 01-12 0V4z" fill="currentColor" opacity="0.9"/>
        <path d="M6 7H3a3 3 0 003 3" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M18 7h3a3 3 0 01-3 3" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <line x1="12" y1="16" x2="12" y2="20" stroke="currentColor" strokeWidth="1.5"/>
        <line x1="8" y1="20" x2="16" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </g>
      {/* Destellos de luz */}
      <rect x="7" y="5" width="10" height="4" rx="1" fill="white" opacity="0.25"
        style={{ animation: 'crm-trophy-shine 2.5s ease-in-out infinite' }}/>
    </svg>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// 10. ÍCONO: Package / Producto (caja con destello)
// ═══════════════════════════════════════════════════════════════════════════════
export const IconPackage: React.FC<IconProps> = ({ size = 24, className = '' }) => {
  useAnimStyles();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <g style={{ animation: 'crm-float 3s ease-in-out infinite' }}>
        <polygon points="12,2 22,7 22,17 12,22 2,17 2,7" fill="currentColor" opacity="0.2"/>
        <polygon points="12,2 22,7 22,17 12,22 2,17 2,7" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <polyline points="2,7 12,12 22,7" stroke="currentColor" strokeWidth="1.5"/>
        <line x1="12" y1="12" x2="12" y2="22" stroke="currentColor" strokeWidth="1.5"/>
      </g>
    </svg>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// 11. ÍCONO: Percent (conversión)
// ═══════════════════════════════════════════════════════════════════════════════
export const IconPercent: React.FC<IconProps> = ({ size = 24, className = '' }) => {
  useAnimStyles();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="7.5" cy="7.5" r="3" stroke="currentColor" strokeWidth="2" fill="none"
        style={{ animation: 'crm-pulse-ring 2s ease-in-out infinite' }}/>
      <circle cx="16.5" cy="16.5" r="3" stroke="currentColor" strokeWidth="2" fill="none"
        style={{ animation: 'crm-pulse-ring 2s ease-in-out infinite 0.5s' }}/>
      <line x1="19" y1="5" x2="5" y2="19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        strokeDasharray="25"
        style={{ animation: 'crm-dash 2s linear infinite' }}/>
    </svg>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// 12. ÍCONO: Zap / Eficiencia (rayo pulsante)
// ═══════════════════════════════════════════════════════════════════════════════
export const IconZap: React.FC<IconProps> = ({ size = 24, className = '' }) => {
  useAnimStyles();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <polygon
        points="13,2 3,14 12,14 11,22 21,10 12,10"
        fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"
        style={{ animation: 'crm-glow 1.5s ease-in-out infinite' }}
      />
    </svg>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// 13. ÍCONO: UserCheck (cliente convertido)
// ═══════════════════════════════════════════════════════════════════════════════
export const IconUserCheck: React.FC<IconProps> = ({ size = 24, className = '' }) => {
  useAnimStyles();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="9" cy="7" r="4" fill="currentColor" opacity="0.8"/>
      <path d="M2 21c0-3.866 3.134-7 7-7s7 3.134 7 7" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <polyline points="16,11 18,13 22,9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="15"
        style={{ animation: 'crm-check-draw 1.5s ease-in-out infinite alternate 0.5s' }}/>
    </svg>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// 14. ÍCONO: Activity / Fuentes/Pérdidas (líneas de actividad)
// ═══════════════════════════════════════════════════════════════════════════════
export const IconActivity: React.FC<IconProps> = ({ size = 24, className = '' }) => {
  useAnimStyles();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <polyline
        points="2,12 6,6 10,16 14,8 18,14 22,10"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="60" fill="none"
        style={{ animation: 'crm-dash 2s ease-in-out infinite' }}
      />
    </svg>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// 15. ÍCONO: Sparkles (premiun/brillo)
// ═══════════════════════════════════════════════════════════════════════════════
export const IconSparkles: React.FC<IconProps> = ({ size = 24, className = '' }) => {
  useAnimStyles();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <g style={{ animation: 'crm-bounce-soft 2s ease-in-out infinite' }}>
        <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5Z"
          fill="currentColor"/>
      </g>
      <circle cx="19" cy="5" r="1.5" fill="currentColor" opacity="0.6"
        style={{ animation: 'crm-pulse-ring 1.5s ease-in-out infinite 0.3s' }}/>
      <circle cx="5" cy="18" r="1" fill="currentColor" opacity="0.4"
        style={{ animation: 'crm-pulse-ring 1.5s ease-in-out infinite 0.6s' }}/>
      <circle cx="20" cy="18" r="1.2" fill="currentColor" opacity="0.5"
        style={{ animation: 'crm-pulse-ring 1.5s ease-in-out infinite 0.9s' }}/>
    </svg>
  );
};
