import type { PageViewport } from 'pdfjs-dist';
import type { TextContent } from 'pdfjs-dist/types/src/display/api';
import { pdfjsLib } from './pdf';
import type { Rect } from './types';

interface Placed {
  x: number;
  top: number;
  bottom: number;
  str: string;
}

/**
 * Assemble le texte de la couche native du PDF qui tombe sous le rectangle.
 * Retourne '' si la zone ne contient aucun texte sélectionnable (PDF scanné) —
 * l'appelant bascule alors sur l'OCR.
 */
export function textLayerInRect(
  textContent: TextContent,
  viewport: PageViewport,
  rect: Rect,
): string {
  const scale = viewport.scale;
  const placed: Placed[] = [];

  for (const item of textContent.items) {
    if (!('str' in item) || !item.str) continue;
    // Position de l'item dans le repère du canvas rendu.
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.hypot(tx[2], tx[3]);
    const x = tx[4];
    const bottom = tx[5]; // ligne de base
    const top = bottom - fontHeight;
    const w = item.width * scale;

    // Intersection avec le rectangle de sélection.
    const ix = Math.max(x, rect.x);
    const iy = Math.max(top, rect.y);
    const ax = Math.min(x + w, rect.x + rect.w);
    const ay = Math.min(bottom, rect.y + rect.h);
    if (ax <= ix || ay <= iy) continue;

    // On garde l'item si une part significative est couverte (évite d'attraper
    // un mot juste frôlé par le bord du rectangle).
    const coverV = (ay - iy) / Math.max(fontHeight, 1);
    if (coverV < 0.35) continue;

    placed.push({ x, top, bottom, str: item.str });
  }

  if (placed.length === 0) return '';

  // Reconstruction de l'ordre de lecture : on regroupe par lignes (proximité
  // verticale) puis on trie chaque ligne de gauche à droite.
  placed.sort((a, b) => a.top - b.top || a.x - b.x);
  const lineTol = medianHeight(placed) * 0.6;

  const out: string[] = [];
  let lineParts: Placed[] = [];
  let lineTop = placed[0].top;

  const flush = () => {
    lineParts.sort((a, b) => a.x - b.x);
    out.push(lineParts.map((p) => p.str).join(' ').replace(/\s+/g, ' ').trim());
  };

  for (const p of placed) {
    if (Math.abs(p.top - lineTop) > lineTol && lineParts.length) {
      flush();
      lineParts = [];
    }
    if (!lineParts.length) lineTop = p.top;
    lineParts.push(p);
  }
  if (lineParts.length) flush();

  return out.filter(Boolean).join('\n').trim();
}

function medianHeight(placed: Placed[]): number {
  const hs = placed.map((p) => p.bottom - p.top).sort((a, b) => a - b);
  return hs[Math.floor(hs.length / 2)] || 12;
}

/**
 * Découpe la zone du canvas rendu vers un nouveau canvas, agrandi, prêt pour
 * l'OCR. L'agrandissement aide Tesseract sur les petits caractères.
 */
export function cropRegion(source: HTMLCanvasElement, rect: Rect, upscale = 2): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(rect.w * upscale));
  c.height = Math.max(1, Math.round(rect.h * upscale));
  const ctx = c.getContext('2d')!;
  // Fond blanc : certaines zones transparentes gêneraient l'OCR.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, c.width, c.height);
  return c;
}

/** Vrai si le texte extrait vaut la peine (au moins un caractère alphanumérique). */
export function looksLikeText(s: string): boolean {
  return /[\p{L}\p{N}]/u.test(s);
}
