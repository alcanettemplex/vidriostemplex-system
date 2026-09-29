import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * "?" con la explicación de un indicador. Aparece al pasar el mouse **y al enfocar con
 * teclado**. Única en el ERP: CRM tenía cuatro copias locales, una de ellas sin el texto.
 *
 * El recuadro se dibuja en un portal (`document.body`) con posición fija, NO dentro del "?":
 * las tarjetas de KPI usan `overflow-hidden` para sus esquinas y recortaban el texto. Fuera del
 * árbol, ningún contenedor puede taparlo. Se abre arriba del "?" y, si no cabe, abajo; y se
 * corre horizontalmente para no salirse de la pantalla.
 */
const ANCHO = 256;
const MARGEN = 8;

export const Ayuda: React.FC<{ texto: string; className?: string }> = ({ texto, className = '' }) => {
  const boton = useRef<HTMLButtonElement>(null);
  const caja = useRef<HTMLSpanElement>(null);
  const [abierta, setAbierta] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const ubicar = useCallback(() => {
    const b = boton.current?.getBoundingClientRect();
    const alto = caja.current?.offsetHeight ?? 0;
    if (!b) return;
    const left = Math.min(Math.max(b.left + b.width / 2 - ANCHO / 2, MARGEN), window.innerWidth - ANCHO - MARGEN);
    const arriba = b.top - alto - MARGEN;
    const top = arriba >= MARGEN ? arriba : b.bottom + MARGEN;
    setPos({ top, left });
  }, []);

  // Se mide después de pintar la caja (su alto depende del texto) y antes de mostrarla.
  useLayoutEffect(() => {
    if (!abierta) { setPos(null); return; }
    ubicar();
    window.addEventListener('scroll', ubicar, true);
    window.addEventListener('resize', ubicar);
    return () => {
      window.removeEventListener('scroll', ubicar, true);
      window.removeEventListener('resize', ubicar);
    };
  }, [abierta, ubicar]);

  return (
    <span className={`inline-flex align-middle ml-1.5 shrink-0 normal-case tracking-normal font-normal ${className}`}>
      <button ref={boton} type="button" aria-label={texto}
        onMouseEnter={() => setAbierta(true)} onMouseLeave={() => setAbierta(false)}
        onFocus={() => setAbierta(true)} onBlur={() => setAbierta(false)}
        onClick={(e) => e.stopPropagation()}
        className="w-4 h-4 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold flex items-center justify-center hover:bg-templex-50 hover:text-templex-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-templex-300">
        ?
      </button>
      {abierta && createPortal(
        <span ref={caja} role="tooltip"
          className="fixed z-[1000] bg-slate-900 text-white text-[12px] font-normal text-left normal-case tracking-normal rounded-xl p-3 shadow-float pointer-events-none leading-snug"
          style={{ width: ANCHO, top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? 'visible' : 'hidden' }}>
          {texto}
        </span>,
        document.body,
      )}
    </span>
  );
};

export default Ayuda;
