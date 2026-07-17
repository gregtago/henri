"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type TourStep = {
  selector?: string;          // élément à mettre en avant ; absent = bulle centrée
  title: string;
  body: string;
  action?: () => void | Promise<void>; // exécutée à l'entrée de l'étape (pas à pas)
};

const M = 12;   // marge écran
const GAP = 12; // écart bulle ↔ cible

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));

/**
 * Visite guidée maison (sans dépendance).
 * - met en surbrillance l'élément ciblé (spotlight) et place la bulle JUSTE à côté
 *   (dessous, sinon dessus, sinon sur le côté), en restant dans l'écran ;
 * - exécute une éventuelle `action` à l'entrée d'une étape (pour un pas à pas) ;
 * - dégrade en bulle centrée si la cible est absente.
 */
export default function GuidedTour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [bubbleH, setBubbleH] = useState(170);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const ranRef = useRef<number>(-1);
  const step = steps[idx];
  const isLast = idx >= steps.length - 1;

  const measure = useCallback(() => {
    const sel = steps[idx]?.selector;
    if (!sel) { setRect(null); return; }
    const el = document.querySelector(sel) as HTMLElement | null;
    const r = el?.getBoundingClientRect();
    setRect(r && r.width > 0 && r.height > 0 ? r : null);
  }, [idx, steps]);

  // Exécute l'action de l'étape (une fois par entrée d'étape).
  useEffect(() => {
    if (ranRef.current === idx) return;
    ranRef.current = idx;
    const a = steps[idx]?.action;
    if (a) Promise.resolve().then(a).catch(() => {});
  }, [idx, steps]);

  // Suit la cible (défilement, resize, changements de layout).
  useEffect(() => {
    const sel = steps[idx]?.selector;
    if (sel) (document.querySelector(sel) as HTMLElement | null)?.scrollIntoView({ block: "center", inline: "center" });
    measure();
    const on = () => measure();
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, true);
    const t = window.setInterval(measure, 300);
    return () => { window.removeEventListener("resize", on); window.removeEventListener("scroll", on, true); window.clearInterval(t); };
  }, [idx, measure, steps]);

  // Mesure la hauteur de la bulle pour bien la positionner au-dessus si besoin.
  useLayoutEffect(() => {
    const h = bubbleRef.current?.offsetHeight;
    if (h && Math.abs(h - bubbleH) > 1) setBubbleH(h);
  }, [idx, rect, bubbleH, step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setIdx((p) => Math.min(steps.length - 1, p + 1)); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setIdx((p) => Math.max(0, p - 1)); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, steps.length]);

  const next = () => (isLast ? onClose() : setIdx(idx + 1));
  const prev = () => setIdx(Math.max(0, idx - 1));

  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const pad = 6;
  const box = rect ? { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 } : null;
  const W = Math.min(360, vw - 2 * M);

  // Position de la bulle : au plus près de la cible.
  const bubbleStyle: React.CSSProperties = { position: "absolute", width: W, transition: "top 0.18s ease, left 0.18s ease" };
  if (!box) {
    bubbleStyle.top = "50%";
    bubbleStyle.left = "50%";
    bubbleStyle.transform = "translate(-50%, -50%)";
  } else {
    const fitsBelow = box.top + box.height + GAP + bubbleH <= vh - M;
    const fitsAbove = box.top - GAP - bubbleH >= M;
    if (fitsBelow || fitsAbove) {
      bubbleStyle.top = fitsBelow ? box.top + box.height + GAP : box.top - GAP - bubbleH;
      bubbleStyle.left = clamp(box.left + box.width / 2 - W / 2, M, vw - W - M);
    } else {
      const fitsRight = box.left + box.width + GAP + W <= vw - M;
      bubbleStyle.left = fitsRight ? box.left + box.width + GAP : Math.max(M, box.left - GAP - W);
      bubbleStyle.top = clamp(box.top, M, vh - bubbleH - M);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200 }}>
      {/* Bloqueur de clics (+ fond assombri quand il n'y a pas de cible) */}
      <div style={{ position: "absolute", inset: 0, background: box ? "transparent" : "rgba(0,0,0,0.55)" }} onClick={(e) => e.stopPropagation()} />

      {/* Spotlight autour de la cible */}
      {box && (
        <div
          style={{
            position: "absolute", top: box.top, left: box.left, width: box.width, height: box.height,
            borderRadius: 8, boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)", outline: "2px solid #2f6eff", outlineOffset: 2,
            pointerEvents: "none", transition: "top 0.18s ease, left 0.18s ease, width 0.18s ease, height 0.18s ease",
          }}
        />
      )}

      {/* Bulle */}
      <div ref={bubbleRef} style={{ ...bubbleStyle, background: "white", borderRadius: 14, boxShadow: "0 12px 40px rgba(0,0,0,0.3)", padding: "18px 20px" }} onClick={(e) => e.stopPropagation()}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.06em", marginBottom: 6 }}>
          ÉTAPE {idx + 1} / {steps.length}
        </p>
        <p style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 6, lineHeight: 1.3 }}>{step.title}</p>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "#374151" }}>{step.body}</p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, gap: 8 }}>
          <button onClick={onClose} style={{ fontSize: 13, color: "#9ca3af", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 4 }}>
            Passer
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {idx > 0 && (
              <button onClick={prev} style={{ fontSize: 13, color: "#374151", background: "white", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                Précédent
              </button>
            )}
            <button onClick={next} style={{ fontSize: 13, color: "white", background: "#111827", border: "1px solid #111827", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
              {isLast ? "Terminer" : "Suivant"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
