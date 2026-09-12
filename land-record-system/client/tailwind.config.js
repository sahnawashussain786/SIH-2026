/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7f2',
          100: '#d7ecdf',
          500: '#12805c',
          600: '#0e6b4c',
          700: '#0b563d',
          900: '#073828',
        },
      },
    },
  },
  plugins: [],
};
