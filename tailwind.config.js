/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#f97316',
        'primary-dark': '#ea580c',
        text: '#4b4b4b',
        background: '#d9d9d9',
        white: '#ffffff',
      },
    },
  },
  plugins: [],
}
