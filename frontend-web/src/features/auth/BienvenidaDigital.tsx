import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { etiquetaRol } from '../../components/common/navegacion';

// ─────────────────────────────────────────────────────────────────────────────
// Bienvenida "digital" tras un inicio de sesión EXITOSO (2026-09-27, idea del
// usuario). Solo se monta cuando el servidor ya aceptó las credenciales: todo lo
// que dice es cierto (nombre y rol vienen de la respuesta del login).
//
//   Siempre la completa (~5 s): la versión corta de los reingresos del día se
//   retiró el mismo 2026-09-27 por decisión del usuario (`completa` queda como
//   prop por si se retoma). Se salta con un clic, toque o tecla. No depende del
//   "reducir movimiento" del sistema operativo (decisión del usuario).
// ─────────────────────────────────────────────────────────────────────────────

const AZUL = '#38bdf8';

interface Props {
  nombre: string;
  rol: string;
  completa: boolean;
  onTerminar: () => void;
}

/**
 * Cortina negra que SOBREVIVE al cambio de pantalla (2026-09-27, "el paso al ERP
 * era muy drástico"): se cuelga del <body>, fuera de React, así no desaparece
 * cuando la página del login se desmonta. Espera a que el ERP pinte y se
 * desvanece de negro a imagen; al terminar se retira sola.
 */
function cortinaHaciaElErp(esperaMs = 450, fundidoMs = 1400) {
  const cortina = document.createElement('div');
  cortina.setAttribute('aria-hidden', 'true');
  Object.assign(cortina.style, {
    position: 'fixed', inset: '0', zIndex: '9999', pointerEvents: 'none', opacity: '1',
    background: 'radial-gradient(ellipse at center, #06182f 0%, #000 70%)',
    // Curva pareja (ease-in-out): una ease-out aclaraba el 80 % en 250 ms y se sentía brusco.
    transition: `opacity ${fundidoMs}ms cubic-bezier(0.45, 0, 0.55, 1)`,
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(cortina);
  window.setTimeout(() => { cortina.style.opacity = '0'; }, esperaMs);
  window.setTimeout(() => cortina.remove(), esperaMs + fundidoMs + 100);
}

const saludo = (hora: number) => (hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches');

/** Texto que se escribe letra por letra desde `inicio` (ms). */
const Tecleo: React.FC<{ texto: string; inicio: number; velocidad?: number; className?: string }> = ({
  texto, inicio, velocidad = 28, className = '',
}) => {
  const [n, setN] = useState(0);
  useEffect(() => {
    let intervalo: ReturnType<typeof setInterval> | undefined;
    const t = setTimeout(() => {
      intervalo = setInterval(() => setN((v) => (v >= texto.length ? v : v + 1)), velocidad);
    }, inicio);
    return () => { clearTimeout(t); if (intervalo) clearInterval(intervalo); };
  }, [texto, inicio, velocidad]);
  if (n === 0) return null;
  return (
    <span className={className}>
      {texto.slice(0, n)}
      {n < texto.length && <span className="inline-block w-[0.55em] animate-pulse" style={{ background: AZUL }}>&nbsp;</span>}
    </span>
  );
};

const BienvenidaDigital: React.FC<Props> = ({ nombre, rol, completa, onTerminar }) => {
  // No se respeta "reducir movimiento" del sistema (decisión del usuario, 2026-09-27):
  // en su Windows los "Efectos de animación" están apagados y la bienvenida se
  // reducía a un fundido con el saludo. Siempre se ve completa; se salta con un clic.
  const reducirMovimiento = false;
  const duracion = reducirMovimiento ? 600 : completa ? 5200 : 1700;

  const ahora = useMemo(() => new Date(), []);
  const primerNombre = (nombre || 'Usuario').trim().split(/\s+/)[0];
  const fecha = ahora.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
  const textoSaludo = `${saludo(ahora.getHours())}, ${primerNombre}`;

  // Salida en dos tiempos: (1) los textos y la rejilla se disuelven sobre el
  // negro (0,5 s); (2) se entra al ERP bajo la cortina, que se desvanece.
  const terminado = useRef(false);
  const [saliendo, setSaliendo] = useState(false);
  const terminar = useCallback(() => {
    if (terminado.current) return;
    terminado.current = true;
    setSaliendo(true);
    window.setTimeout(() => {
      cortinaHaciaElErp();
      onTerminar();
    }, 520);
  }, [onTerminar]);

  useEffect(() => {
    const t = setTimeout(terminar, duracion);
    const tecla = () => terminar();
    window.addEventListener('keydown', tecla);
    return () => { clearTimeout(t); window.removeEventListener('keydown', tecla); };
  }, [duracion, terminar]);

  return (
    <motion.div
      role="status"
      aria-live="polite"
      aria-label={`Credenciales verificadas. ${textoSaludo}.`}
      className="fixed inset-0 z-[100] cursor-pointer select-none overflow-hidden bg-black text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reducirMovimiento ? 0.2 : 0.8, ease: 'easeIn' }}
      onClick={terminar}
    >
      <motion.div
        className="absolute inset-0"
        animate={saliendo ? { opacity: 0, scale: 1.06, filter: 'blur(8px)' } : { opacity: 1, scale: 1, filter: 'blur(0px)' }}
        transition={{ duration: 0.5, ease: 'easeIn' }}
      >
      {!reducirMovimiento && (
        <>
          {/* Rejilla digital y línea de escaneo */}
          <motion.div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(rgba(56,189,248,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.07) 1px, transparent 1px)',
              backgroundSize: '44px 44px',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: completa ? 0.8 : 0.2, duration: 0.7 }}
          />
          <motion.div
            aria-hidden="true"
            className="absolute inset-x-0 h-24"
            style={{ background: 'linear-gradient(to bottom, transparent, rgba(56,189,248,0.18), transparent)' }}
            initial={{ top: '-10%' }}
            animate={{ top: '110%' }}
            transition={{ delay: completa ? 0.9 : 0.2, duration: completa ? 2.6 : 1.2, ease: 'linear', repeat: completa ? 1 : 0 }}
          />
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.85))]" />
        </>
      )}

      <div className="relative flex h-full w-full items-center justify-center px-6">
        <div className="w-full max-w-2xl font-mono">
          {completa && !reducirMovimiento && (
            <div className="space-y-3 text-[13px] sm:text-[15px]" style={{ color: AZUL }}>
              <Tecleo texto="> USUARIO DETECTADO" inicio={1500} />
              <motion.div
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: [0, 1, 0.3, 1], x: [-6, 2, -1, 0] }}
                transition={{ delay: 2.3, duration: 0.5 }}
                className="border-l-2 pl-3 text-white"
                style={{ borderColor: AZUL }}
              >
                <p className="text-lg font-semibold tracking-wide sm:text-2xl">{(nombre || 'Usuario').toUpperCase()}</p>
                <p className="text-[12px] uppercase tracking-[0.25em] text-sky-200/90 sm:text-sm">{etiquetaRol(rol)}</p>
              </motion.div>
              <Tecleo texto={`> ${fecha} · ${hora}`} inicio={2800} velocidad={22} className="block text-sky-200/80" />
              <Tecleo texto="> CREDENCIALES VERIFICADAS ✓" inicio={3100} className="block text-emerald-400" />
            </div>
          )}

          <AnimatePresence>
            <motion.h1
              key="saludo"
              className="mt-8 text-center font-sans text-3xl font-extrabold uppercase tracking-[0.12em] sm:text-5xl"
              style={{ textShadow: '0 0 24px rgba(56,189,248,0.55)' }}
              initial={{ opacity: 0, scale: 0.96, filter: 'blur(6px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              transition={{ delay: reducirMovimiento ? 0 : completa ? 3.9 : 0.35, duration: 0.6 }}
            >
              {textoSaludo}
            </motion.h1>
          </AnimatePresence>
        </div>
      </div>

      </motion.div>

      {!reducirMovimiento && !saliendo && (
        <p className="absolute bottom-6 inset-x-0 text-center font-mono text-[11px] tracking-widest text-white/45">
          Toca o presiona una tecla para continuar
        </p>
      )}
    </motion.div>
  );
};

export default BienvenidaDigital;
