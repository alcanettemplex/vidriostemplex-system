import { useEffect, useRef } from 'react';
import { idsDelGrupo, moverOperaciones } from './modelo/mover';
import type { Pieza, Plano } from './modelo/tipos';

/** Campos donde el teclado le pertenece al campo: texto, y también los Select y menús de MUI
 *  (que son `div` con rol, no `input`). Ahí ni Ctrl+Z ni las flechas son del editor. */
const esCampoDeTexto = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable ||
    !!el.closest('[role="combobox"],[role="listbox"],[role="option"],[role="menu"],[role="menuitem"],[role="dialog"]'));

interface Opciones {
  plano: Plano | null;
  seleccionId: string | null;
  /** false = solo lectura (plano bloqueado): no se mueve ni borra nada. */
  editable: boolean;
  deshacer: () => void;
  rehacer: () => void;
  cambiarPieza: (fn: (p: Pieza) => Pieza, clave: string) => void;
  eliminar: (ids: string[], descripcion: string) => void;
  limpiarSeleccion: () => void;
}

/** Atajos del editor: deshacer/rehacer, mover con flechas, suprimir y Escape. */
export function useAtajos(o: Opciones) {
  // Se lee la versión más reciente sin volver a registrar el listener en cada render.
  const ref = useRef(o);
  ref.current = o;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { plano, seleccionId, editable, deshacer, rehacer, cambiarPieza, eliminar, limpiarSeleccion } = ref.current;
      // Dentro de un campo, Ctrl+Z deshace lo escrito en ese campo (lo nativo del navegador),
      // no el último cambio del plano.
      if (esCampoDeTexto(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (editable) deshacer();
        return;
      }
      if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) {
        e.preventDefault();
        if (editable) rehacer();
        return;
      }
      if (!plano || !seleccionId) return;
      if (e.key === 'Escape') {
        limpiarSeleccion();
        return;
      }
      if (!editable) return;
      const paso = e.shiftKey ? 10 : 1;
      const delta = ({ ArrowLeft: { x: -paso, y: 0 }, ArrowRight: { x: paso, y: 0 }, ArrowUp: { x: 0, y: -paso }, ArrowDown: { x: 0, y: paso } } as Record<string, { x: number; y: number }>)[e.key];
      if (delta) {
        e.preventDefault();
        const ids = idsDelGrupo(plano.pieza, seleccionId);
        cambiarPieza((pz) => moverOperaciones(pz, pz, ids, delta, 1), `teclado:${seleccionId}`);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const n = plano.pieza.operaciones.findIndex((x) => x.id === seleccionId) + 1;
        eliminar([seleccionId], `Elemento ${n} eliminado`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
