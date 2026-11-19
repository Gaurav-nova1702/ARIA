/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#090e18',
          900: '#0f1724',
          800: '#161f30',
          700: '#1e2a3f',
        },
        gold: {
          300: '#f1be82',
          400: '#f0cb79',
          500: '#e8b960',
          600: '#d4a24d',
        },
        warm: {
          100: '#f5f2ee',
          200: '#ede8e2',
          300: '#d8d4ce',
          400: '#c4bfb8',
        },
        bronze: {
          500: '#594739',
          600: '#4a3a2f',
          700: '#3b2e26',
        },
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body: ['Space Grotesk', 'sans-serif'],
        elegant: ['Cormorant Garamond', 'serif'],
      },
      boxShadow: {
        'gold-sm': '0 0 10px rgba(240,203,121,0.15)',
        'gold-md': '0 0 20px rgba(240,203,121,0.2)',
        'gold-lg': '0 0 40px rgba(240,203,121,0.25)',
      },
      animation: {
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { opacity: '0.4', transform: 'scale(1)' },
          '50%': { opacity: '0.7', transform: 'scale(1.05)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-15px)' },
        },
      },
    },
  },
  plugins: [],
}