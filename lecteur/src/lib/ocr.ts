import { createWorker, type Worker } from 'tesseract.js';

// URLs des assets locaux (vendorés dans public/ par scripts/vendor-tesseract.mjs).
// Si absents (ex : vendoring échoué), on laisse tesseract.js retomber sur son CDN.
const LOCAL = {
  worker: './tesseract/worker.min.js',
  core: './tesseract',
  lang: './tessdata',
};

let workerPromise: Promise<Worker> | null = null;
let usingLocal = false;

async function assetExists(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok;
  } catch {
    return false;
  }
}

async function init(): Promise<Worker> {
  usingLocal = await assetExists(`${LOCAL.lang}/fra.traineddata.gz`);
  const options = usingLocal
    ? { workerPath: LOCAL.worker, corePath: LOCAL.core, langPath: LOCAL.lang }
    : {};
  // 'fra+eng' : les actes notariaux mêlent parfois des passages/mots anglais et
  // de nombreux chiffres ; combiner les deux modèles améliore la robustesse.
  return createWorker('fra+eng', 1, options);
}

/** Indique si l'OCR tourne entièrement en local (aucun accès réseau requis). */
export function isOcrLocal(): boolean {
  return usingLocal;
}

export async function getOcrWorker(): Promise<Worker> {
  if (!workerPromise) workerPromise = init();
  return workerPromise;
}

export interface OcrResult {
  text: string;
  confidence: number;
}

export async function ocr(image: HTMLCanvasElement): Promise<OcrResult> {
  const worker = await getOcrWorker();
  const { data } = await worker.recognize(image);
  return { text: data.text.trim(), confidence: Math.round(data.confidence) };
}
