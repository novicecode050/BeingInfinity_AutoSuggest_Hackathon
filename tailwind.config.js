/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'aqi-green': '#00E400',
        'aqi-yellow': '#FFFF00',
        'aqi-orange': '#FF7E00',
        'aqi-red': '#FF0000',
        'aqi-purple': '#8F3F97',
        'aqi-maroon': '#7E0023',
      }
    },
  },
  plugins: [],
}