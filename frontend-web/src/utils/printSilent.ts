/**
 * Helper para impresión silenciosa (compatible con modo Kiosk / --kiosk-printing)
 * mediante un iframe invisible en segundo plano, sin requerir ventanas emergentes (popups).
 */

interface OpcionesImpresionSilenciosa {
    titulo: string;
    contenidoHtml: string;
    estilos?: string;
}

const TIMEOUT_RESPALDO_MS = 4000;

const escaparHtml = (texto: string): string =>
    texto.replace(/[&<>"]/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string
    ));

const neutralizarCierre = (css: string): string => css.replace(/<\//g, '<\\/');

/**
 * Serializa las hojas de estilo ya cargadas en memoria respetando la cascada.
 */
const recolectarEstilos = (): string => {
    const piezas: string[] = [];

    for (const hoja of Array.from(document.styleSheets)) {
        let reglas: CSSRuleList | null = null;
        try {
            reglas = hoja.cssRules;
        } catch {
            reglas = null;
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

const esperarImagenes = (doc: Document): Promise<void> => {
    const pendientes = Array.from(doc.images).filter((img) => !img.complete);
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

/**
 * Imprime un fragmento HTML utilizando un iframe invisible.
 * Ideal para auto-impresión en Chrome/Edge configurado con --kiosk-printing.
 */
export const imprimirIframeSilencioso = async ({
    titulo,
    contenidoHtml,
    estilos = '',
}: OpcionesImpresionSilenciosa): Promise<boolean> => {
    return new Promise((resolve) => {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        iframe.style.zIndex = '-9999';
        iframe.style.visibility = 'hidden';

        document.body.appendChild(iframe);

        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) {
            document.body.removeChild(iframe);
            resolve(false);
            return;
        }

        iframeDoc.open();
        iframeDoc.write(`<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<base href="${window.location.origin}/"/>
<title>${escaparHtml(titulo)}</title>
${recolectarEstilos()}
<style>
@page { size: letter portrait; margin: 4mm; }
body { margin: 0; padding: 0; font-family: sans-serif; }
.sap-table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
.sap-table th, .sap-table td { border: 1px solid #000; padding: 2px 4px; }
.sap-table th { font-weight: bold; text-align: center; background-color: #f0f0f0; }
.thick-b { border-bottom: 2px solid #000 !important; }
.sap-page { display: block; width: 100%; background: white; color: black; font-family: sans-serif; font-size: 14px; margin: 0 auto; page-break-after: always; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sap-page:last-child { page-break-after: avoid; }
.print-container { padding: 8px; }
.bg-blue-100 { background-color: #dbeafe !important; }
.bg-slate-50 { background-color: #f8fafc !important; }
${estilos}
</style>
</head><body>${contenidoHtml}</body></html>`);
        iframeDoc.close();

        let impreso = false;
        const limpiarYFinalizar = () => {
            if (impreso) return;
            impreso = true;
            try {
                if (iframe.contentWindow) {
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                }
            } catch (err) {
                console.error('[imprimirIframeSilencioso] Error al imprimir:', err);
            } finally {
                setTimeout(() => {
                    if (document.body.contains(iframe)) {
                        document.body.removeChild(iframe);
                    }
                    resolve(true);
                }, 1500);
            }
        };

        esperarImagenes(iframeDoc).then(limpiarYFinalizar);
        setTimeout(limpiarYFinalizar, TIMEOUT_RESPALDO_MS);
    });
};
