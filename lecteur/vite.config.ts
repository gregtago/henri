import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' pour que le build fonctionne aussi ouvert depuis un simple dossier
// (utile si on empaquette plus tard en app de bureau type Tauri/Electron).
export default defineConfig({
  base: './',
  plugins: [react()],
  // pdf.js et tesseract.js sont volumineux : on augmente la limite d'avertissement.
  build: { chunkSizeWarningLimit: 2000 },
});
