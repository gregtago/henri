"use client";

// Les propositions d'échéance, en puces.
//
// Un seul composant pour les cinq endroits où l'on pose une échéance : la liste
// venait déjà de `getDueSuggestions`, mais chaque écran redessinait ses boutons
// — et aucun, sauf le formulaire mobile, ne montrait laquelle était retenue ni
// ne réagissait à l'appui. On tapait, rien ne bougeait, on retapait.
//
// Ce que les puces disent maintenant, partout pareil :
// - **celle qui est posée** est pleine, et le reste quand on rouvre le détail ;
// - **l'appui** enfonce la puce (`.due-chip:active`) et fait vibrer l'appareil
//   quand il sait le faire (Android ; iOS n'a pas l'API — voir `haptics.ts`) ;
// - **retirer** l'échéance est la même puce, en rouge, et n'apparaît que s'il y
//   a quelque chose à retirer.

import { getDateKeyFromValue, getDueSuggestions } from "@/lib/dates";
import { tapFeedback } from "@/lib/haptics";

type Props = {
  /** L'échéance actuelle (ISO), pour montrer la puce retenue. */
  value?: string | null;
  onPick: (date: Date) => void;
  /** Absent = pas de puce « retirer » (création : il n'y a rien à retirer). */
  onClear?: () => void;
  /** Échéance légale d'un dossier : ajoute 3 et 6 mois. */
  long?: boolean;
};

export default function DueChips({ value, onPick, onClear, long = false }: Props) {
  const currentKey = getDateKeyFromValue(value ?? null);

  return (
    <div className="flex flex-wrap gap-1.5">
      {getDueSuggestions({ long }).map(({ label, date }) => {
        const on = !!currentKey && currentKey === getDateKeyFromValue(date);
        return (
          <button
            key={label}
            type="button"
            className="due-chip"
            data-on={on ? "true" : undefined}
            aria-pressed={on}
            onClick={() => { tapFeedback(); onPick(date); }}
          >
            {label}
          </button>
        );
      })}
      {onClear && value && (
        <button
          type="button"
          className="due-chip due-chip-clear"
          onClick={() => { tapFeedback(); onClear(); }}
        >
          ✕ Retirer
        </button>
      )}
    </div>
  );
}
