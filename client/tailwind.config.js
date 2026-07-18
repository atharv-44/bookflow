/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // BookFlow teal — matches the reference's #0d7561 / teal-700 primary
        brand: {
          DEFAULT: "#0d7561",
          dark: "#0a5e4d",
          light: "#e6f4f1",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
