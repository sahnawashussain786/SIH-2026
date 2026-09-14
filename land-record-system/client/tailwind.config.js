/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#f0f7f4',
          100: '#dcece3',
          200: '#bbd9c9',
          300: '#8fbfa7',
          400: '#5da182',
          500: '#12805c',
          600: '#0e6b4c',
          700: '#0b563d',
          800: '#09432f',
          900: '#073125',
          950: '#042018',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        'card-hover': '0 4px 12px -2px rgb(15 23 42 / 0.10), 0 2px 4px -2px rgb(15 23 42 / 0.06)',
        'sidebar': '1px 0 0 0 rgb(2 20 15 / 0.9)',
      },
    },
  },
  plugins: [],
};
