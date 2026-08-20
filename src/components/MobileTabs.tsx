"use client";

// La barre du bas — trois destinations, une seule pastille encrée.
//
// Sur téléphone, la navigation vivait en haut à gauche : un rond « ☀ » depuis
// les dossiers, un rond « dossier » depuis la journée, et les Préférences
// enfouies dans le menu du compte. Trois endroits pour trois destinations, et
// aucun ne disait où l'on se trouve. La barre les réunit là où le pouce
// travaille, en bas, et l'écran courant s'y lit d'un coup d'œil : celui qui est
// en pleine encre, c'est celui qu'on regarde.
//
// La forme est un segmenté en pastille (`radius` plein, 1 px de filet, l'actif
// en encre) : la même grammaire que les chips de Ma journée, sans rien inventer.
// Le compte se colle à « Ma journée » — le seul des trois qui change dans la
// journée, et la seule chose qu'on veut savoir sans y aller.
//
// **Seul l'écran courant porte son nom** ; les deux autres se tiennent à leur
// icône. Trois mots, un compte et le rond du compte ne tiennent pas ensemble
// sur 390 px sans se couper en « Ma jou… », et un mot coupé ne dit plus rien.
// Le nom reste annoncé aux lecteurs d'écran, et les trois icônes sont déjà le
// vocabulaire de l'application : le soleil de Ma journée, le dossier, la roue.
//
// Le composant ne se positionne pas lui-même : il rend la pastille, l'écran qui
// l'appelle décide où elle se pose (fixée en bas des colonnes, ou empilée
// au-dessus de la barre de saisie de Ma journée).

import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { tapFeedback } from "@/lib/haptics";

export type MobileTab = "myday" | "cases" | "settings";

const TABS: { key: MobileTab; label: string; icon: IconName }[] = [
  { key: "myday", label: "Ma journée", icon: "myday" },
  { key: "cases", label: "Dossiers", icon: "folder" },
  { key: "settings", label: "Préférences", icon: "settings" },
];

type Props = {
  active: MobileTab;
  /** Nombre de lignes dans Ma journée — affiché seulement s'il y en a. */
  count?: number;
  /** Posée sur du vide (`true`, défaut) ou déjà dans une barre (`false`). */
  elevated?: boolean;
  /**
   * Ce qui se pose à droite de la pastille, dans son propre rond — le compte,
   * en pratique. Il garde la même chrome que la barre pour que la rangée se
   * lise d'un seul tenant, et la même place sur les trois écrans : la pastille
   * ne doit pas changer de largeur quand on passe de l'un à l'autre.
   */
  trailing?: ReactNode;
  onSelect: (tab: MobileTab) => void;
};

export default function MobileTabs({ active, count, elevated = true, trailing, onSelect }: Props) {
  const chrome = {
    padding: "4px",
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: "999px",
    boxShadow: elevated ? "0 4px 16px rgba(0,0,0,0.10)" : "none",
  } as const;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
    <nav
      aria-label="Navigation principale"
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "2px",
        ...chrome,
      }}
    >
      {TABS.map(tab => {
        const on = tab.key === active;
        const badge = tab.key === "myday" && typeof count === "number" && count > 0 ? count : null;
        return (
          <button
            key={tab.key}
            type="button"
            className="henri-tab"
            aria-current={on ? "page" : undefined}
            aria-label={tab.label}
            title={tab.label}
            onClick={() => { tapFeedback(); onSelect(tab.key); }}
            style={{
              // La pastille encrée prend la largeur de son nom ; les deux
              // icônes se partagent ce qui reste et se centrent dedans, pour
              // que la rangée ne parte pas en morceaux inégaux.
              flex: on ? "0 1 auto" : "1 1 auto",
              minWidth: 0,
              height: "38px",
              padding: on ? "0 12px" : "0 13px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              borderRadius: "999px",
              border: "none",
              background: on ? "var(--text)" : "transparent",
              color: on ? "var(--bg)" : "var(--text-2)",
              fontFamily: "inherit",
              fontSize: "12.5px",
              fontWeight: on ? 600 : 500,
              whiteSpace: "nowrap",
              cursor: "pointer",
              transition: "background 0.18s ease, color 0.18s ease",
            }}
          >
            <Icon name={tab.icon} size={16} strokeWidth={on ? 1.75 : 1.5} />
            {on && <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{tab.label}</span>}
            {badge !== null && (
              <span
                style={{
                  flexShrink: 0,
                  minWidth: "18px",
                  padding: "0 5px",
                  borderRadius: "999px",
                  fontSize: "11px",
                  fontWeight: 600,
                  lineHeight: "17px",
                  textAlign: "center",
                  // Un voile tiré de la couleur du fond : la pastille reste
                  // lisible sur l'encre du jour comme sur celle de la nuit.
                  background: on ? "color-mix(in srgb, var(--bg) 24%, transparent)" : "var(--bg-hover)",
                  color: on ? "var(--bg)" : "var(--text-2)",
                }}
              >
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
      {trailing && (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", ...chrome }}>
          {trailing}
        </div>
      )}
    </div>
  );
}
