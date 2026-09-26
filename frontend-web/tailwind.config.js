/** @type {import('tailwindcss').Config} */

/*
 * Sistema visual "Cristal y Aluminio" (2026-09-25) — ver design/sistema-visual/README.md
 *
 * El ERP está escrito casi entero con utilidades de Tailwind sobre la paleta
 * `slate` (~5.400 usos). Por eso la legibilidad se corrige AQUÍ, reajustando la
 * escala, y no clase por clase en 173 pantallas.
 *
 * `aluminio` reemplaza a `slate` y a `gray`: mismos nombres de tono (50…950), otros
 * valores. Los tonos medios se oscurecieron para que el texto secundario se lea:
 *
 *   tono   antes     ahora     contraste sobre blanco
 *   400    #94a3b8   #6f7a8c   2,56 → 4,34
 *   500    #64748b   #555f71   4,76 → 6,44
 *
 * Solo se reajustan los NEUTROS. Los colores con significado (estados de ODP,
 * caja, alertas: emerald, amber, rose, blue, indigo…) no se tocan: cambiarlos
 * aquí alteraría el semáforo que cada rol ya sabe leer.
 */
const aluminio = {
    50: '#f6f7f9',
    100: '#eef0f4',
    200: '#e1e5eb',
    300: '#c7cdd7',
    400: '#6f7a8c',
    500: '#555f71',
    600: '#3f4858',
    700: '#2f3746',
    800: '#1d232e',
    900: '#111620',
    950: '#080b11',
};

/* Azul cobalto del logo de Vidrios Templex. 600 es el color de marca. */
const templex = {
    50: '#eef5ff',
    100: '#d9e8ff',
    200: '#bcd6ff',
    300: '#8ebcff',
    400: '#5997fb',
    500: '#3474f2',
    600: '#1f5ad6',
    700: '#1a47ad',
    800: '#1b3d8c',
    900: '#1c366f',
    950: '#142247',
};

module.exports = {
    content: [
        "./src/**/*.{js,jsx,ts,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                slate: aluminio,
                gray: aluminio,
                templex,
                // Paleta inspirada en el sistema de diseño de Apple (iOS Health/Wallet, tema claro)
                // Usada por el módulo Supervisión CRM. No sobreescribe ningún color de Tailwind.
                apple: {
                    bg: '#F5F5F7',
                    card: '#FFFFFF',
                    gray: '#F2F2F7',
                    text: '#1D1D1F',
                    'text-secondary': '#6E6E73',
                    'text-tertiary': '#AEAEB2',
                    hairline: 'rgba(0,0,0,0.06)',
                    blue: '#007AFF',
                    green: '#34C759',
                    orange: '#FF9500',
                    red: '#FF3B30',
                    purple: '#AF52DE',
                    teal: '#32ADE6',
                    yellow: '#FFCC00',
                },
            },
            fontFamily: {
                // Las familias base pasan por variables CSS (definidas en index.css) para
                // que la ventana de impresión pueda devolver los imprimibles a la fuente
                // del sistema sin tocar cada formulario — ver utils/printWindow.ts.
                sans: ['var(--font-sans)'],
                mono: ['var(--font-mono)'],
                apple: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
                // El Cotizador tuvo familias propias (Manrope / Space Grotesk) hasta el
                // 2026-09-26: la Fase 5 del sistema visual lo llevó a Geist como el resto
                // del ERP. Space Grotesk sigue cargada en index.html sólo para las cotas
                // del plano (DiagramaProducto), que también se imprime.
            },
            // Geist en 900 satura los títulos (el ERP usa font-black en ~todos los
            // encabezados). 800 conserva la jerarquía sin que la pantalla "grite".
            fontWeight: {
                black: '800',
            },
            boxShadow: {
                apple: '0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.04)',
                'apple-lg': '0 2px 8px rgba(0,0,0,0.06), 0 16px 40px rgba(0,0,0,0.06)',
                // Elevaciones del sistema visual: sombra corta que define el borde +
                // sombra larga y difusa que separa la tarjeta del fondo.
                'card': '0 1px 2px rgba(17,22,32,0.05), 0 1px 3px rgba(17,22,32,0.04)',
                'card-hover': '0 2px 4px rgba(17,22,32,0.05), 0 12px 28px -6px rgba(17,22,32,0.12)',
                'float': '0 4px 8px -2px rgba(17,22,32,0.08), 0 24px 48px -12px rgba(17,22,32,0.22)',
            },
        },
    },
    plugins: [],
}
