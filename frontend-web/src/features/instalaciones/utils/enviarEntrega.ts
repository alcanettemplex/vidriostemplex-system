// Envío de "Reportar entrega" (instalador) y "Marcar como entregada" (jefe): un solo
// camino para los dos, contra POST /api/rutas/ruta-odp/:id/finalizar.
//
// Incidente del 2026-10-06 (Javier, ODP-24322): la entrega se guardó en el servidor pero
// la respuesta no llegó al celular; sin límite de espera la app quedó "Subiendo…" para
// siempre y los reintentos recibían un error incomprensible. Ahora:
//   - las fotos se comprimen antes de salir (comprimirImagen);
//   - la subida tiene límite de espera y reporta progreso;
//   - si la respuesta se pierde, se pregunta al servidor si la parada ya quedó completada;
//   - una parada ya completada responde `ya_registrada`, que aquí cuenta como éxito.

import axios from 'axios';
import API from '../../../services/config';
import { comprimirImagen } from '../../../utils/comprimirImagen';

const ESPERA_ENVIO_MS = 90_000;
const ESPERA_VERIFICACION_MS = 15_000;

export type FaseEntrega = 'preparando' | 'subiendo' | 'confirmando' | 'verificando';

export interface ResultadoEntrega {
  /** El servidor ya tenía la entrega (un reintento, o la respuesta anterior se perdió). */
  yaRegistrada: boolean;
  mensaje?: string;
}

const cabeceras = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token')}` });

/** ¿La parada ya quedó completada? `null` si tampoco se pudo consultar. */
const paradaCompletada = async (rutaODPId: number): Promise<boolean | null> => {
  try {
    const { data } = await axios.get(`${API}/api/rutas/ruta-odp/${rutaODPId}/estado`, {
      headers: cabeceras(),
      timeout: ESPERA_VERIFICACION_MS,
    });
    return data?.estado === 'completada';
  } catch {
    return null;
  }
};

/**
 * Envía la entrega. Resuelve si quedó registrada (ahora o antes); lanza un `Error` con un
 * mensaje listo para mostrarle al usuario si no.
 */
export async function enviarEntrega(
  rutaODPId: number,
  fotos: File[],
  campos: Record<string, string>,
  onFase: (fase: FaseEntrega, progreso?: number) => void
): Promise<ResultadoEntrega> {
  onFase('preparando');
  const comprimidas = await Promise.all(fotos.map((f) => comprimirImagen(f)));

  const fd = new FormData();
  for (const f of comprimidas) fd.append('fotos', f);
  for (const [k, v] of Object.entries(campos)) fd.append(k, v);

  onFase('subiendo', 0);
  try {
    const { data } = await axios.post(`${API}/api/rutas/ruta-odp/${rutaODPId}/finalizar`, fd, {
      headers: cabeceras(),
      timeout: ESPERA_ENVIO_MS,
      onUploadProgress: (e) => {
        if (!e.total) return;
        const pct = Math.min(100, Math.round((e.loaded * 100) / e.total));
        onFase(pct >= 100 ? 'confirmando' : 'subiendo', pct);
      },
    });
    return { yaRegistrada: Boolean(data?.ya_registrada), mensaje: data?.mensaje };
  } catch (e: any) {
    if (e?.response) {
      throw new Error(e.response.data?.error || 'No se pudo registrar la entrega. Intenta de nuevo.');
    }
    // Sin respuesta (límite de espera o corte de red): la entrega pudo haber quedado.
    onFase('verificando');
    const quedo = await paradaCompletada(rutaODPId);
    if (quedo) return { yaRegistrada: true, mensaje: 'La entrega sí quedó registrada, aunque la conexión se cortó al confirmar.' };
    throw new Error(
      quedo === false
        ? 'No se pudo enviar la entrega: revisa tu señal e intenta de nuevo.'
        : 'Sin conexión: no se pudo confirmar si la entrega quedó. Cuando tengas señal, recarga la pantalla; si sigue en curso, envíala de nuevo (no se duplica).'
    );
  }
}

/** Texto del botón mientras se envía. */
export const textoFaseEntrega = (fase: FaseEntrega | null, progreso: number): string => {
  if (fase === 'preparando') return 'Preparando fotos…';
  if (fase === 'subiendo') return `Subiendo ${progreso}%`;
  if (fase === 'confirmando') return 'Confirmando…';
  if (fase === 'verificando') return 'Verificando…';
  return 'Enviando…';
};
