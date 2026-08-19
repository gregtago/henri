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

        // Les familles sémantiques, pour que `text-red-500` et consorts —
        // qui ne savent pas ce qu'est la nuit — cessent d'être écrits en dur.
        "warn-bg":         "var(--warn-bg)",
        "warn-bg-soft":    "var(--warn-bg-soft)",
        "warn-border":     "var(--warn-border)",
        "warn-border-soft":"var(--warn-border-soft)",
        warn:              "var(--warn-fg)",
        "warn-strong":     "var(--warn-fg-strong)",
        "warn-accent":     "var(--warn-accent)",
        "ok-bg":           "var(--ok-bg)",
        "ok-bg-soft":      "var(--ok-bg-soft)",
        "ok-border":       "var(--ok-border)",
        ok:                "var(--ok-fg)",
        "ok-strong":       "var(--ok-fg-strong)",
        "danger-bg":       "var(--danger-bg)",
        "danger-bg-soft":  "var(--danger-bg-soft)",
        "danger-border":   "var(--danger-border)",
        danger:            "var(--danger-fg)",
        "danger-soft":     "var(--danger-soft)",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
    }
  },
  plugins: []
};
