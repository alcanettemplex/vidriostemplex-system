import { toast } from 'react-toastify';

/**
 * Helper único para abrir la ventana de impresión de cualquier imprimible.
 *
 * Antes cada módulo abría el popup e inyectaba Tailwind desde
 * `https://cdn.tailwindcss.com`, disparando `window.print()` con un
 * `setTimeout` fijo de 800 ms. Si el CDN no respondía dentro de esa ventana
 * (red corporativa que lo bloquea, proxy, caché fría) el documento se imprimía
 * SIN estilos: el mismo usuario y la misma ODP salían bien desde una red y
 * descuadrados desde otra.
 *
 * Aquí no se descarga nada externo: se clonan las hojas de estilo que la
 * aplicación ya tiene cargadas — el mismo Tailwind compilado que se ve en
 * pantalla — y se imprime cuando el documento terminó de cargar, no a ciegas.
 */

interface OpcionesImpresion {
    /** Título de la ventana; sale en el encabezado del PDF/impresión. */
    titulo: string;
    /** HTML del área a imprimir (normalmente `elemento.innerHTML`). */
    contenidoHtml: string;
    /** CSS propio del documento (`@page`, tablas, etc.). */
    estilos?: string;
    ancho?: number;
    alto?: number;
}

/** Si algún recurso externo no responde, no dejamos la ventana colgada. */
const TIMEOUT_RESPALDO_MS = 4000;

const escaparHtml = (texto: string): string =>
    texto.replace(/[&<>"]/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string
    ));

export const abrirVentanaImpresion = ({
    titulo,
    contenidoHtml,
    estilos = '',
    ancho = 900,
    alto = 700,
}: OpcionesImpresion): boolean => {
    const win = window.open('', '_blank', `width=${ancho},height=${alto}`);
    if (!win) {
        toast.error(
            'El navegador bloqueó la ventana de impresión. Habilita las ventanas emergentes para este sitio e inténtalo de nuevo.'
        );
        return false;
    }

    // En producción esto trae el CSS compilado (/static/css/main.*.css) y en
    // desarrollo los <style> que inyecta webpack. Ambos son del mismo origen,
    // así que no dependen de que haya salida a internet.
    const hojasEstilo = Array.from(
        document.querySelectorAll('style, link[rel="stylesheet"]')
    )
        .map((nodo) => nodo.outerHTML)
        .join('\n');

    // La ventana nace como about:blank: sin <base> las rutas absolutas de la
    // app (p. ej. el logo en /assets/images/logotemplex.png) no resuelven.
    win.document.write(`<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<base href="${window.location.origin}/"/>
<title>${escaparHtml(titulo)}</title>
${hojasEstilo}
<style>
body { margin: 0; padding: 0; }
${estilos}
</style>
</head><body>${contenidoHtml}</body></html>`);
    win.document.close();

    let yaImprimio = false;
    const imprimir = () => {
        if (yaImprimio || win.closed) return;
        yaImprimio = true;
        win.focus();
        win.print();
    };

    // Se cierra en afterprint y no por temporizador, para no cortar el diálogo
    // si el usuario se demora en elegir impresora.
    win.addEventListener('afterprint', () => win.close());

    // `load` espera a que carguen las hojas de estilo Y las imágenes.
    if (win.document.readyState === 'complete') imprimir();
    else win.addEventListener('load', imprimir);

    setTimeout(imprimir, TIMEOUT_RESPALDO_MS);

    return true;
};
