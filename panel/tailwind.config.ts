import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      colors: {
        ink: {
          900: '#0B0F1A',
          800: '#11172A',
          700: '#1A2238',
          600: '#293048',
          500: '#3A425C',
          400: '#5A6485',
          300: '#8C95B2',
          200: '#C7CDDD',
          100: '#E8EBF3',
          50: '#F5F7FB',
        },
        accent: {
          DEFAULT: '#0F746C',
          soft: '#E1F0EE',
          deep: '#0A5751',
        },
        brand: {
          DEFAULT: '#044792',
          soft: '#E3EAF4',
          deep: '#02356F',
        },
        amber: {
          soft: '#FFF4E0',
        },
        rose: {
          soft: '#FCE9EC',
        },
      },
      borderRadius: {
        card: '12px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(11, 15, 26, 0.04), 0 4px 12px rgba(11, 15, 26, 0.04)',
        drawer: '-12px 0 32px rgba(11, 15, 26, 0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
