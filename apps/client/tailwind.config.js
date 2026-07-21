/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./app/**/*.{js,jsx,ts,tsx}",
        "./components/**/*.{js,jsx,ts,tsx}",
        "./src/**/*.{js,jsx,ts,tsx}"
    ],
    theme: {
        extend: {
            colors: {
                bcms: {
                    dark: '#0E2041',
                    orange: '#1D3E90',
                    gray: '#EAF1FA',
                    text: '#64748B',
                    active: '#ffffff',
                    card: '#ffffff',
                    border: '#E2E8F0',
                },
                aura: {
                    primary: '#d946ef',  // Keep specifically if generic aura is needed, but we override for Azure
                    secondary: '#8b5cf6',
                    glass: 'rgba(255, 255, 255, 0.7)',
                    glassLow: 'rgba(255, 255, 255, 0.4)',
                    text: '#1f2937',
                    textDim: '#6b7280',
                    accent: '#F472B6',
                    border: 'rgba(255, 255, 255, 0.5)',
                },
                azure: {
                    primary: '#2563EB',   // Blue-600
                    secondary: '#0EA5E9', // Sky-500
                    accent: '#60A5FA',    // Blue-400
                    dark: '#1e3a8a',      // Blue-900
                    input: '#F0F9FF',     // Sky-50
                }
            }
        },
    },
    plugins: [],
}
