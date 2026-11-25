/** @type {import('tailwindcss').Config} */
// Every colour is a CSS variable (see src/index.css) holding "R G B" channels, so one token works in light AND dark mode
// and still supports Tailwind's opacity syntax, e.g. bg-brand-500/20.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
      },
      colors: {
        canvas: v('canvas'), surface: v('surface'), 'surface-2': v('surface-2'), 'surface-3': v('surface-3'),
        ink: v('ink'), muted: v('muted'), line: v('line'), 'line-strong': v('line-strong'),
        navy: { 950: '#070a1c', 900: '#0b0e21', 800: '#111633', 700: '#1a2048' },
        brand: { 50: v('brand-50'), 100: v('brand-100'), 200: v('brand-200'), 300: v('brand-300'), 400: v('brand-400'), 500: v('brand-500'), 600: v('brand-600'), 700: v('brand-700') },
        primary: { DEFAULT: v('primary'), hover: v('primary-hover') },
        accent: v('accent'), 'accent-2': v('accent-2'),
        ok: v('ok'), warn: v('warn'), bad: v('bad'),
      },
      boxShadow: {
        card: 'var(--shadow-card)', pop: 'var(--shadow-pop)', glow: 'var(--shadow-glow)',
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.125rem', '3xl': '1.5rem' },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        pulseRing: { '0%': { transform: 'scale(.9)', opacity: '.6' }, '100%': { transform: 'scale(1.8)', opacity: '0' } },
      },
      animation: { float: 'float 7s ease-in-out infinite', 'pulse-ring': 'pulseRing 1.8s ease-out infinite' },
    },
  },
  plugins: [],
};
