"use client";

import { useCallback, useEffect, useState } from "react";

export type TourStep = {
  selector?: string; // élément à mettre en avant ; absent = bulle centrée
  title: string;
  body: string;
};

/**
 * Visite guidée maison (sans dépendance).
 * - met en surbrillance l'élément ciblé (spotlight) via un box-shadow géant,
 * - affiche une bulle explicative avec Précédent / Suivant / Passer,
 * - dégrade proprement si une cible est absente (bulle centrée + fond assombri).
 * Optimisée pour la vue « bureau » (colonnes).
 */
export default function GuidedTour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[idx];
  const isLast = idx >= steps.length - 1;

  const measure = useCallback(() => {
    const sel = steps[idx]?.selector;
    if (!sel) { setRect(null); return; }
    const el = document.querySelector(sel) as HTMLElement | null;
    setRect(el ? el.getBoundingClientRect() : null);
  }, [idx, steps]);

  useEffect(() => {
    const sel = steps[idx]?.selector;
    if (sel) {
      const el = document.querySelector(sel) as HTMLElement | null;
      el?.scrollIntoView({ block: "center", inline: "center" });
    }
    measure();
    const on = () => measure();
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, true);
    const t = window.setInterval(measure, 400); // suit les changements de layout
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("scroll", on, true);
      window.clearInterval(t);
    };
  }, [idx, measure, steps]);

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

  const pad = 6;
  const box = rect && rect.width > 0
    ? { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
    : null;

  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const bubbleAtTop = box ? box.top + box.height > vh - 240 : false;

  const bubbleStyle: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    transform: "translateX(-50%)",
    width: "min(360px, calc(100vw - 32px))",
    background: "white",
    borderRadius: 14,
    boxShadow: "0 12px 40px rgba(0,0,0,0.3)",
    padding: "18px 20px",
    ...(bubbleAtTop ? { top: 24 } : { bottom: 24 }),
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200 }}>
      {/* Bloqueur de clics (+ fond assombri quand il n'y a pas de cible) */}
      <div style={{ position: "absolute", inset: 0, background: box ? "transparent" : "rgba(0,0,0,0.55)" }} onClick={(e) => e.stopPropagation()} />

      {/* Spotlight autour de la cible */}
      {box && (
        <div
          style={{
            position: "absolute",
            top: box.top,
            left: box.left,
            width: box.width,
            height: box.height,
            borderRadius: 8,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
            outline: "2px solid #2f6eff",
            outlineOffset: 2,
            pointerEvents: "none",
            transition: "top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease",
          }}
        />
      )}

      {/* Bulle */}
      <div style={bubbleStyle} onClick={(e) => e.stopPropagation()}>
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
