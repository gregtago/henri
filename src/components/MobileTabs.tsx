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
// **Les trois portent leur nom**, à toutes les largeurs. Ils n'y tenaient pas
// tant que le rond du compte occupait le bout de la rangée ; le compte ayant
// rejoint les Préférences — dont il n'était que le raccourci —, la pastille a
// retrouvé la largeur entière. Le corps du texte suit l'écran plutôt qu'un
// palier (`clamp`, `app/globals.css`) : 12 px sur un iPhone courant, 10,5 px
// sur le plus petit, et jamais un mot coupé en « Ma jou… ».
//
// Le composant ne se positionne pas lui-même : il rend la pastille, l'écran qui
// l'appelle décide où elle se pose (fixée en bas des colonnes, ou empilée
// au-dessus de la barre de saisie de Ma journée).

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
  onSelect: (tab: MobileTab) => void;
};

export default function MobileTabs({ active, count, elevated = true, onSelect }: Props) {
  return (
    <nav
      aria-label="Navigation principale"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "2px",
        padding: "4px",
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: "999px",
        boxShadow: elevated ? "0 4px 16px rgba(0,0,0,0.10)" : "none",
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
              // Chacun prend la largeur de son mot : « Ma journée » et son
              // compte ne se serrent pas pour laisser un tiers à « Dossiers ».
              flex: "0 1 auto",
              minWidth: 0,
              height: "38px",
              padding: "0 8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "5px",
              borderRadius: "999px",
              border: "none",
              background: on ? "var(--text)" : "transparent",
              color: on ? "var(--bg)" : "var(--text-2)",
              fontFamily: "inherit",
              fontWeight: on ? 600 : 500,
              whiteSpace: "nowrap",
              cursor: "pointer",
              transition: "background 0.18s ease, color 0.18s ease",
            }}
          >
            <Icon name={tab.icon} size={15} strokeWidth={on ? 1.75 : 1.5} />
            <span>{tab.label}</span>
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
  );
}
