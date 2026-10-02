import { toast } from 'react-toastify';

import { apiDescargarPdfPropuesta } from './services/cotizadorApi';
import { numeroCotizacion } from './format';

// ─────────────────────────────────────────────────────────────────────────────
// Enviar la cotización al cliente (2026-10-01): PDF y WhatsApp.
//
// Antes el PDF solo se descargaba desde el modal de detalle de la pestaña
// Cotizaciones; ahora lo piden también Resumen ("Lo que sigue") y las filas de
// la bandeja. Una sola implementación para los tres.
//
// WhatsApp NO puede adjuntar un archivo desde una página web: `wa.me` abre el
// chat con el número y el texto listos, y el asesor adjunta el PDF que se acaba
// de descargar. Por eso el botón hace las dos cosas.
// ─────────────────────────────────────────────────────────────────────────────

/** Nombre que manda el backend en `Content-Disposition` ("COT-87 B, ODP-24381 Cliente.pdf"). */
function nombreDeContentDisposition(valor?: string): string | null {
    if (!valor) return null;
    const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(valor);
    if (utf8) { try { return decodeURIComponent(utf8[1]); } catch { /* cae al ASCII */ } }
    const ascii = /filename="([^"]+)"/i.exec(valor);
    return ascii ? ascii[1] : null;
}

/** Descarga el PDF de UNA propuesta. Con `responseType: 'blob'` un error llega
 * como Blob y no como JSON: el mensaje es genérico. Devuelve si se descargó. */
export async function descargarPdfPropuesta(cotizacionId: number, propuestaId: number, numero: number): Promise<boolean> {
    try {
        const { data, headers } = await apiDescargarPdfPropuesta(cotizacionId, propuestaId);
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = nombreDeContentDisposition(headers?.['content-disposition']) ?? `${numeroCotizacion(numero)}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return true;
    } catch {
        toast.error('No se pudo generar el PDF de la cotización. Inténtalo de nuevo en un momento.');
        return false;
    }
}

/** Teléfono para `wa.me`: solo dígitos, con el 57 de Colombia si viene un
 * celular de 10 cifras sin indicativo. Vacío si no hay número utilizable. */
export function telefonoWhatsApp(telefono: string | null | undefined): string {
    const digitos = String(telefono ?? '').replace(/\D/g, '');
    if (digitos.length === 10 && digitos.startsWith('3')) return `57${digitos}`;
    return digitos.length >= 10 ? digitos : '';
}

/** Si la opción que se envía lleva instalación. Lo dice la casilla "Con
 * instalación" de cada producto; un producto sin esa casilla (ítem libre) no
 * cuenta. null = ninguno la tiene: el mensaje no menciona la instalación. */
export type InstalacionMensaje = 'toda' | 'ninguna' | 'parcial' | null;

export function instalacionDe(items: { input: Record<string, unknown> }[]): InstalacionMensaje {
    const marcas = items
        .filter(it => it.input && 'conInstalacion' in it.input)
        .map(it => it.input.conInstalacion === true);
    if (marcas.length === 0) return null;
    if (marcas.every(Boolean)) return 'toda';
    if (!marcas.some(Boolean)) return 'ninguna';
    return 'parcial';
}

const FRASE_INSTALACION: Record<Exclude<InstalacionMensaje, null>, string> = {
    toda: ', *con instalación incluida*',
    ninguna: ', *solo suministro (sin instalación)*',
    parcial: ', *con instalación en los productos que la incluyen*',
};

interface DatosMensaje {
    telefono: string | null | undefined;
    cliente: string | null | undefined;
    numero: number;
    /** Letra de la opción; solo se nombra si la cotización tiene varias. */
    etiquetaOpcion?: string | null;
    instalacion?: InstalacionMensaje;
    /** Quien envía (el usuario con la sesión abierta): firma el mensaje. */
    asesor?: string | null;
    /** Recordatorio de una cotización por vencer, en vez del primer envío. */
    recordatorio?: boolean;
}

/**
 * Abre WhatsApp con el mensaje listo. Debe llamarse DIRECTO desde el clic (antes
 * de cualquier `await`): un `window.open` diferido lo bloquea el navegador.
 * Sin teléfono abre WhatsApp para que el asesor elija el contacto.
 *
 * El mensaje NO lleva el precio (decisión del usuario, 2026-10-01): así el
 * cliente abre el PDF para verlo. Los asteriscos son negrita en WhatsApp.
 */
export function abrirWhatsApp(d: DatosMensaje): void {
    const primero = (t: string | null | undefined) => String(t ?? '').trim().split(/\s+/)[0] || '';
    const nombre = primero(d.cliente);
    const asesor = primero(d.asesor);
    const saludo = `Hola${nombre ? ` ${nombre}` : ''}`;
    const ref = `*${numeroCotizacion(d.numero)}${d.etiquetaOpcion ? `, Opción ${d.etiquetaOpcion}` : ''}*`;
    const firma = asesor ? ` — ${asesor}, Vidrios Templex` : '';
    const texto = d.recordatorio
        ? `${saludo}, ¿cómo vas? Te escribo por la cotización ${ref} que te envié. ` +
          'Su validez está por terminar y no quiero que pierdas esas condiciones. ¿Pudiste revisarla? ' +
          `Si necesitas algún ajuste, lo hacemos de una.${firma}`
        : `¡${saludo}! Gracias por tenernos en cuenta 🙌. Aquí va tu cotización ${ref} de Vidrios Templex` +
          `${d.instalacion ? FRASE_INSTALACION[d.instalacion] : ''}. ` +
          `En el PDF encuentras el detalle de cada producto y el valor. ¿Te parece si la revisamos juntos?${firma}`;
    const tel = telefonoWhatsApp(d.telefono);
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
    if (!tel) toast.info('La cotización no tiene un celular válido: elige el contacto en WhatsApp.');
}
