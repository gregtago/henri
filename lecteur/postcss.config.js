// Config vide et locale : empêche Vite de remonter au postcss.config.js du
// dossier parent (henri) qui attend Tailwind. Cette app n'utilise pas PostCSS.
export default { plugins: {} };
