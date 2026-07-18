"use client";

import type { CaseTemplate } from "@/lib/types";

type Props = {
  mode: "apply" | "new";
  templates: CaseTemplate[];
  onApply: (t: CaseTemplate) => void;
  onCreateNew: (t: CaseTemplate) => void;
  onRename: (t: CaseTemplate) => void;
  onDelete: (t: CaseTemplate) => void;
  onCreateBlank?: () => void; // mode "new" : créer un dossier vierge
  onClose: () => void;
};

/**
 * Modale de modèles de dossier.
 * - mode "apply" : appliquer un modèle au dossier courant (ajoute ses tâches).
 * - mode "new"   : créer un dossier — vierge, ou à partir d'un modèle.
 * Permet aussi de renommer / supprimer un modèle.
 */
export default function CaseTemplatesModal({ mode, templates, onApply, onCreateNew, onRename, onDelete, onCreateBlank, onClose }: Props) {
  const sorted = [...templates].sort((a, b) => a.name.localeCompare(b.name, "fr"));

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
      onClick={onClose}
    >
      <div
        className="bg-bg border border-border"
        style={{ borderRadius: "16px", maxWidth: "520px", width: "100%", maxHeight: "calc(100dvh - 48px)", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-border" style={{ padding: "18px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <div>
            <p className="text-tx" style={{ fontSize: "16px", fontWeight: 600 }}>
              {mode === "apply" ? "Appliquer un modèle" : "Nouveau dossier"}
            </p>
            <p className="text-tx-3" style={{ fontSize: "12px", marginTop: "2px" }}>
              {mode === "apply"
                ? "Ajoute les tâches du modèle au dossier ouvert."
                : "Partez d'un dossier vierge, ou d'un modèle pré-rempli."}
            </p>
          </div>
          <button onClick={onClose} className="text-tx-3 hover:text-tx" style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "20px", lineHeight: 1, padding: "2px 6px" }} aria-label="Fermer">✕</button>
        </div>

        {/* Corps */}
        <div style={{ overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {mode === "new" && onCreateBlank && (
            <button
              onClick={onCreateBlank}
              className="border border-border hover:border-border-strong text-tx"
              style={{ display: "flex", alignItems: "center", gap: "10px", borderRadius: "10px", padding: "12px 14px", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", width: "100%" }}
            >
              <span style={{ fontSize: "18px", lineHeight: 1 }}>➕</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: "14px", fontWeight: 600 }}>Dossier vierge</span>
                <span className="text-tx-3" style={{ display: "block", fontSize: "12px" }}>Commencer de zéro</span>
              </span>
            </button>
          )}

          {mode === "new" && onCreateBlank && sorted.length > 0 && (
            <p className="text-tx-3" style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", margin: "6px 2px 0" }}>Ou à partir d'un modèle</p>
          )}

          {sorted.length === 0 ? (
            mode === "apply" ? (
              <p className="text-tx-2" style={{ fontSize: "13px", padding: "24px 8px", textAlign: "center", lineHeight: 1.6 }}>
                Aucun modèle enregistré.<br />
                Ouvrez un dossier et cliquez « Enregistrer comme modèle » pour en créer un.
              </p>
            ) : null
          ) : (
            sorted.map((t) => (
              <div key={t.id} className="border border-border" style={{ borderRadius: "10px", padding: "12px 14px", display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p className="text-tx" style={{ fontSize: "14px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</p>
                  <p className="text-tx-3" style={{ fontSize: "12px", marginTop: "1px" }}>{t.items.length} tâche{t.items.length > 1 ? "s" : ""}</p>
                </div>
                <button
                  onClick={() => onRename(t)}
                  className="text-tx-2 border border-border hover:border-border-strong hover:text-tx"
                  style={{ background: "transparent", borderRadius: "6px", cursor: "pointer", fontSize: "13px", padding: "5px 8px" }}
                  title="Renommer le modèle"
                >✎</button>
                <button
                  onClick={() => onDelete(t)}
                  className="text-tx-2 border border-border hover:border-red-300 hover:text-red-600"
                  style={{ background: "transparent", borderRadius: "6px", cursor: "pointer", fontSize: "13px", padding: "5px 8px" }}
                  title="Supprimer le modèle"
                >🗑</button>
                <button
                  onClick={() => (mode === "apply" ? onApply(t) : onCreateNew(t))}
                  className="bg-tx text-bg border border-tx hover:opacity-90"
                  style={{ borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: 600, padding: "7px 14px", whiteSpace: "nowrap" }}
                >
                  {mode === "apply" ? "Appliquer" : "Créer le dossier"}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
