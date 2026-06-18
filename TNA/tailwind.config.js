/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#0A3D62',
        paper: '#FAFAF7',
        cardborder: '#E5E5E0',
        subtle: '#5D5D5D',
      },
      fontFamily: {
        serif: ['"Playfair Display"', '"DM Serif Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 2px 12px rgba(10, 61, 98, 0.06)',
        cardlift: '0 8px 24px rgba(10, 61, 98, 0.14)',
      },
    },
  },
  plugins: [],
}
