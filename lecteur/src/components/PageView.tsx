import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PageViewport } from 'pdfjs-dist';
import type { TextContent } from 'pdfjs-dist/types/src/display/api';
import type { Rect } from '../lib/types';

export interface SelectionPayload {
  page: number;
  rect: Rect;
  canvas: HTMLCanvasElement;
  viewport: PageViewport;
  textContent: TextContent;
}

interface Props {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  onSelect: (p: SelectionPayload) => void;
}

interface Marquee {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const MIN_SIZE = 6;

export function PageView({ pdf, pageNumber, scale, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<{ viewport: PageViewport; textContent: TextContent } | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;

    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      setDims({ w: canvas.width, h: canvas.height });
      const ctx = canvas.getContext('2d')!;
      const task = page.render({ canvasContext: ctx, viewport });
      renderTask = task;
      try {
        await task.promise;
      } catch {
        return; // annulé (re-render)
      }
      if (cancelled) return;
      const textContent = await page.getTextContent();
      if (cancelled) return;
      dataRef.current = { viewport, textContent };
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, pageNumber, scale]);

  const pointFromEvent = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(e.clientX - rect.left, rect.width)),
      y: Math.max(0, Math.min(e.clientY - rect.top, rect.height)),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = true;
    const p = pointFromEvent(e);
    setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const p = pointFromEvent(e);
    setMarquee((m) => (m ? { ...m, x1: p.x, y1: p.y } : m));
  };

  const onPointerUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const m = marquee;
    setMarquee(null);
    if (!m || !dataRef.current || !canvasRef.current) return;
    const rect: Rect = {
      x: Math.min(m.x0, m.x1),
      y: Math.min(m.y0, m.y1),
      w: Math.abs(m.x1 - m.x0),
      h: Math.abs(m.y1 - m.y0),
    };
    if (rect.w < MIN_SIZE || rect.h < MIN_SIZE) return;
    onSelect({
      page: pageNumber,
      rect,
      canvas: canvasRef.current,
      viewport: dataRef.current.viewport,
      textContent: dataRef.current.textContent,
    });
  };

  const box = marquee
    ? {
        left: Math.min(marquee.x0, marquee.x1),
        top: Math.min(marquee.y0, marquee.y1),
        width: Math.abs(marquee.x1 - marquee.x0),
        height: Math.abs(marquee.y1 - marquee.y0),
      }
    : null;

  return (
    <div className="page-wrap" style={dims ? { width: dims.w, height: dims.h } : undefined}>
      <canvas ref={canvasRef} className="page-canvas" />
      <div
        className="page-overlay"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {box && (
          <div
            className="marquee"
            style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
          />
        )}
      </div>
      <div className="page-label">Page {pageNumber}</div>
    </div>
  );
}
