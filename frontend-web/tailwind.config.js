/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/**/*.{js,jsx,ts,tsx}",
    ],
    theme: {
        extend: {
            // Paleta inspirada en el sistema de diseño de Apple (iOS Health/Wallet, tema claro)
            // Usada por el módulo Supervisión CRM. No sobreescribe ningún color de Tailwind.
            colors: {
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
                apple: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
            },
            boxShadow: {
                apple: '0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.04)',
                'apple-lg': '0 2px 8px rgba(0,0,0,0.06), 0 16px 40px rgba(0,0,0,0.06)',
            },
        },
    },
    plugins: [],
}
