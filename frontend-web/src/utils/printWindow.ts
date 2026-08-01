import { toast } from 'react-toastify';

/**
 * Helper único para abrir la ventana de impresión de cualquier imprimible.
 *
 * Historia de los dos fallos que originaron este archivo, para no repetirlos:
 *
 * 1. Cada módulo abría el popup e inyectaba Tailwind desde `cdn.tailwindcss.com`
 *    y disparaba `window.print()` con un `setTimeout` fijo de 800 ms. Si el CDN
 *    no respondía a tiempo, el documento salía sin estilos.
 *
 * 2. Al quitar el CDN se pasó a clonar el `outerHTML` de las hojas de la app,
 *    pero eso seguía fallando SOLO en producción:
 *      - En `npm start` webpack inyecta el CSS como <style> inline, así que el
 *        clon lleva las reglas dentro y se aplican de forma síncrona.
 *      - En producción el CSS es <link href="/static/css/main.*.css">: el clon
 *        copia únicamente la REFERENCIA y la ventana tiene que descargarla.
 *        Como una ventana `about:blank` ya reporta `readyState === 'complete'`,
 *        se imprimía de inmediato, antes de que la hoja existiera.
 *      - Además, en producción emotion (MUI) inserta sus reglas por CSSOM y deja
 *        los <style> VACÍOS en el DOM, así que clonarlos tampoco copiaba nada.
 *
 * Por eso aquí no se clona ni se descarga nada: se leen las reglas que el
 * navegador YA tiene en memoria (`document.styleSheets` → `cssRules`, accesible
 * por ser del mismo origen) y se incrustan inline. La ventana nace con todo el
 * CSS aplicado, igual en desarrollo que en producción.
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

/** Si alguna imagen no responde, no dejamos la ventana colgada sin imprimir. */
const TIMEOUT_RESPALDO_MS = 4000;

const escaparHtml = (texto: string): string =>
    texto.replace(/[&<>"]/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string
    ));

/**
 * Evita que una regla que contenga la secuencia `</style>` (por ejemplo dentro
 * de un `content: "..."`) cierre antes de tiempo la etiqueta al escribirla.
 */
const neutralizarCierre = (css: string): string => css.replace(/<\//g, '<\\/');

/**
 * Serializa las hojas de estilo ya cargadas, respetando el orden del documento
 * para no alterar la cascada. Cada hoja aporta sus reglas incrustadas; si es de
 * otro origen (`cssRules` lanza SecurityError, p. ej. una fuente remota) se
 * conserva su etiqueta original como respaldo.
 */
const recolectarEstilos = (): string => {
    const piezas: string[] = [];

    for (const hoja of Array.from(document.styleSheets)) {
        let reglas: CSSRuleList | null = null;
        try {
            reglas = hoja.cssRules;
        } catch {
            reglas = null; // hoja cross-origin: no es legible desde aquí
        }

        if (reglas) {
            const texto = Array.from(reglas).map((r) => r.cssText).join('\n');
            if (texto) piezas.push(`<style>${neutralizarCierre(texto)}</style>`);
        } else {
            const nodo = hoja.ownerNode as HTMLElement | null;
            if (nodo?.outerHTML) piezas.push(nodo.outerHTML);
        }
    }

    return piezas.join('\n');
};

/**
 * El CSS ya viaja incrustado, así que lo único que puede faltar es una imagen
 * (el logo). Se espera a que terminen —cargadas o fallidas— en vez de confiar
 * en `readyState`, que en una ventana recién abierta ya vale 'complete'.
 */
const esperarImagenes = (win: Window): Promise<void> => {
    const pendientes = Array.from(win.document.images).filter((img) => !img.complete);
    if (pendientes.length === 0) return Promise.resolve();

    return Promise.all(
        pendientes.map(
            (img) =>
                new Promise<void>((resolve) => {
                    img.addEventListener('load', () => resolve(), { once: true });
                    img.addEventListener('error', () => resolve(), { once: true });
                })
        )
    ).then(() => undefined);
};

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

    // La ventana nace como about:blank: sin <base> las rutas absolutas de la
    // app (p. ej. el logo en /assets/images/logotemplex.png) no resuelven.
    win.document.write(`<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<base href="${window.location.origin}/"/>
<title>${escaparHtml(titulo)}</title>
${recolectarEstilos()}
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

    esperarImagenes(win).then(imprimir);
    setTimeout(imprimir, TIMEOUT_RESPALDO_MS);

    return true;
};
