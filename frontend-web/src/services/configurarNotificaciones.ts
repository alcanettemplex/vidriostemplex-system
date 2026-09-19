import { toast, type ToastOptions } from 'react-toastify';
import { sileo } from 'sileo';

/**
 * Adaptador de avisos: las llamadas siguen escribiéndose contra react-toastify,
 * pero quien los pinta es Sileo.
 *
 * Hay 470 llamadas a `toast.*` repartidas en 81 archivos. En lugar de migrarlas
 * una por una a la API de Sileo —que recibe un objeto donde react-toastify
 * recibe un texto—, se traduce aquí, en un único punto. Dos consecuencias que
 * vale la pena tener presentes:
 *
 *   1. Cambiar de librería de avisos vuelve a ser cosa de este archivo, no de
 *      los 81. Es la red de seguridad frente a que Sileo (hoy en 0.1.5 y sin
 *      publicar desde febrero de 2026) deje de mantenerse.
 *   2. `react-toastify` sigue instalado a propósito: los 81 archivos importan
 *      `toast` de ahí. Ya no pinta nada —su `ToastContainer` se retiró— y solo
 *      aporta el objeto que aquí se intercepta. Ver TECH_DEBT.md.
 *
 * Mismo patrón de arranque que `instalarInterceptores()`: una sola vez, desde
 * `App.tsx`.
 */

type TipoAviso = 'success' | 'error' | 'warning' | 'info';

/** Los 3 s que había para todo se quedaban cortos justo donde más importa: un
 *  error con contexto no se alcanza a leer. */
const DURACION: Record<TipoAviso, number> = {
  success: 3000,
  info: 4000,
  warning: 5000,
  error: 7000,
};

/** El diseño de Sileo tiene título y detalle; las llamadas solo traen el texto,
 *  así que el título lo aporta el tipo del aviso. */
const TITULO: Record<TipoAviso, string> = {
  success: 'Guardado',
  error: 'Error',
  warning: 'Atención',
  info: 'Información',
};

/**
 * Sileo no acepta un identificador de entrada, así que el `toastId` de
 * react-toastify —del que depende `httpInterceptors` para no repetir el aviso
 * de «solo lectura» en cada clic— se resuelve aquí: mientras el aviso siga en
 * pantalla, otro con el mismo id se descarta.
 */
const activos = new Map<string, number>();

const estaRepetido = (id: string | undefined, duracion: number): boolean => {
  if (!id) return false;
  const ahora = Date.now();
  const vence = activos.get(id);
  if (vence && vence > ahora) return true;
  activos.set(id, ahora + duracion);
  return false;
};

let configurado = false;

export const configurarNotificaciones = () => {
  if (configurado) return;
  configurado = true;

  const adaptar = (tipo: TipoAviso) =>
    (contenido: unknown, opciones?: ToastOptions) => {
      // `autoClose: false` en react-toastify significa «no se cierra solo»;
      // en Sileo eso se expresa con `duration: null`.
      const duracion =
        opciones?.autoClose === false ? null
        : typeof opciones?.autoClose === 'number' ? opciones.autoClose
        : DURACION[tipo];

      const id = opciones?.toastId != null ? String(opciones.toastId) : undefined;
      if (estaRepetido(id, duracion ?? DURACION[tipo])) return '';

      return sileo[tipo]({
        title: TITULO[tipo],
        description: contenido as string,
        duration: duracion,
      });
    };

  (['success', 'error', 'warning', 'info'] as TipoAviso[]).forEach((tipo) => {
    (toast[tipo] as unknown) = adaptar(tipo);
  });

  // `warn` es el alias histórico de `warning`; hay una llamada que lo usa.
  (toast.warn as unknown) = adaptar('warning');
};
