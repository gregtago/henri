import * as pdfjsLib from 'pdfjs-dist';
// Vite résout ?url vers le fichier worker copié dans le bundle.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjsLib };

/** Charge un PDF à partir d'un ArrayBuffer (le buffer est consommé par pdf.js). */
export async function loadPdf(data: ArrayBuffer) {
  return pdfjsLib.getDocument({ data }).promise;
}
