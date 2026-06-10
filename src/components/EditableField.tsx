"use client";

import React, { forwardRef, useEffect, useRef, useState } from "react";

/**
 * Champs de saisie contrôlés *localement*.
 *
 * Problème résolu : quand un input est contrôlé directement par une valeur qui
 * remonte de Firestore (via onSnapshot), chaque frappe déclenche une écriture
 * dont la valeur revient de façon asynchrone. React ré-applique alors `value`
 * « hors frappe », ce qui repositionne le curseur à la fin du texte.
 *
 * Ici, la valeur affichée suit immédiatement la frappe (état local `draft`),
 * donc le curseur ne bouge jamais. La modification est propagée via `onCommit`.
 * La valeur externe est resynchronisée uniquement quand le champ n'a pas le
 * focus (changement de sélection, mise à jour distante…).
 */

const useDraft = (value: string, onCommit: (next: string) => void) => {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  return {
    draft,
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      setDraft(value);
    },
    onChange: (next: string) => {
      setDraft(next);
      onCommit(next);
    }
  };
};

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onCommit: (next: string) => void;
};

export const EditableInput = forwardRef<HTMLInputElement, InputProps>(
  ({ value, onCommit, onFocus, onBlur, ...rest }, ref) => {
    const draft = useDraft(value, onCommit);
    return (
      <input
        {...rest}
        ref={ref}
        value={draft.draft}
        onChange={(e) => draft.onChange(e.target.value)}
        onFocus={(e) => {
          draft.onFocus();
          onFocus?.(e);
        }}
        onBlur={(e) => {
          draft.onBlur();
          onBlur?.(e);
        }}
      />
    );
  }
);
EditableInput.displayName = "EditableInput";

type TextareaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onCommit: (next: string) => void;
};

export const EditableTextarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ value, onCommit, onFocus, onBlur, ...rest }, ref) => {
    const draft = useDraft(value, onCommit);
    return (
      <textarea
        {...rest}
        ref={ref}
        value={draft.draft}
        onChange={(e) => draft.onChange(e.target.value)}
        onFocus={(e) => {
          draft.onFocus();
          onFocus?.(e);
        }}
        onBlur={(e) => {
          draft.onBlur();
          onBlur?.(e);
        }}
      />
    );
  }
);
EditableTextarea.displayName = "EditableTextarea";
