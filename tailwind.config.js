/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        panel: "#f4f5f7",
        border: "#d7dbe0",
        primary: "#1f2937"
      }
    }
  },
  plugins: []
};
