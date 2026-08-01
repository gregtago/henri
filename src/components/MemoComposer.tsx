"use client";

// Fenêtre de saisie d'un mémo (desktop).
//
// Pourquoi une fenêtre plutôt qu'une ligne inline, alors que DESIGN.md s'en
// méfie : un mémo naît avec ses paramètres. Échéance, rappel, récurrence,
// dossier — les régler après coup suppose de retrouver le mémo qu'on vient de
// créer, ce qui est précisément ce qui manquait. Un seul geste, un seul écrit.
//
// La fenêtre reste au clavier de bout en bout : le titre a le focus, Entrée
// crée, Échap annule. Elle ne bloque rien d'irréversible.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Case, Item, Recurrence } from "@/lib/types";
import { Icon } from "./Icon";
import { RecurrencePicker } from "./RecurrencePicker";
import { ReminderPicker } from "./ReminderPicker";
import DueChips from "./DueChips";
import { atDueHour, formatDateFR } from "@/lib/dates";

export type MemoDraft = {
  title: string;
  caseId: string | null;
  /** Tâche sous laquelle poser le mémo — null = au niveau du dossier. */
  parentItemId: string | null;
  dueDate: string | null;
  reminderAt: string | null;
  recurrence: Recurrence | null;
  starred: boolean;
  note: string | null;
};

type Props = {
  cases: Case[];
  /** Toutes les tâches : de quoi choisir sous laquelle poser le mémo. */
  items?: Item[];
  /** Dossier pré-sélectionné — celui qu'on regardait en appuyant sur M. */
  defaultCaseId?: string | null;
  /** Tâche pré-sélectionnée — celle qu'on regardait depuis la colonne Sous-tâches. */
  defaultParentItemId?: string | null;
  onCreate: (draft: MemoDraft) => void | Promise<void>;
  onClose: () => void;
  /** Préférence globale de relance, pour le libellé du rappel. */
  defaultRepeat?: boolean;
  repeatLabel?: string;
};

/** Toute échéance posée ici tombe à l'heure commune (voir src/lib/dates.ts). */
const atNoon = (date: Date) => atDueHour(date).toISOString();

export default function MemoComposer({
  cases,
  items = [],
  defaultCaseId = null,
  defaultParentItemId = null,
  onCreate,
  onClose,
  defaultRepeat = true,
  repeatLabel,
}: Props) {
  const [title, setTitle] = useState("");
  const [caseId, setCaseId] = useState<string | null>(defaultCaseId);
  const [parentItemId, setParentItemId] = useState<string | null>(defaultParentItemId);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [reminderAt, setReminderAt] = useState<string | null>(null);
  const [recurrence, setRecurrence] = useState<Recurrence | null>(null);
  const [starred, setStarred] = useState(false);
  const [note, setNote] = useState("");
  const [caseSearch, setCaseSearch] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [saving, setSaving] = useState(false);

  const titleRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);

  const selectedCase = caseId ? cases.find((entry) => entry.id === caseId) ?? null : null;
  const parentItem = parentItemId ? items.find((entry) => entry.id === parentItemId) ?? null : null;

  // Les tâches du dossier retenu sous lesquelles on peut poser le mémo : les
  // tâches de premier niveau, jamais les sous-tâches — un mémo descend d'un
  // cran, pas de deux.
  const caseTasks = useMemo(
    () => (caseId ? items.filter((entry) => entry.caseId === caseId && !entry.parentItemId) : []),
    [caseId, items]
  );

  const caseMatches = useMemo(() => {
    const needle = caseSearch.trim().toLowerCase();
    if (!needle) return [];
    return cases
      .filter((entry) => !entry.archived && entry.title.toLowerCase().includes(needle))
      .slice(0, 6);
  }, [caseSearch, cases]);

  const canSubmit = title.trim().length > 0 && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await onCreate({
        title: title.trim(),
        caseId,
        parentItemId,
        dueDate,
        reminderAt,
        recurrence,
        starred,
        note: note.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    // Entrée valide depuis n'importe quel champ sauf la zone de texte libre,
    // où elle sert à passer à la ligne.
    if (event.key === "Enter" && !event.shiftKey) {
      const tag = (event.target as HTMLElement).tagName;
      if (tag === "TEXTAREA") return;
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 130, background: "rgba(0,0,0,0.35)",
        display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "10vh 24px 24px",
      }}
      onClick={onClose}
      onKeyDown={onKeyDown}
      role="presentation"
    >
      <div
        className="bg-bg border border-border"
        style={{
          borderRadius: "14px", width: "100%", maxWidth: "480px",
          maxHeight: "calc(100dvh - 14vh)", display: "flex", flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
        }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Nouveau mémo"
      >
        {/* Titre */}
        <div className="border-b border-border" style={{ padding: "16px 18px 14px" }}>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setStarred((current) => !current)}
              className="shrink-0 border-none bg-transparent cursor-pointer p-0 leading-none transition-transform hover:scale-110"
              style={{ color: starred ? "#f59e0b" : "#d1d5db" }}
              title={starred ? "Retirer l'étoile" : "Marquer important"}
              aria-pressed={starred}
            >
              <Icon name="star" size={22} filled={starred} strokeWidth={1.75} />
            </button>
            <input
              ref={titleRef}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Rappeler au client d'envoyer son RIB…"
              className="flex-1 min-w-0 font-[inherit] text-[17px] font-medium text-tx bg-transparent border-none outline-none placeholder:text-tx-3 placeholder:font-normal"
            />
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: "14px 18px 4px" }}>
          {/* Dossier */}
          <div style={{ marginBottom: "16px" }}>
            <div className="flex items-baseline gap-2 mb-1.5">
              <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest">Dossier</p>
              {selectedCase && (
                <button
                  onClick={() => { setCaseId(null); setParentItemId(null); setCaseSearch(""); }}
                  className="ml-auto text-[10px] font-[inherit] bg-transparent border-none text-tx-3 cursor-pointer hover:text-tx transition-colors"
                >Détacher</button>
              )}
            </div>
            {selectedCase ? (
              <p className="text-[13.5px] text-tx">{selectedCase.title}</p>
            ) : (
              <>
                <input
                  value={caseSearch}
                  onChange={(event) => setCaseSearch(event.target.value)}
                  placeholder="Sans dossier — rechercher pour rattacher…"
                  className="w-full font-[inherit] text-[13px] text-tx bg-bg-subtle border border-border rounded-lg px-3 py-1.5 outline-none focus:border-border-strong transition-colors placeholder:text-tx-3"
                />
                {caseMatches.length > 0 && (
                  <div className="border border-border rounded-lg overflow-hidden mt-1.5">
                    {caseMatches.map((entry) => (
                      <button
                        key={entry.id}
                        onClick={() => { setCaseId(entry.id); setParentItemId(null); setCaseSearch(""); }}
                        className="w-full text-left font-[inherit] text-[13px] text-tx px-3 py-2 bg-transparent border-none cursor-pointer hover:bg-bg-subtle transition-colors border-b border-border last:border-0"
                      >{entry.title}</button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Sous quelle tâche — un mémo peut descendre d'un cran et se poser
            * sous une tâche du dossier, à côté de ses sous-tâches. */}
          {selectedCase && caseTasks.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <div className="flex items-baseline gap-2 mb-1.5">
                <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest">Sous la tâche</p>
                {parentItem && (
                  <button
                    onClick={() => setParentItemId(null)}
                    className="ml-auto text-[10px] font-[inherit] bg-transparent border-none text-tx-3 cursor-pointer hover:text-tx transition-colors"
                  >Remonter au dossier</button>
                )}
              </div>
              {parentItem ? (
                <p className="text-[13.5px] text-tx">{parentItem.title}</p>
              ) : (
                <select
                  value=""
                  onChange={(event) => setParentItemId(event.target.value || null)}
                  className="w-full font-[inherit] text-[13px] text-tx bg-bg-subtle border border-border rounded-lg px-3 py-1.5 outline-none focus:border-border-strong transition-colors"
                  aria-label="Sous quelle tâche"
                >
                  <option value="">Au niveau du dossier</option>
                  {caseTasks.map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.title}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Échéance */}
          <div style={{ marginBottom: "16px" }}>
            <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest mb-1.5">Échéance</p>
            <div className="flex flex-wrap gap-1.5 items-center">
              <DueChips
                value={dueDate}
                onPick={(date) => setDueDate(date.toISOString())}
                onClear={() => setDueDate(null)}
              />
              <input
                type="date"
                value={dueDate ? dueDate.slice(0, 10) : ""}
                onChange={(event) => {
                  if (!event.target.value) { setDueDate(null); return; }
                  const [year, month, day] = event.target.value.split("-").map(Number);
                  if (year < 1900 || year > 2100) return;
                  setDueDate(atNoon(new Date(year, month - 1, day)));
                }}
                className="font-[inherit] text-[12.5px] text-tx bg-bg-subtle border border-border rounded-lg px-2 py-1 outline-none focus:border-border-strong transition-colors"
                aria-label="Échéance"
              />
              {dueDate && (
                <span className="text-[11px] text-tx-3">{formatDateFR(dueDate)}</span>
              )}
            </div>
          </div>

          {/* Rappel */}
          <div style={{ marginBottom: showMore ? "16px" : "4px" }}>
            <ReminderPicker
              value={reminderAt}
              onChange={setReminderAt}
              defaultRepeat={defaultRepeat}
              repeatLabel={repeatLabel}
            />
          </div>

          {/* Le reste est replié : neuf mémos sur dix n'en ont pas besoin. */}
          {!showMore ? (
            <button
              onClick={() => setShowMore(true)}
              className="text-[11px] font-[inherit] bg-transparent border-none text-tx-3 cursor-pointer hover:text-tx transition-colors"
              style={{ padding: "0 0 12px" }}
            >▸ Répétition et observations</button>
          ) : (
            <>
              <div style={{ marginBottom: "16px" }}>
                <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest mb-1.5">Répétition</p>
                <RecurrencePicker value={recurrence} onChange={setRecurrence} />
              </div>
              <div style={{ marginBottom: "12px" }}>
                <p className="text-[10px] font-medium text-tx-3 uppercase tracking-widest mb-1.5">Observations</p>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  placeholder="Contexte, numéro de téléphone, précision…"
                  className="w-full font-[inherit] text-[13px] text-tx bg-bg-subtle border border-border rounded-lg px-3 py-2 outline-none resize-none focus:border-border-strong transition-colors placeholder:text-tx-3"
                />
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="border-t border-border bg-bg-subtle" style={{ padding: "10px 18px", display: "flex", alignItems: "center", gap: "8px", borderRadius: "0 0 14px 14px" }}>
          <span className="text-[11px] text-tx-3">
            <kbd className="border border-border rounded px-1 py-0.5 text-[10px]">Entrée</kbd> pour créer
          </span>
          <button className="detail-action-btn ml-auto" onClick={onClose}>Annuler</button>
          <button
            className="detail-action-btn detail-action-primary"
            onClick={() => void submit()}
            disabled={!canSubmit}
            style={!canSubmit ? { opacity: 0.4, cursor: "default" } : undefined}
          >Créer le mémo</button>
        </div>
      </div>
    </div>
  );
}
