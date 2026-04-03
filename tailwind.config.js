/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg:              "var(--bg)",
        "bg-subtle":     "var(--bg-subtle)",
        "bg-hover":      "var(--bg-hover)",
        "bg-active":     "var(--bg-active)",
        border:          "var(--border)",
        "border-strong": "var(--border-strong)",
        tx:              "var(--text)",
        "tx-2":          "var(--text-2)",
        "tx-3":          "var(--text-3)",
        accent:          "var(--accent)",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
    }
  },
  plugins: []
};
