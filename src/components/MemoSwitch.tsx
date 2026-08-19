"use client";

// L'interrupteur qui décide de la nature d'un objet.
//
// Une tâche se traite (quatre statuts), un mémo se coche (rien d'autre). Passer
// de l'un à l'autre était jusqu'ici une action cachée en bas du panneau, à côté
// de « Supprimer » — un bouton qu'il fallait connaître pour le trouver.
//
// C'est pourtant la même question que celle des statuts : de quelle nature est
// cette chose ? L'interrupteur se pose donc là, à côté d'eux, et se lit dans les
// deux sens : éteint, les statuts sont là et c'est une tâche ; allumé, ils
// disparaissent et c'est un mémo. Rien à chercher ailleurs.
//
// Le même composant sert au détail d'une tâche et à celui d'un mémo : c'est un
// seul interrupteur, vu de ses deux côtés.

type Props = {
  /** Allumé = c'est un mémo. */
  on: boolean;
  onChange: (on: boolean) => void;
  /** Grisé, avec la raison en infobulle — ex. un contenant, qu'on ne peut pas coucher en mémo. */
  disabled?: boolean;
  /** Ce que dit l'infobulle. */
  title?: string;
};

export default function MemoSwitch({ on, onChange, disabled = false, title }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Mémo"
      disabled={disabled}
      onClick={() => { if (!disabled) onChange(!on); }}
      title={title ?? (on
        ? "Éteindre : ce mémo redevient une tâche, avec ses quatre statuts"
        : "Allumer : cette tâche devient un mémo, qu'on coche au lieu de la traiter")}
      style={{
        display: "inline-flex", alignItems: "center", gap: "7px",
        padding: "5px 10px 5px 8px", borderRadius: "999px",
        border: "1px solid var(--border)",
        background: on ? "var(--bg-subtle)" : "transparent",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        fontFamily: "inherit",
      }}
    >
      <span
        style={{
          position: "relative", width: 30, height: 17, borderRadius: 9, flexShrink: 0,
          background: on ? "var(--text)" : "var(--border-strong)",
          transition: "background 0.15s",
        }}
      >
        <span style={{
          position: "absolute", top: 3, left: on ? 16 : 3, width: 11, height: 11,
          background: "var(--bg)", borderRadius: "50%", transition: "left 0.15s", display: "block",
        }} />
      </span>
      <span style={{ fontSize: "12.5px", color: "var(--tx-2)", whiteSpace: "nowrap" }}>Mémo</span>
    </button>
  );
}
