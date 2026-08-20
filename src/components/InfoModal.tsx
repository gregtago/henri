"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Ce qui s'explique une fois ne doit pas se relire à chaque visite.
 *
 * Les Préférences portaient, en tête de presque chaque onglet, un pavé de
 * texte qui disait pourquoi le réglage existe. On le lit la première fois, et
 * les cent suivantes il ne fait qu'éloigner le réglage du haut de l'écran —
 * sur téléphone, il occupait l'écran entier avant le premier interrupteur.
 *
 * L'explication passe donc derrière un point d'interrogation, ou un « en
 * savoir plus » : elle reste à un geste, et cesse d'être un péage.
 *
 * Sur téléphone, la pastille ne s'affiche pas du tout. L'écran y est trop
 * étroit pour porter, à côté de chaque titre, un signe qui ne règle rien —
 * et c'est là qu'on vient changer un réglage qu'on connaît déjà, pas
 * l'apprendre. Les mots, eux, restent : un « en savoir plus » écrit en toutes
 * lettres se lit à toutes les largeurs.
 */

/** La fenêtre elle-même, quand le parent commande son ouverture. */
export function InfoModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  // Échap ferme, et la page dessous cesse de défiler sous les doigts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 140, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
    >
      <div
        className="bg-bg border border-border"
        onClick={(e) => e.stopPropagation()}
        style={{ borderRadius: "16px", maxWidth: "560px", width: "100%", maxHeight: "calc(100dvh - 32px)", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
      >
        <div className="border-b border-border flex items-start justify-between gap-3" style={{ padding: "16px 20px" }}>
          <p className="text-tx" style={{ fontSize: "15.5px", fontWeight: 600, lineHeight: 1.35 }}>{title}</p>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="text-tx-3 hover:text-tx shrink-0"
            style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "18px", lineHeight: 1, padding: "2px 4px", fontFamily: "inherit" }}
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto text-[13.5px] text-tx-2 leading-relaxed space-y-3" style={{ padding: "18px 20px calc(20px + env(safe-area-inset-bottom))" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

type Props = {
  /** Le titre de la fenêtre — et ce que le lecteur d'écran annonce du bouton. */
  title: string;
  /** Sans libellé, le bouton est un point d'interrogation ; avec, un lien. */
  label?: string;
  children: ReactNode;
};

/**
 * Le déclencheur : une pastille « ? » posée près d'un titre de section, ou un
 * « en savoir plus » en toutes lettres quand la place le permet.
 *
 * La pastille se dessine en 18 px mais se touche en 30, comme tout ce qui se
 * touche dans Henri : la marge négative rend au texte la place que la zone
 * tactile lui prend. Elle est réservée au grand écran — voir plus haut.
 */
export default function InfoButton({ title, label, children }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {label ? (
        <button
          onClick={() => setOpen(true)}
          className="text-[12px] font-[inherit] text-accent bg-transparent border-none p-0 cursor-pointer underline underline-offset-2 hover:opacity-80 transition-opacity"
        >
          {label}
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          aria-label={`En savoir plus : ${title}`}
          title={title}
          className="group shrink-0 hidden md:inline-flex items-center justify-center w-[30px] h-[30px] -m-[6px] bg-transparent border-none p-0 cursor-pointer"
        >
          <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full border border-border text-[11px] leading-none text-tx-3 group-hover:border-border-strong group-hover:text-tx transition-colors">?</span>
        </button>
      )}
      {open && <InfoModal title={title} onClose={() => setOpen(false)}>{children}</InfoModal>}
    </>
  );
}
