import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHistorial, usePlanos } from '../estado';
import { conteosDe } from '../modelo/geometria';
import type { Plano } from '../modelo/tipos';
import {
  cambiarBloqueoDT, cambiarLetrasDT, cargarDiseno, eliminarPlanoDT, esConflicto, ESQUEMA_PIEZA, guardarPlanoDT, mensajeError,
  type DisenoPedido,
} from './api';
import { firmaPlano, itemsDeLetra, planoDeDT } from './planos';

interface EstadoPlanos {
  planos: Plano[];
}

/** Lo que hay en la BD de cada letra: firma (para saber si hay cambios) y versión (409). */
interface Guardado {
  firma: string;
  version: string;
}

/**
 * Estado del modo pedido: el diseño del grupo del Pedido PV (datos del servidor) y los planos
 * en edición, con deshacer/rehacer. Los planos se guardan con el botón «Guardar», no solos:
 * cada guardado sube una imagen y reescribe PERF/BOQ de los vidrios.
 */
export function useDisenoPedido(pedidoId: number) {
  const [datos, setDatos] = useState<DisenoPedido | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const hist = useHistorial<EstadoPlanos>(() => ({ planos: [] }));
  const ops = usePlanos(hist);
  const [guardados, setGuardados] = useState<Map<string, Guardado>>(new Map());
  const { reiniciarCon } = hist;

  /** Lee el grupo. `completo` reconstruye también los planos (borra el historial). */
  const cargar = useCallback(async (completo: boolean) => {
    try {
      const d = await cargarDiseno(pedidoId);
      setDatos(d);
      setErrorCarga(null);
      if (completo) {
        const planos = d.planos.map((p) => planoDeDT(p, itemsDeLetra(d.items, p.letra)));
        // La firma es la del plano TAL COMO ESTÁ EN LA BD: si se reescaló por medidas nuevas
        // de la ODP, queda como cambio sin guardar y se ve.
        setGuardados(new Map(d.planos.map((p) => [p.letra, {
          firma: firmaPlano({ ...planoDeDT(p, []), pieza: p.pieza }),
          version: p.actualizado_en,
        }])));
        reiniciarCon({ planos });
      }
      return d;
    } catch (e) {
      setErrorCarga(mensajeError(e, 'No se pudieron cargar los detalles técnicos del pedido'));
      return null;
    } finally {
      setCargando(false);
    }
  }, [pedidoId, reiniciarCon]);

  const cargadoRef = useRef(false);
  useEffect(() => {
    if (cargadoRef.current) return;
    cargadoRef.current = true;
    cargar(true);
  }, [cargar]);

  const planos = hist.presente.planos;

  /** Letras con cambios sin guardar: planos nuevos o modificados, y planos quitados. */
  const pendientes = useMemo(() => {
    const cambiados = planos.filter((p) => p.letra && guardados.get(p.letra)?.firma !== firmaPlano(p)).map((p) => p.letra!);
    const quitados = Array.from(guardados.keys()).filter((l) => !planos.some((p) => p.letra === l));
    return { cambiados, quitados, hay: cambiados.length + quitados.length > 0 };
  }, [planos, guardados]);

  /** Guarda todo lo pendiente. Devuelve los errores (vacío = todo bien). */
  const guardar = useCallback(async (): Promise<string[]> => {
    if (!datos) return [];
    setGuardando(true);
    const errores: string[] = [];
    const nuevos = new Map(guardados);
    try {
      // ExcelJS no se necesita aquí, pero sí react-dom/server para dibujar el PNG: se carga al guardar.
      const { encajar, planoAPng } = await import('../exportar/imagen');
      for (const letra of pendientes.cambiados) {
        const plano = planos.find((p) => p.letra === letra)!;
        try {
          const { w, h } = encajar(plano.pieza);
          const imagen = await planoAPng(plano.pieza, plano.selloEnCanto, w, h);
          const c = conteosDe(plano.pieza);
          const guardado = await guardarPlanoDT(pedidoId, letra, {
            plantilla_id: plano.plantillaId || null,
            nombre: plano.nombre.trim() || `Plano ${letra}`,
            sello_en_canto: plano.selloEnCanto,
            observaciones: plano.observaciones,
            pieza: plano.pieza,
            esquema: ESQUEMA_PIEZA,
            conteos: { ...c, chaflanMl: +c.chaflanMl.toFixed(3), m2: +c.m2.toFixed(4) },
            imagen,
            imagen_ancho: w,
            imagen_alto: h,
            version: guardados.get(letra)?.version ?? null,
          });
          nuevos.set(letra, { firma: firmaPlano(plano), version: guardado.actualizado_en });
        } catch (e) {
          errores.push(esConflicto(e) ? mensajeError(e, '') : `Plano ${letra}: ${mensajeError(e, 'no se pudo guardar')}`);
        }
      }
      for (const letra of pendientes.quitados) {
        try {
          await eliminarPlanoDT(pedidoId, letra);
          nuevos.delete(letra);
        } catch (e) {
          errores.push(`Plano ${letra}: ${mensajeError(e, 'no se pudo borrar')}`);
        }
      }
    } finally {
      setGuardados(nuevos);
      setGuardando(false);
    }
    // PERF/BOQ de los vidrios cambiaron en el servidor: se refrescan los datos, no los planos.
    await cargar(false);
    return errores;
  }, [datos, guardados, pendientes, planos, pedidoId, cargar]);

  const cambiarLetras = useCallback(async (cambios: { item_id: number; letra: string | null }[]) => {
    await cambiarLetrasDT(pedidoId, cambios);
    await cargar(false);
  }, [pedidoId, cargar]);

  const cambiarBloqueo = useCallback(async (desbloquear: boolean) => {
    await cambiarBloqueoDT(pedidoId, desbloquear);
    await cargar(false);
  }, [pedidoId, cargar]);

  return {
    datos,
    cargando,
    errorCarga,
    guardando,
    planos,
    ...ops,
    pendientes,
    guardar,
    /** Vuelve a leer del servidor descartando lo no guardado. */
    descartar: () => cargar(true),
    refrescarDatos: () => cargar(false),
    cambiarLetras,
    cambiarBloqueo,
    puedeDeshacer: hist.puedeDeshacer,
    puedeRehacer: hist.puedeRehacer,
    deshacer: hist.deshacer,
    rehacer: hist.rehacer,
  };
}
