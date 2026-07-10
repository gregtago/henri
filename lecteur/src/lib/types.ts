import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface PdfDoc {
  id: string;
  name: string;
  pdf: PDFDocumentProxy;
  numPages: number;
}

/** Rectangle de sélection, en pixels du canvas rendu (device px). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type CaptureStatus = 'texte' | 'ocr' | 'en-cours' | 'erreur';

export interface Capture {
  id: string;
  docId: string;
  docName: string;
  page: number;
  status: CaptureStatus;
  text: string;
  /** Confiance moyenne de l'OCR (0–100), si applicable. */
  confidence?: number;
  createdAt: number;
}
