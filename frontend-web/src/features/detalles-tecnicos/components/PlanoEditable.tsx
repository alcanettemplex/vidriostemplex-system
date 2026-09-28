import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Pt } from '../modelo/geometria';
import { idsDelGrupo, moverOperaciones } from '../modelo/mover';
import type { Pieza } from '../modelo/tipos';
import { PlanoSVG } from './PlanoSVG';

/** Píxeles de pantalla que hay que mover el mouse antes de que un clic se convierta en arrastre. */
const UMBRAL_ARRASTRE_PX = 4;
/** Al arrastrar, las medidas saltan de 5 en 5 mm; con Shift, de 1 en 1. */
const PASO_MM = 5;

interface Props {
  pieza: Pieza;
  selloEnCanto: boolean;
  resaltarId: string | null;
  seleccionId: string | null;
  onSeleccionar: (id: string | null) => void;
  /** Aplica un cambio a la pieza. `clave` identifica el arrastre para que cuente como un solo paso de deshacer. */
  onCambiarPieza: (fn: (p: Pieza) => Pieza, clave: string) => void;
}

interface Arrastre {
  ids: string[];
  inicio: Pt;
  inicioPx: Pt;
  original: Pieza;
  movido: boolean;
  clave: string;
}

let contadorArrastres = 0;

/** El plano de la hoja, con selección por clic y arrastre de perforaciones, boquetes y textos. */
export function PlanoEditable({ pieza, selloEnCanto, resaltarId, seleccionId, onSeleccionar, onCambiarPieza }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const arrastre = useRef<Arrastre | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  const aMilimetros = (e: { clientX: number; clientY: number }): Pt | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  const onPointerDownOp = (id: string, e: ReactPointerEvent) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    onSeleccionar(id);
    const op = pieza.operaciones.find((o) => o.id === id);
    const p = aMilimetros(e);
    if (!op || op.tipo === 'chaflan' || !p) return;
    arrastre.current = {
      // Alt mueve sólo esta pieza del herraje; sin Alt se mueve el herraje completo.
      ids: idsDelGrupo(pieza, id, e.altKey),
      inicio: p,
      inicioPx: { x: e.clientX, y: e.clientY },
      original: pieza,
      movido: false,
      clave: `arrastre:${++contadorArrastres}`,
    };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const a = arrastre.current;
    if (!a) return;
    if (!a.movido && Math.hypot(e.clientX - a.inicioPx.x, e.clientY - a.inicioPx.y) < UMBRAL_ARRASTRE_PX) return;
    const p = aMilimetros(e);
    if (!p) return;
    if (!a.movido) {
      a.movido = true;
      setArrastrando(true);
    }
    const delta = { x: p.x - a.inicio.x, y: p.y - a.inicio.y };
    const paso = e.shiftKey ? 1 : PASO_MM;
    onCambiarPieza((actual) => moverOperaciones(actual, a.original, a.ids, delta, paso), a.clave);
  };

  const terminar = (e: ReactPointerEvent) => {
    if (!arrastre.current) return;
    arrastre.current = null;
    setArrastrando(false);
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      style={{ width: '100%', height: '100%' }}
      onPointerMove={onPointerMove}
      onPointerUp={terminar}
      onPointerCancel={terminar}
    >
      <PlanoSVG
        pieza={pieza}
        selloEnCanto={selloEnCanto}
        resaltarId={resaltarId}
        seleccionIds={seleccionId ? idsDelGrupo(pieza, seleccionId) : []}
        interaccion={{
          svgRef,
          arrastrando,
          onPointerDownOp,
          onPointerDownFondo: () => onSeleccionar(null),
        }}
      />
    </div>
  );
}
